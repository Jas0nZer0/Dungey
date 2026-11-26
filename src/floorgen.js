// Seeded room-and-corridor floor generator. Pure and DOM-free: it touches no globals,
// so tests run it in Node. generateFloor(seed) always returns the same floor for the same seed.
//
// Method: split the map with a BSP, put one room in each leaf, link rooms with a minimum
// spanning tree plus extra links (so every room has at least two exits), carve 2-wide
// L-shaped corridors, pick spawn and exit rooms, scatter cover, then validate. A layout that
// fails validation is discarded and the next attempt seed is tried (still deterministic).
import { FLOOR_W, FLOOR_H } from './config.js';
import { FLOOR } from './floorgen.config.js';
import { createRng, mixSeed } from './rng.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const makeGrid = (w, h) => Array.from({ length: h }, () => new Uint8Array(w));

// ---------- analysis helpers (also used by tests) ----------

// Breadth-first walk over floor tiles. `isFloor(x, y)` decides what is walkable.
// Returns a Int32Array of step counts (-1 for unreached) indexed y * w + x.
export function distanceField(w, h, isFloor, sx, sy) {
  const dist = new Int32Array(w * h).fill(-1);
  if (!isFloor(sx, sy)) return dist;
  const queue = [sx + sy * w];
  dist[sx + sy * w] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !isFloor(nx, ny)) continue;
      const ni = nx + ny * w;
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

// Longest run of consecutive floor tiles in any row or column of the room rectangle.
export function longestLane(isFloor, room) {
  let best = 0;
  for (let y = room.y; y < room.y + room.h; y++) {
    let run = 0;
    for (let x = room.x; x < room.x + room.w; x++) {
      run = isFloor(x, y) ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  for (let x = room.x; x < room.x + room.w; x++) {
    let run = 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      run = isFloor(x, y) ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
}

// Cover and fire-lane numbers for a floor. This is the proxy the gate and the tests use.
export function floorMetrics(floor) {
  const isFloor = (x, y) => floor.tiles[y]?.[x] === '.';
  const rooms = floor.rooms.map((r) => {
    let cover = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!isFloor(x, y)) cover++;
    return {
      area: r.w * r.h,
      cover,
      clutter: cover / (r.w * r.h),
      lane: longestLane(isFloor, r),
    };
  });
  const n = rooms.length;
  return {
    rooms,
    laneShare: rooms.filter((r) => r.lane >= FLOOR.laneMin).length / n,
    openShare: rooms.filter((r) => r.cover === 0).length / n,
    maxClutter: Math.max(...rooms.map((r) => r.clutter)),
  };
}

// Layout rules that exist to limit enemy snagging until M5 adds pathfinding.
// Returns counts of: dead-end floor tiles (one floor neighbour), 1-wide passages (walls on
// opposite sides), and diagonal pinches (floor, wall / wall, floor in a 2x2 window).
export function snagReport(tiles, w = FLOOR_W, h = FLOOR_H) {
  const f = (x, y) => tiles[y]?.[x] === '.';
  let deadEnds = 0;
  let narrow = 0;
  let pinches = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!f(x, y)) continue;
      const n = (f(x + 1, y) ? 1 : 0) + (f(x - 1, y) ? 1 : 0) + (f(x, y + 1) ? 1 : 0) + (f(x, y - 1) ? 1 : 0);
      if (n <= 1) deadEnds++;
      if ((!f(x - 1, y) && !f(x + 1, y)) || (!f(x, y - 1) && !f(x, y + 1))) narrow++;
    }
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = f(x, y);
      const b = f(x + 1, y);
      const c = f(x, y + 1);
      const d = f(x + 1, y + 1);
      if ((a && d && !b && !c) || (b && c && !a && !d)) pinches++;
    }
  }
  return { deadEnds, narrow, pinches };
}

// ---------- construction ----------

function splitLeaves(rng, rect, out) {
  const { minLeafW, minLeafH } = FLOOR;
  const canV = rect.w >= 2 * minLeafW;
  const canH = rect.h >= 2 * minLeafH;
  if (!canV && !canH) { out.push(rect); return; }
  if (rect.w * rect.h <= FLOOR.stopArea && rng.chance(FLOOR.stopChance)) { out.push(rect); return; }
  let vertical;
  if (canV && canH) {
    if (rect.w / rect.h > 1.3) vertical = true;
    else if (rect.h / rect.w > 1.3) vertical = false;
    else vertical = rng.chance(0.5);
  } else {
    vertical = canV;
  }
  if (vertical) {
    const cut = rng.range(minLeafW, rect.w - minLeafW);
    splitLeaves(rng, { x: rect.x, y: rect.y, w: cut, h: rect.h }, out);
    splitLeaves(rng, { x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h }, out);
  } else {
    const cut = rng.range(minLeafH, rect.h - minLeafH);
    splitLeaves(rng, { x: rect.x, y: rect.y, w: rect.w, h: cut }, out);
    splitLeaves(rng, { x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut }, out);
  }
}

