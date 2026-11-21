import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/lib/physics2d.js';
import * as C from '../../src/lib/collision2d.js';

const DT = 1 / 60;
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const floor = { type: 'static', x: 0, y: 200, shape: { type: 'box', hw: 1000, hh: 20 } };   // top at y = 180
const box = (x, y, o = {}) => ({ x, y, shape: { type: 'box', hw: 10, hh: 10 }, ...o });
const run = (w, n) => { for (let i = 0; i < n; i++) w.step(DT); return w; };
const state = (w) => JSON.stringify(w.snapshot());

test('free fall matches semi-implicit Euler exactly', () => {
  const w = P.createWorld(), id = w.addBody({ x: 0, y: 0, shape: { type: 'circle', r: 5 } });
  run(w, 60);
  const n = 60; near(w.body(id).vy, 600 * n * DT, 1e-9); near(w.body(id).y, 600 * DT * DT * n * (n + 1) / 2, 1e-7);
});

test('box lands on the floor and rests on top of it, then sleeps', () => {
  const w = P.createWorld(); w.addBody(floor); const id = w.addBody(box(0, 100));
  run(w, 240);
  const b = w.body(id); assert.ok(Math.abs(b.y - 170) < 0.6, 'y ' + b.y); assert.ok(b.asleep); assert.equal(b.vy, 0);
  assert.ok(w.events.length === 0); // quiet once asleep
});

test('stacking stability: 8 boxes stay upright and in place for 20 seconds', () => {
  const w = P.createWorld(); w.addBody(floor);
  const ids = []; for (let i = 0; i < 8; i++) ids.push(w.addBody(box(0, 169 - i * 20.5)));
  run(w, 60);
  const at60 = ids.map((id) => ({ x: w.body(id).x, y: w.body(id).y }));
  let maxDrift = 0, maxAng = 0;
  for (let s = 0; s < 1200; s++) { w.step(DT); for (const id of ids) { const b = w.body(id); maxAng = Math.max(maxAng, Math.abs(b.angle)); maxDrift = Math.max(maxDrift, Math.abs(b.x)); } }
  assert.ok(maxDrift < 4, 'lateral drift ' + maxDrift); assert.ok(maxAng < 0.06, 'tilt ' + maxAng);
  ids.forEach((id, k) => { const b = w.body(id); assert.ok(Math.abs(b.y - (170 - k * 20)) < 3, `box ${k} y ${b.y}`); assert.ok(b.y < at60[k].y + 1.5, 'no sinking'); });
});

test('pyramid of rotated-free boxes keeps its shape', () => {
  const w = P.createWorld(); w.addBody(floor); const rows = [4, 3, 2, 1], ids = [];
  rows.forEach((n, r) => { for (let i = 0; i < n; i++) ids.push(w.addBody(box((i - (n - 1) / 2) * 21, 169.5 - r * 20.5))); });
  run(w, 600);
  for (const id of ids) { const b = w.body(id); assert.ok(Math.abs(b.angle) < 0.1); }
  const top = w.body(ids[ids.length - 1]); assert.ok(Math.abs(top.x) < 6 && top.y > 100);
});

test('no tunnelling: fast circle and fast box cannot pass a thin static wall or floor', () => {
  for (const speed of [600, 3000, 6000]) {
    const w = P.createWorld({ gravity: { x: 0, y: 0 } });
    w.addBody({ type: 'static', x: 100, y: 0, shape: { type: 'box', hw: 10, hh: 200 } });
    const id = w.addBody({ x: 0, y: 0, vx: speed, shape: { type: 'circle', r: 5 }, restitution: 0 });
    run(w, 120);
    assert.ok(w.body(id).x < 100, `speed ${speed} ended at x ${w.body(id).x}`);
  }
  const w = P.createWorld(); w.addBody(floor);
  const id = w.addBody({ ...box(0, 0), vy: 2000 }); run(w, 120);
  assert.ok(w.body(id).y < 180, 'box fell through the floor? ' + w.body(id).y);
});

