import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, STEP, FIRE_INTERVAL, ENEMY_HP_START, ENEMY_CAP, PLAYER_HP, PLAYER_IFRAMES,
  ENEMY_SPEED_START, ENEMY_SPEED_MAX, PLAYER_SPEED,
} from '../src/config.js';
import { player } from '../src/entities.js';
import { isFloor } from '../src/map.js';
import {
  game, resetGame, spawnEnemy, updateGame, enemyStats,
} from '../src/game.js';

beforeEach(() => {
  resetGame();
  game.spawnCd = 1e9; // no random spawns unless a test wants them
  player.x = 4.5 * TILE;
  player.y = 12.5 * TILE;
  player.angle = 0;
});

const run = (ticks) => { for (let i = 0; i < ticks; i++) updateGame(STEP); };

test('fire rate: the weapon fires once per FIRE_INTERVAL with no input', () => {
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    updateGame(STEP);
    if (game.fireCd === FIRE_INTERVAL) shots++;
  }
  const expected = Math.ceil(1 / FIRE_INTERVAL);
  assert.ok(Math.abs(shots - expected) <= 1, `shots ${shots} vs ${expected}`);
});

test('the standard weapon fires with no button held, along the aim angle', () => {
  player.angle = 0;
  run(Math.ceil(FIRE_INTERVAL / STEP) + 2);
  assert.ok(game.projectiles.length >= 1);
  for (const b of game.projectiles) assert.ok(b.vx > 0 && b.vy === 0);
  player.angle = Math.PI / 2;
  game.fireCd = 0;
  run(1);
  const last = game.projectiles[game.projectiles.length - 1];
  assert.ok(last.vy > 0 && Math.abs(last.vx) < 1e-6);
});

test('bullet kills an enemy after ENEMY_HP_START hits and counts the kill', () => {
  spawnEnemy(player.x + 5 * TILE, player.y);
  game.enemies[0].vx = 0;
  run(ENEMY_HP_START * Math.ceil(FIRE_INTERVAL / STEP) + 90);
  assert.ok(game.kills >= 1);
});

test('bullets are removed at walls and never sit inside one', () => {
  player.angle = Math.PI; // toward the left border, 4 tiles away
  for (let i = 0; i < 120; i++) {
    updateGame(STEP);
    for (const b of game.projectiles) {
      assert.ok(isFloor(Math.floor(b.x / TILE), Math.floor(b.y / TILE)), `bullet in wall at ${b.x},${b.y}`);
    }
  }
  assert.ok(game.projectiles.length < 6);
  player.x = 1.2 * TILE; // muzzle starts inside the border wall: no bullet is created
  player.angle = Math.PI;
  game.projectiles.length = 0;
  game.fireCd = 0;
  run(1);
  assert.equal(game.projectiles.length, 0);
});

test('enemy chases the player at ENEMY_SPEED_START at run time 0', () => {
  player.angle = -Math.PI / 2; // aim away so auto-fire does not hit the enemy
  spawnEnemy(player.x + 6 * TILE, player.y);
  const x0 = game.enemies[0].x;
  run(30);
  const moved = x0 - game.enemies[0].x;
  assert.ok(Math.abs(moved - ENEMY_SPEED_START * 0.5) < 3, `moved ${moved}`);
});

test('contact damages once per invulnerability window, then kills the player', () => {
  spawnEnemy(player.x, player.y);
  run(1);
  assert.equal(game.hp, PLAYER_HP - 1);
  run(Math.floor(PLAYER_IFRAMES / STEP) - 5);
  assert.equal(game.hp, PLAYER_HP - 1, 'no second hit during iframes');
  run(600);
  assert.equal(game.state, 'dead');
  assert.ok(game.hp <= 0);
});

test('dead state freezes the run; resetGame restarts it', () => {
  spawnEnemy(player.x, player.y);
  run(600);
  assert.equal(game.state, 'dead');
  const t = game.time;
  run(10);
  assert.equal(game.time, t);
  resetGame();
  assert.equal(game.state, 'playing');
  assert.equal(game.hp, PLAYER_HP);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.projectiles.length, 0);
  assert.equal(game.kills, 0);
});

test('spawner respects the enemy cap and keeps spawns away from the player', () => {
  resetGame();
  game.spawnCd = 0;
  player.x = 2.5 * TILE;
  player.y = 2.5 * TILE;
  game.iframes = 1e9; // survive for the test
  for (let i = 0; i < 6000; i++) { game.spawnCd = 0; updateGame(STEP); }
  assert.ok(game.enemies.length <= ENEMY_CAP);
  assert.ok(game.enemies.length > 0);
});

test('50 enemies plus bullets: update cost stays far below the 16.6 ms budget', () => {
  resetGame();
  game.spawnCd = 1e9;
  game.iframes = 1e9;
  for (let i = 0; i < 50; i++) spawnEnemy((20 + (i % 10)) * TILE, (5 + Math.floor(i / 10) * 2) * TILE);
  const start = performance.now();
  const ticks = 600;
  for (let i = 0; i < ticks; i++) { game.hp = 99; updateGame(STEP); }
  const perTick = (performance.now() - start) / ticks;
  console.log(`# 50 enemies: ${perTick.toFixed(3)} ms per update`);
  assert.ok(perTick < 2, `update took ${perTick} ms`);
});

test('enemies get faster and tougher with run time, speed capped below the player', () => {
  const early = enemyStats(0);
  const mid = enemyStats(120);
  const late = enemyStats(600);
  assert.equal(early.speed, ENEMY_SPEED_START);
  assert.equal(early.hp, ENEMY_HP_START);
  assert.ok(mid.speed > early.speed && mid.hp > early.hp);
  assert.ok(late.hp > mid.hp);
  assert.equal(late.speed, ENEMY_SPEED_MAX);
  assert.ok(ENEMY_SPEED_MAX < PLAYER_SPEED);
  game.time = 300;
  spawnEnemy(100, 100);
  assert.deepEqual([game.enemies[0].speed, game.enemies[0].hp], [enemyStats(300).speed, enemyStats(300).hp]);
});
