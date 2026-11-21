import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as C from '../../src/lib/collision3d.js';

const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} vs ${b}`);
const nearV = (a, b, e = 1e-9) => a.forEach((x, i) => near(x, b[i], e, 'v' + i));
const lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

test('sphere/sphere contact, touching is no contact, coincident centres', () => {
  const r = C.sphereSphere({ c: [0, 0, 0], r: 1 }, { c: [1.5, 0, 0], r: 1 });
  nearV(r.normal, [-1, 0, 0]); near(r.depth, 0.5);
  assert.equal(C.sphereSphere({ c: [0, 0, 0], r: 1 }, { c: [2, 0, 0], r: 1 }), null);
  const k = C.sphereSphere({ c: [0, 0, 0], r: 1 }, { c: [0, 0, 0], r: 1 }); near(k.depth, 2); nearV(k.normal, [0, 1, 0]);
});

test('translating A by normal*depth separates it (property, seeded)', () => {
  const r = lcg(7), v = (s) => [(r() - .5) * s, (r() - .5) * s, (r() - .5) * s];
  for (let i = 0; i < 200; i++) {
    const A = { c: v(3), r: 0.5 + r() }, box = { min: [-1, -1, -1], max: [1, 1, 1.5] };
    const k = C.sphereAABB(A, box); if (!k) continue;
    near(Math.hypot(...k.normal), 1, 1e-9);
    const moved = { c: C.vec3.madd(A.c, k.normal, k.depth + 1e-7), r: A.r };
    assert.equal(C.sphereAABB(moved, box), null, 'sphereAABB sep ' + i);
    const cap = { a: v(2), b: v(2), r: 0.4 }, cap2 = { a: v(2), b: v(2), r: 0.5 }, kc = C.capsuleCapsule(cap, cap2);
    if (kc) { const m = { a: C.vec3.madd(cap.a, kc.normal, kc.depth + 1e-7), b: C.vec3.madd(cap.b, kc.normal, kc.depth + 1e-7), r: cap.r }; assert.equal(C.capsuleCapsule(m, cap2), null, 'cap ' + i); }
    const tri = [v(3), v(3), v(3)], kt = C.sphereTriangle(A, tri);
    if (kt) assert.equal(C.sphereTriangle({ c: C.vec3.madd(A.c, kt.normal, kt.depth + 1e-7), r: A.r }, tri), null, 'tri ' + i);
  }
});

test('aabb/aabb, planes, sphere inside box', () => {
  const k = C.aabbAABB(C.aabb([0, 0, 0], [2, 2, 2]), C.aabb([1.5, 0, 0], [4, 2, 2]));
  nearV(k.normal, [-1, 0, 0]); near(k.depth, 0.5);
  assert.equal(C.aabbAABB(C.aabb([0, 0, 0], [1, 1, 1]), C.aabb([1, 0, 0], [2, 1, 1])), null);
  const p = C.sphereAABB({ c: [0, 0.9, 0], r: 0.5 }, C.aabb([-1, -1, -1], [1, 1, 1])); nearV(p.normal, [0, 1, 0]); near(p.depth, 0.6);
  const pl = C.plane([0, 1, 0], 0); near(C.spherePlane({ c: [0, 0.3, 0], r: 0.5 }, pl).depth, 0.2);
  assert.equal(C.capsulePlane(C.capsule([0, 1, 0], [0, 2, 0], 0.5), pl), null);
  near(C.aabbPlane(C.aabb([-1, -1, -1], [1, 1, 1]), pl).depth, 1);
});

test('obb/obb SAT: rotated overlap and separation', () => {
  const q45 = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
  const a = C.obbFromQuat([0, 0, 0], [1, 1, 1], [0, 0, 0, 1]), b = C.obbFromQuat([2.2, 0, 0], [1, 1, 1], q45);
  const k = C.obbOBB(a, b); assert.ok(k); assert.ok(k.depth > 0 && k.depth < 0.3); assert.ok(k.normal[0] < 0);
  assert.equal(C.obbOBB(a, C.obbFromQuat([2.5, 0, 0], [1, 1, 1], q45)), null);
  const ident = C.obbOBB(C.obb([0, 0, 0], [1, 1, 1]), C.obb([1.5, 0, 0], [1, 1, 1])); near(ident.depth, 0.5);
});

test('capsule vs triangle: crossing, side, end cap', () => {
  const tri = [[-2, 0, -2], [2, 0, -2], [0, 0, 2]];
  const k = C.capsuleTriangle(C.capsule([0, -1, 0], [0, 1, 0], 0.25), tri); assert.ok(k); near(k.depth, 1.25);
  const s = C.capsuleTriangle(C.capsule([0, 0.5, 0], [0, 1.5, 0], 0.75), tri); nearV(s.normal, [0, 1, 0]); near(s.depth, 0.25);
  assert.equal(C.capsuleTriangle(C.capsule([0, 0.8, 0], [0, 1.5, 0], 0.75), tri), null);
});

test('closest points: triangle regions, degenerate triangle, seg/seg', () => {
  const t = [[0, 0, 0], [2, 0, 0], [0, 0, 2]];
  nearV(C.closestPointTriangle([0.5, 3, 0.5], ...t), [0.5, 0, 0.5]);
  nearV(C.closestPointTriangle([-1, 1, -1], ...t), [0, 0, 0]);
  nearV(C.closestPointTriangle([3, 0, 3], ...t), [1, 0, 1]);
  nearV(C.closestPointTriangle([1, 5, -1], ...t), [1, 0, 0]);
  nearV(C.closestPointTriangle([1, 1, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]), [1, 0, 0]); // collinear degenerate
  nearV(C.closestPointTriangle([5, 5, 5], [1, 1, 1], [1, 1, 1], [1, 1, 1]), [1, 1, 1]); // point triangle
  const r = C.closestSegSeg([0, 0, 0], [2, 0, 0], [1, 1, -1], [1, 1, 1]); near(r.d2, 1); near(r.s, 0.5); near(r.t, 0.5);
  const par = C.closestSegSeg([0, 0, 0], [1, 0, 0], [3, 1, 0], [4, 1, 0]); near(par.d2, 5);
  nearV(C.closestPointAABB([5, 0, 0], C.aabb([-1, -1, -1], [1, 1, 1])), [1, 0, 0]);
  nearV(C.closestPointOBB([5, 0, 0], C.obb([0, 0, 0], [1, 1, 1])), [1, 0, 0]);
});

test('rays: sphere, aabb, obb, capsule, plane', () => {
  let h = C.raySphere([0, 0, -5], [0, 0, 1], { c: [0, 0, 0], r: 1 }); near(h.t, 4); nearV(h.normal, [0, 0, -1]);
  assert.equal(C.raySphere([0, 0, -5], [0, 0, -1], { c: [0, 0, 0], r: 1 }), null);
  assert.equal(C.raySphere([0, 2, -5], [0, 0, 1], { c: [0, 0, 0], r: 1 }), null);
  near(C.raySphere([0, 0, -5], [0, 0, 10], { c: [0, 0, 0], r: 1 }).t, 0.4); // non-unit d
  assert.equal(C.raySphere([0, 0, 0], [0, 0, 1], { c: [0, 0, 0], r: 1 }).t, 0); // inside
  h = C.rayAABB([-5, 0.5, 0.5], [1, 0, 0], C.aabb([-1, -1, -1], [1, 1, 1])); near(h.t, 4); nearV(h.normal, [-1, 0, 0]);
  assert.equal(C.rayAABB([-5, 2, 0], [1, 0, 0], C.aabb([-1, -1, -1], [1, 1, 1])), null);
  h = C.rayAABB([0, 0, 5], [0, 0, -1], C.aabb([-1, -1, -1], [1, 1, 1])); nearV(h.normal, [0, 0, 1]); // d has zero comps
  h = C.rayOBB([0, 0, -5], [0, 0, 1], C.obbFromQuat([0, 0, 0], [1, 1, 1], [0, Math.SQRT1_2, 0, Math.SQRT1_2])); near(h.t, 4);
  h = C.rayCapsule([-5, 0, 0], [1, 0, 0], C.capsule([0, -2, 0], [0, 2, 0], 0.5)); near(h.t, 4.5); nearV(h.normal, [-1, 0, 0]);
  h = C.rayCapsule([-5, 2.3, 0], [1, 0, 0], C.capsule([0, -2, 0], [0, 2, 0], 0.5)); assert.ok(h); // end cap
  assert.equal(C.rayCapsule([-5, 2.6, 0], [1, 0, 0], C.capsule([0, -2, 0], [0, 2, 0], 0.5)), null);
  h = C.rayPlane([0, 5, 0], [0, -1, 0], C.plane([0, 1, 0], 0)); near(h.t, 5);
  assert.equal(C.rayPlane([0, 5, 0], [1, 0, 0], C.plane([0, 1, 0], 0)), null);
});

test('moller-trumbore: hit, back face, cull, parallel, edges, vertices, degenerate', () => {
  const tri = [[-2, 0, -2], [2, 0, -2], [0, 0, 2]]; // CCW from +Y? normal = (b-a)x(c-a)
  const n = C.triNormal(...tri);
  const down = C.rayTriangle([0, 3, 0], [0, -1, 0], tri); near(down.t, 3);
  const up = C.rayTriangle([0, -3, 0], [0, 1, 0], tri); assert.notEqual(down.front, up.front);
  assert.equal(Math.sign(down.normal[1]), 1); assert.equal(Math.sign(up.normal[1]), -1); // normal faces the ray
  assert.equal(C.rayTriangle([0, 3, 0], [0, -1, 0], tri, { cullBack: down.front ? false : true }), null);
  assert.equal(C.rayTriangle([0, 3, 0], [1, 0, 0], tri), null); // parallel
  near(C.rayTriangle([0, 3, -2], [0, -1, 0], tri).t, 3); // on edge ab
  near(C.rayTriangle([-2, 3, -2], [0, -1, 0], tri).t, 3); // on vertex
  near(C.rayTriangle([1, 3, 0], [0, -1, 0], tri).t, 3); // on edge bc (midpoint (1,0,0))
  assert.equal(C.rayTriangle([0, 3, -2.001], [0, -1, 0], tri), null);
  assert.equal(C.rayTriangle([0, 3, 0], [0, -1, 0], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]), null); // zero area
  assert.equal(C.rayTriangle([0, 3, 0], [0, -1, 0], [[1, 0, 1], [1, 0, 1], [1, 0, 1]]), null);
  assert.equal(C.rayTriangle([0, 3, 0], [0, 1, 0], tri), null); // behind
  assert.equal(C.rayTriangle([0, 3, 0], [0, -1, 0], tri, { tmax: 2 }), null);
  assert.ok(n);
});

test('sweepSphere onto floor, wall, edge, start-penetrating, miss', () => {
  const floor = [-10, 0, -10, 10, 0, 10, 10, 0, -10, -10, 0, -10, -10, 0, 10, 10, 0, 10];
  // make sure triangle winding doesn't matter
  let h = C.sweepSphere([0, 3, 0], 0.5, [0, -5, 0], floor); near(h.t, 0.5); nearV(h.normal, [0, 1, 0]); assert.ok(h.index >= 0);
  assert.equal(C.sweepSphere([0, 3, 0], 0.5, [0, 1, 0], floor), null);
  assert.equal(C.sweepSphere([0, 3, 0], 0.5, [0, -2, 0], floor), null);
  h = C.sweepSphere([0, 0.4, 0], 0.5, [0, -1, 0], floor); assert.equal(h.t, 0); assert.ok(h.penetrating);
  const wall = [5, -5, -5, 5, 5, -5, 5, 0, 5];
  h = C.sweepSphere([0, 0, 0], 1, [10, 0, 0], wall); near(h.t, 0.4); nearV(h.normal, [-1, 0, 0]);
  // edge: sphere sliding down onto an edge of a lone triangle
  const t = [0, 0, 0, 4, 0, 0, 0, 0, 4];
  h = C.sweepSphere([-1, 0.5, 0.5], 0.5, [1, -0.5, 0], t); assert.ok(h); assert.ok(h.t > 0 && h.t < 1);
});

test('sweepCapsule: lands on floor and hits wall', () => {
  const floor = [-10, 0, -10, 10, 0, 10, 10, 0, -10, -10, 0, -10, -10, 0, 10, 10, 0, 10];
  let h = C.sweepCapsule([0, 0.5, 0], [0, 1.5, 0], 0.5, [0, -2, 0], floor); assert.ok(h.t < 1e-6); // starts touching: t ~ 0
  h = C.sweepCapsule([0, 1.5, 0], [0, 2.5, 0], 0.5, [0, -3, 0], floor); near(h.t, 1 / 3, 1e-7); nearV(h.normal, [0, 1, 0], 1e-6);
  const wall = [5, -5, -5, 5, 5, -5, 5, 0, 5];
  h = C.sweepCapsule([0, 0, 0], [0, 1, 0], 0.5, [10, 0, 0], wall); near(h.t, 0.45, 1e-7);
  assert.equal(C.sweepCapsule([0, 10, 0], [0, 11, 0], 0.5, [10, 0, 0], wall), null);
});

const box = (x0, y0, z0, x1, y1, z1) => { // 12 tris, outward CCW
  const v = (x, y, z) => [x, y, z], p = [v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)];
  const q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]], out = [];
  for (const [a, b, c, d] of q) out.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[d]);
  return out;
};
const floorTris = [-50, 0, -50, -50, 0, 50, 50, 0, 50, -50, 0, -50, 50, 0, 50, 50, 0, -50];

test('character: gravity lands, stays grounded, walks, blocked by wall and slides along it', () => {
  const world = [...floorTris, ...box(5, 0, -5, 6, 3, 5)];
  const ch = C.createCharacter({ pos: [0, 2, 0] }); const dt = 1 / 60;
  for (let i = 0; i < 120; i++) C.moveAndSlide(ch, [0, ch.grounded ? 0 : ch.vel[1] - 20 * dt, 0], dt, world);
  assert.ok(ch.grounded); near(ch.pos[1], 0, 1e-3);
  for (let i = 0; i < 300; i++) C.moveAndSlide(ch, [3, -1, 0], dt, world);
  assert.ok(ch.pos[0] < 5 - 0.4 + 1e-3 && ch.pos[0] > 4.4, 'stops at wall ' + ch.pos[0]); assert.ok(ch.grounded);
  const z0 = ch.pos[2]; for (let i = 0; i < 60; i++) C.moveAndSlide(ch, [3, -1, 3], dt, world);
  assert.ok(ch.pos[2] > z0 + 1, 'slides along wall'); assert.ok(ch.pos[0] < 4.61);
  assert.ok(ch.grounded);
});

test('character: steps up small ledge, blocked by tall ledge, jumps, hits ceiling, slope limit', () => {
  const dt = 1 / 60, settle = (ch, w) => { for (let i = 0; i < 60; i++) C.moveAndSlide(ch, [0, -5, 0], dt, w); };
  let w = [...floorTris, ...box(2, 0, -5, 9, 0.25, 5)];
  let ch = C.createCharacter({ pos: [0, 0, 0] }); settle(ch, w);
  for (let i = 0; i < 120; i++) C.moveAndSlide(ch, [2, -1, 0], dt, w);
  assert.ok(ch.pos[0] > 3, 'stepped up ' + ch.pos); near(ch.pos[1], 0.25, 2e-3);
  w = [...floorTris, ...box(2, 0, -5, 9, 0.8, 5)]; ch = C.createCharacter({ pos: [0, 0, 0] }); settle(ch, w);
  for (let i = 0; i < 120; i++) C.moveAndSlide(ch, [2, -1, 0], dt, w);
  assert.ok(ch.pos[0] < 2 - 0.4 + 1e-3 && ch.pos[1] < 0.01, 'blocked ' + ch.pos);
  // jump
  w = floorTris; ch = C.createCharacter({ pos: [0, 0, 0] }); settle(ch, w); let vy = 6, peak = 0;
  for (let i = 0; i < 40; i++) { vy -= 20 * dt; C.moveAndSlide(ch, [0, vy, 0], dt, w); peak = Math.max(peak, ch.pos[1]); if (ch.grounded) break; }
  assert.ok(peak > 0.5 && peak < 1.2, 'jump peak ' + peak); assert.ok(ch.grounded);
  // ceiling
  w = [...floorTris, ...box(-5, 2, -5, 5, 3, 5)]; ch = C.createCharacter({ pos: [0, 0, 0] }); settle(ch, w);
  for (let i = 0; i < 30; i++) C.moveAndSlide(ch, [0, 8, 0], dt, w);
  assert.ok(ch.pos[1] + ch.height <= 2 + 1e-3, 'head below ceiling ' + ch.pos[1]);
  // slopes: 30 deg walkable (holds position), 70 deg slides/blocks
  for (const [deg, walk] of [[30, true], [70, false]]) {
    const a = deg * Math.PI / 180;
    const x1 = 10, y1 = 10 * Math.tan(a), tr = [0, 0, -10, x1, y1, -10, 0, 0, 10, x1, y1, -10, x1, y1, 10, 0, 0, 10];
    const wd = [...tr, -20, 0, -10, 0, 0, 10, 0, 0, -10, -20, 0, -10, -20, 0, 10, 0, 0, 10];
    const c2 = C.createCharacter({ pos: [-1, 0, 0] }); for (let i = 0; i < 60; i++) C.moveAndSlide(c2, [0, -5, 0], dt, wd);
    for (let i = 0; i < 90; i++) C.moveAndSlide(c2, [2, -1, 0], dt, wd);
    if (walk) { assert.ok(c2.pos[1] > 0.3 && c2.grounded, `30deg climbs ${c2.pos}`); } else assert.ok(c2.pos[1] < 0.4, `70deg blocked ${c2.pos}`);
  }
});

test('character: determinism and BVH world parity', async () => {
  const B = await import('../../src/lib/bvh.js');
  const world = [...floorTris, ...box(3, 0, -5, 4, 2, 5), ...box(-3, 0, -5, -2, 0.2, 5)];
  const run = (w) => { const ch = C.createCharacter({ pos: [0, 1, 0] }); const trace = []; for (let i = 0; i < 400; i++) { C.moveAndSlide(ch, [Math.sin(i / 40) * 4, -4, Math.cos(i / 55) * 2], 1 / 60, w); trace.push(...ch.pos); } return trace; };
  assert.deepEqual(run(world), run(world));
  assert.deepEqual(run(world), run(B.asWorld(B.buildTriangles(world))));
});

const colVec = new URL('../../../../spec/v3/vectors/collision3d.json', import.meta.url);
test('vectors file is well-formed', { skip: !existsSync(colVec) && 'spec vectors not present in this project' }, () => {
  const j = JSON.parse(readFileSync(new URL('../../../../spec/v3/vectors/collision3d.json', import.meta.url), 'utf8').toString());
  assert.ok(j.cases.length >= 20 && j.cases.length <= 60); assert.equal(j.tolerance, 1e-9);
});

test('source has no Math.random', () => {
  for (const f of ['collision3d', 'bvh']) assert.ok(!/Math\.random/.test(readFileSync(new URL(`../../src/lib/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), f);
});
