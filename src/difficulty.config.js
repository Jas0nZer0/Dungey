// Difficulty curve data. Edit the numbers to tune the run; no code changes needed.
//
// Every curve is sampled by src/director.js at director time t (seconds):
//   0 <= t <= softCap : linear from `start` to `atSoftCap`
//   t >  softCap      : the linear value at softCap is multiplied by growthPerMin^((t-softCap)/60)
// The result is then clamped to [min, max] when those are set.
// A growthPerMin above 1 grows the value (HP, speed, count); below 1 shrinks it (spawn interval).
// Director time is game.time + game.timeOffset, so an extension mechanic or "part 2"
// can shift the whole curve by setting game.timeOffset.
export const DIFFICULTY = {
  softCap: 600, // s. The run's soft cap (10:00). Scaling turns exponential after this.

  spawnInterval: { start: 1.5, atSoftCap: 0.6, growthPerMin: 0.8, min: 0.12 }, // s between spawn waves
  spawnBatch: { start: 1, atSoftCap: 2, growthPerMin: 1.25, min: 1, max: 6 }, // enemies per wave (floored)
  enemyCap: { start: 20, atSoftCap: 70, growthPerMin: 1.15, max: 160 }, // alive at once; max is the hard cap
  // Enemy speed stays under PLAYER_SPEED (180 px/s) so the player can always kite.
  enemySpeed: { start: 55, atSoftCap: 150, growthPerMin: 1.03, max: 165 }, // px/s, fixed at spawn
  enemyHp: { start: 3, atSoftCap: 13, growthPerMin: 1.35, min: 1, max: 80 }, // rounded, fixed at spawn

  score: {
    perSecond: 1, // points per second survived
    perEnemyHp: 10, // points per kill = perEnemyHp * the enemy's HP at spawn
    overtimeMultiplier: 2, // kills after the soft cap score this many times more
  },
};
