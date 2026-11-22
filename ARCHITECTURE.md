# Pawgger — Architecture & Contracts

Binding contract for all modules. If your module disagrees with it, your module is wrong. If the contract is wrong or ambiguous, do the sensible thing and record the deviation and "Requests" in your report (`docs/swarm/reports/<id>.md`). Shared numbers live in `src/core/defs.js` (read it first; grep it, do not duplicate its numbers).

## 1. Vision
**Pawgger** is a loving parody of Konami/Sega's *Frogger* (1981) in the KÄSEKRIEG universe. **Colby** (SuperColby: orange tabby, blue shirt, red/yellow C shield, orange cape) must hop home across **Perring Parkway**, a five-lane road that belongs to **Perring Parkway Pete** (feral vested rat, red eyes, tactical vest), then across a five-lane jungle river of logs, turtles and crocodiles, into five home bays. The traffic is Pete's: Pickles delivery trucks, a tuna-can bus, runaway cheese wheels, and Pete's own limo that honks. From level 3 Pete throws a cheese roller across the safe median.
Pillars: (1) **faithful, readable Frogger mechanics**: fixed screen, one hop per press, carry on platforms, dive-cycling turtles, five bays, timer, three lives; (2) **blocky 8-bit look at 240x256** with a locked palette (`PAL`) and an optional CRT filter; the sky cycles **day, golden hour, dusk, night, then repeats every 5 levels** (headlights glow at night); (3) **charm and juice** (cat puns, Pete taunts, screen shake, splashes, popups); (4) **zero assets, zero deps**: all art drawn by code into `PixBuf`s, all audio synthesised (WebAudio live + pure-JS offline PCM), plain ES modules.
Rules: original art only; sim randomness only from a seeded `createRng` (never `Math.random`; word comments carefully, source-scan tests grep for it); sim, levels, art and audio-render code must run in Node (no DOM at import time); touch only files you own (§3); never edit frozen files.
Style: `top-down-arcade` camera and grid movement with the 8-bit palette and CRT conventions of `retro-8bit-sidescroller`, `jungle` theme; departures are recorded in `config/style.json`.

## 2. Canonical data
`src/core/defs.js`: `W,H` (240x256), `CELL=16`, `COLS=15`, `ROWS=16`, `ROW` (row map), `BAY_COLS`, `colX(col)`, `rowY(row)`, `PAL`, `skyFor/skyForLevel/isNight`, `TUNING`, `attemptTimeFor(level)`, `speedScale(level)`, `SCORES`, `KINDS` (road and river item types), `itemW`, `itemLeft(lane,item,t)`, `turtleState`, `crocMouth`, `bayHazardOn`, `bayBonusOn`, state/death/event/sfx/music name lists, and the `ART` manifest (`node tools/sheet.mjs <module>` validates art against it).
Coordinates: x right, y down, logical pixels, origin top-left. The frog and every sprite are **centred** in their 16x16 cell (not feet-anchored; the view is top-down). Row `r` occupies y `r*16 .. r*16+15`.

### Screen layout (rows of 16 px)
```
 0  HUD top: 1UP score, HI score                      (UI)
 1  home bays: 5 bays at BAY_COLS 1,4,7,10,13, hedge between (a hop into hedge = death)
 2-6  river lanes (5)   logs, turtles, crocodiles; open water = death; carried off screen = death
 7  median (safe grass); Pete's cheese roller can cross it from level 3
 8-12 road lanes (5)   any vehicle contact = death
13  start strip (safe); frog starts at col 7
14-15 HUD bottom: lives, time bar, level, messages      (UI)
```

## 3. Layout and ownership
```
index.html style.css src/main.js         ui-shell
src/core/{defs,rng,events,settings}.js   FROZEN (TUNING numbers editable by sim-core)
src/core/input.js                        ui-shell (adapt to the hop input of §4; hold-to-repeat off)
src/art/pixbuf.js, src/ui/font.js        FROZEN
src/art/{colby,vehicles,river,world,fx}.js   one art agent each (export build())
src/art/registry.js                      render
src/render/{renderer,scene,background,particles,crt}.js   render
src/sim/{game,frog,lanes,collide}.js     sim-core        src/sim/pete.js  sim-pete
src/sim/autopilot.js                     qa-bot
src/levels/lanegen.js                    lane-gen        tools/validate-level.mjs  lane-gen
src/audio/{audio,sfx}.js                 audio-sfx       src/audio/music.js  audio-music
src/ui/{hud,screens,menus,touch}.js      ui-shell
tools/botplay.mjs                        qa-bot
```
Tests: `test/<id>.test.mjs` (node:test, `npm test`). Previews and screens go to `out/`. Tracker events go through `tools/swarm-tracker/bin/track.mjs`. Possible factory contributions are staged under `proposed/` inside this repo (see §12), never into `../game-factory`.

