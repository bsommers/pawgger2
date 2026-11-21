import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/lib/collision2d.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const unit = (n) => near(Math.hypot(n.x, n.y), 1);
const SHAPES = () => [C.aabb(0, 0, 10, 8), C.circle(0, 0, 7), C.obb(0, 0, 9, 5, 0.6), C.polygon(0, 0, [{ x: -8, y: 6 }, { x: 9, y: 6 }, { x: 0, y: -10 }], 0.3), C.capsule(0, 0, 8, 4, -0.5)];

test('aabb manifold: normal from a to b, depth, two contact points', () => {
  const m = C.collide(C.aabb(0, 0, 10, 10), C.aabb(15, 2, 10, 10));
  assert.deepEqual(m.normal, { x: 1, y: 0 }); assert.equal(m.depth, 5); assert.equal(m.points.length, 2);
  assert.equal(C.collide(C.aabb(0, 0, 10, 10), C.aabb(20, 0, 10, 10)), null, 'touching is not colliding');
  assert.equal(C.collide(C.aabb(0, 0, 10, 10), C.aabb(0, 40, 10, 10)), null);
});

test('manifold symmetry: swapping shapes flips the normal, keeps depth, for every shape pair', () => {
  const S = SHAPES();
  for (let i = 0; i < S.length; i++) for (let j = 0; j < S.length; j++) {
    for (const [dx, dy] of [[6, 1], [-4, 9], [0, 3], [12, -6]]) {
      const a = { ...S[i] }, b = { ...S[j], x: dx, y: dy };
      const m1 = C.collide(a, b), m2 = C.collide(b, a);
      assert.equal(m1 === null, m2 === null, `pair ${i},${j} @${dx},${dy}`);
      if (!m1) continue;
      unit(m1.normal); near(m1.depth, m2.depth, 1e-7);
      near(m1.normal.x, -m2.normal.x, 1e-6); near(m1.normal.y, -m2.normal.y, 1e-6);
    }
  }
});

test('separating along the normal by depth resolves the overlap (all pairs)', () => {
  const S = SHAPES();
  for (let i = 0; i < S.length; i++) for (let j = 0; j < S.length; j++) for (const [dx, dy] of [[6, 1], [-4, 9], [3, -2], [0, 12]]) {
    const a = S[i], b = { ...S[j], x: dx, y: dy }, m = C.collide(a, b);
    if (!m) continue;
    const moved = C.translate(b, m.normal.x * (m.depth + 1e-6), m.normal.y * (m.depth + 1e-6));
    assert.equal(C.collide(a, moved), null, `pair ${i},${j} @${dx},${dy}`);
    for (const p of m.points) assert.ok(p.depth >= 0 && p.depth <= m.depth + 1e-9);
  }
});

test('circle manifolds: circle-circle, circle-box corner, centre inside', () => {
  let m = C.collide(C.circle(0, 0, 5), C.circle(8, 0, 5)); assert.deepEqual(m.normal, { x: 1, y: 0 }); near(m.depth, 2); near(m.points[0].x, 4);
  m = C.collide(C.aabb(0, 0, 10, 10), C.circle(13, 13, 5)); near(m.depth, 5 - Math.hypot(3, 3)); near(m.normal.x, Math.SQRT1_2); near(m.normal.y, Math.SQRT1_2);
  assert.equal(C.collide(C.aabb(0, 0, 10, 10), C.circle(14, 14, 5)), null);
  m = C.collide(C.aabb(0, 0, 10, 10), C.circle(2, 1, 3)); assert.ok(m.depth > 3); unit(m.normal);
});

