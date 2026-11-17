import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRecipientContentHidden, assertRecipientHistoryEmpty, dialog, door, prepare, withRecipientRoutes } from './recipient-opening.test.mjs';

const status = page => page.locator('#recipient-door-status');

export function registerRecipientRaceScenarios(environment) {
  for (const outcome of [
    { label: 'changed opening schedule', code: 'CONFLICT', status: 409, state: 'locked' },
    { label: 'removed content', code: 'CONFLICT', status: 409, state: 'empty' },
    { label: 'generic conflict', code: 'CONFLICT', status: 409, state: 'available' },
    { label: 'reassignment', code: 'FORBIDDEN', status: 403 },
    { label: 'revoked session', code: 'UNAUTHORIZED', status: 401 },
    { label: 'network service failure', code: 'SERVICE_UNAVAILABLE', status: 503 },
  ]) {
    test(`Given an apparently available recipient door and ${outcome.label}, When opening is denied, Then only confirmed locked metadata produces timing feedback`, async () => {
      // Given a safe available board and an opening race with a deterministic failure.
      const state = environment();
      await withRecipientRoutes(state, async () => {
        const calendar = await prepare(state);
        let denied = false;
        let refreshed = 0;
        let writes = 0;
        await state.page.route('**/api/trpc/recipient.get*', async route => {
          if (denied) refreshed++;
          if (denied && !outcome.state) {
            await route.fulfill({ status: outcome.status, json: failure(outcome.code, outcome.status) });
            return;
          }
          const response = await route.fetch();
          const body = await response.json();
          if (denied) {
            body.result.data.serverTime = '2026-11-17T12:00:00Z';
            body.result.data.nextOpeningAt = null;
            body.result.data.doors[0].state = outcome.state;
            body.result.data.doors[0].opensAt = '2090-12-01T06:00:00Z';
          }
          await route.fulfill({ response, json: body });
        });
        await state.page.route('**/api/trpc/recipient.open', route => {
          denied = true;
          writes++;
          return route.fulfill({ status: outcome.status, json: failure(outcome.code, outcome.status) });
        });

        // When one explicit opening is denied after the earlier available metadata.
        await door(state.page, 1).click();
        if (outcome.state === 'locked') {
          await state.page.getByText('Du må vente til kl 7 den 1. desember 2090 før du kan åpne denne luken.', { exact: true }).waitFor();
        } else if (outcome.status === 401 || outcome.status === 403) {
          await state.page.waitForURL('**/login');
        } else {
          await state.page.getByRole('alert').first().waitFor();
        }

        // Then no failure invents timing authority, opens content or commits history.
        assert.equal(writes, 1);
        await assertRecipientContentHidden(state.page);
        assert.equal(await state.page.getByText(/Du må vente til kl 7 den/).count(), outcome.state === 'locked' ? 1 : 0);
        if (outcome.status === 409) assert(refreshed >= 1, 'A conflict is classified only after an authorized board read');
        await assertRecipientHistoryEmpty(state, calendar);
      });
    });
  }

  test('Given a recipient read started before an opening conflict, When the earlier read remains delayed, Then a subsequent authorized read confirms timing without trusting stale availability', async () => {
    // Given an available board and a captured background read with its older available state.
    const state = environment();
    let release;
    await withRecipientRoutes(state, async () => {
      const calendar = await prepare(state);
      let captured;
      let delivered;
      const gate = new Promise(resolve => { release = resolve; });
      const staleCaptured = new Promise(resolve => { captured = resolve; });
      const staleDelivered = new Promise(resolve => { delivered = resolve; });
      let reads = 0;
      let writes = 0;
      await state.page.route('**/api/trpc/recipient.get*', async route => {
        const sequence = ++reads;
        const response = await route.fetch();
        const body = await response.json();
        if (sequence === 1) {
          captured();
          await gate;
          await route.fulfill({ response, json: body }).catch(() => {});
          delivered();
          return;
        }
        body.result.data.serverTime = '2026-11-17T12:00:00Z';
        body.result.data.nextOpeningAt = null;
        body.result.data.doors[0].state = 'locked';
        body.result.data.doors[0].opensAt = '2090-12-01T06:00:00Z';
        await route.fulfill({ response, json: body });
      });
      await state.page.route('**/api/trpc/recipient.open', route => {
        writes++;
        return route.fulfill({ status: 409, json: failure('CONFLICT', 409) });
      });

      // When opening is denied while the older background read has not reached the browser.
      await state.page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
      await staleCaptured;
      await door(state.page, 1).click();
      await state.page.getByText('Du må vente til kl 7 den 1. desember 2090 før du kan åpne denne luken.', { exact: true }).waitFor();
      release();
      await staleDelivered;

      // Then only a new read authorizes timing and the old result cannot restore availability or content.
      assert(reads >= 2, 'The pre-conflict read is replaced with a subsequent authorized board read');
      assert.equal(writes, 1);
      assert.equal(await door(state.page, 1).getAttribute('data-state'), 'locked');
      assert.equal(await dialog(state.page).count(), 0);
      await assertRecipientHistoryEmpty(state, calendar);
    }, () => release?.());
  });

  test('Given visible recipient timing feedback, When empty selection or refreshed availability replaces the locked door, Then stale timing clears and ordinary opening remains available', async () => {
    // Given actual available content with one temporarily locked board response.
    const state = environment();
    await withRecipientRoutes(state, async () => {
      await prepare(state, { image: true });
      let locked = true;
      await state.page.route('**/api/trpc/recipient.get*', async route => {
        const response = await route.fetch();
        const body = await response.json();
        body.result.data.nextOpeningAt = null;
        if (locked) body.result.data.doors[0].state = 'locked';
        await route.fulfill({ response, json: body });
      });
      await state.page.reload({ waitUntil: 'networkidle' });
      await door(state.page, 1).click();
      await status(state.page).waitFor();
      assert.match(await status(state.page).textContent(), /Du må vente til kl 7 den/);
      let writes = 0;
      state.page.on('request', request => { if (request.url().includes('recipient.open')) writes++; });

      // When an empty tile replaces timing help and later reconnect confirms availability.
      await door(state.page, 3).click({ force: true });
      await state.page.waitForFunction(() => !document.querySelector('#recipient-door-status')?.textContent.includes('Du må vente'));
      assert.equal(await door(state.page, 1).getAttribute('aria-describedby'), null);
      assert.equal(writes, 0);
      await door(state.page, 1).click();
      await state.page.getByText(/Du må vente til kl 7 den/).waitFor();
      locked = false;
      await state.page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
      await state.page.waitForFunction(() => document.querySelector('[data-door-number="1"]')?.dataset.state === 'available');
      await state.page.waitForFunction(() => !document.querySelector('#recipient-door-status')?.textContent.includes('Du må vente'));
      await door(state.page, 1).click();
      await dialog(state.page).waitFor();

      // Then the refreshed tile follows the normal opening path and no stale warning survives.
      assert.equal(writes, 1);
      assert.equal(await state.page.getByText(/Du må vente til kl 7 den/).count(), 0);
      assert.equal(await door(state.page, 1).getAttribute('data-opened'), 'true');
    });
  });
}

function failure(code, httpStatus) {
  return { error: { message: code, code: -32603, data: { code, httpStatus } } };
}