## 4. Simulation API (`src/sim/game.js`, owner sim-core)
```js
import { createGame } from './sim/game.js';
const g = createGame({ seed = 1, bus, level = 1, levelAt });   // levelAt(level, seed) -> LevelDef, injected (= levels/lanegen.js generateLevel)
g.update(dt, input);        // fixed step 1/60 (dt <= 1/30). input = { hop: null | 'up' | 'down' | 'left' | 'right' }
```
`input.hop` is an **edge**: the input module latches a press and keeps it until a sim step consumes it (one hop per press, never lost on a zero-step frame, never repeated while held). The sim accepts it when the frog is `idle` or `ride`; during a hop it keeps one buffered hop for `TUNING.hopBuffer` seconds.

Read-only state for render, UI and bots: `g.t` (sim seconds since this level started), `g.state` ('intro'|'play'|'dying'|'levelclear'|'gameover'), `g.level`, `g.def` (LevelDef), `g.lanes` (= `g.def.lanes` indexed by row, `undefined` for non-lane rows), `g.score`, `g.hi`, `g.lives`, `g.timeLeft`, `g.timeLimit`, `g.maxRow` (furthest row this attempt), `g.frog`, `g.bays`, `g.pete`, `g.pickups` (Set of item ids collected this level), `g.rng`, `g.bus`, `g.stats` ({hops, deaths, baysFilled, levels}).
Item positions are a pure function: `itemLeft(lane, item, g.t)`. There is no per-item state in the sim, so the renderer, the validator and the bot all compute the same positions.

`g.frog = { x, row, col, face, mode, pose, frame, hopT, fromRow, onItem, inv, death }` (defs.js has the full shape). **`pose` and `frame` are what render draws**, set in the same function that changes `mode`: pose in `up|down|side|drown|squash|home` selecting `colby_<pose>`; side poses are mirrored by `face === 'left'`.

Engine hooks (sim-core implements; sim-pete and the UI call):
`g.kill(reason)` (reason in `DEATHS`, no-op while `inv > 0` or already dying), `g.addScore(n, why)`, `g.sfx(name, x?, y?)`, `g.fx(type, x, y, opts?)`, `g.popup(text, x, y, color?)`, `g.taunt(text)`.
Example calls: `g.kill('roller')`, `g.sfx('honk', 120, 144)`, `g.fx('splash', frog.x, rowY(frog.row))`.

**Rules (sim-core):**
- **Hop.** One press moves the frog one cell: up/down change `row` by 1 (clamped to rows 1..13), left/right move `x` by `CELL` (clamped to `[8, W-8]`). The new position is applied at hop start (`mode:'hop'`, `hopT` 0 to 1 over `hopTime`); death and support are evaluated when the hop ends. `pose` becomes the facing pose with frame 1 at hop start and frame 2 for the landing tick. Emit `hop`, `sfx hop` (`hop_log` when landing on a platform). A hop onto the frog's own row is only horizontal.
- **Forward score.** The first time the frog ends a hop on a row above `g.maxRow` this attempt, `+SCORES.forwardRow`, emit `row`, `sfx row_up`. `maxRow` resets with each new frog.
- **Road rows (8..12).** At the end of a hop, and every tick while idle or riding, the frog dies (`'car'`) if its hitbox (`frogHalf` square around `x`, row centre) overlaps any item rect of the lane in that row (rect = `[left+inset, left+w-inset]`). While hopping between two road rows, test both rows at the end of the hop only.
- **River rows (2..6).** The frog must be supported. Support = an item in that row with `supports(item, t)` and `frog.x` within `[left+supportInset, left+w-supportInset]`. `supports`: logs always; turtles unless `turtleState === 'down'`; the croc back (first 3 cells in travel direction) always, the head cell only while `crocMouth === 'closed'` (open mouth = lethal `'croc'`). No support = `'water'`. A frog standing on a turtle that goes `'down'` dies `'turtle'`. Riding: while `onItem`, `x += lane.dir * lane.speed * dt`; carried beyond `[-edgeDeath, W+edgeDeath]` = `'offscreen'`. Landing on a platform sets `onItem`; a sideways hop keeps riding; hopping up or down re-evaluates on the new row.
- **Bay row (1).** Hopping up from row 2 to row 1 resolves at hop end: if `|x - nearest bay centre| <= bayReach` and that bay is empty and has no active hazard: bay filled (`bay` event, `+SCORES.bay`, `+timeLeft * bayTimePerSec`, bonus mouse/fish if visible), the frog becomes `home` and a new frog spawns. A bay with an active hazard (`bayHazardOn`) kills (`'croc'` or `'snake'`); a filled bay or hedge kills (`'hedge'`). Filling all 5 = `levelclear` (`+SCORES.allBays`, `levelclear` event, music sting), then level+1 after `clearTime`.
- **Median, start (7, 13).** Safe. Rows 7 and 13 have no items; Pete's roller (sim-pete) is the one exception.
- **Timer.** `timeLeft` counts down only in `play`; `timeLeft <= 0` kills `'timeout'`. Emit `timer` each second, `sfx tick_low` in the last 6 s.
- **Death.** `dying` for `deathTime` (pose drown for water, squash for car/roller, per `death`), lose a life (`life` event), then if `lives > 0` respawn a new frog at (`START_COL`, `START_ROW`) with `respawnInvuln`, `timeLeft = timeLimit`; else `gameover`. The level state (filled bays) persists across deaths.
- **Extra life** when the score first passes `EXTRA_LIFE_AT` (`oneup` sfx, popup `1UP`).
- **Pickups.** `LaneItem.pickup` is collected when the frog stands on (rides) or overlaps the item; `+SCORES.treasure[type]`, `pickup` event; once per item id per level.
- **Intro.** `intro` for `introTime`, banner `LEVEL n`, then `play`. Music via `musicForLevel(level)`.
- **Determinism.** `createGame({seed, level})` plus an identical input sequence gives identical state (tests assert it).

