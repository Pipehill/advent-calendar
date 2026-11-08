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

// An irregular, verified reserve pattern in fractions of the available travel. The central gap
// accommodates Christmas Eve even at the narrowest supported board width.
const reservePositions = [
  [0.00965853, 0.09355525],
  [0.28542764, 0.68583486],
  [0.49976034, 0.81130242],
  [0.40211876, 0.96765045],
  [0.58574002, 0.13748762],
  [0.81965323, 0.52295502],
  [0.93950143, 0.85988639],
  [0.46218217, 0.01609678],
  [0.08899814, 0.87252936],
  [0.02569514, 0.43433897],
  [0.84379433, 0.98627394],
  [0.85234431, 0.64619749],
  [0.86382298, 0.17850663],
  [0.97027629, 0.37704688],
  [0.57291607, 0.35748362],
  [0.97430605, 0.0057882],
  [0.32943689, 0.18289593],
  [0.00584615, 0.29228604],
  [0.54674903, 0.65865207],
  [0.01835199, 0.59041305],
  [0.0252976, 0.72034894],
  [0.05653791, 0.9927914],
  [0.28749229, 0.33333598],
];

function reserveLayout(order: readonly number[], width: number, height: number, size: number) {
  let index = 0;
  return order.map((number) => {
    if (number === 24) {
      const enlarged = size * christmasScale;
      return { number, x: (width - enlarged) / 2, y: (height - enlarged) / 2, size: enlarged };
    }
    const [x, y] = reservePositions[index++];
    return { number, x: x * (width - size), y: y * (height - size), size };
  });
}

export function scatteredLayout(
  order: readonly number[],
  width: number,
  candidateLimit = 240,
): CalendarGeometry {
  const size = Math.max(44, Math.min(78, width * 0.085));
  const height = Math.max(width * 0.68, size * 11);
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
