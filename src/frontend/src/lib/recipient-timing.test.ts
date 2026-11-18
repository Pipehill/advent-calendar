import { expect, test } from 'vitest';
import { overwriteGetLocale } from '../generated/paraglide/runtime.js';
import { recipientWaitMessage } from './recipient-presentation';

test.each([
  ['early', '2026-11-17T12:00:00Z', '2026-12-17T06:00:00Z', '17. desember', '17 December'],
  ['same morning', '2026-12-01T05:59:59Z', '2026-12-01T06:00:00Z', '1. desember', '1 December'],
  [
    'next year',
    '2026-12-01T06:00:00Z',
    '2027-12-01T06:00:00Z',
    '1. desember 2027',
    '1 December 2027',
  ],
  ['Oslo new year', '2026-12-31T23:30:00Z', '2027-12-01T06:00:00Z', '1. desember', '1 December'],
  [
    'Oslo opening date',
    '2026-11-17T12:00:00Z',
    '2026-11-30T23:30:00Z',
    '1. desember',
    '1 December',
  ],
] as const)(
  'Given %s metadata, When timing help is formatted in both languages, Then its exact date uses Oslo years and full months',
  (_scenario, server, opens, nb, en) => {
    // Given backend-authorized instants independent of the host timezone and clock.
    const expected = {
      nb: `Du må vente til kl 7 den ${nb} før du kan åpne denne luken.`,
      en: `You must wait until 07:00 on ${en} before you can open this door.`,
    };

    for (const locale of ['nb', 'en'] as const) {
      overwriteGetLocale(() => locale);

      // When the maintained translation receives the localized opening date.
      const message = recipientWaitMessage(opens, server);

      // Then wording, year inclusion and Norwegian ordinal punctuation are exact.
      expect(message).toBe(expected[locale]);
    }
  },
);
