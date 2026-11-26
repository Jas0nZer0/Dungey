// Combat state and rules: projectiles, chasing enemies, damage, death, restart.
// No DOM access, so tests can run it in Node.
import {
  TILE, PLAYER_HP, PLAYER_IFRAMES, FIRE_INTERVAL, BULLET_SPEED, BULLET_RADIUS,
  BULLET_LIFE, BULLET_DAMAGE, ENEMY_FLASH, ENEMY_KNOCKBACK,
  SPAWN_MIN_DIST, SPAWN_MAX_DIST, BOSS_SPAWN_TIME,
} from './config.js';
import { DIFFICULTY } from './difficulty.config.js';
import { directorAt, phaseAt } from './director.js';
import { createGrid } from './spatial.js';
import { createFlowField, boxClear } from './flowfield.js';
import { SPAWN_TABLE, ENEMIES } from './enemies.config.js';
import { makeEnemy, makeBoss, thinkEnemy } from './enemies.js';
import { isFloor, mapWidth, mapHeight, loadTiles, loadArena, ARENA_SPAWN } from './map.js';
import { generateFloor } from './floorgen.js';
import { floorSeed } from './rng.js';
import { moveBody } from './collision.js';
import { player } from './entities.js';

// Rebuilt whenever the map size changes (arena 48x32, floors larger).
let grid = createGrid(mapWidth * TILE, mapHeight * TILE, TILE);
const rebuildGrid = () => { grid = createGrid(mapWidth * TILE, mapHeight * TILE, TILE); };
const nearBuf = [];
const flow = createFlowField(); // one shared BFS from the player's tile (src/flowfield.js)
export { flow };

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
  enemies: [], // { type, x, y, w, h, vx, vy, hp, maxHp, speed, flash, state, tell, ... } (see src/enemies.js)
  enemyProjectiles: [], // { x, y, vx, vy, life, damage, r } bolts fired by shooters and the boss
  effects: [], // short visual events { kind, x, y, r, t, max }, for the renderer only
  boss: null, // the floor's living boss, or null (none in the arena, or already dead)
  bossDefeated: false, // true once this floor's boss has died
  mapVersion: 0, // bumps whenever a new map is loaded, so the flow field knows to rebuild
  rng: Math.random, // tests replace this for determinism
  seed: 0, // run seed: with it, every floor of the run can be regenerated
  floor: 1, // floor number within the run, starting at 1
  floorTime: 0, // seconds spent on this floor; resets on descend (the run clock `time` does not)
  exitUnlocked: false, // false until the floor's boss dies ('boss'); once open they stay open
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
  rebuildGrid();
  game.floorTime = 0;
  game.exitUnlocked = false;
  placePlayer(game.layout.spawn);
  clearCombat();
}

// Empty the field of everything that fights, and mark the map as new for the flow field.
function clearCombat() {
  game.projectiles.length = 0;
  game.enemies.length = 0;
  game.enemyProjectiles.length = 0;
  game.effects.length = 0;
  game.boss = null;
  game.bossDefeated = false;
  game.mapVersion++;
}

// Unlock the stairs. `why` is 'boss' (the only in-game reason). A boss death calls it.
export function unlockExit(why = 'boss') {
  game.exitUnlocked = why;
}

// Seconds until this floor's boss spawns (0 once it has appeared or died, and on floors with no boss).
export function bossTimeLeft() {
  if (!game.layout.boss || game.boss || game.bossDefeated) return 0;
  return Math.max(0, BOSS_SPAWN_TIME - game.floorTime);
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
    rebuildGrid();
    game.layout = arenaLayout();
    game.floorTime = 0;
    game.exitUnlocked = false;
    placePlayer(game.layout.spawn);
    clearCombat();
  } else {
    loadFloor(1);
  }
}

// Run clock plus the extension offset. Overtime and the run summary read this.
export function clockTime() {
  return game.time + game.timeOffset;
}

// The time the difficulty director reads: the clock plus DIFFICULTY.floorOffset per floor
// below the first. Deeper floors spawn tougher enemies; the player's stats never change.
export function directorTime() {
  return clockTime() + (game.floor - 1) * DIFFICULTY.floorOffset;
}

// Chaser stats for an enemy spawned at the given director time (seconds).
export function enemyStats(time) {
  const d = directorAt(time);
  return { speed: d.speed, hp: d.hp };
}

