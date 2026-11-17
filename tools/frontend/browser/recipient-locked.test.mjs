import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createBrowserReader } from './page-errors.mjs';
import { assertRecipientContentHidden, assertRecipientHistoryEmpty, door, prepare } from './recipient-opening.test.mjs';

const status = page => page.locator('#recipient-door-status');
const waitMessage = (locale, date) => locale === 'nb'
  ? `Du må vente til kl 7 den ${date} før du kan åpne denne luken.`
  : `You must wait until 07:00 on ${date} before you can open this door.`;

async function recipientReader(state, t, options) {
  let reader;
  // Drain intercepted reads before the shared fixture disposes its request context.
  t.after(async () => { await reader?.page.unrouteAll({ behavior: 'wait' }); });
  reader = await createBrowserReader(state, t, options);
  return {
    ...reader,
    signIn: (account, destination) => state.signIn(account, destination, reader.page),
    mutation: (operation, input) => state.mutation(operation, input, reader.context.request),
  };
}

async function assertSafeFeedback(state, writes, images) {
  assert.deepEqual(writes, []);
  assert.deepEqual(images, []);
  await assertRecipientContentHidden(state.page);
}
async function assertVisibleFeedback(page) {
  const visible = await status(page).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth;
  });
  assert(visible, 'Timing help fits inside the viewport while the selected tile retains focus');
}

async function captureFeedback(state, name) {
  const directory = path.resolve(state.reports, '../../plan00025', process.env.BROWSER_FRONTEND_MODE || 'production');
  fs.mkdirSync(directory, { recursive: true });
  await state.page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: false });
}

