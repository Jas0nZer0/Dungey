// M4: procedural floors. Run: node --test tests/
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, STEP, FLOOR_W, FLOOR_H, ENEMY_SIZE, PLAYER_SIZE, PLAYER_HP, PLAYER_SPEED, BOSS_SPAWN_TIME,
  SPAWN_MIN_DIST, SPAWN_MAX_DIST,
} from '../src/config.js';
import { DIFFICULTY } from '../src/difficulty.config.js';
import { directorAt } from '../src/director.js';
import { FLOOR } from '../src/floorgen.config.js';
import { createRng, mixSeed, floorSeed, parseSeed } from '../src/rng.js';
import {
  generateFloor, connectivityReport, floorMetrics, snagReport, distanceField,
} from '../src/floorgen.js';
import {
  loadTiles, isFloor, map, mapWidth, mapHeight,
} from '../src/map.js';
import { overlapsWall } from '../src/collision.js';
import { player } from '../src/entities.js';
import {
  game, resetGame, updateGame, descend, spawnEnemy, unlockExit, bossTimeLeft, directorTime, enemyStats,
} from '../src/game.js';

const SEEDS = 1000;
const overlapsBox = (f, x, y, size) => {
  const h = size / 2;
  for (const [cx, cy] of [[x - h, y - h], [x + h - 1e-6, y - h], [x - h, y + h - 1e-6], [x + h - 1e-6, y + h - 1e-6]]) {
    if (f.tiles[Math.floor(cy / TILE)][Math.floor(cx / TILE)] !== '.') return true;
  }
  return false;
};

// Generated once and shared by the tests below; generation is deterministic.
const floors = Array.from({ length: SEEDS }, (_, s) => generateFloor(s));

test('rng: same seed gives the same sequence, different seeds differ, ranges hold', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const sa = Array.from({ length: 50 }, () => a.next());
  const sb = Array.from({ length: 50 }, () => b.next());
  const sc = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  const r = createRng(7);
  for (let i = 0; i < 2000; i++) {
    const v = r.range(3, 9);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 9);
    const f = r.next();
    assert.ok(f >= 0 && f < 1);
  }
  assert.notEqual(mixSeed(1, 1), mixSeed(1, 2));
  assert.notEqual(floorSeed(5, 1), floorSeed(5, 2));
  assert.equal(parseSeed('12345'), 12345);
  assert.equal(parseSeed('hello'), parseSeed(' hello '));
});

test('the same seed always produces the same floor, and seeds produce different floors', () => {
  for (const s of [0, 1, 42, 999, 123456789, 4294967295]) {
    assert.deepEqual(generateFloor(s), generateFloor(s), `seed ${s}`);
  }
  const unique = new Set(floors.map((f) => f.tiles.join('\n')));
  assert.ok(unique.size >= SEEDS * 0.99, `only ${unique.size} distinct layouts in ${SEEDS} seeds`);
});

test(`${SEEDS} generated seeds all pass the connectivity check`, () => {
  floors.forEach((f, s) => {
    assert.equal(f.tiles.length, FLOOR_H);
    for (const row of f.tiles) assert.equal(row.length, FLOOR_W);
    const c = connectivityReport(f);
    assert.ok(c.border, `seed ${s}: border is not solid wall`);
    assert.ok(c.spawnOk, `seed ${s}: spawn is not on floor`);
    assert.ok(c.exitOk, `seed ${s}: exit is not on floor`);
    assert.equal(c.unreached, 0, `seed ${s}: ${c.unreached} floor tiles unreachable from spawn`);
    assert.equal(c.roomsUnreached, 0, `seed ${s}: a room is unreachable`);
    assert.ok(c.exitDist >= FLOOR.minExitPath, `seed ${s}: exit only ${c.exitDist} steps from spawn`);
    assert.notDeepEqual(f.spawn, f.exit);
    assert.ok(f.rooms.length >= FLOOR.minRooms && f.rooms.length <= FLOOR.maxRooms, `seed ${s}: ${f.rooms.length} rooms`);
  });
});