// Add an enemy of `type` (default chaser) at (x, y). Its HP and speed are the director's
// numbers for the current time, scaled by the type's multipliers (src/enemies.config.js).
export function spawnEnemy(x, y, type = 'chaser') {
  const e = makeEnemy(type, x, y, enemyStats(directorTime()));
  game.enemies.push(e);
  return e;
}

// Add the floor's boss at (x, y). It roars for a moment, then hunts the player.
export function spawnBoss(x, y) {
  const e = makeBoss(x, y, enemyStats(directorTime()));
  game.enemies.push(e);
  game.boss = e;
  return e;
}

// End-of-run numbers for the summary screen.
export function runSummary() {
  const over = Math.max(0, clockTime() - DIFFICULTY.softCap);
  return {
    time: game.time,
    kills: game.kills,
    score: Math.floor(game.score),
    reachedOvertime: over > 0,
    overtime: Math.min(over, game.time),
  };
}

const ring = [];

// Pick a spawn point from the floor's list (open tiles away from the player's start room)
// in a ring around the player: at least SPAWN_MIN_DIST and at most SPAWN_MAX_DIST away, so
// enemies on a large floor arrive in seconds. If no point lies in the ring, any point at
// least SPAWN_MIN_DIST away will do.
function trySpawn(room) {
  const points = game.layout.enemySpawns;
  ring.length = 0;
  let far = -1;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot((points[i][0] + 0.5) * TILE - player.x, (points[i][1] + 0.5) * TILE - player.y);
    if (d < SPAWN_MIN_DIST) continue;
    if (d <= SPAWN_MAX_DIST) ring.push(i);
    else far = i;
  }
  const pick = ring.length ? ring[Math.floor(game.rng() * ring.length)] : far;
  if (pick < 0) return;
  const t = directorTime();
  let total = 0;
  for (const row of SPAWN_TABLE) if (row.from <= t) total += row.weight;
  let roll = game.rng() * total;
  let kind = SPAWN_TABLE[0];
  for (const row of SPAWN_TABLE) {
    if (row.from > t) continue;
    kind = row;
    roll -= row.weight;
    if (roll < 0) break;
  }
  const cx = (points[pick][0] + 0.5) * TILE;
  const cy = (points[pick][1] + 0.5) * TILE;
  const n = Math.max(1, Math.min(kind.pack, room));
  for (let i = 0; i < n; i++) {
    // A pack spreads in a small ring; spawn tiles have all eight neighbours open, so it fits.
    const a = (i / n) * Math.PI * 2;
    const r = n > 1 ? 9 : 0;
    spawnEnemy(cx + Math.cos(a) * r, cy + Math.sin(a) * r, kind.type);
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
  const list = game.projectiles;
  grid.build(game.enemies);
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || !isFloor(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
    if (!dead) {
      // Hit the lowest-index overlapping enemy among the nearby candidates. The grid cell is
      // one tile, so every body up to a tile wide (the boss is 40 px) is found from its centre.
      let hit = -1;
      for (const j of grid.near(b.x, b.y, nearBuf)) {
        const e = game.enemies[j];
        const half = e.w / 2 + BULLET_RADIUS;
        if (Math.abs(e.x - b.x) < half && Math.abs(e.y - b.y) < half && (hit < 0 || j < hit)) hit = j;
      }
      if (hit >= 0) {
        const e = game.enemies[hit];
        if (!e.invuln) {
          e.hp -= BULLET_DAMAGE;
          e.flash = ENEMY_FLASH;
          const len = Math.hypot(b.vx, b.vy) || 1;
          const k = ENEMY_KNOCKBACK * e.knock;
          if (k > 0) moveBody(e, (b.vx / len) * k, (b.vy / len) * k);
        }
        dead = true;
      }
    }
    if (dead) list.splice(i, 1);
  }
  const sc = DIFFICULTY.score;
  const mult = phaseAt(clockTime()) === 'overtime' ? sc.overtimeMultiplier : 1;
  const alive = [];
  for (const e of game.enemies) {
    if (e.hp > 0) {
      alive.push(e);
      continue;
    }
    game.kills++;
    game.score += sc.perEnemyHp * e.maxHp * mult;
    if (e.owner) e.owner.minions = Math.max(0, e.owner.minions - 1);
    if (e === game.boss) {
      game.boss = null;
      game.bossDefeated = true;
      game.effects.push({ kind: 'bossdeath', x: e.x, y: e.y, r: 90, t: 0.6, max: 0.6 });
      if (!game.exitUnlocked) unlockExit('boss');
    }
  }
  game.enemies = alive;
}

