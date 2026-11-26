// M5: the stairs arrow. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, STEP, VIEW_W, VIEW_H, BOSS_SPAWN_TIME } from '../src/config.js';
import { stairsArrow, ARROW } from '../src/arrow.js';
import { createRng } from '../src/rng.js';
import { player } from '../src/entities.js';
import { camera } from '../src/camera.js';
import { game, resetGame, updateGame, unlockExit, descend } from '../src/game.js';

const view = { w: VIEW_W, h: VIEW_H };

test('no arrow while the stairs are locked, or when the floor has no stairs', () => {
  const exit = { tx: 50, ty: 40 };
  assert.equal(stairsArrow(100, 100, exit, { x: 0, y: 0 }, false), null);
  assert.equal(stairsArrow(100, 100, exit, { x: 0, y: 0 }, 0), null);
  assert.equal(stairsArrow(100, 100, null, { x: 0, y: 0 }, 'boss'), null);
  assert.notEqual(stairsArrow(100, 100, exit, { x: 0, y: 0 }, 'boss'), null);
  assert.notEqual(stairsArrow(100, 100, exit, { x: 0, y: 0 }, 'boss'), null);
});

test('the arrow points straight at the stairs, as the crow flies (walls play no part)', () => {
  const rng = createRng(12);
  for (let i = 0; i < 5000; i++) {
    const px = rng.range(40, 3800);
    const py = rng.range(40, 2500);
    const exit = { tx: rng.int(120), ty: rng.int(80) };
    const cam = { x: Math.max(0, Math.min(3840 - VIEW_W, px - VIEW_W / 2)), y: Math.max(0, Math.min(2560 - VIEW_H, py - VIEW_H / 2)) };
    const a = stairsArrow(px, py, exit, cam, 'boss');
    const want = Math.atan2((exit.ty + 0.5) * TILE - py, (exit.tx + 0.5) * TILE - px);
    assert.ok(Math.abs(Math.atan2(Math.sin(a.angle - want), Math.cos(a.angle - want))) < 1e-9);
    assert.ok(Math.abs(a.dist - Math.hypot((exit.tx + 0.5) * TILE - px, (exit.ty + 0.5) * TILE - py)) < 1e-9);
  }
});

test('the arrow always stays on screen, wherever the player stands and wherever the stairs are', () => {
  const rng = createRng(99);
  for (let i = 0; i < 5000; i++) {
    const px = rng.range(40, 3800);
    const py = rng.range(40, 2500);
    // Any camera the game can produce, including the clamped edges, puts the player on screen.
    const cam = { x: Math.max(0, Math.min(3840 - VIEW_W, px - VIEW_W / 2 + rng.range(-300, 300))), y: Math.max(0, Math.min(2560 - VIEW_H, py - VIEW_H / 2 + rng.range(-200, 200))) };
    const a = stairsArrow(px, py, { tx: rng.int(120), ty: rng.int(80) }, cam, 'boss');
    assert.ok(a.x >= ARROW.margin && a.x <= VIEW_W - ARROW.margin, `x ${a.x}`);
    assert.ok(a.y >= ARROW.margin && a.y <= VIEW_H - ARROW.margin, `y ${a.y}`);
  }
  // A player jammed against the top-left corner of the screen with the stairs up and left.
  const a = stairsArrow(10, 10, { tx: 0, ty: 0 }, { x: 0, y: 0 }, 'boss');
  assert.ok(a.x >= ARROW.margin && a.y >= ARROW.margin);
});

test('the arrow sits next to the player, and moves in close when the stairs are near', () => {
  const cam = { x: 1000, y: 1000 };
  const far = stairsArrow(1480, 1270, { tx: 100, ty: 60 }, cam, 'boss');
  assert.ok(Math.abs(Math.hypot(far.x - (1480 - cam.x), far.y - (1270 - cam.y)) - ARROW.ring) < 1e-6);
  const near = stairsArrow(1480, 1270, { tx: 46, ty: 40 }, cam, 'boss'); // stairs about 1.3 tiles away
  assert.ok(Math.hypot(near.x - (1480 - cam.x), near.y - (1270 - cam.y)) < ARROW.ring);
});

test('in a run: hidden until the boss dies (not at its spawn), hidden again on the next floor', () => {
  resetGame({ seed: 31 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.iframes = 1e9;
  const arrow = () => stairsArrow(player.x, player.y, game.layout.exit, camera, game.exitUnlocked);
  assert.equal(arrow(), null);
  updateGame(STEP);
  assert.equal(arrow(), null, 'locked');
  game.floorTime = BOSS_SPAWN_TIME;
  updateGame(STEP);
  assert.ok(game.boss);
  assert.equal(arrow(), null, 'the boss spawning does not show the arrow');
  game.boss.hp = 0;
  updateGame(STEP);
  const a = arrow();
  assert.ok(a, 'the boss dying turns it on');
  // Through walls: the bearing ignores the map, so it matches the raw line to the exit tile.
  const e = game.layout.exit;
  assert.ok(Math.abs(a.angle - Math.atan2((e.ty + 0.5) * TILE - player.y, (e.tx + 0.5) * TILE - player.x)) < 1e-9);
  descend();
  assert.equal(arrow(), null, 'a new floor locks the stairs again, so the arrow goes away');
  // Arena has no stairs, so no arrow.
  resetGame({ arena: true });
  unlockExit('boss');
  assert.equal(stairsArrow(player.x, player.y, game.layout.exit, camera, game.exitUnlocked), null);
  assert.ok(view.w > 0);
});
