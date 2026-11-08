import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { create, owner, logout } from './calendar-fixture.mjs';

const read = async (state, operation, input) => {
  const response = await state.context.request.get(`${state.frontendUrl}/api/trpc/calendar.${operation}?input=${encodeURIComponent(JSON.stringify(input))}`);
  assert.equal(response.status(), 200, await response.text());
  return (await response.json()).result.data;
};
const saved = page => page.getByText('Endringene er lagret.', { exact: true }).waitFor();
const image = page => page.locator('[aria-labelledby=selected-door-heading] img');
const loaded = page => page.waitForFunction(() => {
  const element = document.querySelector('[aria-labelledby=selected-door-heading] img');
  return element?.complete && element.naturalWidth > 0;
});

async function file(page, format = 'png', detailed = false) {
  const encoded = await page.evaluate(({ format, detailed }) => {
    const canvas = document.createElement('canvas');
    canvas.width = detailed ? 1600 : 120;
    canvas.height = detailed ? 1000 : 60;
    const context = canvas.getContext('2d');
    if (detailed) {
      const pixels = context.createImageData(canvas.width, canvas.height);
      let seed = 18;
      for (let index = 0; index < pixels.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          pixels.data[index + channel] = seed >>> 24;
        }
        pixels.data[index + 3] = 128;
      }
      context.putImageData(pixels, 0, 0);
    } else {
      context.fillStyle = '#15803d80';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL(`image/${format === 'jpeg' ? 'jpeg' : 'png'}`, 1).split(',')[1];
  }, { format, detailed });
  return { name: `gift.${format}`, mimeType: `image/${format}`, buffer: Buffer.from(encoded, 'base64') };
}

async function editor(state) {
  await state.signIn(owner(state.accounts));
  const calendar = await create(state, 'Bilder ÆØÅ 🎁');
  await state.page.goto(`${state.frontendUrl}/calendars/${calendar.id}`, { waitUntil: 'networkidle' });
  return calendar;
}

