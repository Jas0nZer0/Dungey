// Enemy types and their behaviour states. Pure of the DOM; game.js calls thinkEnemy() once per
// enemy per tick, then handles separation and movement. Every ground enemy reaches the player
// through the shared flow field (src/flowfield.js), so walls and cover never stop one.
//
// An enemy is { type, x, y, w, h, vx, vy, hp, maxHp, speed, flash, contact, knock, state,
// stateT, cd, tell, tellMax, aim, ... }. `state` is the behaviour state, `stateT` the seconds left
// in it, `tell` the name of the attack being telegraphed (null when none) and `tellMax` its
// total windup, so a renderer can draw progress. An attack never deals damage during its tell.
import { ENEMIES, BOSS, MAX_WALK_SPEED, FLOW } from './enemies.config.js';
import { lineOfSight, waypoint } from './flowfield.js';

const AIM_LOCK = 0.2; // s before a windup ends at which the aim stops tracking the player
let serial = 0; // staggers waypoint refreshes across enemies

// ---------- construction ----------

// `base` is the director's { speed, hp } for the spawn time. The type only scales it.
export function makeEnemy(type, x, y, base) {
  const T = ENEMIES[type];
  if (!T) throw new Error(`unknown enemy type ${type}`);
  const hp = Math.max(1, Math.round(base.hp * T.hpMul));
  const speed = Math.min(base.speed * T.speedMul, MAX_WALK_SPEED);
  const n = serial++;
  const e = {
    type, x, y, w: T.size, h: T.size, vx: 0, vy: 0, hp, maxHp: hp, speed, flash: 0,
    contact: T.contact, knock: T.knock,
    state: 'move', stateT: 0, cd: 0, tell: null, tellMax: 0, aim: 0,
    wpT: n % FLOW.repath, wpx: x, wpy: y, phase: (n * 2.399) % (Math.PI * 2),
    owner: null, minions: 0, invuln: false,
  };
  if (type === 'shooter' || type === 'tank') e.cd = T.cooldown * 0.5;
  if (type === 'summoner') e.cd = T.cooldown * 0.5;
  return e;
}

export function makeBoss(x, y, base) {
  const hp = Math.round(BOSS.hpBase + BOSS.hpPerDirectorHp * base.hp);
  const n = serial++;
  return {
    type: 'boss', x, y, w: BOSS.size, h: BOSS.size, vx: 0, vy: 0, hp, maxHp: hp, speed: BOSS.speed, flash: 0,
    contact: BOSS.contact, knock: BOSS.knock,
    state: 'dormant', stateT: 0, cd: 0, tell: null, tellMax: 0, aim: 0, attack: null, atkIdx: 0,
    wpT: n % FLOW.repath, wpx: x, wpy: y, phase: 1, owner: null, minions: 0, invuln: false,
  };
}

// ---------- helpers ----------

// Set the velocity toward (tx, ty). With `dt`, never overshoot: the last step lands on the point.
function walkTo(e, tx, ty, speed, dt = 0) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) { e.vx = 0; e.vy = 0; return; }
  const sp = dt > 0 ? Math.min(speed, len / dt) : speed;
  e.vx = (dx / len) * sp;
  e.vy = (dy / len) * sp;
}

const wp = { x: 0, y: 0 };

// Walk toward the player along the flow field.
function chase(e, ctx, speed, dt) {
  const { player, flow } = ctx;
  if (--e.wpT <= 0 || Math.hypot(e.wpx - e.x, e.wpy - e.y) < 3) {
    e.wpT = FLOW.repath;
    if (waypoint(flow, e, player.x, player.y, wp)) {
      e.wpx = wp.x;
      e.wpy = wp.y;
    } else {
      e.wpx = player.x; // on an unreachable tile: walk straight and let wall sliding sort it out
      e.wpy = player.y;
    }
  }
  walkTo(e, e.wpx, e.wpy, speed, dt);
}

// Hold a band of distance from the player: close in beyond keepMax or without line of sight,
// back off inside keepMin, stand still between.
function keepRange(e, ctx, T, dt) {
  const { player } = ctx;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy);
  const los = lineOfSight(e.x, e.y, player.x, player.y);
  e.los = los;
  if (los && d < T.keepMin) walkTo(e, e.x - dx, e.y - dy, e.speed);
  else if (!los || d > T.keepMax) chase(e, ctx, e.speed, dt);
  else { e.vx = 0; e.vy = 0; }
  return { d, los };
}

function startWindup(e, name, time, ctx) {
  e.state = 'windup';
  e.stateT = time;
  e.tell = name;
  e.tellMax = time;
  e.aim = Math.atan2(ctx.player.y - e.y, ctx.player.x - e.x);
}

