import test from 'node:test';
import assert from 'node:assert/strict';
import { input, botRng, trajectory, searchMacros, makeWatchdog, humanize, createAutopilot } from '../../src/lib/autopilot-kit.js';
import { createRegistry, roller } from '../../src/lib/hazard-kit.js';
import { makeBody, makeConfig, stepBody } from '../../src/lib/platformer-physics.js';

test('botRng is deterministic', () => { const a = botRng(3), b = botRng(3); assert.deepEqual([a(), a(), a()], [b(), b(), b()]); });

test('trajectory steps clones, leaves the originals alone', () => {
  const reg = createRegistry().register('log', roller({ speed: 60 })), e = reg.spawn('log', { x: 200, y: 0, dir: -1 });
  const tr = trajectory([e], 60, 1 / 60, (x, dt) => reg.update([x], dt, {}), (x) => ({ x: x.x }));
  assert.equal(tr.length, 61); assert.ok(Math.abs(tr[60][0].x - 140) < 0.5); assert.equal(e.x, 200);
});

test('searchMacros prefers a robust window over a single lucky tick', () => {
  const cost = (m) => (m.n === 30 ? 0 : m.n >= 60 && m.n <= 90 ? 5 : 1000);   // lone spike at 30, wide safe plateau 60..90
  const best = searchMacros([{ bias: 0, make: (n) => ({ n }) }], cost, { robustBelow: 24 });
  assert.ok(best.n >= 60 && best.n <= 90, 'picked ' + best.n);
  const raw = searchMacros([{ bias: 0, make: (n) => ({ n }) }], (m) => (m.n === 30 ? 0 : 1000), { robustBelow: 24 });
  assert.equal(raw.n, 30);                                                       // nothing robust: falls back to raw minimum
});

test('watchdog flails after no progress and resets on progress', () => {
  const wd = makeWatchdog({ limit: 1, panicTicks: 5 });
  assert.equal(wd.tick('a', 0), false); assert.equal(wd.tick('a', 0.5), false);
  assert.equal(wd.tick('a', 1.6), true); assert.equal(wd.stuck, 1);
  assert.equal(wd.tick('b', 1.7), false);
});

test('humanize delays jumps deterministically; perfect skill passes through', () => {
  const j = input(1, 0, true);
  assert.equal(humanize(1)(j), j);
  const h = humanize(0.5, botRng(7)); let r = h(j), ticks = 0;
  while (!r.jumpPressed && ticks < 100) { r = h(input(1)); ticks++; }
  assert.ok(ticks >= 1 && r.jumpPressed);
  const h2 = humanize(0.5, botRng(7)); let r2 = h2(j), t2 = 0; while (!r2.jumpPressed && t2 < 100) { r2 = h2(input(1)); t2++; }
  assert.equal(t2, ticks);
});

test('end to end: a bot using the physics core clears a pit', () => {
  const cfg = makeConfig(), body = makeBody(20, 100), world = { groundY: 100, t: 0, pits: [{ x0: 80, x1: 110, kind: 'tar' }] };
  const g = { body, world };
  const bot = createAutopilot({
    decide: (gg) => input(1, 0, gg.body.mode === 'ground' && gg.body.x >= 72),
    progressKey: (gg) => Math.floor(gg.body.x / 50) + '', time: (gg) => gg.world.t,
  });
  for (let i = 0; i < 300; i++) { world.t += 1 / 60; stepBody(body, bot.input(g, 1 / 60), 1 / 60, world, cfg); }
  assert.notEqual(body.mode, 'dead'); assert.ok(body.x > 130); assert.equal(bot.stats.errors, 0);
});

test('createAutopilot contains decide() errors', () => {
  const bot = createAutopilot({ decide: () => { throw new Error('x'); }, progressKey: () => 'k', time: () => 0 });
  assert.equal(bot.input({}, 0.016).dx, 1); assert.equal(bot.stats.errors, 1);
});
