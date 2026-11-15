import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalizedDocument, localizedBrowser, messages, selectLanguage } from './localization-fixture.mjs';

export function registerAuthenticationLocalizationScenarios(environment) {
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
        for (const field of ['currentPassword', 'newPassword']) {
          assert.equal(await reader.page.locator(`#${field}`).getAttribute('type'), 'password');
        }
        const currentCookie = (await reader.context.cookies()).find(cookie => cookie.name === 'advent.auth');
        assert.equal(currentCookie.value, originalCookie.value);
        assert.equal(currentCookie.httpOnly, true);
        assert.equal(currentCookie.sameSite, 'Lax');
        const sessionResponse = await reader.context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);
        assert.match(sessionResponse.headers()['cache-control'], /no-store/);
        const session = (await sessionResponse.json()).result.data;
        assert.equal(session.user.id, account.id);
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
