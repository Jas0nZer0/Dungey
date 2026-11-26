// Canvas setup, resize scaling and drawing.
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { map, mapWidth, mapHeight } from './map.js';
import { player } from './entities.js';
import { camera } from './camera.js';
import { mouse } from './input.js';
import { game, runSummary, clockTime, bossTimeLeft } from './game.js';
import { DIFFICULTY } from './difficulty.config.js';
import { ENEMIES, BOSS } from './enemies.config.js';
import { stairsArrow } from './arrow.js';

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

// Placeholder art: one colour and silhouette per type (real sprites come in M7).
const LOOK = {
  chaser: '#b33a3a', shooter: '#d9892b', swarmer: '#d8d34a', tank: '#7b2323', summoner: '#9a5be0', boss: '#cfd3ff',
};

function drawShape(e, sx, sy, fill) {
  ctx.fillStyle = fill;
  const hw = e.w / 2;
  switch (e.type) {
    case 'shooter': // diamond
      ctx.beginPath();
      ctx.moveTo(sx, sy - hw - 2);
      ctx.lineTo(sx + hw + 2, sy);
      ctx.lineTo(sx, sy + hw + 2);
      ctx.lineTo(sx - hw - 2, sy);
      ctx.closePath();
      ctx.fill();
      break;
    case 'swarmer': // dot
      ctx.beginPath();
      ctx.arc(sx, sy, hw, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'summoner': // circle with a ring
      ctx.beginPath();
      ctx.arc(sx, sy, hw, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e6d2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, hw + 4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'tank': // square with a heavy outline
      ctx.fillRect(sx - hw, sy - hw, e.w, e.h);
      ctx.strokeStyle = '#2a0b0b';
      ctx.lineWidth = 4;
      ctx.strokeRect(sx - hw + 2, sy - hw + 2, e.w - 4, e.h - 4);
      break;
    case 'boss': // square with a crown
      ctx.fillRect(sx - hw, sy - hw, e.w, e.h);
      ctx.fillStyle = e.phase === 2 ? '#ff4d4d' : '#ffd24d';
      for (let k = -1; k <= 1; k++) ctx.fillRect(sx + k * 12 - 3, sy - hw - 8, 6, 8);
      break;
    default:
      ctx.fillRect(sx - hw, sy - hw, e.w, e.h);
  }
}

// Ground markings that show an attack coming. They fill as the windup runs out.
function drawTell(e) {
  if (!e.tell || e.tellMax <= 0) return;
  const sx = Math.round(e.x - camera.x);
  const sy = Math.round(e.y - camera.y);
  const p = 1 - Math.max(0, e.stateT) / e.tellMax; // 0 at the start of the windup, 1 at the strike
  ctx.save();
  ctx.lineWidth = 3;
  switch (e.tell) {
    case 'slam': {
      const r = BOSS.slam.radius;
      ctx.fillStyle = `rgba(255,70,70,${0.12 + 0.3 * p})`;
      ctx.strokeStyle = 'rgba(255,90,90,0.9)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, r * p, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'fan': {
      const n = e.phase === 2 ? BOSS.fan.phase2Bolts : BOSS.fan.bolts;
      ctx.strokeStyle = `rgba(255,140,60,${0.35 + 0.5 * p})`;
      for (let i = 0; i < n; i++) {
        const a = e.aim + BOSS.fan.spread * (n === 1 ? 0 : i / (n - 1) - 0.5);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * 260, sy + Math.sin(a) * 260);
        ctx.stroke();
      }
      break;
    }
    case 'charge': {
      const len = (e.type === 'boss' ? BOSS.charge.speed * BOSS.charge.time : ENEMIES.tank.chargeSpeed * ENEMIES.tank.chargeTime);
      const wd = e.w;
      ctx.fillStyle = `rgba(255,60,60,${0.15 + 0.3 * p})`;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(e.aim);
      ctx.fillRect(0, -wd / 2, len, wd);
      ctx.restore();
      break;
    }
    case 'shot': {
      ctx.strokeStyle = `rgba(255,170,60,${0.3 + 0.6 * p})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(e.aim) * 280, sy + Math.sin(e.aim) * 280);
      ctx.stroke();
      break;
    }
    case 'summon':
    case 'enrage':
    case 'wake': {
      const col = e.tell === 'enrage' ? '255,70,70' : '190,110,255';
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.lineWidth = 2 + 3 * p;
      ctx.beginPath();
      ctx.arc(sx, sy, e.w * (0.8 + 1.4 * (1 - p)), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default:
  }
  ctx.restore();
}

function drawEnemies() {
  for (const e of game.enemies) {
    const sx = Math.round(e.x - camera.x);
    const sy = Math.round(e.y - camera.y);
    if (sx < -260 || sx > VIEW_W + 260 || sy < -260 || sy > VIEW_H + 260) continue;
    drawTell(e);
  }
  for (const e of game.enemies) {
    const sx = Math.round(e.x - camera.x);
    const sy = Math.round(e.y - camera.y);
    if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
    let fill = LOOK[e.type] ?? LOOK.chaser;
    if (e.flash > 0 || e.invuln) fill = '#fff';
    else if (e.tell && Math.floor(e.stateT * 16) % 2 === 0) fill = '#fff'; // blink while telegraphing
    drawShape(e, sx, sy, fill);
  }
  for (const fx of game.effects) {
    const sx = Math.round(fx.x - camera.x);
    const sy = Math.round(fx.y - camera.y);
    const k = fx.t / fx.max;
    ctx.fillStyle = fx.kind === 'slam' ? `rgba(255,120,80,${0.5 * k})` : `rgba(255,255,255,${0.6 * k})`;
    ctx.beginPath();
    ctx.arc(sx, sy, fx.r * (fx.kind === 'bossdeath' ? 2 - k : 1), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemyProjectiles() {
  ctx.fillStyle = '#ff7a3a';
  for (const b of game.enemyProjectiles) {
    ctx.beginPath();
    ctx.arc(Math.round(b.x - camera.x), Math.round(b.y - camera.y), b.r + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Boss health bar along the bottom of the view while the boss is awake.
function drawBossBar() {
  const b = game.boss;
  if (!b) return;
  const w = 360;
  const x = (VIEW_W - w) / 2;
  const y = VIEW_H - 34;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 3, y - 3, w + 6, 20);
  ctx.fillStyle = b.phase === 2 ? '#d83a3a' : '#e0b030';
  ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 14);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, 15);
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WARDEN', VIEW_W / 2, y - 7);
  ctx.textAlign = 'left';
}

// A glowing, pulsing arrow beside the player that points at the unlocked stairs.
function drawStairsArrow() {
  const a = stairsArrow(player.x, player.y, game.layout.exit, camera, game.exitUnlocked);
  if (!a) return;
  const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
  const size = 11 + 3 * pulse;
  ctx.save();
  ctx.translate(Math.round(a.x), Math.round(a.y));
  ctx.rotate(a.angle);
  ctx.shadowColor = '#7fe3ff';
  ctx.shadowBlur = 8 + 14 * pulse;
  ctx.fillStyle = `rgba(150,235,255,${0.65 + 0.35 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, -size * 0.8);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size * 0.7, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
    let line = 'Boss slain: stairs open';
    if (!game.exitUnlocked) line = game.boss ? 'Kill the boss to unlock the stairs' : `The boss appears in ${clock(Math.ceil(bossTimeLeft()))}`;
    ctx.fillStyle = game.exitUnlocked ? '#8fe3ff' : '#fff';
    ctx.fillText(line, VIEW_W - 12, 46);
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
  drawEnemyProjectiles();
  drawPlayer();
  drawStairsArrow();
  drawBossBar();
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
