// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, STEP, PLAYER_SPEED, PLAYER_SIZE } from '../src/config.js';
import { mapWidth, mapHeight, isFloor } from '../src/map.js';
import { moveBody, overlapsWall } from '../src/collision.js';
import { stepPlayer } from '../src/entities.js';

const body = (x, y) => ({ x, y, w: PLAYER_SIZE, h: PLAYER_SIZE, vx: 0, vy: 0 });
const sim = (b, dirX, dirY, ticks) => {
  for (let i = 0; i < ticks; i++) {
    stepPlayer(b, dirX, dirY, STEP);
    assert.ok(!overlapsWall(b), `inside wall at ${b.x},${b.y}`);
  }
};

test('map is 48x32 and closed by a wall border', () => {
  assert.equal(mapWidth, 48);
  assert.equal(mapHeight, 32);
  for (let x = 0; x < mapWidth; x++) assert.ok(!isFloor(x, 0) && !isFloor(x, mapHeight - 1));
  for (let y = 0; y < mapHeight; y++) assert.ok(!isFloor(0, y) && !isFloor(mapWidth - 1, y));
});

test('spawn tile is floor and clear', () => {
  assert.ok(!overlapsWall(body(2.5 * TILE, 2.5 * TILE)));
});

test('slides along a wall at full component speed, no stall at tile seams', () => {
  // Top border wall: press up-right into it from the start room. Should slide right.
  const b = body(2.5 * TILE, 1.5 * TILE);
  sim(b, 0, -1, 30); // settle against the top wall
  assert.equal(b.y, TILE + PLAYER_SIZE / 2);
  const startX = b.x;
  const ticks = 60;
  sim(b, 1, -1, ticks);
  const travelled = b.x - startX;
  const expected = (PLAYER_SPEED / Math.SQRT2) * ticks * STEP;
  // Accel ramp costs a few px; any snag at a seam would lose a lot more.
  assert.ok(travelled > expected * 0.9, `travelled ${travelled}, expected ~${expected}`);
  assert.equal(b.y, TILE + PLAYER_SIZE / 2, 'stays flush against the wall');
});

test('driving into a corner from every diagonal never enters a wall', () => {
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const b = body(8 * TILE + 16, 12 * TILE + 16); // open area of left room
    sim(b, dx, dy, 400); // run into a corner
    sim(b, dx, 0, 20);
    sim(b, 0, dy, 20);
  }
});

test('round a 1-tile gap: walks through the 1-tile door at (16,9)', () => {
  const b = body(14.5 * TILE, 9.5 * TILE);
  sim(b, 1, 0, 120);
  assert.ok(b.x > 18 * TILE, `did not pass the gap, x=${b.x}`);
});

test('diagonal into an outside corner slides past instead of snagging', () => {
  // Pillar at tiles (4..5, 4..5). Approach its corner diagonally from the top-left.
  const b = body(3 * TILE, 3 * TILE);
  sim(b, 1, 1, 90);
  assert.ok(!overlapsWall(b));
  // Must have made progress past the pillar, not stuck on its corner.
  assert.ok(b.x > 6 * TILE || b.y > 6 * TILE, `stuck at ${b.x},${b.y}`);
});

test('cannot tunnel through walls at any speed', () => {
  for (const speed of [100, 1000, 10000, 100000]) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [dx, dy] of dirs) {
      const b = body(8 * TILE + 16, 12 * TILE + 16);
      for (let i = 0; i < 20; i++) {
        moveBody(b, dx * speed * STEP, dy * speed * STEP);
        assert.ok(!overlapsWall(b), `inside wall speed=${speed} dir=${dx},${dy}`);
        assert.ok(isFloor(Math.floor(b.x / TILE), Math.floor(b.y / TILE)), 'centre left the map');
      }
    }
  }
});

test('random fuzz: body never ends inside a wall or outside the map', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const b = body(2.5 * TILE, 2.5 * TILE);
  for (let i = 0; i < 20000; i++) {
    const mag = rnd() < 0.05 ? rnd() * 5000 : rnd() * 40;
    const a = rnd() * Math.PI * 2;
    moveBody(b, Math.cos(a) * mag, Math.sin(a) * mag);
    assert.ok(!overlapsWall(b), `iteration ${i} at ${b.x},${b.y}`);
  }
});
