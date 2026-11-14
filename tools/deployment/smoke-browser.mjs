import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../src/frontend/node_modules/playwright/index.mjs';
import { capturePageErrors } from '../frontend/browser/page-errors.mjs';
import { readVersion } from './version.mjs';

export async function verifyBrowser(stack) {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  const errors = [];
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    capturePageErrors(page, errors);
    const version = readVersion();
    await verifyFooter(page, context, stack.origin, ['/', '/login'], version);
    await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'nb', url: stack.origin }]);
    const superadmin = stack.accounts.find(account => account.username === 'browser-superadmin');
    const administrator = stack.accounts.find(account => account.username === 'browser-admin');
    const recipient = stack.accounts.find(account => account.username === 'browser-user');
    const cookieResponses = [];
    page.on('response', response => {
      if (response.url().includes('/api/trpc/auth.login')) cookieResponses.push(response);
    });
    await signIn(page, stack.origin, superadmin);
    const created = await mutation(context, stack.origin, 'accounts.create', {
      name: 'Production smoke recipient', username: `smoke-${randomUUID().slice(0, 8)}`,
      password: `Recipient!${randomUUID()}`, role: 'calendarUser', responsibleAdministratorId: administrator.id,
    });
    assert.equal(created.status(), 200, await created.text());
    const cookies = await context.cookies();
    for (const name of ['advent.auth', 'advent.csrf']) {
      const cookie = cookies.find(item => item.name === name);
      assert(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax', `${name} has production attributes`);
      assert.equal(cookie.domain, 'localhost');
    }
    const loginHeaders = (await Promise.all(cookieResponses.map(response => response.headersArray()))).flat();
    assert(loginHeaders.some(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('advent.auth=')));
    await assertProtected(page, stack.origin, version);
    await verifyFooter(page, context, stack.origin, ['/my-page'], version);
    // Real container replacement must retain the persisted ticket/key ring.
    await stack.restart();
    await assertProtected(page, stack.origin, version);
    await context.clearCookies();
    await signIn(page, stack.origin, administrator);
    const calendarResponse = await mutation(context, stack.origin, 'calendar.create', {
      title: 'Production smoke calendar', recipientId: recipient.id, background: 'aurora',
    });
    assert.equal(calendarResponse.status(), 200, await calendarResponse.text());
    const calendar = (await calendarResponse.json()).result.data;
    const imageData = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const drawing = canvas.getContext('2d');
      drawing.fillStyle = '#047857';
      drawing.fillRect(0, 0, 16, 16);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const saved = await mutation(context, stack.origin, 'calendar.saveDoor', {
      id: calendar.id, number: 1, title: 'Smoke gift', text: 'Persisted production image', imageAction: 'replace', imageData,
    });
    assert.equal(saved.status(), 200, await saved.text());
    await page.goto(`${stack.origin}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[aria-labelledby=selected-door-heading] img').count(), 1);
    await page.waitForFunction(() => document.querySelector('[aria-labelledby=selected-door-heading] img')?.naturalWidth > 0);
    // Only isolated fixtures can alter dates; Production's time bypass stays disabled.
    stack.run(['exec', stack.database, 'psql', '-U', 'postgres', '-d', stack.databaseName,
      '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE calendars SET calendar_year=2020 WHERE id='${calendar.id}'`]);
    await context.clearCookies();
    await signIn(page, stack.origin, recipient);
    const session = await query(context, stack.origin, 'auth.session');
    const input = { id: calendar.id, number: 1, scope: session.cacheScope };
    const denied = await context.request.post(`${stack.origin}/api/trpc/recipient.open`, { data: input });
    assert.equal(denied.status(), 400, 'An authenticated mutation still requires caller CSRF');
    const openedResponse = await mutation(context, stack.origin, 'recipient.open', input);
    assert.equal(openedResponse.status(), 200, await openedResponse.text());
    const opened = (await openedResponse.json()).result.data;
    assert.equal(opened.door.title, 'Smoke gift');
    const image = await query(context, stack.origin, 'recipient.image', { ...input, version: opened.door.image.version });
    assert.equal(image.metadata.mediaType, 'image/png');
    assert(image.data.length > 0);
    assert.deepEqual(errors, [], 'No browser or hydration errors');
    console.log('Production smoke passed: HTTPS login/CSRF, administrator writes, SSR, footer/languages/mobile, image and recipient access, persisted session replacement.');
    return { calendarId: calendar.id };
  } finally {
    await browser.close();
  }
}

async function verifyFooter(page, context, origin, routes, version) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [locale, label] of [['nb', 'Versjon'], ['en', 'Version']]) {
      await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: origin }]);
      for (const route of routes) {
        const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200);
        assert((await response.text()).includes(version), 'Version is server rendered');
        assert.equal(await page.locator('footer').textContent(), `${label} ${version}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const footer = await page.locator('footer').boundingBox();
        const main = await page.locator('main').boundingBox();
        assert(footer.y >= main.y + main.height, 'Version footer follows content in normal flow');
      }
    }
  }
  await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'nb', url: origin }]);
}

async function signIn(page, origin, account) {
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Brukernavn').fill(account.username);
  await page.getByLabel('Passord', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Logg inn', exact: true }).click();
  await page.waitForURL(`${origin}/my-page`);
  await page.waitForLoadState('networkidle');
}

async function assertProtected(page, origin, version) {
  const response = await page.goto(`${origin}/my-page`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/my-page');
  assert.match(response.headers()['cache-control'], /no-store/);
  assert((await response.text()).includes('browser-superadmin'));
  assert.equal(await page.locator('footer').textContent(), `Versjon ${version}`);
}

async function query(context, origin, operation, input) {
  const suffix = input ? `?input=${encodeURIComponent(JSON.stringify(input))}` : '';
  const response = await context.request.get(`${origin}/api/trpc/${operation}${suffix}`);
  assert.equal(response.status(), 200, await response.text());
  assert.match(response.headers()['cache-control'], /no-store/);
  return (await response.json()).result.data;
}

async function mutation(context, origin, operation, input) {
  const token = (await query(context, origin, 'auth.csrf')).requestToken;
  return context.request.post(`${origin}/api/trpc/${operation}`, { headers: { 'X-CSRF-TOKEN': token }, data: input });
}
