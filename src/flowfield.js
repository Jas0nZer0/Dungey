// One shared flow field: a single breadth-first search outward from the player's tile gives
// every floor tile its step distance to the player. Enemies read it to pick the next tile,
// so the cost of pathfinding is one BFS per tile change, not one search per enemy.
// 8-way moves, never cutting a wall corner. No DOM access.
import { TILE } from './config.js';
import { FLOW } from './enemies.config.js';
import { isFloor } from './map.js';

// Neighbour offsets: orthogonal first so ties prefer straight steps.
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function createFlowField() {
  let w = 0;
  let h = 0;
  let dist = new Int32Array(0);
  let queue = new Int32Array(0);
  const f = {
    tx: -1, ty: -1, version: -1, rebuilds: 0, reached: 0,
    get w() { return w; },
    get h() { return h; },
    get dist() { return dist; },
    // Step distance from tile (x, y) to the goal tile, or -1 when unreachable or off the map.
    at(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      return dist[y * w + x];
    },
    // Recompute the field for a map of w x h tiles (read live from map.js through isFloor).
    // Returns the number of tiles reached.
    rebuild(width, height, gx, gy) {
      if (width !== w || height !== h) {
        w = width;
        h = height;
        dist = new Int32Array(w * h);
        queue = new Int32Array(w * h);
      }
      dist.fill(-1);
      f.tx = gx;
      f.ty = gy;
      f.rebuilds++;
      if (!isFloor(gx, gy)) { f.reached = 0; return 0; }
      let head = 0;
      let tail = 0;
      queue[tail++] = gy * w + gx;
      dist[gy * w + gx] = 0;
      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % w;
        const cy = (cur - cx) / w;
        const nd = dist[cur] + 1;
        for (let k = 0; k < 8; k++) {
          const nx = cx + DX[k];
          const ny = cy + DY[k];
          if (!isFloor(nx, ny)) continue;
          if (k >= 4 && (!isFloor(cx + DX[k], cy) || !isFloor(cx, cy + DY[k]))) continue; // no corner cutting
          const ni = ny * w + nx;
          if (dist[ni] !== -1) continue;
          dist[ni] = nd;
          queue[tail++] = ni;
        }
      }
      f.reached = tail;
      return tail;
    },
    // Rebuild only when the goal tile or the map changed. Returns true when it rebuilt.
    update(width, height, gx, gy, version) {
      if (gx === f.tx && gy === f.ty && version === f.version && width === w && height === h) return false;
      f.version = version;
      f.rebuild(width, height, gx, gy);
      return true;
    },
    // Best neighbour of tile (x, y) one step closer to the goal, written to out.tx/out.ty.
    // Returns false when the tile is the goal, unreachable or off the map.
    next(x, y, out) {
      const d = f.at(x, y);
      if (d <= 0) return false;
      let best = d;
      for (let k = 0; k < 8; k++) {
        const nd = f.at(x + DX[k], y + DY[k]);
        if (nd < 0 || nd >= best) continue;
        if (k >= 4 && (!isFloor(x + DX[k], y) || !isFloor(x, y + DY[k]))) continue;
        best = nd;
        out.tx = x + DX[k];
        out.ty = y + DY[k];
      }
      return best < d;
    },
  };
  return f;
}

// True when a square body of side `size` centred at (x, y) touches no wall tile.
export function boxClear(x, y, size) {
  const half = size / 2;
  const x0 = Math.floor((x - half) / TILE);
  const x1 = Math.floor((x + half - 1e-6) / TILE); // a body flush with a wall does not touch it
  const y0 = Math.floor((y - half) / TILE);
  const y1 = Math.floor((y + half - 1e-6) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!isFloor(tx, ty)) return false;
  return true;
}

// True when a body of the given size can slide in a straight line from a to b without
// touching a wall, keeping `margin` px of room on every side.
export function sweepClear(ax, ay, bx, by, size, margin = 0) {
  const s = size + margin * 2;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / FLOW.sample));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!boxClear(ax + (bx - ax) * t, ay + (by - ay) * t, s)) return false;
  }
  return true;
}

// Thin line of sight (a point, not a body) from a to b, for aiming and shooting.
export function lineOfSight(ax, ay, bx, by) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / FLOW.sample));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!isFloor(Math.floor((ax + (bx - ax) * t) / TILE), Math.floor((ay + (by - ay) * t) / TILE))) return false;
  }
  return true;
}

const step = { tx: 0, ty: 0 };

// Pick a point for body `e` to walk toward: the farthest tile centre along the flow field
// (up to FLOW.lookahead tiles) that the body can reach in a straight line, or the goal itself
// when it is in reach. Writes out.x/out.y and returns true; false when the body stands on an
// unreachable tile (the caller falls back to walking at the goal).
export function waypoint(flow, e, gx, gy, out) {
  let tx = Math.floor(e.x / TILE);
  let ty = Math.floor(e.y / TILE);
  if (flow.at(tx, ty) < 0) return false;
  const homeX = (tx + 0.5) * TILE;
  const homeY = (ty + 0.5) * TILE;
  let found = false;
  for (let k = 0; k < FLOW.lookahead; k++) {
    if (!flow.next(tx, ty, step)) {
      // Standing on the goal tile (or next to it): walk at the goal itself.
      if (sweepClear(e.x, e.y, gx, gy, e.w, FLOW.clearance) || !found) { out.x = gx; out.y = gy; }
      return true;
    }
    tx = step.tx;
    ty = step.ty;
    const cx = (tx + 0.5) * TILE;
    const cy = (ty + 0.5) * TILE;
    if (!found && !sweepClear(e.x, e.y, cx, cy, e.w) && Math.hypot(e.x - homeX, e.y - homeY) > 0.5) {
      // (bare body, no margin: from the tile centre this always passes, so the re-centre
      // cannot ping-pong with the next-tile step)
      // A straight line to the next tile would clip a wall corner. A body of one tile or less
      // can always walk centre to centre between adjacent tiles, so re-centre first.
      out.x = homeX;
      out.y = homeY;
      return true;
    }
    if (found && !sweepClear(e.x, e.y, cx, cy, e.w, FLOW.clearance)) return true; // keep the last reachable waypoint
    out.x = cx;
    out.y = cy;
    found = true;
  }
  return true;
}
