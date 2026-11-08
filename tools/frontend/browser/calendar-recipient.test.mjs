import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { owner, recipient, create, createRecipient } from './calendar-fixture.mjs';

// Registered in the production-stack suite to share its isolated lifecycle.
export function registerCalendarRecipientScenarios(environment) {
  test('Given an owned calendar, When its recipient is changed in edit mode, Then administration and personal calendar cards show the saved identity', async () => {
    // Given an owner calendar and another assigned ordinary user.
    const state = environment();
    const { page, accounts, signIn, frontendUrl } = state;
    await signIn(owner(accounts));
    const suffix = randomUUID().slice(0, 8);
    const next = await createRecipient(state);
    const title = `Recipient calendar ${suffix}`;
    const calendar = await create(state, title);
    await page.goto(`${frontendUrl}/my-page`, { waitUntil: 'networkidle' });
    const card = page.getByRole('link', { name: new RegExp(title) });
    assert((await card.textContent()).includes(recipient(accounts).username));
    await card.click();
    const change = page.getByRole('button', { name: 'Endre mottaker', exact: true });
    await change.waitFor();
    const selector = page.getByLabel('Mottaker', { exact: true });
    assert.equal(await selector.count(), 0);
    let recipientWrites = 0;
    page.on('request', request => {
      if (request.url().includes('/api/trpc/calendar.saveRecipient')) recipientWrites++;
    });
    await change.click();
    await selector.waitFor();
    assert.equal(await selector.inputValue(), calendar.recipientId);
    await page.waitForFunction(() => document.activeElement?.id === 'calendar-recipient');
    assert.equal(await selector.evaluate(element => element === document.activeElement), true);
    assert.equal(await selector.locator(`option[value="${accounts.find(account => account.username === 'browser-user-two').id}"]`).count(), 0);
    await selector.selectOption(next.id);
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
    assert.equal(await selector.count(), 0);
    assert.equal(recipientWrites, 0);
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('Endre mottaker'));
    assert.equal(await change.evaluate(element => element === document.activeElement), true);
    await change.click();
    assert.equal(await selector.inputValue(), calendar.recipientId);

    // When selecting another eligible account and saving explicitly.
    await selector.selectOption(next.id);
    const saved = page.waitForResponse(result => result.url().includes('/api/trpc/calendar.saveRecipient'));
    await page.getByRole('button', { name: 'Lagre mottaker', exact: true }).click();
    assert.equal((await saved).status(), 200);
    await page.getByRole('status').filter({ hasText: 'Endringene er lagret.' }).waitFor();
    assert.equal(await selector.count(), 0);
    assert.equal(recipientWrites, 1);
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('Endre mottaker'));
    assert.equal(await change.evaluate(element => element === document.activeElement), true);
    const refreshed = await page.reload({ waitUntil: 'networkidle' });

    // Then SSR, the list cache, preview and both interface languages agree on the recipient.
    assert.match(refreshed.headers()['cache-control'], /no-store/);
    assert((await refreshed.text()).includes(next.username));
    assert.equal(await selector.count(), 0);
    assert((await page.locator('p').filter({ hasText: `(${next.username})` }).textContent()).includes(next.name));
    await page.getByRole('link', { name: 'Min side', exact: true }).click();
    assert((await card.textContent()).includes(next.username));
    assert(!(await card.textContent()).includes(recipient(accounts).username));
    await card.click();
    await page.getByRole('link', { name: 'Forhåndsvis', exact: true }).click();
    await page.waitForURL(`**/calendar-preview/${calendar.id}`);
    await page.getByText('Eierens forhåndsvisning: alle luker er tilgjengelige.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Lagre mottaker', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Endre mottaker', exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Tilbake til administrasjon', exact: true }).click();
    await change.waitFor();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.locator('select').first().selectOption('en'),
    ]);
    const changeEnglish = page.getByRole('button', { name: 'Change recipient', exact: true });
    await changeEnglish.waitFor();
    assert.equal(await page.getByLabel('Recipient', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(state.reports, 'calendar-recipient-collapsed-mobile.png'), fullPage: true });
    await changeEnglish.click();
    await page.waitForFunction(() => document.querySelector('#calendar-recipient')?.disabled === false);
    assert.equal(await page.getByLabel('Recipient', { exact: true }).inputValue(), next.id);
    assert.equal(await page.getByRole('button', { name: 'Save recipient', exact: true }).count(), 1);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(state.reports, 'calendar-recipient-mobile.png'), fullPage: true });
  });

  test('Given a rejected recipient change, When the owner saves another selection, Then the current identity is preserved and the field error is visible', async () => {
    // Given an owner calendar and a deterministic recipient validation failure.
    const state = environment();
    const { page, accounts, signIn, frontendUrl } = state;
    await signIn(owner(accounts));
    const next = await createRecipient(state);
    const calendar = await create(state);
    await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
    const selector = page.getByLabel('Mottaker', { exact: true });
    await page.getByRole('button', { name: 'Endre mottaker', exact: true }).click();
    await page.route('**/api/trpc/calendar.saveRecipient', route => route.fulfill({
      status: 400,
      json: { error: { message: 'BAD_REQUEST', code: -32600, data: { code: 'BAD_REQUEST', httpStatus: 400, fieldErrors: { recipientId: ['No longer eligible'] } } } },
    }));

    // When the selected recipient is rejected after an explicit save.
    await selector.selectOption(next.id);
    const rejected = page.waitForResponse(result => result.url().includes('/api/trpc/calendar.saveRecipient'));
    await page.getByRole('button', { name: 'Lagre mottaker', exact: true }).click();
    assert.equal((await rejected).status(), 400);
    await page.getByRole('alert').waitFor();

    // Then server field errors retain the attempted selection without changing the stored identity.
    assert.equal(await selector.getAttribute('aria-invalid'), 'true');
    assert.equal(await selector.inputValue(), next.id);
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
    assert.equal(await selector.count(), 0);
    assert((await page.locator('p').filter({ hasText: `(${recipient(accounts).username})` }).textContent()).includes(recipient(accounts).name));
    await page.getByRole('button', { name: 'Endre mottaker', exact: true }).click();
    assert.equal(await selector.inputValue(), calendar.recipientId);
    assert.equal(await selector.getAttribute('aria-invalid'), 'false');
  });
}