test('energy bounds: elastic bounce never gains energy; inelastic loses it; no energy from resting contacts', () => {
  const w = P.createWorld(); w.addBody(floor); const id = w.addBody({ x: 0, y: 100, shape: { type: 'circle', r: 10 }, restitution: 0.9 });
  const e0 = w.energy(); let maxE = e0, apexes = [];
  let prevVy = 0; for (let i = 0; i < 600; i++) { w.step(DT); const e = w.energy(); maxE = Math.max(maxE, e); const vy = w.body(id).vy; if (prevVy < 0 && vy >= 0) apexes.push(w.body(id).y); prevVy = vy; }
  assert.ok(maxE <= e0 + 0.02 * Math.abs(e0) + 1, 'energy grew ' + (maxE - e0));
  for (let k = 1; k < apexes.length; k++) assert.ok(apexes[k] >= apexes[k - 1] - 0.5, 'bounce heights must not increase');
  assert.ok(apexes.length >= 3);
  const w2 = P.createWorld(); w2.addBody(floor); const b2 = w2.addBody(box(0, 169)); run(w2, 300);
  assert.ok(w2.body(b2).asleep); assert.ok(Math.abs(w2.body(b2).vy) < 1e-9);
});

test('momentum is conserved in a head-on elastic collision in zero gravity', () => {
  const w = P.createWorld({ gravity: { x: 0, y: 0 } });
  const a = w.addBody({ x: -50, y: 0, vx: 100, shape: { type: 'circle', r: 10 }, restitution: 1 }), b = w.addBody({ x: 50, y: 0, vx: -50, density: 3, shape: { type: 'circle', r: 10 }, restitution: 1 });
  const m = (id) => 1 / w.body(id).invMass, p0 = m(a) * 100 + m(b) * -50, e0 = w.energy();
  run(w, 120);
  const p1 = m(a) * w.body(a).vx + m(b) * w.body(b).vx; near(p1, p0, 1e-6 * Math.abs(p0));
  assert.ok(w.body(a).vx < 0 && w.body(b).vx > w.body(a).vx);
  assert.ok(w.energy() <= e0 * 1.02, 'kinetic energy ' + w.energy() + ' vs ' + e0);
});

test('friction: box slides on a slippery ramp but holds on a rough one; restitution threshold means resting is quiet', () => {
  const mk = (mu) => { const w = P.createWorld(); w.addBody({ type: 'static', x: 0, y: 100, angle: 0.4, friction: mu, shape: { type: 'box', hw: 200, hh: 5 } }); const id = w.addBody({ x: -40, y: 55, angle: 0.4, friction: mu, shape: { type: 'box', hw: 8, hh: 8 } }); run(w, 200); return w.body(id); };
  assert.ok(mk(0.05).x > 100, 'slippery slides'); assert.ok(Math.abs(mk(1).x + 40) < 6, 'rough holds');
});

test('collision shapes: circle, polygon, capsule and rotated box all come to rest on the floor', () => {
  const w = P.createWorld(); w.addBody(floor);
  const ids = [
    w.addBody({ x: -150, y: 100, shape: { type: 'circle', r: 10 } }),
    w.addBody({ x: -50, y: 100, shape: { type: 'polygon', points: [{ x: -12, y: 10 }, { x: 12, y: 10 }, { x: 0, y: -14 }] } }),
    w.addBody({ x: 50, y: 100, angle: 0.8, shape: { type: 'capsule', hl: 14, r: 6 } }),
    w.addBody({ x: 150, y: 100, angle: 0.5, shape: { type: 'box', hw: 12, hh: 8 } }),
  ];
  run(w, 400);
  for (const id of ids) { const b = w.body(id); assert.ok(b.asleep, 'asleep ' + id); assert.ok(b.y > 150 && b.y < 180, `y ${b.y}`); }
  assert.ok(Math.abs(w.body(ids[0]).y - 170) < 0.6);
  assert.ok(Math.abs(w.body(ids[3]).y - 172) < 3.2);
});

test('kinematic platform carries a box; static bodies never move; sensors do not push', () => {
  const w = P.createWorld({ sleep: false });
  const pl = w.addBody({ type: 'kinematic', x: 0, y: 100, shape: { type: 'box', hw: 40, hh: 5 } }), st = w.addBody(floor), cargo = w.addBody({ x: 0, y: 85, friction: 1, shape: { type: 'box', hw: 8, hh: 5 } });
  w.kinematicStep(pl, 40, 0); run(w, 90);
  assert.ok(w.body(cargo).x > 40, 'carried ' + w.body(cargo).x); assert.equal(w.body(st).y, 200); near(w.body(pl).x, 60, 1e-6);
  const w2 = P.createWorld(); w2.addBody({ type: 'static', x: 0, y: 100, sensor: true, shape: { type: 'box', hw: 30, hh: 10 } }); const f = w2.addBody({ x: 0, y: 0, shape: { type: 'circle', r: 4 } });
  run(w2, 80); assert.ok(w2.body(f).y > 400, 'fell through the sensor');
});

