import assert from 'node:assert/strict';

export async function measureDoors(page) {
  // Allow resize observation and its React update to reach a painted frame.
  await page.locator('.calendar-doors').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.locator('.calendar-doors').evaluate(board => {
    const bounds = board.getBoundingClientRect();
    return {
      width: bounds.width, height: bounds.height,
      doors: Array.from(board.querySelectorAll('button')).map(button => {
        const rectangle = button.getBoundingClientRect();
        return { number: Number(button.textContent), x: rectangle.x - bounds.x, y: rectangle.y - bounds.y, width: rectangle.width, height: rectangle.height };
      }),
    };
  });
}

export function assertDoorGeometry({ width, height, doors }, layout) {
  assert.deepEqual(doors.map(door => door.number).sort((a, b) => a - b), Array.from({ length: 24 }, (_, index) => index + 1));
  for (const door of doors) {
    assert(door.width >= 43.98 && door.height >= 43.98, `Door ${door.number} has a touch target`);
    assert(door.x >= -0.02 && door.y >= -0.02 && door.x + door.width <= width + 0.02 && door.y + door.height <= height + 0.02, `Door ${door.number} fits the canvas`);
    for (const other of doors.filter(other => other.number !== door.number)) {
      const gap = layout === 'random' ? 7.95 : 0;
      assert(door.x + door.width + gap <= other.x || other.x + other.width + gap <= door.x || door.y + door.height + gap <= other.y || other.y + other.height + gap <= door.y, `Doors ${door.number} and ${other.number} are separate`);
    }
  }
  const ordinary = doors.find(door => door.number === 1);
  const christmas = doors.find(door => door.number === 24);
  const ratio = (christmas.width * christmas.height) / (ordinary.width * ordinary.height);
  assert(Math.abs(ratio - (layout === 'random' ? 1.5 : 1)) < 0.003, 'Christmas Eve area ratio');
  if (layout === 'random') {
    assert((christmas.x + christmas.width / 2) / width >= 1 / 3 && (christmas.x + christmas.width / 2) / width <= 2 / 3);
    assert((christmas.y + christmas.height / 2) / height >= 1 / 3 && (christmas.y + christmas.height / 2) / height <= 2 / 3);
    assert(new Set(doors.map(door => door.x.toFixed(2))).size >= 20, 'Scattered horizontal positions');
    assert(new Set(doors.map(door => door.y.toFixed(2))).size >= 20, 'Scattered vertical positions');
  } else {
    assert.deepEqual(doors.map(door => door.number), Array.from({ length: 24 }, (_, index) => index + 1));
  }
}
