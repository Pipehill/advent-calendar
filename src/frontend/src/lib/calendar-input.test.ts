import { expect, test } from 'vitest';
import {
  createCalendarInput,
  doorContentInput,
  saveDoorInput,
  saveLayoutInput,
} from './calendar-input';

const id = '00000000-0000-4000-8000-000000000001';

test.each([['woodland'], ['sleigh'], ['playtime'], ['aurora']])(
  'Given background %s and a padded Unicode name, When creation is validated, Then the shared policy preserves the trimmed name',
  (background) => {
    // Given an assigned recipient and .NET Unicode whitespace.
    const input = { title: '\u0085 Ærlig jul 🎄 \u0085', recipientId: id, background };

    // When runtime creation validation runs.
    const result = createCalendarInput.parse(input);

    // Then the selected background survives and only outer whitespace is removed.
    expect(result).toEqual({ ...input, title: 'Ærlig jul 🎄' });
  },
);

test.each([
  { title: '🎄'.repeat(100), accepted: true },
  { title: '🎄'.repeat(101), accepted: false },
  { title: ' ', accepted: false },
  { title: '\uD800', accepted: false },
  { title: '\0', accepted: false },
])(
  'Given a calendar title boundary $accepted, When creation is validated, Then Unicode policy decides acceptance',
  ({ title, accepted }) => {
    // Given a Unicode calendar name and valid other settings.
    const input = { title, recipientId: id, background: 'woodland' };

    // When the BFF schema validates the request.
    const result = createCalendarInput.safeParse(input);

    // Then limits count code points and reject invalid encoding/NUL.
    expect(result.success).toBe(accepted);
  },
);

test.each([
  { title: '🎁'.repeat(50), text: '🎄'.repeat(5000), accepted: true },
  { title: '🎁'.repeat(51), text: '', accepted: false },
  { title: '', text: '🎄'.repeat(5001), accepted: false },
  { title: '', text: '', accepted: true },
  { title: 'Ærlig', text: '<b>plain</b>\nØnsker', accepted: true },
  { title: null, text: '', accepted: false },
  { title: '', text: null, accepted: false },
  { title: '', accepted: false },
  { title: '\uD800', text: '', accepted: false },
  { title: '', text: '\0', accepted: false },
])(
  'Given door content with acceptance $accepted, When the editor validates it, Then required plain text and Unicode bounds are enforced',
  ({ accepted, ...input }) => {
    // Given potentially missing, invalid or boundary door content.
    const original = { ...input };

    // When the same editor/BFF schema runs.
    const result = doorContentInput.safeParse(input);

    // Then valid content is preserved without trimming or HTML interpretation.
    expect(result.success).toBe(accepted);
    if (result.success) expect(result.data).toEqual(original);
  },
);

test('Given caller-controlled identity or an invalid layout, When calendar requests are validated, Then extra fields and unsupported values are rejected', () => {
  // Given a caller attempting to choose ownership or invalid door/layout values.
  const creation = { title: 'Calendar', recipientId: id, background: 'woodland', ownerId: id };

  // When the public BFF inputs are checked independently.
  const results = [
    createCalendarInput.safeParse(creation),
    saveDoorInput.safeParse({ id, number: 25, title: '', text: '' }),
    saveLayoutInput.safeParse({ id, layout: 'shuffle-on-read' }),
  ];

  // Then no invalid request is accepted.
  expect(results.every((result) => !result.success)).toBe(true);
});
