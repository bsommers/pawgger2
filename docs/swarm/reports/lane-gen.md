# lane-gen report

## What I built
- `src/levels/lanegen.js`: `generateLevel(level, seed=1)` (also `levelAt`, default export). Seeded by `createRng` only. Rows 2..6 river (logs/turtles alternate by row, parity from seed, croc in a log lane from level 2), 8..12 road, rows 7 and 13 are `kind:'safe'` lanes with no items. Item `id` is the string `"<row>-<index>"`. Layout is linear on the loop (no item crosses the seam), gaps: road >= 2 cells, river 1..2 cells. Turtle phases: `phase_i = base + rank*P*floor(n/2)/n`, so spatial neighbours (also across the seam) differ by >= 2.4 s.
- `tools/validate-level.mjs`: `node tools/validate-level.mjs --levels 12 --seeds 8` (exit 1 on failure); exports `validateLevel(level, seed, {def?, startTimes?})`, `hitVehicle`, `supportAt`. Time-expanded BFS (step 1/25 s, hop = 3 steps = hopTime, 0.5 px buckets, exact float x kept per state) proving (a) road crossing, (b) every bay reachable from the median incl. >= 0.5 s waiting on a platform, (c) gaps <= 2 cells, (d) neighbouring turtles never both down, (e) deterministic + seed-sensitive, (f) full crossing x 1.4 <= timeLimit. Also checks loop/offset/overlap/seam rules and bay phases.
- `test/lane-gen.test.mjs`: 14 node:test tests.

## Verification evidence
- `node tools/validate-level.mjs --levels 12 --seeds 8`: all 96 level instances fair (about 45 s); full crossing 2.2..6.7 s vs limits 20..30 s.
- `node --test test/lane-gen.test.mjs`: 14 pass. Mutation: set turtle stagger step to 0 -> 2 tests red; restored -> green. Validator mutation tests (empty river lane, wall of cars, equal phases, wide gap, short time limit) each produce the expected error.

## Deviations from the contract
- Rows 7 and 13 are present in `lanes` as `kind:'safe'` (speed 0, no items); rows 0 and 1 are `undefined`. `rollerEvery` is 0 when `roller` is false.
- supportAt/hitVehicle are local copies (sim-core files did not exist yet).
- The search ignores the roller, bonus pickups and the buffered-hop limit; hop movement is applied at hop start with no drift during the hop.

## Mistakes I made and how I fixed them
- Left a nonsense line (`ROW.MEDIAN ?? 7`) in the first validator draft; removed it. My first "alternate logs/turtles" test assertion was vacuous; rewrote it.

## Learnings for a future agent
- Riding drift must not be rounded into buckets; keeping the exact float x per state and bucketing only for dedupe stays sound.
- Seam rule: with loop >= 352 an item must not straddle `loop`, since itemLeft only returns one left edge.

## Requests for other modules
- sim-core: if you export `supportAt`/`hitVehicle`, tell me their signatures and I will switch the validator to them; keep the same rect rules (supportInset, vehicleInset, croc head = last cell in travel direction).
- sim-core must tolerate `kind:'safe'` lanes at rows 7 and 13 (empty items) and string item ids.
