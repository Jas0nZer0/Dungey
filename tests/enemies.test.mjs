// M5: enemy roster and boss. Run: node --test tests/
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, STEP, PLAYER_SPEED, PLAYER_HP, FLOOR_UNLOCK_TIME, BULLET_DAMAGE } from '../src/config.js';
import { DIFFICULTY } from '../src/difficulty.config.js';
import { directorAt } from '../src/director.js';
import {
  ENEMIES, BOSS, SPAWN_TABLE, MAX_WALK_SPEED,
} from '../src/enemies.config.js';
import { createRng } from '../src/rng.js';
import { loadTiles } from '../src/map.js';
import { player } from '../src/entities.js';
import {
  game, resetGame, spawnEnemy, spawnBoss, updateGame, enemyStats, descend,
} from '../src/game.js';

const TYPES = ['chaser', 'shooter', 'swarmer', 'tank', 'summoner'];

// A walled 48x32 box with no cover, so tests control every sight line.
function openArena() {
  resetGame({ arena: true });
  const rows = Array.from({ length: 32 }, (_, y) => Array.from({ length: 48 }, (_, x) => (x === 0 || y === 0 || x === 47 || y === 31 ? '#' : '.')).join(''));
  loadTiles(rows);
  game.mapVersion++;
  game.spawnCd = 1e9;
  game.fireCd = 1e9; // the standard weapon stays quiet unless a test fires by hand
  game.rng = createRng(1).next;
  player.x = 30.5 * TILE;
  player.y = 15.5 * TILE;
  player.vx = 0;
  player.vy = 0;
}

const run = (ticks, each) => { for (let i = 0; i < ticks; i++) { updateGame(STEP); if (each) each(i); } };
const secs = (s) => Math.round(s / STEP);
const shoot = (e) => game.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1 }); // a bullet resting on e

beforeEach(openArena);

// ---------- roster stats ----------

test('every type reads base HP and speed from the director and scales them by its multiplier', () => {
  for (const t of [0, 90, 300, 600, 900]) {
    game.time = t;
    const d = directorAt(t);
    for (const type of TYPES) {
      const e = spawnEnemy(5 * TILE, 5 * TILE, type);
      const T = ENEMIES[type];
      assert.equal(e.maxHp, Math.max(1, Math.round(d.hp * T.hpMul)), `${type} hp at ${t}s`);
      assert.ok(Math.abs(e.speed - Math.min(d.speed * T.speedMul, MAX_WALK_SPEED)) < 1e-9, `${type} speed at ${t}s`);
      assert.ok(e.speed <= MAX_WALK_SPEED && e.speed < PLAYER_SPEED, 'the player can always out-walk a walker');
    }
    game.enemies.length = 0;
  }
  // The chaser keeps the exact numbers the M2 and M3 tests expect.
  game.time = 300;
  const c = spawnEnemy(5 * TILE, 5 * TILE);
  assert.deepEqual([c.speed, c.maxHp], [enemyStats(300).speed, enemyStats(300).hp]);
});

test('the spawner introduces types by director time and spawns packs', () => {
  const seen = (time) => {
    resetGame({ seed: 8 });
    game.rng = createRng(3).next;
    game.time = time;
    game.iframes = 1e9;
    const types = new Set();
    let packs = 0;
    for (let i = 0; i < 400; i++) {
      game.enemies.length = 0;
      game.spawnCd = 0;
      game.hp = 99;
      updateGame(STEP);
      const regular = game.enemies.filter((e) => e.type !== 'boss');
      for (const e of regular) types.add(e.type);
      if (regular.filter((e) => e.type === 'swarmer').length >= 2) packs++;
    }
    return { types, packs };
  };
  assert.deepEqual([...seen(0).types], ['chaser'], 'early floor 1 only has chasers');
  const late = seen(400);
  for (const type of TYPES) assert.ok(late.types.has(type), `${type} appears by 400 s`);
  assert.ok(late.packs > 10, 'swarmers arrive in packs');
  for (const row of SPAWN_TABLE) assert.ok(ENEMIES[row.type], `${row.type} is a real type`);
});

// ---------- each type behaves, attacks and dies differently ----------

