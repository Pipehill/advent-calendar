import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { capturePageErrors } from './page-errors.mjs';

export function registerRequiredPasswordSetupScenarios(environment) {
  for (const locale of ['nb', 'en']) {
    test(`Given a ${locale} restricted administrator on mobile, When keyboard setup submits only a new password, Then all old sessions end and fresh login permits voluntary change`, async () => {
      // Given the actual temporary-password login and a second restricted session.
      const state = environment();
      const setup = await openRequiredSetup(state, locale);
      const other = await state.context.browser().newContext();
      try {
        const secondLogin = await state.mutation('auth.login', setup.account, other.request);
        assert.equal(secondLogin.status(), 200);
        const field = setup.page.getByLabel(locale === 'nb' ? 'Nytt passord' : 'New password', { exact: true });
        assert.equal(await setup.page.locator('form input').count(), 1);
        assert.equal(await setup.page.locator('#currentPassword').count(), 0);
        assert.equal(await field.getAttribute('type'), 'password');
        assert.equal(await field.getAttribute('autocomplete'), 'new-password');
        assert.equal(await setup.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await setup.page.getByText(locale === 'nb' ? /Du bruker et midlertidig passord/ : /You are using a temporary password/).waitFor();

        // When keyboard navigation reaches submit after the only password field.
        const replacement = `Complete!${randomUUID()}`;
        await field.fill(replacement);
        await field.focus();
        await setup.page.keyboard.press('Tab');
        assert.equal(await setup.page.locator('button[type="submit"]').evaluate(button => button === document.activeElement), true);
        const completed = setupResponse(setup.page);
        await setup.page.keyboard.press('Enter');
        const response = await completed;
        await setup.page.waitForURL('**/login?changed=1');

        // Then the wire body contains only the replacement and every old session is denied.
        assert.equal(response.status(), 200);
        assert.deepEqual(response.request().postDataJSON(), { newPassword: replacement });
        assert.match(response.headers()['cache-control'], /no-store/);
        assert.equal(await setup.page.getByRole('status').textContent(), locale === 'nb'
          ? 'Passordet er byttet. Logg inn med det nye passordet.'
          : 'Your password has been changed. Sign in with your new password.');
        for (const request of [setup.context.request, other.request]) {
          assert.equal((await request.get(`${state.frontendUrl}/api/trpc/auth.session`)).status(), 401);
        }
        assert.equal((await state.mutation('auth.login', setup.account, other.request)).status(), 401);

        // When the replacement is used in a fresh browser login.
        await setup.page.getByLabel(locale === 'nb' ? 'Brukernavn' : 'Username', { exact: true }).fill(setup.account.username);
        await setup.page.getByLabel(locale === 'nb' ? 'Passord' : 'Password', { exact: true }).fill(replacement);
        await setup.page.getByRole('button', { name: locale === 'nb' ? 'Logg inn' : 'Log in', exact: true }).click();
        await setup.page.waitForURL('**/my-page');
        const session = await setup.context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);
        await setup.page.goto(`${state.frontendUrl}/change-password`, { waitUntil: 'networkidle' });

        // Then authority is unrestricted and voluntary change still asks for the current password.
        assert.equal((await session.json()).result.data.mustChangePassword, false);
        assert.equal(await setup.page.locator('form input').count(), 2);
        assert.equal(await setup.page.locator('#currentPassword').getAttribute('type'), 'password');
        assert.equal(await setup.page.locator('#currentPassword').getAttribute('autocomplete'), 'current-password');
        assert.deepEqual(setup.errors, [], 'No page or hydration errors');
      } finally {
        await other.close();
        await setup.context.close();
      }
    });

    test(`Given a ${locale} required setup form, When the same or a weak password is proposed, Then localized errors identify the new-password field and preserve restriction`, async () => {
      // Given an administrator signed in with its temporary password.
      const state = environment();
      const setup = await openRequiredSetup(state, locale);
      try {
        for (const proposal of [setup.account.password, 'Password123456!']) {
          // When an invalid proposal reaches the backend through keyboard submission.
          await setup.page.locator('#newPassword').fill(proposal);
          const rejected = setupResponse(setup.page);
          await setup.page.locator('#newPassword').press('Enter');
          const response = await rejected;
          await setup.page.locator('#newPassword[aria-invalid="true"]').waitFor();

          // Then the error remains attached to the sole masked field in the selected language.
          assert([400, 409].includes(response.status()));
          assert.deepEqual(response.request().postDataJSON(), { newPassword: proposal });
          assert.equal(await setup.page.locator('#newPassword').getAttribute('aria-describedby'), 'newPassword-error');
          assert.equal(await setup.page.locator('#newPassword-error').textContent(), locale === 'nb'
            ? 'Kontroller dette feltet.' : 'Check this field.');
          assert.equal(await setup.page.locator('#currentPassword').count(), 0);
          assert.equal(await setup.page.locator('#newPassword').getAttribute('type'), 'password');
          assert.equal(new URL(setup.page.url()).pathname, '/change-password');
          const session = await setup.context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);
          assert.equal((await session.json()).result.data.mustChangePassword, true);
        }
        assert.deepEqual(setup.errors, [], 'No page or hydration errors');
      } finally { await setup.context.close(); }
    });
  }
}

async function openRequiredSetup(state, locale) {
  await state.signIn(state.accounts.find(account => account.username === 'browser-superadmin'));
  const account = {
    name: 'Required setup administrator',
    username: `aa-required-${randomUUID().slice(0, 8)}`,
    password: `Temporary!${randomUUID()}`,
    role: 'calendarAdmin',
  };
  const created = await state.mutation('accounts.create', account);
  assert.equal(created.status(), 200);
  const context = await state.context.browser().newContext({ viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    capturePageErrors(page, errors);
    await state.signIn(account, '/change-password', page);
    if (locale !== 'nb') {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.getByRole('combobox').selectOption(locale),
      ]);
    }
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    return { account: { username: account.username, password: account.password }, context, page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}

function setupResponse(page) {
  return page.waitForResponse(response => response.url().includes('/api/trpc/auth.completePasswordSetup')
    && response.request().method() === 'POST');
}
