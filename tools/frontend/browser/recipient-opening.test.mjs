import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { owner, recipient, logout } from './calendar-fixture.mjs';

const door = (page, number) => page.locator(`[data-door-number="${number}"]`);
const dialog = page => page.locator('dialog[open]');
async function capture(state, name) {
  const directory = path.resolve(state.reports, '../../plan00019');
  fs.mkdirSync(directory, { recursive: true });
  await state.page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
}
const read = async (state, operation, input) => {
  const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await state.context.request.get(`${state.frontendUrl}/api/trpc/${operation}${query}`);
  assert.equal(response.status(), 200, await response.text());
  return (await response.json()).result.data;
};
async function prepare(state, { future = false, image = false, background = 'aurora', random = false } = {}) {
  await state.signIn(owner(state.accounts));
  const response = await state.mutation('calendar.create', { title: 'Recipient gifts ÆØÅ', recipientId: recipient(state.accounts).id, background });
  assert.equal(response.status(), 200, await response.text());
  const calendar = (await response.json()).result.data;
  const save = await state.mutation('calendar.saveDoor', {
    id: calendar.id, number: 1, title: 'Gave <b>ÆØÅ</b>', text: 'Første linje\nAndre linje 🎄\n' + 'Lang melding. '.repeat(200),
  });
  assert.equal(save.status(), 200, await save.text());
  if (image) {
    const imageData = await state.page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 60;
      canvas.getContext('2d').fillRect(0, 0, 120, 60);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const savedImage = await state.mutation('calendar.saveDoor', { id: calendar.id, number: 2, title: '', text: '', imageAction: 'replace', imageData });
    assert.equal(savedImage.status(), 200, await savedImage.text());
  }
  if (random) assert.equal((await state.mutation('calendar.saveLayout', { id: calendar.id, layout: 'random' })).status(), 200);
  state.fixture('calendar-year', calendar.id, future ? '2090' : '2025');
  await logout(state.page, state.frontendUrl);
  await state.signIn(recipient(state.accounts));
  const session = await read(state, 'auth.session');
  await state.page.goto(`${state.frontendUrl}/my-calendars/${calendar.id}`, { waitUntil: 'networkidle' });
  return { ...calendar, scope: session.cacheScope };
}

