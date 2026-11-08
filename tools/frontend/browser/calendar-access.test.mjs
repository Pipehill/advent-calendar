import assert from 'node:assert/strict';
import { test } from 'node:test';
import { owner, create } from './calendar-fixture.mjs';

// Registered in the production-stack suite to share its isolated lifecycle.
export function registerCalendarAccessScenarios(environment) {
  test('Given owner and foreign sessions, When direct preview and mutation URLs are forged, Then BFF API and SSR keep content private', async () => {
    // Given a private owner calendar with distinctive stored text.
    const state = environment();
    const { page, accounts, signIn, frontendUrl, context, apiUrl, mutation } = state;
    await signIn(owner(accounts));
    const calendar = await create(state, 'Private calendar marker');
    await mutation('calendar.saveDoor', { id: calendar.id, number: 24, title: 'Secret-title-marker', text: 'Secret-message-marker' });

    // When another administrator tries direct SSR, BFF preview/edit and backend reads.
    await signIn(accounts.find(account => account.username === 'browser-admin-two'));
    const htmlResponse = await page.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });
    const html = await htmlResponse.text();
    const preview = await context.request.get(`${frontendUrl}/api/trpc/calendar.preview?input=${encodeURIComponent(JSON.stringify({ id: calendar.id }))}`);
    const edit = await mutation('calendar.saveDoor', { id: calendar.id, number: 24, title: 'Forged', text: 'Forged' });
    const direct = await context.request.get(`${apiUrl}/calendars/${calendar.id}`);

    // Then no layer exposes the private title/content, including hydration and errors.
    assert.equal(preview.status(), 404);
    assert.equal(edit.status(), 404);
    assert.equal(direct.status(), 404);
    assert(!html.includes('Secret-title-marker'));
    assert(!html.includes('Secret-message-marker'));
    assert.match(htmlResponse.headers()['cache-control'], /no-store/);
    await page.getByText('Vi fant ikke denne kalenderen.', { exact: true }).waitFor();
  });

  for (const username of ['browser-user-two', 'browser-superadmin', 'browser-restricted-admin']) {
    test(`Given ${username}, When calendar creation or preview is requested, Then route and BFF authority agree`, async () => {
      // Given a role or temporary session without calendar administration authority.
      const { page, accounts, signIn, frontendUrl, context } = environment();
      const account = accounts.find(item => item.username === username);
      await signIn(account, account.restricted ? '/change-password' : '/my-page');
      const id = '00000000-0000-4000-8000-000000000001';

      // When direct creation/preview routes and direct BFF reads bypass navigation controls.
      await page.goto(frontendUrl + '/create-calendar', { waitUntil: 'networkidle' });
      await page.goto(frontendUrl + '/calendar-preview/' + id, { waitUntil: 'networkidle' });
      const response = await context.request.get(`${frontendUrl}/api/trpc/calendar.preview?input=${encodeURIComponent(JSON.stringify({ id }))}`);

      // Then the role sees no protected calendar controls or content.
      assert.equal(new URL(page.url()).pathname, account.restricted ? '/change-password' : '/my-page');
      assert.equal(await page.locator('#calendar-title, #door-text, ol button').count(), 0);
      assert.equal(response.status(), 403);
    });
  }

  test('Given a calendar owner preview, When logout and replay occur, Then protected browser data is discarded and the session is revoked', async () => {
    // Given a valid owner preview with a stored calendar title.
    const state = environment();
    const { page, context, accounts, signIn, frontendUrl, apiUrl } = state;
    await signIn(owner(accounts));
    const calendar = await create(state, 'Logout private marker');
    await page.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });
    const cookie = (await context.cookies()).find(item => item.name === 'advent.auth');

    // When the owner logs out and the old backend cookie is replayed.
    await page.getByRole('button', { name: 'Logg ut', exact: true }).click();
    await page.waitForURL(frontendUrl + '/');
    const replay = await fetch(`${apiUrl}/calendars/${calendar.id}`, { headers: { Cookie: `advent.auth=${cookie.value}` } });
    await page.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });

    // Then the backend rejects replay and no private preview survives in the browser.
    assert.equal(replay.status, 401);
    assert.equal(new URL(page.url()).pathname, '/login');
    assert(!(await page.content()).includes('Logout private marker'));
  });
}
