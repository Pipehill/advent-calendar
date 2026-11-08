import { describe, expect, it } from 'vitest';
import { doorClearance, scatteredLayout } from './calendar-layout';

const ascending = Array.from({ length: 24 }, (_, index) => index + 1);
const permutations = [
  ascending,
  [...ascending].reverse(),
  [...ascending.slice(12), ...ascending.slice(0, 12)],
  ascending.map((_, index) => ((index * 7) % 24) + 1),
];

describe.each([248, 303, 624, 1008])('A scattered board of width %i', (width) => {
  it.each(permutations.map((order, index) => ({ order, label: index + 1 })))(
    'Given permutation $label, When packed, Then all doors fit with clear targets and central enlarged Christmas Eve',
    ({ order }) => {
      // Given a saved valid permutation at this supported board width.
      const expectedNumbers = [...order].sort((a, b) => a - b);

      // When the pure layout packs the board.
      const geometry = scatteredLayout(order, width);

      // Then numbered associations, bounds, clearance, size and centrality hold.
      verifyGeometry(geometry, expectedNumbers);
      expect(geometry.doors.map((door) => door.number)).toEqual(order);
    },
  );

  it('Given exhausted candidates, When the reserve pattern is used, Then its irregular targets also fit without overlap', () => {
    // Given the candidate budget is exhausted before any ordinary door can fit.
    const candidateLimit = 0;

    // When the bounded packer falls back to its reserve geometry.
    const geometry = scatteredLayout(permutations[1], width, candidateLimit);

    // Then fallback meets the same guarantees and has no shared rows or columns.
    verifyGeometry(geometry, ascending);
    expect(new Set(geometry.doors.map((door) => door.x)).size).toBe(24);
    expect(new Set(geometry.doors.map((door) => door.y)).size).toBe(24);
  });
});

it('Given the same saved order, When read repeatedly or resized away and back, Then geometry is identical', () => {
  // Given a stored arrangement and its original viewport geometry.
  const original = scatteredLayout(permutations[3], 303);

  // When another viewport is computed and the original is restored.
  scatteredLayout(permutations[3], 1008);
  const restored = scatteredLayout(permutations[3], 303);

  // Then geometry is independent of render history and input order is unchanged.
  expect(restored).toEqual(original);
  expect(permutations[3][0]).toBe(1);
});

it('Given an explicitly changed saved order, When packed, Then the whole permutation influences numbered placement', () => {
  // Given arrangements differing in the positions of only two saved numbers.
  const changed = [...ascending];
  [changed[0], changed[1]] = [changed[1], changed[0]];

  // When both arrangements are packed at the same width.
  const first = scatteredLayout(ascending, 624);
  const second = scatteredLayout(changed, 624);

  // Then even Christmas Eve geometry changes with the complete permutation seed.
  expect(first.doors.find((door) => door.number === 24)).not.toEqual(
    second.doors.find((door) => door.number === 24),
  );
});

function verifyGeometry(geometry: ReturnType<typeof scatteredLayout>, numbers: number[]) {
  const { width, height, doors } = geometry;
  expect(doors.map((door) => door.number).sort((a, b) => a - b)).toEqual(numbers);
  for (const door of doors) {
    expect(door.size).toBeGreaterThanOrEqual(44);
    expect(door.x).toBeGreaterThanOrEqual(0);
    expect(door.y).toBeGreaterThanOrEqual(0);
    expect(door.x + door.size).toBeLessThanOrEqual(width);
    expect(door.y + door.size).toBeLessThanOrEqual(height);
    for (const other of doors.filter((item) => item.number !== door.number)) {
      const clear =
        door.x + door.size + doorClearance <= other.x + 1e-8 ||
        other.x + other.size + doorClearance <= door.x + 1e-8 ||
        door.y + door.size + doorClearance <= other.y + 1e-8 ||
        other.y + other.size + doorClearance <= door.y + 1e-8;
      expect(clear, `Doors ${door.number} and ${other.number} have clearance`).toBe(true);
    }
  }
  const ordinary = doors.find((door) => door.number === 1);
  const christmas = doors.find((door) => door.number === 24);
  if (!ordinary || !christmas) throw new Error('Numbered doors are missing');
  expect(christmas.size ** 2 / ordinary.size ** 2).toBeCloseTo(1.5, 12);
  expect((christmas.x + christmas.size / 2) / width).toBeGreaterThanOrEqual(1 / 3);
  expect((christmas.x + christmas.size / 2) / width).toBeLessThanOrEqual(2 / 3);
  expect((christmas.y + christmas.size / 2) / height).toBeGreaterThanOrEqual(1 / 3);
  expect((christmas.y + christmas.size / 2) / height).toBeLessThanOrEqual(2 / 3);
}