test('shooter: keeps its distance, telegraphs, then fires a bolt you can dodge', () => {
  const T = ENEMIES.shooter;
  const e = spawnEnemy(player.x - 400, player.y, 'shooter');
  e.cd = 0;
  let closest = 1e9;
  let tellTicks = 0;
  let firstShot = false;
  let hurtBeforeFirstBolt = false;
  const hp0 = game.hp;
  run(secs(6), () => {
    closest = Math.min(closest, Math.hypot(e.x - player.x, e.y - player.y));
    if (!firstShot && e.tell === 'shot') tellTicks++;
    if (game.enemyProjectiles.length) firstShot = true;
    if (!firstShot && game.hp < hp0) hurtBeforeFirstBolt = true;
  });
  assert.ok(closest >= T.keepMin - 12, `shooter closed to ${closest} px; it should stay beyond ${T.keepMin}`);
  assert.ok(firstShot, 'it fired');
  assert.ok(tellTicks >= T.windup / STEP - 3, `tell lasted ${tellTicks} ticks`);
  assert.ok(!hurtBeforeFirstBolt, 'no damage during the tell');
  assert.ok(game.hp < hp0, 'a player who stands still gets hit');

  // Dodge: step sideways the moment the bolt leaves. The bolt flies where the player was.
  openArena();
  const s = spawnEnemy(player.x - 200, player.y, 'shooter');
  s.cd = 0;
  let dodged = false;
  const hp1 = game.hp;
  run(secs(1.2), () => {
    if (!dodged && game.enemyProjectiles.length) { player.y += 70; dodged = true; }
  });
  assert.ok(dodged, 'the shooter fired');
  assert.equal(game.hp, hp1, 'sidestepping the bolt avoids it');
});

test('shooter bolts stop at walls and never sit inside one', () => {
  const e = spawnEnemy(player.x - 200, player.y, 'shooter');
  e.cd = 0;
  player.x = 1.7 * TILE; // hug the left wall, shooter fires from the right toward it
  e.x = 8 * TILE;
  e.y = player.y;
  for (let i = 0; i < secs(4); i++) {
    game.hp = 99;
    updateGame(STEP);
    for (const b of game.enemyProjectiles) {
      const tx = Math.floor(b.x / TILE);
      const ty = Math.floor(b.y / TILE);
      assert.ok(tx > 0 && tx < 47 && ty > 0 && ty < 31, `bolt in a wall at ${b.x},${b.y}`);
    }
  }
  assert.ok(game.enemyProjectiles.length < 4);
});

test('swarmer: weak, small, quick, and weaves instead of walking straight', () => {
  const sw = spawnEnemy(player.x - 600, player.y, 'swarmer');
  const ch = spawnEnemy(player.x - 600, player.y - 400, 'chaser');
  assert.equal(sw.maxHp, 1, 'one hit kills a swarmer at the start of a run');
  assert.ok(sw.w < ch.w && sw.speed > ch.speed);
  game.enemies.length = 0;
  // Heading spread over two seconds of an open-floor approach, one enemy at a time.
  const spreadOf = (type) => {
    openArena();
    const e = spawnEnemy(player.x - 600, player.y, type);
    const h = [];
    run(secs(2), () => h.push(Math.atan2(e.vy, e.vx)));
    return Math.max(...h) - Math.min(...h);
  };
  const swarmer = spreadOf('swarmer');
  const chaser = spreadOf('chaser');
  assert.ok(chaser < 0.01, `a chaser walks a straight line (spread ${chaser})`);
  assert.ok(swarmer > 0.2, `a swarmer weaves (spread ${swarmer})`);
});

test('tank: tough, heavy, barely knocked back, and charges after a telegraph you can sidestep', () => {
  const T = ENEMIES.tank;
  const tank = spawnEnemy(player.x - 160, player.y, 'tank');
  const ch = spawnEnemy(player.x - 160, player.y - 200, 'chaser');
  assert.ok(tank.maxHp >= ch.maxHp * 3, 'a tank soaks several times a chaser');
  assert.ok(tank.speed < ch.speed && tank.contact > ch.contact && tank.w > ch.w);
  // Knockback: one bullet each, from the left. The chaser is shoved, the tank hardly moves.
  tank.cd = 1e9;
  tank.speed = 0;
  ch.speed = 0;
  const t0 = tank.x;
  const c0 = ch.x;
  game.projectiles.push({ x: tank.x - 12, y: tank.y, vx: 300, vy: 0, life: 1 }, { x: ch.x - 10, y: ch.y, vx: 300, vy: 0, life: 1 });
  run(2);
  assert.ok(ch.x - c0 > 0 && tank.x - t0 < (ch.x - c0) / 3, `tank moved ${tank.x - t0}, chaser ${ch.x - c0}`);

  // Charge telegraph and dodge.
  openArena();
  const t1 = spawnEnemy(player.x - 160, player.y, 'tank');
  t1.cd = 0;
  game.hp = 99;
  const x0 = t1.x;
  let windupTicks = 0;
  let movedInWindup = 0;
  let dodged = false;
  let chargeSpeed = 0;
  run(secs(1.6), () => {
    if (t1.state === 'windup') {
      windupTicks++;
      movedInWindup = Math.max(movedInWindup, Math.abs(t1.x - x0));
      if (t1.stateT < 0.15 && !dodged) { player.y += 100; dodged = true; }
    }
    if (t1.state === 'charge') chargeSpeed = Math.max(chargeSpeed, Math.hypot(t1.vx, t1.vy));
  });
  assert.ok(windupTicks >= T.windup / STEP - 3, `tank telegraphed for ${windupTicks} ticks`);
  assert.ok(movedInWindup < 1, 'the tank stands still while it winds up');
  assert.ok(chargeSpeed > PLAYER_SPEED, `charge ${chargeSpeed} px/s outruns the player, which is why it is telegraphed`);
  assert.equal(game.hp, 99, 'a sidestep beats the charge');

  // A player who stays put takes the heavy hit: contact damage 2, not 1.
  openArena();
  const t2 = spawnEnemy(player.x - 160, player.y, 'tank');
  t2.cd = 0;
  game.hp = 99;
  for (let i = 0; i < secs(2) && game.hp === 99; i++) updateGame(STEP);
  assert.equal(game.hp, 99 - T.contact);
});

