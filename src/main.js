// Dungey entry point: wires input, loop, entities and render together.
import { initInput, drainPresses, clearInput, mouse } from './input.js';
import { startLoop, isPaused, setPaused, togglePause, stats } from './loop.js';
import { updateEntities, player } from './entities.js';
import { camera } from './camera.js';
import { game, updateGame, resetGame } from './game.js';
import { canvas, clientToGame, initRender, render } from './render.js';

initRender();
initInput(canvas, clientToGame);

function update(dt) {
  const presses = drainPresses();
  if (game.state === 'dead') {
    if (presses.includes('r') || presses.includes('Enter')) resetGame();
    return;
  }
  updateEntities(dt);
  updateGame(dt, mouse.down);
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

window.__dungey = { stats, player, camera, game, resetGame }; // test hook
