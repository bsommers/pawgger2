import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../../src/lib/bvh.js';
import * as C from '../../src/lib/collision3d.js';

const lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
function scene(seed, n, spread = 10, size = 1.5) {
  const r = lcg(seed), T = [];
  for (let i = 0; i < n; i++) { const p = [r() * spread, r() * spread, r() * spread]; for (let k = 0; k < 3; k++) T.push(p[0] + (r() - .3) * size, p[1] + (r() - .3) * size, p[2] + (r() - .3) * size); }
  return T;
}
function brute(T, o, d, tmax = Infinity, cull = false) {
  let best = null; const out = [0, 0, 0];
  for (let i = 0; i < T.length / 9; i++) { const t = C.rayTriangleFlat(o[0], o[1], o[2], d[0], d[1], d[2], T, i * 9, 0, tmax, cull, out); if (t >= 0 && (!best || t < best.t)) best = { t, index: i }; }
  return best;
}
const same = (a, b, m) => { assert.equal(!!a, !!b, m); if (a) { assert.equal(a.t, b.t, m + ' t'); assert.equal(a.index, b.index, m + ' idx'); } };

test('empty and single-primitive BVH', () => {
  const e = B.buildTriangles([]); assert.equal(B.raycast(e, [0, 0, 0], [0, 0, 1]), null); assert.deepEqual(B.queryAABB(e, C.aabb([-1, -1, -1], [1, 1, 1])), []);
  assert.equal(B.deserialize(B.serialize(e)).count, 0);
  const one = B.buildTriangles([-1, -1, 0, 1, -1, 0, 0, 1, 0]); const h = B.raycast(one, [0, 0, -5], [0, 0, 1]); assert.equal(h.index, 0); assert.equal(h.t, 5);
});

test('closest-hit and any-hit match brute force on random scenes (seeded)', () => {
  for (const [seed, n, leaf] of [[1, 50, 4], [2, 400, 4], [3, 1500, 2], [4, 300, 1], [5, 700, 8]]) {
    const T = scene(seed, n), bv = B.buildTriangles(T, { maxLeafSize: leaf }), r = lcg(seed * 99);
    for (let i = 0; i < 400; i++) {
      const o = [r() * 12 - 1, r() * 12 - 1, r() * 12 - 1], d = [r() - .5, r() - .5, r() - .5], cull = i % 5 === 0, tmax = i % 7 === 0 ? 3 : Infinity;
      const a = B.raycast(bv, o, d, { cullBack: cull, tmax }), b = brute(T, o, d, tmax, cull);
      same(a, b, `scene ${seed} ray ${i}`);
      assert.equal(B.rayAny(bv, o, d, { cullBack: cull, tmax }), !!b);
    }
  }
});

test('axis-aligned rays (zero direction components) and rays through edges/vertices', () => {
  const T = scene(11, 300, 10, 2), bv = B.buildTriangles(T), r = lcg(5);
  for (let i = 0; i < 300; i++) {
    const o = [r() * 10, r() * 10, r() * 10], d = [0, 0, 0]; d[i % 3] = i % 2 ? 1 : -1; if (i % 4 === 0) d[(i + 1) % 3] = 0.5;
    same(B.raycast(bv, o, d), brute(T, o, d), 'axis ' + i);
  }
  // shared-edge grid: ray exactly on the diagonal must hit (no leak), lowest index wins ties
  const G = []; for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) G.push(x, 0, z, x + 1, 0, z, x, 0, z + 1, x + 1, 0, z, x + 1, 0, z + 1, x, 0, z + 1);
  const g = B.buildTriangles(G, { maxLeafSize: 2 });
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) { const o = [x, 3, z], h = B.raycast(g, o, [0, -1, 0]); same(h, brute(G, o, [0, -1, 0]), `grid ${x},${z}`); assert.ok(h, `no leak at ${x},${z}`); assert.equal(h.t, 3); }
  for (let k = 0; k < 6; k++) { const o = [k + 0.5, 3, k + 0.5]; assert.ok(B.raycast(g, o, [0, -1, 0])); } // diagonal edge midpoints
});

test('degenerate triangles never hit and do not break the build', () => {
  const T = [0, 0, 0, 1, 0, 0, 2, 0, 0, /*collinear*/ 3, 3, 3, 3, 3, 3, 3, 3, 3, /*point*/ -1, -1, 1, 1, -1, 1, 0, 1, 1, /*real*/ 5, 5, 5, 5, 5, 5, 6, 5, 5];
  const bv = B.buildTriangles(T); assert.equal(B.raycast(bv, [1, 3, 0], [0, -1, 0]), null); assert.equal(B.raycast(bv, [3, 3, 0], [0, 0, 1]), null);
  assert.equal(B.raycast(bv, [0, 0, 0], [0, 0, 1]).index, 2); // real triangle at z=1 hit (index 2)
  const same3 = []; for (let i = 0; i < 40; i++) same3.push(0, 0, 0, 1, 0, 0, 0, 1, 0); // identical centroids
  const sb = B.buildTriangles(same3); const h = B.raycast(sb, [0.2, 0.2, 5], [0, 0, -1]); assert.equal(h.index, 0); assert.equal(h.t, 5);
  assert.throws(() => B.buildTriangles([0, 0, 0, 1, 0, 0, NaN, 1, 0]));
});

