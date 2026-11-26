import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, STEP, PLAYER_SPEED } from '../src/config.js';
import { DIFFICULTY } from '../src/difficulty.config.js';
import { directorAt, sampleCurve } from '../src/director.js';
import { createGrid } from '../src/spatial.js';
import { player } from '../src/entities.js';
import {
  game, resetGame, spawnEnemy, updateGame, runSummary,
} from '../src/game.js';

const SOFT = DIFFICULTY.softCap;

beforeEach(() => {
  resetGame();
  game.spawnCd = 1e9;
  player.x = 4.5 * TILE;
  player.y = 12.5 * TILE;
  player.angle = 0;
});

test('curves are linear to the soft cap and hit atSoftCap exactly there', () => {
  for (const key of ['spawnInterval', 'enemyCap', 'enemySpeed', 'enemyHp']) {
    const c = DIFFICULTY[key];
    assert.ok(Math.abs(sampleCurve(c, 0) - c.start) < 1e-9, key);
    const mid = sampleCurve(c, SOFT / 2);
    assert.ok(Math.abs(mid - (c.start + c.atSoftCap) / 2) < 1e-9, `${key} midpoint`);
    assert.ok(Math.abs(sampleCurve(c, SOFT) - c.atSoftCap) < 1e-9, `${key} at soft cap`);
  }
});

test('after the soft cap, growth is exponential until the clamps', () => {
  const hp = DIFFICULTY.enemyHp;
  const r1 = sampleCurve(hp, SOFT + 60) / sampleCurve(hp, SOFT);
  const r2 = sampleCurve(hp, SOFT + 120) / sampleCurve(hp, SOFT + 60);
  assert.ok(Math.abs(r1 - hp.growthPerMin) < 1e-9);
  assert.ok(Math.abs(r2 - hp.growthPerMin) < 1e-9);
  assert.ok(directorAt(SOFT + 300).spawnInterval < directorAt(SOFT).spawnInterval);
  assert.ok(directorAt(SOFT + 300).spawnBatch > directorAt(SOFT).spawnBatch);
  assert.equal(directorAt(SOFT - 1).phase, 'ramp');
  assert.equal(directorAt(SOFT + 1).phase, 'overtime');
});

test('hard clamps hold at any time: cap, speed under the player, minimum spawn interval', () => {
  for (const t of [0, 300, 600, 900, 1800, 36000]) {
    const d = directorAt(t);
    assert.ok(d.cap <= DIFFICULTY.enemyCap.max, `cap at ${t}`);
    assert.ok(d.speed < PLAYER_SPEED, `speed at ${t}`);
    assert.ok(d.spawnInterval >= DIFFICULTY.spawnInterval.min);
    assert.ok(d.spawnBatch >= 1 && d.spawnBatch <= DIFFICULTY.spawnBatch.max);
  }
});

test('time offset shifts the director but not the run clock', () => {
  game.timeOffset = SOFT + 120;
  spawnEnemy(100, 100);
  assert.equal(game.enemies[0].hp, directorAt(SOFT + 120).hp);
  assert.equal(game.time, 0);
  resetGame();
  assert.equal(game.timeOffset, 0, 'a new run starts with no offset');
});

test('score counts survival time and kills, and kills pay more in overtime', () => {
  player.angle = 0;
  spawnEnemy(player.x + 3 * TILE, player.y);
  game.enemies[0].hp = game.enemies[0].maxHp = 1;
  game.iframes = 1e9;
  for (let i = 0; i < 300 && game.kills === 0; i++) updateGame(STEP);
  assert.equal(game.kills, 1);
  const base = DIFFICULTY.score.perEnemyHp * 1;
  const timePts = game.time * DIFFICULTY.score.perSecond;
  assert.ok(Math.abs(game.score - (timePts + base)) < 1e-6);

  resetGame();
  game.spawnCd = 1e9;
  game.iframes = 1e9;
  game.timeOffset = SOFT + 10;
  player.x = 4.5 * TILE; player.y = 12.5 * TILE; player.angle = 0;
  spawnEnemy(player.x + 3 * TILE, player.y);
  game.enemies[0].hp = game.enemies[0].maxHp = 1;
  for (let i = 0; i < 300 && game.kills === 0; i++) updateGame(STEP);
  const pts = game.score - game.time * DIFFICULTY.score.perSecond;
  assert.ok(Math.abs(pts - base * DIFFICULTY.score.overtimeMultiplier) < 1e-6);
});

