// The stairs arrow: once the stairs unlock, a glowing arrow beside the player points at them
// as the crow flies (straight through walls, not along a route). Pure geometry, no DOM, so
// tests can check it. render.js draws it.
import { TILE, VIEW_W, VIEW_H } from './config.js';

export const ARROW = {
  ring: 48, // px from the player's centre to the arrow
  margin: 22, // px the arrow keeps from the screen edge, so it never leaves the view
};

// Screen-space arrow for a player at world (px, py), stairs on tile `exit`, camera at the
// top-left world pixel `camera`. Returns null while the stairs are locked or absent, else
// { x, y, angle, dist } with x and y in view pixels, angle in radians (0 = +x) and dist the
// straight-line distance to the stairs in px.
export function stairsArrow(px, py, exit, camera, unlocked, view = { w: VIEW_W, h: VIEW_H }) {
  if (!exit || !unlocked) return null;
  const dx = (exit.tx + 0.5) * TILE - px;
  const dy = (exit.ty + 0.5) * TILE - py;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const r = Math.min(ARROW.ring, dist * 0.5); // right on top of the stairs, sit closer
  const clamp = (v, max) => Math.min(max - ARROW.margin, Math.max(ARROW.margin, v));
  return {
    x: clamp(px - camera.x + Math.cos(angle) * r, view.w),
    y: clamp(py - camera.y + Math.sin(angle) * r, view.h),
    angle,
    dist,
  };
}
