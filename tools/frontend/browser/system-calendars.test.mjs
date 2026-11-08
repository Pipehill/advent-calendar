import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { create, owner, recipient, logout, sessionCookie } from './calendar-fixture.mjs';
import { measureDoors, assertDoorGeometry } from './calendar-layout-assertions.mjs';

const superadmin = accounts => accounts.find(account => account.username === 'browser-superadmin');
const query = async (state, operation, input) => state.context.request.get(`${state.frontendUrl}/api/trpc/calendar.${operation}?input=${encodeURIComponent(JSON.stringify(input))}`);
const data = async response => { assert.equal(response.status(), 200, await response.text()); return (await response.json()).result.data; };
const overview = async state => {
  await state.signIn(superadmin(state.accounts));
  await state.page.getByRole('tab', { name: 'Kalendere', exact: true }).click();
  await state.page.getByRole('heading', { name: /^Alle kalendere/ }).waitFor();
};
async function assertEmptyOverview(page) {
  await page.getByText('Det finnes ingen kalendere på denne siden.', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Alle kalendere (0)', exact: true }).count(), 1);
  assert.equal(await page.getByText('Side 1 av 1', { exact: true }).count(), 1);
}

export function registerSystemCalendarScenarios(environment) {
  test('Given superadmin with no calendars, When the Calendars tab opens, Then an explicit empty page replaces the Users controls', async () => {
    // Given an isolated database that has accounts but no calendars yet.
    const state = environment();

    // When switching away from the default Users tab.
    await overview(state);

    // Then only one associated panel is accessible and its empty total/page are explicit.
    const { page } = state;
    await assertEmptyOverview(page);
    assert.equal(await page.getByRole('tabpanel').count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Opprett konto', exact: true }).count(), 0);
  });

  test('Given superadmin tabs, When pointer arrows Home and End switch panels and language, Then focus selection and existing user actions remain accessible', async () => {
    // Given the default user-management view.
    const { page, accounts, signIn } = environment();
    await signIn(superadmin(accounts));
    const users = page.getByRole('tab', { name: 'Brukere', exact: true });
    const calendars = page.getByRole('tab', { name: 'Kalendere', exact: true });

    // When switching by keyboard and pointer, including wrapping and endpoint keys.
    await users.focus();
    for (const [key, selected] of [
      ['ArrowRight', calendars], ['ArrowRight', users], ['End', calendars],
      ['Home', users], ['ArrowLeft', calendars],
    ]) {
      await page.keyboard.press(key);
      assert.equal(await selected.getAttribute('aria-selected'), 'true');
      assert.equal(await page.getByRole('tabpanel').count(), 1);
    }
    assert.equal(await calendars.evaluate(element => element.matches(':focus-visible')), true);
    assert.equal(await page.locator('#overview-panel-users [data-account-id]').count(), 0);
    await users.click();
    await page.getByRole('link', { name: 'Opprett konto', exact: true }).waitFor();
    await calendars.click();
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('combobox').selectOption('en')]);

    // Then localized tabs retain selected panel state and user management is still reachable.
    assert.equal(await page.getByRole('tab', { name: 'Calendars', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Users', exact: true }).click();
    await page.getByRole('link', { name: 'Create account', exact: true }).waitFor();
    assert.equal(await page.getByRole('tabpanel').count(), 1);
  });

  test('Given calendars across owners, When superadmin paginates refreshes and views a narrow screen, Then current names usernames and all totals remain correct', async () => {
    // Given more than one page from two owners with the fixture's long Unicode recipient name.
    const state = environment();
    const { page, accounts, signIn, mutation } = state;
    await signIn(owner(accounts));
    for (let number = 1; number <= 13; number++) await create(state, `Oversikt 🎄 ${number}`);
    const otherOwner = accounts.find(account => account.username === 'browser-admin-two');
    const otherRecipient = accounts.find(account => account.username === 'browser-user-two');
    await signIn(otherOwner);
    await data(await mutation('calendar.create', { title: 'Annen kalender', recipientId: otherRecipient.id, background: 'sleigh' }));

    // When refreshing protected SSR, paging both ways and scrolling the table by keyboard.
    await overview(state);
    const initial = await data(await query(state, 'systemList', { offset: 0, limit: 12 }));
    const response = await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('table').waitFor();
    assert.match(response.headers()['cache-control'], /no-store/);
    const rows = page.locator('tbody tr');
    assert.equal(await rows.count(), 12);
    const html = await response.text();
    assert(html.includes('Oversikt'));
    for (const identity of [owner(accounts).name, owner(accounts).username, recipient(accounts).username, otherOwner.name, otherRecipient.username]) assert((await page.getByRole('table').textContent()).includes(identity));
    assert.equal(await page.getByRole('columnheader').count(), 5);
    assert.equal(await page.getByRole('heading', { name: `Alle kalendere (${initial.totalCount})`, exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Neste side', exact: true }).click();
    await page.getByText('Side 2 av 2', { exact: true }).waitFor();
    assert.equal(await rows.count(), initial.totalCount - 12);
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    await page.getByText('Side 2 av 2', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Forrige side', exact: true }).click();
    await page.getByText('Side 1 av 2', { exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 812 });
    const scroll = page.getByRole('region', { name: 'Alle kalendere', exact: true });
    await scroll.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.activeElement.scrollLeft > 0);

    // Then the table scrolls independently without widening the page or losing readable account text.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    fs.mkdirSync('quality-reports/plan00017', { recursive: true });
    await page.screenshot({ path: path.resolve('quality-reports/plan00017/overview-mobile.png'), fullPage: true });
    assert.equal(new URL(page.url()).pathname, '/my-page');
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'calendars');
  });

  test('Given a system overview request, When loading fails and is retried before becoming empty, Then status feedback and recovery never retain stale rows', async () => {
    // Given actual persisted metadata and a controllable browser read transport.
    const state = environment();
    const { page, accounts, signIn } = state;
    await signIn(superadmin(accounts));
    const original = await data(await query(state, 'systemList', { offset: 0, limit: 12 }));
    let mode = 'held';
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/trpc/calendar.systemList**', async route => {
      if (mode === 'held') await held;
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'SERVICE_UNAVAILABLE', code: -32603, data: { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 } } } });
      return route.fulfill({ json: { result: { data: mode === 'empty' ? { calendars: [], totalCount: 0 } : original } } });
    });

    // When pending data succeeds, a refresh fails, retry succeeds and a later refresh is empty.
    await page.getByRole('tab', { name: 'Kalendere', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Henter kalenderen' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).isDisabled(), true);
    release();
    await page.getByRole('table').waitFor();
    mode = 'error';
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('tbody tr').count(), 0);
    mode = 'success';
    await page.getByRole('button', { name: 'Prøv igjen', exact: true }).click();
    await page.getByRole('table').waitFor();
    mode = 'empty';
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    // Then empty state replaces every old row/count while authorized retry stays explicit.
    await assertEmptyOverview(page);
  });

  for (const layout of ['chronological', 'random']) {
    test(`Given ${layout} and all saved doors, When superadmin previews by keyboard in both languages and screen sizes, Then content and geometry persist without writes`, async () => {
      // Given an owner calendar with all 24 distinctive doors and a persisted layout.
      const state = environment();
      const { page, accounts, signIn, mutation, frontendUrl } = state;
      await signIn(owner(accounts));
      const calendar = await create(state, `Read-only ${layout} 🎄`);
      for (let number = 1; number <= 24; number++) await data(await mutation('calendar.saveDoor', { id: calendar.id, number, title: `Gave ${number} ÆØÅ`, text: `<b>Plain ${number}</b>\nOriginal message` }));
      const before = await data(await mutation('calendar.saveLayout', { id: calendar.id, layout }));
      await page.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });
      const ownerGeometry = await measureDoors(page);
      await overview(state);
      const preview = page.getByRole('link', { name: `Forhåndsvis ${calendar.title}`, exact: true });
      let writes = 0;
      page.on('request', request => { if (request.method() !== 'GET' && /calendar\./.test(request.url())) writes++; });

      // When entering preview with Enter, reading every door, refreshing and changing language/width.
      await preview.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(`**/calendar-preview/${calendar.id}`);
      const response = await page.reload({ waitUntil: 'networkidle' });
      assert.match(response.headers()['cache-control'], /no-store/);
      assert.deepEqual(await measureDoors(page), ownerGeometry);
      for (let number = 1; number <= 24; number++) {
        await page.getByRole('button', { name: `Luke ${number}`, exact: true }).click();
        await page.getByRole('heading', { name: `Gave ${number} ÆØÅ`, exact: true }).waitFor();
      }
      assert.equal(await page.locator('form, fieldset, #door-title, #door-text').count(), 0);
      assert.equal(await page.locator(`a[href="/calendars/${calendar.id}"]`).count(), 0);
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('combobox').selectOption('en')]);
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByRole('button', { name: 'Door 24', exact: true }).click();
        assertDoorGeometry(await measureDoors(page), layout);
        assert.equal(await page.getByRole('heading', { name: 'Gave 24 ÆØÅ', exact: true }).count(), 1);
        assert.equal(await page.locator('[aria-labelledby="selected-door-heading"] b').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.resolve(`quality-reports/plan00017/preview-${layout}-${width}.png`), fullPage: true });
      }
      const after = await data(await query(state, 'systemPreview', { id: calendar.id }));
      await page.getByRole('link', { name: 'Back to calendar overview', exact: true }).click();

      // Then all data is unchanged and return navigation restores the Calendars tab.
      assert.deepEqual(after, before);
      assert.equal(writes, 0);
      assert.equal(await page.getByRole('tab', { name: 'Calendars', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.getByRole('link', { name: 'Create account', exact: true }).count(), 0);
    });
  }

  test('Given superadmin preview, When owner routes and writes are forged through BFF and API, Then read authority never grants editing', async () => {
    // Given an owner-created calendar and a validated superadmin session.
    const state = environment();
    const { page, context, accounts, signIn, frontendUrl, apiUrl, mutation } = state;
    await signIn(owner(accounts));
    const calendar = await create(state, 'System authority marker');
    await overview(state);
    const before = await data(await query(state, 'systemPreview', { id: calendar.id }));

    // When bypassing UI controls with direct editor URLs and CSRF-protected writes.
    await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/my-page');
    await page.goto(frontendUrl + '/create-calendar', { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/my-page');
    const csrf = await (await context.request.get(apiUrl + '/auth/csrf')).json();
    const operations = [
      ['calendar.create', { title: 'Denied', recipientId: recipient(accounts).id, background: 'woodland' }, '/calendars', 'post'],
      ['calendar.saveDoor', { id: calendar.id, number: 24, title: 'Denied', text: 'Denied' }, `/calendars/${calendar.id}/doors/24`, 'put'],
      ['calendar.saveLayout', { id: calendar.id, layout: 'random' }, `/calendars/${calendar.id}/layout`, 'put'],
      ['calendar.saveRecipient', { id: calendar.id, recipientId: recipient(accounts).id }, `/calendars/${calendar.id}/recipient`, 'put'],
    ];
    const results = [];
    for (const [operation, input, apiPath, method] of operations) {
      results.push(await mutation(operation, input));
      const { id: _id, number: _number, ...body } = input;
      results.push(await context.request[method](apiUrl + apiPath, { headers: { [csrf.headerName]: csrf.requestToken }, data: body }));
    }
    const after = await data(await query(state, 'systemPreview', { id: calendar.id }));

    // Then every write is denied with no-store and the saved aggregate stays identical.
    for (const response of results) { assert.equal(response.status(), 403); assert.match(response.headers()['cache-control'], /no-store/); }
    assert.deepEqual(after, before);
    assert.equal(await page.locator('form, ol button').count(), 0);
  });

  test('Given non-superadmin sessions, When system reads and preview SSR are requested concurrently, Then neither metadata nor future content crosses sessions', async () => {
    // Given one private calendar and independent caller contexts including anonymous and restricted sessions.
    const state = environment();
    const { page, context, accounts, signIn, frontendUrl, apiUrl, mutation } = state;
    await signIn(owner(accounts));
    const calendar = await create(state, 'Concurrent system private marker');
    await mutation('calendar.saveDoor', { id: calendar.id, number: 24, title: 'System future marker', text: 'Private future message' });

    // When each role bypasses UI gates at the BFF, API and SSR boundaries.
    for (const username of [null, 'browser-admin-two', 'browser-user-two', 'browser-system-temporary']) {
      const isolated = await context.browser().newContext();
      const target = await isolated.newPage();
      try {
        const account = accounts.find(item => item.username === username);
        if (account) await signIn(account, account.restricted ? '/change-password' : '/my-page', target);
        const expected = account ? 403 : 401;
        const input = encodeURIComponent(JSON.stringify({ id: calendar.id }));
        const responses = await Promise.all([
          isolated.request.get(`${frontendUrl}/api/trpc/calendar.systemList?input=${encodeURIComponent(JSON.stringify({ offset: 0, limit: 12 }))}`),
          isolated.request.get(`${frontendUrl}/api/trpc/calendar.systemPreview?input=${input}`),
          isolated.request.get(`${apiUrl}/administration/calendars/${calendar.id}/preview`),
        ]);
        for (const response of responses) { assert.equal(response.status(), expected); assert.match(response.headers()['cache-control'], /no-store/); }
        const denied = await target.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });
        const html = await denied.text();
        assert(!html.includes('System future marker'));
        assert(!html.includes('Private future message'));
        assert.match(denied.headers()['cache-control'], /no-store/);
        assert.equal(await target.getByRole('tab').count(), 0);
      } finally { await isolated.close(); }
    }
    assert.equal(await page.getByRole('tab').count(), 0);
  });

  test('Given cached system rows and preview, When superadmin is revoked or logs out and switches account, Then browser and SSR discard previous authority', async () => {
    // Given a real system overview with previously authorized rows.
    const state = environment();
    const { page, context, accounts, signIn, frontendUrl, apiUrl, revoke } = state;
    await overview(state);
    const calendar = (await data(await query(state, 'systemList', { offset: 0, limit: 12 }))).calendars[0];

    // When a revoked list refresh fails, followed by a new preview session and logout/account switch.
    revoke(superadmin(accounts).username);
    await page.getByRole('button', { name: 'Oppdater kalendere', exact: true }).click();
    await page.waitForURL('**/login');
    assert.equal(await page.locator('tbody tr').count(), 0);
    await signIn(superadmin(accounts));
    await page.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });
    const cookie = await sessionCookie(context);
    await logout(page, frontendUrl);
    const replay = await fetch(`${apiUrl}/administration/calendars/${calendar.id}/preview`, { headers: { Cookie: `advent.auth=${cookie.value}` } });
    await signIn(accounts.find(account => account.username === 'browser-user-two'));
    await page.goto(`${frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });

    // Then replay and changed authority cannot retain any calendar data or privileged tab.
    assert.equal(replay.status, 401);
    assert.equal(new URL(page.url()).pathname, '/my-page');
    assert(!(await page.content()).includes(calendar.title));
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(await page.locator('ol button, tbody tr').count(), 0);
  });
}
