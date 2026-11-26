// Game entities and their per-tick update.
import {
  TILE, PLAYER_SPEED, PLAYER_SIZE, PLAYER_ACCEL, PLAYER_FRICTION,
} from './config.js';
import { moveBody } from './collision.js';
import { isHeld, mouse } from './input.js';
import { camera, updateCamera } from './camera.js';

// Position is the centre of the hitbox, in world pixels. Starts in tile (2,2).
export const player = {
  x: 2.5 * TILE,
  y: 2.5 * TILE,
  w: PLAYER_SIZE,
  h: PLAYER_SIZE,
  vx: 0,
  vy: 0,
  angle: 0, // facing, radians, 0 = +x
};

// Advance one body by dt given a move direction (each axis -1, 0 or 1).
export function stepPlayer(p, dirX, dirY, dt) {
  const len = Math.hypot(dirX, dirY);
  const tx = len ? (dirX / len) * PLAYER_SPEED : 0;
  const ty = len ? (dirY / len) * PLAYER_SPEED : 0;
  const rate = (len ? PLAYER_ACCEL : PLAYER_FRICTION) * dt;
  // Move the velocity vector toward the target in a straight line.
  const dvx = tx - p.vx;
  const dvy = ty - p.vy;
  const dist = Math.hypot(dvx, dvy);
  if (dist <= rate) {
    p.vx = tx;
    p.vy = ty;
  } else {
    p.vx += (dvx / dist) * rate;
    p.vy += (dvy / dist) * rate;
  }
  moveBody(p, p.vx * dt, p.vy * dt);
}

function axis(neg, pos) {
  return (isHeld(pos) || isHeld(pos === 'd' ? 'ArrowRight' : 'ArrowDown') ? 1 : 0)
    - (isHeld(neg) || isHeld(neg === 'a' ? 'ArrowLeft' : 'ArrowUp') ? 1 : 0);
}

export function updateEntities(dt) {
  stepPlayer(player, axis('a', 'd'), axis('w', 's'), dt);
  updateCamera(player);
  // Mouse is in view space; add the camera to get the world point.
  player.angle = Math.atan2(mouse.y + camera.y - player.y, mouse.x + camera.x - player.x);
}
