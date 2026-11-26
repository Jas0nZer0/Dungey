// Canvas setup, resize scaling and drawing.
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { map, mapWidth, mapHeight } from './map.js';
import { player } from './entities.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

// Map is centred in the view. Offsets are whole pixels so tiles stay crisp.
const offX = Math.floor((VIEW_W - mapWidth * TILE) / 2);
const offY = Math.floor((VIEW_H - mapHeight * TILE) / 2);

export { canvas };

// Fit the canvas to the window, keeping 16:9. Use whole-number scale at 1x and above.
export function resize() {
  let scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  if (scale >= 1) scale = Math.floor(scale);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}

// Client (window) coordinates to game-space coordinates.
export function clientToGame(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((cx - r.left) / r.width) * VIEW_W,
    y: ((cy - r.top) / r.height) * VIEW_H,
  };
}

export function initRender() {
  resize();
  window.addEventListener('resize', resize);
}

export function render(paused) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  map.forEach((row, y) => row.forEach((cell, x) => {
    ctx.fillStyle = cell === '#' ? '#3b3b4f' : '#1b1b26';
    ctx.fillRect(offX + x * TILE, offY + y * TILE, TILE, TILE);
  }));
  ctx.fillStyle = '#f4c542';
  ctx.fillRect(offX + player.x * TILE + 6, offY + player.y * TILE + 6, TILE - 12, TILE - 12);

  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#fff';
    ctx.font = '32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2);
    ctx.font = '16px monospace';
    ctx.fillText('Press Esc to resume', VIEW_W / 2, VIEW_H / 2 + 32);
  }
}
