import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, roller, patroller, cycler, stationary, spawner, tauntingBoss, resolveContacts, solidTopUnder, solidTopCarrying, overlaps } from '../../src/lib/hazard-kit.js';

const DT = 1 / 60;
const mk = () => createRegistry().register('log', roller({ speed: 50 })).register('scorp', patroller({ minX: 20, maxX: 100, speed: 30 }))
  .register('croc', cycler({ period: 2, openFrac: 0.5 })).register('fire', stationary()).register('custom', { init(e) { e.w = 10; e.h = 10; }, update() {}, onTouch: () => ({ type: 'bounce' }) });
const tick = (reg, ents, secs, g = {}) => { for (let i = 0; i < secs * 60; i++) reg.update(ents, DT, g); };

test('registry spawns with defaults, ids unique, unknown kind throws', () => {
  const reg = mk(); const a = reg.spawn('log', { x: 10, y: 5 }), b = reg.spawn('log', {});
  assert.notEqual(a.id, b.id); assert.equal(a.lethal, 'points'); assert.equal(a.vx, -50);
  assert.throws(() => reg.spawn('nope'));
  assert.deepEqual(reg.kinds().sort(), ['croc', 'custom', 'fire', 'log', 'scorp']);
});

test('roller wraps around the screen', () => {
  const reg = mk(), e = reg.spawn('log', { x: 5, y: 0 }); tick(reg, [e], 1);
  assert.ok(e.x > 200 && e.x < 340);
});

test('patroller turns at both ends and stays in range', () => {
  const reg = mk(), e = reg.spawn('scorp', { x: 60, dir: 1 }); let sawL = false, sawR = false;
  for (let i = 0; i < 600; i++) { reg.update([e], DT); assert.ok(e.x >= 20 && e.x <= 100); if (e.x === 20) sawL = true; if (e.x === 100) sawR = true; }
  assert.ok(sawL && sawR);
});

test('cycler alternates open (lethal) and closed (solidTop), phase-staggerable', () => {
  const reg = mk(), a = reg.spawn('croc', { x: 0, y: 10, st: { phase: 0 } }), b = reg.spawn('croc', { st: { phase: 1 } });
  assert.equal(a.solidTop, true); assert.equal(a.lethal, null);
  tick(reg, [a, b], 1.2);
  assert.equal(a.lethal, 'life'); assert.equal(a.solidTop, false); assert.equal(a.frame, 1);
  assert.notEqual(a.open, b.open);
  const seen = new Set(); for (let i = 0; i < 240; i++) { reg.update([a], DT); seen.add(a.open); } assert.equal(seen.size, 2);
});

test('stationary hazard animates frames', () => {
  const reg = mk(), e = reg.spawn('fire', {}); const fr = new Set(); for (let i = 0; i < 60; i++) { reg.update([e], DT); fr.add(e.frame); }
  assert.equal(fr.size, 3);
});

test('resolveContacts: life kills, points with cooldown, closed croc harmless, custom override, layer filter', () => {
  const reg = mk(), p = { x: 50, y: 100, layer: 'surface' };
  const fire = reg.spawn('fire', { x: 50, y: 100 }), log = reg.spawn('log', { x: 50, y: 100 }), croc = reg.spawn('croc', { x: 50, y: 100 });
  const r = resolveContacts(reg, p, [fire, log, croc], { pointsPenalty: -100 }, { time: 1 });
  assert.deepEqual(r.map((x) => x.type), ['kill', 'points']);
  assert.equal(resolveContacts(reg, p, [log], {}, { time: 1.2 }).length, 0);       // cooldown
  assert.equal(resolveContacts(reg, p, [log], {}, { time: 2 }).length, 1);
  const tun = reg.spawn('fire', { x: 50, y: 100, layer: 'tunnel' });
  assert.equal(resolveContacts(reg, p, [tun], {}).length, 0);
  assert.equal(resolveContacts(reg, p, [reg.spawn('custom', { x: 50, y: 100 })], {})[0].type, 'bounce');
  assert.equal(resolveContacts(reg, { x: 300, y: 100 }, [fire], {}).length, 0);
});

test('solidTop landing/carrying only while closed', () => {
  const reg = mk(), c = reg.spawn('croc', { x: 100, y: 112 }), top = 112 - c.h;
  assert.equal(solidTopUnder([c], 100, top + 1, top - 3), c);
  assert.equal(solidTopCarrying([c], 100, top), c);
  tick(reg, [c], 1.2);                                    // open
  assert.equal(solidTopUnder([c], 100, top + 1, top - 3), null);
  assert.ok(overlaps({ x: 100, y: 112 }, 4, 16, c));
});

test('spawner fires on schedule via g.spawn', () => {
  const reg = createRegistry().register('gen', spawner({ every: 1, kind: 'log', makeProps: () => ({ x: 9 }) })); const got = [];
  const e = reg.spawn('gen', {}); tick(reg, [e], 3.5, { spawn: (k, p) => got.push([k, p.x]) });
  assert.equal(got.length, 3); assert.deepEqual(got[0], ['log', 9]);
});

test('tauntingBoss taunts and throws deterministically with a seeded rng', () => {
  const events = [], thrown = []; let i = 0;
  const g = { rng: { pick: (a) => a[i++ % a.length] }, emit: (n, d) => events.push([n, d.text]), spawn: (k) => thrown.push(k) };
  const reg = createRegistry().register('boss', tauntingBoss({ every: 2, taunts: ['A', 'B'], throwKind: 'cheese' }));
  const e = reg.spawn('boss', {}); tick(reg, [e], 4.1, g);
  assert.deepEqual(events, [['taunt', 'A'], ['taunt', 'B']]); assert.deepEqual(thrown, ['cheese', 'cheese']);
});

test('source contains no Math.random (determinism contract)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['hazard-kit', 'platformer-physics', 'world-gen']) {
    assert.ok(!/Math\.random/.test(readFileSync(new URL(`../../src/lib/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), f);
  }
});