test('rotated boxes: separation is detected by SAT, face contact gives two points', () => {
  assert.equal(C.collide(C.obb(0, 0, 10, 10, 0.3), C.obb(30, 3, 10, 10, -0.2)), null);
  const m = C.collide(C.obb(0, 0, 10, 5, 0), C.obb(0, 9, 8, 5, 0.1));
  assert.equal(m.points.length, 2); assert.deepEqual(m.normal, { x: -0, y: 1 }.y === 1 ? m.normal : null); assert.ok(m.normal.y > 0.99);
  // a 45 degree diamond has a corner poking into a box
  const d = C.collide(C.aabb(0, 0, 10, 10), C.obb(0, -14, 6, 6, Math.PI / 4));
  assert.ok(d && d.normal.y < -0.99 && d.depth > 0);
});

test('polygon winding does not matter; concave input is the caller\'s problem', () => {
  const tri = [{ x: -10, y: 8 }, { x: 12, y: 8 }, { x: 0, y: -12 }];
  const a = C.collide(C.polygon(0, 0, tri), C.aabb(0, 14, 10, 10)), b = C.collide(C.polygon(0, 0, [...tri].reverse()), C.aabb(0, 14, 10, 10));
  assert.deepEqual(a, b);
});

test('capsules: parallel, end cap vs circle, and degenerate zero length behave like circles', () => {
  const m = C.collide(C.capsule(0, 0, 10, 4, 0), C.capsule(0, 6, 10, 4, 0)); near(m.depth, 2); assert.deepEqual(m.normal, { x: 0, y: 1 });
  const e = C.collide(C.capsule(0, 0, 10, 4, 0), C.circle(16, 0, 3)); near(e.depth, 1); assert.deepEqual(e.normal, { x: 1, y: 0 });
  const z = C.collide(C.capsule(0, 0, 0, 5, 0), C.circle(8, 0, 5)), c = C.collide(C.circle(0, 0, 5), C.circle(8, 0, 5)); near(z.depth, c.depth);
});

test('distance and containsPoint', () => {
  near(C.distance(C.circle(0, 0, 5), C.aabb(30, 0, 10, 10)).distance, 15);
  assert.equal(C.distance(C.aabb(0, 0, 5, 5), C.aabb(4, 0, 5, 5)).overlap, true);
  const d = C.distance(C.obb(0, 0, 5, 5, 0.5), C.obb(30, 10, 5, 5, -0.4)); assert.ok(d.distance > 10); unit(d.normal);
  assert.ok(C.containsPoint(C.aabb(0, 0, 10, 10), 5, -5)); assert.ok(!C.containsPoint(C.aabb(0, 0, 10, 10), 11, 0));
  assert.ok(C.containsPoint(C.circle(0, 0, 5), 3, 4)); assert.ok(C.containsPoint(C.capsule(0, 0, 10, 4, 0), 13, 1)); assert.ok(!C.containsPoint(C.capsule(0, 0, 10, 4, 0), 15, 0));
});

test('bounds contain every vertex; overlap implies bounds overlap', () => {
  for (const s of SHAPES()) { const b = C.bounds(s); for (const v of C.hull(s).v) assert.ok(v.x >= b.minX - 1e-9 && v.x <= b.maxX + 1e-9 && v.y >= b.minY - 1e-9 && v.y <= b.maxY + 1e-9); }
  const S = SHAPES(); for (const a of S) for (const b of S) if (C.collide(a, { ...b, x: 5 })) assert.ok(C.boundsOverlap(C.bounds(a), C.bounds({ ...b, x: 5 })));
});

test('raycast: every shape, hit normal faces the origin, inside rays, misses, range', () => {
  for (const s of SHAPES()) {
    const h = C.raycast(s, -50, 0.5, 1, 0, 100); assert.ok(h && !h.inside, 'hit ' + s.type);
    assert.ok(h.normal.x < 0); unit(h.normal); near(h.y, 0.5); assert.ok(C.containsPoint(s, h.x + 1e-6, h.y));
    assert.equal(C.raycast(s, -50, 60, 1, 0, 100), null);
    assert.equal(C.raycast(s, -50, 0.5, 1, 0, h.t - 1e-3), null, 'max range');
    const ins = C.raycast(s, 0, 0, 1, 0, 1); assert.ok(ins.inside && ins.t === 0);
  }
  assert.equal(C.raycast(C.circle(0, 0, 5), -20, 5.5, 1, 0, 100), null);
  const seg = C.segmentcast(C.aabb(0, 0, 10, 10), -30, 0, 0, 0); assert.equal(seg.t, 2 / 3); assert.equal(C.segmentcast(C.aabb(0, 0, 10, 10), -30, 0, -15, 0), null);
  const n = C.raycastNearest([C.aabb(50, 0, 5, 5), C.aabb(20, 0, 5, 5), C.aabb(20, 0, 5, 5)], 0, 0, 1, 0, 100); assert.equal(n.index, 1); assert.equal(n.t, 15);
});

