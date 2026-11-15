import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provisionRecipient } from './calendar-fixture.mjs';
import { prepareAssignments, fillLogin, deferred, waitForGate, fulfillAfterRelease } from './login-fixture.mjs';

export function registerLoginRoutingScenarios(environment) {
  for (const count of [0, 1, 2, 13]) {
    test(`Given a recipient with ${count} real assignments across years, When login resolves current assignments, Then the destination and explicit My page navigation match the total`, async t => {
      // Given isolated assignments, including empty calendars in past and future years.
      const state = environment();
      const reader = await prepareAssignments(state, t, count);
      const destination = count === 1 ? `/my-calendars/${reader.calendars[0].id}` : '/my-page';

      // When an actual browser login observes the server-selected destination.
      await state.signIn(reader.account, destination, reader.page);
      const response = await reader.page.reload({ waitUntil: 'networkidle' });

      // Then zero/multiple assignments use the chooser, while one empty assignment opens directly.
      assert.equal(new URL(reader.page.url()).pathname, destination);
      assert.match(response.headers()['cache-control'], /no-store/);
      if (count === 0) {
        await reader.page.getByText('Du har ikke noen kalendere enda...', { exact: true }).waitFor();
      } else if (count === 1) {
        assert.equal(await reader.page.locator('[data-door-number]').count(), 24);
        assert.equal(await reader.page.locator('[data-door-number="1"]').getAttribute('data-state'), 'empty');
        await reader.page.goto(`${state.frontendUrl}/my-page`, { waitUntil: 'networkidle' });
        assert.equal(new URL(reader.page.url()).pathname, '/my-page');
        await chooseAndReturn(reader, reader.calendars[0]);
        await reader.page.reload({ waitUntil: 'networkidle' });
        assert.equal(new URL(reader.page.url()).pathname, '/my-page');
      } else if (count === 2) {
        assert.equal(await calendarLinks(reader.page).count(), 2);
        await reader.page.getByRole('link', { name: /2025/ }).waitFor();
        await reader.page.getByRole('link', { name: /2090/ }).waitFor();
        await chooseAndReturn(reader, reader.calendars[0]);
        await chooseAndReturn(reader, reader.calendars[1]);
      } else {
        assert.equal(await calendarLinks(reader.page).count(), 12);
        await reader.page.getByRole('button', { name: 'Neste side', exact: true }).click();
        await reader.page.waitForFunction(() => document.querySelectorAll('a[href^="/my-calendars/"]').length === 1);
        await reader.page.getByText('Side 2 av 2', { exact: true }).waitFor();
      }
    });
  }

  for (const change of ['revocation', 'reassignment']) {
    test(`Given a selected sole calendar, When ${change} occurs before its document loads, Then fresh authorization withholds the board and content`, { timeout: 60000 }, async t => {
      // Given the login entry has selected a real recipient calendar but its target request is held.
      const release = deferred();
      t.after(() => release.resolve());
      const state = environment();
      const reader = await prepareAssignments(state, t, 1);
      const calendar = reader.calendars[0];
      const next = change === 'reassignment' ? await provisionRecipient(state) : null;
      const received = deferred();
      await reader.page.route('**/login-complete', async route => {
        // Playwright intercepts the first URL in a server redirect chain. Hold
        // its selected destination response before recipient SSR can begin.
        const response = await route.fetch({ maxRedirects: 0 });
        received.resolve(response);
        await fulfillAfterRelease(route, response, release, 'release the selected calendar redirect');
      });
      await fillLogin(reader, 'nb');

      // When another authorized operation removes access before recipient SSR starts.
      try {
        // DOM submission avoids Playwright waiting for the document deliberately
        // held below; keyboard activation is covered by the response-gate cases.
        await submitForm(reader.page);
        const selected = await waitForGate(received, 'receive the selected calendar redirect');
        assert.equal(new URL(selected.headers().location, state.frontendUrl).pathname, `/my-calendars/${calendar.id}`);
        if (next) {
          const response = await state.mutation('calendar.saveRecipient', { id: calendar.id, recipientId: next.user.id });
          assert.equal(response.status(), 200, await response.text());
        } else {
          state.revoke(reader.account.username);
        }
        release.resolve();
        await reader.page.waitForURL(`${state.frontendUrl}${next ? `/my-calendars/${calendar.id}` : '/login'}`);
        await reader.page.waitForLoadState('networkidle');

        // Then the newly loaded document exposes no former recipient board or calendar metadata.
        assert.equal(await reader.page.locator('[data-door-number]').count(), 0);
        assert(!(await reader.page.content()).includes(calendar.title));
        if (next) await reader.page.getByText('Vi fant ikke denne kalenderen.', { exact: true }).waitFor();
      } finally { release.resolve(); }
    });
  }
}

async function chooseAndReturn(reader, calendar) {
  await reader.page.locator(`a[href="/my-calendars/${calendar.id}"]`).click();
  await reader.page.waitForURL(`${reader.frontendUrl}/my-calendars/${calendar.id}`);
  await reader.page.getByRole('link', { name: 'Min side', exact: true }).click();
  await reader.page.waitForURL(`${reader.frontendUrl}/my-page`);
  await reader.page.waitForLoadState('networkidle');
}

const calendarLinks = page => page.locator('a[href^="/my-calendars/"]');

function submitForm(page) {
  return page.evaluate(() => document.querySelector('form').requestSubmit());
}
