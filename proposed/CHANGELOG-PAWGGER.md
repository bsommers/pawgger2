# Pawgger factory contributions (nothing is applied without review)

Format: id, file, NEW/MODIFIES, why, how used, how to adopt, tests.

## PAWGGER-01 grid-hop geometry
- File: `proposed/new/src/lib/grid-hop.js` (NEW). Generalises `src/sim/lanes.js`: `createGridHop(cfg)` gives itemLeft/itemSpan, dive and mouth cycles, supportAt, platformAt, hitAt, carry, snapCol; kinds and tuning come from `cfg`, not from defs.
- Why: hop, carry and lanes as pure functions of time are reusable by any Frogger-like or lane game.
- How used: Pawgger `lanes.js` wraps the same rules with defs constants. Adopt: copy to the template `src/lib/`, pass a cfg.
- Tests: `proposed/new/test/grid-hop.test.mjs` (7 pass via `node --test proposed/new/test/grid-hop.test.mjs`).

## PAWGGER-02 lane generator helpers
- File: `proposed/new/src/lib/lane-gen.js` (NEW). mixSeed, pickWeighted, shuffle, spreadGaps, placeItems, fillLane, staggerPhases; seeded rng injected. Generalises `src/levels/lanegen.js` (level specifics such as Pete and bays stay game-side).
- Adopt: copy beside grid-hop.js. Tests: same file as PAWGGER-01.

## PAWGGER-03 fairness validator
- File: `proposed/new/src/lib/grid-hop-validate.js` (NEW). `structural` (loop size, overlap, water gap, diver stagger) and `crossingTime` (time-expanded search using real predicates). Simplified from `tools/validate-level.mjs` (bay hazards, hop timing slack and per-bay proofs stay game-side).
- Adopt: copy; call from a game test over levels 1..N and seeds 1..K. Tests: same file.

## PAWGGER-04 template defect: missing vectors path
- Files: template `test/lib/collision3d.test.mjs` and `test/lib/bvh.test.mjs` (MODIFIES; no patch staged, `../game-factory` is off limits).
- Defect: they read `../../../../spec/v3/vectors/{collision3d,bvh}.json` via `new URL(..., import.meta.url)`. That directory exists in the factory repo (`game-factory/spec/v3/vectors`) but not in a fresh `factory new` project, so `npm test` fails there.
- Fix options: copy the two JSON vector files into the template (`test/lib/vectors/`) and read them relatively, or skip the replay when the file is absent.

## PAWGGER-05 scaffold missing tools/build-web.mjs
- Factory scaffold does not provide `tools/build-web.mjs`. We copied `../pawfall/tools/build-web.mjs` with names changed. Adopt: add a generic build-web tool to the web-project template.

## PAWGGER-06 art/SFX recipes
- Evaluated, not staged (palette- and KINDS-bound). Reusable rules are in `proposed/new/docs/LEARNINGS-PAWGGER.md` (shared envelope formula, sprite row budget).
