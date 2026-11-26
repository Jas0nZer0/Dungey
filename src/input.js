// Keyboard and mouse state. Call init(canvas, toGame) once.
// held: keys currently down. Presses are queued so update ticks never miss a tap.
const held = new Set();
let presses = [];
export const mouse = { x: 0, y: 0, down: false };
let toGame = (cx, cy) => ({ x: cx, y: cy });

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd',
]);

// Letters compare lowercase so Shift or Caps Lock does not stick a key.
const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);

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
    const key = norm(e.key);
    if (!GAME_KEYS.has(key)) return;
    e.preventDefault();
    if (e.repeat || held.has(key)) return;
    held.add(key);
    presses.push(key);
  });
  window.addEventListener('keyup', (e) => held.delete(norm(e.key)));
  canvas.addEventListener('mousemove', (e) => {
    const p = toGame(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
