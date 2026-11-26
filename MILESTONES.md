# Dungey Milestones

## Concept

- **Theme:** classic fantasy that turns gothic in the late game.
- **Combat:** real-time twin-stick shooting. WASD to move, mouse to aim and fire.
- **Run length:** soft cap of 10 minutes. After 10:00 difficulty ramps up exponentially. A later mechanic may extend the time or open a "part 2".
- **Audience:** roguelike fans. Permadeath, randomised floors, build variety.
- **Target:** static HTML5 upload to itch.io. No server code. A leaderboard would need separate hosting and is out of scope for v1.

## Session protocol

Each milestone runs in its own session to keep context light.

**Starting a session.** Open a fresh session and paste:

> Read `MILESTONES.md` and the repo. Work only on milestone M<N>. Do not start other milestones. Confirm the scope and done-when checklist with me, then build.

**Ending a session.** Before closing:

1. Tick the done-when boxes that pass. Leave failing ones unticked with a note.
2. Fill in the milestone's **Handoff** line: file layout changes, public module APIs, tuning values, known bugs.
3. Set the milestone **Status** to `done`, `partial` or `blocked`.
4. Commit code and the `MILESTONES.md` update together.

**Rules.**

- The Handoff line is the only context the next session gets about earlier work. Write it for a reader who has seen nothing.
- If a milestone grows past one session, split it as M<N>a and M<N>b in this file rather than letting a session sprawl.
- Scope changes go into this file first, then into code.
- Playtest checks marked "outside players" need a human. Mark them `needs human` and move on.

## Decisions pending

Defaults apply until you change them. Update this section when you decide.

| Decision | Default | Affects |
|---|---|---|
| Resolution and embed size | 960x540 (16:9). Applied in M0 | M0, M7, M10 |
| Art source | Claude-generated art. Pixel art is likely. Final style decided at M7 | M7 |
| Input | Keyboard and mouse only. Gamepad deferred | M1, M8 |
| M4 position | Before M5. Move after M6 if you want build depth first | M4, M5, M6 |

## Milestones

### M0. Foundations
**Status:** done
**Scope:** Split `src/main.js` into modules (input, loop, map, entities, render). Add a fixed-timestep update loop, mouse and keyboard input, canvas scaling, pause.
**Done when:**
- [x] Update runs at a fixed 60 Hz independent of display refresh rate.
- [x] Canvas scales cleanly when the window resizes.
- [x] Pause works on `Esc` and on tab blur.
- [x] Visible behaviour matches the scaffold.

**Risk:** refactor sprawl. Restructure only. Add no features.
**Handoff:** Layout: `src/config.js` (TILE=32, VIEW_W=960, VIEW_H=540, UPDATE_HZ=60, STEP=1/60), `map.js` (`map`, `mapWidth`, `mapHeight`, `isFloor(x,y)`), `input.js` (`initInput(canvas, clientToGame)`, `isHeld(key)`, `drainPresses()` returns non-repeat key taps since last call, `clearInput()`, `mouse {x,y,down}` in game-space coords), `entities.js` (`player {x,y}` in tile units, `updateEntities(presses)`), `loop.js` (`startLoop({update, render, onPause})`, `isPaused/setPaused/togglePause`, `stats.updates` counter), `render.js` (`initRender()`, `render(paused)`, `resize()`, `clientToGame(cx,cy)`, `canvas`), `main.js` wires them. Behaviour: update runs at fixed 60 Hz via accumulator (frame dt clamped to 0.25 s; measured 59.5 updates/s). Canvas is 960x540 internal; the 20x15 map is centred with whole-pixel offsets. CSS scaling keeps 16:9, integer scale at 1x and above, fractional below. Esc toggles pause (handled in a keydown listener, not in update). Window blur and `document.hidden` pause; resume is Esc only. Pausing clears held keys and queued taps. Player still moves one tile per key tap (scaffold behaviour); M1 replaces this with velocity movement. Mouse state is tracked but unused. Tuning: none. Debug hook: `window.__dungey.stats`. Known bugs: none. Not tested on Firefox or Safari (M9).

