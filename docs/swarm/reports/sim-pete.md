# sim-pete report

## What I built
- `src/sim/pete.js`: `TAUNTS` (12 all-caps lines, <= 26 chars) and `createPete(g) -> { state, t, rollerX, rollerDir, update(dt), reset() }`.
  - Taunts every `tauntEvery` s: `g.taunt(line)` plus `sfx pete_laugh`.
  - Honk: `sfx honk` at `rowY(limoLane)` when the limo's left edge enters the screen (left in [0, W)); the first observation after reset does not honk.
  - Roller: `idle` until the cooldown ends, then `rollerWarn` (`TUNING.rollerWarn` s, `sfx roller_warn`, rollerX at the entry edge), then `roller` (`TUNING.rollerSpeed` px/s, `sfx roller_rumble`). A frog in row 7 whose hitbox overlaps it dies `'roller'`. Start is deferred one step while the frog is hopping into row 7.
- `test/sim-pete.test.mjs`: 13 node:test cases.

## Verification evidence
- `node --test test/sim-pete.test.mjs`: 13 pass, 0 fail.
- Mutation: `g.kill('roller')` replaced with a no-op gives 1 fail, restored, back to 0 fail.
- Smoke: `createGame({seed:1, level:3, levelAt: generateLevel})`, 40 s of play, pete states `idle`, `rollerWarn`, `roller`; 2 taunts and 3 honks.

## Deviations from the contract
- Interval: contract section 5 says Pete applies `rollerEvery * 0.92^(level-3)` with a min of 4 s. lane-gen already bakes that into `def.pete.rollerEvery`, so pete uses that value directly. A fallback applies the same rule only when the field is missing.

## Mistakes I made and how I fixed them
- Timing assertions in the first draft were off by one cooldown. Fixed by stepping past warn + cooldown.

## Learnings for a future agent
- `g.pete` is the object returned by `createPete`, so the state fields must stay on it.
- Random draws go through `g.rng` only (taunt pick, roller direction).

## Requests for other modules
- lane-gen (`src/levels/lanegen.js`): contract says `pete` is null for level 1, but `generateLevel(1)` returns an object with `roller: false`. The code runs fine either way; the contract or the generator should be aligned.
