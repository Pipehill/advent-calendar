import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { owner, recipient } from './calendar-fixture.mjs';

// Registered in the production-stack suite to share its isolated lifecycle.
export function registerCalendarCreationScenarios(environment) {
  for (const background of ['woodland', 'sleigh', 'playtime', 'aurora']) {
    test(`Given an assigned recipient and ${background}, When creation is submitted through the form, Then 24 persisted doors and the own-calendar link are available after refresh`, async () => {
      // Given an unrestricted owner on the dedicated creation page.
      const state = environment();
      const { page, accounts, signIn, frontendUrl } = state;
      await signIn(owner(accounts));
      await page.getByRole('link', { name: 'Lag ny kalender', exact: true }).click();
      const title = `Ærlig jul 🎄 ${background} ${randomUUID().slice(0, 5)}`;
      await page.getByLabel('Kalendernavn').fill(title);
      await page.getByLabel('Mottaker', { exact: true }).selectOption(recipient(accounts).id);
      await page.locator(`input[name=background][value=${background}]`).check();
      const response = page.waitForResponse(response => response.url().includes('/api/trpc/calendar.create') && response.request().method() === 'POST');

      // When the explicit creation action persists and navigates to administration.
      await page.getByRole('button', { name: 'Lag ny kalender', exact: true }).click();
      const result = await response;
      const calendar = (await result.json()).result.data;
      await page.waitForURL(`**/calendars/${calendar.id}`);
      const refreshed = await page.reload({ waitUntil: 'networkidle' });

      // Then SSR, persistence, ownership and the return list agree.
      assert.equal(result.status(), 200);
      assert.match(refreshed.headers()['cache-control'], /no-store/);
      assert.equal(calendar.background, background);
      assert.equal(calendar.ownerId, owner(accounts).id);
      assert.equal(calendar.recipientId, recipient(accounts).id);
      assert.equal(calendar.doors.length, 24);
      assert.equal(await page.locator('ol button').count(), 24);
      assert((await page.locator('h1').textContent()).includes(title));
      assert((await refreshed.text()).includes(title));
      assert.equal(await page.locator('input[type=number]').count(), 0);
      assert((await page.locator('ol').locator('..').getAttribute('style')).includes(`${background}.jpg`));
      await page.getByRole('link', { name: 'Min side', exact: true }).click();
      await page.getByRole('link', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).waitFor();
      await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    });
  }

  test('Given no eligible recipients, When the creation page loads, Then an actionable empty state replaces the form', async () => {
    // Given an owner and an empty backend-scoped recipient result.
    const { page, accounts, signIn } = environment();
    await signIn(owner(accounts));
    await page.route('**/api/trpc/calendar.recipients**', route => route.fulfill({ json: { result: { data: [] } } }));

    // When creation opens without assigned ordinary users.
    await page.getByRole('link', { name: 'Lag ny kalender', exact: true }).click();

    // Then no unassigned calendar can be submitted and account creation is available.
    await page.getByText('Du har ingen kalenderbrukere. Opprett en bruker først.', { exact: true }).waitFor();
    assert.equal(await page.locator('#calendar-title').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Lag ny kalenderbruker', exact: true }).count(), 1);
  });

  test('Given calendar creation failure, When submit is repeated while pending, Then one write is attempted and all selected values remain', async () => {
    // Given a completed creation form and a held failed mutation response.
    const { page, accounts, signIn } = environment();
    await signIn(owner(accounts));
    await page.getByRole('link', { name: 'Lag ny kalender', exact: true }).click();
    await page.getByLabel('Kalendernavn').fill('Behold kalenderen');
    await page.getByLabel('Mottaker', { exact: true }).selectOption(recipient(accounts).id);
    await page.locator('input[name=background][value=sleigh]').check();
    let writes = 0;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/trpc/calendar.create', async route => {
      writes++;
      await held;
      await route.fulfill({ status: 503, json: { error: { message: 'SERVICE_UNAVAILABLE', code: -32603, data: { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 } } } });
    });

    // When duplicate form submissions arrive before the first attempt fails.
    await page.getByRole('button', { name: 'Lag ny kalender', exact: true }).click();
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    release();
    await page.getByRole('alert').waitFor();

    // Then values are preserved with no automatic write retry or false navigation.
    assert.equal(writes, 1);
    assert.equal(await page.getByLabel('Kalendernavn').inputValue(), 'Behold kalenderen');
    assert.equal(await page.getByLabel('Mottaker', { exact: true }).inputValue(), recipient(accounts).id);
    assert.equal(await page.locator('input[name=background][value=sleigh]').isChecked(), true);
    assert.equal(new URL(page.url()).pathname, '/create-calendar');
  });

  test('Given an own-calendar list, When pages empty results and failures replace it, Then accessible states never keep stale cards', async () => {
    // Given an owner and two mocked metadata pages scoped to the calendar list alone.
    const { page, accounts, signIn } = environment();
    await signIn(owner(accounts));
    const section = page.getByRole('region', { name: /^Mine kalendere/ });
    const offsets = [];
    let mode = 'pages';
    await page.route('**/api/trpc/calendar.list**', async route => {
      const { offset } = JSON.parse(new URL(route.request().url()).searchParams.get('input'));
      offsets.push(offset);
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'SERVICE_UNAVAILABLE', code: -32603, data: { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 } } } });
      const calendars = mode === 'empty' ? [] : Array.from({ length: offset === 0 ? 12 : 1 }, (_, index) => ({ id: randomUUID(), title: `Calendar row ${offset + index + 1}`, year: 2026, background: 'woodland' }));
      await route.fulfill({ json: { result: { data: { calendars, totalCount: mode === 'empty' ? 0 : 13 } } } });
    });

    // When the list refreshes, navigates to its final page, then receives empty/error data.
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    await section.getByRole('link', { name: /^Calendar row 12 / }).waitFor();
    await section.getByRole('button', { name: 'Neste side', exact: true }).click();
    await section.getByRole('link', { name: /^Calendar row 13 / }).waitFor();
    assert.equal(await section.getByRole('button', { name: 'Neste side', exact: true }).isDisabled(), true);
    mode = 'empty';
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    await section.getByText('Du har ikke opprettet noen kalendere ennå.', { exact: true }).waitFor();
    mode = 'error';
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    await section.getByRole('alert').waitFor();

    // Then metadata from a previous page is gone and retry/navigation remain explicit.
    assert.equal(await section.locator('li').count(), 0);
    assert.equal(await section.getByRole('button', { name: 'Prøv igjen', exact: true }).count(), 1);
    assert.deepEqual(offsets, [0, 12, 12, 12]);
  });
}
