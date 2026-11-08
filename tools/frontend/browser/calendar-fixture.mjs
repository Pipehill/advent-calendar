import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const owner = accounts => accounts.find(account => account.username === 'browser-admin');
export const recipient = accounts => accounts.find(account => account.username === 'browser-user');
export const sessionCookie = async context => {
  const cookie = (await context.cookies()).find(item => item.name === 'advent.auth');
  assert(cookie, 'The authenticated browser has an opaque session cookie');
  return cookie;
};
export const logout = async (page, frontendUrl) => {
  await page.getByRole('button', { name: 'Logg ut', exact: true }).click();
  await page.waitForURL(frontendUrl + '/');
};
export const create = async (state, title = 'Prepared calendar') => {
  const response = await state.mutation('calendar.create', { title, recipientId: recipient(state.accounts).id, background: 'aurora' });
  assert.equal(response.status(), 200, await response.text());
  return (await response.json()).result.data;
};
export const createRecipient = async state => {
  const response = await state.mutation('accounts.create', {
    name: 'Ny kalenderbruker ÆØÅ', username: `recipient-${randomUUID().slice(0, 8)}`,
    password: `Recipient!${randomUUID()}`, role: 'calendarUser',
  });
  assert.equal(response.status(), 200, await response.text());
  return (await response.json()).result.data;
};
