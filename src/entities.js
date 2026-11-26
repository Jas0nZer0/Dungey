// Game entities and their per-tick update.
import { isFloor } from './map.js';

export const player = { x: 1, y: 1 };

const MOVES = {
  ArrowUp: [0, -1], w: [0, -1],
  ArrowDown: [0, 1], s: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0],
};

// Grid-step movement, one tile per key press (scaffold behaviour).
export function updateEntities(presses) {
  for (const key of presses) {
    const move = MOVES[key];
    if (!move) continue;
    const nx = player.x + move[0];
    const ny = player.y + move[1];
    if (isFloor(nx, ny)) {
      player.x = nx;
      player.y = ny;
    }
  }
}