export function registerDoorImageScenarios(environment) {
  for (const format of ['png', 'jpeg']) {
    test(`Given a door image in ${format}, When explicitly saved and viewed in all three modes, Then only selected protected image bytes are loaded`, async () => {
      // Given an owner draft and a real image, with writes and payload reads observed.
      const state = environment();
      const { page } = state;
      const calendar = await editor(state);
      const source = await file(page, format, format === 'png');
      const writes = [];
      const reads = [];
      page.on('request', request => {
        if (request.url().includes('/api/trpc/calendar.saveDoor')) writes.push(request);
        if (request.url().includes('/api/trpc/calendar.image')) reads.push(request);
      });

      // When selection creates a local preview, followed by the common explicit Save.
      await page.getByLabel('Bilde (valgfritt)', { exact: true }).setInputFiles(source);
      await loaded(page);
      assert.equal(writes.length, 0);
      assert.equal(reads.length, 0);
      await page.getByText('Du har endringer som ikke er lagret.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Lagre', exact: true }).click();
      await saved(page);
      await loaded(page);
      const result = await read(state, 'get', { id: calendar.id });
      const metadata = result.doors[0].image;

      // Then processed output replaces the source preview, survives refresh, and is image-only content.
      assert.equal(writes.length, 1);
      assert.equal(reads.length, 1);
      assert.equal(metadata.mediaType, `image/${format}`);
      assert.equal(await image(page).getAttribute('alt'), 'Bilde til kalenderluken');
      if (format === 'png') assert(metadata.width < 1600, 'Detailed PNG is adapted to the persisted limit');
      const response = await page.reload({ waitUntil: 'networkidle' });
      assert.match(response.headers()['cache-control'], /no-store/);
      await loaded(page);
      await page.getByRole('link', { name: 'Forhåndsvis', exact: true }).click();
      await loaded(page);
      assert.equal(await page.getByText('Denne luken har ikke noe innhold ennå.', { exact: true }).count(), 0);
      await logout(page, state.frontendUrl);
      await state.signIn(state.accounts.find(account => account.username === 'browser-superadmin'));
      await page.goto(`${state.frontendUrl}/calendar-preview/${calendar.id}`, { waitUntil: 'networkidle' });
      await loaded(page);
      assert.equal(await page.locator('input[type=file]').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Lagre', exact: true }).count(), 0);
      assert.equal(await image(page).evaluate(element => element.naturalWidth), metadata.width);
    });
  }

  test('Given a door image, When kept replaced and removed through common saves, Then text and unrelated door content remain intact', async () => {
    // Given a saved image with plain-text content.
    const state = environment();
    const { page } = state;
    const calendar = await editor(state);
    await page.getByLabel(/^Tittel på innhold/).fill('Ærlig gave <b>🎁</b>');
    await page.getByLabel(/^Melding/).fill('Linje én\nLinje to');
    await page.getByLabel('Bilde (valgfritt)', { exact: true }).setInputFiles(await file(page));
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await saved(page);
    const first = (await read(state, 'get', { id: calendar.id })).doors[0];

    // When a text-only save keeps the image, then replacement and removal are explicit.
    await page.getByLabel(/^Melding/).fill('Behold bildet');
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await saved(page);
    assert.equal((await read(state, 'get', { id: calendar.id })).doors[0].image.version, first.image.version);
    await page.getByLabel('Bilde (valgfritt)', { exact: true }).setInputFiles(await file(page, 'jpeg'));
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await saved(page);
    const replacement = (await read(state, 'get', { id: calendar.id })).doors[0];
    await page.getByRole('button', { name: 'Fjern bilde', exact: true }).click();
    assert.equal((await read(state, 'get', { id: calendar.id })).doors[0].image.version, replacement.image.version);
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await saved(page);
    const final = await read(state, 'get', { id: calendar.id });

    // Then replacement advances its version and removal leaves the authored text/settings unchanged.
    assert.notEqual(replacement.image.version, first.image.version);
    assert.equal(final.doors[0].image, null);
    assert.equal(final.doors[0].title, first.title);
    assert.equal(final.doors[0].text, 'Behold bildet');
    assert(final.doors.slice(1).every(door => !door.image && !door.title && !door.text));
    assert.deepEqual(final.doorOrder, calendar.doorOrder);
    assert.equal(await image(page).count(), 0);
  });

  test('Given a door image draft, When processing fails and the door changes, Then errors preserve the draft and outgoing object URLs are revoked', async () => {
    // Given a selected file and authored text; observe the browser URL lifecycle.
    const state = environment();
    const { page } = state;
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      window.imageUrls = new Set();
      URL.createObjectURL = blob => { const url = create(blob); window.imageUrls.add(url); return url; };
      URL.revokeObjectURL = url => { window.imageUrls.delete(url); revoke(url); };
    });
    const calendar = await editor(state);
    await page.getByLabel(/^Tittel på innhold/).fill('Behold utkastet');
    await page.getByLabel('Bilde (valgfritt)', { exact: true }).setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') });

    // When the backend rejects invalid bytes, then navigation disposes the outgoing draft.
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Bildet kunne ikke behandles' }).waitFor();
    assert.equal(await page.getByLabel(/^Tittel på innhold/).inputValue(), 'Behold utkastet');
    assert.equal(await image(page).count(), 1);
    assert.equal((await read(state, 'get', { id: calendar.id })).doors[0].title, '');
    await page.getByRole('button', { name: 'Luke 2', exact: true }).click();

    // Then no unsaved image/text follows the numbered door and no object URL remains live.
    assert.equal(await image(page).count(), 0);
    assert.equal(await page.getByLabel(/^Tittel på innhold/).inputValue(), '');
    assert.equal(await page.evaluate(() => window.imageUrls.size), 0);
  });

  test('Given a door image at narrow and wide sizes, When language changes and keyboard controls are used, Then aspect ratio and authored text are preserved', async () => {
    // Given a portrait-independent saved image and authored Norwegian content.
    const state = environment();
    const { page } = state;
    await editor(state);
    await page.getByLabel(/^Tittel på innhold/).fill('Ærlig gave 🎁');
    await page.getByLabel('Bilde (valgfritt)', { exact: true }).setInputFiles(await file(page));
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await saved(page);

    // When interface language changes, then the image is viewed at both viewport widths.
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.getByRole('combobox').selectOption('en')]);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await loaded(page);
      const bounds = await image(page).boundingBox();
      assert(Math.abs(bounds.width / bounds.height - 2) < 0.01);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(state.reports, `door-image-${width}.png`), fullPage: true });
    }

    // Then translated controls remain labelled and keyboard removal only changes the draft.
    assert.equal(await page.getByLabel(/^Content title/).inputValue(), 'Ærlig gave 🎁');
    assert.equal(await page.getByLabel('Image (optional)', { exact: true }).getAttribute('accept'), 'image/jpeg,image/png,.jpg,.jpeg,.png');
    await page.getByRole('button', { name: 'Remove image', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await image(page).count(), 0);
    await page.getByText('You have unsaved changes.', { exact: true }).waitFor();
  });
}