## 5. Pete (`src/sim/pete.js`, owner sim-pete)
`export function createPete(g) -> { update(dt), reset() }`; sim-core calls `pete.update(dt)` every `play` tick and keeps the result in `g.pete`. From `peteFromLevel`: every `pete.tauntEvery` s emit `g.taunt(text)` (cat puns from a `TAUNTS` list in your module) and `sfx pete_laugh`. The limo is an ordinary lane item (`type:'limo'`, generated by lane-gen); sim-pete emits `sfx honk` when the limo's left edge enters the screen (positions from `itemLeft`). From `peteRollerFromLevel` he throws a **cheese roller**: `rollerWarn` seconds of `state:'rollerWarn'` (render draws `roller_warn` at the entry edge of median row 7, sfx `roller_warn`), then `state:'roller'` where `g.pete.rollerX` moves at `rollerSpeed * dir` across row 7 (sfx `roller_rumble`); a frog in row 7 whose hitbox overlaps it dies `'roller'`. Interval `rollerEvery * 0.92^(level-3)`, minimum 4 s; a roller never starts while the frog is mid-hop into row 7 (it waits one step). Pure function of (state, dt, g.rng).

## 6. Level API (`src/levels/lanegen.js`, owner lane-gen)
`generateLevel(level, seed = 1) -> LevelDef` (shape in defs.js), deterministic, memoisable, `levelAt = generateLevel`. Rules:
- Rows 2..6 are river lanes, 8..12 road lanes; row 7 and 13 are `safe`. Directions alternate by row (random starting direction from the seed), speeds `TUNING.roadSpeed/riverSpeed[i] * speedScale(level)` jittered +-12% by the seeded rng, never above `speedCap` x base.
- Each lane has `loop` a multiple of `CELL`, `>= W + MAX_ITEM_W`, and `off` values multiples of `CELL`. Items of a lane never overlap on the loop. Road lanes mix `ROAD_KINDS` (density rises with level; the fastest lane may use `racer`); the Pete limo and `pickle_truck` appear from level 2; `cheese_roll` from level 3; `tuna_bus` in a slow lane. River lanes alternate logs and turtles (`turtle2`/`turtle3`), with `croc` from level 2; turtle `phase` is **staggered** so no two neighbouring groups dive together; croc `phase` varies.
- Bays: `hazards` (croc, snake) on up to `min(2, level-1)` bays, `bonuses` (mouse, fish) on up to 2 other bays, with distinct `phase` values so they are never all active together.
- Pickups: at most 3 per level on river platforms, never on a turtle or croc.
- `pete`: null for level 1, otherwise `{ limoLane, tauntEvery, roller, rollerEvery }`.
- **Fairness (`tools/validate-level.mjs`, derived from the same numbers as the sim, not duplicates).** For each level 1..N and seeds 1..K it searches over `(row, x, time)` with the real support and collision predicates, where the frog may wait, hop up, down or sideways, and proves: (a) a safe crossing of the road exists from row 13 to row 7; (b) a safe crossing of the river exists from row 7 into **each** open bay, including a path that waits on a platform for a moment; (c) no river lane has a gap of open water wider than 2 cells that persists (so a hop of one cell can always reach a platform within one cycle); (d) turtle dive phases are staggered; (e) the level is deterministic and a different seed gives a different level; (f) the time limit allows the shortest crossing with at least 40% slack. Retuning any speed in `defs.js` must keep these green or fail loudly.

