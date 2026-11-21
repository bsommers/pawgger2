# Swarm manifest — Pawgger

Single source of truth for the agent swarm. `node <tracker>/bin/swarm-plan.mjs` turns this file into
`docs/swarm/prompts/<id>.md` (preamble + task + role appendix) and `.tracker/plan.json`.
Agent header: `## id | model | phase | role | Name`, then an `owns:` line, then the task.
Spawn each agent with: "Read {{root}}/docs/swarm/prompts/<id>.md and execute it exactly."

## @meta
project: Pawgger
tagline: Colby hops home across Perring Parkway and the jungle river: a Frogger parody

## @preamble
You are subagent `{{id}}` ({{name}}) in a parallel swarm building **Pawgger** in `{{root}}`. Model tier: {{model}}.

Rules:
1. `ARCHITECTURE.md` (and any shared definitions file) is the binding contract. Read only what your task needs: list the
   sections (`grep -n '^## ' ARCHITECTURE.md`), Read those with offset/limit, grep shared files instead of reading them whole.
2. You own ONLY: {{owns}}. Besides those you may write your tests under `test/`, your report, and scratch output.
   Other agents are writing other modules **right now**: their files may be missing or half-written. Code against the
   contract, guard with fallbacks, never edit a file you do not own; list what you need under "Requests" in your report.
3. Progress reporting (drives a live dashboard): first `node <tracker>/bin/track.mjs {{id}} start "<plan in a few words>"`;
   then `track.mjs {{id}} progress <pct> "<what just landed>"` at 4 or more milestones; finally
   `track.mjs {{id}} done "<one-line result>"` (or `blocked` / `failed` with the reason). Run from {{root}} or set TRACKER_ROOT.
4. Verify for real before claiming done: run it, test it, look at it. Report failures honestly.
5. If you must wait for another agent's file, poll (`for i in $(seq 90); do [ -f <path> ] && break; sleep 10; done`),
   then proceed with a fallback if it still is not there.
6. Finish by writing `docs/swarm/reports/{{id}}.md` with sections: **What I built** · **Verification evidence** ·
   **Deviations from the contract** · **Mistakes I made and how I fixed them** · **Learnings for a future agent** ·
   **Requests for other modules**. Report shared-library defects here too, do not only work around them.
7. Keep chat output minimal (status lines only). Final reply: 8 lines max.
8. Save work to disk early and often; the swarm can be interrupted by usage limits. If your owned files already exist,
   you are RESUMING: inspect them and continue instead of starting over.
9. Install no new dependencies. No git commands unless told. Never kill processes you did not start.
10. Context budget — your whole context is re-sent on every tool call, so keep it small: read files with offset/limit
    or grep, never whole large files; pipe command output through `tail`/`grep` (40 lines max); look at an image only
    when you will act on it (about 6 in total; prefer numeric checks); never re-read a file you just wrote.
11. Checkpoints — keep `docs/swarm/progress/{{id}}.md` (30 lines max: **Done** · **Next steps, in order** ·
    **Gotchas** · **Commands to verify**) and update it at every milestone. If it exists when you start, you are a fresh
    agent continuing the job: read it first, trust it, do not re-derive. After about 25 tool calls, or at a milestone with
    substantial work left, update the checkpoint and END your turn with a last line `CONTINUE: <next step>`. Only write
    the report and call `track.mjs ... done` when the whole task is finished.
12. Stamp times with `date -u`; never type a timestamp.

Your task:

## @role:art
Role appendix (art): PixBuf-only, deterministic, palette from `defs.PAL`. Characters and vehicles get a 1px `PAL.outline`. Run `node tools/sheet.mjs <module> --scale 6`, then LOOK at `out/previews/<module>.png` (and again after fixing) and measure opaque bounding boxes numerically (centred in the frame, nothing clipped, facing RIGHT unless the manifest says otherwise). The sheet tool must print `OK`. Add `test/<id>.test.mjs` asserting manifest conformance, determinism (build twice = same bytes) and build time < 400 ms. Note any palette colour you wished existed in your report (do not edit defs.js).

## @role:sim
Role appendix (sim): pure Node-safe simulation, fixed step, deterministic. Never use the random function of Math (use `createRng`; do not even write its name in comments). Write node:test unit tests for every rule in your section of ARCHITECTURE and mutation-check at least one (break the code, see red).

