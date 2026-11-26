// Tile map, 48x32 tiles (1536x1024 px). '#' is wall, '.' is floor.
// `map` is one array that every module reads. It starts as the hand-built test arena below;
// loadTiles() overwrites it in place with a generated floor (src/floorgen.js) and updates
// `mapWidth` and `mapHeight` (live bindings, so read them at call time, not at import time).
// Out-of-bounds counts as wall.
const W = 48; // the hand-built arena size; generated floors are larger (config FLOOR_W x FLOOR_H)
const H = 32;
const grid = Array.from({ length: H }, () => Array(W).fill('.'));

function fill(x0, y0, x1, y1, ch = '#') {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = ch;
}

// Outer border.
fill(0, 0, W - 1, 0);
fill(0, H - 1, W - 1, H - 1);
fill(0, 0, 0, H - 1);
fill(W - 1, 0, W - 1, H - 1);

// Vertical divider with a 1-tile gap and a 3-tile door.
fill(16, 1, 16, 30);
fill(16, 9, 16, 9, '.');
fill(16, 20, 16, 22, '.');
// Second divider with a 2-tile gap.
fill(32, 1, 32, 30);
fill(32, 14, 32, 15, '.');

// Pillar field in the left room (inside corners and outside corners).
for (let y = 4; y <= 26; y += 5) for (let x = 4; x <= 12; x += 4) fill(x, y, x + 1, y + 1);
// Staircase wall in the middle room (diagonal edges test corner sliding).
for (let i = 0; i < 8; i++) fill(20 + i, 4 + i, 21 + i, 4 + i);
// L-shaped block and a 1-tile alcove in the middle room.
fill(22, 20, 28, 21);
fill(22, 22, 23, 26);
fill(26, 25, 26, 25);
// Right room: horizontal bars with 1-tile gaps.
fill(34, 6, 44, 6);
fill(37, 6, 37, 6, '.');
fill(34, 12, 44, 12);
fill(41, 12, 41, 12, '.');
fill(34, 24, 44, 25);
fill(39, 24, 40, 25, '.');

// The hand-built arena, kept as a fixed layout for collision and combat tests.
export const ARENA_ROWS = grid.map((r) => r.join(''));
export const ARENA_SPAWN = { tx: 2, ty: 2 };

export const map = grid;
export let mapWidth = W;
export let mapHeight = H;

// Replace the live map with rows of '#' and '.' (strings or arrays), resizing if needed.
export function loadTiles(rows) {
  const h = rows.length;
  const w = rows[0].length;
  grid.length = h;
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`row ${y}: expected ${w} tiles, got ${rows[y].length}`);
    const row = grid[y] ?? (grid[y] = []);
    row.length = w;
    for (let x = 0; x < w; x++) row[x] = rows[y][x];
  }
  mapWidth = w;
  mapHeight = h;
}

export function loadArena() {
  loadTiles(ARENA_ROWS);
}

export function isFloor(x, y) {
  return map[y]?.[x] === '.';
}
