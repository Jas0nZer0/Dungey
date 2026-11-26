// M4: procedural floors. Run: node --test tests/
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, STEP, MAP_W, MAP_H, ENEMY_SIZE, PLAYER_SIZE } from '../src/config.js';
import { FLOOR } from '../src/floorgen.config.js';
import { createRng, mixSeed, floorSeed, parseSeed } from '../src/rng.js';
import {
  generateFloor, connectivityReport, floorMetrics, snagReport, distanceField,
} from '../src/floorgen.js';
import { loadTiles, isFloor, map } from '../src/map.js';
import { overlapsWall } from '../src/collision.js';
import { player } from '../src/entities.js';
import {
  game, resetGame, updateGame, descend, spawnEnemy,
} from '../src/game.js';

const SEEDS = 1000;

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
    assert.equal(f.tiles.length, MAP_H);
    for (const row of f.tiles) assert.equal(row.length, MAP_W);
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
    const dist = distanceField(MAP_W, MAP_H, isFloor, f.spawn.tx, f.spawn.ty);
    for (const r of f.rooms) assert.ok(dist[r.cx + r.cy * MAP_W] >= 0, `seed ${s}: room at ${r.x},${r.y} unreachable`);
    assert.ok(dist[f.exit.tx + f.exit.ty * MAP_W] >= 0, `seed ${s}: exit unreachable`);
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
    const dist = distanceField(MAP_W, MAP_H, isFloor, f.spawn.tx, f.spawn.ty);
    for (const [tx, ty] of f.enemySpawns) {
      enemyPoints++;
      assert.ok(isFloor(tx, ty), `seed ${s}: enemy spawn ${tx},${ty} is a wall`);
      assert.ok(!overlapsWall(body(tx, ty, ENEMY_SIZE)), `seed ${s}: enemy body at ${tx},${ty} overlaps a wall`);
      assert.ok(dist[tx + ty * MAP_W] >= 0, `seed ${s}: enemy spawn ${tx},${ty} unreachable`);
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

test('stepping on the exit tile descends during updateGame, and the run clock keeps running', () => {
  const e = game.layout.exit;
  player.x = (e.tx + 0.5) * TILE;
  player.y = (e.ty + 0.5) * TILE;
  game.time = 50;
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
