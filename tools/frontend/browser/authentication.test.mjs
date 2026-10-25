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
const reports = path.join(root, 'quality-reports/plan00013/browser');
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
let apiProcess;
let apiEnvironment;

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
    apiEnvironment = {
      ...environment, ASPNETCORE_ENVIRONMENT: 'Development', ASPNETCORE_URLS: apiUrl,
      ConnectionStrings__Calendar: environment.BROWSER_TEST_CONNECTION,
      Authentication__KeyDirectory: path.join(reports, `keys-${suffix}`),
    };
    apiProcess = startApi();
    await ready(async () => assert.equal((await fetch(`${apiUrl}/health/ready`)).status, 200));
    const frontendPort = await freePort();
    frontendUrl = `http://127.0.0.1:${frontendPort}`;
    launch(process.execPath, ['.output/server/index.mjs'], { ...process.env, HOST: '127.0.0.1', PORT: String(frontendPort), BACKEND_API_URL: apiUrl }, path.join(root, 'src/frontend'), 'frontend');
    await ready(async () => assert.equal((await fetch(`${frontendUrl}/health/ready`)).status, 200));
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  });

  beforeEach(async () => {
    // Each independent scenario gets fresh aggregate rate budgets; persisted
    // accounts, lockouts and sessions survive the process replacement unchanged.
    await stopChild(apiProcess);
    apiProcess = startApi();
    await ready(async () => assert.equal((await fetch(`${apiUrl}/health/ready`)).status, 200));
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
      await stopChild(child);
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
        assert.equal(await page.getByRole('link', { name: 'Lag ny kalenderbruker' }).count(), 1);
        assert(await page.getByRole('button', { name: 'Lag ny kalender', exact: true }).isDisabled());
        assert.equal(await page.getByText('Alle kontoer').count(), 0);
        await page.getByText('Dine kalenderbrukere', { exact: true }).waitFor();
        await page.getByText(accounts.find(item => item.username === 'browser-user').name, { exact: true }).waitFor();
        assert.equal(await page.getByText('Annen Bruker', { exact: true }).count(), 0);
      } else {
        await page.getByText('Ærlig Ørn 🎄', { exact: true }).waitFor();
        assert.equal(await page.getByRole('link', { name: 'Opprett konto' }).count(), 1);
        assert.equal(await page.locator('li').count(), 50);
        for (const other of accounts.filter(item => !item.restricted)) {
          assert.equal(await page.getByText(other.name, { exact: true }).count(), 1);
        }
        await page.getByRole('button', { name: 'Neste', exact: true }).click();
        await page.getByText('Side 2', { exact: true }).waitFor();
        await page.getByText('Pagination 51', { exact: true }).waitFor();
        assert.equal(await page.locator('li').count(), accounts.length + 51 - 50);
      }
      if (role === 'calendarUser') {
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
    assert.equal(await page.getByRole('link', { name: 'Opprett konto' }).count(), 1);
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

  test('Given direct creation URLs, When anonymous ordinary and restricted callers navigate, Then the form is protected on SSR and refresh', async () => {
    // Given no session followed by an ordinary account.
    await page.goto(`${frontendUrl}/opprett-konto`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/logg-inn');
    const ordinary = accounts.find(item => item.username === 'browser-user');
    await signIn(ordinary);

    // When direct navigation and a direct creation mutation bypass the UI.
    await page.goto(`${frontendUrl}/opprett-konto`, { waitUntil: 'networkidle' });
    const denied = await mutation('accounts.create', { name: 'Denied', username: 'denied-user', role: 'calendarUser', password: `Temporary!${randomUUID()}` });

    // Then the ordinary caller sees no form and the independent BFF rejects the write.
    assert.equal(new URL(page.url()).pathname, '/min-side');
    assert.equal(await page.locator('#account-password').count(), 0);
    assert.equal(denied.status(), 403);
    assert.match(denied.headers()['cache-control'], /no-store/);
    await signIn(accounts.find(item => item.username === 'browser-restricted-admin'), '/endre-passord');
    await page.goto(`${frontendUrl}/opprett-konto`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/endre-passord');
    assert.equal(await page.locator('#account-password').count(), 0);
  });

  for (const [creator, role, prefix] of [
    ['browser-superadmin', 'calendarAdmin', 'zz-admin-'],
    ['browser-superadmin', 'calendarUser', 'aa-user-'],
    ['browser-admin', 'calendarUser', 'zz-user-'],
  ]) {
    test(`Given ${creator} on its list, When ${role} is created on a dedicated page, Then the persisted account is visible and the actor stays signed in`, async () => {
      // Given an authorized administrator, including a later superadmin list page.
      const actor = accounts.find(item => item.username === creator);
      await signIn(actor);
      if (creator === 'browser-superadmin') await page.getByRole('button', { name: 'Neste', exact: true }).click();
      const input = { name: `Ny Ærlig 🎄 ${randomUUID().slice(0, 6)}`, username: prefix + randomUUID().slice(0, 8), password: `Temporary!${randomUUID()}`, role };

      // When the account is created through real browser/BFF/API transport.
      const account = await createAccount(actor, input);
      await page.getByText(input.name, { exact: true }).waitFor();
      const session = await context.request.get(`${frontendUrl}/api/trpc/auth.session`);
      const pageNumber = await page.getByText(/^Side \d+$/).textContent();
      await page.reload({ waitUntil: 'networkidle' });
      if (pageNumber !== 'Side 1') {
        await page.getByRole('button', { name: 'Neste', exact: true }).click();
      }

      // Then API success exposes only metadata, the list survives reload, and no recipient login replaces the actor.
      await page.getByText(input.name, { exact: true }).waitFor();
      assert.equal((await session.json()).result.data.user.username, actor.username);
      assert.equal(account.role, role);
      assert.equal(account.responsibleAdministratorId, role === 'calendarUser' ? accounts.find(item => item.username === 'browser-admin').id : null);
      assert(!JSON.stringify(account).includes(input.password));
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      assert(!(await page.content()).includes(input.password));
      await page.screenshot({ path: path.join(reports, `created-${creator}-${role}.png`), fullPage: true });
    });
  }

  test('Given account creation validation, When blank duplicate and obsolete conditional fields are submitted, Then errors are accessible and failed accounts never appear', async () => {
    // Given the dedicated superadmin form at a narrow viewport.
    const actor = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(actor);
    await page.getByRole('link', { name: 'Opprett konto', exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    assert.equal(await page.locator('#account-name[aria-invalid=true]').count(), 1);
    await page.getByLabel('Visningsnavn').fill('Duplicate must not persist');
    await page.getByLabel('Brukernavn', { exact: true }).fill('BROWSER-USER');
    await page.getByLabel('Ansvarlig kalenderadministrator', { exact: true }).selectOption(accounts.find(item => item.username === 'browser-admin').id);
    await page.getByLabel('Mottakerens midlertidige passord').fill('Password123456!');
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    await page.getByRole('alert').filter({ hasText: 'Sjekk de markerte feltene' }).waitFor();
    assert.equal(await page.locator('#account-password[aria-invalid=true]').count(), 1);
    await page.getByLabel('Mottakerens midlertidige passord').fill(`Temporary!${randomUUID()}`);

    // When a duplicate username reaches the API, then the role changes.
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    await page.getByRole('alert').filter({ hasText: 'Brukernavnet er allerede reservert' }).first().waitFor();
    await page.getByLabel('Kontotype', { exact: true }).selectOption('calendarAdmin');

    // Then the error belongs to its field, obsolete fields/secrets clear, cancellation discards drafts and mobile layout fits.
    assert.equal(await page.locator('#account-responsible').count(), 0);
    assert.equal(await page.locator('#account-password').inputValue(), '');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.waitForURL('**/min-side');
    assert.equal(await page.getByText('Duplicate must not persist', { exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Opprett konto', exact: true }).click();
    assert.equal(await page.locator('#account-name').inputValue(), '');
  });

  test('Given stale administrator verification, When a new account is confirmed, Then wrong-password feedback preserves the actor and re-verification completes the explicit submission', async () => {
    // Given a valid actor whose five-minute verification has elapsed, with fixed session expiry.
    const actor = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(actor);
    const original = (await (await context.request.get(`${frontendUrl}/api/trpc/auth.session`)).json()).result.data;
    command(dotnet, [fixtureDll, 'stale-verification', actor.username], environment);
    await page.getByRole('link', { name: 'Opprett konto', exact: true }).click();
    await page.getByLabel('Kontotype', { exact: true }).selectOption('calendarAdmin');
    await page.getByLabel('Visningsnavn').fill('Bekreftet Administrator');
    await page.getByLabel('Brukernavn', { exact: true }).fill(`verify-${randomUUID().slice(0, 8)}`);
    await page.getByLabel('Mottakerens midlertidige passord').fill(`Temporary!${randomUUID()}`);

    // When the initial write is rejected and the acting password is verified again.
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    await page.getByLabel('Ditt administratorpassord').waitFor();
    await page.getByLabel('Ditt administratorpassord').fill('Incorrect!Verification');
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    await page.getByRole('alert').filter({ hasText: 'Passordbekreftelsen mislyktes' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/opprett-konto');
    assert.equal(await page.getByLabel('Ditt administratorpassord').inputValue(), '');
    await page.getByLabel('Ditt administratorpassord').fill(actor.password);
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    await page.waitForURL('**/min-side');
    await page.getByText('Bekreftet Administrator', { exact: true }).waitFor();

    // Then only explicit resubmission succeeds and verification never extends the session deadline.
    const current = (await (await context.request.get(`${frontendUrl}/api/trpc/auth.session`)).json()).result.data;
    assert.equal(current.expiresAt, original.expiresAt);
    assert.equal(current.user.username, actor.username);
  });

  test('Given an authorized account, When reset promotion and demotion run through the list, Then sessions are revoked and fixed responsibility is retained', async () => {
    // Given a freshly created ordinary target with its own restricted session.
    const actor = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(actor);
    const input = { name: 'Vedlikehold Ærlig', username: `aa-maint-${randomUUID().slice(0, 8)}`, password: `Temporary!${randomUUID()}`, role: 'calendarUser' };
    const account = await createAccount(actor, input);
    const recipient = await browser.newContext();
    try {
      assert.equal((await mutation('auth.login', { username: input.username, password: input.password }, recipient.request)).status(), 200);

      // When a replacement password and promotion are saved, then the role returns to ordinary.
      const resetPassword = `Reset!${randomUUID()}`;
      await maintain(account, 'Tilbakestill passord', resetPassword);
      assert.equal((await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).status(), 401);
      assert.equal((await mutation('auth.login', { username: input.username, password: input.password }, recipient.request)).status(), 401);
      assert.equal((await mutation('auth.login', { username: input.username, password: resetPassword }, recipient.request)).status(), 200);
      const promotionPassword = `Promoted!${randomUUID()}`;
      await maintain(account, 'Gjør til kalenderadministrator', promotionPassword);
      assert.equal((await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).status(), 401);
      await maintain(account, 'Endre til kalenderbruker');

      // Then persisted role/responsibility and temporary credential restriction match the contract.
      const list = await context.request.get(`${frontendUrl}/api/trpc/accounts.list?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 50, focusId: account.id }))}`);
      const persisted = (await list.json()).result.data.users.find(item => item.id === account.id);
      assert.equal(persisted.role, 'calendarUser');
      assert.equal(persisted.responsibleAdministratorId, account.responsibleAdministratorId);
      const login = await mutation('auth.login', { username: input.username, password: promotionPassword }, recipient.request);
      assert.equal(login.status(), 200);
      assert.equal((await login.json()).result.data.mustChangePassword, true);
      assert.equal((await recipient.request.get(`${frontendUrl}/api/trpc/accounts.list?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 50 }))}`)).status(), 403);
      assert(!(await page.content()).includes(promotionPassword));
    } finally { await recipient.close(); }
  });

  test('Given a superadmin and a target account, When disable and enable are confirmed, Then displayed status follows persistence and revoked sessions stay revoked', async () => {
    // Given a new target signed in with a temporary credential.
    const actor = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(actor);
    const input = { name: 'Status Bruker', username: `aa-status-${randomUUID().slice(0, 8)}`, password: `Temporary!${randomUUID()}`, role: 'calendarUser' };
    const account = await createAccount(actor, input);
    const recipient = await browser.newContext();
    try {
      await mutation('auth.login', { username: input.username, password: input.password }, recipient.request);

      // When the target is disabled and enabled from the authorized list.
      await maintain(account, 'Deaktiver konto');
      await page.locator(`[data-account-id="${account.id}"]`).getByText(/Deaktivert/).waitFor();
      assert.equal((await mutation('auth.login', { username: input.username, password: input.password }, recipient.request)).status(), 401);
      await maintain(account, 'Aktiver konto');

      // Then status updates without reload and enabling does not restore the old session.
      await page.locator(`[data-account-id="${account.id}"]`).getByText(/Aktivert/).waitFor();
      assert.equal((await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).status(), 401);
      assert.equal((await mutation('auth.login', { username: input.username, password: input.password }, recipient.request)).status(), 200);
    } finally { await recipient.close(); }
  });

  test('Given calendaradmin ownership, When reset and forged cross-owner maintenance are attempted, Then only assigned ordinary targets are maintained', async () => {
    // Given the first calendaradmin and a new assigned ordinary user.
    const actor = accounts.find(item => item.username === 'browser-admin');
    await signIn(actor);
    const account = await createAccount(actor, { name: 'Egen Bruker', username: `owned-${randomUUID().slice(0, 8)}`, password: `Temporary!${randomUUID()}`, role: 'calendarUser' });

    // When allowed reset and direct unauthorized operations are submitted.
    await maintain(account, 'Tilbakestill passord', `Reset!${randomUUID()}`);
    const other = accounts.find(item => item.username === 'browser-user-two');
    const results = await Promise.all([
      mutation('accounts.resetPassword', { id: other.id, password: `Reset!${randomUUID()}` }),
      mutation('accounts.changeStatus', { id: account.id, enabled: false }),
      mutation('accounts.changeRole', { id: account.id, role: 'calendarAdmin', temporaryPassword: `Promote!${randomUUID()}` }),
    ]);

    // Then no status/role controls or cross-owner rows are exposed and forged calls fail.
    assert(results.every(response => response.status() === 403));
    assert.equal(await page.getByRole('button', { name: /^Deaktiver konto/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Gjør til/ }).count(), 0);
    assert.equal(await page.getByText(other.name, { exact: true }).count(), 0);
  });

  test('Given a calendaradmin with attached users, When first demotion is confirmed, Then the conflict is shown without changing the role', async () => {
    // Given a superadmin viewing the existing administrator with ordinary users.
    await signIn(accounts.find(item => item.username === 'browser-superadmin'));
    const target = accounts.find(item => item.username === 'browser-admin');
    await page.getByRole('button', { name: `Endre til kalenderbruker: ${target.username}`, exact: true }).click();
    await page.getByLabel('Ansvarlig kalenderadministrator', { exact: true }).selectOption(accounts.find(item => item.username === 'browser-admin-two').id);

    // When the dependency-protected role change is submitted.
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();

    // Then conflict feedback is accessible and no success or optimistic role change appears.
    await page.getByRole('alert').filter({ hasText: 'vanlige brukere kan ikke endres' }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'Endringen er lagret' }).count(), 0);
    assert.equal(await page.locator(`[data-account-id="${target.id}"]`).getByText(/Kalenderadministrator/).count(), 1);
  });

  test('Given an English administrator form, When creation loads and language changes, Then labels and guidance are translated without translating user names', async () => {
    // Given a calendaradmin with an existing assigned user's original name.
    await signIn(accounts.find(item => item.username === 'browser-admin'));
    await page.getByRole('combobox').selectOption('en');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Create calendar user', exact: true }).click();

    // When the localized form loads and is canceled.
    await page.getByLabel('Display name').waitFor();
    assert.equal(await page.locator('#account-role').count(), 0);
    assert.equal(await page.getByLabel("Recipient's temporary password").getAttribute('type'), 'password');
    await page.getByText(/It expires after 30 minutes/).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // Then interface text is English and user-authored content stays unchanged.
    await page.getByText('Your calendar users', { exact: true }).waitFor();
    await page.getByText(accounts.find(item => item.username === 'browser-user').name, { exact: true }).waitFor();
  });

  test('Given a pending creation with a lost response, When submission is repeated, Then one write commits and a later authorized refresh reveals it without false success', async () => {
    // Given a creation whose API response will be lost after the actual commit.
    const actor = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(actor);
    await page.getByRole('link', { name: 'Opprett konto', exact: true }).click();
    await page.getByLabel('Kontotype', { exact: true }).selectOption('calendarAdmin');
    const username = `aa-lost-${randomUUID().slice(0, 8)}`;
    const name = `Lost response ${randomUUID().slice(0, 6)}`;
    await page.getByLabel('Visningsnavn').fill(name);
    await page.getByLabel('Brukernavn', { exact: true }).fill(username);
    await page.getByLabel('Mottakerens midlertidige passord').fill(`Temporary!${randomUUID()}`);
    let writes = 0;
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/trpc/accounts.create', async route => {
      writes++;
      await pending;
      assert.equal((await route.fetch()).status(), 200);
      await route.abort('failed');
    });

    // When a pending form is submitted again and the only response is lost.
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
    await page.locator('button[type=submit][disabled]').waitFor();
    await page.locator('form').evaluate(form => form.requestSubmit());
    release();
    await page.getByRole('alert').waitFor();

    // Then the browser makes no automatic retry and does not report an unconfirmed success.
    assert.equal(writes, 1);
    assert.equal(await page.getByRole('status').filter({ hasText: 'Kontoen er opprettet' }).count(), 0);
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.waitForURL('**/min-side');
    await page.getByText(name, { exact: true }).waitFor();
  });

  test('Given no eligible responsible administrator, When ordinary creation is opened, Then an actionable empty state blocks unassigned creation', async () => {
    // Given the authorized superadmin form with no eligible administrator options.
    await signIn(accounts.find(item => item.username === 'browser-superadmin'));
    await page.route('**/api/trpc/accounts.administrators**', route => route.fulfill({ json: { result: { data: [] } } }));
    await page.getByRole('link', { name: 'Opprett konto', exact: true }).click();

    // When creation is attempted without a valid responsible account.
    await page.getByText(/Opprett en kalenderadministrator først/).waitFor();
    await page.getByRole('button', { name: 'Bekreft og lagre' }).click();

    // Then selection guidance is accessible and switching to administrator creation removes the requirement.
    await page.getByRole('alert').filter({ hasText: 'Velg en eksisterende ansvarlig' }).waitFor();
    await page.getByLabel('Kontotype', { exact: true }).selectOption('calendarAdmin');
    assert.equal(await page.getByText(/Opprett en kalenderadministrator først/).count(), 0);
    assert.equal(await page.locator('#account-responsible').count(), 0);
  });

  test('Given an administrator without previous responsibility, When first demotion is saved, Then a selected administrator is persisted', async () => {
    // Given a newly created administrator without dependent users.
    const actor = accounts.find(item => item.username === 'browser-superadmin');
    await signIn(actor);
    const account = await createAccount(actor, { name: 'First Demotion', username: `zz-first-${randomUUID().slice(0, 8)}`, password: `Temporary!${randomUUID()}`, role: 'calendarAdmin' });
    const owner = accounts.find(item => item.username === 'browser-admin-two');

    // When the first demotion selects an existing responsible administrator.
    await maintain(account, 'Endre til kalenderbruker', undefined, owner.id);

    // Then the persisted ordinary role has that fixed association.
    const result = await context.request.get(`${frontendUrl}/api/trpc/accounts.list?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 50, focusId: account.id }))}`);
    const persisted = (await result.json()).result.data.users.find(item => item.id === account.id);
    assert.equal(persisted.role, 'calendarUser');
    assert.equal(persisted.responsibleAdministratorId, owner.id);
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

async function mutation(name, input, request = context.request) {
  const csrf = (await (await request.get(`${frontendUrl}/api/trpc/auth.csrf`)).json()).result.data.requestToken;
  return request.post(`${frontendUrl}/api/trpc/${name}`, { headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf }, data: input });
}

async function createAccount(actor, input) {
  await page.getByRole('link', { name: actor.role === 'superadmin' ? 'Opprett konto' : 'Lag ny kalenderbruker', exact: true }).click();
  await page.getByLabel('Visningsnavn').fill(input.name);
  await page.getByLabel('Brukernavn', { exact: true }).fill(input.username);
  if (actor.role === 'superadmin') {
    await page.getByLabel('Kontotype', { exact: true }).selectOption(input.role);
    if (input.role === 'calendarUser') await page.getByLabel('Ansvarlig kalenderadministrator', { exact: true }).selectOption(accounts.find(item => item.username === 'browser-admin').id);
  } else {
    assert.equal(await page.locator('#account-role').count(), 0);
    assert.equal(await page.locator('#account-responsible').count(), 0);
  }
  await page.getByLabel('Mottakerens midlertidige passord').fill(input.password);
  const response = page.waitForResponse(response => response.url().includes('/api/trpc/accounts.create') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
  const result = await response;
  assert.equal(result.status(), 200, 'Creation succeeds');
  assert.match(result.headers()['cache-control'], /no-store/);
  await page.waitForURL('**/min-side');
  await page.getByRole('status').filter({ hasText: 'Kontoen er opprettet' }).waitFor();
  await page.getByText(input.name, { exact: true }).waitFor();
  return (await result.json()).result.data;
}

async function maintain(account, action, password, responsibleId) {
  await page.getByRole('button', { name: `${action}: ${account.username}`, exact: true }).click();
  await page.locator('#account-action-heading').waitFor();
  if (password) await page.getByLabel('Mottakerens midlertidige passord').fill(password);
  if (responsibleId) await page.getByLabel('Ansvarlig kalenderadministrator', { exact: true }).selectOption(responsibleId);
  await page.getByRole('button', { name: 'Bekreft og lagre' }).click();
  await page.getByRole('status').filter({ hasText: 'Endringen er lagret' }).waitFor();
  await page.getByRole('button', { name: 'Oppdater kontoer', exact: true }).waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
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

function startApi() {
  return launch(dotnet, [path.join(root, 'src/backend/Calendar.Api/bin/Release/net10.0/Calendar.Api.dll')], apiEnvironment, path.join(root, 'src/backend/Calendar.Api'), 'backend');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 2000).unref(); });
  child.kill();
  await stopped;
}

function launch(executable, args, env, cwd, label) {
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(reports, `${label}.log`), { flags: 'a' });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
  return child;
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