// ---------- enemies ----------

// The player takes damage unless still invulnerable from the last hit.
function hurtPlayer(dmg) {
  if (game.iframes > 0 || game.state !== 'playing') return false;
  game.hp -= dmg;
  game.iframes = PLAYER_IFRAMES;
  if (game.hp <= 0) game.state = 'dead';
  return true;
}

function shootBolt(x, y, angle, speed, damage, life, r) {
  game.enemyProjectiles.push({
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, damage, r,
  });
}

// Add a minion (a summoner's or the boss's) at a free spot near (x, y). Returns it, or null
// when the hard enemy cap is reached.
function spawnMinion(type, x, y) {
  if (game.enemies.length >= DIFFICULTY.enemyCap.max) return null;
  const size = ENEMIES[type].size;
  if (!boxClear(x, y, size)) return null;
  return spawnEnemy(x, y, type);
}

const aiCtx = {
  game, player, flow, hurt: hurtPlayer, spawn: spawnMinion, shoot: shootBolt,
  effect: (kind, x, y, r, secs) => game.effects.push({ kind, x, y, r, t: secs, max: secs }),
};

function updateEnemies(dt) {
  const list = game.enemies;
  if (list.length) {
    // One BFS from the player's tile, only when the tile (or the map) changed.
    flow.update(mapWidth, mapHeight, Math.floor(player.x / TILE), Math.floor(player.y / TILE), game.mapVersion);
  }
  for (const e of list) thinkEnemy(e, aiCtx, dt);
  // Push overlapping enemies apart so a crowd spreads instead of stacking.
  // The grid limits each enemy to its neighbours, so the cost grows with n, not n^2.
  grid.build(list);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.type === 'boss') continue; // too heavy to shove
    for (const j of grid.near(a.x, a.y, nearBuf)) {
      if (j <= i) continue;
      const b = list[j];
      if (b.type === 'boss') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const sep = (a.w + b.w) / 2;
      if (Math.abs(dx) >= sep || Math.abs(dy) >= sep) continue;
      const d = Math.hypot(dx, dy) || 1;
      const push = (sep - d) * 0.5 * 0.2;
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

function updateEnemyProjectiles(dt) {
  const list = game.enemyProjectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || !isFloor(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
    if (!dead && Math.abs(b.x - player.x) < player.w / 2 + b.r && Math.abs(b.y - player.y) < player.h / 2 + b.r) {
      hurtPlayer(b.damage); // a bolt that lands during invulnerability is spent for nothing
      dead = true;
    }
    if (dead) list.splice(i, 1);
  }
}

function updateEffects(dt) {
  const list = game.effects;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t -= dt;
    if (list[i].t <= 0) list.splice(i, 1);
  }
}

function updateDamage(dt) {
  game.iframes = Math.max(0, game.iframes - dt);
  updateEnemyProjectiles(dt);
  updateEffects(dt);
  if (game.iframes > 0) return;
  let dmg = 0;
  for (const e of game.enemies) if (e.contact > dmg && touchesPlayer(e)) dmg = e.contact;
  if (dmg > 0) hurtPlayer(dmg);
}

// One tick of combat. Call after the player has moved and aimed. The standard weapon
// fires on its own at FIRE_INTERVAL along player.angle. Weapons that need a button
// press (special attacks) are not built yet; add them as separate actions, not here.
export function updateGame(dt) {
  if (game.state !== 'playing') return;
  game.time += dt;
  game.score += DIFFICULTY.score.perSecond * dt;
  game.floorTime += dt;
  // The boss appears in its hiding room 2:00 after arriving. Killing it unlocks the stairs.
  const bs = game.layout.boss;
  if (bs && !game.boss && !game.bossDefeated && game.floorTime >= BOSS_SPAWN_TIME) {
    spawnBoss((bs.tx + 0.5) * TILE, (bs.ty + 0.5) * TILE);
    game.effects.push({ kind: 'bossspawn', x: (bs.tx + 0.5) * TILE, y: (bs.ty + 0.5) * TILE, r: 70, t: 0.8, max: 0.8 });
  }
  const exit = game.layout.exit;
  if (exit && game.exitUnlocked && Math.floor(player.x / TILE) === exit.tx && Math.floor(player.y / TILE) === exit.ty) {
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
    for (let i = 0; i < dir.spawnBatch && game.enemies.length < dir.cap; i++) trySpawn(dir.cap - game.enemies.length);
  }
  updateEnemies(dt);
  updateDamage(dt);
}