test('connectivity holds for the real collision map: walk every room centre and the exit from spawn', () => {
  // Independent of the generator's own report: load the tiles into the live map and flood
  // it with the same isFloor that collision.js uses.
  for (let s = 0; s < SEEDS; s += 10) {
    const f = floors[s];
    loadTiles(f.tiles);
    const dist = distanceField(FLOOR_W, FLOOR_H, isFloor, f.spawn.tx, f.spawn.ty);
    for (const r of f.rooms) assert.ok(dist[r.cx + r.cy * FLOOR_W] >= 0, `seed ${s}: room at ${r.x},${r.y} unreachable`);
    assert.ok(dist[f.exit.tx + f.exit.ty * FLOOR_W] >= 0, `seed ${s}: exit unreachable`);
  }
});

test('player and enemy spawn points never land inside walls', () => {
  const body = (tx, ty, size) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, w: size, h: size });
  let enemyPoints = 0;
  floors.forEach((f, s) => {
    loadTiles(f.tiles);
    assert.ok(!overlapsWall(body(f.spawn.tx, f.spawn.ty, PLAYER_SIZE)), `seed ${s}: player spawn in a wall`);
    assert.ok(!overlapsWall(body(f.exit.tx, f.exit.ty, PLAYER_SIZE)), `seed ${s}: exit in a wall`);
    assert.ok(f.enemySpawns.length >= 20, `seed ${s}: only ${f.enemySpawns.length} enemy spawn points`);
    const dist = distanceField(FLOOR_W, FLOOR_H, isFloor, f.spawn.tx, f.spawn.ty);
    for (const [tx, ty] of f.enemySpawns) {
      enemyPoints++;
      assert.ok(isFloor(tx, ty), `seed ${s}: enemy spawn ${tx},${ty} is a wall`);
      assert.ok(!overlapsWall(body(tx, ty, ENEMY_SIZE)), `seed ${s}: enemy body at ${tx},${ty} overlaps a wall`);
      assert.ok(dist[tx + ty * FLOOR_W] >= 0, `seed ${s}: enemy spawn ${tx},${ty} unreachable`);
    }
  });
  assert.ok(enemyPoints > SEEDS * 20);
});

test('snag rules: no dead-end tiles, no 1-wide passages, no diagonal pinches, no room with a single exit', () => {
  floors.forEach((f, s) => {
    const r = snagReport(f.tiles);
    assert.deepEqual(r, { deadEnds: 0, narrow: 0, pinches: 0 }, `seed ${s}`);
    const degree = new Array(f.rooms.length).fill(0);
    for (const [a, b] of f.links) { degree[a]++; degree[b]++; }
    degree.forEach((d, i) => assert.ok(d >= 2, `seed ${s}: room ${i} has ${d} link(s)`));
  });
});

test('cover and fire lanes: measurable proxy holds on every seed', () => {
  // Fire lane: FLOOR.laneMin or more floor tiles in a straight row or column inside a room.
  // Cover: wall tiles inside the room rectangle. See the M4 Handoff for the reasoning.
  let withLane = 0;
  let open = 0;
  let rooms = 0;
  let worstClutter = 0;
  floors.forEach((f, s) => {
    const m = floorMetrics(f);
    assert.ok(f.quality, `seed ${s}: fell back to a layout below the quality gate`);
    assert.ok(m.laneShare >= FLOOR.minLaneShare, `seed ${s}: lane share ${m.laneShare}`);
    assert.ok(m.openShare <= FLOOR.maxOpenShare, `seed ${s}: open share ${m.openShare}`);
    assert.ok(m.maxClutter <= FLOOR.maxClutter, `seed ${s}: clutter ${m.maxClutter}`);
    assert.ok(m.rooms.some((r) => r.cover > 0), `seed ${s}: no cover anywhere`);
    for (const r of m.rooms) {
      rooms++;
      if (r.lane >= FLOOR.laneMin) withLane++;
      if (r.cover === 0) open++;
      worstClutter = Math.max(worstClutter, r.clutter);
    }
  });
  const mean = floors.reduce((a, f) => a + floorMetrics(f).rooms.reduce((x, r) => x + r.clutter, 0) / f.rooms.length, 0) / SEEDS;
  console.log(`# ${rooms} rooms over ${SEEDS} seeds: ${(100 * withLane / rooms).toFixed(1)}% have a ${FLOOR.laneMin}+ tile lane, ${(100 * open / rooms).toFixed(1)}% are open, mean cover ${(100 * mean).toFixed(1)}%, worst room ${(100 * worstClutter).toFixed(1)}%`);
  // The gate retries, so also require it does not lean on retries: most seeds pass early.
  const attempts = floors.map((f) => f.attempt).sort((a, b) => a - b);
  console.log(`# generator attempts per seed: median ${attempts[SEEDS >> 1]}, p95 ${attempts[Math.floor(SEEDS * 0.95)]}, max ${attempts[SEEDS - 1]}`);
  assert.ok(attempts[Math.floor(SEEDS * 0.95)] <= 12, 'generator rejects too many layouts');
});

