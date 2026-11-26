// Combat state and rules: projectiles, chasing enemies, damage, death, restart.
// No DOM access, so tests can run it in Node.
import {
  TILE, PLAYER_HP, PLAYER_IFRAMES, FIRE_INTERVAL, BULLET_SPEED, BULLET_RADIUS,
  BULLET_LIFE, BULLET_DAMAGE, ENEMY_SIZE, ENEMY_CONTACT_DAMAGE, ENEMY_FLASH, ENEMY_KNOCKBACK,
  SPAWN_MIN_DIST,
} from './config.js';
import { DIFFICULTY } from './difficulty.config.js';
import { directorAt } from './director.js';
import { createGrid } from './spatial.js';
import { isFloor, mapWidth, mapHeight, loadTiles, loadArena, ARENA_SPAWN } from './map.js';
import { generateFloor } from './floorgen.js';
import { floorSeed } from './rng.js';
import { moveBody } from './collision.js';
import { player } from './entities.js';

const grid = createGrid(mapWidth * TILE, mapHeight * TILE, TILE);
const nearBuf = [];

export const game = {
  state: 'playing', // 'playing' | 'dead'
  time: 0, // seconds survived this run
  timeOffset: 0, // seconds added to the clock the director reads; an extension or "part 2" can set it
  kills: 0,
  score: 0,
  hp: PLAYER_HP,
  iframes: 0,
  fireCd: 0,
  spawnCd: 1,
  projectiles: [], // { x, y, vx, vy, life }
  enemies: [], // { x, y, w, h, vx, vy, hp, maxHp, speed, flash }
  rng: Math.random, // tests replace this for determinism
  seed: 0, // run seed: with it, every floor of the run can be regenerated
  floor: 1, // floor number within the run, starting at 1
  layout: arenaLayout(), // the current floor: { spawn, exit, enemySpawns, rooms, ... } (exit is null in the arena)
};

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

// Every floor tile of the hand-built arena, used for enemy spawns there.
function arenaLayout() {
  const enemySpawns = [];
  for (let y = 1; y < mapHeight - 1; y++) for (let x = 1; x < mapWidth - 1; x++) if (isFloor(x, y)) enemySpawns.push([x, y]);
  return {
    arena: true, spawn: { ...ARENA_SPAWN }, exit: null, enemySpawns, rooms: [],
  };
}

function placePlayer(spawn) {
  player.x = (spawn.tx + 0.5) * TILE;
  player.y = (spawn.ty + 0.5) * TILE;
  player.vx = 0;
  player.vy = 0;
}

// Build floor n of the current run, load it into the map and put the player at its spawn.
// Only the map, enemies and projectiles change; the clock, score, kills and HP carry over.
function loadFloor(n) {
  game.floor = n;
  game.layout = generateFloor(floorSeed(game.seed, n));
  loadTiles(game.layout.tiles);
  placePlayer(game.layout.spawn);
  game.projectiles.length = 0;
  game.enemies.length = 0;
}

// Go down to the next floor.
export function descend() {
  loadFloor(game.floor + 1);
}

// Start a new run. `seed` fixes the layout of every floor (random when omitted).
// `arena: true` loads the hand-built test arena instead of a generated floor.
export function resetGame({ seed = randomSeed(), arena = false } = {}) {
  Object.assign(game, {
    state: 'playing', time: 0, timeOffset: 0, kills: 0, score: 0, hp: PLAYER_HP, iframes: 0, fireCd: 0, spawnCd: 1,
    seed: seed >>> 0, floor: 1,
  });
  if (arena) {
    loadArena();
    game.layout = arenaLayout();
    placePlayer(game.layout.spawn);
    game.projectiles.length = 0;
    game.enemies.length = 0;
  } else {
    loadFloor(1);
  }
}

// The time the difficulty director reads: run time plus the extension offset.
export function directorTime() {
  return game.time + game.timeOffset;
}

// Chaser stats for an enemy spawned at the given director time (seconds).
export function enemyStats(time) {
  const d = directorAt(time);
  return { speed: d.speed, hp: d.hp };
}

export function spawnEnemy(x, y) {
  const { speed, hp } = enemyStats(directorTime());
  game.enemies.push({
    x, y, w: ENEMY_SIZE, h: ENEMY_SIZE, vx: 0, vy: 0, hp, maxHp: hp, speed, flash: 0,
  });
}

// End-of-run numbers for the summary screen.
export function runSummary() {
  const over = Math.max(0, directorTime() - DIFFICULTY.softCap);
  return {
    time: game.time,
    kills: game.kills,
    score: Math.floor(game.score),
    reachedOvertime: over > 0,
    overtime: Math.min(over, game.time),
  };
}

// Pick a spawn point from the floor's list (open tiles away from the player's start room)
// that is far enough from the player. Gives up after a few tries.
function trySpawn() {
  const points = game.layout.enemySpawns;
  if (!points.length) return;
  for (let i = 0; i < 20; i++) {
    const [tx, ty] = points[Math.floor(game.rng() * points.length)];
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
  grid.build(game.enemies);
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || !isFloor(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
    if (!dead) {
      // Hit the lowest-index overlapping enemy among the nearby candidates.
      let hit = -1;
      for (const j of grid.near(b.x, b.y, nearBuf)) {
        const e = game.enemies[j];
        if (Math.abs(e.x - b.x) < half && Math.abs(e.y - b.y) < half && (hit < 0 || j < hit)) hit = j;
      }
      if (hit >= 0) {
        const e = game.enemies[hit];
        e.hp -= BULLET_DAMAGE;
        e.flash = ENEMY_FLASH;
        const len = Math.hypot(b.vx, b.vy) || 1;
        moveBody(e, (b.vx / len) * ENEMY_KNOCKBACK, (b.vy / len) * ENEMY_KNOCKBACK);
        dead = true;
      }
    }
    if (dead) list.splice(i, 1);
  }
  const sc = DIFFICULTY.score;
  const mult = directorAt(directorTime()).phase === 'overtime' ? sc.overtimeMultiplier : 1;
  const alive = [];
  for (const e of game.enemies) {
    if (e.hp > 0) {
      alive.push(e);
    } else {
      game.kills++;
      game.score += sc.perEnemyHp * e.maxHp * mult;
    }
  }
  game.enemies = alive;
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
  // The grid limits each enemy to its neighbours, so the cost grows with n, not n^2.
  grid.build(list);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (const j of grid.near(a.x, a.y, nearBuf)) {
      if (j <= i) continue;
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
  game.score += DIFFICULTY.score.perSecond * dt;
  const exit = game.layout.exit;
  if (exit && Math.floor(player.x / TILE) === exit.tx && Math.floor(player.y / TILE) === exit.ty) {
    descend();
    return;
  }
  game.fireCd = Math.max(0, game.fireCd - dt);
  if (game.fireCd <= 0) fire();
  updateProjectiles(dt);
  game.spawnCd -= dt;
  if (game.spawnCd <= 0) {
    const dir = directorAt(directorTime());
    game.spawnCd += dir.spawnInterval;
    for (let i = 0; i < dir.spawnBatch && game.enemies.length < dir.cap; i++) trySpawn();
  }
  updateEnemies(dt);
  updateDamage(dt);
}
