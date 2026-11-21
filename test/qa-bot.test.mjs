import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createAutopilot } from '../src/sim/autopilot.js';
import { generateLevel } from '../src/levels/lanegen.js';
import { playLevel } from '../tools/botplay.mjs';

test('autopilot step returns an input edge object and idles outside play', () => {
  const g = createGame({ seed: 1, level: 1, levelAt: generateLevel });
  const ap = createAutopilot(g, { seed: 1 });
  const i = ap.step(1 / 60);                       // state is intro
  assert.deepEqual(i, { hop: null });
  let hops = 0;
  for (let n = 0; n < 60 * 20; n++) {
    const inp = ap.step(1 / 60);
    assert.ok(inp.hop === null || ['up', 'down', 'left', 'right'].includes(inp.hop));
    if (inp.hop) hops++;
    g.update(1 / 60, inp);
  }
  assert.ok(hops > 5);
});

test('perfect bot clears sample levels with no timeout and no deaths', () => {
  for (const [level, seed] of [[1, 1], [5, 2], [12, 2]]) {
    const r = playLevel(level, seed, { skill: 1, limit: 120 });
    assert.equal(r.result, 'clear', JSON.stringify(r));
    assert.equal(r.bays, 5);
    assert.equal(r.deaths, 0, JSON.stringify(r));
  }
});

test('bot is deterministic for a given seed and skill', () => {
  const a = playLevel(2, 5, { skill: 0.8, limit: 60 }), b = playLevel(2, 5, { skill: 0.8, limit: 60 });
  assert.deepEqual({ ...a, ms: 0 }, { ...b, ms: 0 });
});

test('low skill dies more than perfect skill (noise knob works)', () => {
  let lo = 0, hi = 0;
  for (let s = 1; s <= 2; s++) {
    lo += playLevel(4, s, { skill: 0.3, limit: 60, lives: 99 }).deaths;
    hi += playLevel(4, s, { skill: 1, limit: 60, lives: 99 }).deaths;
  }
  assert.ok(lo > hi, `skill 0.3 deaths ${lo} vs skill 1 deaths ${hi}`);
});

test('autopilot works with the fallback level (no levelAt injected)', () => {
  const g = createGame({ seed: 1 });
  const ap = createAutopilot(g, { seed: 1 });
  for (let n = 0; n < 60 * 30; n++) g.update(1 / 60, ap.step(1 / 60));
  assert.ok(g.stats.hops > 0);
});