// Tile gap between two room rectangles (0 when they touch on both axes).
function rectGap(a, b) {
  const gx = Math.max(0, Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)));
  const gy = Math.max(0, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)));
  return gx + gy;
}

// Minimum spanning tree (Prim) plus extra links. Every room ends with at least two links
// when there are three or more rooms, so no room is a dead end.
function linkRooms(rng, rooms) {
  const n = rooms.length;
  const key = (i, j) => (i < j ? `${i},${j}` : `${j},${i}`);
  const linked = new Set();
  const links = [];
  const degree = new Array(n).fill(0);
  const add = (i, j) => {
    if (linked.has(key(i, j))) return;
    linked.add(key(i, j));
    links.push([Math.min(i, j), Math.max(i, j)]);
    degree[i]++;
    degree[j]++;
  };
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  for (let k = 1; k < n; k++) {
    let bi = -1;
    let bj = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree[i]) continue;
      for (let j = 0; j < n; j++) {
        if (inTree[j]) continue;
        const d = rectGap(rooms[i], rooms[j]);
        if (d < best) { best = d; bi = i; bj = j; }
      }
    }
    inTree[bj] = true;
    add(bi, bj);
  }
  // Rooms with a single link get a second one to their nearest unlinked room.
  for (let i = 0; i < n && n >= 3; i++) {
    if (degree[i] >= 2) continue;
    let bj = -1;
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i || linked.has(key(i, j))) continue;
      const d = rectGap(rooms[i], rooms[j]);
      if (d < best) { best = d; bj = j; }
    }
    if (bj >= 0) add(i, bj);
  }
  // A few more loops between close rooms.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (linked.has(key(i, j)) || rectGap(rooms[i], rooms[j]) > FLOOR.maxLinkGap) continue;
      if (rng.chance(FLOOR.extraLoopChance)) add(i, j);
    }
  }
  return links;
}

function carveCorridor(floor, corr, a, b, rng) {
  const cw = FLOOR.corridorWidth;
  const point = (r) => ({
    x: rng.range(r.x + 1, r.x + r.w - 1 - cw),
    y: rng.range(r.y + 1, r.y + r.h - 1 - cw),
  });
  const p = point(a);
  const q = point(b);
  const set = (x, y) => { floor[y][x] = 1; corr[y][x] = 1; };
  const bandH = (y, xa, xb) => {
    for (let x = Math.min(xa, xb); x <= Math.max(xa, xb) + cw - 1; x++) for (let k = 0; k < cw; k++) set(x, y + k);
  };
  const bandV = (x, ya, yb) => {
    for (let y = Math.min(ya, yb); y <= Math.max(ya, yb) + cw - 1; y++) for (let k = 0; k < cw; k++) set(x + k, y);
  };
  if (rng.chance(0.5)) { bandH(p.y, p.x, q.x); bandV(q.x, p.y, q.y); } else { bandV(p.x, p.y, q.y); bandH(q.y, p.x, q.x); }
}

function pickStyle(rng) {
  let r = rng.next() * FLOOR.styles.reduce((s, st) => s + st.weight, 0);
  for (const st of FLOOR.styles) { r -= st.weight; if (r < 0) return st; }
  return FLOOR.styles[FLOOR.styles.length - 1];
}

