import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, validateWorld, isDeterministic, createRng, circDist, rampOf, lerpVal, wrap } from '../../src/lib/world-gen.js';
import { rules, crossable, MAX_PIT } from '../../src/lib/examples/jungle-rules.mjs';

test('rng is seeded and uniform-ish', () => {
  const a = createRng(5), b = createRng(5); assert.deepEqual([a.next(), a.next()], [b.next(), b.next()]);
  const r = createRng(9); const v = Array.from({ length: 2000 }, () => r.int(0, 3)); for (const k of [0, 1, 2, 3]) assert.ok(v.filter((x) => x === k).length > 400);
});

test('circular math', () => {
  assert.equal(circDist(0, 47, 48), 1); assert.equal(rampOf(24, 0, 48), 1); assert.equal(rampOf(0, 0, 48), 0); assert.equal(wrap(-1, 48), 47);
  assert.equal(lerpVal({ base: 0.3, perT: 0.4 }, 0.5), 0.5); assert.equal(lerpVal(0.7, 1), 0.7); assert.equal(lerpVal({ from: 0, to: 10 }, 0.5), 5);
});

test('deterministic per seed, different across seeds', () => {
  assert.ok(isDeterministic(rules));
  const a = JSON.stringify(generateWorld(rules).screens), b = JSON.stringify(generateWorld({ ...rules, seed: 99 }).screens);
  assert.notEqual(a, b);
});

test('block structure: fixed slot every block, first screen is the gentle slot', () => {
  const w = generateWorld(rules);
  for (let i = 6; i < 48; i += 12) assert.equal(w.screens[i].tag, 'boss');
  assert.equal(w.screens[0].tag, 'rest');
  assert.equal(w.screens.length, 48);
});

test('difficulty ramps: pit width and hazard density grow with distance from start', () => {
  const w = generateWorld({ ...rules, count: 120, seed: 7 }), pits = w.screens.filter((s) => s.pit);
  const near = pits.filter((s) => s.t < 0.3).map((s) => s.pit.w), far = pits.filter((s) => s.t > 0.7).map((s) => s.pit.w);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(near.length && far.length && avg(far) > avg(near) + 4);
});

test('generated worlds pass the fairness validator across many seeds', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = validateWorld(generateWorld({ ...rules, seed, count: 60 }), { crossable, rollingSweepsCollectible: true });
    assert.deepEqual(r.failures, [], 'seed ' + seed);
  }
});

test('collectibles: spread, unique screens, tiers by distance, not on excluded', () => {
  const w = generateWorld(rules);
  assert.equal(w.collectibles.length, 8); assert.equal(new Set(w.collectibles.map((c) => c.screen)).size, 8);
  for (const c of w.collectibles) { assert.ok(!w.screens[c.screen].boss); assert.deepEqual(w.screens[c.screen].collectible, { id: c.id, type: c.type, x: c.x }); }
  const rank = [...w.collectibles].sort((a, b) => circDist(a.screen, 0, 48) - circDist(b.screen, 0, 48));
  assert.equal(rank.filter((c) => c.type === 'tuna').length, 4); assert.equal(rank[0].type, 'tuna'); assert.equal(rank[7].type, 'gold');
});

test('validator catches planted violations (mutation check)', () => {
  const w = generateWorld(rules);
  const bad = structuredClone(w);
  const c = bad.collectibles[0], free = bad.screens.filter((d) => d.idx !== c.screen && !d.collectible).map((d) => d.idx);
  bad.screens[free[0]].pit = { kind: 'tar', x0: 100, w: MAX_PIT + 20 };
  bad.screens[free[1]].items = [{ kind: 'fire', x: 100 }, { kind: 'snake', x: 120 }];
  bad.screens[free[2]].items = [{ kind: 'fire', x: 5 }];
  bad.screens[c.screen].items = [{ kind: 'fire', x: c.x + 10 }];
  const res = validateWorld(bad, { crossable }), rules_ = new Set(res.failures.map((f) => f.rule));
  for (const r of ['crossable', 'gap', 'edgeClear', 'collectClear']) assert.ok(rules_.has(r), r);
  assert.equal(res.ok, false);
});

test('custom checks, collectibleReachable and hardRun are honoured', () => {
  const w = generateWorld(rules);
  const res = validateWorld(w, { crossable, checks: [(d) => (d.idx === 4 ? 'boom' : null)], collectibleReachable: () => 'nope', maxHardRun: 1, isHard: (d) => d.tag !== 'boss' });
  const set = new Set(res.failures.map((f) => f.rule)); assert.ok(set.has('custom') && set.has('collectibleReachable') && set.has('hardRun'));
});

test('slot build() escape hatch and set are applied', () => {
  const r = { seed: 1, count: 6, blocks: { size: 6, deck: ['a'] }, slots: { a: { set: { flag: 1 }, build: (d) => { d.built = d.idx; } } } };
  const w = generateWorld(r); assert.ok(w.screens.every((s) => s.flag === 1 && s.built === s.idx));
});

test('per-screen streams depend on the seed even when the slot deck is fixed', () => {
  const r = (seed) => ({ seed, count: 24, blocks: { size: 12, deck: ['p'] }, slots: { p: { place: [{ chance: 1, kinds: [{ kind: 'x' }, { kind: 'y' }] }] } } });
  const a = generateWorld(r(1)).screens.map((s) => s.items[0].x).join(), b = generateWorld(r(2)).screens.map((s) => s.items[0].x).join();
  assert.notEqual(a, b);
});