export function registerRecipientOpeningScenarios(environment) {
  test('Given a future recipient calendar, When SSR and locked or empty doors are activated, Then hidden content never reaches HTML and no opening write is sent', async () => {
    // Given a populated future calendar and an observed browser transport.
    const state = environment();
    const calendar = await prepare(state, { future: true, image: true });
    const writes = [];
    state.page.on('request', request => { if (request.url().includes('recipient.open')) writes.push(request.url()); });

    // When SSR reloads and a locked numbered door receives keyboard and pointer activation.
    const response = await state.page.reload({ waitUntil: 'networkidle' });
    await door(state.page, 1).focus();
    await state.page.keyboard.press('Enter');
    await door(state.page, 2).click({ force: true });

    // Then safe board metadata is no-store and no future content/image or implicit opening is delivered.
    assert.match(response.headers()['cache-control'], /no-store/);
    const html = await response.text();
    assert(!html.includes('Gave &lt;b&gt;'));
    assert(!html.includes('Første linje'));
    assert.equal(await dialog(state.page).count(), 0);
    assert.equal(await door(state.page, 1).getAttribute('aria-disabled'), 'true');
    assert.deepEqual(writes, []);
    const board = await read(state, 'recipient.get', { id: calendar.id, scope: calendar.scope });
    assert(board.doors.every(item => item.openedAt === null && item.state === 'locked'));
  });

  test('Given available recipient gifts, When keyboard opens a door then closes and reloads, Then hinge zoom focus and persisted green frames work together', async () => {
    // Given a normally available saved calendar with long authored content.
    const state = environment();
    const calendar = await prepare(state);

    // When an explicit keyboard opening succeeds.
    await door(state.page, 1).focus();
    await state.page.keyboard.press('Enter');
    await dialog(state.page).waitFor();
    const motion = await state.page.evaluate(() => ({
      flap: getComputedStyle(document.querySelector('[data-opening="true"]')).animationName,
      zoom: getComputedStyle(document.querySelector('dialog[open]')).animationName,
    }));
    await dialog(state.page).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    await capture(state, 'dialog-reading');
    await state.page.keyboard.press('Tab');
    const contained = await dialog(state.page).evaluate(element => element.contains(document.activeElement));
    await state.page.keyboard.press('Escape');
    await dialog(state.page).waitFor({ state: 'hidden' });
    const returned = await door(state.page, 1).evaluate(element => document.activeElement === element);
    await state.page.reload({ waitUntil: 'networkidle' });

    // Then physical motion precedes reading, focus returns and server history preserves the opened frame.
    assert.equal(motion.flap, 'recipient-flap');
    assert.equal(motion.zoom, 'recipient-zoom');
    assert(contained);
    assert(returned);
    assert.equal(await door(state.page, 1).getAttribute('data-opened'), 'true');
    await door(state.page, 1).click();
    await state.page.getByRole('heading', { name: 'Gave <b>ÆØÅ</b>', exact: true }).waitFor();
    assert.equal(await dialog(state.page).locator('h2 b').count(), 0);
    assert((await dialog(state.page).textContent()).includes('Første linje\nAndre linje 🎄'));
    assert.equal((await read(state, 'recipient.get', { id: calendar.id, scope: calendar.scope })).doors.filter(item => item.openedAt).length, 1);
    await state.page.getByRole('button', { name: 'Lukk', exact: true }).click();
  });

  test('Given reduced motion and an image-only gift, When image loading fails then retries, Then content appears directly and committed history stays opened', async () => {
    // Given a touch-sized reduced-motion browser and a populated image-only door.
    const state = environment();
    await state.page.emulateMedia({ reducedMotion: 'reduce' });
    await state.page.setViewportSize({ width: 375, height: 812 });
    await prepare(state, { image: true });
    await state.page.route('**/api/trpc/recipient.image*', route => route.abort());

    // When the door opens and the user retries the failed protected image read.
    await door(state.page, 2).click();
    await state.page.getByText('Bildet kunne ikke lastes.', { exact: false }).waitFor();
    const animation = await dialog(state.page).evaluate(element => getComputedStyle(element).animationName);
    await state.page.unroute('**/api/trpc/recipient.image*');
    await state.page.getByRole('button', { name: 'Prøv igjen', exact: true }).click();
    await state.page.waitForFunction(() => document.querySelector('dialog img')?.naturalWidth > 0);
    const ratio = await dialog(state.page).locator('img').evaluate(element => element.naturalWidth / element.naturalHeight);
    await capture(state, 'dialog-image-mobile');
    await state.page.getByRole('button', { name: 'Lukk', exact: true }).click();

    // Then spatial motion is omitted, aspect ratio is preserved and image failure never clears the opening.
    assert.equal(animation, 'none');
    assert.equal(ratio, 2);
    assert.equal(await door(state.page, 2).getAttribute('data-opened'), 'true');
    assert.equal(await state.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });

  test('Given local bypass opening history, When the Development backend restarts without bypass, Then future content and image access are locked again', async () => {
    // Given a future populated calendar and a real local Development host.
    const state = environment();
    const calendar = await prepare(state, { future: true, image: true });
    await state.restartApi(true);
    await state.page.reload({ waitUntil: 'networkidle' });

    // When the image-only door opens under bypass and the backend restarts with enforcement.
    await door(state.page, 2).click();
    await dialog(state.page).waitFor();
    await state.page.getByRole('button', { name: 'Lukk', exact: true }).click();
    await state.restartApi(false);
    await state.page.reload({ waitUntil: 'networkidle' });
    const denied = await state.mutation('recipient.open', { id: calendar.id, scope: calendar.scope, number: 2 });

    // Then durable history is visible but grants no current content permission.
    assert.equal(await door(state.page, 2).getAttribute('data-opened'), 'true');
    assert.equal(await door(state.page, 2).getAttribute('data-state'), 'locked');
    assert.equal(denied.status(), 409);
    assert.equal(await dialog(state.page).count(), 0);
  });

  for (const background of ['woodland', 'sleigh', 'playtime', 'aurora']) {
    test(`Given recipient ${background} Random layout, When viewport sizes and languages change, Then all saved doors retain accessible geometry and authored content`, async () => {
      // Given one saved Random recipient layout using this background.
      const state = environment();
      const calendar = await prepare(state, { background, random: true });

      // When each required viewport displays the persisted layout.
      for (const width of [320, 375, 768, 1280]) {
        await state.page.setViewportSize({ width, height: 900 });
        await state.page.waitForFunction(() => [...document.querySelectorAll('.door-tile')].length === 24);
        const boxes = await state.page.locator('.door-tile').evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, right: rect.right, left: rect.left };
        }));
        await capture(state, `${background}-${width}`);

        // Then every numbered target fits the viewport and remains at least 44px.
        assert(boxes.every(box => box.width >= 43.9 && box.height >= 43.9 && box.left >= 0 && box.right <= width));
      }
      await state.page.getByLabel('Språk').selectOption('en');
      await state.page.waitForLoadState('networkidle');
      await door(state.page, 1).click();
      await state.page.getByRole('button', { name: 'Close', exact: true }).waitFor();
      assert.equal(await state.page.getByRole('heading', { name: 'Gave <b>ÆØÅ</b>', exact: true }).count(), 1);
      assert.equal((await read(state, 'recipient.get', { id: calendar.id, scope: calendar.scope })).layout, 'random');
    });
  }
}
