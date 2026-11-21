import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { supportAt } from '../src/sim/lanes.js';
import { hitVehicle } from '../src/sim/collide.js';
import { createBus } from '../src/core/events.js';
import { TUNING, SCORES, EXTRA_LIFE_AT, BAY_COLS, ROW, colX, rowY, W } from '../src/core/defs.js';

const DT = 1 / 60, LOOP = 24 * 16;
// item whose LEFT edge is at pixel L when lane speed is 0 and t any
const it = (id, type, L, extra = {}) => ({ id, type, off: ((L + 112) % LOOP + LOOP) % LOOP, ...extra });
const lane = (row, kind, dir, speed, items) => ({ row, kind, dir, speed, loop: LOOP, items, tile: kind });
function level({ lanes = [], hazards = [], bonuses = [], timeLimit = 30 } = {}) {
  const arr = [];
  for (const l of lanes) arr[l.row] = l;
  return { timeLimit, lanes: arr, bays: { cols: BAY_COLS, hazards, bonuses }, pete: null };
}
function mk(def, opts = {}) {
  const events = [];
  const bus = createBus();
  bus.on('*', (type, p) => events.push([type, p]));
  const g = createGame({ seed: 1, bus, levelAt: () => def, ...opts });
  for (let i = 0; i < 100 && g.state === 'intro'; i++) g.update(DT, {});
  g.t = 0;
  return { g, events };
}
const ev = (events, type) => events.filter((e) => e[0] === type).map((e) => e[1]);
const steps = (g, n, input = {}) => { for (let i = 0; i < n; i++) g.update(DT, input); };
function hop(g, dir) {
  g.update(DT, { hop: dir });
  for (let i = 0; i < 20 && g.frog.mode === 'hop'; i++) g.update(DT, {});
}
const place = (g, row, x) => { g.frog.row = row; g.frog.x = x; g.frog.mode = row >= 2 && row <= 6 ? 'ride' : 'idle'; };
const wide = (row, kind, items, dir = 1, speed = 0) => lane(row, kind, dir, speed, items);
const emptyDef = () => level({ lanes: [...ROW.river.map((r) => wide(r, 'river', [])), ...ROW.road.map((r) => wide(r, 'road', []))] });

test('intro then play; banner and state events', () => {
  const { g, events } = mk(emptyDef());
  assert.equal(g.state, 'play');
  assert.ok(ev(events, 'banner').some((b) => b.text === 'LEVEL 1'));
  assert.ok(ev(events, 'state').some((s) => s.state === 'play'));
});

test('hop: one cell, applied at start, ends after hopTime with poses', () => {
  const { g, events } = mk(emptyDef());
  const x0 = g.frog.x;
  g.update(DT, { hop: 'up' });
  assert.equal(g.frog.mode, 'hop'); assert.equal(g.frog.row, 12); assert.equal(g.frog.fromRow, 13);
  assert.equal(g.frog.pose, 'up'); assert.equal(g.frog.frame, 1);
  let n = 0; while (g.frog.mode === 'hop' && n++ < 30) g.update(DT, {});
  assert.ok(n >= Math.floor(TUNING.hopTime / DT) - 2 && n <= Math.ceil(TUNING.hopTime / DT) + 1);
  assert.equal(g.frog.frame, 2); assert.equal(g.frog.x, x0);
  g.update(DT, {}); assert.equal(g.frog.frame, 0);
  assert.equal(ev(events, 'hop').length, 1);
  assert.ok(ev(events, 'sfx').some((s) => s.name === 'hop'));
  hop(g, 'left'); assert.equal(g.frog.x, x0 - 16); assert.equal(g.frog.pose, 'side'); assert.equal(g.frog.face, 'left'); assert.equal(g.frog.row, 12);
  hop(g, 'right'); hop(g, 'right'); assert.equal(g.frog.x, x0 + 16);
  hop(g, 'down'); assert.equal(g.frog.row, 13); assert.equal(g.frog.pose, 'down');
});

test('hop clamps at screen edges and rows', () => {
  const { g } = mk(emptyDef());
  for (let i = 0; i < 12; i++) hop(g, 'left');
  assert.equal(g.frog.x, 8);
  for (let i = 0; i < 20; i++) hop(g, 'right');
  assert.equal(g.frog.x, W - 8);
  hop(g, 'down'); assert.equal(g.frog.row, 13);
  place(g, 7, 120); g.frog.mode = 'idle';
  for (let i = 0; i < 8; i++) hop(g, 'down');
  assert.equal(g.frog.row, 13);
});

