import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { owner, recipient } from './calendar-fixture.mjs';
import { dialog, door, prepare, read } from './recipient-opening.test.mjs';

async function independentOwner(state, t) {
  const context = await state.context.browser().newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await state.signIn(owner(state.accounts), '/my-page', page);
  return (operation, input) => state.mutation(operation, input, context.request);
}

export function registerRecipientRefreshScenarios(environment) {
  test('Given a newly created recipient with a permanent password, When assigned content is opened before and after an administrator reset, Then direct login and personal history survive the credential transition', async t => {
    // Given an owner-created permanent account and an assigned, populated past calendar.
    const state = environment();
    await state.signIn(owner(state.accounts));
    const account = { name: 'Cross-plan recipient', username: `assigned-${randomUUID().slice(0, 8)}`, password: `Initial!${randomUUID()}`, role: 'calendarUser' };
    const created = await state.mutation('accounts.create', account);
    assert.equal(created.status(), 200, await created.text());
    const user = (await created.json()).result.data;
    const response = await state.mutation('calendar.create', { title: 'Permanent password calendar', recipientId: user.id, background: 'woodland' });
    assert.equal(response.status(), 200, await response.text());
    const calendar = (await response.json()).result.data;
    assert.equal((await state.mutation('calendar.saveDoor', { id: calendar.id, number: 1, title: 'Assigned gift', text: 'Same recipient, new password' })).status(), 200);
    state.fixture('calendar-year', calendar.id, '2025');
    const context = await state.context.browser().newContext();
    t.after(() => context.close());
    const page = await context.newPage();
    const reader = { ...state, context, page };

    // When direct recipient login opens content, then a permanent reset revokes that session.
    await state.signIn(account, '/my-page', page);
    await page.getByRole('link', { name: /Permanent password calendar/ }).click();
    await door(page, 1).click();
    await dialog(page).waitFor();
    await page.getByRole('button', { name: 'Lukk', exact: true }).click();
    const firstSession = await read(reader, 'auth.session');
    const first = await read(reader, 'recipient.get', { id: calendar.id, scope: firstSession.cacheScope });
    const password = `Replacement!${randomUUID()}`;
    assert.equal((await state.mutation('accounts.resetPassword', { id: user.id, password })).status(), 200);
    const revoked = await context.request.get(`${state.frontendUrl}/api/trpc/auth.session`);
    await state.signIn({ ...account, password }, '/my-page', page);
    await page.getByRole('link', { name: /Permanent password calendar/ }).click();
    await door(page, 1).click();
    await dialog(page).waitFor();
    const nextSession = await read(reader, 'auth.session');
    const next = await read(reader, 'recipient.get', { id: calendar.id, scope: nextSession.cacheScope });

    // Then normal login needs no password-change detour and history stays bound to the same recipient.
    assert.equal(revoked.status(), 401);
    assert.equal(firstSession.mustChangePassword, false);
    assert.equal(nextSession.mustChangePassword, false);
    assert.equal(next.doors[0].openedAt, first.doors[0].openedAt);
    assert.equal(await door(page, 1).getAttribute('data-opened'), 'true');
  });

  test('Given a touch recipient device, When an available numbered door is tapped and closed, Then the modal opens and its green frame remains visible', async t => {
    // Given a browser context with actual touch/coarse-pointer emulation.
    const state = environment();
    const context = await state.context.browser().newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const touch = {
      ...state, context, page,
      signIn: (account, destination) => state.signIn(account, destination, page),
      mutation: (operation, input) => state.mutation(operation, input, context.request),
    };
    await prepare(touch, { random: true });

    // When the recipient taps an available flap and the visible close control.
    await door(page, 1).tap();
    await dialog(page).waitFor();
    await page.getByRole('button', { name: 'Lukk', exact: true }).tap();

    // Then touch opens/closes the modal without losing the durable opened cue.
    assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    assert.equal(await door(page, 1).getAttribute('data-opened'), 'true');
    assert.equal(await dialog(page).count(), 0);
  });

  test('Given a scheduled recipient board response, When its backend-relative timer expires, Then availability is refreshed without an implicit opening', async () => {
    // Given real available content and one simulated boundary response from the BFF.
    const state = environment();
    await prepare(state);
    let reads = 0;
    let writes = 0;
    await state.page.route('**/api/trpc/recipient.get*', async route => {
      const response = await route.fetch();
      const body = await response.json();
      reads++;
      if (reads === 1) {
        body.result.data.serverTime = '2026-12-01T05:59:59Z';
        body.result.data.nextOpeningAt = '2026-12-01T06:00:00Z';
        body.result.data.doors[0].state = 'locked';
      }
      await route.fulfill({ response, json: body });
    });
    state.page.on('request', request => { if (request.url().includes('recipient.open')) writes++; });

    // When the visible board receives a relative boundary and then re-reads the actual backend.
    await state.page.reload({ waitUntil: 'networkidle' });
    await state.page.waitForFunction(() => document.querySelector('[data-door-number="1"]')?.dataset.state === 'locked');
    await state.page.waitForFunction(() => document.querySelector('[data-door-number="1"]')?.dataset.state === 'available');

    // Then a server read changes the state while no content mutation occurs.
    assert(reads >= 2);
    assert.equal(writes, 0);
    assert.equal(await dialog(state.page).count(), 0);
  });

  test('Given an open recipient dialog, When another device empties the door, Then bounded refresh hides stale content while retaining its green history', async t => {
    // Given a visible authorized gift and an independently authenticated owner.
    const state = environment();
    await state.page.clock.install();
    const calendar = await prepare(state);
    const change = await independentOwner(state, t);
    await door(state.page, 1).click();
    await dialog(state.page).waitFor();

    // When the owner clears saved content and the browser's 30-second timer runs.
    const response = await change('calendar.saveDoor', { id: calendar.id, number: 1, title: '', text: '', imageAction: 'remove' });
    assert.equal(response.status(), 200, await response.text());
    await state.page.clock.fastForward(31_000);
    await dialog(state.page).waitFor({ state: 'hidden' });
    await state.page.waitForFunction(() => document.querySelector('[data-door-number="1"]')?.dataset.state === 'empty');

    // Then old title/message data is gone and history does not grant current opening permission.
    assert.equal(await state.page.getByText('Gave <b>ÆØÅ</b>', { exact: true }).count(), 0);
    assert.equal(await door(state.page, 1).getAttribute('data-opened'), 'true');
    assert.equal(await door(state.page, 1).getAttribute('aria-disabled'), 'true');
  });

  test('Given a visible recipient calendar, When another device reassigns it, Then reconnect removes the former recipient board and content', async t => {
    // Given current recipient access and an independent owner session.
    const state = environment();
    const calendar = await prepare(state);
    const change = await independentOwner(state, t);
    const account = await change('accounts.create', { name: 'Replacement recipient', username: `new-${randomUUID()}`, password: `Recipient!${randomUUID()}`, role: 'calendarUser' });
    assert.equal(account.status(), 200, await account.text());
    const next = (await account.json()).result.data;

    // When assignment changes and a returning connection revalidates the board.
    const reassigned = await change('calendar.saveRecipient', { id: calendar.id, recipientId: next.id });
    assert.equal(reassigned.status(), 200, await reassigned.text());
    await state.page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
    await state.page.locator('.door-tile').first().waitFor({ state: 'detached' });

    // Then neither board nor selected content remains under former assignment authority.
    assert.equal(await dialog(state.page).count(), 0);
    assert.equal(await state.page.getByText('Gave <b>ÆØÅ</b>', { exact: true }).count(), 0);
    const list = await read(state, 'recipient.list', { offset: 0, limit: 100, scope: calendar.scope });
    assert(!list.calendars.some(item => item.id === calendar.id));
  });

  test('Given a pending recipient opening, When repeated clicks and logout precede its delayed response, Then only one explicit write occurs and late content stays absent', async () => {
    // Given a real committed opening whose browser response is deliberately delayed.
    const state = environment();
    const calendar = await prepare(state, { image: true });
    let release;
    let received;
    const gate = new Promise(resolve => { release = resolve; });
    const committed = new Promise(resolve => { received = resolve; });
    let writes = 0;
    await state.page.route('**/api/trpc/recipient.open', async route => {
      writes++;
      const response = await route.fetch();
      received();
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });

    // When duplicate clicks are attempted before navigating away and logging out.
    await door(state.page, 1).click();
    await committed;
    await door(state.page, 1).dispatchEvent('click');
    await door(state.page, 2).dispatchEvent('click');
    await state.page.goto(`${state.frontendUrl}/my-page`, { waitUntil: 'networkidle' });
    await state.page.getByRole('button', { name: 'Logg ut', exact: true }).click();
    await state.page.waitForURL(state.frontendUrl + '/');
    release();

    // Then a late response cannot repopulate protected UI after the session is left.
    assert.equal(writes, 1);
    assert.equal(await dialog(state.page).count(), 0);
    assert.equal(await state.page.getByText('Gave <b>ÆØÅ</b>', { exact: true }).count(), 0);
    await state.signIn(recipient(state.accounts));
    await state.page.goto(`${state.frontendUrl}/my-calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    assert.equal(await door(state.page, 1).getAttribute('data-opened'), 'true');
  });
}
