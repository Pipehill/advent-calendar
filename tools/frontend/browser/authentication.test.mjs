import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../src/frontend/node_modules/playwright/index.mjs';
import { readLocalSettings } from '../../quality/local-settings.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const settings = readLocalSettings(root);
const runtime = process.env.QUALITY_CONTAINER_RUNTIME || settings.runtime || 'podman';
const dotnet = process.env.DOTNET_EXE || settings.dotnet || 'dotnet';
const reports = path.join(root, 'quality-reports/plan00011/browser');
const fixtureDll = path.join(root, 'tools/frontend/browser-fixture/bin/Release/net10.0/BrowserFixture.dll');
const postgresImage = 'docker.io/library/postgres@sha256:4cc13dede823cab4e05290c7fb3350fb4e599ecabd9b07e6706b5d5e8f5bc929';
const children = [];
let databaseName;
let environment;
let frontendUrl;
let apiUrl;
let accounts;
let browser;
let context;
let page;
let errors;

describe('Authentication through production Nitro and isolated PostgreSQL', { timeout: 180000 }, () => {
  before(async () => {
    fs.mkdirSync(reports, { recursive: true });
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    databaseName = `advent-browser-${suffix}`;
    const password = randomUUID();
    command(runtime, ['run', '--rm', '-d', '--name', databaseName, '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=browser_${suffix}`, '-p', '127.0.0.1::5432', postgresImage]);
    const port = command(runtime, ['port', databaseName, '5432/tcp']).trim().split(':').at(-1);
    environment = { ...process.env, BROWSER_TEST_CONNECTION: `Host=127.0.0.1;Port=${port};Database=browser_${suffix};Username=postgres;Password=${password}` };
    await ready(async () => command(runtime, ['exec', databaseName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']));
    accounts = JSON.parse(command(dotnet, [fixtureDll], environment));
    const apiPort = await freePort();
    apiUrl = `http://127.0.0.1:${apiPort}`;
    launch(dotnet, [path.join(root, 'src/backend/Calendar.Api/bin/Release/net10.0/Calendar.Api.dll')], {
      ...environment, ASPNETCORE_ENVIRONMENT: 'Development', ASPNETCORE_URLS: apiUrl,
      ConnectionStrings__Calendar: environment.BROWSER_TEST_CONNECTION,
      Authentication__KeyDirectory: path.join(reports, `keys-${suffix}`),
    }, path.join(root, 'src/backend/Calendar.Api'), 'backend');
    await ready(async () => assert.equal((await fetch(`${apiUrl}/health/ready`)).status, 200));
    const frontendPort = await freePort();
    frontendUrl = `http://127.0.0.1:${frontendPort}`;
    launch(process.execPath, ['.output/server/index.mjs'], { ...process.env, HOST: '127.0.0.1', PORT: String(frontendPort), BACKEND_API_URL: apiUrl }, path.join(root, 'src/frontend'), 'frontend');
    await ready(async () => assert.equal((await fetch(`${frontendUrl}/health/ready`)).status, 200));
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  });

  beforeEach(async () => {
    errors = [];
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|did not match|Minified React error/i.test(message.text())) errors.push(message.text());
    });
  });

  afterEach(async () => {
    try { assert.deepEqual(errors, [], 'No page or hydration errors'); }
    finally { await context?.close(); }
  });

  after(async () => {
    await browser?.close();
    for (const child of children.reverse()) {
      child.kill();
      await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 2000).unref(); });
    }
    if (databaseName) command(runtime, ['stop', '--time', '2', databaseName]);
  });

  test('Given an anonymous visitor, When personal SSR and keyboard login navigation are requested, Then no personal data is exposed', async () => {
    // Given no authentication cookies.
    const anonymous = await fetch(`${frontendUrl}/min-side`, { redirect: 'manual' });

    // When the public login link receives keyboard activation.
    await page.goto(frontendUrl);
    await page.getByRole('link', { name: 'Logg inn' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/logg-inn');

    // Then SSR denies personal data and navigation opens an accessible page form.
    assert.match(anonymous.headers.get('cache-control'), /no-store/);
    assert(! (await anonymous.text()).includes('Ærlig Ørn'));
    assert.equal(await context.pages().length, 1);
    assert.equal(await page.getByLabel('Brukernavn').getAttribute('autocomplete'), 'username');
    assert.equal(await page.getByLabel('Passord', { exact: true }).getAttribute('type'), 'password');
    assert.equal((await context.request.get(`${frontendUrl}/api/trpc/accounts.list?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 50 }))}`)).status(), 401);
  });

  for (const role of ['calendarUser', 'calendarAdmin', 'superadmin']) {
    test(`Given ${role}, When login and direct refresh complete, Then only its permitted personal content is rendered`, async () => {
      // Given a disposable unrestricted account of this role.
      const account = accounts.find(item => item.role === role && !item.restricted);

      // When the real browser/BFF/backend cookie exchange signs in and reloads SSR.
      await signIn(account);
      const response = await page.reload({ waitUntil: 'networkidle' });

      // Then the name is plain text, cookies remain host-only and role controls match authority.
      assert.equal(await page.locator('h1').textContent(), `Hei, ${account.name}!`);
      assert.match(response.headers()['cache-control'], /no-store/);
      const cookies = await context.cookies();
      for (const name of ['advent.auth', 'advent.csrf']) {
        const cookie = cookies.find(item => item.name === name);
        assert(cookie?.httpOnly);
        assert.equal(cookie.sameSite, 'Lax');
        assert.equal(cookie.path, '/');
        assert.equal(cookie.domain, '127.0.0.1');
        if (name === 'advent.auth') {
          const seconds = cookie.expires - Date.now() / 1000;
          const expected = role === 'calendarUser' ? 30 * 86400 : 8 * 3600;
          assert(seconds > expected - 60 && seconds <= expected);
        }
      }
      const html = await response.text();
      assert(!html.includes(account.password));
      assert(!html.includes('requestToken'));
      if (role === 'calendarUser') {
        assert.equal(await page.getByText('Du har ikke noen kalendere enda...').count(), 1);
        assert.equal(await page.getByRole('button', { name: /^Lag ny/ }).count(), 0);
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('h1 b').count(), 0);
      } else if (role === 'calendarAdmin') {
        assert.equal(await page.getByRole('button', { name: /^Lag ny/ }).count(), 2);
        assert(await page.getByRole('button', { name: 'Lag ny kalender', exact: true }).isDisabled());
        assert.equal(await page.getByText('Alle kontoer').count(), 0);
      } else {
        await page.getByText('Ærlig Ørn 🎄', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: /^Lag ny/ }).count(), 1);
        assert(await page.getByRole('button', { name: 'Lag ny kalenderadmin' }).isDisabled());
        assert.equal(await page.locator('li').count(), 50);
        for (const other of accounts.filter(item => !item.restricted)) {
          assert.equal(await page.getByText(other.name, { exact: true }).count(), 1);
        }
        await page.getByRole('button', { name: 'Neste', exact: true }).click();
        await page.getByText('Side 2', { exact: true }).waitFor();
        await page.getByText('Pagination 51', { exact: true }).waitFor();
        assert.equal(await page.locator('li').count(), accounts.length + 51 - 50);
      }
      if (role !== 'superadmin') {
        assert.equal((await context.request.get(`${frontendUrl}/api/trpc/accounts.list?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 50 }))}`)).status(), 403);
      }
      await page.screenshot({ path: path.join(reports, `${role}.png`), fullPage: true });
    });
  }

  test('Given a restricted superadmin, When direct navigation and password change are attempted, Then fresh login is required before privileges appear', async () => {
    // Given a temporary credential for a superadmin.
    const account = accounts.find(item => item.username === 'browser-temporary');
    await signIn(account, '/endre-passord');

    // When direct personal-page access is followed by a compliant password change.
    await page.goto(`${frontendUrl}/min-side`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/endre-passord');
    assert.equal(await page.getByRole('button', { name: /^Lag ny/ }).count(), 0);
    assert.equal((await context.request.get(`${frontendUrl}/api/trpc/accounts.list?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 50 }))}`)).status(), 403);
    const replacement = `Fresh!Ærlig${randomUUID()}`;
    await page.getByLabel('Nåværende passord').fill(account.password);
    await page.getByLabel('Nytt passord').fill('Password123456!');
    await page.getByRole('button', { name: 'Bytt passord', exact: true }).click();
    await page.locator('#newPassword[aria-invalid=true]').waitFor();
    await page.getByLabel('Nytt passord').fill(replacement);
    await page.getByRole('button', { name: 'Bytt passord', exact: true }).click();
    await page.waitForURL('**/logg-inn?changed=1');

    // Then the old cookie is unusable, the confirmation is localized and a new login grants authority.
    assert.equal(await page.getByRole('status').textContent(), 'Passordet er byttet. Logg inn med det nye passordet.');
    await page.goto(`${frontendUrl}/min-side`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/logg-inn');
    account.password = replacement;
    await signIn(account);
    assert.equal(await page.getByRole('button', { name: 'Lag ny kalenderadmin' }).count(), 1);
  });

  test('Given an invalid password, When the language changes, Then generic localized errors and accessible field validation appear', async () => {
    // Given the sign-in form in Norwegian.
    await page.goto(`${frontendUrl}/logg-inn`);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    assert.equal(await page.locator('input[aria-invalid=true]').count(), 2);

    // When an unknown account submits an incorrect credential in each language.
    for (const locale of ['nb', 'en']) {
      await page.getByRole('combobox').selectOption(locale);
      await page.waitForLoadState('networkidle');
      await page.locator('input[name=username]').fill('unknown-account');
      await page.locator('input[name=password]').fill('Wrong!ButMasked');
      await page.getByRole('button', { name: locale === 'nb' ? 'Logg inn' : 'Log in', exact: true }).click();

      // Then the error gives no account-existence information and the password stays masked.
      await page.getByRole('alert').filter({ hasText: locale === 'nb' ? 'Kunne ikke logge inn' : 'Could not sign in' }).waitFor();
      assert.equal(await page.locator('input[name=password]').getAttribute('type'), 'password');
    }
  });

  test('Given a valid session, When it is revoked externally, Then direct SSR rejects the replay without personal hydration', async () => {
    // Given a logged-in administrator and its copied cookie.
    const account = accounts.find(item => item.role === 'calendarAdmin');
    await signIn(account);
    const cookie = (await context.cookies()).map(item => `${item.name}=${item.value}`).join('; ');

    // When persistence revokes the session before a direct request and refresh.
    command(dotnet, [fixtureDll, 'revoke', account.username], environment);
    const response = await fetch(`${frontendUrl}/min-side`, { headers: { cookie }, redirect: 'manual' });
    await page.reload({ waitUntil: 'networkidle' });

    // Then backend validation blocks the replay and personal output is absent.
    assert(! (await response.text()).includes(account.name));
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(new URL(page.url()).pathname, '/logg-inn');
  });

  test('Given two sessions, When one logs out, Then its replay and browser history lose personal data while the other stays valid', async () => {
    // Given two independently signed-in contexts for the ordinary account.
    const account = accounts.find(item => item.role === 'calendarUser');
    await signIn(account);
    const replay = (await context.cookies()).map(item => `${item.name}=${item.value}`).join('; ');
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await signIn(account, '/min-side', otherPage);

      // When the first session logs out through CSRF-protected BFF revocation.
      await page.getByRole('button', { name: 'Logg ut', exact: true }).click();
      await page.waitForURL(frontendUrl + '/');
      const response = await fetch(`${frontendUrl}/min-side`, { headers: { cookie: replay }, redirect: 'manual' });
      await page.goBack({ waitUntil: 'networkidle' });
      await otherPage.reload({ waitUntil: 'networkidle' });

      // Then the invalidated session cannot replay personal HTML or history, and the second survives.
      assert(! (await response.text()).includes(account.name));
      assert.equal(await page.locator('h1').filter({ hasText: account.name }).count(), 0);
      assert.equal(await otherPage.locator('h1').textContent(), `Hei, ${account.name}!`);
    } finally { await other.close(); }
  });

  test('Given no valid CSRF token, When login is posted directly, Then Nitro preserves backend denial and no-store', async () => {
    // Given a real backend antiforgery cookie obtained through production Nitro.
    const tokenResponse = await fetch(`${frontendUrl}/api/trpc/auth.csrf`);
    const cookies = tokenResponse.headers.getSetCookie();
    const account = accounts.find(item => item.role === 'calendarAdmin');

    // When a forged direct mutation omits the request token.
    const response = await fetch(`${frontendUrl}/api/trpc/auth.login`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookies.map(item => item.split(';')[0]).join('; ') }, body: JSON.stringify({ username: account.username, password: account.password }) });

    // Then the missing token is rejected and cache protection survives the production boundary.
    assert.equal(response.status, 400);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert(cookies.some(cookie => cookie.startsWith('advent.csrf=') && /httponly/i.test(cookie)));
    assert(!response.headers.getSetCookie().some(cookie => cookie.startsWith('advent.auth=') && !cookie.startsWith('advent.auth=;')));
  });

  test('Given a principal change, When a stale or invalid CSRF token is replayed through Nitro, Then logout is rejected and the session stays valid', async () => {
    // Given an anonymous CSRF exchange followed by an unrestricted login.
    const anonymous = await context.request.get(`${frontendUrl}/api/trpc/auth.csrf`);
    const staleToken = (await anonymous.json()).result.data.requestToken;
    const account = accounts.find(item => item.role === 'calendarUser');
    await signIn(account);

    // When the original or a forged request token attempts a state change.
    for (const token of [staleToken, 'invalid-token']) {
      const response = await context.request.post(`${frontendUrl}/api/trpc/auth.logout`, { headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }, data: {} });

      // Then principal-bound antiforgery validation fails without revoking the valid session.
      assert.equal(response.status(), 400);
      assert.match(response.headers()['cache-control'], /no-store/);
    }
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/min-side');
  });

  test('Given an expired temporary password, When login is attempted, Then generic feedback grants no restricted or privileged session', async () => {
    // Given a temporary credential whose fixed deadline has elapsed in persistence.
    const account = accounts.find(item => item.username === 'browser-expired');
    command(dotnet, [fixtureDll, 'expire', account.username], environment);

    // When the former credential is submitted through the normal sign-in form.
    await page.goto(`${frontendUrl}/logg-inn`);
    await page.getByLabel('Brukernavn').fill(account.username);
    await page.getByLabel('Passord', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Logg inn', exact: true }).click();

    // Then the error does not disclose account state or grant personal access.
    await page.getByRole('alert').filter({ hasText: 'Kunne ikke logge inn' }).waitFor();
    await page.goto(`${frontendUrl}/min-side`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/logg-inn');
  });

  test('Given a cached superadmin list, When the same browser switches to an ordinary account, Then privileged data is absent from its UI and HTML', async () => {
    // Given an authorized list already viewed in this browser context.
    const superadmin = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(superadmin);
    await page.getByText('Alle kontoer', { exact: true }).waitFor();

    // When logout is followed by an ordinary user's fresh login in the same context.
    await page.getByRole('button', { name: 'Logg ut', exact: true }).click();
    await page.waitForURL(frontendUrl + '/');
    const ordinary = accounts.find(item => item.role === 'calendarUser');
    await signIn(ordinary);
    const response = await page.reload({ waitUntil: 'networkidle' });

    // Then neither browser queries, rendered personal UI nor SSR hydration retain the previous list.
    assert.equal(await page.getByText('Alle kontoer', { exact: true }).count(), 0);
    assert.equal(await page.locator('li').count(), 0);
    assert(!(await response.text()).includes(superadmin.name));
  });

  test('Given a superadmin list, When a later page loads then returns empty or unavailable, Then accessible states replace previous account data', async () => {
    // Given an authorized first page and a controlled delay on the next browser query.
    await signIn(accounts.find(item => item.username === 'browser-superadmin'));
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/trpc/accounts.list**', async route => {
      await pending;
      await route.fulfill({ json: { result: { data: { users: [], hasMore: false } } } });
    });

    // When a new page is waiting and then returns an empty result.
    await page.getByRole('button', { name: 'Neste', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Henter kontoer' }).waitFor();
    assert.equal(await page.locator('li').count(), 0);
    release();
    await page.getByText('Ingen kontoer å vise.', { exact: true }).waitFor();
    await page.unroute('**/api/trpc/accounts.list**');
    await page.route('**/api/trpc/accounts.list**', route => route.fulfill({ status: 503, json: { error: { message: 'SERVICE_UNAVAILABLE', code: -32603, data: { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 } } } }));
    await page.getByRole('button', { name: 'Forrige', exact: true }).click();

    // Then failures remain accessible and do not display data from the previous successful page.
    await page.getByRole('alert').filter({ hasText: 'Innloggingstjenesten er utilgjengelig' }).waitFor();
    assert.equal(await page.locator('li').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Prøv igjen', exact: true }).count(), 1);
  });

  test('Given a public calendar stack, When the existing browser regression suite runs, Then landing languages and direct calendar routes remain intact', () => {
    // Given the same isolated API and production frontend used by authentication tests.
    const env = { ...process.env, FRONTEND_URL: frontendUrl, API_URL: apiUrl };

    // When all existing smoke scenarios run against those services.
    const output = command(process.execPath, ['tools/frontend/smoke.mjs'], env);

    // Then the full regression suite succeeds and retains its named test evidence.
    assert.match(output, /pass 8/);
    fs.writeFileSync(path.join(reports, 'smoke.log'), output);
  });
});

async function signIn(account, destination = '/min-side', target = page) {
  await target.goto(`${frontendUrl}/logg-inn`);
  await target.getByLabel('Brukernavn').fill(account.username);
  await target.getByLabel('Passord', { exact: true }).fill(account.password);
  await target.getByRole('button', { name: 'Logg inn', exact: true }).click();
  await target.waitForURL(frontendUrl + destination);
  await target.waitForLoadState('networkidle');
}

function command(executable, args, env = process.env) {
  const childEnvironment = { ...env };
  // A separately launched Node test suite needs its own runner context.
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(executable, args, { cwd: root, env: childEnvironment, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.stderr}`);
  return result.stdout;
}

function launch(executable, args, env, cwd, label) {
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(reports, `${label}.log`));
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
}

async function ready(check) {
  const deadline = Date.now() + 30000;
  let lastError;
  while (Date.now() < deadline) {
    try { await check(); return; }
    catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  throw lastError;
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
