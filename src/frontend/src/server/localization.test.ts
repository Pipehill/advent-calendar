import { expect, test } from 'vitest';
import * as m from '../generated/paraglide/messages.js';
import { getLocale } from '../generated/paraglide/runtime.js';
import { paraglideMiddleware } from '../generated/paraglide/server.js';
import { createContext } from './context';

test('Given no language selection, When a page is rendered, Then Norwegian is used even with English browser preference', async () => {
  // Given a reader without a selected language.
  const request = new Request('http://frontend.test', { headers: { 'Accept-Language': 'en' } });

  // When request-local locale resolution runs.
  const response = await paraglideMiddleware(request, () =>
    Response.json({ locale: getLocale(), label: m.language_label() }),
  );

  // Then the explicit Norwegian default wins.
  expect(await response.json()).toEqual({ locale: 'nb', label: 'Språk' });
});

test('Given concurrent Norwegian and English readers, When translations resolve asynchronously, Then each keeps its selected language', async () => {
  // Given two different reader cookies and overlapping request lifetimes.
  const render = (locale: string) =>
    paraglideMiddleware(
      new Request('http://frontend.test', {
        headers: { Cookie: `PARAGLIDE_LOCALE=${locale}` },
      }),
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Response.json({
          locale: getLocale(),
          label: m.language_label(),
          error: m.error_missing(),
        });
      },
    );

  // When both request-local translations run concurrently.
  const responses = await Promise.all([render('nb'), render('en')]);
  const results = await Promise.all(responses.map((response) => response.json()));

  // Then language and error text remain isolated.
  expect(results).toEqual([
    { locale: 'nb', label: 'Språk', error: 'Vi fant ikke denne kalenderen.' },
    { locale: 'en', label: 'Language', error: 'We could not find this calendar.' },
  ]);
});

test('Given valid incoming trace context, When concurrent BFF contexts are created, Then each retains the proper trace and its own span', () => {
  // Given two independent callers, one with an existing W3C trace.
  const incoming = '00-12345678901234567890123456789012-1234567890123456-01';

  // When request contexts are created.
  const first = createContext(
    new Request('http://frontend.test', { headers: { traceparent: incoming } }),
  );
  const second = createContext(new Request('http://frontend.test'));

  // Then traces are correlated per request without sharing mutable state.
  expect(first.traceId).toBe(incoming.split('-')[1]);
  expect(first.traceparent).not.toBe(incoming);
  expect(second.traceId).not.toBe(first.traceId);
});