### M1. Twin-stick movement
**Status:** done
**Scope:** WASD movement with velocity, mouse aim, axis-separated AABB tile collision, camera follow, a map larger than one screen.
**Done when:**
- [x] Player slides along walls with no snagging on corners. (`npm test`, 8 headless tests)
- [x] Player cannot tunnel through walls at any speed. (tested to 100,000 px/s plus a 20,000-step fuzz)
- [x] Crosshair and facing indicator track the mouse. (Playwright: `player.angle` matched the mouse bearing at 960x540, 1280x720 and 700x500; max error 1.2e-3 rad at the fractional scale. Camera follow checked by walking through the door. No console errors.)

**Risk:** collision feel. Corner snagging is the usual failure.
**Handoff:** Layout: new `src/collision.js` (`moveBody(body, dx, dy)` axis-separated AABB with sub-steps under TILE/2 so no speed tunnels; `overlapsWall(body)`), `src/camera.js` (`camera {x,y}` top-left in world px, whole-pixel, clamped to map; `updateCamera(target)`). `config.js` adds PLAYER_SPEED=180 px/s, PLAYER_SIZE=20 px, PLAYER_ACCEL=1800, PLAYER_FRICTION=2400. `map.js` is now 48x32 tiles (1536x1024 px), built from rectangles, same exports (`map`, `mapWidth`, `mapHeight`, `isFloor`); out-of-bounds is wall. `entities.js`: `player {x,y,w,h,vx,vy,angle}` with x,y as hitbox centre in world pixels (no longer tile units), spawn at tile (2,2); `stepPlayer(p, dirX, dirY, dt)` is the pure step; `updateEntities(dt)` reads WASD or arrows via `isHeld`, moves, updates the camera, then sets `player.angle` from `mouse` plus camera. `input.js` lowercases letter keys. `main.js` calls `updateEntities(dt)` and discards `drainPresses()` each tick. `render.js` draws only visible tiles offset by the camera, a facing line on the player and a red crosshair at the mouse (OS cursor hidden via CSS). Tests: `npm test` (`tests/collision.test.mjs`, needs Node 18+; `package.json` sets `"type": "module"`). Debug hook: `window.__dungey = {stats, player, camera}`. Known gaps: mouse keeps its last position when the cursor leaves the canvas; the far-edge camera clamp (max x/y) is covered by code, not by a browser run; only Chromium tested. Browser checks need a local server (`python3 -m http.server 8099`), allowed by `.claude/settings.json`. M1 is merged into main at 818e17d.

### M2. Playable prototype
**Status:** partial
**Scope:** Projectile firing with a fire rate, one chasing enemy type, health, hit feedback, death, restart. Placeholder squares for art. Scope change after playtest: the standard weapon fires automatically along the aim direction at its own interval, with no fire button. Manual activation is reserved for future special attacks and actions (M6). Second change: enemies start slow and gain speed and HP with run time (stats fixed at spawn). M3 owns the full difficulty curve and its config file. Enemy attacks come later.
**Done when:**
- [x] A 2-minute loop works: move, shoot, kill, die, restart. (Playwright, Chromium 960x540: walked and shot, killed 6 of 6 placed enemies, died to a swarm at HP 0, pressed R and restarted with state reset. No console errors. The run was scripted in seconds rather than played for 2 minutes. Logic also covered by 9 headless tests.)
- [ ] At least 3 outside players have tried it and given a "would play again" signal (`needs human`).
- [x] 60 fps holds with 50 enemies on screen. (Playwright, headless Chromium, 50 enemies alive and firing for 3 s: 60.4 frames/s, 60.1 updates/s. Headless update tick 0.02 to 0.03 ms. Headless Chromium has no GPU, so check a real browser in M9.)