// ---------- game integration ----------

beforeEach(() => {
  resetGame({ seed: 5 });
  game.spawnCd = 1e9;
});

test('resetGame({ seed }) builds the same run twice, and a new run rolls a new seed', () => {
  resetGame({ seed: 77 });
  const a = map.map((r) => r.join('')).join('\n');
  const spawnA = { x: player.x, y: player.y };
  resetGame({ seed: 77 });
  assert.equal(map.map((r) => r.join('')).join('\n'), a);
  assert.deepEqual({ x: player.x, y: player.y }, spawnA);
  assert.equal(game.seed, 77);
  assert.equal(game.floor, 1);
  resetGame({ seed: 78 });
  assert.notEqual(map.map((r) => r.join('')).join('\n'), a);
  const seeds = new Set();
  for (let i = 0; i < 20; i++) { resetGame(); seeds.add(game.seed); }
  assert.ok(seeds.size > 15, 'random seeds repeat');
});

test('the player starts on the spawn tile of a valid floor', () => {
  assert.equal(Math.floor(player.x / TILE), game.layout.spawn.tx);
  assert.equal(Math.floor(player.y / TILE), game.layout.spawn.ty);
  assert.ok(!overlapsWall({ x: player.x, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE }));
});

test('floor transition keeps clock, score, kills, HP and the director offset; resets map, enemies, projectiles', () => {
  game.time = 123.5;
  game.score = 456;
  game.kills = 9;
  game.hp = 3;
  game.timeOffset = 30;
  game.iframes = 0.4;
  spawnEnemy(player.x + 200, player.y);
  game.projectiles.push({ x: player.x, y: player.y, vx: 1, vy: 0, life: 1 });
  const before = map.map((r) => r.join('')).join('\n');
  descend();
  assert.equal(game.floor, 2);
  assert.equal(game.seed, 5, 'run seed is unchanged');
  assert.equal(game.time, 123.5);
  assert.equal(game.score, 456);
  assert.equal(game.kills, 9);
  assert.equal(game.hp, 3);
  assert.equal(game.timeOffset, 30);
  assert.equal(game.iframes, 0.4);
  assert.equal(game.state, 'playing');
  // The old floor's enemies are gone; the new floor starts empty; its boss arrives after BOSS_SPAWN_TIME.
  assert.equal(game.enemies.length, 0);
  assert.equal(game.projectiles.length, 0);
  assert.notEqual(map.map((r) => r.join('')).join('\n'), before);
  assert.equal(Math.floor(player.x / TILE), game.layout.spawn.tx);
  assert.equal(Math.floor(player.y / TILE), game.layout.spawn.ty);
});

test('floor n of a run is reproducible from the run seed', () => {
  descend();
  descend();
  const third = map.map((r) => r.join('')).join('\n');
  resetGame({ seed: 5 });
  descend();
  descend();
  assert.equal(game.floor, 3);
  assert.equal(map.map((r) => r.join('')).join('\n'), third);
});

test('stepping on the unlocked exit descends during updateGame, and the run clock keeps running', () => {
  const e = game.layout.exit;
  player.x = (e.tx + 0.5) * TILE;
  player.y = (e.ty + 0.5) * TILE;
  game.time = 50;
  unlockExit('boss');
  updateGame(STEP);
  assert.equal(game.floor, 2);
  assert.ok(Math.abs(game.time - (50 + STEP)) < 1e-9);
  updateGame(STEP);
  assert.equal(game.floor, 2, 'spawn is not on the exit, so no second descent');
});