// While winding up, keep aiming at the player until the last AIM_LOCK seconds.
function trackAim(e, ctx) {
  if (e.stateT > AIM_LOCK) e.aim = Math.atan2(ctx.player.y - e.y, ctx.player.x - e.x);
}

function endTell(e) {
  e.tell = null;
  e.tellMax = 0;
}

// Drop `count` minions in a ring around e, as many as the owner's cap and open floor allow.
function summonMinions(e, ctx, type, count, maxMinions) {
  let made = 0;
  for (let i = 0; i < count && e.minions < maxMinions; i++) {
    const a = (i / count) * Math.PI * 2 + e.phase;
    const m = ctx.spawn(type, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24);
    if (!m) continue;
    m.owner = e;
    e.minions++;
    made++;
  }
  return made;
}

// ---------- per-type behaviour ----------

function thinkChaser(e, ctx, dt) {
  chase(e, ctx, e.speed, dt);
}

function thinkSwarmer(e, ctx, dt) {
  chase(e, ctx, e.speed, dt);
  const T = ENEMIES.swarmer;
  // Weave sideways across the line of travel.
  const len = Math.hypot(e.vx, e.vy);
  if (len > 1e-6) {
    const w = Math.sin(ctx.game.time * T.wobbleHz * Math.PI * 2 + e.phase) * T.wobble * e.speed;
    const ux = e.vx / len;
    const uy = e.vy / len;
    e.vx += -uy * w;
    e.vy += ux * w;
  }
}

function thinkShooter(e, ctx, dt) {
  const T = ENEMIES.shooter;
  e.cd -= dt;
  if (e.state === 'windup') {
    e.vx = 0;
    e.vy = 0;
    trackAim(e, ctx);
    e.stateT -= dt;
    if (e.stateT <= 0) {
      ctx.shoot(e.x, e.y, e.aim, T.boltSpeed, T.boltDamage, T.boltLife, T.boltRadius);
      e.state = 'move';
      e.cd = T.cooldown;
      endTell(e);
    }
    return;
  }
  const { d, los } = keepRange(e, ctx, T, dt);
  if (e.cd <= 0 && los && d <= T.keepMax + 60) startWindup(e, 'shot', T.windup, ctx);
}

function thinkTank(e, ctx, dt) {
  const T = ENEMIES.tank;
  e.cd -= dt;
  switch (e.state) {
    case 'windup':
      e.vx = 0;
      e.vy = 0;
      trackAim(e, ctx);
      e.stateT -= dt;
      if (e.stateT <= 0) { e.state = 'charge'; e.stateT = T.chargeTime; endTell(e); }
      break;
    case 'charge':
      e.vx = Math.cos(e.aim) * T.chargeSpeed;
      e.vy = Math.sin(e.aim) * T.chargeSpeed;
      e.stateT -= dt;
      if (e.stateT <= 0) { e.state = 'recover'; e.stateT = T.recover; }
      break;
    case 'recover':
      e.vx = 0;
      e.vy = 0;
      e.stateT -= dt;
      if (e.stateT <= 0) { e.state = 'move'; e.cd = T.cooldown; }
      break;
    default: {
      chase(e, ctx, e.speed, dt);
      const d = Math.hypot(ctx.player.x - e.x, ctx.player.y - e.y);
      if (e.cd <= 0 && d <= T.chargeRange && lineOfSight(e.x, e.y, ctx.player.x, ctx.player.y)) {
        startWindup(e, 'charge', T.windup, ctx);
      }
    }
  }
}

function thinkSummoner(e, ctx, dt) {
  const T = ENEMIES.summoner;
  e.cd -= dt;
  if (e.state === 'windup') {
    e.vx = 0;
    e.vy = 0;
    e.stateT -= dt;
    if (e.stateT <= 0) {
      summonMinions(e, ctx, T.minion, T.count, T.maxMinions);
      e.state = 'move';
      e.cd = T.cooldown;
      endTell(e);
    }
    return;
  }
  keepRange(e, ctx, T, dt);
  if (e.cd <= 0 && e.minions < T.maxMinions) startWindup(e, 'summon', T.windup, ctx);
}

// ---------- boss ----------

function bossSpeed(e) {
  return e.phase === 2 ? BOSS.phase2Speed : BOSS.speed;
}

function pickBossAttack(e, ctx) {
  const list = e.phase === 2 ? BOSS.phase2Attacks : BOSS.phase1Attacks;
  const d = Math.hypot(ctx.player.x - e.x, ctx.player.y - e.y);
  for (let i = 0; i < list.length; i++) {
    const name = list[(e.atkIdx + i) % list.length];
    if (name === 'slam' && d > BOSS.slam.range) continue;
    if (name === 'summon' && e.minions >= BOSS.summon.maxMinions) continue;
    e.atkIdx = (e.atkIdx + i + 1) % list.length;
    return name;
  }
  // Nothing fits (for example only slam is left and the player is far): fan always works.
  return 'fan';
}

