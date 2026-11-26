// Camera follows a target and clamps to the map. x,y are the top-left of the
// view in world pixels, rounded to whole pixels so tiles stay crisp.
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { mapWidth, mapHeight } from './map.js';

export const camera = { x: 0, y: 0 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function updateCamera(target) {
  const maxX = Math.max(0, mapWidth * TILE - VIEW_W);
  const maxY = Math.max(0, mapHeight * TILE - VIEW_H);
  camera.x = Math.round(clamp(target.x - VIEW_W / 2, 0, maxX));
  camera.y = Math.round(clamp(target.y - VIEW_H / 2, 0, maxY));
}
