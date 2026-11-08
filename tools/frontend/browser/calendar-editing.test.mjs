import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { owner, create } from './calendar-fixture.mjs';

// Registered in the production-stack suite to share its isolated lifecycle.
export function registerCalendarEditingScenarios(environment) {
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
    await page.waitForFunction(() => document.querySelector('[aria-labelledby="selected-door-heading"] button[type=submit]')?.disabled);
    await page.getByRole('region', { name: 'Rediger luke 1', exact: true }).locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
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
}