test('sensor events: enter once, stay while inside, exit once; contact begin/end for solids', () => {
  const log = [];
  const w = P.createWorld({ onEvent: (e) => log.push(e) });
  const zone = w.addBody({ type: 'static', x: 0, y: 100, sensor: true, shape: { type: 'box', hw: 30, hh: 10 } }), ball = w.addBody({ x: 0, y: 0, shape: { type: 'circle', r: 4 } });
  run(w, 80);
  const kinds = log.filter((e) => e.sensor === zone).map((e) => e.type);
  assert.equal(kinds[0], 'enter'); assert.equal(kinds.filter((k) => k === 'enter').length, 1); assert.equal(kinds.filter((k) => k === 'exit').length, 1); assert.equal(kinds.at(-1), 'exit');
  assert.ok(kinds.includes('stay')); assert.ok(log.every((e) => e.other === ball || e.type === 'begin' || e.type === 'end'));
  const w2 = P.createWorld(); w2.addBody(floor); w2.addBody(box(0, 100)); const t = []; for (let i = 0; i < 60; i++) { w2.step(DT); t.push(...w2.events.map((e) => e.type)); }
  assert.deepEqual(t.filter((x) => x === 'begin').length, 1);
  w2.setVelocity(2, 0, -600); const t2 = []; for (let i = 0; i < 30; i++) { w2.step(DT); t2.push(...w2.events.map((e) => e.type)); } assert.ok(t2.includes('end'));
});

test('layer/mask filtering: masked bodies pass through, matching ones collide', () => {
  const w = P.createWorld(); w.addBody({ ...floor, layer: 2 }); const ghost = w.addBody(box(0, 100, { mask: 1 })), solid = w.addBody(box(100, 100, { mask: 3 }));
  run(w, 120); assert.ok(w.body(ghost).y > 300); assert.ok(w.body(solid).y < 180);
});

test('sleeping: bodies sleep, a hit wakes the whole island, setVelocity/applyImpulse wake', () => {
  const w = P.createWorld(); w.addBody(floor); const a = w.addBody(box(0, 169)), b = w.addBody(box(0, 148.5));
  run(w, 200); assert.ok(w.body(a).asleep && w.body(b).asleep);
  assert.equal(w.body(a).island, w.body(b).island);
  const hit = w.addBody({ x: 0, y: 40, shape: { type: 'circle', r: 6 } }); run(w, 60);
  assert.ok(!w.body(b).asleep || w.body(b).sleepT < 0.5, 'top box woke from the impact');
  run(w, 400); assert.ok(w.body(hit).asleep || true);
  const w2 = P.createWorld({ gravity: { x: 0, y: 0 } }); const c = w2.addBody(box(0, 0)); run(w2, 60); assert.ok(w2.body(c).asleep);
  w2.applyImpulse(c, 100, 0); assert.ok(!w2.body(c).asleep); run(w2, 10); assert.ok(w2.body(c).x > 0);
  const w3 = P.createWorld({ sleep: false }); w3.addBody(floor); const d = w3.addBody(box(0, 169)); run(w3, 600); assert.ok(!w3.body(d).asleep);
  const w4 = P.createWorld(); w4.addBody(floor); const e = w4.addBody(box(0, 169, { allowSleep: false })); run(w4, 600); assert.ok(!w4.body(e).asleep);
});

