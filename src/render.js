// Canvas setup, resize scaling and drawing.
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { map, mapWidth, mapHeight } from './map.js';
import { player } from './entities.js';
import { camera } from './camera.js';
import { mouse } from './input.js';
import { game, runSummary, clockTime, exitTimeLeft } from './game.js';
import { DIFFICULTY } from './difficulty.config.js';

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
  drawExit();
}

// The stairs down: a glowing tile with a downward arrow.
function drawExit() {
  const e = game.layout.exit;
  if (!e) return;
  const sx = e.tx * TILE - camera.x;
  const sy = e.ty * TILE - camera.y;
  if (sx < -TILE || sx > VIEW_W || sy < -TILE || sy > VIEW_H) return;
  const locked = !game.exitUnlocked;
  const pulse = locked ? 0.35 : 0.55 + 0.25 * Math.sin(game.time * 4);
  ctx.fillStyle = locked ? `rgba(150,150,160,${pulse})` : `rgba(120,220,255,${pulse})`;
  ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
  ctx.fillStyle = '#0b1c24';
  ctx.beginPath();
  ctx.moveTo(sx + 9, sy + 10);
  ctx.lineTo(sx + TILE - 9, sy + 10);
  ctx.lineTo(sx + TILE / 2, sy + TILE - 8);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const sx = Math.round(player.x - camera.x);
  const sy = Math.round(player.y - camera.y);
  const blink = game.iframes > 0 && Math.floor(game.iframes * 20) % 2 === 0;
  ctx.fillStyle = blink ? '#ff5a5a' : '#f4c542';
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

function drawEnemies() {
  for (const e of game.enemies) {
    const sx = Math.round(e.x - camera.x);
    const sy = Math.round(e.y - camera.y);
    if (sx < -20 || sx > VIEW_W + 20 || sy < -20 || sy > VIEW_H + 20) continue;
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#b33a3a';
    ctx.fillRect(sx - e.w / 2, sy - e.h / 2, e.w, e.h);
  }
}

function drawProjectiles() {
  ctx.fillStyle = '#ffe98a';
  for (const b of game.projectiles) {
    ctx.fillRect(Math.round(b.x - camera.x) - 3, Math.round(b.y - camera.y) - 3, 6, 6);
  }
}

const clock = (sec) => {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function drawHud() {
  ctx.textAlign = 'left';
  ctx.font = '16px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(`HP ${'♥'.repeat(Math.max(0, game.hp))}`, 12, 24);
  ctx.fillText(`Time ${clock(game.time)}   Kills ${game.kills}   Score ${Math.floor(game.score)}`, 12, 46);
  ctx.textAlign = 'right';
  ctx.fillText(`Floor ${game.floor}   Seed ${game.seed}`, VIEW_W - 12, 24);
  if (game.layout.exit) {
    const left = Math.ceil(exitTimeLeft());
    ctx.fillStyle = game.exitUnlocked ? '#8fe3ff' : '#fff';
    ctx.fillText(game.exitUnlocked ? 'Stairs open' : `Stairs unlock in ${clock(left)} or when the boss falls`, VIEW_W - 12, 46);
    ctx.fillStyle = '#fff';
  }
  ctx.textAlign = 'left';
  if (clockTime() > DIFFICULTY.softCap) {
    // Pulse so the player notices the exponential phase has begun.
    ctx.fillStyle = Math.floor(game.time * 2) % 2 === 0 ? '#ff5a5a' : '#ffb0b0';
    ctx.fillText('OVERTIME: the dark is closing in', 12, 68);
  }
  if (game.iframes > 0) {
    ctx.strokeStyle = `rgba(255,60,60,${Math.min(1, game.iframes)})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, VIEW_W, VIEW_H);
  }
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
  drawEnemies();
  drawProjectiles();
  drawPlayer();
  drawHud();
  drawCrosshair();

  if (game.state === 'dead') {
    ctx.fillStyle = 'rgba(80,0,0,0.65)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const r = runSummary();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '40px monospace';
    ctx.fillText('YOU DIED', VIEW_W / 2, VIEW_H / 2 - 70);
    ctx.font = '16px monospace';
    const rows = [
      ['Survived', clock(r.time)],
      ['Kills', String(r.kills)],
      ['Score', String(r.score)],
    ];
    if (r.reachedOvertime) rows.push(['Overtime', clock(r.overtime)]);
    rows.forEach(([k, v], i) => {
      const y = VIEW_H / 2 - 28 + i * 24;
      ctx.textAlign = 'right';
      ctx.fillText(k, VIEW_W / 2 - 10, y);
      ctx.textAlign = 'left';
      ctx.fillText(v, VIEW_W / 2 + 10, y);
    });
    ctx.textAlign = 'center';
    ctx.fillText('Press R or Enter to restart', VIEW_W / 2, VIEW_H / 2 + 96);
    drawCrosshair();
  }

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
