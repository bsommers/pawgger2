import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPete, TAUNTS } from '../src/sim/pete.js';
import { createRng } from '../src/core/rng.js';
import { generateLevel } from '../src/levels/lanegen.js';
import { W, rowY } from '../src/core/defs.js';

const DT = 1 / 60;

function fakeGame({ level = 3, roller = true, rollerEvery = 9, tauntEvery = 5, frog = null, lanes = null, rng = null } = {}) {
  const g = {
    t: 0, state: 'play', level,
    def: { pete: { limoLane: 2, tauntEvery, roller, rollerEvery } },
    lanes: lanes ?? {
      2: { row: 2, dir: 1, speed: 50, loop: 352, items: [{ id: 'limo', type: 'limo', off: 0 }] },
    },
    frog: frog ?? { x: 120, row: 13, fromRow: 13, mode: 'idle' },
    rng: rng ?? createRng(1),
    events: [], killed: null,
    sfx(name, x, y) { this.events.push(['sfx', name, x, y]); },
    taunt(text) { this.events.push(['taunt', text]); },
    kill(reason) { this.killed = reason; this.state = 'dying'; },
  };
  return g;
}

// Advance sim time one fixed step, the way sim-core does (pete.update runs after g.t advances).
function step(g, pete, n = 1) {
  for (let i = 0; i < n; i++) { g.t += DT; pete.update(DT); }
}

const count = (g, pred) => g.events.filter(pred).length;