function resolveBossAttack(e, ctx) {
  const { player } = ctx;
  const B = BOSS;
  switch (e.attack) {
    case 'slam': {
      ctx.effect('slam', e.x, e.y, B.slam.radius, 0.3);
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (d <= B.slam.radius) ctx.hurt(B.slam.damage);
      e.state = 'recover';
      e.stateT = B.slam.recover;
      break;
    }
    case 'fan': {
      const n = e.phase === 2 ? B.fan.phase2Bolts : B.fan.bolts;
      for (let i = 0; i < n; i++) {
        const a = e.aim + B.fan.spread * (n === 1 ? 0 : i / (n - 1) - 0.5);
        ctx.shoot(e.x, e.y, a, B.fan.boltSpeed, B.fan.boltDamage, B.fan.boltLife, B.fan.boltRadius);
      }
      e.state = 'recover';
      e.stateT = B.fan.recover;
      break;
    }
    case 'charge':
      e.state = 'attack';
      e.stateT = B.charge.time;
      break;
    case 'summon':
      summonMinions(e, ctx, B.summon.minion, B.summon.count, B.summon.maxMinions);
      e.state = 'recover';
      e.stateT = B.summon.recover;
      break;
    default:
      e.state = 'recover';
      e.stateT = 0.5;
  }
  endTell(e);
}

function thinkBoss(e, ctx, dt) {
  const B = BOSS;
  const { player } = ctx;
  const d = Math.hypot(player.x - e.x, player.y - e.y);

  // Phase change: invulnerable roar, then faster with new attacks.
  if (e.phase === 1 && e.hp <= e.maxHp * B.phase2At && e.state !== 'dormant') {
    e.phase = 2;
    e.state = 'transition';
    e.stateT = B.transitionTime;
    e.invuln = true;
    e.atkIdx = 0;
    e.tell = 'enrage';
    e.tellMax = B.transitionTime;
  }

  e.stateT -= dt;
  switch (e.state) {
    case 'dormant':
      e.vx = 0;
      e.vy = 0;
      if (d <= B.aggroRadius || e.hp < e.maxHp) {
        e.state = 'wake';
        e.stateT = B.wakeTime;
        e.tell = 'wake';
        e.tellMax = B.wakeTime;
      }
      break;
    case 'wake':
      e.vx = 0;
      e.vy = 0;
      if (e.stateT <= 0) { e.state = 'walk'; e.stateT = B.thinkTime; endTell(e); }
      break;
    case 'transition':
      e.vx = 0;
      e.vy = 0;
      if (e.stateT <= 0) { e.invuln = false; e.state = 'walk'; e.stateT = B.phase2ThinkTime; endTell(e); }
      break;
    case 'walk':
      chase(e, ctx, bossSpeed(e), dt);
      if (e.stateT <= 0) {
        e.attack = pickBossAttack(e, ctx);
        const w = B[e.attack].windup;
        startWindup(e, e.attack, w, ctx);
        e.vx = 0;
        e.vy = 0;
      }
      break;
    case 'windup':
      e.vx = 0;
      e.vy = 0;
      if (e.attack !== 'slam' && e.attack !== 'summon') trackAim(e, ctx);
      if (e.stateT <= 0) resolveBossAttack(e, ctx);
      break;
    case 'attack': // the charge itself
      e.vx = Math.cos(e.aim) * B.charge.speed;
      e.vy = Math.sin(e.aim) * B.charge.speed;
      if (e.stateT <= 0) { e.state = 'recover'; e.stateT = B.charge.recover; }
      break;
    case 'recover':
      e.vx = 0;
      e.vy = 0;
      if (e.stateT <= 0) {
        e.state = 'walk';
        e.stateT = e.phase === 2 ? B.phase2ThinkTime : B.thinkTime;
      }
      break;
    default:
      break;
  }
}

// ---------- entry point ----------

const THINK = {
  chaser: thinkChaser, shooter: thinkShooter, swarmer: thinkSwarmer, tank: thinkTank, summoner: thinkSummoner, boss: thinkBoss,
};

// Set e.vx and e.vy for this tick and advance the behaviour state. `ctx` carries { game, player,
// flow, hurt(dmg), spawn(type, x, y), shoot(x, y, angle, speed, damage, life, radius),
// effect(kind, x, y, r, secs) }.
export function thinkEnemy(e, ctx, dt) {
  e.flash = Math.max(0, e.flash - dt);
  THINK[e.type](e, ctx, dt);
}