## 7. Art and render
### 7.1 Art API (`src/art/<module>.js`)
`export function build() -> { [name]: PixBuf | PixBuf[] }` exactly matching the `ART` rows of that module (size, frame count). Pure and deterministic (`createRng(seed)`, `hash2`); each module builds in <= 400 ms. Use `PixBuf` (see `src/art/pixbuf.js`). Style: blocky Atari-meets-NES, **1 px dark outline (`PAL.outline`) on characters and vehicles**, 3-4 tone ramps built from `PAL`, light from the upper left, readable at 1x, no anti-aliasing, no gradients except dithering. Keep art inside a 1 px margin so outlines fit. Vehicles and animals face RIGHT. Seamless lanes: tiles are seamless in x so the renderer can tile them; `tile_water` must tile in both axes. Colby must look like the library Colby (`bsommers/pawfall-assets`): orange tabby, green eyes, blue shirt, C shield, orange cape, seen from above. Validate with `node tools/sheet.mjs <module> --scale 6` and view `out/previews/<module>.png`; measure bounding boxes numerically; iterate at least twice.
### 7.2 Registry (`src/art/registry.js`, render)
`buildAll() -> { get(name, frame = 0), size(name), frames(name), names() }`, Node-safe (PixBufs without a DOM).
### 7.3 Renderer (`src/render/renderer.js`, render)
`createRenderer(canvas, { bus, art, settings }) -> { draw(game, alpha), resize(), setCRT(on), shot() }`. Draws at 240x256 into an offscreen buffer, integer-scales (pixelated) to fill the window, letterboxed black. `renderer.hud = fn(ctx, game)` and `renderer.overlay = fn(ctx)` callbacks are set by ui-shell.
Painter order: sky bands + sun/moon + stars (behind the HUD-top skyline) -> skyline and jungle strip -> bank row 1 + bays (`bay_empty`/`bay_filled`, hazards and bonuses from `g.bays`) + hedge -> river tiles (`tile_water` frame `floor(t*4)%4`, scrolling per row is not needed) -> river items (logs, turtles one sprite per cell with the dive frame from `turtleState`, croc frame from `crocMouth`; mirrored when `dir < 0`; each item drawn at `itemLeft`) -> pickups -> median + lamps (night) -> road tiles (+ lane lines) -> road items (+ `headlight` glow at night) -> Pete's roller and its warning (from `g.pete`) -> frog (pose/frame from state, blinks when `inv > 0`, hop arc: sprite lifts by `sin(pi*hopT)*3` px) -> particles from the bus (splash, dust, sparkle, squash, ripple, confetti, popups) -> night overlay -> screen shake -> optional CRT scanlines and vignette -> HUD callback -> overlay callback. Render is a pure function of game state plus time; static layers are cached per sky key. Provide `render/scene.js` `drawStatic(ctx, art, level, t)` for the title screen and the shot tool.

## 8. Events
`bus.emit(type, payload)` per `defs.EVENTS`. Sim emits; render, audio and UI subscribe at construction time. Audio listens to `sfx` and `music` only.

## 9. Audio (`src/audio/*`)
`audio.js` (audio-sfx): `createAudio(bus, settings) -> { unlock(), setVolume(master,sfx,music), setMute(on), dispose() }`; WebAudio context created lazily on the first user gesture; subscribes to `sfx {name}` and `music {name}`. `sfx.js` (audio-sfx): `SFX_NAMES`, `describe(name) -> voices[]` (pure data), `schedule(ctx,dest,voices,t0,opts)` (live), `renderSfx(name, sr=44100) -> Float32Array`, `stats(pcm) -> {peak,rms,len}`; `node tools/sfx-wav.mjs` writes `out/sfx/<name>.wav`. `music.js` (audio-music): `createMusic(ctx,dest) -> { play(name|null), stop() }`, `renderMusic(name, sr, seconds)`, `MUSIC_NAMES`; `node tools/music-wav.mjs`. Chiptune character: square/triangle/noise; **level_day** a bouncy marimba-style arpeggio in C major ~140 bpm, **level_dusk** the same slowed and minor-tinged, **level_night** sparse and tense with a driving bass, **title** a heroic jingle with a cheeky Pete tuba motif, stings for `levelclear` and `gameover`. SFX are short, punchy (peak <= 1.0, 20 ms attack/release). Every name in `defs.SFX` and `defs.MUSIC` must exist. Audio is checked by numbers only (no audio device); say so in the report.

