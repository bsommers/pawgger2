import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBody, makeConfig, stepBody, pendulum, movingPlatform, edgeTransition, jumpRange, jumpHeight, supportAt, wrapIndex } from '../../src/lib/platformer-physics.js';

const DT = 1 / 60, cfg = makeConfig(), world = (o = {}) => ({ groundY: 100, t: 0, ...o });
const run = (b, input, n, w, c = cfg) => { for (let i = 0; i < n; i++) { w.t += DT; stepBody(b, typeof input === 'function' ? input(i, b) : input, DT, w, c); } return b; };

test('runs on the ground at runSpeed', () => {
  const b = run(makeBody(10, 100), { dx: 1 }, 60, world());
  assert.ok(Math.abs(b.x - (10 + cfg.runSpeed)) < 0.5); assert.equal(b.y, 100); assert.equal(b.mode, 'ground');
});

test('jump apex and landing match the analytic numbers', () => {
  const w = world(); let minY = 100;
  const b = run(makeBody(10, 100), (i, bb) => { minY = Math.min(minY, bb.y); return { jumpPressed: i === 0 }; }, 120, w);
  assert.ok(Math.abs((100 - minY) - jumpHeight(cfg)) < 3);
  assert.equal(b.mode, 'ground'); assert.equal(b.y, 100);
});

test('run-jump range is about jumpRange', () => {
  const w = world(); const b = makeBody(0, 100);
  run(b, (i) => ({ dx: 1, jumpPressed: i === 0 }), 120, w);
  const air = (b.x) ; assert.ok(air > 0);
  const b2 = makeBody(0, 100); let landedX = null;
  const c = makeConfig({ emit: (n, bb) => { if (n === 'land' && landedX == null) landedX = bb.x; } });
  run(b2, (i) => ({ dx: 1, jumpPressed: i === 0 }), 90, world(), c);
  assert.ok(Math.abs(landedX - jumpRange(cfg) * (cfg.airSpeed / cfg.runSpeed)) < 4);
});

test('walking into a deadly pit falls and dies; a safe drop emits drop', () => {
  const ev = []; const c = makeConfig({ emit: (n, b, x) => ev.push(n) });
  const b = run(makeBody(10, 100), { dx: 1 }, 200, world({ pits: [{ x0: 40, x1: 80, kind: 'tar' }] }), c);
  assert.equal(b.mode, 'dead'); assert.equal(b.deathKind, 'tar'); assert.ok(ev.includes('death'));
  const ev2 = []; const c2 = makeConfig({ emit: (n) => ev2.push(n) });
  const b2 = run(makeBody(10, 100), { dx: 1 }, 100, world({ pits: [{ x0: 40, x1: 80, drop: true }] }), c2);
  assert.ok(ev2.includes('drop')); assert.notEqual(b2.mode, 'dead');
});

test('jumping a narrow pit survives, a too-wide pit kills', () => {
  const clear = (pw) => { const w = world({ pits: [{ x0: 60, x1: 60 + pw }] });
    return run(makeBody(30, 100), (i, bb) => ({ dx: 1, jumpPressed: bb.mode === 'ground' && bb.x >= 50 }), 240, w).mode !== 'dead'; };
  assert.equal(clear(20), true); assert.equal(clear(200), false);
});

test('one-way platform: land from above, pass through from below, walk off falls', () => {
  const w = world({ platforms: [{ id: 'p', x: 60, y: 70, w: 30 }] });
  const b = makeBody(60, 100); b.mode = 'air'; b.vy = -300;           // shoot up through it
  run(b, {}, 200, w);
  assert.equal(b.y, 70); assert.equal(b.onPlatform, 'p');
  run(b, { dx: 1 }, 60, w); assert.equal(b.y, 100);                   // walked off, fell to ground
});

test('moving platform carries a standing body', () => {
  const mp = movingPlatform({ id: 'm', x0: 40, y0: 80, x1: 120, w: 30, speed: 20 });
  const w = world({ platforms: [mp] }); const b = makeBody(40, 80); b.mode = 'ground';
  for (let i = 0; i < 120; i++) { mp.update(DT); w.t += DT; stepBody(b, {}, DT, w, cfg); }
  assert.ok(b.x > 70 && Math.abs(b.x - mp.x) < 1); assert.equal(b.y, 80);
});

