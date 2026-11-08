import assert from 'node:assert/strict';
import { test } from 'node:test';

export function registerCredentialTransportScenarios(environment) {
  test('Given a credential form before hydration, When native submission occurs, Then credentials use POST and stay out of the URL', async () => {
    // Given an SSR login form with JavaScript disabled and deliberately fake credentials.
    const { context, frontendUrl } = environment();
    const noScript = await context.browser().newContext({ javaScriptEnabled: false });
    const login = await noScript.newPage();
    try {
      await login.goto(`${frontendUrl}/login`);
      await login.getByLabel('Brukernavn').fill('not-a-real-account');
      await login.getByLabel('Passord', { exact: true }).fill('not-a-real-password');

      // When the browser submits the native form without a React handler.
      const submission = login.waitForRequest(request => request.isNavigationRequest() && request.url().includes('/login'));
      await login.getByRole('button', { name: 'Logg inn', exact: true }).click();
      const request = await submission;

      // Then credentials stay in the POST body rather than entering URLs or history.
      assert.equal(request.method(), 'POST');
      assert.equal(new URL(request.url()).search, '');
      assert(!request.url().includes('not-a-real'));
    } finally { await noScript.close(); }
  });
}
