// Dungey entry point: wires input, loop, entities and render together.
import { initInput, drainPresses, clearInput } from './input.js';
import { startLoop, isPaused, setPaused, togglePause, stats } from './loop.js';
import { updateEntities, player } from './entities.js';
import { camera } from './camera.js';
import { game, updateGame, resetGame, spawnEnemy } from './game.js';
import { canvas, clientToGame, initRender, render } from './render.js';
import { parseSeed } from './rng.js';

initRender();
initInput(canvas, clientToGame);

// Start a run. The seed is shown in the HUD and logged, so a layout can be reproduced:
// open the page with ?seed=12345 (a number or any text) to replay the same floors.
function startRun(seed) {
  resetGame(seed === undefined ? {} : { seed });
  console.log(`Dungey run seed ${game.seed} (add ?seed=${game.seed} to the URL to replay these floors)`);
}
const urlSeed = new URLSearchParams(location.search).get('seed');
startRun(urlSeed === null || urlSeed === '' ? undefined : parseSeed(urlSeed));

function update(dt) {
  const presses = drainPresses();
  if (game.state === 'dead') {
    if (presses.includes('r') || presses.includes('Enter')) startRun(); // a restart rolls a new seed
    return;
  }
  updateEntities(dt);
  updateGame(dt);
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

window.__dungey = { stats, player, camera, game, resetGame, spawnEnemy }; // test hook
