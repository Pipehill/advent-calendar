import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { owner, provisionRecipient } from './calendar-fixture.mjs';
import { createBrowserReader } from './page-errors.mjs';

export async function prepareAssignments(state, t, count) {
  await state.signIn(owner(state.accounts));
  const { account, user } = await provisionRecipient(state);
  const calendars = [];
  for (let index = 0; index < count; index++) {
    const response = await state.mutation('calendar.create', {
      title: `Login destination ${randomUUID().slice(0, 8)} ${index}`,
      recipientId: user.id,
      background: 'aurora',
    });
    assert.equal(response.status(), 200, await response.text());
    const calendar = (await response.json()).result.data;
    state.fixture('calendar-year', calendar.id, index % 2 === 0 ? '2025' : '2090');
    calendars.push(calendar);
  }
  const reader = await createBrowserReader(state, t);
  return { ...reader, account, calendars };
}

export async function fillLogin(reader, locale) {
  await reader.context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: reader.frontendUrl }]);
  await reader.page.goto(`${reader.frontendUrl}/login`, { waitUntil: 'networkidle' });
  await reader.page.locator('#username').fill(reader.account.username);
  await reader.page.locator('#password').fill(reader.account.password);
}

export async function fulfillAfterRelease(route, response, release, phase) {
  // A failed assertion must not leave routing callbacks waiting during cleanup.
  // Their deadlines release transport; consumer gates retain the test failure.
  await waitForGate(release, phase, 30000).catch(() => {});
  await route.fulfill({ response }).catch(() => {});
}

export function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}

export async function waitForGate(gate, phase, timeout = 10000) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting to ${phase}.`)), timeout);
  });
  try {
    return await Promise.race([gate.promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