## @role:audio
Role appendix (audio): one pure-JS synthesis description drives BOTH live WebAudio and offline PCM rendering. No clicks (short attack/release), peak <= 1.0, sensible RMS. Provide the wav-render tool script. Judge by numbers (peak, RMS, length, centroid) and sanity tests (no NaN, no silence, no clipping). Say in the report that nothing was listened to.

## @role:tools
Role appendix (tools): general-purpose, reusable infrastructure. **Do NOT modify `../game-factory`** (another session has uncommitted work there). Stage proposals under `proposed/` in this repo per ARCHITECTURE section 12 and append to `proposed/CHANGELOG-PAWGGER.md` with small atomic edits.

## sim-core | sonnet | p1 | sim | Core simulation (frog, lanes, carry, collisions, rules)
owns: src/sim/game.js, src/sim/frog.js, src/sim/lanes.js, src/sim/collide.js, test/sim-core.test.mjs, (TUNING numbers in src/core/defs.js)
Implement ARCHITECTURE section 4 completely: `createGame`, the frog state machine, hop with buffer, support and collision predicates exported from `lanes.js`/`collide.js` (`supportAt(game|lane, row, x, t)`, `hitVehicle(...)`, so lane-gen's validator and the autopilot can reuse them), carry, bays, timer, lives, scoring, pickups, extra life, level progression, `g.kill/addScore/sfx/fx/popup/taunt`. sim-pete is written in parallel: import `createPete` from `./pete.js` inside try/catch and guard every call, so tests pass before it exists. Tests for every rule: hop, buffer, forward score once per row, road death, river support/no support, turtle dive, croc head open/closed, carry off screen, bay fill and hazards and hedge, timeout, death and respawn, extra life, determinism.

## lane-gen | sonnet | p1 | sim | Lane generator + fairness validator
owns: src/levels/lanegen.js, tools/validate-level.mjs, test/lane-gen.test.mjs
Implement ARCHITECTURE section 6: `generateLevel(level, seed)` and `tools/validate-level.mjs` (CLI: `node tools/validate-level.mjs --levels 12 --seeds 8` prints per-level proofs and exits non-zero on failure). The validator must use the same numbers as the sim (import from defs.js: `itemLeft`, `turtleState`, `crocMouth`, `TUNING`). If sim-core has already exported `supportAt`/`hitVehicle` use them, otherwise implement the same rect rules locally and note it in Requests. Include: different seed gives different output, deterministic, staggered turtle phases, no overlapping items, loop is a multiple of CELL.

## art-vehicles | sonnet | p1 | art | Art: traffic
owns: src/art/vehicles.js, test/art-vehicles.test.mjs
Draw module `vehicles` per the ART manifest: three car colourways, racer, trucks, the Pete's Parkway Pickles truck (giant pickle), the tuna-can bus, Pete's limo with Pete peeking out, the cheese wheel, the headlight glow. Top-down, facing RIGHT, wheels alternate over frames.

## art-river | sonnet | p1 | art | Art: river platforms, bay hazards, pickups
owns: src/art/river.js, test/art-river.test.mjs
Draw module `river`: logs (bark texture, end-grain rings), the turtle (swim, sinking-warn, submerged ripple), the croc raft (closed and open mouth), bay croc and snake, the four treasure pickups. Readable at 1x: the turtle warn frame must be clearly different from the swim frames.

## render | sonnet | p1 | gfx | Renderer, registry, particles, CRT
owns: src/art/registry.js, src/render/renderer.js, src/render/scene.js, src/render/background.js, src/render/particles.js, src/render/crt.js, test/render.test.mjs
Implement ARCHITECTURE sections 7.2 and 7.3. Art modules are being written in parallel: `registry.js` must load each `src/art/<module>.js` with dynamic import in try/catch and substitute a magenta placeholder PixBuf of the manifest size for anything missing, so you can test and screenshot early. Use `itemLeft` for all lane items. Provide a Node-safe `buildAll()`; test the painter against a fake game state.

## art-world | sonnet | p2 | art | Art: ground, backdrop, scenery
owns: src/art/world.js, test/art-world.test.mjs
Draw module `world`. Tiles must be seamless (x for road/median/start/bank/hedge, x and y for water). Skyline silhouette with a PICKLES billboard, jungle strip, clouds, sun/moon, stars, lamps, bays, the roller warning marker.

## art-colby | sonnet | p2 | art | Art: Colby, Pete, bay occupants
owns: src/art/colby.js, test/art-colby.test.mjs
Draw module `colby`. Reuse the look of the library Colby (`../pawfall/docs/concept/` sheets and `../pawfall/src/art/colby.js` for colours and costume details) but redraw him **top-down** in 16x16 with the cape and C shield visible from above. Pete: feral vested rat per the concept sheet. Pete head icon, bay mouse and fish.

## art-fx | sonnet | p2 | art | Art: FX, logo, UI sprites
owns: src/art/fx.js, test/art-fx.test.mjs
Draw module `fx`: effects, the PAWGGER logo (208x48), title scene strip, cursor, touch buttons and arrow glyphs.

## audio-sfx | haiku | p2 | audio | Sound effects
owns: src/audio/audio.js, src/audio/sfx.js, tools/sfx-wav.mjs, test/audio-sfx.test.mjs
ARCHITECTURE section 9 for `audio.js` and `sfx.js`: every name in `defs.SFX`, recipes as pure data. `audio.js` must tolerate `music.js` being absent for now (dynamic import in try/catch).

## audio-music | sonnet | p2 | audio | Music
owns: src/audio/music.js, tools/music-wav.mjs, test/audio-music.test.mjs
ARCHITECTURE section 9 for `music.js`: all six `defs.MUSIC` tracks, validated bar lengths, offline render, loop points.

## sim-pete | haiku | p2 | sim | Pete: taunts, limo honk, cheese roller
owns: src/sim/pete.js, test/sim-pete.test.mjs
ARCHITECTURE section 5. Twelve all-caps cat-vs-rat taunts, <= 26 characters each, original and in the KÄSEKRIEG spirit (no real brands). Test the roller telegraph timing, the lethal window, and the interval shrinking with level.

## ui-shell | sonnet | p2 | ui | Shell: main loop, input, HUD, screens, touch
owns: index.html, style.css, src/main.js, src/core/input.js, src/ui/hud.js, src/ui/screens.js, src/ui/menus.js, src/ui/touch.js, test/ui-shell.test.mjs
ARCHITECTURE section 10. Adapt `core/input.js` (copied from PawFall) so it produces `{ hop }` edges (latched, one per press) instead of run/jump. Import the autopilot as `./sim/autopilot.js` with `createAutopilot` inside try/catch; if it is missing, the title attract mode shows a static scene. Query parameters and `window.__pawgger` as specified.

## qa-bot | sonnet | p3 | qa | Autopilot + botplay + soak tuning
owns: src/sim/autopilot.js, tools/botplay.mjs, test/qa-bot.test.mjs
ARCHITECTURE section 11. The bot must clear levels 1..12 over several seeds with zero timeouts; tune `skill`. Report bays filled, deaths, time per level. If the bot cannot clear a level, find out whether the level or the bot is at fault, and report it (the lane-gen validator is the arbiter).

## site | haiku | p4 | docs | GitHub Pages site + docs
owns: docs/site/**, docs/HOW-TO-PLAY.md, docs/HOW-IT-WAS-MADE.md, README.md, .github/workflows/pages.yml
Showcase site (screenshots, GIF, how to play, characters, the swarm story, tech notes), README, workflow that publishes the site at `/` and the single-file game build at `/play/`. Repo links use `https://github.com/bsommers/pawgger2` as a placeholder (nothing is published yet).

## factory-stage | sonnet | p4 | tools | Stage reusable pieces as proposals
owns: proposed/**
Evaluate `src/sim/lanes.js` + `src/levels/lanegen.js` + the validator for a generic `grid-hop` module, and any art/SFX recipes worth keeping. Stage them under `proposed/new/` with tests that run in this repo, write `proposed/new/docs/LEARNINGS-PAWGGER.md`, complete `proposed/CHANGELOG-PAWGGER.md`, and record the template defect found in the scaffold (`test/lib/collision3d.test.mjs` and `bvh.test.mjs` read `../../../../spec/v3/vectors/*.json`, which does not exist in a fresh `factory new` project).
