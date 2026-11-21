import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput, stepInput } from '../src/core/input.js';
import { createMenu, createOptionsMenu, createNameEntry } from '../src/ui/menus.js';
import { createHud } from '../src/ui/hud.js';
import { createScreens } from '../src/ui/screens.js';
import { createTouch, BUTTONS } from '../src/ui/touch.js';
import { parseParams } from '../src/main.js';
import { createBus } from '../src/core/events.js';

const mkTarget = () => { const h = {}; return { addEventListener: (t, f) => { h[t] = f; }, removeEventListener() {}, fire: (t, e) => h[t](e) }; };
const key = (code, extra = {}) => ({ code, preventDefault() {}, ...extra });

function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({ calls }, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); }), set: (t, k, v) => { t[k] = v; return true; } });
  return ctx;
}

test('input: one latched hop edge per press, none on repeat or hold', () => {
  const tg = mkTarget(), inp = createInput({ target: tg, getPads: () => [] });
  tg.fire('keydown', key('ArrowUp'));
  assert.equal(inp.poll().hop, 'up');
  assert.equal(inp.poll().hop, null);                       // held: no repeat
  tg.fire('keydown', key('ArrowUp', { repeat: true }));
  assert.equal(inp.poll().hop, null);
  tg.fire('keyup', key('ArrowUp'));
  tg.fire('keydown', key('KeyA'));
  tg.fire('keyup', key('KeyA'));                            // press shorter than a frame is not lost
  assert.equal(inp.poll().hop, 'left');
});
test('input: press() injects, space confirms, stepInput gives the edge to step 0 only', () => {
  const tg = mkTarget(), inp = createInput({ target: tg, getPads: () => [] }), acts = [];
  inp.on((e) => acts.push(e.act));
  tg.fire('keydown', key('Space'));
  assert.ok(acts.includes('confirm'));
  assert.equal(inp.poll().hop, null);
  inp.press('right');
  const f = inp.poll();
  assert.deepEqual(stepInput(f, 0), { hop: 'right' });
  assert.deepEqual(stepInput(f, 1), { hop: null });
});
test('input: gamepad direction edge latches a hop', () => {
  let b = false;
  const pad = () => [{ connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 13 && b })) }];
  const inp = createInput({ getPads: pad });
  assert.equal(inp.poll().hop, null);
  b = true; assert.equal(inp.poll().hop, 'down'); assert.equal(inp.poll().hop, null);
});
test('menus: navigation, options, name entry', () => {
  let hit = 0;
  const m = createMenu([{ label: () => 'A', confirm: () => hit++ }, { label: () => 'B' }]);
  m.act('down'); assert.equal(m.index, 1); m.act('down'); assert.equal(m.index, 0); m.act('confirm'); assert.equal(hit, 1);
  const s = { master: 0.8, sfx: 1, music: 0.7, crt: true, mute: false }; let ch = 0;
  const o = createOptionsMenu(s, () => ch++);
  o.act('left'); assert.equal(s.master, 0.7); o.index = 3; o.act('confirm'); assert.equal(s.mute, true); assert.ok(ch >= 2);
  const e = createNameEntry('AAA');
  e.act('up'); assert.equal(e.name, 'BAA'); e.act('char', 'z'); assert.equal(e.name, 'ZAA'); assert.equal(e.pos, 1);
  e.act('confirm'); e.act('confirm'); assert.equal(e.done, true);
});
test('touch: hit-test and press latch', () => {
  const inp = createInput({ getPads: () => [] }), t = createTouch({ input: inp, enabled: true });
  for (const b of BUTTONS) assert.equal(t.hit(b.x + 5, b.y + 5), b.dir);
  assert.equal(t.hit(120, 100), null);
  t.down(BUTTONS[2].x + 4, BUTTONS[2].y + 4, 1);
  assert.equal(inp.poll().hop, 'up');
  t.draw(fakeCtx());
});
test('hud and screens draw without art or DOM', () => {
  const bus = createBus(), hud = createHud({ bus, now: () => 1000 }), sc = createScreens({});
  const g = { score: 1234, hi: 5000, lives: 3, level: 2, timeLeft: 4, timeLimit: 30, state: 'intro', stats: { hops: 0 } };
  bus.emit('taunt', { text: 'MEOW', dur: 2 });
  const c = fakeCtx();
  hud.draw(c, g); g.state = 'play'; hud.draw(c, g);
  const menu = createMenu([{ label: () => 'X' }]);
  sc.drawTitle(c, menu, [{ name: 'AAA', score: 1 }]); sc.drawHowTo(c); sc.drawOptions(c, menu); sc.drawPause(c);
  sc.drawGameOver(c, { score: 10, level: 2, entry: createNameEntry(), hi: [{ name: 'AAA', score: 1 }], rank: 0 });
  sc.drawLevelClear(c, g);
  assert.ok(c.calls.length > 20);
  hud.dispose();
});
test('main: params parse', () => {
  const p = parseParams('?autostart=1&level=3&seed=9&bot=1&time=12&nosound=1&poll');
  assert.deepEqual([p.autostart, p.level, p.seed, p.bot, p.time, p.nosound, p.poll], [true, 3, 9, true, 12, true, true]);
  assert.equal(parseParams('').time, null);
});