test('swept AABB never tunnels at any speed (fuzz over a fixed grid of speeds and heights)', () => {
  const wall = C.aabb(500, 0, 0.5, 40);
  for (const v of [1, 10, 100, 1e3, 1e4, 1e6]) for (const y of [-30, -5, 0, 7, 25]) {
    const r = C.sweptAABB(C.aabb(0, y, 2, 2), v * 1000, 0, wall);
    assert.ok(r, `v ${v} y ${y}`); near(r.t * v * 1000, 500 - 0.5 - 2, 1e-6 * Math.max(1, v));
    assert.deepEqual(r.normal, { x: -1, y: 0 });
  }
  assert.equal(C.sweptAABB(C.aabb(0, 0, 5, 5), 100, 0, C.aabb(0, 10, 5, 5)), null, 'sliding along a touching face misses');
  assert.equal(C.sweptAABB(C.aabb(0, 0, 5, 5), -100, 0, C.aabb(10, 0, 5, 5)), null, 'moving away');
  const ov = C.sweptAABB(C.aabb(0, 0, 5, 5), 10, 0, C.aabb(6, 0, 5, 5)); assert.equal(ov.t, 0); assert.ok(ov.overlap);
  const fall = C.sweptAABB(C.aabb(0, 0, 5, 5), 0, 100, C.aabb(2, 60, 20, 5)); assert.equal(fall.t, 0.5); assert.deepEqual(fall.normal, { x: 0, y: -1 });
});

test('moveAABB slides along walls and corners and stops against two walls', () => {
  let r = C.moveAABB(C.aabb(0, 0, 4, 4), 100, 40, [C.aabb(30, 0, 5, 100)]);
  near(r.x, 21); near(r.y, 40 * 0.17 + 40 * (1 - 0.17), 1e-9 * 100); assert.equal(r.hits[0].normal.x, -1);
  r = C.moveAABB(C.aabb(0, 0, 4, 4), 100, 100, [C.aabb(40, 0, 5, 200), C.aabb(0, 40, 200, 5)]);
  near(r.x, 31); near(r.y, 31);
  r = C.moveAABB(C.aabb(0, 0, 2, 2), 50000, 0, [C.aabb(900, 0, 1, 30), C.aabb(300, 0, 1, 30)]); near(r.x, 297); assert.equal(r.hits[0].index, 1);
  r = C.moveAABB(C.aabb(0, 0, 2, 2), 10, 5, []); assert.deepEqual([r.x, r.y], [10, 5]);
});