test('summoner: stays back, telegraphs, then calls swarmers that it owns; killing minions frees its cap', () => {
  const T = ENEMIES.summoner;
  const s = spawnEnemy(player.x - 400, player.y, 'summoner');
  s.cd = 0;
  let tellTicks = 0;
  let spawnedDuringTell = false;
  run(secs(0.4), () => { if (s.tell) tellTicks++; });
  game.enemies.length = 0;
  game.enemies.push(s);
  s.minions = 0;
  s.state = 'move';
  s.cd = 0;
  tellTicks = 0;
  run(secs(3), () => {
    if (s.tell === 'summon') { tellTicks++; if (game.enemies.length > 1) spawnedDuringTell = true; }
  });
  const minions = game.enemies.filter((e) => e.owner === s);
  assert.ok(tellTicks >= T.windup / STEP - 3);
  assert.ok(!spawnedDuringTell, 'minions only appear when the tell ends');
  assert.equal(minions.length, T.count);
  assert.ok(minions.every((m) => m.type === T.minion));
  assert.equal(s.minions, T.count);
  // It stays outside melee range while it works.
  assert.ok(Math.hypot(s.x - player.x, s.y - player.y) >= T.keepMin - 15);
  // Never more than maxMinions alive at once.
  game.hp = 99;
  game.iframes = 1e9;
  run(secs(40));
  assert.ok(game.enemies.filter((e) => e.owner === s).length <= T.maxMinions);
  // Killing a minion frees a slot.
  const before = s.minions;
  const m = game.enemies.find((e) => e.owner === s);
  m.hp = 0;
  run(1);
  assert.equal(s.minions, before - 1);
});

test('each type has a different movement, attack and kill profile (measured)', () => {
  // A measured signature per type: speed class, size, HP class, knockback, whether it attacks
  // from range, whether it telegraphs, and what the telegraph does. The tests above show each
  // number in play; this one pins that no two types share a profile.
  const d = directorAt(0);
  const sig = TYPES.map((type) => {
    const T = ENEMIES[type];
    const e = spawnEnemy(5 * TILE, 5 * TILE, type);
    game.enemies.length = 0;
    return JSON.stringify({
      hpClass: Math.round(e.maxHp / d.hp * 10) / 10,
      speedClass: Math.round(e.speed / d.speed * 10) / 10,
      size: T.size,
      contact: T.contact,
      knock: T.knock,
      ranged: 'boltSpeed' in T,
      charges: 'chargeSpeed' in T,
      summons: 'minion' in T,
      weaves: 'wobble' in T,
      pack: SPAWN_TABLE.find((r) => r.type === type).pack,
    });
  });
  assert.equal(new Set(sig).size, TYPES.length, 'every type has its own profile');
});

// ---------- boss ----------

const awakeBoss = () => {
  const b = spawnBoss(player.x - 300, player.y);
  b.state = 'walk';
  b.stateT = 1e9; // keep walking until a test asks for an attack
  return b;
};
const attackNow = (b, name) => {
  const list = b.phase === 2 ? BOSS.phase2Attacks : BOSS.phase1Attacks;
  b.atkIdx = list.indexOf(name);
  b.state = 'walk';
  b.stateT = 0;
};