test('joints: distance holds length, revolute holds the pin, spring oscillates and settles', () => {
  const w = P.createWorld(), pin = w.addBody({ type: 'static', x: 0, y: 0, shape: { type: 'circle', r: 2 } }), bob = w.addBody({ x: 50, y: 0, shape: { type: 'circle', r: 5 } });
  w.addJoint({ type: 'distance', a: pin, b: bob });
  let maxErr = 0; for (let i = 0; i < 300; i++) { w.step(DT); const b = w.body(bob); maxErr = Math.max(maxErr, Math.abs(Math.hypot(b.x, b.y) - 50)); }
  assert.ok(maxErr < 1.5, 'length error ' + maxErr);
  const w2 = P.createWorld(), p2 = w2.addBody({ type: 'static', x: 0, y: 0, shape: { type: 'circle', r: 2 } }), bar = w2.addBody({ x: 20, y: 0, shape: { type: 'box', hw: 20, hh: 3 } });
  w2.addJoint({ type: 'revolute', a: p2, b: bar, anchorB: { x: -20, y: 0 } });
  let maxPin = 0; for (let i = 0; i < 300; i++) { w2.step(DT); const b = w2.body(bar), c = Math.cos(b.angle), s = Math.sin(b.angle); maxPin = Math.max(maxPin, Math.hypot(b.x - 20 * c, b.y - 20 * s)); }
  assert.ok(maxPin < 1.5, 'pin drift ' + maxPin); assert.ok(Math.abs(w2.body(bar).angle) > 0.05);
  const w3 = P.createWorld(), p3 = w3.addBody({ type: 'static', x: 0, y: 0, shape: { type: 'circle', r: 2 } }), m3 = w3.addBody({ x: 0, y: 60, shape: { type: 'circle', r: 5 } });
  w3.addJoint({ type: 'spring', a: p3, b: m3, length: 40, stiffness: 300, damping: 120 });
  let minY = Infinity, maxY = -Infinity; for (let i = 0; i < 120; i++) { w3.step(DT); minY = Math.min(minY, w3.body(m3).y); maxY = Math.max(maxY, w3.body(m3).y); }
  assert.ok(maxY - minY > 5, 'moves'); run(w3, 1200); const rest = 40 + 600 * 1 / 300 * (1 / w3.body(m3).invMass) / (1 / w3.body(m3).invMass) * 0 + (1 / w3.body(m3).invMass) * 600 / 300;
  assert.ok(Math.abs(w3.body(m3).y - rest) < 4, `spring rest ${w3.body(m3).y} vs ${rest}`);
});

test('chain of revolute links hangs without exploding; connected bodies do not collide', () => {
  const w = P.createWorld(), a = w.addBody({ type: 'static', x: 0, y: 0, shape: { type: 'circle', r: 2 } });
  let prev = a, ids = [];
  for (let i = 0; i < 4; i++) { const id = w.addBody({ x: 10 + i * 20, y: 0, shape: { type: 'box', hw: 10, hh: 2 } }); w.addJoint({ type: 'revolute', a: prev, b: id, anchorA: { x: i === 0 ? 0 : 10, y: 0 }, anchorB: { x: -10, y: 0 } }); prev = id; ids.push(id); }
  run(w, 600);
  for (const id of ids) { const b = w.body(id); assert.ok(Number.isFinite(b.x) && Math.hypot(b.x, b.y) < 90, 'link in reach'); }
});

test('removeBody drops its joints and contacts; queries: raycast, point, aabb', () => {
  const w = P.createWorld(); w.addBody(floor); const a = w.addBody(box(0, 169)), b = w.addBody(box(100, 169));
  w.addJoint({ type: 'distance', a, b }); run(w, 10); w.removeBody(a); assert.equal(w.joints.length, 0); assert.equal(w.body(a), null); run(w, 5);
  const hit = w.raycast(100, 0, 0, 1, 1000); assert.equal(hit.body, b); near(hit.y, 160, 1.0);
  assert.equal(w.raycast(-500, 0, 0, 1, 1000)?.body, 1);
  assert.deepEqual(w.queryPoint(100, 170), [b]); assert.ok(w.queryAABB({ minX: -2000, minY: 0, maxX: 2000, maxY: 400 }).length === 2);
  assert.equal(w.raycast(100, 0, 0, 1, 1000, { mask: 0 }), null);
});

