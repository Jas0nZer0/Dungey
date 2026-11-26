// Axis-separated AABB vs tile collision. Bodies are { x, y, w, h, vx, vy } with
// x,y at the centre, in pixels.
import { TILE } from './config.js';
import { isFloor } from './map.js';

const EPS = 1e-6;
// Each sub-step moves less than half a tile, so a body never skips a wall.
const MAX_STEP = TILE / 2;

function solidAt(tx, ty) {
  return !isFloor(tx, ty);
}

// Move on X only, then push out of any wall tile hit.
function moveX(b, dx) {
  b.x += dx;
  const halfW = b.w / 2;
  const halfH = b.h / 2;
  const ty0 = Math.floor((b.y - halfH) / TILE);
  const ty1 = Math.floor((b.y + halfH - EPS) / TILE);
  const tx0 = Math.floor((b.x - halfW) / TILE);
  const tx1 = Math.floor((b.x + halfW - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!solidAt(tx, ty)) continue;
      if (dx > 0) b.x = tx * TILE - halfW;
      else if (dx < 0) b.x = (tx + 1) * TILE + halfW;
      else continue;
      b.vx = 0;
      return;
    }
  }
}

function moveY(b, dy) {
  b.y += dy;
  const halfW = b.w / 2;
  const halfH = b.h / 2;
  const tx0 = Math.floor((b.x - halfW) / TILE);
  const tx1 = Math.floor((b.x + halfW - EPS) / TILE);
  const ty0 = Math.floor((b.y - halfH) / TILE);
  const ty1 = Math.floor((b.y + halfH - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!solidAt(tx, ty)) continue;
      if (dy > 0) b.y = ty * TILE - halfH;
      else if (dy < 0) b.y = (ty + 1) * TILE + halfH;
      else continue;
      b.vy = 0;
      return;
    }
  }
}

// Displace a body by (dx, dy), sliding along walls. Safe at any speed.
export function moveBody(b, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_STEP));
  const sx = dx / n;
  const sy = dy / n;
  for (let i = 0; i < n; i++) {
    moveX(b, sx);
    moveY(b, sy);
  }
}

// True if the body overlaps any wall tile.
export function overlapsWall(b) {
  const tx0 = Math.floor((b.x - b.w / 2) / TILE);
  const tx1 = Math.floor((b.x + b.w / 2 - EPS) / TILE);
  const ty0 = Math.floor((b.y - b.h / 2) / TILE);
  const ty1 = Math.floor((b.y + b.h / 2 - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) if (solidAt(tx, ty)) return true;
  return false;
}
