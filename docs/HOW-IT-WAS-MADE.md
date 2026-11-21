# How Pawgger was made

Pawgger was built by a swarm of parallel AI agents. Each agent owned one module, built it against a shared contract, verified it by running it, and reported progress to a live tracker. This page explains how that worked and what the code looks like as a result.

## The contract

`ARCHITECTURE.md` is the binding contract. It fixes:

- the canonical data in `src/core/defs.js` (screen size 240x256, 16 px cells, the row map, bay columns, palette, scoring and tuning numbers);
- the simulation API (`src/sim/game.js`), the Pete API, the level API (`src/levels/lanegen.js`);
- the art and render APIs, the event names, the audio rules;
- which agent owns which file.

Agents were told to code against the contract, guard against missing files from other agents, and never edit a file they did not own. Requests for changes went into their reports instead.

## The swarm

Each module had its own progress checkpoint in `docs/swarm/progress/` and its final report in `docs/swarm/reports/`. The reports record what was built, the verification evidence, deviations from the contract, mistakes and fixes, and requests for other modules. Read them for the detail behind any decision here.

Modules and owners:

| Area | Files | Owner |
|---|---|---|
| Simulation core | `src/sim/game.js`, `frog.js`, `lanes.js`, `collide.js` | sim-core |
| Pete, the rat | `src/sim/pete.js` | sim-pete |
| Level generator | `src/levels/lanegen.js`, `tools/validate-level.mjs` | lane-gen |
| Art | `src/art/colby.js`, `vehicles.js`, `river.js`, `world.js`, `fx.js` | one art agent each |
| Render | `src/render/*`, `src/art/registry.js` | render |
| Audio | `src/audio/audio.js`, `sfx.js`, `music.js` | audio-sfx, audio-music |
| UI shell | `src/main.js`, `src/ui/*`, `src/core/input.js`, `index.html`, `style.css` | ui-shell |
| QA | `src/sim/autopilot.js`, `tools/botplay.mjs`, tests | qa-bot |
| Site and docs | `docs/site/**`, `README.md`, these docs, the Pages workflow | site |

A live tracker (`tools/swarm-tracker`, port 4870) showed each agent's plan, percent progress and final status.

## The art, without a single image file

Every sprite is code. An art module exports `build()`, which returns `PixBuf` objects drawn pixel by pixel from a locked 8-bit palette (`PAL`). Art follows a few rules from the contract:

- a one-pixel dark outline on characters and vehicles;
- three or four tone ramps per object, light from the upper left;
- no anti-aliasing and no gradients except dithering;
- vehicles and animals face right;
- lanes tile seamlessly in x, and the water tile tiles in both axes.

Art was checked by rendering a preview at 6x (`node tools/sheet.mjs <module> --scale 6`), measuring bounding boxes, and iterating. The art is deterministic: `createRng(seed)` and `hash2`, never `Math.random`.

## The sound, without a single file

Audio is synthesised. WebAudio plays it live in the browser. A pure-JS path renders the same sounds offline to PCM, which `tools/sfx-wav.mjs` and `tools/music-wav.mjs` write out as WAV files for checking.

## Deterministic, headless sim

The simulation, levels, art and audio rendering run in Node with no DOM at import time. That is what lets the test suite (`npm test`, which runs `node:test`) exercise the game without a browser. The sim draws randomness only from a seeded RNG. Source-scan tests check that `Math.random` never appears in the sim.

The browser build is a plain ES module app. `tools/build-web.mjs` produces `dist/web/` and `dist/pawgger2.html`, one self-contained file with JS and CSS inlined, playable from `file://`.

## Verification

Each agent was asked to verify for real: run it, test it, look at it. For the game that meant:

- `node --test` over the module tests;
- `tools/botplay.mjs`, an autopilot that plays the levels and reports bays, deaths and time;
- `tools/shot.mjs`, a headless Chrome driver that takes screenshots and key sequences, used for every image on the site;
- `tools/smoke_web.sh`, a smoke test of the built page.

## Mistakes and lessons

Known rough edges, and what to do next time, are in `docs/LEARNINGS.md` and the per-agent reports. The general lessons:

- Write the contract before the code, and keep numbers in one place (`defs.js`), so no two modules disagree.
- Look at the output. Numeric checks catch most bugs, but a sprite can pass every test and still look wrong.
- Keep each agent's context small: read files in pieces, and checkpoint often so a stopped agent can resume.