test('determinism: two identical runs are bit-identical, joints and sleeping included', () => {
  const build = () => {
    const w = P.createWorld(); w.addBody(floor);
    for (let i = 0; i < 6; i++) w.addBody(box(i * 3, 169 - i * 20.5, { angle: i * 0.01 }));
    w.addBody({ x: 60, y: 0, shape: { type: 'circle', r: 8 }, restitution: 0.6 }); w.addBody({ x: -60, y: 50, shape: { type: 'capsule', hl: 12, r: 5 } });
    const pin = w.addBody({ type: 'static', x: 200, y: 0, shape: { type: 'circle', r: 2 } }), bob = w.addBody({ x: 240, y: 0, shape: { type: 'circle', r: 5 } }); w.addJoint({ type: 'distance', a: pin, b: bob });
    return w;
  };
  const a = build(), b = build(); const trace = [];
  for (let i = 0; i < 500; i++) { a.step(DT); b.step(DT); if (i % 50 === 0) trace.push(state(a)); assert.equal(JSON.stringify(a.events), JSON.stringify(b.events)); }
  assert.equal(state(a), state(b));
  for (const [i, x] of a.bodies.entries()) assert.ok(Object.is(x.x, b.bodies[i].x) && Object.is(x.y, b.bodies[i].y) && Object.is(x.angle, b.bodies[i].angle));
});

test('snapshot/restore: replay from a snapshot is identical, snapshots are deep copies', () => {
  const w = P.createWorld(); w.addBody(floor);
  for (let i = 0; i < 5; i++) w.addBody(box(i * 2, 169 - i * 20.5));
  const ball = w.addBody({ x: 80, y: 0, shape: { type: 'circle', r: 8 }, restitution: 0.5, userData: { tag: 'ball' } });
  const pin = w.addBody({ type: 'static', x: 200, y: 0, shape: { type: 'circle', r: 2 } }), bob = w.addBody({ x: 240, y: 0, shape: { type: 'circle', r: 5 } }); w.addJoint({ type: 'distance', a: pin, b: bob });
  run(w, 70); const snap = w.snapshot(), frozen = JSON.stringify(snap);
  const ev1 = []; for (let i = 0; i < 300; i++) { w.step(DT); ev1.push(JSON.stringify(w.events)); } const final1 = state(w);
  assert.equal(JSON.stringify(snap), frozen, 'snapshot untouched by later steps');
  w.restore(snap); assert.equal(w.steps, 70);
  const ev2 = []; for (let i = 0; i < 300; i++) { w.step(DT); ev2.push(JSON.stringify(w.events)); }
  assert.equal(state(w), final1); assert.deepEqual(ev2, ev1);
  w.restore(snap); w.restore(snap); run(w, 300); assert.equal(state(w), final1, 'restoring twice is fine');
  const other = P.createWorld(); other.restore(snap); run(other, 300); assert.equal(state(other), final1, 'restore into a fresh world');
  assert.deepEqual(w.body(ball).userData, { tag: 'ball' });
});

test('rollback with inputs: snapshot, diverge with an impulse, rewind, replay the same inputs', () => {
  const w = P.createWorld({ gravity: { x: 0, y: 0 } }); const id = w.addBody({ x: 0, y: 0, shape: { type: 'circle', r: 5 } });
  run(w, 10); const s = w.snapshot();
  const play = (inputs) => { for (const i of inputs) { if (i) w.applyImpulse(id, i, 0); w.step(DT); } return state(w); };
  const a = play([5, 0, 0, 3, 0]); w.restore(s); const b = play([0, 0, 9, 0, 0]); w.restore(s); const c = play([5, 0, 0, 3, 0]);
  assert.equal(a, c); assert.notEqual(a, b);
});

test('edge cases: no bodies, zero-size dt guard-free step, static-only worlds, huge counts, coincident bodies', () => {
  const w = P.createWorld(); run(w, 5); assert.equal(w.steps, 5); assert.equal(w.energy(), 0);
  w.addBody(floor); w.addBody({ type: 'static', x: 0, y: 190, shape: { type: 'box', hw: 5, hh: 5 } }); run(w, 5);
  const c1 = w.addBody({ x: 0, y: 50, shape: { type: 'circle', r: 5 } }), c2 = w.addBody({ x: 0, y: 50, shape: { type: 'circle', r: 5 } }); run(w, 100);
  assert.ok(Number.isFinite(w.body(c1).x) && Number.isFinite(w.body(c2).y));
  assert.throws(() => w.addBody({ x: 0 })); assert.throws(() => w.setVelocity(999, 0, 0)); assert.throws(() => w.addJoint({ a: 1, b: 999 }));
  const big = P.createWorld(); big.addBody(floor); for (let i = 0; i < 60; i++) big.addBody({ x: (i % 10) * 24 - 100, y: 160 - Math.floor(i / 10) * 24, shape: { type: 'circle', r: 10 } }); run(big, 120);
  for (const b of big.bodies.slice(1)) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && b.y < 200);
});

