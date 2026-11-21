# Learnings from Pawgger (grid-hop / Frogger parody)

1. Lane items are pure functions of (lane, item, t): `left = ((off + dir*speed*t) mod loop) - maxItemW`. No per-frame state, so sim, renderer, validator and autopilot share one predicate.
2. Seamless wrap needs `loop` to be a multiple of the cell and `>= viewW + maxItemW`; an item must not straddle the seam because itemLeft returns one left edge.
3. Stagger cycling hazards (diving turtles, croc mouths). Phases step by `period*floor(n/2)/n` in position order so circular neighbours never dive together.
4. Validate fairness by a time-expanded search over (row, x, step) with the real support and collision predicates, not copies. Keep exact float x per state and bucket only for dedupe (rounding drift into buckets falsely blocks rides).
5. Fairness rules worth keeping as tests: road crossing exists, river crossing exists into every goal, water gap <= 2 cells, divers staggered, determinism per (level, seed), time limit has >= 40% slack.
6. Mix level and seed into one rng seed with an integer hash (`mixSeed`); never `Math.random` in sim; word comments carefully because source-scan tests grep for it.
7. Offline and live audio must share one envelope formula, so SFX recipes render to WAV in Node for tests and for the build tool.
8. Sprite art: fixed row budgets (wheels rows 2/13 plus outline fill 1..14) make vehicle sprites tile consistently; inspect at x6 and measure bounding boxes.
9. `*/` inside a block comment ends it; use `//` notes. Use `??` not `||` for numbers.
10. Template defect: see CHANGELOG entry PAWGGER-04 (collision3d/bvh vector path).

Art and SFX recipes: evaluated, not staged. Vehicle/log/turtle sprites and the SFX tables are tied to the Pawgger palette and KINDS; the reusable part is the envelope rule (7) and row-budget rule (8), recorded above.
