import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { owner } from './calendar-fixture.mjs';
import { prepareAssignments, fillLogin, deferred, waitForGate, fulfillAfterRelease } from './login-fixture.mjs';

export function registerLoginProgressScenarios(environment) {
  for (const locale of ['nb', 'en']) {
    test(`Given a ${locale} mobile login form, When login and document responses are delayed, Then values and accessible progress persist with one login write`, { timeout: 60000 }, async t => {
      // Given a real recipient login and independently controlled response boundaries.
      const loginRelease = deferred();
      const documentRelease = deferred();
      // Release intercepted requests before the fixture closes its browser context,
      // including when an assertion or the test deadline interrupts the scenario.
      t.after(() => { loginRelease.resolve(); documentRelease.resolve(); });
      const state = environment();
      const reader = await prepareAssignments(state, t, 0);
      await reader.page.setViewportSize({ width: 375, height: 812 });
      await reader.page.emulateMedia({ reducedMotion: 'reduce' });
      await fillLogin(reader, locale);
      await reader.page.addStyleTag({ content: 'input { caret-color: transparent !important; }' });
      const beforeUnload = deferred();
      const form = await observeLoginForm(reader.page, beforeUnload);
      const compositor = await reader.context.newCDPSession(reader.page);
      const login = deferred();
      const document = deferred();
      let writes = 0;
      await reader.page.route('**/api/trpc/auth.login', async route => {
        writes++;
        const response = await route.fetch();
        login.resolve(response);
        await fulfillAfterRelease(route, response, loginRelease, 'release the login response');
      });
      await reader.page.route('**/login-complete', async route => {
        const response = await route.fetch({ maxRedirects: 0 });
        document.resolve(response);
        await fulfillAfterRelease(route, response, documentRelease, 'release the destination document');
      });

      // When keyboard submission waits first for authentication and then for navigation.
      try {
        await reader.page.locator('#password').press('Enter', { noWaitAfter: true });
        const loginResponse = await waitForGate(login, 'receive the login response');
        const firstPendingState = await waitForGate({ promise: form.evaluate(element => element.captureLoginSnapshot()) }, 'inspect the pending login form');
        assertPendingLogin(reader, locale, firstPendingState);
        await submitRetainedForm(form);
        await reader.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const beforeNavigation = await captureLoginFrame(compositor, reader.reports, locale, 'response-pending');
        loginRelease.resolve();
        const documentResponse = await waitForGate(document, 'receive the destination document');
        const lastExecutableState = await waitForGate(beforeUnload, 'observe login document unload');
        assertPendingLogin(reader, locale, lastExecutableState);
        // Chromium suspends the old execution context during native navigation.
        // Compare compositor output to prove its visible form remains unchanged.
        const duringNavigation = await captureLoginFrame(compositor, reader.reports, locale, 'document-pending');

        // Then both phases retain masked values and no-store without another credential write.
        assert.equal(loginResponse.status(), 200);
        assert.match(loginResponse.headers()['cache-control'], /no-store/);
        assert.match(documentResponse.headers()['cache-control'], /no-store/);
        assert(beforeNavigation.equals(duringNavigation), 'The pending login viewport stays visually unchanged during document navigation');
        assert.equal(writes, 1);
        documentRelease.resolve();
        await reader.page.waitForURL(`${state.frontendUrl}/my-page`);
        await reader.page.waitForLoadState('networkidle');
        assert.equal(writes, 1);
        assert.equal(await reader.page.locator('#password').count(), 0);
        assert(!(await reader.page.content()).includes(reader.account.password));
      } finally {
        loginRelease.resolve();
        documentRelease.resolve();
      }
    });

    test(`Given a ${locale} login form, When credentials are rejected and corrected, Then values remain editable and a fresh retry succeeds`, async () => {
      // Given invalid credentials in the selected interface language.
      const state = environment();
      const account = { username: `missing-${randomUUID()}`, password: 'Wrong!ButMasked15' };
      const reader = { ...state, account };
      await fillLogin(reader, locale);
      const response = state.page.waitForResponse(item => item.url().includes('/api/trpc/auth.login'));

      // When the real login exchange rejects those credentials.
      await state.page.locator('#password').press('Enter');
      const rejected = await response;
      await state.page.getByRole('alert').filter({ hasText: locale === 'nb' ? /Kunne ikke logge inn/ : /Could not sign in/ }).waitFor();

      // Then both values are retained, masking remains and the submit action becomes editable.
      assert.equal(rejected.status(), 401);
      assert.equal(await state.page.locator('#username').inputValue(), account.username);
      assert.equal(await state.page.locator('#password').inputValue(), account.password);
      assert.equal(await state.page.locator('#password').getAttribute('type'), 'password');
      assert.equal(await state.page.locator('button[type="submit"]').isEnabled(), true);
      assert.equal(await state.page.locator('[data-login-spinner]').count(), 0);
      const administrator = owner(state.accounts);
      await state.page.locator('#username').fill(administrator.username);
      await state.page.locator('#password').fill(administrator.password);
      await state.page.locator('#password').press('Enter');
      await state.page.waitForURL(`${state.frontendUrl}/my-page`);
      await state.page.getByRole('heading', { name: new RegExp(administrator.name, 'u') }).waitFor();
    });
  }

  test('Given successful authentication followed by a session-service outage, When the fixed login-complete retry link is activated after recovery, Then navigation retries without replaying credentials', { timeout: 60000 }, async t => {
    // Given a real login whose first destination request encounters an unavailable backend.
    const state = environment();
    const reader = await prepareAssignments(state, t, 0);
    await fillLogin(reader, 'nb');
    let writes = 0;
    let documents = 0;
    let recovered = false;
    reader.page.on('request', request => {
      if (request.url().includes('/api/trpc/auth.login') && request.method() === 'POST') writes++;
    });
    await reader.page.route('**/login-complete', async route => {
      documents++;
      if (documents === 1) await state.stopApi();
      await route.continue();
    });

    // When session resolution fails after the login write, then the backend recovers.
    try {
      await reader.page.locator('#password').press('Enter');
      await reader.page.waitForURL(`${state.frontendUrl}/login-complete`);
      await reader.page.getByRole('alert').waitFor();
      const retry = reader.page.getByRole('link', { name: 'Prøv igjen', exact: true });
      assert.equal(await retry.getAttribute('href'), '/login-complete');
      assert.equal(await reader.page.locator('#password').count(), 0);
      await state.restartApi(false);
      recovered = true;
      await retry.click();
      await reader.page.waitForURL(`${state.frontendUrl}/my-page`);
      await reader.page.waitForLoadState('networkidle');

      // Then the GET link resolves navigation using the existing session with one login mutation.
      assert.equal(writes, 1);
      assert.equal(documents, 2);
      await reader.page.getByText('Du har ikke noen kalendere enda...', { exact: true }).waitFor();
      assert(!(await reader.page.content()).includes(reader.account.password));
    } finally {
      if (!recovered) await state.restartApi(false);
    }
  });
}

