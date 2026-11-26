// M5: shared flow field, pathing around walls, and its cost. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, STEP, FLOOR_W, FLOOR_H, BOSS_SPAWN_TIME } from '../src/config.js';
import { ENEMIES, BOSS } from '../src/enemies.config.js';
import { generateFloor } from '../src/floorgen.js';
import { createRng } from '../src/rng.js';
import { loadTiles, isFloor, mapWidth, mapHeight } from '../src/map.js';
import { overlapsWall } from '../src/collision.js';
import { lineOfSight } from '../src/flowfield.js';
import { player } from '../src/entities.js';
import {
  game, resetGame, spawnEnemy, updateGame, flow,
} from '../src/game.js';

const SEEDS = 1000;
const TYPES = ['chaser', 'swarmer', 'tank', 'shooter', 'summoner'];
const WALKING_SPEED = 150; // px/s, a mid-run chaser speed; the same for every type in this test

// BFS step counts are enough to bound how long a walk may take: the field distance times a
// tile, over the slowest speed, with slack for crowding and corner rounding.
function timeLimit(distTiles, speed) {
  return (distTiles * TILE * 1.6) / speed + 4;
}

test('every body fits inside one tile with 2 px to spare, the limit for tile-centre steering', () => {
  for (const [type, T] of Object.entries(ENEMIES)) assert.ok(T.size <= TILE - 2, `${type} is ${T.size} px`);
  assert.ok(BOSS.size <= TILE - 2);
});

test('flow field: distance 0 at the goal, +1 per step, -1 on walls, neighbour always closer', () => {
  resetGame({ seed: 3 });
  const f = game.layout;
  flow.rebuild(mapWidth, mapHeight, f.spawn.tx, f.spawn.ty);
  assert.equal(flow.at(f.spawn.tx, f.spawn.ty), 0);
  const out = { tx: 0, ty: 0 };
  let reachable = 0;
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const d = flow.at(x, y);
      if (!isFloor(x, y)) { assert.equal(d, -1); continue; }
      assert.ok(d >= 0, `floor tile ${x},${y} unreachable`);
      reachable++;
      if (d === 0) continue;
      assert.ok(flow.next(x, y, out));
      assert.equal(flow.at(out.tx, out.ty), d - 1, 'each step gets exactly one closer');
      // A diagonal step never cuts a wall corner.
      if (out.tx !== x && out.ty !== y) assert.ok(isFloor(out.tx, y) && isFloor(x, out.ty));
    }
  }
  assert.equal(flow.reached, reachable);
});

test('flow field rebuilds only when the player changes tile (or the map changes)', () => {
  resetGame({ seed: 4 });
  game.spawnCd = 1e9;
  game.iframes = 1e9;
  spawnEnemy(player.x + 100, player.y);
  updateGame(STEP);
  const n = flow.rebuilds;
  for (let i = 0; i < 30; i++) updateGame(STEP); // player stands still
  assert.equal(flow.rebuilds, n, 'no rebuild while the player stays on one tile');
  player.x += TILE;
  updateGame(STEP);
  assert.equal(flow.rebuilds, n + 1);
  // Cost does not depend on enemy count: 1 enemy and 150 enemies trigger the same one rebuild.
  for (let i = 0; i < 150; i++) spawnEnemy(player.x + 60, player.y + 60);
  const m = flow.rebuilds;
  player.x += TILE;
  updateGame(STEP);
  assert.equal(flow.rebuilds, m + 1);
});

test('enemies walk around a wall instead of freezing against it (arena divider)', () => {
  resetGame({ arena: true });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.iframes = 1e9;
  // The wall at x=16 splits the arena; the doors are at y=9 and y=20..22. Put the player and
  // an enemy on opposite sides at y=15, where there is solid wall between them.
  player.x = 20.5 * TILE;
  player.y = 15.5 * TILE;
  const e = spawnEnemy(10.5 * TILE, 15.5 * TILE);
  e.speed = WALKING_SPEED;
  assert.ok(!lineOfSight(e.x, e.y, player.x, player.y), 'a wall blocks the straight line');
  let reached = -1;
  for (let i = 0; i < 60 * 12; i++) {
    game.hp = 99;
    updateGame(STEP);
    if (Math.hypot(e.x - player.x, e.y - player.y) < 20) { reached = i * STEP; break; }
  }
  assert.ok(reached > 0, 'the enemy got to the player around the wall');
});