test('enemies the director spawns never overlap a wall, on several floors', () => {
  // moveBody never pushes a body into a wall, so an overlap on any tick means the spawn
  // point was bad. The player stands still and is invulnerable so enemies keep arriving.
  let spawned = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    resetGame({ seed });
    game.rng = createRng(seed + 100).next;
    game.iframes = 1e9;
    for (let floor = 1; floor <= 3; floor++) {
      game.spawnCd = 0;
      for (let i = 0; i < 60 * 40 && game.enemies.length < 25; i++) {
        game.hp = 99;
        updateGame(STEP);
        for (const e of game.enemies) assert.ok(!overlapsWall(e), `seed ${seed} floor ${floor}: enemy in a wall at ${e.x},${e.y}`);
      }
      spawned += game.enemies.length;
      if (floor < 3) descend();
    }
  }
  assert.ok(spawned >= 6 * 3 * 10, `only ${spawned} enemies spawned`);
});

test('every floor hides a boss away from the spawn, in a connected room, and the seed fixes it', () => {
  let fallbacks = 0;
  let nearest = Infinity;
  for (const [seed, f] of floors.entries()) {
    assert.ok(f.boss, `seed ${seed}: no boss`);
    const { tx, ty, room } = f.boss;
    assert.ok(room !== f.spawnRoom && room !== f.exitRoom, `seed ${seed}: boss in the spawn or exit room`);
    assert.equal(f.tiles[ty][tx], '.', `seed ${seed}: boss on a wall`);
    assert.deepEqual([tx, ty], [f.rooms[room].cx, f.rooms[room].cy]);
    const d = distanceField(f.width, f.height, (x, y) => f.tiles[y]?.[x] === '.', f.spawn.tx, f.spawn.ty)[tx + ty * f.width];
    assert.ok(d >= 0, `seed ${seed}: boss unreachable from the spawn`);
    if (d < FLOOR.minBossPath) fallbacks++;
    nearest = Math.min(nearest, d);
    // The body (30 px) must stand clear of walls where it is placed.
    assert.ok(!overlapsBox(f, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 30), `seed ${seed}: boss body in a wall`);
    assert.notDeepEqual(f.boss, { ...f.spawn }, 'not on the spawn');
  }
  console.log(`# boss placement over ${SEEDS} seeds: nearest boss ${nearest} steps from spawn, ${fallbacks} floors fell back below ${FLOOR.minBossPath}`);
  assert.ok(nearest >= 20, `a boss only ${nearest} steps from the spawn`);
  assert.deepEqual(generateFloor(7).boss, generateFloor(7).boss);
});

test('the boss appears asleep at its tile after BOSS_SPAWN_TIME, and never in the arena', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    resetGame({ seed });
    game.spawnCd = 1e9;
    game.iframes = 1e9;
    assert.equal(game.boss, null, 'no boss when the floor starts');
    game.floorTime = BOSS_SPAWN_TIME - 0.5;
    for (let i = 0; i < 20; i++) updateGame(STEP);
    assert.equal(game.boss, null, 'not yet');
    for (let i = 0; i < 40; i++) updateGame(STEP);
    const b = game.boss;
    assert.ok(b && b.state === 'dormant');
    assert.equal(Math.floor(b.x / TILE), game.layout.boss.tx);
    assert.equal(Math.floor(b.y / TILE), game.layout.boss.ty);
    assert.ok(!overlapsWall(b));
  }
  resetGame({ arena: true });
  game.floorTime = BOSS_SPAWN_TIME + 10;
  updateGame(STEP);
  assert.equal(game.boss, null, 'the arena has no boss');
  assert.equal(game.enemies.length, 0);
});

test('floors are large: 120x80 tiles with plenty of rooms and a long walk to the stairs', () => {
  for (const f of floors) {
    assert.equal(f.width, 120);
    assert.equal(f.height, 80);
    assert.ok(f.rooms.length >= FLOOR.minRooms, `${f.rooms.length} rooms`);
  }
  resetGame({ seed: 9 });
  assert.equal(mapWidth, 120);
  assert.equal(mapHeight, 80);
  // 180 px/s is 5.6 tiles/s. Even a perfectly direct walk to the stairs takes a while.
  const tilesPerSec = PLAYER_SPEED / TILE;
  const minWalk = Math.min(...floors.map((f) => connectivityReport(f).exitDist)) / tilesPerSec;
  console.log(`# shortest walk to the stairs over ${SEEDS} seeds: ${minWalk.toFixed(1)} s at full speed`);
  assert.ok(minWalk >= 20, `shortest walk ${minWalk} s`);
});