test('boss: hp comes from the director, it sleeps until you come near or shoot it', () => {
  game.time = 0;
  const b = spawnBoss(10 * TILE, 15 * TILE);
  const d = directorAt(0);
  assert.equal(b.maxHp, Math.round(BOSS.hpBase + BOSS.hpPerDirectorHp * d.hp));
  assert.equal(game.boss, b);
  player.x = b.x + BOSS.aggroRadius + 100;
  player.y = b.y;
  run(secs(1));
  assert.equal(b.state, 'dormant');
  assert.equal(b.x, 10 * TILE);
  player.x = b.x + BOSS.aggroRadius - 20;
  run(2);
  assert.equal(b.state, 'wake');
  assert.equal(b.tell, 'wake');
  run(secs(BOSS.wakeTime) + 2);
  assert.equal(b.state, 'walk');
  // Shooting it wakes it from any distance.
  openArena();
  const b2 = spawnBoss(10 * TILE, 15 * TILE);
  shoot(b2);
  run(2);
  assert.notEqual(b2.state, 'dormant');
});

test('boss slam: ground tell for the whole windup, no damage until it lands, and you can leave the ring', () => {
  const b = awakeBoss();
  player.x = b.x + 60;
  player.y = b.y;
  attackNow(b, 'slam');
  game.hp = 99;
  let tell = 0;
  let hurtEarly = false;
  let landed = -1;
  run(secs(2), (i) => {
    if (b.tell === 'slam') { tell++; if (game.hp < 99) hurtEarly = true; }
    if (landed < 0 && game.effects.some((f) => f.kind === 'slam')) landed = i;
  });
  assert.ok(tell >= BOSS.slam.windup / STEP - 3, `slam tell ${tell} ticks`);
  assert.ok(!hurtEarly);
  assert.equal(game.hp, 99 - BOSS.slam.damage, 'standing in the ring when it lands hurts');

  openArena();
  const b2 = awakeBoss();
  player.x = b2.x + 60;
  player.y = b2.y;
  attackNow(b2, 'slam');
  game.hp = 99;
  run(secs(0.5));
  player.x = b2.x + BOSS.slam.radius + 80; // walked out of the ring during the windup
  run(secs(1.5));
  assert.equal(game.hp, 99);
});

test('boss fan: aim line tell, then a fan of bolts; phase 2 fires more', () => {
  const b = awakeBoss();
  attackNow(b, 'fan');
  game.hp = 99;
  let tell = 0;
  let boltsDuringTell = 0;
  let peak = 0;
  run(secs(1.2), () => {
    if (b.tell === 'fan') { tell++; boltsDuringTell += game.enemyProjectiles.length; }
    peak = Math.max(peak, game.enemyProjectiles.length);
  });
  assert.ok(tell >= BOSS.fan.windup / STEP - 3);
  assert.equal(boltsDuringTell, 0, 'no bolt leaves during the tell');
  assert.equal(peak, BOSS.fan.bolts);

  openArena();
  const b2 = awakeBoss();
  b2.hp = Math.floor(b2.maxHp * 0.4);
  run(secs(BOSS.transitionTime) + 3);
  assert.equal(b2.phase, 2);
  attackNow(b2, 'fan');
  let peak2 = 0;
  run(secs(1.2), () => { peak2 = Math.max(peak2, game.enemyProjectiles.length); });
  assert.equal(peak2, BOSS.fan.phase2Bolts);
});

test('boss phases: below half HP it roars (invulnerable), then is faster and gains charge and summon', () => {
  const b = awakeBoss();
  assert.equal(b.phase, 1);
  const base = b.maxHp;
  b.hp = Math.floor(base * BOSS.phase2At);
  run(1);
  assert.equal(b.phase, 2);
  assert.equal(b.state, 'transition');
  assert.equal(b.tell, 'enrage');
  assert.ok(b.invuln);
  // Bullets are spent but do no damage during the roar.
  const hp = b.hp;
  shoot(b);
  run(2);
  assert.equal(b.hp, hp, 'invulnerable during the transition');
  run(secs(BOSS.transitionTime) + 2);
  assert.ok(!b.invuln);
  assert.equal(b.state, 'walk');
  shoot(b);
  run(2);
  assert.equal(b.hp, hp - BULLET_DAMAGE, 'vulnerable again');
  assert.ok(BOSS.phase2Speed > BOSS.speed);
  assert.ok(BOSS.phase2Attacks.includes('charge') && BOSS.phase2Attacks.includes('summon'));
  assert.ok(!BOSS.phase1Attacks.includes('charge') && !BOSS.phase1Attacks.includes('summon'));
});

