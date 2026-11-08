import { expect, test } from 'vitest';
import { saveDoorInput } from './calendar-input';

const door = { id: '00000000-0000-4000-8000-000000000001', number: 1, title: '', text: '' };

test.each([
  [{}, true],
  [{ imageAction: 'keep' }, true],
  [{ imageAction: 'remove' }, true],
  [{ imageAction: 'replace', imageData: 'AQID' }, true],
  [{ imageAction: null }, false],
  [{ imageData: null }, false],
  [{ imageAction: 'replace' }, false],
  [{ imageAction: 'replace', imageData: '' }, false],
  [{ imageAction: 'keep', imageData: 'AQID' }, false],
  [{ imageAction: 'remove', imageData: 'AQID' }, false],
  [{ imageAction: 'replace', imageData: '%%%%' }, false],
  [{ imageAction: 'replace', imageData: 'AAA' }, false],
])(
  'Given image fields %j, When save input is validated, Then acceptance is %s',
  (fields, accepted) => {
    // Given explicit action/data combinations independent of browser controls.
    const input = { ...door, ...fields };

    // When the BFF input schema runs.
    const result = saveDoorInput.safeParse(input);

    // Then missing fields preserve text-only compatibility and contradictory fields fail.
    expect(result.success).toBe(accepted);
  },
);

test.each([10_000_000, 10_000_001])(
  'Given %i decoded source bytes, When base64 input is checked, Then the byte limit is independent of encoding length',
  (length) => {
    // Given the boundary where both byte sizes have the same base64 character length.
    const input = {
      ...door,
      imageAction: 'replace',
      imageData: Buffer.alloc(length).toString('base64'),
    };

    // When validating a large input without recursive regex groups or native processing.
    const result = saveDoorInput.safeParse(input);

    // Then the source byte limit is enforced exactly.
    expect(result.success).toBe(length === 10_000_000);
  },
);