test('hop buffer: late press during a hop chains, early press is dropped, no auto repeat', () => {
  let { g } = mk(emptyDef());
  g.update(DT, { hop: 'up' });
  for (let i = 0; i < 3; i++) g.update(DT, {});       // 0.05 s into the hop: still inside the buffer window end
  g.update(DT, { hop: 'up' });                         // late press (buffered)
  for (let i = 0; i < 30; i++) g.update(DT, {});
  assert.equal(g.frog.row, 11, 'buffered hop executed');
  ({ g } = mk(emptyDef()));
  g.update(DT, { hop: 'up' });
  g.update(DT, { hop: 'up' });                         // 1 frame in: older than hopBuffer by hop end
  for (let i = 0; i < 30; i++) g.update(DT, {});
  assert.equal(g.frog.row, 12, 'early press expired before the hop ended');
  ({ g } = mk(emptyDef()));
  g.update(DT, { hop: 'up' });
  for (let i = 0; i < 60; i++) g.update(DT, {});
  assert.equal(g.frog.row, 12, 'single press = single hop');
});

test('forward score: once per row, maxRow only increases', () => {
  const { g, events } = mk(emptyDef());
  hop(g, 'up'); assert.equal(g.score, SCORES.forwardRow); assert.equal(g.maxRow, 12);
  hop(g, 'down'); hop(g, 'up'); assert.equal(g.score, SCORES.forwardRow);
  hop(g, 'up'); assert.equal(g.score, 2 * SCORES.forwardRow);
  assert.equal(ev(events, 'row').length, 2);
});

test('road: vehicle at hop end kills, clear road is safe, idle car hits frog', () => {
  const x = colX(7);
  let { g } = mk(level({ lanes: [wide(12, 'road', [it('a', 'car', x - 8)])] }));
  hop(g, 'up'); assert.equal(g.state, 'dying'); assert.equal(g.frog.death, 'car'); assert.equal(g.frog.pose, 'squash');
  ({ g } = mk(level({ lanes: [wide(12, 'road', [it('a', 'car', x + 40)])] })));
  hop(g, 'up'); assert.equal(g.state, 'play'); assert.equal(g.frog.row, 12);
  // moving car runs into an idle frog
  ({ g } = mk(level({ lanes: [wide(12, 'road', [it('a', 'car', x - 100)], 1, 60)] })));
  hop(g, 'up'); for (let i = 0; i < 200 && g.state === 'play'; i++) g.update(DT, {});
  assert.equal(g.frog.death, 'car');
  assert.ok(hitVehicle(level({ lanes: [wide(9, 'road', [it('a', 'car', 100)])] }), 9, 108, 0));
});

test('river: log supports and carries; open water kills', () => {
  const x = colX(7);
  const def = level({ lanes: [wide(6, 'river', [it('l', 'log_m', x - 40)], 1, 20)] });
  let { g } = mk(def);
  place(g, 7, x); g.frog.mode = 'idle';
  hop(g, 'up'); assert.equal(g.frog.row, 6); assert.equal(g.frog.mode, 'ride'); assert.deepEqual(g.frog.onItem, { lane: 6, id: 'l' });
  const x1 = g.frog.x; steps(g, 30); assert.ok(Math.abs(g.frog.x - (x1 + 10)) < 0.5, 'carried by lane speed');
  assert.equal(g.state, 'play');
  assert.ok(supportAt(g, 6, g.frog.x, g.t));
  ({ g } = mk(level({ lanes: [wide(6, 'river', [it('l', 'log_m', x + 100)])] })));
  place(g, 7, x); g.frog.mode = 'idle';
  hop(g, 'up'); assert.equal(g.frog.death, 'water'); assert.equal(g.frog.pose, 'drown');
});

test('river: sideways hop keeps riding, falling off the end of a log kills', () => {
  const x = colX(7);
  const { g } = mk(level({ lanes: [wide(6, 'river', [it('l', 'log_s', x - 24)])] }));
  place(g, 6, x); g.frog.onItem = { lane: 6, id: 'l' };
  hop(g, 'left'); assert.equal(g.frog.mode, 'ride');
  hop(g, 'left'); assert.equal(g.state, 'dying'); assert.equal(g.frog.death, 'water');
});

