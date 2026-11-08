import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { create, owner } from './calendar-fixture.mjs';

export function registerDoorImageSecurityScenarios(environment) {
  test('Given a door image HTTP boundary, When oversized direct and batched uploads are sent, Then protected 413 errors preserve saved content', async () => {
    // Given saved image/text content through real Kestrel and production Nitro.
    const state = environment();
    const { context, frontendUrl, apiUrl } = state;
    await state.signIn(owner(state.accounts));
    const calendar = await create(state);
    const apiPath = `${apiUrl}/calendars/${calendar.id}/doors/1`;
    const token = (await (await context.request.get(`${apiUrl}/auth/csrf`)).json()).requestToken;
    const headers = { 'X-CSRF-TOKEN': token };
    const jpeg = fs.readFileSync(new URL('../../../src/frontend/public/images/calendars/woodland.jpg', import.meta.url));
    const saved = await context.request.put(apiPath, { headers,
      data: { title: 'Preserve this', text: 'Original', imageAction: 'replace', imageData: jpeg.toString('base64') },
    });
    assert.equal(saved.status(), 200, await saved.text());
    const before = await saved.json();

    // When actual HTTP bypasses browser checks and aggregate batches exceed the body boundary.
    const body = JSON.stringify({ title: 'Changed', text: '', imageAction: 'replace', imageData: 'A'.repeat(14_000_001) });
    const direct = await context.request.put(apiPath, { headers: { ...headers, 'Content-Type': 'application/json' }, data: body });
    const bff = await context.request.post(`${frontendUrl}/api/trpc/calendar.saveDoor`, { headers: { 'Content-Type': 'application/json' }, data: body });
    const batch = await context.request.post(`${frontendUrl}/api/trpc/calendar.saveDoor,calendar.saveDoor?batch=1`, {
      headers: { 'Content-Type': 'application/json' }, data: `{"0":${body},"1":${body}}`,
    });
    const csrfDenied = await context.request.put(apiPath, { data: { title: 'Changed', text: '', imageAction: 'remove' } });
    const after = await (await context.request.get(`${apiUrl}/calendars/${calendar.id}`)).json();

    // Then independent body/CSRF boundaries reject writes without changing bytes or modification time.
    for (const response of [direct, bff, batch]) {
      assert.equal(response.status(), 413, await response.text());
      assert.match(response.headers()['cache-control'], /no-store/);
    }
    assert.equal(csrfDenied.status(), 400);
    assert.equal(after.lastModifiedAt, before.lastModifiedAt);
    assert.deepEqual(after.doors[0], before.doors[0]);
  });

  test('Given a door image late response, When the selected door changes before bytes return, Then the old payload cannot populate the new door', async () => {
    // Given two saved images and a deliberately held query for door 2.
    const state = environment();
    const { page } = state;
    await state.signIn(owner(state.accounts));
    const calendar = await create(state);
    const imageData = fs.readFileSync(new URL('../../../src/frontend/public/images/calendars/woodland.jpg', import.meta.url)).toString('base64');
    for (const number of [1, 2]) {
      const result = await state.mutation('calendar.saveDoor', { id: calendar.id, number, title: `Image ${number}`, text: '', imageAction: 'replace', imageData });
      assert.equal(result.status(), 200, await result.text());
    }
    await page.goto(`${state.frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    let release;
    let started;
    const held = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { started = resolve; });
    await page.route('**/api/trpc/calendar.image?**', async route => {
      const input = JSON.parse(new URL(route.request().url()).searchParams.get('input'));
      if (input.number !== 2) return route.continue();
      const response = await route.fetch();
      started();
      await held;
      await route.fulfill({ response });
    });

    // When switching to an empty numbered door before the previous bytes are released.
    await page.getByRole('button', { name: 'Luke 2', exact: true }).click();
    await requested;
    await page.getByRole('button', { name: 'Luke 3', exact: true }).click();
    release();
    await page.waitForLoadState('networkidle');

    // Then the late image never appears in the new editor or its draft.
    assert.equal(await page.getByRole('heading', { name: 'Rediger luke 3', exact: true }).count(), 1);
    assert.equal(await page.locator('[aria-labelledby=selected-door-heading] img').count(), 0);
    assert.equal(await page.getByLabel(/^Tittel på innhold/).inputValue(), '');
  });
}
