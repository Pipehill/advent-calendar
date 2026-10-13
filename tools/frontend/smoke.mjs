// Browser verification against a running local/deployed environment, separate from unit tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(pathToFileURL(path.join(root, 'src/frontend/node_modules/playwright/index.mjs')));
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const apiUrl = process.env.API_URL || 'http://localhost:8080';
const reports = path.join(root, 'quality-reports/frontend');
fs.mkdirSync(reports, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
});
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|did not match|Minified React error/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('response', response => {
    if (response.status() >= 400 && /\.(js|css)$/.test(new URL(response.url()).pathname)) {
      errors.push(`Asset request failed: ${response.status()} ${response.url()}`);
    }
  });
  const requests = [];
  page.on('request', request => requests.push(request.url()));

  // Given the existing seeded calendar and no selected language.
  const sampleId = '5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026';
  const stored = await (await fetch(`${apiUrl}/calendars/${sampleId}`)).json();

  // When the root page redirects and hydrates.
  await page.goto(frontendUrl);
  await page.getByRole('combobox').waitFor();
  await page.waitForLoadState('networkidle');

  // Then stored data is rendered without duplicate reads or hydration errors.
  assert.equal(new URL(page.url()).pathname, `/calendars/${sampleId}`);
  assert.equal(await page.locator('h1').textContent(), stored.title);
  assert.deepEqual(await page.locator('ol li').allTextContents(), stored.doors.map(door => String(door.number)));
  assert.equal(await page.locator('html').getAttribute('lang'), 'nb');
  assert.equal(requests.filter(url => url.includes('/api/trpc/')).length, 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(reports, 'calendar-desktop.png'), fullPage: true });
  results.push('Seeded database calendar, root redirect, ordered doors and hydration without repeat fetch passed.');

  // Given the loaded Norwegian calendar.
  const original = await page.locator('h1').textContent();

  // When the user selects English and refreshes the page.
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('combobox').selectOption('en')]);
  await page.reload();

  // Then the selected language survives SSR while user-authored data stays unchanged.
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('h1').textContent(), original);
  assert.equal(await page.getByRole('combobox').getAttribute('aria-label'), 'Language');
  assert.equal((await (await fetch(`${apiUrl}/calendars/${sampleId}`)).json()).title, original);
  results.push('English language selection, reload/SSR and unchanged stored title passed.');

  // Given two distinct persisted calendars created using the existing API.
  const calendars = [];
  for (const title of ['Smoke test: Ærlig jul 🎄', 'Smoke test: Another calendar']) {
    const response = await fetch(`${apiUrl}/calendars`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    assert.equal(response.status, 201);
    calendars.push(await response.json());
  }

  // When each ID is loaded directly and a browser refetch is triggered.
  for (const calendar of calendars) {
    await page.goto(`${frontendUrl}/calendars/${calendar.id}`);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('h1').textContent(), calendar.title);
  }
  const browserRead = await page.evaluate(async id => {
    const input = encodeURIComponent(JSON.stringify({ id }));
    const response = await fetch(`/api/trpc/calendar.get?input=${input}`);
    return { status: response.status, body: await response.json() };
  }, calendars[1].id);

  // Then tRPC returns the actual stored calendar without door contents or direct API browser requests.
  assert.equal(browserRead.status, 200);
  assert.equal(browserRead.body.result.data.title, calendars[1].title);
  assert(browserRead.body.result.data.doors.every(door => !('text' in door)));
  assert(requests.some(url => url.includes('/api/trpc/calendar.get')));
  assert(!requests.some(url => url.startsWith(apiUrl)));
  results.push('Two persisted calendars and browser/tRPC/BFF/API/database round trip passed.');

  // Given malformed and unknown IDs, and both supported languages.
  const failureCases = [['bad-id', 'The calendar address is invalid.'],
    ['00000000-0000-4000-8000-000000000000', 'We could not find this calendar.']];

  // When these calendar pages are requested.
  for (const [id, message] of failureCases) {
    await page.goto(`${frontendUrl}/calendars/${id}`);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('alert').locator('p').textContent(), message);
  }
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('combobox').selectOption('nb')]);

  // Then errors are translated instead of showing raw API messages.
  assert.equal(await page.getByRole('alert').locator('p').textContent(), 'Vi fant ikke denne kalenderen.');
  assert.deepEqual(errors, []);
  results.push('Invalid/missing calendar errors in English and Norwegian passed.');

  // Given a narrow mobile viewport.
  await page.setViewportSize({ width: 375, height: 812 });

  // When the sample calendar is loaded again.
  await page.goto(`${frontendUrl}/calendars/${sampleId}`);
  await page.waitForLoadState('networkidle');
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  // Then all 24 static doors fit without horizontal overflow or interactive door controls.
  assert.equal(await page.locator('ol li').count(), 24);
  assert.equal(await page.locator('ol button, ol a').count(), 0);
  assert.equal(hasOverflow, false);
  await page.screenshot({ path: path.join(reports, 'calendar-mobile.png'), fullPage: true });
  results.push('Mobile layout and static doors passed.');
  fs.writeFileSync(path.join(reports, 'smoke.json'), JSON.stringify({ frontendUrl, apiUrl, calendars, results, errors }, null, 2) + '\n');
  console.log(results.join('\n'));
} finally {
  await browser.close();
}