// Scatter cover blocks in a room. A block is either flush against a room wall or at least two
// tiles from it (a 1-tile gap would make a slot enemies snag in), keeps two tiles from other
// blocks, and stays off the corridor lanes and the spawn and exit tiles.
function placeCover(rng, grid, room, reserved, ob) {
  const style = pickStyle(rng);
  room.style = style.name;
  const target = Math.round(room.w * room.h * style.density);
  if (target === 0) return;
  const budget = Math.floor(room.w * room.h * FLOOR.maxClutter * 0.8); // stay under the clutter gate
  const gapOk = (g) => g === 0 || g >= 2;
  let placed = 0;
  for (let tries = 0; tries < 80 && placed < target; tries++) {
    const [sw, sh] = rng.pick(FLOOR.shapes);
    if (sw > room.w - 4 || sh > room.h - 4 || placed + sw * sh > budget) continue;
    const x = rng.range(room.x, room.x + room.w - sw);
    const y = rng.range(room.y, room.y + room.h - sh);
    if (!gapOk(x - room.x) || !gapOk(room.x + room.w - (x + sw))) continue;
    if (!gapOk(y - room.y) || !gapOk(room.y + room.h - (y + sh))) continue;
    let ok = true;
    for (let yy = y - 2; yy < y + sh + 2 && ok; yy++) {
      for (let xx = x - 2; xx < x + sw + 2; xx++) {
        const inside = xx >= x && xx < x + sw && yy >= y && yy < y + sh;
        if (ob[yy]?.[xx]) { ok = false; break; }
        if (inside && reserved[yy][xx]) { ok = false; break; }
      }
    }
    if (!ok) continue;
    for (let yy = y; yy < y + sh; yy++) for (let xx = x; xx < x + sw; xx++) { grid[yy][xx] = 0; ob[yy][xx] = 1; }
    placed += sw * sh;
  }
}

function toRows(grid, w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += grid[y][x] ? '.' : '#';
    rows.push(s);
  }
  return rows;
}

// One layout attempt. Returns a floor object or null when the shape is unusable.
function buildAttempt(rng, w, h) {
  const leaves = [];
  splitLeaves(rng, { x: 1, y: 1, w: w - 2, h: h - 2 }, leaves);
  if (leaves.length < FLOOR.minRooms || leaves.length > FLOOR.maxRooms) return null;
  const rooms = leaves.map((lf) => {
    const rw = rng.range(FLOOR.minRoomW, Math.min(FLOOR.maxRoomW, lf.w - 2));
    const rh = rng.range(FLOOR.minRoomH, Math.min(FLOOR.maxRoomH, lf.h - 2));
    const x = lf.x + 1 + rng.range(0, lf.w - 2 - rw);
    const y = lf.y + 1 + rng.range(0, lf.h - 2 - rh);
    return { x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1), style: 'open' };
  });

  const grid = makeGrid(w, h);
  const corr = makeGrid(w, h);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = 1;
  const links = linkRooms(rng, rooms);
  for (const [i, j] of links) carveCorridor(grid, corr, rooms[i], rooms[j], rng);

  // Spawn and exit sit at the two far ends of the floor: take a random room, find the room
  // farthest from it by walking distance, then the room farthest from that one. Which end is
  // the spawn is random. This keeps the walk to the stairs long on every seed.
  const walkable = (x, y) => grid[y]?.[x] === 1;
  const farthestFrom = (ri) => {
    const d = distanceField(w, h, walkable, rooms[ri].cx, rooms[ri].cy);
    let best = -1;
    let bestD = -1;
    rooms.forEach((r, i) => {
      const di = d[r.cx + r.cy * w];
      if (i !== ri && di > bestD) { bestD = di; best = i; }
    });
    return { room: best, dist: bestD };
  };
  const endA = farthestFrom(rng.int(rooms.length)).room;
  const far = farthestFrom(endA);
  if (far.room < 0 || far.dist < FLOOR.minExitPath) return null;
  const swap = rng.chance(0.5);
  const spawnRoom = swap ? far.room : endA;
  const exitRoom = swap ? endA : far.room;
  const sp = { tx: rooms[spawnRoom].cx, ty: rooms[spawnRoom].cy };
  const ex = { tx: rooms[exitRoom].cx, ty: rooms[exitRoom].cy };

  // Reserve the corridor tiles and the spawn and exit surroundings. Cover may sit next to a
  // corridor band that crosses a room, but never on it, so doors always stay open.
  const reserved = makeGrid(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (corr[y][x]) reserved[y][x] = 1;
  for (const r of rooms) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) reserved[r.cy + dy][r.cx + dx] = 1; // every room keeps a clear centre
  }
  for (const p of [sp, ex]) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) reserved[p.ty + dy][p.tx + dx] = 1;
  }
  const ob = makeGrid(w, h);
  for (const r of rooms) placeCover(rng, grid, r, reserved, ob);

  const tiles = toRows(grid, w, h);
  const isFloor = (x, y) => tiles[y]?.[x] === '.';

  // Enemy spawn points: room tiles with all eight neighbours open, away from the player's
  // spawn room and the exit, so an enemy body never overlaps a wall when it appears.
  const enemySpawns = [];
  rooms.forEach((r, i) => {
    if (i === spawnRoom) return;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        let open = true;
        for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) if (!isFloor(x + dx, y + dy)) { open = false; break; }
        if (open && Math.max(Math.abs(x - ex.tx), Math.abs(y - ex.ty)) > 3) enemySpawns.push([x, y]);
      }
    }
  });

  // The boss hides in one room that is neither the spawn nor the exit room and sits at least
  // FLOOR.minBossPath steps from the spawn (the farthest such room if none is that far). Drawn
  // after everything else, so adding it never changed an existing layout.
  const fromSpawn = distanceField(w, h, walkable, sp.tx, sp.ty);
  const bossDist = (i) => fromSpawn[rooms[i].cx + rooms[i].cy * w];
  const others = rooms.map((_, i) => i).filter((i) => i !== spawnRoom && i !== exitRoom);
  let pool = others.filter((i) => bossDist(i) >= FLOOR.minBossPath);
  if (!pool.length) {
    const best = Math.max(...others.map(bossDist));
    pool = others.filter((i) => bossDist(i) === best);
  }
  const bossRoom = rng.pick(pool);
  const boss = { tx: rooms[bossRoom].cx, ty: rooms[bossRoom].cy, room: bossRoom };

  return {
    width: w, height: h, tiles, rooms, links, spawnRoom, exitRoom, spawn: sp, exit: ex, enemySpawns, boss,
  };
}