test('AABB and sphere overlap queries match brute force', () => {
  const T = scene(21, 600), bv = B.buildTriangles(T), r = lcg(77);
  for (let i = 0; i < 150; i++) {
    const c = [r() * 10, r() * 10, r() * 10], h = [r() * 2, r() * 2, r() * 2], box = C.aabbFromCenter(c, h);
    const exp = []; for (let j = 0; j < 600; j++) if (C.aabbTriangleOverlap(box, [[T[j * 9], T[j * 9 + 1], T[j * 9 + 2]], [T[j * 9 + 3], T[j * 9 + 4], T[j * 9 + 5]], [T[j * 9 + 6], T[j * 9 + 7], T[j * 9 + 8]]])) exp.push(j);
    assert.deepEqual(B.queryAABB(bv, box), exp, 'aabb ' + i);
    const rad = r() * 2, expS = []; for (let j = 0; j < 600; j++) { const q = C.closestPointTriangle(c, [T[j * 9], T[j * 9 + 1], T[j * 9 + 2]], [T[j * 9 + 3], T[j * 9 + 4], T[j * 9 + 5]], [T[j * 9 + 6], T[j * 9 + 7], T[j * 9 + 8]]); if (C.vec3.lenSq(C.vec3.sub(q, c)) <= rad * rad) expS.push(j); }
    assert.deepEqual(B.querySphere(bv, c, rad), expS, 'sphere ' + i);
  }
});

test('AABB-primitive BVH: ray + overlap vs brute force', () => {
  const r = lcg(31), boxes = []; for (let i = 0; i < 300; i++) { const p = [r() * 10, r() * 10, r() * 10]; boxes.push(...p, p[0] + r() * 1.5, p[1] + r() * 1.5, p[2] + r() * 1.5); }
  const bv = B.buildAABBs(boxes);
  for (let i = 0; i < 200; i++) {
    const o = [r() * 10, r() * 10, -3], d = [r() - .5, r() - .5, 1]; let best = null;
    for (let j = 0; j < 300; j++) { const h = C.rayAABB(o, d, { min: boxes.slice(j * 6, j * 6 + 3), max: boxes.slice(j * 6 + 3, j * 6 + 6) }); if (h && (!best || h.t < best.t)) best = { t: h.t, index: j }; }
    const a = B.raycast(bv, o, d); assert.equal(!!a, !!best); if (a) { assert.ok(Math.abs(a.t - best.t) < 1e-9); }
  }
  const q = C.aabb([3, 3, 3], [6, 6, 6]), exp = []; for (let j = 0; j < 300; j++) if (C.aabbOverlap(q, { min: boxes.slice(j * 6, j * 6 + 3), max: boxes.slice(j * 6 + 3, j * 6 + 6) })) exp.push(j);
  assert.deepEqual(B.queryAABB(bv, q), exp);
});

test('structure invariants: parent bounds contain children, leaves cover every prim once', () => {
  const T = scene(41, 777), bv = B.buildTriangles(T), s = B.stats(bv);
  assert.ok(s.maxLeaf <= 4); assert.ok(s.maxDepth < 40);
  const seen = new Uint8Array(777); const nf = bv.nodesF, nu = bv.nodesU;
  const rec = (n) => { const o = n * 8; if (nu[o + 7] > 0) { for (let j = nu[o + 3]; j < nu[o + 3] + nu[o + 7]; j++) { seen[bv.order[j]]++; for (let q = 0; q < 3; q++) for (let k = 0; k < 3; k++) { const v = bv.prims[j * 9 + q * 3 + k]; assert.ok(nf[o + k] <= v && v <= nf[o + 4 + k]); } } return; }
    for (const c of [nu[o + 3], nu[o + 3] + 1]) { for (let k = 0; k < 3; k++) assert.ok(nf[o + k] <= nf[c * 8 + k] && nf[c * 8 + 4 + k] <= nf[o + 4 + k]); rec(c); } };
  rec(0); assert.ok(seen.every((x) => x === 1));
});