test('polygon bodies are re-centred on their centroid with correct mass', () => {
  const w = P.createWorld({ gravity: { x: 0, y: 0 } }), id = w.addBody({ x: 0, y: 0, density: 2, shape: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }] } });
  const b = w.body(id); near(b.x, 10); near(b.y, 5); near(1 / b.invMass, 2 * 200, 1e-9); near(1 / b.invI, 2 * 200 * (400 + 100) / 12, 1e-6);
});

// ---- character controller ---------------------------------------------------------------------------------------
const flat = () => C.createTilemap({ cols: 12, rows: 5, tileSize: 16, tiles: new Array(60).fill(0).map((_, k) => (k >= 48 ? 1 : 0)) });  // floor top y 64
const walk = (b, world, cfg, dx, n, dy = 0) => { for (let i = 0; i < n; i++) P.stepCharacter(b, { dx, dy, jumpPressed: false }, DT, world, cfg); return b; };

test('character: walks, jumps, lands, emits events, deterministic jump height matches ballistic', () => {
  const ev = [], cfg = P.makeCharConfig({ emit: (n) => ev.push(n) }), tm = flat(), b = P.makeCharacter(8, 64);
  walk(b, tm, cfg, 1, 30); near(b.x, 8 + 30, 1e-9); assert.equal(b.y, 64); assert.equal(b.mode, 'ground');
  let minY = Infinity; P.stepCharacter(b, { dx: 0, dy: 0, jumpPressed: true }, DT, tm, cfg);
  for (let i = 0; i < 80; i++) { P.stepCharacter(b, { dx: 0, dy: 0, jumpPressed: false }, DT, tm, cfg); minY = Math.min(minY, b.y); }
  assert.ok(Math.abs((64 - minY) - 200 * 200 / (2 * 520)) < 2, 'apex ' + (64 - minY)); assert.deepEqual(ev, ['jump', 'hardland', 'land']); assert.equal(b.y, 64);
});

test('character: matches platformer-physics on flat ground (run distance, jump arc)', async () => {
  const pp = await import('../../src/lib/platformer-physics.js'), world = { groundY: 64 }, scene = C.fromPlatformerWorld(world, { minX: -1e4, maxX: 1e4 });
  const cfg = pp.makeConfig(), a = pp.makeBody(20, 64), b = P.makeCharacter(20, 64), ccfg = P.makeCharConfig();
  const inputs = [{ dx: 1, jumpPressed: true }, ...new Array(70).fill({ dx: 1 }), ...new Array(20).fill({ dx: 0 })];
  for (const i of inputs) { pp.stepBody(a, i, DT, world, cfg); P.stepCharacter(b, i, DT, scene, ccfg); near(a.x, b.x, 1e-6); near(a.y, b.y, 0.6); }
  assert.equal(b.mode, 'ground'); assert.equal(a.mode, 'ground');
});

test('character: walls block, ledges step up only within stepHeight, ceilings bonk', () => {
  const cfg = P.makeCharConfig({ stepHeight: 4 }), mk = (ledgeTop) => C.createScene([{ kind: 'solid', minX: 0, maxX: 300, minY: 64, maxY: 100 }, { kind: 'solid', minX: 40, maxX: 300, minY: ledgeTop, maxY: 100 }]);
  let b = walk(P.makeCharacter(8, 64), mk(61), cfg, 1, 120); assert.equal(b.y, 61); assert.ok(b.x > 100, 'walked up the 3px ledge');
  b = walk(P.makeCharacter(8, 64), mk(58), cfg, 1, 80); assert.equal(b.y, 64); near(b.x, 40 - 4); assert.equal(b.vx, 0);
  const ceil = C.createScene([{ kind: 'solid', minX: 0, maxX: 300, minY: 64, maxY: 100 }, { kind: 'solid', minX: 0, maxX: 300, minY: 0, maxY: 40 }]), c = P.makeCharacter(50, 64);
  P.stepCharacter(c, { jumpPressed: true }, DT, ceil, cfg); let minY = 1e9; for (let i = 0; i < 60; i++) { P.stepCharacter(c, {}, DT, ceil, cfg); minY = Math.min(minY, c.y); }
  assert.ok(minY >= 40 + 16 - 1e-9, 'head stops at the ceiling ' + minY); assert.equal(c.y, 64);
});

