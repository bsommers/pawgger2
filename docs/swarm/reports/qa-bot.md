# qa-bot report

## What I built
- `src/sim/autopilot.js`: `createAutopilot(game, {skill=1, seed}) -> {step(dt) -> {hop}, stats}`. Time-expanded search over (row, x, time) at 1/30 s steps (hop = 4 steps = 8 ticks, matching the sim's real landing tick), using the sim's own `supportAt` / `hitVehicle` (src/sim/lanes.js, collide.js), bay hazards via `bayHazardOn`, and a model of Pete's roller (state/rollerX/rollerDir/t). Goal: earliest safe hop into any open, hazard-free bay. Safety margin 1.5 px (and +-0.03/0.04 s time jitter), falling back to 0.5 and 0; replans after every landing and on any Pete state change; watchdog (12 s without score progress) cycles margins; one-tick local fallback if no plan exists. `skill < 1` delays hops by up to `(1-skill)*14` ticks and randomly freezes (seeded rng).
- `tools/botplay.mjs`: `node tools/botplay.mjs [--levels 12 --seeds 4 --skill 1 --limit 240 --lives 3 --verbose]`; per level: clears, bays, deaths, avg/max time, cpu. Exit 1 on any timeout / gameover / error. Exports `playLevel`.
- `test/qa-bot.test.mjs`: 5 tests (about 38 s).

## Verification evidence
- skill 1, levels 1..12 x seeds 1..8 (96 runs, real sim with Pete + rollers, lanegen levels): 96/96 clear, 480/480 bays, 0 deaths, 0 timeouts. Time per level 20-27 s avg (max 32 s) against limits 30..20 s... note the attempt timer is per frog and the bot never ran out.
- skill 0.8 x 4 seeds: all levels clear, 0-5 deaths per level over 4 seeds. skill 0.5: mostly gameover (about 3 bays/level). skill 0.3 dies clearly more than skill 1 (test).
- `node --test test/qa-bot.test.mjs`: 5 pass.
- Per-plan cost: typical a few ms, worst single step about 0.4 s (first plan on busy levels).

## Deviations from the contract
- None for the API. Tuned `skill`: default 1 (perfect); recommended attract-mode value 0.85 (occasional deaths, always progresses).

## Mistakes I made and how I fixed them
- First version kept a stale plan during a hop, so the follow-up hop was skipped and the frog sat in front of a car (2 deaths on L1). Fix: drop the plan while mid-hop and replan on landing.
- Coarser 2 px state buckets sped planning up 40% but cost a death at L11; reverted to 1 px.

## Learnings for a future agent
- Landing tick = hop start + ceil(hopTime*60) ticks, not hopTime exactly (8 ticks vs 7.2); plan in tick-aligned steps.
- Level faults: none found. No level needed the lane-gen validator as arbiter; every failure was bot-side.

## Requests for other modules
- sim-core: none. UI attract mode: call `ap.step(dt)` every frame before `g.update`; expect rare 100-400 ms hitches on replan (could be moved to idle time if it matters).
