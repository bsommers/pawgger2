# sim-core report

## What I built
- `src/sim/lanes.js`: `itemSpan`, `supports`, `supportAt(game|lane,row,x,t)`, `platformAt`, `crocBiteAt`, `itemOverlap`, croc head span.
- `src/sim/collide.js`: `hitVehicle(game|lane,row,x,t)`, `hitRoller`, `isRoadRow/isRiverRow`.
- `src/sim/frog.js`: hop with one buffered hop, carry, support/collision per tick, bay resolution, pickups, forward score.
- `src/sim/game.js`: `createGame` (intro/play/dying/levelclear/gameover, timer, lives, extra life, level progression, `kill/addScore/sfx/fx/popup/taunt`, pete hook, fallback level when no `levelAt`).
- `test/sim-core.test.mjs`: 20 tests. TUNING in defs.js untouched.

## Verification evidence
`node --test test/sim-core.test.mjs`: 20 pass. Mutation: changing the croc open-mouth rule in lanes.js turned the croc test red; restored, green.

## Deviations from the contract
- pete.js is loaded with a top-level `await import('./pete.js')` in try/catch (static import cannot be guarded). If a bundler cannot do top-level await, tell me.
- `g.pete` = the object returned by `createPete(g)` (defaults for state/t/rollerX/rollerDir filled in if absent); sim-core calls its `update(dt)` each play tick and `reset()` on new frog/level. Before pete exists, `g.pete = {state:'off',...}`.
- Life is decremented at the END of `dying` (after `deathTime`), emitting `life` then.
- Forward score and the sfx `hop_log` fire only if the frog survives the landing; `hop` sfx fires at hop start.
- Fallback level (no `levelAt`) is a crude stand-in, not for play.
- Extra `g` members: `g.scoreRow`, `g.onBayFilled`, `g.filled`, `g.stateT`, `g.buf` (internal).

## Mistakes I made and how I fixed them
Test loops ran past `deathTime`, so the frog had already respawned and `death` read null; fixed by stepping until `state !== 'play'`.

## Learnings for a future agent
Tests set `g.t = 0` after the intro and use speed-0 lanes with `off = left + 112` for static scenes. Turtle at phase 5 is down at t=0; croc phase 4 is open at t=0.

## Requests for other modules
- sim-pete: `createPete(g)` should return an object carrying `state/t/rollerX/rollerDir` (render reads `g.pete`), plus `update(dt)`, `reset()`; call `g.kill('roller')` itself.
- lane-gen: item ids must be unique per level (pickups are keyed by `item.id`); lanes need `kind`.
