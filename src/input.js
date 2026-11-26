// Keyboard and mouse state. Call init(canvas, toGame) once.
// held: keys currently down. Presses are queued so update ticks never miss a tap.
const held = new Set();
let presses = [];
export const mouse = { x: 0, y: 0, down: false };
let toGame = (cx, cy) => ({ x: cx, y: cy });

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd',
]);

export function isHeld(key) {
  return held.has(key);
}

// Returns keys pressed since the last call (no auto-repeat) and clears the queue.
export function drainPresses() {
  const out = presses;
  presses = [];
  return out;
}

export function clearInput() {
  held.clear();
  presses = [];
  mouse.down = false;
}

export function initInput(canvas, mapToGame) {
  toGame = mapToGame;
  window.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.key)) return;
    e.preventDefault();
    if (e.repeat || held.has(e.key)) return;
    held.add(e.key);
    presses.push(e.key);
  });
  window.addEventListener('keyup', (e) => held.delete(e.key));
  canvas.addEventListener('mousemove', (e) => {
    const p = toGame(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
