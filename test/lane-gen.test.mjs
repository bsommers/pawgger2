import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateLevel } from '../src/levels/lanegen.js';
import { validateLevel } from '../tools/validate-level.mjs';
import { CELL, W, MAX_ITEM_W, KINDS, TUNING, itemW, speedScale, turtleState, BAY_COLS, bayHazardOn } from '../src/core/defs.js';

const LEVELS = [1, 2, 3, 4, 5, 8, 12];
const SEEDS = [1, 2, 3];
const each = (fn) => { for (const l of LEVELS) for (const s of SEEDS) fn(generateLevel(l, s), l, s); };
const lanesOf = (d, kind) => d.lanes.filter((x) => x && x.kind === kind);

test('deterministic and seed-sensitive', () => {
  assert.deepEqual(generateLevel(4, 7), generateLevel(4, 7));
  assert.notDeepEqual(generateLevel(4, 7), generateLevel(4, 8));
  assert.notDeepEqual(generateLevel(4, 7), generateLevel(5, 7));
  assert.deepEqual(JSON.parse(JSON.stringify(generateLevel(3, 2))).level, 3);
});

test('row layout: river 2..6, road 8..12, safe 7 and 13, directions alternate', () => {
  each((d) => {
    for (const r of [2, 3, 4, 5, 6]) assert.equal(d.lanes[r].kind, 'river');
    for (const r of [8, 9, 10, 11, 12]) assert.equal(d.lanes[r].kind, 'road');
    for (const r of [7, 13]) { assert.equal(d.lanes[r].kind, 'safe'); assert.equal(d.lanes[r].items.length, 0); }
    assert.equal(d.lanes[0], undefined); assert.equal(d.lanes[1], undefined);
    for (const r of [3, 4, 5, 6, 9, 10, 11, 12]) assert.equal(d.lanes[r].dir, -d.lanes[r - 1].dir);
    assert.equal(d.timeLimit > 0, true);
  });
});

test('speeds: base x scale, +-12% jitter, never above speedCap x base', () => {
  each((d, l) => {
    const sc = speedScale(l);
    [8, 9, 10, 11, 12].forEach((r, i) => {
      const b = TUNING.roadSpeed[i], v = d.lanes[r].speed;
      assert.ok(v <= b * TUNING.speedCap + 1e-9 && v >= b * sc * 0.88 - 1e-9 && v <= b * sc * 1.12 + 1e-9, `road ${r} ${v}`);
    });
    [2, 3, 4, 5, 6].forEach((r, i) => {
      const b = TUNING.riverSpeed[i], v = d.lanes[r].speed;
      assert.ok(v <= b * TUNING.speedCap + 1e-9 && v >= b * sc * 0.88 - 1e-9 && v <= b * sc * 1.12 + 1e-9, `river ${r} ${v}`);
    });
  });
  const speeds = new Set(); for (let s = 1; s <= 6; s++) speeds.add(generateLevel(1, s).lanes[8].speed);
  assert.ok(speeds.size > 1, 'speeds jitter with the seed');
});

test('loop is a multiple of CELL, >= W + MAX_ITEM_W; offsets are cell multiples; items fit and never overlap', () => {
  each((d) => {
    for (const ln of d.lanes) {
      if (!ln) continue;
      assert.equal(ln.loop % CELL, 0); assert.ok(ln.loop >= W + MAX_ITEM_W);
      const its = ln.items.slice().sort((a, b) => a.off - b.off);
      its.forEach((it, i) => {
        assert.equal(it.off % CELL, 0); assert.ok(it.off >= 0);
        assert.ok(it.off + itemW(it.type) <= ln.loop, 'fits on loop');
        if (i + 1 < its.length) assert.ok(it.off + itemW(it.type) <= its[i + 1].off, 'no overlap');
      });
      assert.equal(new Set(ln.items.map((i) => i.id)).size, ln.items.length);
    }
  });
});

test('item kinds match lane kind and level gates', () => {
  each((d, l) => {
    const road = lanesOf(d, 'road').flatMap((x) => x.items.map((i) => i.type));
    const river = lanesOf(d, 'river').flatMap((x) => x.items.map((i) => i.type));
    for (const t of road) assert.equal(KINDS[t].lane, 'road');
    for (const t of river) assert.equal(KINDS[t].lane, 'river');
    if (l < 2) for (const t of ['limo', 'pickle_truck', 'croc']) assert.ok(![...road, ...river].includes(t), `${t} at level 1`);
    if (l < 3) assert.ok(!road.includes('cheese_roll'));
    if (l >= 2) { assert.equal(road.filter((t) => t === 'limo').length, 1); assert.ok(river.includes('croc')); }
    for (const ln of lanesOf(d, 'road')) if (ln.row !== 12) assert.ok(!ln.items.some((i) => i.type === 'racer'), 'racer only in fastest lane');
    for (const ln of lanesOf(d, 'road')) if (ln.items.some((i) => i.type === 'tuna_bus')) assert.equal(ln.row, 8, 'bus in the slow lane');
  });
});

test('road density rises with level', () => {
  const avg = (l) => { let n = 0; for (let s = 1; s <= 12; s++) n += lanesOf(generateLevel(l, s), 'road').reduce((a, x) => a + x.items.length, 0); return n / 12; };
  assert.ok(avg(10) > avg(1), `${avg(10)} > ${avg(1)}`);
});

