# src/lib: reusable gameplay engines

Zero-dependency, Node-safe, deterministic modules extracted from PawFall (`factory new --web` copies this folder to `src/lib/`). Tests live in `test/lib/`, examples in `src/lib/examples/`. Import files directly or via `index.js`. None of them uses `Math.random`; a unit test enforces it.

Conventions: y grows DOWN, a body or entity position is its FEET centre, time is seconds, the game steps at a fixed dt (PawFall: 1/60), and input is `{dx, dy, jumpPressed}` (up is negative dy).

## platformer-physics.js
Fixed-step kinematics for strip/tile platformers. `makeConfig({gravity, jumpV, runSpeed, airSpeed, climbSpeed, hitW, hitH, grabR, edgeL, edgeR, stride, emit})`, `makeBody(x, y)`, `stepBody(body, input, dt, world, cfg)`.
- World data: `{groundY, t, pits:[{x0,x1,kind,deadly?,drop?}], platforms:[{id,x,y,w,dx?,dy?}], ladders:[{x,top,bottom,w?}], ropes:[pendulum(...)], bounds}`. The game rebuilds it per screen/level (a second floor = a second world object; swap `groundY` on the `climbEnd` event).
- Modes: ground, air, climb, swing, dead. Events to `cfg.emit(name, body, extra)`: jump, land, hardland, death, drop, grab, release, climb, climbEnd.
- Helpers: `pendulum({px,py,len,amp,period})` (tip + tip velocity), `movingPlatform({x0,y0,x1,y1,w,speed})` (carries riders), `jumpRange(cfg)`/`jumpHeight(cfg)` (feed fairness predicates), `edgeTransition(body, idx, count, cfg)` with `cfg.stride` a number or `fn(body)` (PawFall: tunnel = 3 screens).

## hazard-kit.js
`createRegistry().register(kind, {init,update,onTouch?}, defaults)`, `reg.spawn(kind, props, g)`, `reg.update(ents, dt, g)`, `resolveContacts(reg, player, ents, {hitW,hitH,pointsPenalty}, g)` returning `{type:'kill'|'points'|'collect'|custom}` results (the game applies them), `solidTopUnder` / `solidTopCarrying` for stand-on hazards. `g` is a small facade `{spawn, rng, emit, time}`.
Patterns: `patroller`, `roller` (wrap + optional hop), `stationary`, `cycler` (open = lethal, closed = solid top; stagger with `st.phase`), `spawner`, `tauntingBoss`.

## world-gen.js
`generateWorld(rules)` builds a circular world from a declarative table: seeded block deck (slots shuffled per block, fixed slots, gentle first slot), difficulty ramp `t` (0 at start .. 1 opposite), per-slot `place` rules (weighted kinds with `minT`/`perT`, chance ramps, static vs rolling) and `build(def, ctx)` escape hatch, spacing constraints, collectible placement round the circle with tiers by distance rank. `validateWorld(world, {crossable, collectibleReachable, checks, maxHardRun, isHard})` is the fairness validator: you supply the reachability predicate (built from `jumpRange`), it checks spacing, clearances and circular difficulty runs and returns `{ok, failures}`. `isDeterministic(rules)` guards seed purity. Example table: `examples/jungle-rules.mjs`.

## autopilot-kit.js
Game-agnostic bot parts: `trajectory` (step cloned hazards ahead), `searchMacros` (robust macro-plan search), `makeWatchdog`, `humanize` (skill < 1 late take-offs), `createAutopilot({decide, progressKey, time, skill})`. The game supplies `decide(g)` and its own state mirror; PawFall's full bot (`src/sim/autopilot.js`) is the specimen and was left in place because it mirrors PawFall's player rules.

Run the tests: `node --test test/lib/*.test.mjs`. Example: `node src/lib/examples/hazards-and-physics.mjs`.

## collision3d.js / bvh.js (3D)
Y-UP, right-handed (unlike the y-down 2D libs), Float64, flat typed arrays, deterministic. Specs and vectors: `spec/v3/collision3d.md`, `spec/v3/bvh.md`, `spec/v3/vectors/`.
- `collision3d`: `vec3`, primitives (`aabb`, `sphere`, `capsule`, `obb`/`obbFromQuat`, `plane`), overlap + contact `{normal, depth}` (`sphereSphere`, `sphereAABB`, `aabbAABB`, `obbOBB`, `capsuleCapsule`, `capsuleTriangle`, ...), rays (`raySphere/AABB/OBB/Capsule/Plane`, Moller-Trumbore `rayTriangle`), closest points, `sweepSphere`/`sweepCapsule` against a flat triangle soup (9 numbers per tri), and a kinematic capsule controller: `createCharacter({pos, radius, height, stepHeight})` then `moveAndSlide(ch, vel, dt, world)` (slopes, steps, ground snap; pos = feet centre).
- `bvh`: `buildTriangles(tris)` / `buildAABBs(boxes)` (SAH-binned, stable ties), `raycast`/`rayAny`, `queryAABB`/`querySphere` (ascending original indices), `refit` for moving geometry, `serialize`/`deserialize` (the GPU upload buffer), `asWorld(bvh)` to feed sweeps and the controller with a BVH broad phase.
