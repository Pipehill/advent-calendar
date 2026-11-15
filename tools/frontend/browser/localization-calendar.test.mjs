import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { owner } from './calendar-fixture.mjs';
import { localizedBrowser, messages, selectLanguage, ssrState } from './localization-fixture.mjs';

export function registerCalendarLocalizationScenarios(environment) {
  test('Given authored Unicode calendar content and independent owner and recipient sessions, When both interface languages are selected, Then authored values and access remain unchanged', async t => {
    // Given one permanent recipient and saved, available Unicode door content.
    const state = environment();
    await state.signIn(owner(state.accounts));
    const account = { name: 'Åse 日本語 🎄', username: `locale-${randomUUID().slice(0, 8)}`, password: `Recipient!${randomUUID()}`, role: 'calendarUser' };
    const created = await state.mutation('accounts.create', account);
    assert.equal(created.status(), 200);
    const user = (await created.json()).result.data;
    const title = 'Gaver fra Åse 日本語 🎄';
    const door = { number: 1, title: 'Blåbær og snø 🎁', text: 'God jul!\nLinje to – æøå 日本語 🎄' };
    const response = await state.mutation('calendar.create', { title, recipientId: user.id, background: 'aurora' });
    assert.equal(response.status(), 200);
    const calendar = (await response.json()).result.data;
    assert.equal((await state.mutation('calendar.saveDoor', { id: calendar.id, ...door })).status(), 200);
    state.fixture('calendar-year', calendar.id, '2025');
    const before = await preview(state, calendar.id);
    const writes = [];
    state.page.on('request', request => { if (request.url().includes('/api/trpc/calendar.save')) writes.push(request.url()); });
    await state.page.goto(`${state.frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });

    for (const locale of ['en', 'nb']) {
      // When owner preview reloads in the selected language.
      const document = await selectLanguage(state.page, locale);

      // Then translated owner guidance surrounds the original authored title and message.
      assert.deepEqual(ssrState(await document.text()), { locale, heading: `${title} 2025` });
      assert.match(document.headers()['cache-control'], /no-store/);
      await state.page.getByText(messages[locale].calendar_preview_notice, { exact: true }).waitFor();
      assert.equal(await state.page.locator('h3').textContent(), door.title);
      assert.equal(await state.page.locator('section[aria-labelledby="selected-door-heading"] p.mt-3').textContent(), door.text);
    }

    const reader = await localizedBrowser(state, t);
    await state.signIn(account, '/my-page', reader.page);
    await reader.page.goto(`${state.frontendUrl}/my-calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    reader.page.on('request', request => { if (request.url().includes('/api/trpc/calendar.save')) writes.push(request.url()); });
    for (const locale of ['en', 'nb']) {
      // When the assigned recipient selects a language and explicitly opens the same door.
      const document = await selectLanguage(reader.page, locale);
      assert.deepEqual(ssrState(await document.text()), { locale, heading: `${title} 2025` });
      await reader.page.getByRole('link', { name: messages[locale].calendar_my_page, exact: true }).waitFor();
      await reader.page.locator('[data-door-number="1"]').click();
      const dialog = reader.page.locator('dialog[open]');
      await dialog.waitFor();

      // Then opening authority and authored Unicode remain independent of interface language.
      assert.equal(await dialog.locator('h2').textContent(), door.title);
      assert.equal(await dialog.locator('p').textContent(), door.text);
      assert.match(document.headers()['cache-control'], /no-store/);
      assert.equal((await reader.context.request.get(`${state.frontendUrl}/api/trpc/calendar.preview?input=${encodeURIComponent(JSON.stringify({ id: calendar.id }))}`)).status(), 403);
      await reader.page.getByRole('button', { name: messages[locale].recipient_close, exact: true }).click();
    }

    // Then language selection has issued no content mutation or changed persisted authored values.
    assert.deepEqual(writes, []);
    assert.deepEqual(await preview(state, calendar.id), before);
  });
}

async function preview(state, id) {
  const response = await state.context.request.get(`${state.frontendUrl}/api/trpc/calendar.preview?input=${encodeURIComponent(JSON.stringify({ id }))}`);
  assert.equal(response.status(), 200);
  return (await response.json()).result.data;
}
