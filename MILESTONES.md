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
**Status:** todo
**Scope:** Run clock, spawn director scaling enemy count and speed, soft cap at 10:00 where scaling turns exponential, score, run summary screen. The director accepts a time offset so a later extension mechanic or "part 2" can hook in.
**Done when:**
- [ ] The difficulty curve lives in a config file and tunes without code changes.
- [ ] A median skilled player dies between minute 8 and 14 in playtests (`needs human`).
- [ ] Enemy cap and spatial hashing keep 60 fps past minute 15.

**Risk:** balance, and performance when exponential spawning reaches the entity cap.
**Handoff:**

### M4. Procedural floors
**Status:** todo
**Scope:** Seeded RNG, room-and-corridor generator, guaranteed connectivity, exits or stairs, floor transitions.
**Done when:**
- [ ] 1,000 generated seeds all pass a connectivity check.
- [ ] The same seed always produces the same floor.
- [ ] Layouts give cover and open fire lanes for ranged combat.

**Risk:** valid but dull layouts, or layouts that cut sight lines badly for shooting.
**Handoff:**

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
