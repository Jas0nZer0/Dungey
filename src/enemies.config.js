// Enemy roster tuning. Plain data; edit the numbers to retune without touching code.
//
// Base HP and speed for every type come from the difficulty director (difficulty.config.js)
// at the director time the enemy spawns. Each type here only holds a multiplier on top of
// those two numbers, plus its own behaviour numbers. Times are seconds, distances pixels.
import { PLAYER_SPEED } from './config.js';

// No ground enemy walks faster than this, so the player can always out-walk one. Charges and
// dashes are the exception and always show a telegraph first.
export const MAX_WALK_SPEED = PLAYER_SPEED * 0.95;

// Every body must be at most TILE - 2 = 30 px wide. Flow-field steering walks tile centre to
// tile centre, and a body that fits inside one tile can always make that move without touching
// a wall; the 2 px of slack absorbs rounding. A wider body would snag in the 2-wide corridors
// (tests/flowfield.test.mjs checks the limit).
export const ENEMIES = {
  // Walks straight at you. Teaches kiting.
  chaser: {
    size: 20, hpMul: 1, speedMul: 1, contact: 1, knock: 1,
  },
  // Keeps its distance, stops, aims (the windup), then fires one slow bolt. Break line of
  // sight, close in, or sidestep the bolt.
  shooter: {
    size: 18, hpMul: 0.7, speedMul: 0.85, contact: 1, knock: 1,
    keepMin: 150, keepMax: 250, // walks toward you beyond keepMax, backs off inside keepMin
    windup: 0.55, cooldown: 1.6, boltSpeed: 230, boltDamage: 1, boltLife: 2.5, boltRadius: 4,
  },
  // Small, quick and weak, arrives in a pack and weaves from side to side. Needs crowd
  // control: back into a corridor so they queue, or burn them down before they surround you.
  swarmer: {
    size: 12, hpMul: 0.34, speedMul: 1.15, contact: 1, knock: 1.5,
    wobble: 0.45, wobbleHz: 1.6, // sideways weave as a share of its speed
  },
  // Slow and heavy. Telegraphs a straight charge, then recovers, dazed. Sidestep the charge
  // and shoot it while it is stuck.
  tank: {
    size: 28, hpMul: 4, speedMul: 0.5, contact: 2, knock: 0.15,
    chargeRange: 230, windup: 0.7, chargeSpeed: 320, chargeTime: 0.5, recover: 0.9, cooldown: 2.2,
  },
  // Stays back and calls swarmers after a visible windup. Kill it first.
  summoner: {
    size: 22, hpMul: 2, speedMul: 0.6, contact: 1, knock: 0.6,
    keepMin: 190, keepMax: 300,
    windup: 0.9, cooldown: 6, count: 2, maxMinions: 6, minion: 'swarmer',
  },
};

// Which types the spawner may pick. `from` is the director time (seconds) at which the type
// joins the pool, `weight` its share once it is there, `pack` how many appear per spawn.
// Deeper floors start later on the curve (DIFFICULTY.floorOffset), so they unlock types sooner.
export const SPAWN_TABLE = [
  { type: 'chaser', from: 0, weight: 6, pack: 1 },
  { type: 'shooter', from: 45, weight: 3, pack: 1 },
  { type: 'swarmer', from: 90, weight: 3, pack: 4 },
  { type: 'tank', from: 150, weight: 2, pack: 1 },
  { type: 'summoner', from: 240, weight: 1, pack: 1 },
];

// One boss per floor. HP is hpBase + hpPerDirectorHp x the director's enemy HP, so it grows
// with run time and depth. Phase 1 runs above `phase2At` of its HP, phase 2 below.
export const BOSS = {
  size: 30, contact: 2, knock: 0, // see the size rule above ENEMIES
  hpBase: 60, hpPerDirectorHp: 12,
  speed: 70, phase2Speed: 95, // px/s while walking
  wakeTime: 0.6, // roar on arrival, then it hunts the player from anywhere on the floor
  phase2At: 0.5,
  transitionTime: 1.2, // invulnerable roar between phases
  thinkTime: 1.3, phase2ThinkTime: 0.8, // walking time between attacks
  // Every attack has a windup (the tell) during which it does no damage.
  slam: { range: 120, windup: 0.9, radius: 105, damage: 2, recover: 0.8 },
  fan: {
    windup: 0.7, bolts: 5, phase2Bolts: 7, spread: 0.9, boltSpeed: 250, boltDamage: 1, boltLife: 2.5, boltRadius: 4, recover: 0.6,
  },
  charge: {
    windup: 0.8, speed: 380, time: 0.55, recover: 1.0, damage: 2,
  },
  summon: {
    windup: 1.0, count: 3, maxMinions: 6, minion: 'swarmer', recover: 0.8,
  },
  // Attack order in each phase. 'slam' only runs when the player is within slam.range;
  // otherwise it is skipped to the next entry.
  phase1Attacks: ['fan', 'slam', 'fan'],
  phase2Attacks: ['charge', 'fan', 'summon', 'slam'],
};

// Flow field steering. The field is one BFS from the player's tile; an enemy follows it by
// picking the farthest waypoint, up to `lookahead` tiles along the route, that a body can
// reach in a straight line without touching a wall (clearance px of margin).
export const FLOW = {
  lookahead: 5,
  clearance: 3,
  sample: 8, // px between collision samples along a sight line
  repath: 6, // ticks between waypoint refreshes per enemy (staggered)
};