function assertPendingLogin(reader, locale, snapshot) {
  assert.equal(snapshot.isConnected, true);
  assert.equal(snapshot.username, reader.account.username);
  assert.equal(snapshot.password, reader.account.password);
  assert.equal(snapshot.passwordType, 'password');
  assert.equal(snapshot.disabled, true);
  assert.equal(snapshot.busy, 'true');
  assert.equal(snapshot.spinnerVisible, true);
  assert.equal(snapshot.animation, 'none');
  assert.equal(snapshot.status, locale === 'nb' ? 'Vennligst vent …' : 'Please wait …');
  assert.equal(snapshot.scrollOverflow, false);
}

async function observeLoginForm(page, beforeUnload) {
  // Snapshots stay in test-runner memory; password values are never logged or
  // written to artifacts. The binding observes the last executable DOM state.
  await page.exposeBinding('__reportLoginBeforeUnload', (_, snapshot) => beforeUnload.resolve(snapshot));
  return page.evaluateHandle(() => {
    const form = document.querySelector('form');
    form.captureLoginSnapshot = () => {
      const username = form.querySelector('#username');
      const password = form.querySelector('#password');
      const button = form.querySelector('button[type="submit"]');
      const spinner = form.querySelector('[data-login-spinner]');
      return {
        isConnected: form.isConnected,
        username: username.value,
        password: password.value,
        passwordType: password.type,
        disabled: button.disabled,
        busy: button.getAttribute('aria-busy'),
        spinnerVisible: !!spinner && spinner.getClientRects().length > 0
          && getComputedStyle(spinner).visibility !== 'hidden',
        animation: spinner ? getComputedStyle(spinner).animationName : null,
        status: form.querySelector('[role="status"]')?.textContent,
        scrollOverflow: document.documentElement.scrollWidth > innerWidth,
      };
    };
    window.addEventListener('beforeunload', () => {
      void window.__reportLoginBeforeUnload(form.captureLoginSnapshot());
    }, { once: true });
    return form;
  });
}

async function captureLoginFrame(compositor, reports, locale, phase) {
  const frame = await waitForGate({ promise: compositor.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  }) }, `capture the ${phase} compositor frame`);
  const bytes = Buffer.from(frame.data, 'base64');
  const directory = path.resolve(reports, '../../plan00024');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `login-${locale}-${phase}.png`), bytes);
  return bytes;
}

function submitRetainedForm(form) {
  return waitForGate({ promise: form.evaluate(element => element.requestSubmit()) }, 'resubmit the original login form');
}