test('shapeCast: circle onto rotated box, rotated box onto capsule, misses, no hit when moving away', () => {
  const box = C.obb(50, 0, 10, 10, 0.5), c = C.circle(0, 0, 5);
  const h = C.shapeCast(c, 100, 0, box); assert.ok(h && h.t > 0 && h.t < 1 && !h.overlap);
  const at = C.translate(c, 100 * h.t, 0); near(C.distance(at, box).distance, 0, 1e-8); assert.ok(h.normal.x < 0);
  const h2 = C.shapeCast(C.obb(0, 0, 4, 4, 0.2), 80, 30, C.capsule(60, 20, 8, 4, 1.2)); assert.ok(h2 && h2.t > 0 && h2.t < 1);
  near(C.distance(C.translate(C.obb(0, 0, 4, 4, 0.2), 80 * h2.t, 30 * h2.t), C.capsule(60, 20, 8, 4, 1.2)).distance, 0, 1e-8);
  assert.equal(C.shapeCast(C.circle(0, 0, 3), 100, 0, C.aabb(50, 40, 5, 5)), null);
  assert.equal(C.shapeCast(C.circle(0, 0, 3), -100, 0, C.aabb(50, 0, 5, 5)), null);
  assert.equal(C.shapeCast(C.circle(0, 0, 3), 10, 0, C.aabb(50, 0, 5, 5)), null, 'too short');
  assert.ok(C.shapeCast(C.circle(0, 0, 3), 1e5, 0, C.aabb(5e4, 0, 1, 1)), 'huge speed still hits');
  assert.ok(C.shapeCast(C.circle(0, 0, 5), 0, 0, C.circle(3, 0, 5)).overlap, 'initially overlapping');
});

