import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const owner = accounts => accounts.find(account => account.username === 'browser-admin');
export const recipient = accounts => accounts.find(account => account.username === 'browser-user');
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