## 10. UI shell (`src/main.js`, `src/ui/*`, `src/core/input.js`, owner ui-shell)
`main.js` boots art registry, audio, bus, renderer, game; fixed-timestep loop (accumulator 1/60, max 5 steps); resize, pause (Esc/P), mute (M), CRT (C), fullscreen (F), settings persistence. Query params: `autostart=1`, `level=N`, `seed=N`, `bot=1`, `time=SECONDS` (override timeLeft), `nosound=1`, `poll`. `window.__pawgger = { game, renderer, bus, step(n), setInput }` for the shot and QA tools.
Controls: arrows or WASD to hop, Space to start and confirm, P pause, plus touch overlay (d-pad of four `touch_btn` + `touch_arrow`). Screens: **title** (logo, attract mode driven by the autopilot over `title_scene`, "PRESS SPACE", hi-scores, options), **intro banner**, **HUD** (top: 1UP score, HI; bottom: `colby_life` icons, time bar that turns red under 6 s, `LEVEL n`, Pete taunt banner with `pete_head`), **pause**, **game over** (score, level, 3-letter name entry, hi-score table), **level clear** (Colby cheering in the bays, tally), **how to play**. All UI is drawn into the 240x256 buffer through `src/ui/font.js`.

## 11. Verification tools
`tools/serve.mjs` (static, port 4871), `tools/shot.mjs`, `tools/sheet.mjs`, `tools/check-imports.mjs`, `tools/validate-level.mjs`, `tools/botplay.mjs` (autopilot over levels: bays, deaths, time), `tools/sfx-wav.mjs`, `tools/music-wav.mjs`, `tools/build-web.mjs`, `tools/smoke_web.sh`, `node --test test/*.test.mjs`. The tracker runs on **port 4870**.
Autopilot (`src/sim/autopilot.js`, qa-bot): `createAutopilot(game, { skill = 1, seed }) -> { step(dt) -> input }`. It looks ahead by calling the real `itemLeft`/support/collision predicates over the next ~1.5 s, has a no-progress watchdog, and a `skill` knob (0..1) for reaction noise. Entry point for the UI attract mode: `autopilot.step(dt)` returns the `input` for this tick.

## 12. Factory contribution (this build)
No edits to `../game-factory` (another session has uncommitted work there). Candidates are staged under `proposed/` in this repo: `proposed/new/<path>` for new files, `proposed/<original path>.proposed` for modified ones, with a single log `proposed/CHANGELOG-PAWGGER.md` (entry id, file, NEW or MODIFIES, why, how used, how to adopt, tests). Likely candidates: a `grid-hop` module (hop, carry, lanes as pure functions of time), a lane generator with a fairness validator, vehicle/log/turtle art recipes, SFX recipes, and the template `collision3d`/`bvh` test path fix (see CHANGELOG). Nothing is applied without review.

## 13. Conventions that bit us before
`*/` inside a block comment ends it; use `//` notes. Numbers via `??` not `||`. Subscribe to events at construction. Pin conventions (axes, centre anchor, frame semantics) in tests. Never write shared `out/` files from tests (use temp dirs). Look at art at x6 and measure bounding boxes. Seamless lanes need the period (loop) to be a multiple of the tile width. Stagger cycling hazards. Set `pose`/`frame` where `mode` changes. Poll input once per frame and carry edges. No `Math.random` in the sim.

## Status addendum

12 levels are validated (`node tools/validate-level.mjs --levels 12 --seeds 8`) and bot-cleared (`node tools/botplay.mjs --levels 12 --seeds 4`). Touch controls live in `src/ui/touch.js`. Persistence uses `localStorage` keys `pawgger2.hi` and `pawgger2.settings` (`src/core/settings.js`). `npm test` runs 277 tests (2 skip by design). Pages: https://bsommers.github.io/pawgger2/ (game at `/play/`), brand assets in `assets/brand/`.
