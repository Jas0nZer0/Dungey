// Canvas setup, resize scaling and drawing.
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { map, mapWidth, mapHeight } from './map.js';
import { player } from './entities.js';
import { camera } from './camera.js';
import { mouse } from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
canvas.style.cursor = 'none'; // the crosshair replaces the OS cursor

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

function drawMap() {
  const x0 = Math.max(0, Math.floor(camera.x / TILE));
  const y0 = Math.max(0, Math.floor(camera.y / TILE));
  const x1 = Math.min(mapWidth - 1, Math.floor((camera.x + VIEW_W - 1) / TILE));
  const y1 = Math.min(mapHeight - 1, Math.floor((camera.y + VIEW_H - 1) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      ctx.fillStyle = map[y][x] === '#' ? '#3b3b4f' : '#1b1b26';
      ctx.fillRect(x * TILE - camera.x, y * TILE - camera.y, TILE, TILE);
    }
  }
}

function drawPlayer() {
  const sx = Math.round(player.x - camera.x);
  const sy = Math.round(player.y - camera.y);
  ctx.fillStyle = '#f4c542';
  ctx.fillRect(sx - player.w / 2, sy - player.h / 2, player.w, player.h);
  // Facing indicator: a line from the centre toward the aim point.
  const c = Math.cos(player.angle);
  const s = Math.sin(player.angle);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx + c * 6, sy + s * 6);
  ctx.lineTo(sx + c * 20, sy + s * 20);
  ctx.stroke();
}

function drawCrosshair() {
  const mx = Math.round(mouse.x);
  const my = Math.round(mouse.y);
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mx, my, 8, 0, Math.PI * 2);
  ctx.moveTo(mx - 14, my);
  ctx.lineTo(mx - 4, my);
  ctx.moveTo(mx + 4, my);
  ctx.lineTo(mx + 14, my);
  ctx.moveTo(mx, my - 14);
  ctx.lineTo(mx, my - 4);
  ctx.moveTo(mx, my + 4);
  ctx.lineTo(mx, my + 14);
  ctx.stroke();
}

export function render(paused) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawMap();
  drawPlayer();
  drawCrosshair();

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
