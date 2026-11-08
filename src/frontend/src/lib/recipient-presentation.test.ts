import { afterEach, expect, test, vi } from 'vitest';
import type { RecipientCalendarDto, RecipientOpeningDto } from '../generated/backend';
import { recipientContentCurrent, recipientRefreshDelay } from './recipient-presentation';

afterEach(() => vi.restoreAllMocks());

test.each([
  ['2026-12-01T05:59:59.000Z', '2026-12-01T06:00:00.000Z', 1100],
  ['2026-12-01T06:00:00.000Z', '2026-12-01T06:00:00.000Z', 250],
  ['2026-12-01T00:00:00.000Z', '2026-12-24T06:00:00.000Z', 30000],
  ['2026-12-24T06:00:00.000Z', null, 30000],
] as const)(
  'Given server time %s and next opening %s, When the browser clock is forged, Then the relative refresh delay stays %s milliseconds',
  (server, next, expected) => {
    // Given backend instants and an unrelated forged browser clock.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-12-24T12:00:00Z'));

    // When a refresh timer is calculated from the backend response.
    const delay = recipientRefreshDelay(server, next);

    // Then only a bounded backend-relative read is scheduled; the clock grants no availability.
    expect(delay).toBe(expected);
  },
);

test.each([
  ['same revision and available door', 'saved', 'available', true],
  ['changed calendar content', 'changed', 'available', false],
  ['previously opened future door', 'saved', 'locked', false],
  ['previously opened now empty door', 'saved', 'empty', false],
] as const)(
  'Given %s, When selected content is validated for rendering, Then current state controls visibility',
  (_scenario, revision, state, expected) => {
    // Given a selected authorized response and a subsequently refreshed safe board.
    const opening = { lastModifiedAt: 'saved', door: { number: 1 } } as RecipientOpeningDto;
    const board = {
      lastModifiedAt: revision,
      doors: [{ number: 1, state, openedAt: 'earlier' }],
    } as RecipientCalendarDto;

    // When stale selected content is considered for presentation.
    const visible = recipientContentCurrent(board, opening);

    // Then current metadata/state overrides all personal history.
    expect(visible).toBe(expected);
  },
);
