import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { owner, recipient, create } from './calendar-fixture.mjs';
import { measureDoors, assertDoorGeometry } from './calendar-layout-assertions.mjs';

const reports = path.resolve('quality-reports/plan00016');
const widths = [320, 375, 768, 1280];

export function registerCalendarLayoutScenarios(environment) {
  for (const background of ['woodland', 'sleigh', 'playtime', 'aurora']) {
    test(`Given ${background}, When both layouts render at mobile tablet and desktop widths, Then translucent accessible doors fit and visual evidence is saved`, async () => {
      // Given an actual owner calendar with this persisted illustration.
      const state = environment();
      const { page, accounts, signIn, frontendUrl, mutation } = state;
      fs.mkdirSync(reports, { recursive: true });
      await signIn(owner(accounts));
      const response = await mutation('calendar.create', { title: 'Christmas calendar', recipientId: recipient(accounts).id, background });
      assert.equal(response.status(), 200);
      const calendar = (await response.json()).result.data;
      await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });

      // When explicit layout choices persist, and responsive viewports render them.
      const evidence = [];
      for (const layout of ['chronological', 'random']) {
        const saved = page.waitForResponse(response => response.url().includes('/api/trpc/calendar.saveLayout'));
        await page.getByRole('button', { name: layout === 'random' ? 'Tilfeldig' : 'Kronologisk', exact: true }).click();
        assert.equal((await saved).status(), 200);
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          await page.reload({ waitUntil: 'networkidle' });
          const geometry = await measureDoors(page);
          await page.locator('ol button').first().focus();
          await page.keyboard.press('Tab');

          // Then all real targets fit, surfaces remain translucent, and focus is visible.
          assertDoorGeometry(geometry, layout);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const surfaces = await page.locator('ol button').evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundColor));
          assert(surfaces.every(color => /rgba\(.+, 0\.\d+\)/.test(color)), 'Every surface variant is translucent');
          const focus = await page.locator('ol button').nth(1).evaluate(button => ({ focused: button.matches(':focus-visible'), outline: getComputedStyle(button).outlineWidth }));
          assert.deepEqual(focus, { focused: true, outline: '2px' });
          if (layout === 'chronological') {
            const fraction = await page.locator('ol button').first().evaluate(button => button.clientWidth / button.parentElement.clientWidth);
            assert(fraction < 0.72, 'Ordinary doors expose more of the old grid cells');
          }
          evidence.push({ layout, viewport: width, geometry });
          await page.locator('ol').locator('..').screenshot({ path: path.join(reports, `after-${background}-${layout}-${width}.png`) });
        }
      }
      fs.writeFileSync(path.join(reports, `${background}-geometry.json`), JSON.stringify(evidence, null, 2));
    });
  }

  test('Given a saved scattered calendar, When refreshed previewed translated and resized, Then numbered geometry and selection persist without layout writes', async () => {
    // Given a stored random layout with distinctive Christmas Eve content.
    const state = environment();
    const { page, accounts, signIn, frontendUrl, mutation } = state;
    await signIn(owner(accounts));
    const calendar = await create(state);
    assert.equal((await mutation('calendar.saveDoor', { id: calendar.id, number: 24, title: 'Christmas Eve ÆØÅ', text: 'Original message' })).status(), 200);
    assert.equal((await mutation('calendar.saveLayout', { id: calendar.id, layout: 'random' })).status(), 200);
    let writes = 0;
    page.on('request', request => { if (request.url().includes('/api/trpc/calendar.saveLayout')) writes++; });

    // When each supported viewport returns through administration, refresh and preview.
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
      const original = await measureDoors(page);
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual(await measureDoors(page), original);
      await page.getByRole('link', { name: 'Forhåndsvis', exact: true }).click();
      await page.waitForURL(`**/calendar-preview/${calendar.id}`);
      await page.getByText('Eierens forhåndsvisning: alle luker er tilgjengelige.', { exact: true }).waitFor();
      assert.deepEqual(await measureDoors(page), original);
      const christmas = page.getByRole('button', { name: 'Luke 24', exact: true });
      await christmas.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Christmas Eve ÆØÅ', exact: true }).waitFor();
      await page.setViewportSize({ width: width + 16, height: 900 });
      await measureDoors(page);
      await page.setViewportSize({ width, height: 900 });

      // Then the selected numbered content and geometry survive responsive changes.
      assert.equal(await christmas.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByText('Original message', { exact: true }).count(), 1);
      assert.deepEqual(await measureDoors(page), original);
    }
    const norwegian = await measureDoors(page);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('combobox').selectOption('en')]);
    assert.deepEqual(await measureDoors(page), norwegian);
    await page.getByRole('button', { name: 'Door 24', exact: true }).click();
    assert.equal(await page.getByRole('heading', { name: 'Christmas Eve ÆØÅ', exact: true }).count(), 1);
    assert.equal(writes, 0, 'Read, resize, preview and language changes never save layout');
  });

  test('Given a scattered calendar on a narrow touch screen, When every numbered target is tapped, Then the matching editor opens without obscured doors', async () => {
    // Given a real persisted random arrangement and an authenticated touch context.
    const state = environment();
    const { page, accounts, signIn, frontendUrl, context, mutation } = state;
    await signIn(owner(accounts));
    const calendar = await create(state);
    await mutation('calendar.saveLayout', { id: calendar.id, layout: 'random' });
    const touch = await context.browser().newContext({ storageState: await context.storageState(), viewport: { width: 320, height: 812 }, hasTouch: true });
    const mobile = await touch.newPage();
    try {
      // When the owner taps each target on the measured mobile canvas.
      await mobile.goto(`${frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
      assertDoorGeometry(await measureDoors(mobile), 'random');
      for (let number = 1; number <= 24; number++) {
        await mobile.getByRole('button', { name: `Luke ${number}`, exact: true }).tap();

        // Then the target remains accessible and selects its original numbered editor.
        await mobile.getByRole('heading', { name: `Rediger luke ${number}`, exact: true }).waitFor();
      }
    } finally { await touch.close(); }
  });
}