test('turtle: dives under the frog (turtle death); landing on sunk turtle is water', () => {
  const x = colX(7);
  let { g } = mk(level({ lanes: [wide(6, 'river', [it('t', 'turtle3', x - 24, { phase: 3.8 })])] }));
  place(g, 7, x); g.frog.mode = 'idle';
  hop(g, 'up'); assert.equal(g.frog.mode, 'ride'); // still up/warn
  for (let i = 0; i < 200 && g.state === 'play'; i++) g.update(DT, {});
  assert.equal(g.frog.death, 'turtle');
  ({ g } = mk(level({ lanes: [wide(6, 'river', [it('t', 'turtle3', x - 24, { phase: 5 })])] })));
  place(g, 7, x); g.frog.mode = 'idle';
  hop(g, 'up'); assert.equal(g.frog.death, 'water');
});

test('croc: closed head and back are safe, open head is lethal', () => {
  const x = colX(7);
  // dir +1: head = rightmost cell. Croc left = x-56 -> head cell [x-8, x+8]; back covers x-56..x-8
  const mkc = (phase) => mk(level({ lanes: [wide(6, 'river', [it('c', 'croc', x - 56, { phase })])] })).g;
  let g = mkc(0);                                   // closed at t=0
  place(g, 7, x); g.frog.mode = 'idle'; hop(g, 'up'); assert.equal(g.state, 'play'); assert.equal(g.frog.mode, 'ride');
  g = mkc(4);                                       // phase 4 of 5: open (>= 3.25)
  place(g, 7, x); g.frog.mode = 'idle'; hop(g, 'up'); assert.equal(g.frog.death, 'croc');
  g = mkc(4);
  place(g, 7, x - 32); g.frog.mode = 'idle'; hop(g, 'up'); assert.equal(g.state, 'play', 'back is safe even with mouth open');
});

test('carry off screen kills', () => {
  const { g } = mk(level({ lanes: [wide(6, 'river', [it('l', 'log_l', 100)], 1, 60)] }));
  place(g, 6, 200); g.frog.onItem = { lane: 6, id: 'l' }; g.frog.col = 12;
  for (let i = 0; i < 600 && g.state === 'play'; i++) g.update(DT, {});
  assert.equal(g.frog.death, 'offscreen'); assert.equal(g.frog.pose, 'drown');
});

function toBay(g, col, x) { place(g, 2, x ?? colX(col)); g.frog.mode = 'idle'; }
const bayLanes = () => wide(2, 'river', [it('l', 'log_l', -50), it('m', 'log_l', 60), it('n', 'log_l', 170)]);

test('bay: fill scores, spawns a new frog; hazard, filled bay and hedge kill', () => {
  let { g, events } = mk(level({ lanes: [bayLanes()] }));
  g.timeLeft = 20.5;
  toBay(g, 1); hop(g, 'up');
  assert.equal(g.bays[0].filled, true); assert.equal(g.frog.row, 13); assert.equal(g.state, 'play');
  assert.equal(g.score, SCORES.forwardRow + SCORES.bay + 20 * SCORES.bayTimePerSec);
  assert.equal(ev(events, 'bay').length, 1); assert.equal(g.timeLeft, g.timeLimit);
  toBay(g, 1); hop(g, 'up'); assert.equal(g.frog.death, 'hedge', 'filled bay');
  ({ g } = mk(level({ lanes: [bayLanes()] })));
  toBay(g, 1, BAY_COLS[1] * 16 + 8 + 16); hop(g, 'up'); assert.equal(g.frog.death, 'hedge');
  ({ g } = mk(level({ lanes: [bayLanes()], hazards: [{ bay: 2, kind: 'snake', phase: 0 }] })));
  toBay(g, 7); hop(g, 'up'); assert.equal(g.frog.death, 'snake');
  ({ g } = mk(level({ lanes: [bayLanes()], hazards: [{ bay: 2, kind: 'croc', phase: 4 }] })));   // phase 4 of 8: off for t in [0,3) -> ph 4..7 off
  toBay(g, 7); hop(g, 'up'); assert.equal(g.state, 'play'); assert.equal(g.bays[2].filled, true);
  ({ g, events } = mk(level({ lanes: [bayLanes()], bonuses: [{ bay: 1, kind: 'fish', phase: 0 }] })));
  g.timeLeft = 0.5; toBay(g, 4); hop(g, 'up');
  assert.equal(g.score, SCORES.forwardRow + SCORES.bay + SCORES.fish); assert.equal(ev(events, 'bay')[0].bonus, 'fish');
});