test('ladder climb down and up (game swaps the floor on climbEnd)', () => {
  const w = world({ ladders: [{ x: 50, top: 100, bottom: 140 }] });
  const c = makeConfig({ emit: (n, b, where) => { if (n === 'climbEnd') w.groundY = where === 'bottom' ? 140 : 100; } });
  const b = makeBody(50, 100);
  run(b, { dy: 1 }, 10, w, c); assert.equal(b.mode, 'climb');
  run(b, { dy: 1 }, 120, w, c); assert.equal(b.y, 140); assert.equal(b.mode, 'ground');
  run(b, { dy: -1 }, 120, w, c); assert.equal(b.y, 100); assert.equal(w.groundY, 100);
});

test('rope grab, swing follows the tip, jump releases', () => {
  const rope = pendulum({ px: 100, py: 10, len: 70, amp: 0.5, period: 2 });
  const w = world({ ropes: [rope], pits: [{ x0: 70, x1: 140, kind: 'water' }] });
  const ev = []; const c = makeConfig({ emit: (n) => ev.push(n) });
  const b = makeBody(100, 100); b.mode = 'air'; b.vy = -60; b.x = rope.tip(0).x; b.y = rope.tip(0).y + cfg.hitH;
  run(b, {}, 2, w, c);
  assert.equal(b.mode, 'swing');
  run(b, {}, 30, w, c);
  const tip = rope.tip(w.t); assert.ok(Math.abs(b.x - tip.x) < 1);
  run(b, { jumpPressed: true }, 1, w, c);
  assert.equal(b.mode, 'air'); assert.ok(ev.includes('grab') && ev.includes('release'));
  assert.ok(b.grabCd > 0);
});

test('pendulum tipVel matches the numeric derivative', () => {
  const r = pendulum({ px: 0, py: 0, len: 50, amp: 0.4, period: 2.2 }), h = 1e-4;
  for (const t of [0.3, 1.1, 2]) {
    const a = r.tip(t - h), c = r.tip(t + h), v = r.tipVel(t);
    assert.ok(Math.abs((c.x - a.x) / (2 * h) - v.x) < 0.05); assert.ok(Math.abs((c.y - a.y) / (2 * h) - v.y) < 0.05);
  }
});

test('edge transitions wrap circularly with configurable stride', () => {
  const c = makeConfig({ stride: (b) => (b.layer === 1 ? 3 : 1) });
  const b = makeBody(2, 100);
  assert.deepEqual(edgeTransition(b, 0, 10, c), { dir: -1, idx: 9, x: 315 });
  b.x = 318; b.layer = 1; assert.deepEqual(edgeTransition(b, 8, 10, c), { dir: 1, idx: 1, x: 5 });
  b.x = 100; assert.equal(edgeTransition(b, 8, 10, c), null);
  assert.equal(wrapIndex(-1, 5), 4);
});

test('supportAt handles pits and platforms', () => {
  const w = world({ pits: [{ x0: 10, x1: 20 }], platforms: [{ x: 50, y: 70, w: 20 }] });
  assert.equal(supportAt(w, 15, 100), null); assert.equal(supportAt(w, 30, 100).y, 100); assert.equal(supportAt(w, 50, 70).y, 70);
});

test('deterministic: identical inputs give identical trajectories', () => {
  const sim = () => { const b = makeBody(10, 100), w = world({ pits: [{ x0: 90, x1: 120 }] });
    run(b, (i) => ({ dx: 1, jumpPressed: i % 50 === 5 }), 300, w); return JSON.stringify(b); };
  assert.equal(sim(), sim());
});

test('one-way platform: a body below it never teleports up onto it', () => {
  const w = world({ platforms: [{ id: 'p', x: 60, y: 70, w: 30 }] });
  const b = makeBody(60, 100); b.mode = 'air'; b.vy = -100;           // apex ~10px up, stays under the platform top
  run(b, {}, 90, w);
  assert.equal(b.y, 100); assert.equal(b.onPlatform, null);
});