test('TAUNTS: 12 all-caps lines, each <= 26 characters, unique', () => {
  assert.equal(TAUNTS.length, 12);
  for (const line of TAUNTS) {
    assert.ok(line.length <= 26, `too long: ${line}`);
    assert.match(line, /^[A-Z0-9 ,.!?'-]+$/, `not all caps: ${line}`);
  }
  assert.equal(new Set(TAUNTS).size, TAUNTS.length);
});

test('taunt cadence: one taunt and pete_laugh every tauntEvery seconds', () => {
  const g = fakeGame({ roller: false, tauntEvery: 5 });
  const pete = createPete(g);
  pete.reset();
  step(g, pete, Math.round(4.9 / DT));
  assert.equal(count(g, (e) => e[0] === 'taunt'), 0, 'no taunt before 5 s');
  step(g, pete, Math.round(0.2 / DT));
  assert.equal(count(g, (e) => e[0] === 'taunt'), 1, 'one taunt at 5 s');
  assert.equal(count(g, (e) => e[0] === 'sfx' && e[1] === 'pete_laugh'), 1);
  assert.ok(TAUNTS.includes(g.events.find((e) => e[0] === 'taunt')[1]));
});

test('limo honk fires once when the limo left edge enters the screen', () => {
  const g = fakeGame({ roller: false, tauntEvery: 999 });
  const pete = createPete(g);
  pete.reset();
  // left = off + dir*speed*t - 112 (mod loop); on screen when left >= 0, i.e. t ~ 2.24 s.
  step(g, pete, Math.round(3 / DT));
  const honks = g.events.filter((e) => e[0] === 'sfx' && e[1] === 'honk');
  assert.equal(honks.length, 1);
  assert.equal(honks[0][3], rowY(2));
});

test('no honk for a limo that starts already on screen', () => {
  const lanes = { 2: { row: 2, dir: 1, speed: 50, loop: 352, items: [{ id: 'l', type: 'limo', off: 200 }] } };
  const g = fakeGame({ roller: false, tauntEvery: 999, lanes });
  const pete = createPete(g);
  pete.reset();
  step(g, pete, 10);
  assert.equal(count(g, (e) => e[0] === 'sfx' && e[1] === 'honk'), 0);
});

test('roller telegraph: idle until rollerEvery, then warn for rollerWarn, then roller', () => {
  const g = fakeGame({ level: 3, rollerEvery: 9 });
  const pete = createPete(g);
  pete.reset();
  let t0 = null, t1 = null;
  for (let i = 0; i < 60 * 15; i++) {
    step(g, pete);
    if (t0 === null && pete.state === 'rollerWarn') t0 = g.t;
    if (t1 === null && pete.state === 'roller') t1 = g.t;
    if (t1 !== null) break;
  }
  assert.ok(Math.abs(t0 - 9) <= DT * 1.5, `warn at ${t0}`);
  assert.ok(Math.abs((t1 - t0) - 1.0) <= DT * 1.5, `warn lasted ${t1 - t0}`);
  assert.ok(g.events.some((e) => e[0] === 'sfx' && e[1] === 'roller_warn'));
  assert.ok(g.events.some((e) => e[0] === 'sfx' && e[1] === 'roller_rumble'));
});

test('roller crosses at rollerSpeed px/s in its travel direction', () => {
  const g = fakeGame({ level: 3, rollerEvery: 1, rng: { chance: () => true, int: (a) => a } });
  const pete = createPete(g);
  pete.reset();
  step(g, pete, Math.round(2.5 / DT));       // cooldown 1 s, warn 1 s, then roller
  assert.equal(pete.state, 'roller');
  const x0 = pete.rollerX;
  step(g, pete, 30);                          // 0.5 s
  const v = (pete.rollerX - x0) / 0.5;
  assert.ok(Math.abs(v - 130) < 1, `speed ${v}`);
  assert.equal(pete.rollerDir, 1);
});

test('lethal window: frog in row 7 under the roller dies, only in state roller', () => {
  const g = fakeGame({ level: 3, rollerEvery: 1, frog: { x: 120, row: 7, fromRow: 7, mode: 'idle' }, rng: { chance: () => true, int: (a) => a } });
  const pete = createPete(g);
  pete.reset();
  step(g, pete, Math.round(1.0 / DT) - 1);    // still warning
  assert.equal(g.killed, null, 'no kill while telegraphing');
  let sawRoller = false;
  for (let i = 0; i < 60 * 3 && g.killed === null; i++) {
    step(g, pete);
    if (pete.state === 'roller') sawRoller = true;
  }
  assert.equal(g.killed, 'roller');
  assert.ok(sawRoller);
  assert.ok(Math.abs(pete.rollerX - 120) < 16, `killed at rollerX ${pete.rollerX}`);
});

test('frog outside row 7 is never hit by the roller', () => {
  const g = fakeGame({ level: 3, rollerEvery: 1, frog: { x: 120, row: 13, fromRow: 13, mode: 'idle' }, rng: { chance: () => true, int: (a) => a } });
  const pete = createPete(g);
  pete.reset();
  for (let i = 0; i < 60 * 6; i++) step(g, pete);
  assert.equal(g.killed, null);
});

test('roller does not start while the frog is mid-hop into row 7; it waits', () => {
  const frog = { x: 120, row: 7, fromRow: 8, mode: 'hop' };
  const g = fakeGame({ level: 3, rollerEvery: 1, frog });
  const pete = createPete(g);
  pete.reset();
  step(g, pete, 90);                          // cooldown expired at 1 s but hop is still in progress
  assert.equal(pete.state, 'idle');
  frog.mode = 'idle';
  step(g, pete, 2);
  assert.equal(pete.state, 'rollerWarn');
});

test('interval shrinks with level (lane-gen rollerEvery) and never below 4 s', () => {
  const at = (level) => generateLevel(level, 1).pete;
  assert.equal(at(1), null, 'no Pete (and so no roller) on level 1');
  assert.ok(!at(2) || at(2).roller === false, 'no roller on level 2');
  const e3 = at(3).rollerEvery, e4 = at(4).rollerEvery, e10 = at(10).rollerEvery, e40 = at(40).rollerEvery;
  assert.ok(e3 > e4 && e4 > e10, `${e3} ${e4} ${e10}`);
  assert.ok(Math.abs(e3 - 9) < 1e-9, `level 3 base ${e3}`);
  assert.equal(e40, 4);
});

test('reset restores the cooldown and clears honk memory', () => {
  const g = fakeGame({ level: 3, rollerEvery: 2 });
  const pete = createPete(g);
  pete.reset();
  step(g, pete, Math.round(2.5 / DT));
  assert.equal(pete.state, 'rollerWarn');
  pete.reset();
  assert.equal(pete.state, 'idle');
  step(g, pete, Math.round(1.5 / DT));
  assert.equal(pete.state, 'idle', 'cooldown restarted');
});

test('no pete in this level: state off, nothing emitted', () => {
  const g = fakeGame();
  g.def = { pete: null };
  const pete = createPete(g);
  pete.reset();
  step(g, pete, 600);
  assert.equal(pete.state, 'off');
  assert.equal(g.events.length, 0);
});

test('source scan: sim-pete uses only the seeded rng and no DOM', () => {
  const src = readFileSync(new URL('../src/sim/pete.js', import.meta.url), 'utf8');
  const forbidden = new RegExp('Math\\s*\\.\\s*ran' + 'dom|\\bdocument\\b|\\bwindow\\b');
  assert.doesNotMatch(src, forbidden);
});
