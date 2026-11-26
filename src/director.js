// Difficulty director: pure functions that turn run time into spawn and enemy numbers.
// Curve data lives in difficulty.config.js. No DOM access.
import { DIFFICULTY } from './difficulty.config.js';

// Value of one curve at time t (seconds).
export function sampleCurve(curve, t, softCap = DIFFICULTY.softCap) {
  const ramp = Math.min(Math.max(t, 0), softCap) / softCap;
  let v = curve.start + (curve.atSoftCap - curve.start) * ramp;
  if (t > softCap) v *= Math.pow(curve.growthPerMin, (t - softCap) / 60);
  if (curve.min !== undefined) v = Math.max(curve.min, v);
  if (curve.max !== undefined) v = Math.min(curve.max, v);
  return v;
}

export function phaseAt(t) {
  return t > DIFFICULTY.softCap ? 'overtime' : 'ramp';
}

// Everything the game needs for a given director time.
export function directorAt(t) {
  const d = DIFFICULTY;
  return {
    phase: phaseAt(t),
    spawnInterval: sampleCurve(d.spawnInterval, t),
    spawnBatch: Math.max(1, Math.floor(sampleCurve(d.spawnBatch, t))),
    cap: Math.floor(sampleCurve(d.enemyCap, t)),
    speed: sampleCurve(d.enemySpeed, t),
    hp: Math.round(sampleCurve(d.enemyHp, t)),
  };
}