**Risk:** the core loop is not fun. This milestone exists to find out cheaply.
**Handoff:** Layout: new `src/game.js` (DOM-free combat state and rules). Exports `game {state:'playing'|'dead', time, kills, hp, iframes, fireCd, spawnCd, projectiles[], enemies[], rng}`, `resetGame()` (also resets the player to spawn), `spawnEnemy(x,y)`, `enemyStats(time)`, `updateGame(dt)`. Projectiles are `{x,y,vx,vy,life}` in world px; enemies are `{x,y,w,h,vx,vy,hp,speed,flash}` and move with `moveBody`, so they slide on walls but do not path around them (M5). `main.js` update: when dead, only R or Enter calls `resetGame()`; otherwise `updateEntities(dt)` then `updateGame(dt)`. `render.js` draws enemies, bullets, HUD (hearts, kills, time), hurt border, blink during invulnerability and a YOU DIED overlay. Tuning in `config.js`: PLAYER_HP=5, PLAYER_IFRAMES=0.8 s, FIRE_INTERVAL=0.3 s (the standard weapon auto-fires at this interval along `player.angle`; the mouse button does nothing yet, so manual special attacks should be separate actions with their own input), BULLET_SPEED=520, BULLET_LIFE=1.2 s, BULLET_DAMAGE=1, enemy stats set at spawn by `enemyStats(time)`: ENEMY_SPEED_START=55 px/s +0.5 px/s per second up to ENEMY_SPEED_MAX=160 (under the player's 180), ENEMY_HP_START=3 +1 per 60 s (each enemy carries its own `speed`), ENEMY_CONTACT_DAMAGE=1, ENEMY_CAP=50, spawn interval 1.5 s shrinking by 0.01 s per second to 0.4 s, SPAWN_MIN_DIST=320 px. Tests: `npm test` now runs `tests/*.test.mjs` (18 tests, `tests/game.test.mjs` is new). Debug hook: `window.__dungey` adds `game` and `resetGame`. Known gaps: `input.js` only queues keys in `GAME_KEYS`, so any new tap key (for example the restart keys R and Enter, added in the M2 browser check) must be added there; enemy separation is O(n^2), fine at 50 but M3 needs spatial hashing; enemies can snag behind walls; 3 outside players still needed.

### M3. Run structure and difficulty director
**Status:** partial
**Scope:** Run clock, spawn director scaling enemy count and speed, soft cap at 10:00 where scaling turns exponential, score, run summary screen. The director accepts a time offset so a later extension mechanic or "part 2" can hook in.
**Done when:**
- [x] The difficulty curve lives in a config file and tunes without code changes. (`src/difficulty.config.js`; 7 headless tests cover the curve shape, clamps and offset.)
- [ ] A median skilled player dies between minute 8 and 14 in playtests (`needs human`). The curve is a first guess. Parked until M6: the player has no upgrades, so the base weapon (1 damage per 0.3 s) cannot keep pace with enemy HP past about minute 5, and a playtest would measure the missing build system, not the balance. Tune the curve in M6 against a player who scales, then run this check.
- [x] Enemy cap and spatial hashing keep 60 fps past minute 15. (Human check in a real browser with the director fast-forwarded to 15:30: 60 fps, peak 160 enemies. Node update cost at 160 enemies averages 0.2 ms, p99 0.4 to 1.1 ms; the test asserts on p99 because one run hit a 66 ms stall in about 3,600 ticks. Stress, update loop only, no render: 500 enemies avg 1.15 ms, p99 3.0 ms; 1,000 avg 3.5 ms, p99 4.5 ms; 2,000 avg 9.8 ms, p99 15.9 ms.)

**Risk:** balance, and performance when exponential spawning reaches the entity cap.
**Handoff:** Layout: new `src/difficulty.config.js` (`DIFFICULTY`, plain data, the only file to edit when tuning), `src/director.js` (pure: `sampleCurve(curve, t)`, `phaseAt(t)` returns `'ramp'|'overtime'`, `directorAt(t)` returns `{phase, spawnInterval, spawnBatch, cap, speed, hp}`), `src/spatial.js` (`createGrid(worldW, worldH, cell)` returns `{build(list), near(x, y, out)}`; `near` returns indices of entities in the 3x3 cells around a point, so any entity within one cell size is a candidate; `game.js` uses it with cell = TILE for enemy separation and bullet hits). Curve model: each curve is `{start, atSoftCap, growthPerMin, min?, max?}`. Linear from `start` at 0:00 to `atSoftCap` at `softCap` (600 s), then multiplied by `growthPerMin^((t-softCap)/60)`, then clamped. Values: spawnInterval 1.5 to 0.6 s, x0.8 per minute, min 0.12 s; spawnBatch 1 to 2, x1.25, max 6 (floored); enemyCap 20 to 70, x1.15, hard max 160; enemySpeed 55 to 150 px/s, x1.03, max 165 (under the player's 180); enemyHp 3 to 13, x1.35, max 80 (rounded). Score: 1 point per second, plus 10 x the enemy's spawn HP per kill, doubled for kills in overtime. `game.js` changes: `game.timeOffset` (seconds added to the director clock; set it to hook an extension or part 2, `resetGame` zeroes it; the run clock `game.time` is unaffected), `directorTime()` returns `game.time + game.timeOffset`, `game.score`, enemies carry `maxHp`, each spawn wave spawns `spawnBatch` enemies while under the live cap, `enemyStats(time)` now reads the director (same signature), `runSummary()` returns `{time, kills, score, reachedOvertime, overtime}`. `config.js` no longer holds ENEMY_SPEED_*, ENEMY_HP_*, ENEMY_CAP or SPAWN_INTERVAL_*; only ENEMY_SIZE, contact damage, flash, knockback and SPAWN_MIN_DIST remain. `render.js`: HUD shows time, kills and score, a pulsing OVERTIME line after the soft cap, and the death screen is now a summary (survived, kills, score, overtime). Tests: `npm test` runs 26 tests; `tests/director.test.mjs` is new (curve shape, clamps, offset, score, summary, grid vs brute force, scripted fast-forward performance). `tests/game.test.mjs` imports the moved constants from `DIFFICULTY` and two assertions changed: the cap test now checks the live cap curve, and the speed test no longer expects the cap at 10 minutes (speed now ramps to 150 at 10:00 instead of capping at 3.5 minutes). Debug hook: `window.__dungey` adds `spawnEnemy`. Browser fps check (done by a human, passed): in the devtools console run `__dungey.game.timeOffset = 930; __dungey.game.iframes = 1e9; __dungey.game.spawnCd = 0`, wait 2 s, then count requestAnimationFrame frames over 10 s; a real browser gave 60 fps with 160 enemies. To stress past the cap, raise `enemyCap` (start, atSoftCap and max) in `difficulty.config.js`; the Node loop stays under 16.6 ms up to about 2,000 enemies but render cost at that count is unmeasured. Known gaps: the HUD, OVERTIME line and summary screen were not reviewed on their own (only the fps run touched them); balance is untested, so expect to retune HP and spawn growth after the first playtest; the speed max (165) sits close to the player's 180, so late enemies are hard to kite while the player is also shooting; separation and bullet hits use the hash but `updateDamage` and enemy chase are still linear per enemy (fine at 160); enemies still snag behind walls (M5); 3 outside players still needed for M2.

### M4. Procedural floors
**Status:** partial
**Scope:** Seeded RNG, room-and-corridor generator, guaranteed connectivity, exits or stairs, floor transitions.
**Done when:**
- [x] 1,000 generated seeds all pass a connectivity check. (`tests/floorgen.test.mjs`: seeds 0 to 999. Spawn, exit and every room reachable, no unreachable floor tile, border solid, exit at least 28 steps away, spawn and enemy spawn bodies clear of walls using the real `overlapsWall`.)
- [x] The same seed always produces the same floor. (`deepEqual` on the whole floor object for six seeds, 990+ distinct layouts across 1,000 seeds, and a run seed reproduces floor n.)
- [ ] Layouts give cover and open fire lanes for ranged combat. `needs human`: the proxy tests pass (see Handoff) but they cannot judge whether sight lines feel good. Review with `node scripts/dump-floor.mjs <seed>` or in the browser with `?seed=<n>`, then tick.
- [ ] Browser pass of the new HUD, exit tile and floor transition. `needs human`: this session could not launch a local server for Playwright (blocked by the permission classifier), so `render.js` and `main.js` changes are only syntax-checked (`node --check`). Open the page, walk onto the blue stairs tile and confirm the floor changes with time, score, kills and HP intact.

**Risk:** valid but dull layouts, or layouts that cut sight lines badly for shooting.
**Handoff:** Layout: new `src/rng.js` (`createRng(seed)` mulberry32 returning `{next, int(n), range(lo,hi), chance(p), pick(arr)}`, `mixSeed(a,b)`, `floorSeed(runSeed, n)`, `parseSeed(v)` turns a number, digit string or any text into a uint32, `hashString`), `src/floorgen.config.js` (`FLOOR`, plain data: leaf and room sizes, corridor width, loop chance, cover styles and shapes, the quality gate), `src/floorgen.js` (pure, DOM-free). `generateFloor(seed)` returns `{seed, attempt, quality, width, height, tiles: string[] of '#'/'.', rooms: [{x,y,w,h,cx,cy,style}], links: [[i,j]], spawnRoom, exitRoom, spawn:{tx,ty}, exit:{tx,ty}, enemySpawns: [[tx,ty]]}`. Analysis exports used by tests and the gate: `connectivityReport`, `qualityReport`, `floorMetrics`, `snagReport`, `distanceField`, `longestLane`. `config.js` adds `MAP_W=48`, `MAP_H=32`; every floor is 48x32, so `mapWidth`, `mapHeight`, camera clamp and the spatial grid are unchanged. `map.js` keeps `map`, `mapWidth`, `mapHeight`, `isFloor` and adds `loadTiles(rows)` (overwrites the live `map` in place), `loadArena()`, `ARENA_ROWS`, `ARENA_SPAWN`; the hand-built 48x32 layout is now the "arena", kept for collision and combat tests. `collision.js`, `camera.js`, `render.js` needed no change to read the map. `game.js` adds `game.seed`, `game.floor` (1-based), `game.layout` (the current floor object; `exit` is null in the arena), `descend()`, and `resetGame({seed, arena})`: with no args it rolls a random seed and generates floor 1; `{seed}` fixes it; `{arena: true}` loads the hand-built map. Floor n uses `floorSeed(game.seed, n)`, so one run seed reproduces every floor. A floor change (`descend()`, or the player's centre tile equals `layout.exit` inside `updateGame`) replaces the map, moves the player to the new spawn and clears enemies and projectiles; `game.time`, `timeOffset`, score, kills, HP, iframes, fire and spawn cooldowns are untouched. Enemy spawns now pick from `layout.enemySpawns` (room tiles whose eight neighbours are floor, outside the spawn room, more than 3 tiles from the exit), still at least SPAWN_MIN_DIST from the player. `main.js`: `startRun(seed)` logs `Dungey run seed N`; the URL `?seed=N` (a number or any text) fixes the first run, and R or Enter after death rolls a new random seed. `render.js`: HUD shows `Floor N   Seed S` top right; the exit is a pulsing blue tile with a down arrow. `scripts/dump-floor.mjs <seed> [floor]` prints a floor as ASCII (S spawn, E exit) with its metrics. Tests: `npm test` runs 39 tests; `tests/floorgen.test.mjs` is new (13 tests), and `tests/game.test.mjs` and `tests/director.test.mjs` now call `resetGame({ arena: true })` because they place entities by hand-built coordinates. Method: BSP split into 5 to 10 rooms (one per leaf, 1-tile margin), Prim minimum spanning tree plus a second link for any room with one, extra loop links between near rooms, 2-wide L-shaped corridors between random points in linked rooms, spawn room random, exit room is the room farthest by walking distance (at least 28 tiles), then cover, then validation. A layout that fails validation is discarded and the next attempt seed (`mixSeed(seed, attempt)`) is tried, up to 60; across seeds 0 to 999 the median is 0 retries, p95 3, max 9, and all 1,000 pass the gate (`floor.quality`). Cover blocks (rectangles up to 4x3 or 5x1) sit flush against a room wall or at least 2 tiles from it, at least 2 tiles from each other, never on corridor tiles or within 2 tiles of spawn or exit. Layout rules added for enemy snagging until M5: every corridor links two rooms (no dead-end corridors), every room has at least two links, corridors are 2 tiles wide, and `snagReport` must show zero dead-end tiles (floor with at most one floor neighbour), zero 1-wide passages (walls on opposite sides) and zero diagonal pinches. Enemies can still snag on cover blocks and wall corners; M5 owns pathfinding. Cover and fire-lane proxy (the gate and the tests use the same functions): per room, `lane` is the longest run of floor tiles along any row or column of the room rectangle, `cover` is the wall tiles inside the rectangle. A floor passes when at least 75% of rooms have a lane of 7 or more tiles, at most 25% of rooms have no cover, no room has more than 22% of its area as cover, and at least one room has cover. Why: rooms are at least 7 wide, so a lane test mainly proves cover does not fill every row; the real shaping comes from the open-room cap (cover exists) and the clutter cap (lanes survive). Measured over 1,000 seeds: 6,276 rooms, 100% have a 7+ lane, 6.6% are open, mean cover 10.6%, worst room 21.9%. Limits: the lane metric uses axis-aligned runs only and does not measure line of sight at other angles, and the gate shares its code with the tests, so a human should judge sight lines. Tuning: all in `floorgen.config.js` (styles weights and densities, `laneMin`, `maxClutter`). Known gaps: browser check not run (see done-when); the exit is always active, with no kill requirement or key; floors are always 48x32 and do not grow with depth; difficulty does not change with floor number; the exit tile looks the same in every theme until M7; layouts are valid but the corridor and room shapes are plain rectangles, so variety comes from room sizes and cover.

### M5. Enemy roster and boss
**Status:** todo
**Scope:** 4 to 5 enemy types (chaser, shooter, swarmer, tank, summoner), one boss, simple behaviour states.
**Done when:**
- [ ] Each enemy type demands a different player response.
- [ ] The boss has at least 2 phases and a clear tell for each attack.
- [ ] Enemies path around walls without freezing.

**Risk:** pathfinding cost with many enemies. A flow field is the likely fix.
**Handoff:**

### M6. Roguelike build depth
**Status:** todo
**Scope:** Weapon types, level-up or pickup choices (pick 1 of 3), passive items, a handful of synergies, permadeath.
**Done when:**
- [ ] At least 3 weapons and 12 upgrades work.
- [ ] Two runs rarely play the same.
- [ ] No single upgrade path trivialises the 10-minute mark.

**Risk:** balance and scope creep. The easiest place to overbuild.
**Handoff:**

### M7. Art, audio and the gothic shift
**Status:** todo
**Scope:** Sprite atlas and asset loader, tileset, character and enemy sprites, WebAudio effects and music, screen shake, hit flashes. Palette, tiles and music shift from classic fantasy to gothic as time or depth increases.
**Done when:**
- [ ] No placeholder squares remain.
- [ ] The visual shift is noticeable by minute 6 to 8.
- [ ] Every asset's origin (generated, with the generating prompt or script) is recorded in the repo.
- [ ] Total asset size is under 10 MB.

**Risk:** style consistency across generated assets. Fix the palette, tile size and sprite size before generating anything.
**Handoff:**

### M8. Menus, onboarding and persistence
**Status:** todo
**Scope:** Title screen, how-to-play, settings (volume, fullscreen), local high score and run history in `localStorage`.
**Done when:**
- [ ] A new player understands the controls in under 30 seconds (`needs human`).
- [ ] Scores persist across reloads and fail gracefully when storage is blocked.

**Risk:** `localStorage` is blocked in some itch.io embed contexts.
**Handoff:**

### M9. Hardening
**Status:** todo
**Scope:** Browser testing (Chrome, Firefox, Safari), audio unlock on first input, iframe and fullscreen behaviour, error handling, profiling, tab-visibility handling.
**Done when:**
- [ ] No console errors in a 20-minute soak run on 3 browsers.
- [ ] The game works inside an itch.io iframe at the chosen embed size.
- [ ] Memory stays flat across 5 consecutive runs.

**Risk:** Safari audio and fullscreen quirks.
**Handoff:**

### M10. Packaging and publish
**Status:** todo
**Scope:** Build script that outputs `dungey.zip` with `index.html` at the root and relative paths only, with optional minification. itch.io page: title, cover image (630x500), screenshots, GIF, description, tags, controls text, embed size. Upload through the web UI or `butler`. Devlog post.
**Done when:**
- [ ] The zip uploads and plays from a private itch.io draft link.
- [ ] Cold load takes under 5 seconds on a typical connection.
- [ ] The page has a cover, 3 or more screenshots and a controls section.
- [ ] The page is public and a link is shared for feedback.

**Risk:** path or case-sensitivity bugs that pass locally and fail on itch.io's host. Test from the draft link, not from a local server.
**Handoff:**

## Out of scope for v1

- Global leaderboard (needs separate hosting).
- Extended-time mechanic or "part 2".
- Mobile and touch controls.
- Gamepad support.