test('all five bays: level clear, +allBays, then next level', () => {
  const levels = [];
  const def = level({ lanes: [bayLanes()] });
  const { g, events } = mk(def, { levelAt: (l) => { levels.push(l); return def; } });
  g.timeLeft = 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < 4) { toBay(g, BAY_COLS[i]); hop(g, 'up'); g.timeLeft = 0.5; }
  }
  toBay(g, BAY_COLS[4]); hop(g, 'up');
  assert.equal(g.state, 'levelclear'); assert.equal(ev(events, 'levelclear').length, 1);
  assert.ok(g.score >= SCORES.allBays);
  steps(g, Math.ceil(TUNING.clearTime / DT) + 2);
  assert.equal(g.level, 2); assert.equal(g.state, 'intro'); assert.equal(levels.at(-1), 2);
  assert.ok(g.bays.every((b) => !b.filled)); assert.equal(g.stats.baysFilled, 5);
});

test('timer: ticks, tick_low, timeout death', () => {
  const { g, events } = mk(emptyDef());
  g.timeLeft = 7.2; g._sec = 8;
  steps(g, 60 * 2);
  assert.ok(ev(events, 'timer').length >= 2); assert.ok(ev(events, 'sfx').some((s) => s.name === 'tick_low'));
  for (let i = 0; i < 600 && g.state === 'play'; i++) g.update(DT, {});
  assert.equal(g.frog.death, 'timeout'); assert.equal(g.timeLeft, 0);
});

test('death: dying time, life lost, respawn with invuln; level state persists; kill no-op during inv', () => {
  const { g, events } = mk(level({ lanes: [bayLanes()] }));
  toBay(g, 1); hop(g, 'up');
  g.kill('car'); assert.equal(g.state, 'dying'); const lives = g.lives;
  g.kill('water'); assert.equal(g.frog.death, 'car', 'second kill ignored');
  steps(g, Math.ceil(TUNING.deathTime / DT) + 2);
  assert.equal(g.lives, lives - 1); assert.equal(g.state, 'play');
  assert.equal(g.frog.row, 13); assert.ok(g.frog.inv > 0); assert.equal(g.bays[0].filled, true);
  assert.ok(g.timeLeft > g.timeLimit - 0.1, 'time reset');
  g.kill('car'); assert.equal(g.state, 'play', 'invulnerable');
  assert.equal(ev(events, 'life').length, 1);
  steps(g, 60);
  g.kill('car'); assert.equal(g.state, 'dying');
});

test('game over after the last life', () => {
  const { g, events } = mk(emptyDef());
  for (let i = 0; i < 3; i++) { g.kill('car'); steps(g, 80); steps(g, 60); }
  assert.equal(g.state, 'gameover'); assert.equal(g.lives, 0); assert.equal(ev(events, 'gameover').length, 1);
});

test('extra life once at EXTRA_LIFE_AT', () => {
  const { g, events } = mk(emptyDef());
  g.addScore(EXTRA_LIFE_AT - 10); assert.equal(g.lives, 3);
  g.addScore(20); assert.equal(g.lives, 4);
  g.addScore(EXTRA_LIFE_AT); assert.equal(g.lives, 4);
  assert.ok(ev(events, 'sfx').some((s) => s.name === 'oneup')); assert.ok(ev(events, 'popup').some((p) => p.text === '1UP'));
});

test('pickup collected once per item id', () => {
  const x = colX(7);
  const { g, events } = mk(level({ lanes: [wide(6, 'river', [it('p', 'log_m', x - 40, { pickup: 'gold' })])] }));
  place(g, 7, x); g.frog.mode = 'idle';
  hop(g, 'up'); steps(g, 5);
  assert.equal(g.score, SCORES.forwardRow + SCORES.treasure.gold); assert.ok(g.pickups.has('p'));
  hop(g, 'down'); hop(g, 'up'); steps(g, 5);
  assert.equal(g.score, SCORES.forwardRow + SCORES.treasure.gold); assert.equal(ev(events, 'pickup').length, 1);
});

test('determinism: same seed + inputs = same state', () => {
  const run = () => {
    const g = createGame({ seed: 7 });
    const dirs = ['up', null, null, 'left', 'up', null, 'right', null, 'down', 'up'];
    for (let i = 0; i < 1500; i++) g.update(DT, { hop: i % 9 === 0 ? dirs[(i / 9) % dirs.length | 0] : null });
    return JSON.stringify([g.t, g.state, g.score, g.lives, g.frog, g.bays, g.timeLeft, g.stats]);
  };
  assert.equal(run(), run());
});

test('works without pete.js and without levelAt; no Math.random in sim source', () => {
  const g = createGame({}); steps(g, 200);
  assert.ok(g.pete && g.pete.state);
  for (const f of ['game', 'frog', 'lanes', 'collide']) {
    assert.ok(!/Math\s*\.\s*random/.test(readFileSync(new URL(`../src/sim/${f}.js`, import.meta.url), 'utf8')));
  }
});