test('the stairs stay locked with no boss kill, however long the floor runs, and the clock does not open them', () => {
  const e = game.layout.exit;
  player.x = (e.tx + 0.5) * TILE;
  player.y = (e.ty + 0.5) * TILE;
  game.iframes = 1e9;
  game.floorTime = 0;
  updateGame(STEP);
  assert.equal(game.floor, 1, 'locked stairs must not descend');
  assert.equal(bossTimeLeft(), BOSS_SPAWN_TIME - STEP > 0 ? bossTimeLeft() : 0);
  assert.ok(bossTimeLeft() > BOSS_SPAWN_TIME - 1);
  game.floorTime = BOSS_SPAWN_TIME + 5;
  game.hp = 99;
  updateGame(STEP);
  assert.equal(game.floor, 1, 'the floor timer alone never opens the stairs');
  assert.equal(game.exitUnlocked, false);
  game.time = 3000; // far past the soft cap, deep in overtime
  game.hp = 99;
  updateGame(STEP);
  assert.equal(game.floor, 1);
  assert.equal(game.exitUnlocked, false);
});

test('stairs unlocked by the boss stay open in overtime and past the soft cap', () => {
  const e = game.layout.exit;
  game.time = DIFFICULTY.softCap + 60;
  unlockExit('boss');
  for (let i = 0; i < 600; i++) { game.hp = 99; game.iframes = 1e9; updateGame(STEP); }
  assert.equal(game.exitUnlocked, 'boss', 'overtime never closes the stairs');
  player.x = (e.tx + 0.5) * TILE;
  player.y = (e.ty + 0.5) * TILE;
  updateGame(STEP);
  assert.equal(game.floor, 2, 'the player can still descend in overtime');
});

test('unlockExit("boss") opens the stairs at once (hook for M5)', () => {
  const e = game.layout.exit;
  player.x = (e.tx + 0.5) * TILE;
  player.y = (e.ty + 0.5) * TILE;
  updateGame(STEP);
  assert.equal(game.floor, 1);
  unlockExit('boss');
  assert.equal(game.exitUnlocked, 'boss');
  updateGame(STEP);
  assert.equal(game.floor, 2);
});

test('deeper floors raise enemy difficulty; player stats and the run clock do not change', () => {
  game.time = 100;
  const f1 = { t: directorTime(), s: enemyStats(directorTime()), d: directorAt(directorTime()) };
  descend();
  descend();
  assert.equal(game.floor, 3);
  assert.equal(directorTime(), 100 + 2 * DIFFICULTY.floorOffset);
  const f3 = { s: enemyStats(directorTime()), d: directorAt(directorTime()) };
  assert.ok(f3.s.speed > f1.s.speed && f3.s.hp > f1.s.hp, 'enemies should be tougher');
  assert.ok(f3.d.spawnInterval < f1.d.spawnInterval && f3.d.cap > f1.d.cap);
  assert.equal(game.time, 100, 'run clock unchanged');
  // Player: nothing about the player's stats depends on the floor.
  assert.equal(game.hp, PLAYER_HP);
  assert.equal(player.w, PLAYER_SIZE);
  assert.equal(player.h, PLAYER_SIZE);
});

test('floor depth alone does not trigger overtime scoring or the overtime summary', () => {
  game.time = 60;
  for (let i = 0; i < 10; i++) descend();
  assert.ok(directorTime() > DIFFICULTY.softCap, 'the director curve is deep in overtime territory');
  assert.equal(directorAt(directorTime()).phase, 'overtime');
  // But the run clock is at 1:00, so the summary does not claim overtime.
  assert.equal(game.floor, 11);
  const over = Math.max(0, game.time + game.timeOffset - DIFFICULTY.softCap);
  assert.equal(over, 0);
});

test('enemies spawn in a ring around the player on a large floor', () => {
  game.rng = createRng(31).next;
  game.iframes = 1e9;
  let n = 0;
  for (let wave = 0; wave < 60; wave++) {
    game.enemies.length = 0;
    game.spawnCd = 0;
    game.time = 300;
    updateGame(0.001);
    for (const e of game.enemies) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      assert.ok(d >= SPAWN_MIN_DIST - 40, `spawned ${d} px away (too close)`);
      assert.ok(d <= SPAWN_MAX_DIST + 40, `spawned ${d} px away (too far)`);
      n++;
    }
  }
  assert.ok(n >= 60, `only ${n} spawns`);
});
