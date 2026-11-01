import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

// Registered within the existing isolated production-stack suite and its lifecycle.
export function registerCalendarScenarios(environment) {
  const owner = accounts => accounts.find(account => account.username === 'browser-admin');
  const recipient = accounts => accounts.find(account => account.username === 'browser-user');
  const create = async (state, title = 'Prepared calendar') => {
    const response = await state.mutation('calendar.create', { title, recipientId: recipient(state.accounts).id, background: 'aurora' });
    assert.equal(response.status(), 200, await response.text());
    return (await response.json()).result.data;
  };

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

  test('Given future door content, When it is saved previewed randomized and refreshed in both languages, Then numbered content and the persisted order stay unchanged', async () => {
    // Given an owner calendar before any recipient opening is implemented.
    const state = environment();
    const { page, accounts, signIn, frontendUrl, reports } = state;
    await signIn(owner(accounts));
    const calendar = await create(state, 'Forberedelser 🎄');
    await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Luke 24', exact: true }).click();
    await page.getByLabel(/^Tittel på innhold/).fill('Ærlig gave 🎁');
    await page.getByLabel(/^Melding/).fill('<b>Ren tekst</b>\nGod jul, Ørn!');

    // When saving explicitly, changing layout once and opening privileged preview.
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await page.getByText('Endringene er lagret.', { exact: true }).waitFor();
    const randomSaved = page.waitForResponse(response => response.url().includes('/api/trpc/calendar.saveLayout'));
    await page.getByRole('button', { name: 'Tilfeldig', exact: true }).click();
    await randomSaved;
    await page.waitForFunction(() => document.querySelector('button[aria-pressed=true]')?.textContent.includes('Tilfeldig'));
    const order = await page.locator('ol button').allTextContents();
    await page.getByRole('link', { name: 'Forhåndsvis', exact: true }).click();
    await page.waitForURL(`**/calendar-preview/${calendar.id}`);
    await page.getByText('Eierens forhåndsvisning: alle luker er tilgjengelige.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Luke 24', exact: true }).click();
    await page.getByRole('heading', { name: 'Ærlig gave 🎁', exact: true }).waitFor();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.getByRole('combobox').selectOption('en'),
    ]);
    const refreshed = await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Door 24', exact: true }).click();

    // Then authored text is plain text, all doors can open and no read reshuffles layout.
    assert.match(refreshed.headers()['cache-control'], /no-store/);
    assert.deepEqual(await page.locator('ol button').allTextContents(), order);
    assert.equal(await page.getByRole('heading', { name: 'Ærlig gave 🎁', exact: true }).count(), 1);
    assert.equal(await page.getByText('<b>Ren tekst</b>\nGod jul, Ørn!', { exact: true }).count(), 1);
    assert.equal(await page.locator('main b').count(), 0);
    for (let number = 1; number <= 24; number++) {
      await page.getByRole('button', { name: `Door ${number}`, exact: true }).click();
      await page.getByRole('heading', { name: `Door ${number}`, exact: true }).waitFor();
    }
    await page.screenshot({ path: path.join(reports, 'calendar-preview-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: 'Back to administration', exact: true }).click();
    const chronologicalSaved = page.waitForResponse(response => response.url().includes('/api/trpc/calendar.saveLayout'));
    await page.getByRole('button', { name: 'Chronological', exact: true }).click();
    await chronologicalSaved;
    await page.waitForFunction(() => document.querySelector('button[aria-pressed=true]')?.textContent.includes('Chronological'));
    assert.deepEqual(await page.locator('ol button').allTextContents(), Array.from({ length: 24 }, (_, index) => String(index + 1)));
  });

  test('Given a failed door save, When the explicit action is retried, Then values remain and one write is sent per click', async () => {
    // Given an owner editing a calendar and a held failure response.
    const state = environment();
    const { page, accounts, signIn, frontendUrl } = state;
    await signIn(owner(accounts));
    const calendar = await create(state);
    await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    await page.getByLabel(/^Tittel på innhold/).fill('Behold denne');
    await page.getByLabel(/^Melding/).fill('Ikke mist meldingen\nÆøå');
    let writes = 0;
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/trpc/calendar.saveDoor', async route => {
      writes++;
      await pending;
      await route.fulfill({ status: 503, json: { error: { message: 'SERVICE_UNAVAILABLE', code: -32603, data: { code: 'SERVICE_UNAVAILABLE', httpStatus: 503 } } } });
    });

    // When repeated submits occur while the first save is pending and fails.
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('button[type=submit]')?.disabled);
    await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    release();
    await page.getByRole('alert').filter({ hasText: 'Kunne ikke lagre' }).waitFor();

    // Then no automatic retry occurs and the owner can explicitly save retained text.
    assert.equal(writes, 1);
    assert.equal(await page.getByLabel(/^Tittel på innhold/).inputValue(), 'Behold denne');
    assert.equal(await page.getByLabel(/^Melding/).inputValue(), 'Ikke mist meldingen\nÆøå');
    await page.unroute('**/api/trpc/calendar.saveDoor');
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await page.getByText('Endringene er lagret.', { exact: true }).waitFor();
  });

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

  test('Given a narrow touch screen, When an owner selects a future door and navigates by keyboard, Then all doors fit and controls retain visible focus', async () => {
    // Given an owned calendar and a touch context with the same valid session.
    const state = environment();
    const { page, accounts, signIn, frontendUrl, context, reports } = state;
    await signIn(owner(accounts));
    const calendar = await create(state);
    const touch = await context.browser().newContext({ storageState: await context.storageState(), viewport: { width: 375, height: 812 }, hasTouch: true, timezoneId: 'Pacific/Honolulu' });
    const mobile = await touch.newPage();
    try {
      // When the owner opens door 24 by touch and tabs into the editor.
      await mobile.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
      const door = mobile.getByRole('button', { name: 'Luke 24', exact: true });
      await door.tap();
      await mobile.getByRole('heading', { name: 'Rediger luke 24', exact: true }).waitFor();
      await door.focus();
      await mobile.keyboard.press('Tab');

      // Then all 24 readable controls fit and focus reaches the editable title.
      assert.equal(await mobile.locator('ol button').count(), 24);
      assert.equal(await mobile.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), 'Pacific/Honolulu');
      assert((await mobile.locator('h1').textContent()).includes(String(calendar.year)));
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await mobile.locator('#door-title').evaluate(element => element === document.activeElement), true);
      const bounds = await door.boundingBox();
      assert(bounds.width >= 44 && bounds.height >= 44);
      await mobile.screenshot({ path: path.join(reports, 'calendar-administration-mobile.png'), fullPage: true });
    } finally { await mobile.close(); await touch.close(); }
    await page.goto(frontendUrl + '/my-page');
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
