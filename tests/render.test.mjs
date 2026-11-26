// M5: render smoke test against a recording fake canvas. It cannot judge looks (that is a human
// check) but it catches runtime errors in every draw path and proves the arrow glow is only drawn
// after the unlock. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// A canvas context that records the calls and property writes the renderer makes.
const log = { calls: {}, sets: {} };
const ctx = new Proxy({}, {
  get(_t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    return (...a) => { log.calls[k] = (log.calls[k] ?? 0) + 1; return a[0]; };
  },
  set(_t, k, v) { log.sets[k] = (log.sets[k] ?? 0) + 1; return true; },
});
globalThis.document = { getElementById: () => ({ getContext: () => ctx, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) }) };
globalThis.window = { addEventListener() {}, innerWidth: 960, innerHeight: 540 };

const { render } = await import('../src/render.js');
const { game, resetGame, spawnEnemy, spawnBoss, unlockExit, updateGame } = await import('../src/game.js');
const { player } = await import('../src/entities.js');
const { TILE, STEP } = await import('../src/config.js');

const frame = () => { log.calls = {}; log.sets = {}; render(false); };

test('every enemy type, tell and the boss bar draw without error', () => {
  resetGame({ seed: 41 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.iframes = 1e9;
  for (const type of ['chaser', 'shooter', 'swarmer', 'tank', 'summoner']) spawnEnemy(player.x + 60, player.y + 20, type);
  const boss = game.boss;
  boss.x = player.x + 120;
  boss.y = player.y;
  for (const tell of ['slam', 'fan', 'charge', 'shot', 'summon', 'enrage', 'wake']) {
    for (const e of [...game.enemies]) { e.tell = tell; e.tellMax = 1; e.stateT = 0.4; e.aim = 0.3; }
    frame();
    assert.ok(log.calls.fill > 0, `${tell}: something was filled`);
  }
  for (const e of game.enemies) { e.tell = null; }
  boss.state = 'walk';
  boss.phase = 2;
  game.enemyProjectiles.push({ x: player.x + 50, y: player.y, vx: 0, vy: 0, life: 1, damage: 1, r: 4 });
  game.effects.push({ kind: 'slam', x: boss.x, y: boss.y, r: 100, t: 0.2, max: 0.3 }, { kind: 'bossdeath', x: boss.x, y: boss.y, r: 90, t: 0.3, max: 0.6 });
  frame();
  boss.invuln = true;
  frame();
});

test('the stairs arrow glow is drawn only once the stairs are unlocked', () => {
  resetGame({ seed: 42 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.boss.x = 40 * TILE; // out of the way; the boss draws no glow either way
  frame();
  assert.ok(!(log.sets.shadowBlur > 0), 'no glow while locked');
  unlockExit('boss');
  frame();
  assert.ok(log.sets.shadowBlur > 0, 'glow once unlocked');
});

test('the HUD and death screen still draw with a boss on the floor', () => {
  resetGame({ seed: 43 });
  game.spawnCd = 1e9;
  updateGame(STEP);
  frame();
  game.state = 'dead';
  frame();
});