test('runSummary reports time, kills, score and overtime', () => {
  game.time = SOFT + 30;
  game.kills = 7;
  game.score = 1234.9;
  assert.deepEqual(runSummary(), {
    time: SOFT + 30, kills: 7, score: 1234, reachedOvertime: true, overtime: 30,
  });
  game.time = 100;
  assert.equal(runSummary().reachedOvertime, false);
  assert.equal(runSummary().overtime, 0);
});

test('spatial grid returns every entity within one cell size and clamps out-of-range points', () => {
  const g = createGrid(320, 320, 32);
  const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const pts = Array.from({ length: 400 }, () => ({ x: rng() * 320, y: rng() * 320 }));
  g.build(pts);
  const out = [];
  for (let k = 0; k < 200; k++) {
    const p = pts[k];
    const got = new Set(g.near(p.x, p.y, out));
    pts.forEach((q, i) => {
      if (Math.abs(q.x - p.x) < 32 && Math.abs(q.y - p.y) < 32) assert.ok(got.has(i), `missed ${i}`);
    });
  }
  g.build([{ x: -50, y: 9999 }]);
  assert.deepEqual(g.near(-50, 9999, out), [0]);
});

// Scripted fast-forward past minute 15. The player is invulnerable and standing still,
// so the crowd piles up: the worst case for separation.
function fastForward(startSec, seconds, { clustered }) {
  resetGame();
  game.rng = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  game.timeOffset = startSec;
  game.spawnCd = 0;
  game.iframes = 1e9;
  player.x = 24 * TILE; player.y = 16 * TILE; player.angle = 0;
  let worst = 0; let total = 0; let peak = 0;
  const samples = [];
  const ticks = Math.round(seconds / STEP);
  for (let i = 0; i < ticks; i++) {
    game.hp = 99;
    if (clustered) player.angle += 0.05;
    const t0 = performance.now();
    updateGame(STEP);
    const dt = performance.now() - t0;
    total += dt;
    samples.push(dt);
    worst = Math.max(worst, dt);
    peak = Math.max(peak, game.enemies.length);
  }
  samples.sort((a, b) => a - b);
  return { avg: total / ticks, worst, peak, p99: samples[Math.floor(samples.length * 0.99)] };
}

test('performance past minute 15: enemy cap and spatial hash keep updates far below 16.6 ms', () => {
  const r = fastForward(15 * 60 + 30, 60, { clustered: true });
  console.log(`# min 15.5-16.5 fast-forward: peak ${r.peak} enemies, avg ${r.avg.toFixed(3)} ms, p99 ${r.p99.toFixed(3)} ms, worst ${r.worst.toFixed(2)} ms per update`);
  assert.ok(r.peak <= DIFFICULTY.enemyCap.max);
  assert.ok(r.peak >= 100, `crowd only reached ${r.peak}`);
  assert.ok(r.avg < 2, `avg ${r.avg} ms`);
  // p99, not the single worst tick: one-off GC or scheduler stalls (seen once at 66 ms in
  // ~3,600 ticks) say nothing about the cost of the game logic.
  assert.ok(r.p99 < 3, `p99 ${r.p99} ms`);
  const late = fastForward(40 * 60, 20, { clustered: true });
  console.log(`# min 40-40.3 fast-forward: peak ${late.peak} enemies, avg ${late.avg.toFixed(3)} ms, p99 ${late.p99.toFixed(3)} ms, worst ${late.worst.toFixed(2)} ms per update`);
  assert.ok(late.peak <= DIFFICULTY.enemyCap.max);
  assert.ok(late.avg < 2);
  assert.ok(late.p99 < 3, `p99 ${late.p99} ms`);
});
