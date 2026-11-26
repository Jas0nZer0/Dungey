// Print a floor as ASCII for human review: node scripts/dump-floor.mjs <seed> [floor]
// The seed is the run seed shown in the HUD; floor defaults to 1.
// S = spawn, E = exit, # = wall, . = floor.
import { generateFloor, floorMetrics, qualityReport } from '../src/floorgen.js';
import { floorSeed, parseSeed } from '../src/rng.js';

const runSeed = parseSeed(process.argv[2] ?? '1');
const n = Number(process.argv[3] ?? 1);
const f = generateFloor(floorSeed(runSeed, n));
const rows = f.tiles.map((r) => r.split(''));
rows[f.spawn.ty][f.spawn.tx] = 'S';
rows[f.exit.ty][f.exit.tx] = 'E';
console.log(rows.map((r) => r.join('')).join('\n'));
const m = floorMetrics(f);
const q = qualityReport(f);
console.log(`run seed ${runSeed}, floor ${n}, floor seed ${f.seed}, attempt ${f.attempt}, quality ${f.quality}`);
console.log(`rooms ${f.rooms.length}, laneShare ${m.laneShare.toFixed(2)}, openShare ${m.openShare.toFixed(2)}, maxClutter ${m.maxClutter.toFixed(2)}, deadEnds ${q.deadEnds}, narrow ${q.narrow}, pinches ${q.pinches}`);
f.rooms.forEach((r, i) => console.log(`room ${i}: ${r.w}x${r.h} ${r.style} lane ${m.rooms[i].lane} cover ${(m.rooms[i].clutter * 100).toFixed(0)}%`));
