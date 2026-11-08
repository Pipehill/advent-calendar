export type DoorRectangle = { number: number; x: number; y: number; size: number };
export type CalendarGeometry = { width: number; height: number; doors: DoorRectangle[] };

export const doorClearance = 8;
const christmasScale = Math.sqrt(1.5);

function seededRandom(order: readonly number[]) {
  let seed = order.reduce((value, number) => Math.imul(value ^ number, 16777619), 2166136261);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function overlaps(first: DoorRectangle, second: DoorRectangle) {
  return (
    first.x < second.x + second.size + doorClearance &&
    first.x + first.size + doorClearance > second.x &&
    first.y < second.y + second.size + doorClearance &&
    first.y + first.size + doorClearance > second.y
  );
}

// An irregular, verified reserve pattern in door-size units. The central gap
// accommodates Christmas Eve even at the narrowest supported board width.
const reservePositions = [
  [0.04, 0.02],
  [1.4, 0.06],
  [2.76, 0],
  [0, 1.34],
  [1.38, 1.29],
  [2.72, 1.37],
  [4.12, 1.31],
  [0.06, 2.62],
  [1.42, 2.67],
  [2.78, 2.6],
  [4.08, 2.65],
  [0.02, 3.94],
  [4.14, 3.98],
  [0.07, 5.25],
  [1.39, 5.22],
  [2.75, 5.28],
  [4.1, 5.2],
  [0.01, 6.56],
  [1.43, 6.51],
  [2.79, 6.59],
  [4.13, 6.54],
  [1.37, 7.8],
  [2.73, 7.85],
];

function reserveLayout(order: readonly number[], width: number, height: number, size: number) {
  let index = 0;
  return order.map((number) => {
    if (number === 24) {
      const enlarged = size * christmasScale;
      return { number, x: (width - enlarged) / 2, y: (height - enlarged) / 2, size: enlarged };
    }
    const [x, y] = reservePositions[index++];
    return { number, x: (x / 4.14) * (width - size), y: (y / 7.85) * (height - size), size };
  });
}

export function scatteredLayout(
  order: readonly number[],
  width: number,
  candidateLimit = 240,
): CalendarGeometry {
  const size = Math.max(44, Math.min(78, width * 0.085));
  const height = Math.max(width * 0.68, size * 9.3);
  const random = seededRandom(order);

  // Retry a bounded number of complete packings, always reserving door 24 first.
  for (let retry = 0; retry < 3; retry++) {
    const enlarged = size * christmasScale;
    const doors: DoorRectangle[] = [
      {
        number: 24,
        x: width * (0.45 + random() * 0.1) - enlarged / 2,
        y: height * (0.45 + random() * 0.1) - enlarged / 2,
        size: enlarged,
      },
    ];
    for (const number of order.filter((number) => number !== 24)) {
      for (let attempt = 0; attempt < candidateLimit; attempt++) {
        const candidate = {
          number,
          x: random() * (width - size),
          y: random() * (height - size),
          size,
        };
        if (doors.every((door) => !overlaps(candidate, door))) {
          doors.push(candidate);
          break;
        }
      }
    }
    if (doors.length === 24) {
      doors.sort((first, second) => order.indexOf(first.number) - order.indexOf(second.number));
      return { width, height, doors };
    }
  }
  return { width, height, doors: reserveLayout(order, width, height, size) };
}