export function registerRecipientLockedScenarios(environment) {
  for (const locale of ['nb', 'en']) {
    for (const layout of ['chronological', 'random']) {
      test(`Given a ${locale} ${layout} locked recipient board in another timezone, When keyboard pointer and touch request timing help, Then exact Oslo dates are announced without opening content`, async t => {
        // Given authorized safe metadata, touch input and a browser year independent of Oslo.
        const state = await recipientReader(environment(), t, {
          timezoneId: 'America/Los_Angeles', hasTouch: true,
          viewport: { width: 320, height: 812 }, reducedMotion: 'reduce',
        });
        const calendar = await prepare(state, { future: true, image: true, random: layout === 'random' });
        await state.context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: state.frontendUrl }]);
        let instant;
        await state.page.route('**/api/trpc/recipient.get*', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.result.data.serverTime = instant.server;
          body.result.data.nextOpeningAt = null;
          body.result.data.doors[0].opensAt = instant.opens;
          await route.fulfill({ response, json: body });
        });
        const writes = [];
        const images = [];
        state.page.on('request', request => {
          if (request.url().includes('recipient.open')) writes.push(request.url());
          if (request.url().includes('recipient.image')) images.push(request.url());
        });
        const cases = [
          { server: '2026-11-17T12:00:00Z', opens: '2026-12-17T06:00:00Z', date: { nb: '17. desember', en: '17 December' }, action: 'Enter' },
          { server: '2026-12-01T05:59:59Z', opens: '2026-12-01T06:00:00Z', date: { nb: '1. desember', en: '1 December' }, action: 'Space' },
          { server: '2026-12-01T06:00:00Z', opens: '2027-12-01T06:00:00Z', date: { nb: '1. desember 2027', en: '1 December 2027' }, action: 'pointer' },
          { server: '2026-12-31T23:30:00Z', opens: '2027-12-01T06:00:00Z', date: { nb: '1. desember', en: '1 December' }, action: 'touch' },
        ];

        for (const scenario of cases) {
          // When an explicit action selects the locked tile using the refreshed authorized instant.
          instant = scenario;
          const refreshed = state.page.waitForResponse(response => response.url().includes('/api/trpc/recipient.get'));
          const response = await state.page.reload({ waitUntil: 'networkidle' });
          await refreshed;
          const tile = door(state.page, 1);
          if (scenario.action === 'pointer') await tile.click();
          else if (scenario.action === 'touch') await tile.tap();
          else {
            await tile.focus();
            await state.page.keyboard.press(scenario.action);
          }
          await state.page.getByText(waitMessage(locale, scenario.date[locale]), { exact: true }).waitFor();

          // Then timing remains polite, connected to its timing-help action and independent of saved order.
          assert.equal(await status(state.page).textContent(), waitMessage(locale, scenario.date[locale]));
          assert.equal(await status(state.page).getAttribute('role'), 'status');
          assert.equal(await status(state.page).getAttribute('aria-live'), 'polite');
          assert.equal(await tile.getAttribute('aria-disabled'), null);
          assert.equal(await tile.getAttribute('aria-haspopup'), null);
          assert.equal(await tile.getAttribute('aria-describedby'), 'recipient-door-status');
          assert((await tile.getAttribute('aria-label')).includes(locale === 'nb'
            ? 'Velg luken for å vise åpningstiden.' : 'Select the door to show its opening time.'));
          if (scenario.action === 'Enter' || scenario.action === 'Space')
            assert.equal(await tile.evaluate(element => document.activeElement === element), true);
          assert.match(response.headers()['cache-control'], /no-store/);
          const html = await response.text();
          assert(!html.includes('Første linje'));
          assert(!html.includes('Gave &lt;b&gt;'));
          await assertSafeFeedback(state, writes, images);
          await assertVisibleFeedback(state.page);
          assert.equal(await state.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        await captureFeedback(state, `${layout}-${locale}-timing-mobile`);
        await state.page.setViewportSize({ width: 1280, height: 900 });
        await door(state.page, 1).click();
        await assertVisibleFeedback(state.page);
        await captureFeedback(state, `${layout}-${locale}-timing-desktop`);
        await assertRecipientHistoryEmpty(state, calendar);
      });
    }

    test(`Given a ${locale} calendar user, When My page and the recipient calendar render, Then idle guidance and password controls are absent while logout remains`, async () => {
      // Given a permanent-password recipient with a future assigned calendar.
      const state = environment();
      const calendar = await prepare(state, { future: true });
      await state.context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: state.frontendUrl }]);

      for (const destination of ['/my-page', `/my-calendars/${calendar.id}`]) {
        // When each recipient destination is rendered in the selected language.
        await state.page.goto(state.frontendUrl + destination, { waitUntil: 'networkidle' });

        // Then account navigation preserves logout without offering password change or idle instructions.
        assert.equal(await state.page.getByRole('link', { name: locale === 'nb' ? 'Bytt passord' : 'Change password', exact: true }).count(), 0);
        assert.equal(await state.page.getByRole('button', { name: locale === 'nb' ? 'Logg ut' : 'Log out', exact: true }).count(), 1);
        assert.equal(await state.page.getByText('Choose an available door. A green frame and check mark show doors you have opened.', { exact: true }).count(), 0);
        assert.equal(await state.page.getByText('Velg en tilgjengelig luke. En grønn ramme og hake viser luker du har åpnet.', { exact: true }).count(), 0);
      }
    });
  }

  test('Given active timing help on a narrow recipient board, When an overlapped tile is clicked and another tile receives keyboard focus, Then pointer actions pass through and keyboard focus remains above the banner', async t => {
    // Given a tall chronological board with an active timing banner and no implicit opening.
    const state = await recipientReader(environment(), t, { viewport: { width: 320, height: 600 } });
    const calendar = await prepare(state, { future: true, image: true });
    let writes = 0;
    state.page.on('request', request => { if (request.url().includes('recipient.open')) writes++; });
    await door(state.page, 1).click();
    await state.page.getByText(waitMessage('nb', '1. desember 2090'), { exact: true }).waitFor();

    // When a middle tile is positioned beneath the banner and clicked at its screen coordinates.
    await door(state.page, 12).evaluate(element => {
      const tile = element.getBoundingClientRect();
      const banner = document.querySelector('#recipient-door-status').getBoundingClientRect();
      window.scrollBy(0, tile.top + tile.height / 2 - banner.top - banner.height / 2);
    });
    const target = await door(state.page, 12).evaluate(element => {
      const tile = element.getBoundingClientRect();
      const banner = document.querySelector('#recipient-door-status').getBoundingClientRect();
      const x = tile.left + tile.width / 2;
      const y = tile.top + tile.height / 2;
      return {
        x, y,
        beneathBanner: y >= banner.top && y <= banner.bottom,
        hit: document.elementFromPoint(x, y)?.closest('[data-door-number]')?.getAttribute('data-door-number'),
      };
    });
    assert(target.beneathBanner, 'The pointer regression really targets a tile beneath the visible banner');
    assert.equal(target.hit, '12', 'The status never intercepts the tile action');
    await state.page.mouse.click(target.x, target.y);
    await state.page.getByText(waitMessage('nb', '12. desember 2090'), { exact: true }).waitFor();

    // When keyboard focus reaches the final tile and the same timing action is repeated.
    for (let number = 13; number <= 24; number++) await state.page.keyboard.press('Tab');
    await state.page.waitForFunction(() => {
      const tile = document.querySelector('[data-door-number="24"]').getBoundingClientRect();
      const banner = document.querySelector('#recipient-door-status').getBoundingClientRect();
      return tile.top >= 6 && tile.bottom + 6 <= banner.top;
    });
    await state.page.keyboard.press('Enter');
    await state.page.getByText(waitMessage('nb', '24. desember 2090'), { exact: true }).waitFor();
    const announcement = await status(state.page).locator('span').elementHandle();
    await state.page.keyboard.press('Space');
    await state.page.waitForFunction(previous => !previous.isConnected, announcement);

    // Then repeated help refreshes its announcement without moving focus or exposing content/history.
    assert.equal(await status(state.page).textContent(), waitMessage('nb', '24. desember 2090'));
    assert.equal(await door(state.page, 24).evaluate(element => document.activeElement === element), true);
    assert.equal(writes, 0);
    await assertRecipientContentHidden(state.page);
    await assertRecipientHistoryEmpty(state, calendar);
    await captureFeedback(state, 'chronological-banner-pointer-keyboard-mobile');
  });

}