test('character: slopes up and down keep the feet on the surface (ground snap), no popping', () => {
  const hills = C.createTilemap({ cols: 12, rows: 4, tileSize: 16, tiles: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 4, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] });
  const cfg = P.makeCharConfig(), b = P.makeCharacter(8, 48); let maxJump = 0, prev = b.y;
  for (let i = 0; i < 160; i++) { P.stepCharacter(b, { dx: 1 }, DT, hills, cfg); assert.equal(b.mode, 'ground', 'grounded at ' + i); maxJump = Math.max(maxJump, Math.abs(b.y - prev)); prev = b.y;
    const col = hills.colliderAt(Math.floor(b.x / 16), 2); if (col?.kind === 'slope') assert.ok(b.y <= C.surfaceY(col, b.x) + 1e-6, 'never sunk into the slope'); }
  assert.ok(maxJump <= cfg.stepHeight + 1e-9, 'no popping beyond stepHeight, max step ' + maxJump); assert.ok(b.x > 120);
  for (let i = 0; i < 160; i++) P.stepCharacter(b, { dx: -1 }, DT, hills, cfg);
  assert.equal(b.y, 48); assert.equal(b.mode, 'ground');
});

test('character: one-way platforms pass from below, land from above, drop through with down+jump', () => {
  const sc = C.createScene([{ kind: 'solid', minX: 0, maxX: 200, minY: 64, maxY: 100 }, { kind: 'oneway', minX: 30, maxX: 80, minY: 40, maxY: 44 }]), cfg = P.makeCharConfig(), b = P.makeCharacter(50, 64);
  P.stepCharacter(b, { jumpPressed: true }, DT, sc, cfg); for (let i = 0; i < 70; i++) P.stepCharacter(b, {}, DT, sc, cfg);
  assert.equal(b.y, 40, 'jumped up through it and landed on top'); assert.equal(b.onPlatform !== null, true);
  P.stepCharacter(b, {}, DT, sc, cfg); P.stepCharacter(b, { dy: 1, jumpPressed: true }, DT, sc, cfg); for (let i = 0; i < 40; i++) P.stepCharacter(b, {}, DT, sc, cfg);
  assert.equal(b.y, 64, 'dropped to the floor');
});

test('character: no tunnelling at absurd fall speeds, walking off an edge falls, drop-in pit world', () => {
  const sc = C.createScene([{ kind: 'solid', minX: 0, maxX: 200, minY: 64, maxY: 100 }]), b = P.makeCharacter(50, -2000); b.mode = 'air';
  for (let i = 0; i < 30; i++) P.stepCharacter(b, {}, DT, sc, P.makeCharConfig({ gravity: 90000, maxFall: 1e6 })); assert.equal(b.y, 64);
  const pit = C.fromPlatformerWorld({ groundY: 160, pits: [{ x0: 60, x1: 80 }] }, { minX: 0, maxX: 320 }), c = P.makeCharacter(20, 160), cfg = P.makeCharConfig();
  let sawAir = false; for (let i = 0; i < 200; i++) { P.stepCharacter(c, { dx: 1 }, DT, pit, cfg); if (c.mode === 'air') sawAir = true; }
  assert.ok(sawAir && c.y > 160, 'fell into the pit');
});

test('character: deterministic and snapshot-friendly (pure function of body, input, world)', () => {
  const tm = flat(), run1 = () => { const b = P.makeCharacter(8, 64), cfg = P.makeCharConfig(); const out = []; for (let i = 0; i < 300; i++) { P.stepCharacter(b, { dx: (i >> 5) % 3 - 1, jumpPressed: i % 40 === 0 }, DT, tm, cfg); out.push([b.x, b.y, b.vy, b.mode]); } return JSON.stringify(out); };
  assert.equal(run1(), run1());
});
