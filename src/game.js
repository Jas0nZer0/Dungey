// Combat state and rules: projectiles, chasing enemies, damage, death, restart.
// No DOM access, so tests can run it in Node.
import {
  TILE, PLAYER_HP, PLAYER_IFRAMES, FIRE_INTERVAL, BULLET_SPEED, BULLET_RADIUS,
  BULLET_LIFE, BULLET_DAMAGE, ENEMY_SIZE, ENEMY_SPEED_START, ENEMY_SPEED_PER_SEC, ENEMY_SPEED_MAX, ENEMY_HP_START,
  ENEMY_HP_PER_SEC,
  ENEMY_CONTACT_DAMAGE, ENEMY_FLASH, ENEMY_KNOCKBACK, ENEMY_CAP,
  SPAWN_INTERVAL_START, SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_DECAY, SPAWN_MIN_DIST,
} from './config.js';
import { isFloor, mapWidth, mapHeight } from './map.js';
import { moveBody } from './collision.js';
import { player } from './entities.js';

export const game = {
  state: 'playing', // 'playing' | 'dead'
  time: 0, // seconds survived this run
  kills: 0,
  hp: PLAYER_HP,
  iframes: 0,
  fireCd: 0,
  spawnCd: 1,
  projectiles: [], // { x, y, vx, vy, life }
  enemies: [], // { x, y, w, h, vx, vy, hp, flash }
  rng: Math.random, // tests replace this for determinism
};

export function resetGame() {
  player.x = 2.5 * TILE;
  player.y = 2.5 * TILE;
  player.vx = 0;
  player.vy = 0;
  Object.assign(game, {
    state: 'playing', time: 0, kills: 0, hp: PLAYER_HP, iframes: 0, fireCd: 0, spawnCd: 1,
  });
  game.projectiles.length = 0;
  game.enemies.length = 0;
}

// Chaser stats for an enemy spawned at the given run time (seconds).
export function enemyStats(time) {
  return {
    speed: Math.min(ENEMY_SPEED_MAX, ENEMY_SPEED_START + time * ENEMY_SPEED_PER_SEC),
    hp: Math.round(ENEMY_HP_START + time * ENEMY_HP_PER_SEC),
  };
}

export function spawnEnemy(x, y) {
  const { speed, hp } = enemyStats(game.time);
  game.enemies.push({
    x, y, w: ENEMY_SIZE, h: ENEMY_SIZE, vx: 0, vy: 0, hp, speed, flash: 0,
  });
}

// Pick a random floor tile far enough from the player. Gives up after a few tries.
function trySpawn() {
  for (let i = 0; i < 20; i++) {
    const tx = 1 + Math.floor(game.rng() * (mapWidth - 2));
    const ty = 1 + Math.floor(game.rng() * (mapHeight - 2));
    if (!isFloor(tx, ty)) continue;
    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    if (Math.hypot(x - player.x, y - player.y) < SPAWN_MIN_DIST) continue;
    spawnEnemy(x, y);
    return;
  }
}

function fire() {
  const c = Math.cos(player.angle);
  const s = Math.sin(player.angle);
  const x = player.x + c * 14;
  const y = player.y + s * 14;
  game.fireCd = FIRE_INTERVAL;
  if (!isFloor(Math.floor(x / TILE), Math.floor(y / TILE))) return; // muzzle inside a wall
  game.projectiles.push({
    x, y, vx: c * BULLET_SPEED, vy: s * BULLET_SPEED, life: BULLET_LIFE,
  });
}

function updateProjectiles(dt) {
  const half = ENEMY_SIZE / 2 + BULLET_RADIUS;
  const list = game.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || !isFloor(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
    if (!dead) {
      for (const e of game.enemies) {
        if (Math.abs(e.x - b.x) < half && Math.abs(e.y - b.y) < half) {
          e.hp -= BULLET_DAMAGE;
          e.flash = ENEMY_FLASH;
          const len = Math.hypot(b.vx, b.vy) || 1;
          moveBody(e, (b.vx / len) * ENEMY_KNOCKBACK, (b.vy / len) * ENEMY_KNOCKBACK);
          dead = true;
          break;
        }
      }
    }
    if (dead) list.splice(i, 1);
  }
  const before = game.enemies.length;
  game.enemies = game.enemies.filter((e) => e.hp > 0);
  game.kills += before - game.enemies.length;
}

function updateEnemies(dt) {
  const list = game.enemies;
  for (const e of list) {
    e.flash = Math.max(0, e.flash - dt);
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.vx = (dx / len) * e.speed;
    e.vy = (dy / len) * e.speed;
  }
  // Push overlapping enemies apart so a crowd spreads instead of stacking.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) >= ENEMY_SIZE || Math.abs(dy) >= ENEMY_SIZE) continue;
      const d = Math.hypot(dx, dy) || 1;
      const push = (ENEMY_SIZE - d) * 0.5 * 0.2;
      a.vx -= (dx / d) * push / dt;
      a.vy -= (dy / d) * push / dt;
      b.vx += (dx / d) * push / dt;
      b.vy += (dy / d) * push / dt;
    }
  }
  for (const e of list) moveBody(e, e.vx * dt, e.vy * dt);
}

function touchesPlayer(e) {
  return Math.abs(e.x - player.x) < (e.w + player.w) / 2
    && Math.abs(e.y - player.y) < (e.h + player.h) / 2;
}

function updateDamage(dt) {
  game.iframes = Math.max(0, game.iframes - dt);
  if (game.iframes > 0) return;
  for (const e of game.enemies) {
    if (touchesPlayer(e)) {
      game.hp -= ENEMY_CONTACT_DAMAGE;
      game.iframes = PLAYER_IFRAMES;
      if (game.hp <= 0) game.state = 'dead';
      return;
    }
  }
}

// One tick of combat. Call after the player has moved and aimed. The standard weapon
// fires on its own at FIRE_INTERVAL along player.angle. Weapons that need a button
// press (special attacks) are not built yet; add them as separate actions, not here.
export function updateGame(dt) {
  if (game.state !== 'playing') return;
  game.time += dt;
  game.fireCd = Math.max(0, game.fireCd - dt);
  if (game.fireCd <= 0) fire();
  updateProjectiles(dt);
  game.spawnCd -= dt;
  if (game.spawnCd <= 0) {
    const interval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_START - game.time * SPAWN_INTERVAL_DECAY);
    game.spawnCd += interval;
    if (game.enemies.length < ENEMY_CAP) trySpawn();
  }
  updateEnemies(dt);
  updateDamage(dt);
}