test('river lanes alternate logs and turtles; open gaps <= 2 cells', () => {
  each((d) => {
    const kinds = [2, 3, 4, 5, 6].map((r) => d.lanes[r].items.every((i) => KINDS[i.type].dives) ? 'T' : 'L');
    for (let i = 1; i < 5; i++) assert.notEqual(kinds[i], kinds[i - 1]);
    for (const ln of lanesOf(d, 'river')) {
      const its = ln.items.slice().sort((a, b) => a.off - b.off);
      its.forEach((it, i) => {
        const nx = its[(i + 1) % its.length];
        const gap = ((nx.off - (it.off + itemW(it.type))) + ln.loop) % ln.loop;
        assert.ok(gap <= 2 * CELL && gap >= CELL, `gap ${gap / CELL}`);
      });
    }
  });
});

test('turtle phases are staggered: neighbouring groups never dive together', () => {
  each((d) => {
    for (const ln of lanesOf(d, 'river')) {
      const tg = ln.items.filter((i) => KINDS[i.type].dives).sort((a, b) => a.off - b.off);
      if (tg.length < 2) continue;
      assert.ok(new Set(tg.map((t) => t.phase)).size > 1, 'phases vary');
      for (let i = 0; i < tg.length; i++) {
        const a = tg[i], b = tg[(i + 1) % tg.length];
        for (let t = 0; t < TUNING.turtlePeriod * 2; t += 0.05) assert.ok(!(turtleState(a, t) === 'down' && turtleState(b, t) === 'down'));
      }
    }
  });
});

test('bays: hazards <= min(2, level-1), bonuses <= 2 on other bays, phases never all active', () => {
  each((d, l) => {
    const { hazards, bonuses } = d.bays;
    assert.equal(hazards.length, Math.min(2, l - 1));
    assert.ok(bonuses.length <= 2);
    const used = [...hazards, ...bonuses].map((x) => x.bay);
    assert.equal(new Set(used).size, used.length);
    for (const x of used) assert.ok(x >= 0 && x < BAY_COLS.length);
    for (const h of hazards) assert.ok(['croc', 'snake'].includes(h.kind));
    for (const b of bonuses) assert.ok(['mouse', 'fish'].includes(b.kind));
    if (hazards.length > 1) for (let t = 0; t < 16; t += 0.1) assert.ok(!hazards.every((h) => bayHazardOn(h, t)));
    assert.deepEqual(d.bays.cols, [...BAY_COLS]);
  });
});

test('pickups: at most 3 per level, only on logs', () => {
  each((d) => {
    const all = d.lanes.filter(Boolean).flatMap((ln) => ln.items.map((i) => ({ ln, i }))).filter((x) => x.i.pickup);
    assert.ok(all.length <= 3);
    for (const { ln, i } of all) { assert.equal(ln.kind, 'river'); assert.ok(i.type.startsWith('log_')); }
  });
});

test('pete: null at level 1, otherwise limo lane holds the limo; roller from level 3', () => {
  assert.equal(generateLevel(1, 1).pete, null);
  each((d, l) => {
    if (l < 2) return;
    assert.ok(d.pete.limoLane >= 8 && d.pete.limoLane <= 12);
    assert.ok(d.lanes[d.pete.limoLane].items.some((i) => i.type === 'limo'));
    assert.equal(d.pete.roller, l >= 3);
    assert.ok(d.pete.tauntEvery > 0);
    if (d.pete.roller) assert.ok(d.pete.rollerEvery >= 4);
  });
});

test('source never uses the random function of Math', () => {
  for (const f of ['../src/levels/lanegen.js', '../tools/validate-level.mjs']) {
    assert.ok(!/Math\s*\.\s*random/.test(readFileSync(new URL(f, import.meta.url), 'utf8')));
  }
});

test('fairness validator proves a sample of levels', () => {
  for (const [l, s] of [[1, 1], [3, 2], [6, 5], [12, 3]]) {
    const r = validateLevel(l, s); assert.deepEqual(r.errs, [], `level ${l} seed ${s}`);
    assert.ok(r.proof.full > 0 && r.proof.full * 1.4 <= generateLevel(l, s).timeLimit);
  }
});

test('validator catches unfair levels (mutation checks)', () => {
  // (b) a river lane with no platforms is uncrossable
  const d1 = generateLevel(3, 1); d1.lanes[4].items = [];
  assert.ok(validateLevel(3, 1, { def: d1 }).errs.some((e) => e.startsWith('(b)') || e.startsWith('(f)')));
  // (a) a solid wall of vehicles in a road lane
  const d2 = generateLevel(2, 1); const ln = d2.lanes[10];
  ln.items = Array.from({ length: ln.loop / CELL }, (_, i) => ({ id: `w${i}`, type: 'car', off: i * CELL, pickup: null }));
  assert.ok(validateLevel(2, 1, { def: d2 }).errs.some((e) => e.startsWith('(a)')));
  // (d) identical phases on neighbouring turtle groups
  const d3 = generateLevel(1, 1);
  const tl = d3.lanes.filter((x) => x && x.kind === 'river' && x.items.some((i) => KINDS[i.type].dives))[0];
  tl.items.forEach((i) => { i.phase = 0; });
  assert.ok(validateLevel(1, 1, { def: d3 }).errs.some((e) => e.includes('dive together')));
  // (c) open-water gap wider than 2 cells
  const d4 = generateLevel(1, 1); const lg = d4.lanes.filter((x) => x && x.kind === 'river' && !x.items.some((i) => KINDS[i.type].dives))[0];
  lg.items = lg.items.slice(0, 1);
  assert.ok(validateLevel(1, 1, { def: d4 }).errs.some((e) => e.includes('gap')));
  // (f) too little time
  const d5 = generateLevel(1, 1); d5.timeLimit = 4;
  assert.ok(validateLevel(1, 1, { def: d5 }).errs.some((e) => e.startsWith('(f)')));
});
