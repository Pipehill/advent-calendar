import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigateDocument } from './release-browser-navigation.mjs';

const url = 'https://localhost:3000/login';
const options = { waitUntil: 'networkidle' };

test('Given a successful document request, When navigation completes, Then its response is returned without another request', async () => {
  // Given a browser whose document request succeeds immediately.
  const response = { status: 200 };
  const calls = [];
  const page = {
    async goto(...args) {
      calls.push(args);
      return response;
    },
  };

  // When the read-only document is requested.
  const result = await navigateDocument(page, url);

  // Then the caller receives that response after one hydrated document load.
  assert.equal(result, response);
  assert.deepEqual(calls, [[url, options]]);
});

test('Given one transient network change, When document navigation recovers, Then only the same document request is repeated', async () => {
  // Given Chromium rejects the first document request after an interface change.
  const response = { status: 200 };
  const calls = [];
  const page = {
    async goto(...args) {
      calls.push(args);
      if (calls.length === 1) throw new Error('page.goto: net::ERR_NETWORK_CHANGED');
      return response;
    },
  };

  // When the read-only navigation encounters that transient failure.
  const result = await navigateDocument(page, url);

  // Then the response is preserved and the retry uses the same URL and load condition.
  assert.equal(result, response);
  assert.deepEqual(calls, [[url, options], [url, options]]);
});

test('Given persistent network changes, When both document requests fail, Then the second failure propagates after the single retry', async () => {
  // Given a browser that cannot recover from its interface changes.
  const failures = [new Error('net::ERR_NETWORK_CHANGED: first'), new Error('net::ERR_NETWORK_CHANGED: second')];
  let attempts = 0;
  const page = {
    async goto() {
      throw failures[attempts++];
    },
  };

  // When the caller attempts the read-only navigation.
  const navigate = () => navigateDocument(page, url);

  // Then a persistent failure cannot become an unbounded retry or a passing check.
  await assert.rejects(navigate, error => error === failures[1]);
  assert.equal(attempts, 2);
});

test('Given a different navigation failure, When the document is requested, Then that failure propagates without a retry', async () => {
  // Given a connection failure that is not Chromium interface-change noise.
  const failure = new Error('page.goto: net::ERR_CONNECTION_REFUSED');
  let attempts = 0;
  const page = {
    async goto() {
      attempts++;
      throw failure;
    },
  };

  // When the caller attempts the read-only navigation.
  const navigate = () => navigateDocument(page, url);

  // Then unrelated failures remain visible and fail on the first request.
  await assert.rejects(navigate, error => error === failure);
  assert.equal(attempts, 1);
});