// Hard rules: a floor that fails any of these is unusable.
export function connectivityReport(floor) {
  const { width: w, height: h, tiles } = floor;
  const isFloor = (x, y) => tiles[y]?.[x] === '.';
  const dist = distanceField(w, h, isFloor, floor.spawn.tx, floor.spawn.ty);
  let floorTiles = 0;
  let unreached = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isFloor(x, y)) { floorTiles++; if (dist[x + y * w] < 0) unreached++; }
  const roomsUnreached = floor.rooms.filter((r) => dist[r.cx + r.cy * w] < 0).length;
  const exitDist = dist[floor.exit.tx + floor.exit.ty * w];
  let border = true;
  for (let x = 0; x < w; x++) if (isFloor(x, 0) || isFloor(x, h - 1)) border = false;
  for (let y = 0; y < h; y++) if (isFloor(0, y) || isFloor(w - 1, y)) border = false;
  return {
    floorTiles, unreached, roomsUnreached, exitDist, border,
    spawnOk: isFloor(floor.spawn.tx, floor.spawn.ty),
    exitOk: isFloor(floor.exit.tx, floor.exit.ty),
    ok: unreached === 0 && roomsUnreached === 0 && exitDist >= FLOOR.minExitPath && border
      && isFloor(floor.spawn.tx, floor.spawn.ty) && isFloor(floor.exit.tx, floor.exit.ty),
  };
}

// Soft rules: layout quality and the snag rules.
export function qualityReport(floor) {
  const m = floorMetrics(floor);
  const s = snagReport(floor.tiles, floor.width, floor.height);
  const ok = m.laneShare >= FLOOR.minLaneShare
    && m.openShare <= FLOOR.maxOpenShare
    && m.maxClutter <= FLOOR.maxClutter
    && s.deadEnds === 0 && s.narrow === 0 && s.pinches === 0;
  return { ...m, ...s, ok };
}

// Build the floor for a seed. Same seed, same result. Tries up to FLOOR.maxAttempts layouts
// derived from the seed and returns the first that passes every rule.
export function generateFloor(seed, opts = {}) {
  const w = opts.width ?? FLOOR_W;
  const h = opts.height ?? FLOOR_H;
  let fallback = null;
  for (let attempt = 0; attempt < FLOOR.maxAttempts; attempt++) {
    const rng = createRng(mixSeed(seed >>> 0, attempt));
    const f = buildAttempt(rng, w, h);
    if (!f || !connectivityReport(f).ok) continue;
    f.seed = seed >>> 0;
    f.attempt = attempt;
    f.quality = qualityReport(f).ok;
    if (f.quality) return f;
    fallback ??= f; // connected but below the quality gate; used only if nothing passes
  }
  if (fallback) return fallback;
  throw new Error(`floor generator found no connected layout for seed ${seed}`);
}
