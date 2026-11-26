// Fixed-timestep loop. update(STEP) runs at 60 Hz regardless of display refresh rate.
import { STEP } from './config.js';

const MAX_FRAME = 0.25; // seconds; clamps long stalls so we never spiral
export const stats = { updates: 0 };

let paused = false;
let onPauseChange = () => {};

export function isPaused() {
  return paused;
}

export function setPaused(value) {
  if (paused === value) return;
  paused = value;
  onPauseChange(paused);
}

export function togglePause() {
  setPaused(!paused);
}

export function startLoop({ update, render, onPause }) {
  if (onPause) onPauseChange = onPause;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (!paused) {
      acc += dt;
      while (acc >= STEP) {
        update(STEP);
        stats.updates++;
        acc -= STEP;
      }
    } else {
      acc = 0;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => { last = t; frame(t); });
}
