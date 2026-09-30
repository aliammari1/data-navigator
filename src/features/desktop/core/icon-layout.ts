export interface IconPoint {
  x: number;
  y: number;
}

export interface IconBounds {
  width: number;
  height: number;
}

export const ICON_WIDTH = 80;
export const ICON_HEIGHT = 96;
const GRID_X = 96;
const GRID_Y = 104;
const ORIGIN = 16;

function overlaps(a: IconPoint, b: IconPoint): boolean {
  return Math.abs(a.x - b.x) < ICON_WIDTH && Math.abs(a.y - b.y) < ICON_HEIGHT;
}

function fits(point: IconPoint, occupied: IconPoint[], bounds: IconBounds): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x + ICON_WIDTH <= bounds.width &&
    point.y + ICON_HEIGHT <= bounds.height &&
    occupied.every((other) => !overlaps(point, other))
  );
}

export function findFreeIconPosition(
  preferred: IconPoint | undefined,
  occupied: IconPoint[],
  bounds: IconBounds,
): IconPoint {
  if (preferred && fits(preferred, occupied, bounds)) return preferred;

  const rows = Math.max(1, Math.floor((bounds.height - ORIGIN - ICON_HEIGHT) / GRID_Y) + 1);
  const columns = Math.max(1, Math.floor((bounds.width - ORIGIN - ICON_WIDTH) / GRID_X) + 1);
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const candidate = { x: ORIGIN + column * GRID_X, y: ORIGIN + row * GRID_Y };
      if (fits(candidate, occupied, bounds)) return candidate;
    }
  }

  // If the desktop is full, keep a distinct position that can become visible
  // when the window grows. Reusing an occupied slot would hide an existing item.
  let column = columns;
  while (occupied.some((point) => overlaps(point, { x: ORIGIN + column * GRID_X, y: ORIGIN }))) {
    column++;
  }
  return { x: ORIGIN + column * GRID_X, y: ORIGIN };
}

export function layoutDesktopIcons(
  ids: string[],
  saved: Record<string, IconPoint>,
  bounds: IconBounds,
): Record<string, IconPoint> {
  const result: Record<string, IconPoint> = {};
  const occupied: IconPoint[] = [];

  // Existing user placements take priority over automatically placed icons.
  for (const id of ids) {
    const point = saved[id];
    if (point && fits(point, occupied, bounds)) {
      result[id] = point;
      occupied.push(point);
    }
  }
  for (const id of ids) {
    if (result[id]) continue;
    const point = findFreeIconPosition(saved[id], occupied, bounds);
    result[id] = point;
    occupied.push(point);
  }
  return result;
}
