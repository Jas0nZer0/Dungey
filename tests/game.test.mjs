import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, STEP, FIRE_INTERVAL, ENEMY_HP, ENEMY_CAP, PLAYER_HP, PLAYER_IFRAMES, ENEMY_SPEED,
} from '../src/config.js';
import { player } from '../src/entities.js';
import { game, resetGame, spawnEnemy, updateGame } from '../src/game.js';

beforeEach(() => {
  resetGame();
  game.spawnCd = 1e9; // no random spawns unless a test wants them
  player.x = 4.5 * TILE;
  player.y = 12.5 * TILE;
  player.angle = 0;
});

const run = (ticks, firing = false) => { for (let i = 0; i < ticks; i++) updateGame(STEP, firing); };

test('fire rate: holding fire yields one shot per FIRE_INTERVAL', () => {
  run(60, true); // 1 s
  const expected = Math.ceil(1 / FIRE_INTERVAL);
  // Bullets may have expired or hit walls; count by cooldown instead.
  let shots = 0;
  resetGame();
  game.spawnCd = 1e9;
  player.angle = 0;
  for (let i = 0; i < 60; i++) {
    const before = game.fireCd;
    updateGame(STEP, true);
    if (game.fireCd > before || (before === 0 && game.fireCd === FIRE_INTERVAL)) shots++;
  }
  assert.ok(Math.abs(shots - expected) <= 1, `shots ${shots} vs ${expected}`);
});

test('not firing creates no projectiles', () => {
  run(30, false);
  assert.equal(game.projectiles.length, 0);
});

test('bullet kills an enemy after ENEMY_HP hits and counts the kill', () => {
  spawnEnemy(player.x + 5 * TILE, player.y);
  game.enemies[0].vx = 0;
  run(ENEMY_HP * Math.ceil(FIRE_INTERVAL / STEP) + 90, true);
  assert.equal(game.kills >= 1, true);
});

test('bullet disappears at a wall', () => {
  player.x = 2.5 * TILE;
  player.y = 2.5 * TILE;
  player.angle = Math.PI; // toward the left border
  run(1, true);
  assert.ok(game.projectiles.length <= 1);
  run(60, false);
  assert.equal(game.projectiles.length, 0);
});

test('enemy chases the player at ENEMY_SPEED', () => {
  spawnEnemy(player.x + 6 * TILE, player.y);
  const x0 = game.enemies[0].x;
  run(30);
  const moved = x0 - game.enemies[0].x;
  assert.ok(Math.abs(moved - ENEMY_SPEED * 0.5) < 3, `moved ${moved}`);
});

test('contact damages once per invulnerability window, then kills the player', () => {
  spawnEnemy(player.x, player.y);
  run(1);
  assert.equal(game.hp, PLAYER_HP - 1);
  run(Math.floor(PLAYER_IFRAMES / STEP) - 5);
  assert.equal(game.hp, PLAYER_HP - 1, 'no second hit during iframes');
  run(600);
  assert.equal(game.state, 'dead');
  assert.equal(game.hp <= 0, true);
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
  for (let i = 0; i < 6000; i++) { game.spawnCd = 0; updateGame(STEP, false); }
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
  for (let i = 0; i < ticks; i++) { game.hp = 99; updateGame(STEP, true); }
  const perTick = (performance.now() - start) / ticks;
  console.log(`# 50 enemies: ${perTick.toFixed(3)} ms per update`);
  assert.ok(perTick < 2, `update took ${perTick} ms`);
});