test('spatial hash: pairs are sorted, deduped, layer filtered, independent of insertion order', () => {
  const items = [0, 1, 2, 3, 4, 5].map((k) => ({ id: k, b: { minX: k * 10, minY: 0, maxX: k * 10 + 14, maxY: 10 } }));
  const build = (list) => { const h = C.createSpatialHash(16); for (const it of list) h.insert(it.id, it.b); return h; };
  const p = build(items).pairs();
  assert.deepEqual(p, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  assert.deepEqual(build([...items].reverse()).pairs(), p);
  assert.deepEqual(build([items[3], items[0], items[5], items[1], items[4], items[2]]).pairs(), p);
  const h = build(items); assert.deepEqual(h.query({ minX: 25, minY: 0, maxX: 45, maxY: 5 }), [2, 3, 4]);
  assert.deepEqual(h.queryPoint(12, 5), [0, 1]); // 0 spans 0..14, 1 spans 10..24
  h.remove(2); assert.ok(!h.has(2)); assert.equal(h.size(), 5);
  h.update(5, { minX: 0, minY: 0, maxX: 3, maxY: 3 }); assert.ok(h.pairs().some((q) => q[0] === 0 && q[1] === 5));
  const L = C.createSpatialHash(32);
  L.insert('b', { minX: 0, minY: 0, maxX: 20, maxY: 20 }, { layer: 1, mask: 2 }); L.insert('a', { minX: 10, minY: 10, maxX: 30, maxY: 30 }, { layer: 2, mask: 1 });
  L.insert(7, { minX: 12, minY: 12, maxX: 18, maxY: 18 }, { layer: 4, mask: 4 }); L.insert(3, { minX: 14, minY: 14, maxX: 16, maxY: 16 });
  assert.deepEqual(L.pairs(), [[3, 'a'], ['a', 'b']], 'numbers sort before strings; layer/mask both ways');
  assert.ok(L.pairs().some((q) => q[0] === 'a' && q[1] === 'b')); assert.ok(!L.pairs().some((q) => q.includes(7) && q.includes('a')));
  assert.deepEqual(L.pairs((a, b) => a !== 3 && b !== 3), [['a', 'b']]);
});

test('spatial hash handles negative coordinates, huge items and cell-boundary bounds', () => {
  const h = C.createSpatialHash(8);
  h.insert(1, { minX: -20, minY: -20, maxX: -4, maxY: -4 }); h.insert(2, { minX: -10, minY: -10, maxX: 10, maxY: 10 }); h.insert(3, { minX: -1e3, minY: -1e3, maxX: 1e3, maxY: 1e3 });
  assert.deepEqual(h.pairs(), [[1, 2], [1, 3], [2, 3]]);
  h.insert(4, { minX: 8, minY: 8, maxX: 16, maxY: 16 }); assert.ok(h.pairs().some((q) => q[0] === 2 && q[1] === 4));
});

test('tilemap: kinds, slopes, one-way filtering, outside solid, query order', () => {
  const tm = C.createTilemap({ cols: 6, rows: 4, tileSize: 16, x: 8, y: -4, tiles: [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 1, 4, 0, 0, 1, 1, 1, 1, 1, 1] });
  const all = tm.query({ minX: 8, minY: -4, maxX: 104, maxY: 60 });
  assert.deepEqual(all.map((c) => [c.row, c.col]), [...all.map((c) => [c.row, c.col])].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  const slope = tm.colliderAt(1, 2); assert.equal(slope.kind, 'slope'); near(C.surfaceY(slope, slope.minX), slope.maxY); near(C.surfaceY(slope, slope.maxX), slope.minY); near(C.surfaceY(slope, slope.minX + 8), slope.maxY - 8);
  assert.equal(C.surfaceY(slope, -1e9), slope.maxY, 'clamped to span');
  assert.deepEqual(tm.tileAt(9, -3), { col: 0, row: 0, kind: 0 });
  const ow = tm.colliderAt(2, 1); assert.equal(ow.kind, 'oneway');
  const above = C.aabb(ow.minX + 8, ow.minY - 4, 4, 4);
  assert.equal(C.collideSource(tm, C.translate(above, 0, 2), { prevMaxY: ow.minY }).filter((r) => r.collider.kind === 'oneway').length, 1, 'lands from above');
  assert.equal(C.collideSource(tm, C.translate(above, 0, 2), { prevMaxY: ow.minY + 10 }).filter((r) => r.collider.kind === 'oneway').length, 0, 'was already below the top');
  assert.equal(C.collideSource(tm, C.translate(above, 0, 2), { layer: 1, mask: 0 }).length, 0, 'mask filter');
  tm.set(0, 0, 1); assert.equal(tm.get(0, 0), 1); tm.set(99, 99, 1);
  const wall = C.createTilemap({ cols: 2, rows: 2, tileSize: 10, tiles: [0, 0, 0, 0], outside: 1 });
  assert.equal(wall.query({ minX: -5, minY: -5, maxX: 5, maxY: 5 }).length, 3); assert.ok(C.collideSource(wall, C.aabb(-2, 5, 3, 3)).length > 0);
});

test('slope colliders collide as polygons', () => {
  const tm = C.createTilemap({ cols: 3, rows: 1, tileSize: 16, tiles: [3, 3, 0] });
  const s = tm.colliderAt(0, 0), shape = C.colliderShape(s);
  assert.ok(C.containsPoint(shape, 14, 14)); assert.ok(!C.containsPoint(shape, 2, 2));
  const hit = C.raycast(shape, 2, -10, 0, 1, 100); assert.ok(hit); near(hit.y, 14);
});

test('scene + fromPlatformerWorld: ground between pits and one-way platforms', () => {
  const sc = C.fromPlatformerWorld({ groundY: 160, pits: [{ x0: 60, x1: 80 }], platforms: [{ x: 120, y: 130, w: 40 }] }, { minX: 0, maxX: 320 });
  const kinds = sc.colliders.map((c) => c.kind); assert.deepEqual(kinds, ['solid', 'solid', 'oneway']);
  assert.equal(sc.query({ minX: 65, minY: 150, maxX: 75, maxY: 170 }).length, 0, 'pit is empty');
  assert.equal(sc.query({ minX: 100, minY: 125, maxX: 110, maxY: 135 }).length, 1);
});

test('determinism: repeated identical calls are identical; overlapAll ordering', () => {
  const a = C.obb(0, 0, 10, 5, 0.37), b = C.polygon(8, 3, [{ x: -8, y: 6 }, { x: 9, y: 6 }, { x: 0, y: -10 }], 1.1);
  assert.equal(JSON.stringify(C.collide(a, b)), JSON.stringify(C.collide(a, b)));
  assert.deepEqual(C.overlapAll(C.circle(0, 0, 6), [C.aabb(100, 0, 1, 1), C.aabb(5, 0, 2, 2), C.circle(-8, 0, 3)]), [1, 2]);
});
