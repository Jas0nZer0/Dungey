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
| Resolution and embed size | 960x540 (16:9) | M0, M7, M10 |
| Art source | Licensed pixel-art pack, license recorded per asset | M7 |
| Input | Keyboard and mouse only. Gamepad deferred | M1, M8 |
| M4 position | Before M5. Move after M6 if you want build depth first | M4, M5, M6 |

## Milestones

### M0. Foundations
**Status:** todo
**Scope:** Split `src/main.js` into modules (input, loop, map, entities, render). Add a fixed-timestep update loop, mouse and keyboard input, canvas scaling, pause.
**Done when:**
- [ ] Update runs at a fixed 60 Hz independent of display refresh rate.
- [ ] Canvas scales cleanly when the window resizes.
- [ ] Pause works on `Esc` and on tab blur.
- [ ] Visible behaviour matches the scaffold.

**Risk:** refactor sprawl. Restructure only. Add no features.
**Handoff:**

### M1. Twin-stick movement
**Status:** todo
**Scope:** WASD movement with velocity, mouse aim, axis-separated AABB tile collision, camera follow, a map larger than one screen.
**Done when:**
- [ ] Player slides along walls with no snagging on corners.
- [ ] Player cannot tunnel through walls at any speed.
- [ ] Crosshair and facing indicator track the mouse.

**Risk:** collision feel. Corner snagging is the usual failure.
**Handoff:**

### M2. Playable prototype
**Status:** todo
**Scope:** Projectile firing with a fire rate, one chasing enemy type, health, hit feedback, death, restart. Placeholder squares for art.
**Done when:**
- [ ] A 2-minute loop works: move, shoot, kill, die, restart.
- [ ] At least 3 outside players have tried it and given a "would play again" signal (`needs human`).
- [ ] 60 fps holds with 50 enemies on screen.

**Risk:** the core loop is not fun. This milestone exists to find out cheaply.
**Handoff:**

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
- [ ] Every asset has a recorded license or author in the repo.
- [ ] Total asset size is under 10 MB.

**Risk:** asset licensing, and style consistency across mixed sources.
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
