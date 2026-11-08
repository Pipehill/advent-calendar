import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

export function registerPasswordLifecycleScenarios(environment) {
  for (const locale of ['nb', 'en']) {
    test(`Given a ${locale} superadmin creation form, When the selected role switches, Then password guidance and cleared drafts follow the role`, async () => {
      // Given the real creation page, localized before selecting an account type.
      const { page, accounts, signIn, frontendUrl } = environment();
      await signIn(accounts.find(account => account.username === 'browser-superadmin'));
      await page.getByRole('combobox').selectOption(locale);
      await page.waitForLoadState('networkidle');
      await page.goto(`${frontendUrl}/create-account`, { waitUntil: 'networkidle' });
      const field = page.locator('#account-password');

      // When ordinary-user creation switches to administrator and back.
      await page.getByLabel(locale === 'nb' ? 'Mottakerens passord' : "Recipient's password", { exact: true }).waitFor();
      await page.getByText(locale === 'nb' ? /beholde passordet, eller bytte det senere/ : /keep this password, or change it later/).waitFor();
      assert.equal(await page.getByText(/30 (minutes|minutter)/).count(), 0);
      await field.fill(`Draft!${randomUUID()}`);
      await page.locator('#account-role').selectOption('calendarAdmin');
      await page.getByLabel(locale === 'nb' ? 'Mottakerens midlertidige passord' : "Recipient's temporary password").waitFor();
      await page.getByText(/30 (minutes|minutter)/).waitFor();
      assert.equal(await field.inputValue(), '');
      await page.locator('#account-role').selectOption('calendarUser');

      // Then ordinary instructions return with private handover and no temporary/expiry claim.
      assert.equal(await page.getByText(/30 (minutes|minutter)/).count(), 0);
      await page.getByText(locale === 'nb' ? /Passordet vises ikke igjen/ : /password will not be displayed again/).waitFor();
      assert.equal(await field.getAttribute('type'), 'password');
    });

    for (const actorName of ['browser-admin', 'browser-superadmin']) {
      test(`Given a ${locale} ${actorName} and a new calendar user, When reset and voluntary change run, Then normal login and session revocation follow each permanent password`, { timeout: 60000 }, async () => {
        // Given a newly created ordinary user signed in directly at its personal page.
        const state = environment();
        const { page, context, accounts, signIn, mutation, frontendUrl } = state;
        const actor = accounts.find(account => account.username === actorName);
        await signIn(actor);
        const input = { name: 'Permanent recipient', username: `aa-password-${randomUUID().slice(0, 8)}`,
          password: `Initial!${randomUUID()}`, role: 'calendarUser',
          ...(actor.role === 'superadmin' ? { responsibleAdministratorId: accounts.find(account => account.username === 'browser-admin').id } : {}) };
        const { account, recipient, recipientPage } = await signInCreatedAccount(state, input, '/my-page');
        try {
          const initial = (await (await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).json()).result.data;
          assert.equal(initial.mustChangePassword, false);
          assert(Math.abs(Date.parse(initial.expiresAt) - Date.now() - 30 * 86400000) < 10000);

          // When the administrator resets with role-aware guidance, then the user voluntarily changes it.
          await openResetForm(state, account.id, locale);
          await page.getByText(locale === 'nb' ? /beholde passordet/ : /keep this password/).waitFor();
          assert.equal(await page.getByText(/30 (minutes|minutter)/).count(), 0);
          const replacement = `Replacement!${randomUUID()}`;
          await page.getByLabel(locale === 'nb' ? 'Mottakerens passord' : "Recipient's password", { exact: true }).fill(replacement);
          await page.getByRole('button', { name: locale === 'nb' ? 'Bekreft og lagre' : 'Confirm and save' }).click();
          await page.getByRole('status').filter({ hasText: locale === 'nb' ? 'Endringen er lagret' : 'The change was saved' }).waitFor();
          assert.equal((await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).status(), 401);
          assert.equal((await mutation('auth.login', { username: input.username, password: input.password }, recipient.request)).status(), 401);
          await signIn({ ...input, password: replacement }, '/my-page', recipientPage);
          await recipientPage.getByRole('combobox').selectOption(locale);
          await recipientPage.waitForLoadState('networkidle');
          await recipientPage.getByRole('link', { name: locale === 'nb' ? 'Bytt passord' : 'Change password', exact: true }).click();
          await recipientPage.locator('#currentPassword').fill(replacement);
          const voluntary = `Voluntary!${randomUUID()}`;
          await recipientPage.locator('#newPassword').fill(voluntary);
          await recipientPage.getByRole('button', { name: locale === 'nb' ? 'Bytt passord' : 'Change password', exact: true }).click();
          await recipientPage.waitForURL('**/login?changed=1');

          // Then both replacements require fresh login, while the acting administrator stays signed in.
          assert.equal((await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).status(), 401);
          const fresh = await mutation('auth.login', { username: input.username, password: voluntary }, recipient.request);
          assert.equal(fresh.status(), 200);
          assert.equal((await fresh.json()).result.data.mustChangePassword, false);
          const actorSession = (await (await context.request.get(`${frontendUrl}/api/trpc/auth.session`)).json()).result.data;
          assert.equal(actorSession.user.username, actor.username);
          assert(!(await page.content()).includes(replacement));
          assert.equal(await page.locator('#account-password').count(), 0);
        } finally { await recipient.close(); }
      });
    }

    test(`Given a ${locale} temporary calendar administrator, When superadmin resets its password, Then setup restrictions and private handover still apply`, async () => {
      // Given an API-created administrator with a restricted setup session.
      const state = environment();
      const { page, accounts, signIn, frontendUrl } = state;
      await signIn(accounts.find(account => account.username === 'browser-superadmin'));
      const input = { name: 'Temporary administrator', username: `aa-setup-${randomUUID().slice(0, 8)}`,
        password: `Setup!${randomUUID()}`, role: 'calendarAdmin' };
      const { account, recipient, recipientPage: setup } = await signInCreatedAccount(state, input, '/change-password');
      try {

        // When a new administrator password is supplied through the actual reset form.
        await openResetForm(state, account.id, locale);
        const temporary = page.getByLabel(locale === 'nb' ? 'Mottakerens midlertidige passord' : "Recipient's temporary password");
        await temporary.waitFor();
        await page.getByText(/30 (minutes|minutter)/).waitFor();
        assert.equal(await page.getByText(locale === 'nb' ? /beholde passordet/ : /keep this password/).count(), 0);
        const replacement = `Administrator!${randomUUID()}`;
        await temporary.fill(replacement);
        await page.getByRole('button', { name: locale === 'nb' ? 'Bekreft og lagre' : 'Confirm and save' }).click();
        await page.getByRole('status').filter({ hasText: locale === 'nb' ? 'Endringen er lagret' : 'The change was saved' }).waitFor();
        const revoked = await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`);
        await signIn({ ...input, password: replacement }, '/change-password', setup);
        await setup.goto(`${frontendUrl}/my-page`, { waitUntil: 'networkidle' });

        // Then reset revokes the old session and never grants ordinary/admin access before setup.
        assert.equal(revoked.status(), 401);
        assert.equal(new URL(setup.url()).pathname, '/change-password');
        const session = (await (await recipient.request.get(`${frontendUrl}/api/trpc/auth.session`)).json()).result.data;
        assert.equal(session.mustChangePassword, true);
        assert(Date.parse(session.expiresAt) <= Date.now() + 10 * 60000);
      } finally { await recipient.close(); }
    });
  }
}

async function signInCreatedAccount(state, input, destination) {
  const created = await state.mutation('accounts.create', input);
  assert.equal(created.status(), 200);
  const account = (await created.json()).result.data;
  const recipient = await state.context.browser().newContext();
  try {
    const recipientPage = await recipient.newPage();
    recipientPage.setDefaultTimeout(10000);
    recipientPage.setDefaultNavigationTimeout(10000);
    await state.signIn(input, destination, recipientPage);
    return { account, recipient, recipientPage };
  } catch (error) {
    await recipient.close();
    throw error;
  }
}

async function openResetForm(state, id, locale) {
  await state.context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: state.frontendUrl }]);
  await state.page.goto(`${state.frontendUrl}/my-page`, { waitUntil: 'networkidle', timeout: 10000 });
  await state.page.locator(`[data-account-id="${id}"] button`).click();
  await state.page.getByRole('menuitem', { name: locale === 'nb' ? 'Tilbakestill passord' : 'Reset password', exact: true }).click();
}
