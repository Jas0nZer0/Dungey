// Seeded RNG helpers. Pure and DOM-free, so the floor generator can run in Node.

// 32-bit FNV-1a hash of a string.
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Turn user input (a number, a digit string or any text) into an unsigned 32-bit seed.
export function parseSeed(v) {
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s) % 2 ** 32;
  return hashString(s);
}

// Mix two 32-bit values into one well-spread 32-bit value. Used to derive a floor seed
// from the run seed and the floor number, and an attempt seed from a floor seed.
export function mixSeed(a, b) {
  let h = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function floorSeed(runSeed, floorNumber) {
  return mixSeed(runSeed >>> 0, floorNumber);
}

// mulberry32. Same seed, same sequence, on every platform.
export function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next, // float in [0, 1)
    int: (n) => Math.floor(next() * n), // integer in [0, n)
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // integer in [lo, hi]
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
