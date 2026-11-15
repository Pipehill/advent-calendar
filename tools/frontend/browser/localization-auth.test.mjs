import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalizedDocument, localizedBrowser, messages, selectLanguage } from './localization-fixture.mjs';

export function registerAuthenticationLocalizationScenarios(environment) {
  test('Given an authenticated My page, When English and Norwegian are selected before opening a missing owner calendar, Then SSR and hydrated errors preserve locale and public identity', async t => {
    // Given an existing owner account and a valid calendar identifier that does not exist.
    const state = environment();
    const reader = await localizedBrowser(state, t);
    const account = state.accounts.find(item => item.username === 'browser-admin');
    const id = '00000000-0000-4000-8000-000000000026';
    await state.signIn(account, '/my-page', reader.page);

    for (const locale of ['en', 'nb']) {
      // When the actual My page selector changes language before direct calendar navigation.
      const personal = await selectLanguage(reader.page, locale);
      const greeting = messages[locale].personal_greeting.replace('{name}', account.name);
      await assertLocalizedDocument(reader.page, personal, locale, greeting);
      const missing = await reader.page.goto(`${state.frontendUrl}/calendars/${id}`, { waitUntil: 'networkidle' });
      const html = await assertLocalizedDocument(reader.page, missing, locale, messages[locale].error_heading);
      const denied = await reader.context.request.get(`${state.frontendUrl}/api/trpc/calendar.get?input=${encodeURIComponent(JSON.stringify({ id }))}`);
      const session = await reader.context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);

      // Then the real 404 and translated error document retain the same session and locale.
      assert(html.includes(messages[locale].error_missing));
      await reader.page.getByText(messages[locale].error_missing, { exact: true }).waitFor();
      assert.equal(denied.status(), 404);
      for (const response of [personal, missing, denied, session]) {
        assert.match(response.headers()['cache-control'], /no-store/);
      }
      assert.equal((await session.json()).result.data.user.name, account.name);
      assert.equal((await reader.context.cookies()).find(cookie => cookie.name === 'PARAGLIDE_LOCALE')?.value, locale);
      assert.equal(new URL(reader.page.url()).pathname, `/calendars/${id}`);
      await reader.page.goto(`${state.frontendUrl}/my-page`, { waitUntil: 'networkidle' });
    }
  });

  for (const restricted of [false, true]) {
    test(`Given a ${restricted ? 'required' : 'voluntary'} password form, When English and Norwegian are selected, Then localized validation preserves session cookies CSRF and no-store`, async t => {
      // Given a real permanent or temporary administrator session in its password form.
      const state = environment();
      const reader = await localizedBrowser(state, t);
      const account = state.accounts.find(item => item.username === (restricted ? 'browser-restricted-admin' : 'browser-admin'));
      await state.signIn(account, restricted ? '/change-password' : '/my-page', reader.page);
      await reader.page.goto(`${state.frontendUrl}/change-password`, { waitUntil: 'networkidle' });
      const originalCookie = (await reader.context.cookies()).find(cookie => cookie.name === 'advent.auth');

      for (const locale of ['en', 'nb']) {
        // When the selector reloads protected SSR and an empty form requests validation.
        const response = await selectLanguage(reader.page, locale);
        await assertLocalizedDocument(reader.page, response, locale, messages[locale].password_change_title);
        await reader.page.getByText(messages[locale][restricted ? 'password_required' : 'password_change_help'], { exact: true }).waitFor();
        await reader.page.locator('button[type="submit"]').click();
        await reader.page.locator('#newPassword[aria-invalid="true"]').waitFor();

        // Then field errors and masking follow the locale without changing authentication.
        assert.match(response.headers()['cache-control'], /no-store/);
        assert.equal(await reader.page.locator('#newPassword-error').textContent(), messages[locale].auth_field_invalid);
        for (const field of restricted ? ['newPassword'] : ['currentPassword', 'newPassword']) {
          assert.equal(await reader.page.locator(`#${field}`).getAttribute('type'), 'password');
        }
        const currentCookie = (await reader.context.cookies()).find(cookie => cookie.name === 'advent.auth');
        assert.equal(currentCookie.value, originalCookie.value);
        assert.equal(currentCookie.httpOnly, true);
        assert.equal(currentCookie.sameSite, 'Lax');
        const sessionResponse = await reader.context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);
        assert.match(sessionResponse.headers()['cache-control'], /no-store/);
        const session = (await sessionResponse.json()).result.data;
        assert.deepEqual(session.user, { username: account.username, name: account.name, role: account.role });
        assert.equal(session.mustChangePassword, restricted);
      }

      // When logout is attempted without CSRF and then with a fresh principal-bound token.
      const denied = await reader.context.request.post(`${state.frontendUrl}/api/trpc/auth.logout`, { data: {} });
      const accepted = await state.mutation('auth.logout', undefined, reader.context.request);
      const ended = await reader.context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);

      // Then localization has preserved both the CSRF boundary and intentional session revocation.
      assert.equal(denied.status(), 400);
      assert.match(denied.headers()['cache-control'], /no-store/);
      assert.equal(accepted.status(), 200);
      assert.equal(ended.status(), 401);
    });
  }
}
