// Dungey entry point: wires input, loop, entities and render together.
import { initInput, drainPresses, clearInput } from './input.js';
import { startLoop, isPaused, setPaused, togglePause, stats } from './loop.js';
import { updateEntities } from './entities.js';
import { canvas, clientToGame, initRender, render } from './render.js';

initRender();
initInput(canvas, clientToGame);

function update() {
  updateEntities(drainPresses());
}

// Esc toggles pause. Handled here, not in update, so it works while paused.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat) {
    e.preventDefault();
    togglePause();
  }
});

function pauseForBlur() {
  setPaused(true);
}
window.addEventListener('blur', pauseForBlur);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForBlur();
});

startLoop({
  update,
  render: () => render(isPaused()),
  onPause: clearInput,
});

window.__dungey = { stats }; // test hook
