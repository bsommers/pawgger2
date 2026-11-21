import test from 'node:test';
import assert from 'node:assert/strict';
import { createGridHop } from '../src/lib/grid-hop.js';
import { mixSeed, fillLane, staggerPhases, pickWeighted } from '../src/lib/lane-gen.js';
import { structural, crossingTime } from '../src/lib/grid-hop-validate.js';

function createRng(seed) {                         // mulberry32, same as the template rng
  let s = (seed >>> 0) || 1;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (a) => a[Math.floor(next() * a.length)], chance: (p) => next() < p };
}
const CELL = 16, W = 240;
const cfg = {
  cell: CELL, frogHalf: 5, inset: { support: 3, vehicle: 2 },
  kinds: { car: { cells: 1 }, truck: { cells: 2 }, log: { cells: 3 }, turtle: { cells: 2, dives: true }, croc: { cells: 4, head: true } },
  cycles: { dive: { period: 6, warn: 1, down: 1.5 }, mouth: { period: 5, openFrac: 0.3 } },
};
const gh = createGridHop(cfg);
const cells = (t) => cfg.kinds[t].cells;

function build(level, seed) {
  const rng = createRng(mixSeed(level, seed)), minLoopCells = Math.ceil((W + gh.maxItemW) / CELL);
  const lanes = []; const sign = rng.chance(0.5) ? 1 : -1;
  for (const row of [8, 9, 10]) {
    const s = fillLane(rng, { cell: CELL, cells, pool: [['car', 4], ['truck', 2]], minLoopCells, target: 3, minGap: 3, fallback: 'car' });
    lanes[row] = { row, kind: 'road', dir: sign * (row % 2 ? 1 : -1), speed: 20 + 4 * (row - 8), loop: s.loopCells * CELL, items: s.types.map((type, i) => ({ type, off: s.offs[i] })) };
  }
  lanes[7] = { row: 7, kind: 'safe', dir: 1, speed: 0, loop: 1, items: [] };
  lanes[11] = { row: 11, kind: 'safe', dir: 1, speed: 0, loop: 1, items: [] };
  for (const row of [6, 5]) {
    const types = [], gaps = []; let tot = 0;
    while (tot < minLoopCells) { const t = row === 6 ? 'log' : 'turtle'; types.push(t); gaps.push(1 + (types.length % 2)); tot += cells(t) + gaps[gaps.length - 1]; }
    let o = 0; const offs = types.map((t, i) => { const v = o * CELL; o += cells(t) + gaps[i]; return v; });
    const items = types.map((type, i) => ({ type, off: offs[i] }));
    const dive = types.map((t, i) => (cfg.kinds[t].dives ? i : -1)).filter((i) => i >= 0);
    const ph = staggerPhases(rng, offs, dive, cfg.cycles.dive.period);
    for (const i of dive) items[i].phase = ph.get(i);
    lanes[row] = { row, kind: 'river', dir: row % 2 ? 1 : -1, speed: 18, loop: tot * CELL, items };
  }
  lanes[4] = { row: 4, kind: 'safe', dir: 1, speed: 0, loop: 1, items: [] };
  return lanes;
}

test('itemLeft wraps seamlessly and is periodic in loop/speed', () => {
  const lane = { dir: 1, speed: 16, loop: 22 * CELL, kind: 'road', items: [] }, it = { type: 'car', off: 32 };
  assert.equal(gh.itemLeft(lane, it, 0), 32 - gh.maxItemW);
  assert.ok(Math.abs(gh.itemLeft(lane, it, lane.loop / lane.speed) - gh.itemLeft(lane, it, 0)) < 1e-9);
  const l = gh.itemLeft({ ...lane, dir: -1 }, it, 1000);
  assert.ok(l >= -gh.maxItemW && l < lane.loop - gh.maxItemW);
});
test('dive and mouth cycles', () => {
  const it = { type: 'turtle', off: 0, phase: 0 };
  assert.equal(gh.diveState(it, 0), 'up'); assert.equal(gh.diveState(it, 3.6), 'warn'); assert.equal(gh.diveState(it, 5), 'down');
  assert.equal(gh.mouthState({ phase: 0 }, 0), 'closed'); assert.equal(gh.mouthState({ phase: 0 }, 4), 'open');
});
test('support: sunk diver and open croc head do not hold; croc back does', () => {
  const lane = { dir: 1, speed: 0, loop: 22 * CELL, kind: 'river', items: [{ type: 'turtle', off: gh.maxItemW, phase: 0 }, { type: 'croc', off: gh.maxItemW + 5 * CELL, phase: 0 }] };
  assert.ok(gh.supportAt(lane, 16, 0)); assert.equal(gh.supportAt(lane, 16, 5), null);
  const cl = 5 * CELL; assert.ok(gh.supportAt(lane, cl + 8, 4));                 // back, mouth open
  assert.equal(gh.supportAt(lane, cl + 4 * CELL - 8, 4), null);                  // head, open
  assert.ok(gh.supportAt(lane, cl + 4 * CELL - 8, 0));                           // head, closed
  assert.ok(gh.platformAt(lane, 16, 5));
});
test('hitAt uses frog half-width and vehicle inset; carry/snap', () => {
  const lane = { dir: 1, speed: 0, loop: 22 * CELL, kind: 'road', items: [{ type: 'car', off: gh.maxItemW + 32 }] };
  assert.ok(gh.hitAt(lane, 40, 0)); assert.equal(gh.hitAt(lane, 10, 0), null);
  assert.equal(gh.carry({ dir: -1, speed: 10 }, 100, 0.5), 95); assert.equal(gh.snapCol(100), 104);
});
test('lane-gen is deterministic, respects invariants', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const a = build(2, seed), b = build(2, seed);
    assert.deepEqual(a, b);
    assert.deepEqual(structural(gh, a.filter(Boolean), { viewW: W, maxGapCells: 2, divePeriod: cfg.cycles.dive.period }).filter((e) => !/water gap/.test(e)), []);
  }
  assert.notDeepEqual(build(2, 1), build(2, 2));
  assert.ok(['a', 'b'].includes(pickWeighted(createRng(1), [['a', 1], ['b', 1]])));
});
test('structural flags an overlap and a wide water gap', () => {
  const bad = [{ row: 2, kind: 'river', dir: 1, speed: 1, loop: 22 * CELL, items: [{ type: 'log', off: 0 }, { type: 'log', off: CELL }] }];
  assert.ok(structural(gh, bad, { viewW: W }).some((s) => /overlap/.test(s)));
  const gap = [{ row: 2, kind: 'river', dir: 1, speed: 1, loop: 22 * CELL, items: [{ type: 'log', off: 0 }] }];
  assert.ok(structural(gh, gap, { viewW: W }).some((s) => /water gap/.test(s)));
});
test('crossingTime finds a crossing on a fair level and Infinity on a wall of cars', () => {
  const lanes = build(1, 3);
  const t = crossingTime(gh, lanes, { startRow: 11, goalRow: 7, startX: 120, viewW: W });
  assert.ok(Number.isFinite(t), 'road crossing exists');
  const wall = lanes.slice(); wall[9] = { row: 9, kind: 'road', dir: 1, speed: 0, loop: 22 * CELL, items: Array.from({ length: 22 }, (_, i) => ({ type: 'car', off: i * CELL })) };
  assert.equal(crossingTime(gh, wall, { startRow: 11, goalRow: 7, startX: 120, viewW: W, maxSteps: 200 }), Infinity);
});