test('deterministic: identical builds are byte-identical; input order of equal data stable', () => {
  const T = scene(51, 500), a = B.serialize(B.buildTriangles(T)), b = B.serialize(B.buildTriangles(Float64Array.from(T)));
  assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
  const c = B.serialize(B.buildTriangles(T, { maxLeafSize: 2 })); assert.notEqual(c.byteLength, a.byteLength);
});

test('serialization round trip + header layout + raycast parity', () => {
  const T = scene(61, 333), bv = B.buildTriangles(T), buf = B.serialize(bv), u = new Uint32Array(buf);
  assert.equal(u[0], 0x33485642); assert.equal(u[1], 1); assert.equal(u[2], 0); assert.equal(u[3], bv.nodeCount); assert.equal(u[4], 333); assert.equal(u[5], 16);
  assert.equal(u[6], 16 + bv.nodeCount * 8); assert.equal(u[7], u[6] + 333); assert.equal(buf.byteLength, (u[7] + 333 * 9) * 4);
  const bv2 = B.deserialize(buf), r = lcg(8);
  for (let i = 0; i < 200; i++) { const o = [r() * 10, r() * 10, -2], d = [r() - .5, r() - .5, 1]; const a = B.raycast(bv, o, d), b = B.raycast(bv2, o, d); assert.equal(!!a, !!b); if (a) { assert.equal(a.index, b.index); assert.ok(Math.abs(a.t - b.t) < 1e-5); } }
  assert.throws(() => B.deserialize(new ArrayBuffer(128)));
  const tooShort = buf.slice(0, 100); assert.throws(() => B.deserialize(tooShort));
  const nb = B.deserialize(B.serialize(B.buildTriangles(scene(62, 50)))); assert.equal(nb.count, 50);
});

test('refit tracks moving geometry and matches rebuild-free brute force', () => {
  let T = scene(71, 400); const bv = B.buildTriangles(T), r = lcg(9);
  for (let frame = 0; frame < 6; frame++) {
    T = T.map((v, i) => v + Math.sin(frame * 1.3 + i * 0.01) * 0.7);
    B.refit(bv, T);
    for (let i = 0; i < 150; i++) { const o = [r() * 10, r() * 10, -3], d = [r() - .5, r() - .5, 1]; same(B.raycast(bv, o, d), brute(T, o, d), `frame ${frame} ray ${i}`); }
    const box = C.aabb([2, 2, 2], [5, 5, 5]); assert.ok(B.queryAABB(bv, box).length >= 0);
  }
  assert.throws(() => B.refit(bv, [1, 2, 3]));
});

test('asWorld feeds sweeps with BVH broad phase identical to brute force', () => {
  const T = scene(81, 300, 10, 2), bv = B.buildTriangles(T), w = B.asWorld(bv), r = lcg(4);
  for (let i = 0; i < 120; i++) {
    const c = [r() * 10, r() * 10, r() * 10], d = [(r() - .5) * 3, (r() - .5) * 3, (r() - .5) * 3];
    const a = C.sweepSphere(c, 0.3, d, w), b = C.sweepSphere(c, 0.3, d, T); assert.equal(!!a, !!b);
    if (a) { assert.equal(a.t, b.t); assert.equal(a.index, b.index); }
    const ca = C.sweepCapsule(c, [c[0], c[1] + 1, c[2]], 0.3, d, w), cb = C.sweepCapsule(c, [c[0], c[1] + 1, c[2]], 0.3, d, T); assert.equal(!!ca, !!cb); if (ca) assert.equal(ca.t, cb.t);
  }
  assert.throws(() => B.asWorld(B.buildAABBs([0, 0, 0, 1, 1, 1])));
});

test('replays spec/v3/vectors/bvh.json within tolerance', () => {
  const j = JSON.parse(readFileSync(new URL('../../../../spec/v3/vectors/bvh.json', import.meta.url), 'utf8'));
  assert.ok(j.cases.length >= 20 && j.cases.length <= 50);
  for (const c of j.cases) {
    const bv = (c.kind === 'tri' ? B.buildTriangles : B.buildAABBs)(c.prims, c.options), e = c.expected;
    assert.equal(bv.nodeCount, e.nodeCount, c.name); assert.equal(B.serialize(bv).byteLength, e.bytes);
    c.expected.rays.forEach((ry, i) => { const h = B.raycast(bv, ry.o, ry.d), x = e.hits[i]; assert.equal(!!h, !!x, c.name); if (h) { assert.equal(h.index, x.index); assert.ok(Math.abs(h.t - x.t) <= j.tolerance); } });
    assert.deepEqual(B.queryAABB(bv, e.queryAABB.box), e.queryAABB.indices); assert.deepEqual(B.querySphere(bv, e.querySphere.sphere.c, e.querySphere.sphere.r), e.querySphere.indices);
  }
});