test('the player cannot hide behind cover or in a far room: enemies still arrive', () => {
  // Same check as the 1,000-seed test below, on one floor with the player in the middle of the
  // farthest room from the enemies. A straight-line chaser would stop at the first wall.
  resetGame({ seed: 11 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  const f = game.layout;
  const far = f.rooms[f.exitRoom];
  player.x = (far.cx + 0.5) * TILE;
  player.y = (far.cy + 0.5) * TILE;
  const [sx, sy] = f.enemySpawns[0];
  const e = spawnEnemy((sx + 0.5) * TILE, (sy + 0.5) * TILE);
  e.speed = WALKING_SPEED;
  let t = 0;
  while (t < 90 && Math.hypot(e.x - player.x, e.y - player.y) > 24) { game.hp = 99; updateGame(STEP); t += STEP; }
  assert.ok(Math.hypot(e.x - player.x, e.y - player.y) <= 24, `enemy still ${Math.hypot(e.x - player.x, e.y - player.y)} px away after ${t}s`);
});

test(`${SEEDS} seeds: enemies at spawn points all reach a stationary player, none stuck for 1 s`, () => {
  const floors = [];
  let samples = 0;
  const perType = Object.fromEntries(TYPES.map((t) => [t, 0]));
  const t0 = performance.now();
  for (let seed = 0; seed < SEEDS; seed++) {
    resetGame({ seed });
    const f = game.layout;
    game.spawnCd = 1e9;
    game.fireCd = 1e9; // the player must not kill the test subjects
    game.iframes = 1e9;
    const rng = createRng(seed ^ 0x9e3779b9);
    // Stationary player at the floor's spawn or at a random room centre.
    const room = seed % 2 ? f.rooms[rng.int(f.rooms.length)] : null;
    const pt = room ? { tx: room.cx, ty: room.cy } : f.spawn;
    player.x = (pt.tx + 0.5) * TILE;
    player.y = (pt.ty + 0.5) * TILE;
    // Four enemies from random spawn points, plus the spawn point farthest by walking.
    flow.rebuild(mapWidth, mapHeight, pt.tx, pt.ty);
    let farthest = f.enemySpawns[0];
    for (const p of f.enemySpawns) if (flow.at(p[0], p[1]) > flow.at(farthest[0], farthest[1])) farthest = p;
    const picks = [farthest, ...Array.from({ length: 3 }, () => rng.pick(f.enemySpawns))];
    const subjects = picks.map((p, i) => {
      const type = TYPES[(seed + i) % TYPES.length];
      const e = spawnEnemy((p[0] + 0.5) * TILE, (p[1] + 0.5) * TILE, type);
      e.speed = WALKING_SPEED;
      if (e.type === 'shooter' || e.type === 'summoner') e.cd = 1e9; // test pathing, not attacks
      if (e.type === 'tank') e.cd = 1e9;
      return {
        e, type, startDist: flow.at(p[0], p[1]), done: false, since: 0, anchor: { x: e.x, y: e.y }, at: 0,
      };
    });
    const limit = Math.max(...subjects.map((s) => timeLimit(s.startDist, WALKING_SPEED)));
    let t = 0;
    while (t < limit && subjects.some((s) => !s.done)) {
      game.hp = 99;
      updateGame(STEP * 2); // 30 Hz keeps 1,000 floors quick; collision sub-steps, so it stays safe
      t += STEP * 2;
      for (const s of subjects) {
        if (s.done) continue;
        const d = Math.hypot(s.e.x - player.x, s.e.y - player.y);
        const near = s.type === 'shooter' || s.type === 'summoner' ? d <= ENEMIES[s.type].keepMax + 10 && lineOfSight(s.e.x, s.e.y, player.x, player.y) : d <= 30;
        if (near) { s.done = true; s.at = t; continue; }
        if (!floors.includes(seed) && overlapsWall(s.e)) assert.fail(`seed ${seed}: ${s.type} inside a wall at ${s.e.x},${s.e.y}`);
        // Stuck: less than 6 px of net travel in any 1 s window while still on its way.
        if (t - s.since >= 1) {
          const moved = Math.hypot(s.e.x - s.anchor.x, s.e.y - s.anchor.y);
          assert.ok(moved >= 6, `seed ${seed}: ${s.type} stuck for 1 s at ${(s.e.x / TILE).toFixed(1)},${(s.e.y / TILE).toFixed(1)} (${s.e.state}), field distance ${flow.at(Math.floor(s.e.x / TILE), Math.floor(s.e.y / TILE))}`);
          s.since = t;
          s.anchor = { x: s.e.x, y: s.e.y };
        }
      }
    }
    for (const s of subjects) {
      samples++;
      perType[s.type]++;
      assert.ok(s.done, `seed ${seed}: ${s.type} did not reach the player within ${limit.toFixed(1)} s (field distance ${s.startDist}, now at ${(s.e.x / TILE).toFixed(1)},${(s.e.y / TILE).toFixed(1)})`);
    }
  }
  console.log(`# pathing: ${samples} enemies over ${SEEDS} floors reached the player, per type ${JSON.stringify(perType)}, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
});

test(`${SEEDS} seeds: the 30 px boss walks from its hiding room to a stationary player, never stuck`, () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    resetGame({ seed });
    game.spawnCd = 1e9;
    game.fireCd = 1e9;
    game.iframes = 1e9;
    const f = game.layout;
    game.floorTime = BOSS_SPAWN_TIME;
    updateGame(STEP / 1000); // the boss appears
    const b = game.boss;
    b.state = 'walk';
    b.stateT = 1e9; // never attack: this measures walking only
    player.x = (f.spawn.tx + 0.5) * TILE;
    player.y = (f.spawn.ty + 0.5) * TILE;
    flow.rebuild(mapWidth, mapHeight, f.spawn.tx, f.spawn.ty);
    const start = flow.at(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
    assert.ok(start > 0, `seed ${seed}: boss tile is not connected to the spawn`);
    const limit = timeLimit(start, BOSS.speed);
    let t = 0;
    let since = 0;
    let anchor = { x: b.x, y: b.y };
    while (t < limit && Math.hypot(b.x - player.x, b.y - player.y) > 40) {
      game.hp = 99;
      updateGame(STEP * 2);
      t += STEP * 2;
      assert.ok(!overlapsWall(b), `seed ${seed}: boss inside a wall`);
      if (t - since >= 1) {
        assert.ok(Math.hypot(b.x - anchor.x, b.y - anchor.y) >= 20, `seed ${seed}: boss stuck at ${(b.x / TILE).toFixed(1)},${(b.y / TILE).toFixed(1)}`);
        since = t;
        anchor = { x: b.x, y: b.y };
      }
    }
    assert.ok(Math.hypot(b.x - player.x, b.y - player.y) <= 40, `seed ${seed}: boss did not arrive in ${limit.toFixed(0)} s`);
  }
});

test('pathing cost: 160 enemies on a 120x80 floor with a moving player stay far under 16.6 ms', () => {
  resetGame({ seed: 21 });
  assert.equal(mapWidth, FLOOR_W);
  assert.equal(mapHeight, FLOOR_H);
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.iframes = 1e9;
  const f = game.layout;
  const rng = createRng(77);
  for (let i = 0; i < 160; i++) {
    const p = rng.pick(f.enemySpawns);
    spawnEnemy((p[0] + 0.5) * TILE, (p[1] + 0.5) * TILE, TYPES[i % TYPES.length]);
  }
  // Isolated cost of one BFS over the whole floor.
  const b0 = performance.now();
  const REPS = 200;
  for (let i = 0; i < REPS; i++) flow.rebuild(mapWidth, mapHeight, f.spawn.tx + (i % 2), f.spawn.ty);
  const bfs = (performance.now() - b0) / REPS;
  // Worst case: the player crosses a tile every few ticks (full speed is about one tile per
  // 11 ticks; here a tile every 4 ticks is a stress case), so the field keeps rebuilding.
  const times = [];
  const r0 = flow.rebuilds;
  for (let i = 0; i < 1200; i++) {
    if (i % 4 === 0) player.x += (Math.floor(i / 4) % 40 < 20 ? 1 : -1) * TILE;
    game.hp = 99;
    const s = performance.now();
    updateGame(STEP);
    times.push(performance.now() - s);
    if (game.enemies.length < 160) assert.fail('enemy count changed');
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)];
  console.log(`# 160 enemies, 120x80 floor: one BFS ${bfs.toFixed(3)} ms; update avg ${avg.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, ${flow.rebuilds - r0} rebuilds in 1200 ticks`);
  assert.ok(bfs < 1, `BFS took ${bfs} ms`);
  assert.ok(p99 < 4, `p99 update ${p99} ms`);
});

test('pathing cost does not grow with enemy count (rebuilds are per tile change, not per enemy)', () => {
  resetGame({ seed: 22 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.iframes = 1e9;
  const f = game.layout;
  const rng = createRng(5);
  const run = (n) => {
    game.enemies.length = 0;
    for (let i = 0; i < n; i++) { const p = rng.pick(f.enemySpawns); spawnEnemy((p[0] + 0.5) * TILE, (p[1] + 0.5) * TILE); }
    const r0 = flow.rebuilds;
    for (let i = 0; i < 300; i++) {
      if (i % 10 === 0) player.x += (Math.floor(i / 10) % 6 < 3 ? 1 : -1) * TILE;
      game.hp = 99;
      updateGame(STEP);
    }
    return flow.rebuilds - r0;
  };
  assert.equal(run(1), run(160));
});