test('boss charge (phase 2): telegraphed lane, outruns you, dodgeable; summon: tell, then swarmers', () => {
  const b = awakeBoss();
  b.hp = Math.floor(b.maxHp * 0.4);
  run(secs(BOSS.transitionTime) + 3);
  game.hp = 99;
  attackNow(b, 'charge');
  const x0 = b.x;
  let tell = 0;
  let still = true;
  let top = 0;
  let dodged = false;
  run(secs(3), () => {
    if (b.tell === 'charge') { tell++; if (Math.abs(b.x - x0) > 1) still = false; if (b.stateT < 0.15 && !dodged) { player.y += 110; dodged = true; } }
    if (b.state === 'attack') top = Math.max(top, Math.hypot(b.vx, b.vy));
  });
  assert.ok(tell >= BOSS.charge.windup / STEP - 3);
  assert.ok(still, 'it does not move while winding up');
  assert.ok(top >= BOSS.charge.speed - 1 && top > PLAYER_SPEED);
  assert.equal(game.hp, 99, 'sidestepping the lane avoids the charge');

  openArena();
  const b2 = awakeBoss();
  b2.hp = Math.floor(b2.maxHp * 0.4);
  run(secs(BOSS.transitionTime) + 3);
  attackNow(b2, 'summon');
  let spawnedEarly = false;
  let tellTicks = 0;
  run(secs(1.6), () => {
    if (b2.tell === 'summon') { tellTicks++; if (game.enemies.length > 1) spawnedEarly = true; }
  });
  assert.ok(tellTicks >= BOSS.summon.windup / STEP - 3);
  assert.ok(!spawnedEarly);
  assert.equal(game.enemies.filter((e) => e.owner === b2).length, BOSS.summon.count);
});

test('boss attacks all show a tell first: every attack has a nonzero windup', () => {
  for (const name of ['slam', 'fan', 'charge', 'summon']) assert.ok(BOSS[name].windup >= 0.6, `${name} windup`);
  assert.ok(BOSS.transitionTime >= 1 && BOSS.wakeTime > 0);
});

// ---------- stairs unlock ----------

test('killing the boss unlocks the stairs early, ahead of the floor timer', () => {
  resetGame({ seed: 13 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  const b = game.boss;
  assert.ok(b && game.enemies.includes(b), 'every floor starts with its boss');
  assert.equal(game.exitUnlocked, false);
  run(secs(2));
  assert.equal(game.exitUnlocked, false, 'locked while the boss lives');
  assert.ok(game.floorTime < FLOOR_UNLOCK_TIME);
  b.hp = 0;
  run(1);
  assert.equal(game.exitUnlocked, 'boss');
  assert.equal(game.boss, null);
  assert.ok(game.bossDefeated);
  assert.ok(!game.enemies.includes(b));
  assert.ok(game.kills >= 1 && game.score > 0);
  // The next floor has a fresh boss and locks the stairs again.
  descend();
  assert.equal(game.exitUnlocked, false);
  assert.ok(game.boss && !game.bossDefeated);
});

test('the floor timer still unlocks the stairs if the boss is never found', () => {
  resetGame({ seed: 14 });
  game.spawnCd = 1e9;
  game.fireCd = 1e9;
  game.floorTime = FLOOR_UNLOCK_TIME - 0.05;
  run(5);
  assert.equal(game.exitUnlocked, 'timer');
  assert.ok(game.boss, 'the boss is still alive');
});

test('the auto-firing standard weapon kills the boss, which then opens the stairs', () => {
  openArena();
  game.fireCd = 0; // the weapon fires by itself at its own interval; nothing presses a button
  game.iframes = 1e9; // survive the fight; this test is about the weapon and the unlock
  game.exitUnlocked = false;
  const b = spawnBoss(24 * TILE, 15 * TILE);
  let t = 0;
  while (game.boss && t < 180) {
    // The player holds a firing distance of 160 px, on the side of the boss with more room.
    const side = b.x < 24 * TILE ? 1 : -1;
    player.x = b.x + side * 160;
    player.y = b.y;
    game.hp = 99;
    player.angle = Math.atan2(b.y - player.y, b.x - player.x);
    updateGame(STEP);
    t += STEP;
  }
  assert.equal(game.boss, null, `the boss survived ${t.toFixed(0)} s of fire`);
  assert.equal(b.phase, 2, 'it went through both phases');
  assert.equal(game.exitUnlocked, 'boss');
  console.log(`# boss (${b.maxHp} HP at floor 1, 0:00) died to the standard weapon in ${t.toFixed(1)} s of fire`);
});
