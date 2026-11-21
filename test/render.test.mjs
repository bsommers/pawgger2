import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { W, H, CELL, ART, KINDS, itemW, itemLeft, MAX_ITEM_W, BAY_COLS, PAL, rowY } from '../src/core/defs.js';
import { createBus } from '../src/core/events.js';
import { buildAll, assemble } from '../src/art/registry.js';
import { setSurfaceFactory, drawStatic, spritesFor, paintWorld } from '../src/render/scene.js';
import { drawGround } from '../src/render/background.js';
import { createParticles, MAX_PARTICLES } from '../src/render/particles.js';
import { createRenderer } from '../src/render/renderer.js';
import { PixBuf } from '../src/art/pixbuf.js';
import { encodePNG } from '../tools/sheet.mjs';

// ---- software canvas: enough of the 2D API to rasterise what the renderer uses
const hexRGBA = (s) => {
  if (s[0] === '#') return [1, 3, 5].map((o) => parseInt(s.slice(o, o + 2), 16)).concat(255);
  const m = /rgba?\(([^)]+)\)/.exec(s).slice(1)[0].split(',').map(Number); return [m[0], m[1], m[2], (m[3] ?? 1) * 255];
};
class Surf {
  constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); this.ctx = new Ctx(this); }
  getContext() { return this.ctx; }
}
class Ctx {
  constructor(s) { this.s = s; this.fillStyle = '#000'; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.tx = 0; this.ty = 0; this.stack = []; this.calls = 0; }
  save() { this.stack.push([this.tx, this.ty]); } restore() { [this.tx, this.ty] = this.stack.pop(); }
  translate(x, y) { this.tx += x; this.ty += y; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(img) { this.s.data.set(img.data); }
  blend(x, y, r, g, b, a) {
    const s = this.s; if (x < 0 || y < 0 || x >= s.width || y >= s.height || a <= 0) return;
    const i = (y * s.width + x) * 4, d = s.data, k = a / 255 * this.globalAlpha;
    if (this.globalCompositeOperation === 'lighter') { d[i] += r * k; d[i + 1] += g * k; d[i + 2] += b * k; d[i + 3] = 255; return; }
    d[i] = d[i] * (1 - k) + r * k; d[i + 1] = d[i + 1] * (1 - k) + g * k; d[i + 2] = d[i + 2] * (1 - k) + b * k; d[i + 3] = Math.max(d[i + 3], k * 255);
  }
  fillRect(x, y, w, h) { this.calls++; const [r, g, b, a] = hexRGBA(this.fillStyle); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.blend(Math.round(x) + this.tx + i, Math.round(y) + this.ty + j, r, g, b, a); }
  drawImage(src, ...a) {
    this.calls++;
    let sx = 0, sy = 0, sw = src.width, sh = src.height, dx, dy, dw, dh;
    if (a.length === 2) [dx, dy] = a, dw = sw, dh = sh; else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
      const px = sx + Math.floor(i * sw / dw), py = sy + Math.floor(j * sh / dh), o = (py * src.width + px) * 4, d = src.data;
      if (d[o + 3] > 0) this.blend(Math.round(dx) + this.tx + i, Math.round(dy) + this.ty + j, d[o], d[o + 1], d[o + 2], d[o + 3]);
    }
  }
  createRadialGradient() { return { addColorStop() {} }; }
}
setSurfaceFactory((w, h) => new Surf(w, h));

// ---- fake game state
function lane(row, kind, dir, speed, items) { return { row, kind, dir, speed, loop: 16 * 22, items, tile: kind }; }
function fakeGame(level = 1, t = 3.2) {
  const lanes = [];
  lanes[2] = lane(2, 'river', 1, 18, [{ id: 'a', type: 'log_m', off: 16 * 8 }, { id: 'p', type: 'log_s', off: 16 * 16, pickup: 'tuna' }]);
  lanes[3] = lane(3, 'river', -1, 26, [{ id: 'b', type: 'turtle3', off: 16 * 4, phase: 0 }, { id: 'c', type: 'croc', off: 16 * 12, phase: 1 }]);
  lanes[4] = lane(4, 'river', 1, 22, [{ id: 'd', type: 'log_l', off: 16 * 10 }]);
  lanes[8] = lane(8, 'road', -1, 22, [{ id: 'e', type: 'car', off: 16 * 9, variant: 1 }, { id: 'f', type: 'limo', off: 16 * 14 }]);
  lanes[9] = lane(9, 'road', 1, 30, [{ id: 'g', type: 'truck', off: 16 * 9, variant: 1 }, { id: 'h', type: 'cheese_roll', off: 16 * 13 }]);
  lanes[10] = lane(10, 'road', -1, 30, [{ id: 'i', type: 'tuna_bus', off: 16 * 12 }]);
  return {
    t, level, state: 'play', lanes, pickups: new Set(),
    bays: BAY_COLS.map((col, idx) => ({ idx, col, filled: idx === 0, hazard: idx === 1 ? 'croc' : null, bonus: idx === 2 ? 'mouse' : null })),
    def: { bays: { hazards: [{ bay: 1, kind: 'croc', phase: 0 }], bonuses: [{ bay: 2, kind: 'mouse', phase: 0 }] } },
    pete: { state: 'roller', rollerX: 100, rollerDir: 1, t: 0 },
    frog: { x: 120, row: 10, col: 7, face: 'up', mode: 'idle', pose: 'up', frame: 0, hopT: 0, fromRow: 10, inv: 0 },
  };
}
const px = (s, x, y) => { const i = (y * s.width + x) * 4; return [...s.data.slice(i, i + 4)]; };
const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };

test('registry: every manifest name resolves with exact size and frame count (placeholders when art is missing)', async () => {
  const reg = await buildAll();
  for (const a of ART) {
    assert.equal(reg.frames(a.name), a.frames, a.name);
    const p = reg.get(a.name, 0);
    assert.deepEqual([p.w, p.h], [a.w, a.h], a.name);
    assert.equal(reg.get(a.name, a.frames + 1), reg.get(a.name, 1), 'frame wraps');
    assert.deepEqual(reg.size(a.name), { w: a.w, h: a.h });
  }
  assert.equal(reg.names().length, ART.length);
});

test('registry: a missing module becomes magenta placeholders, a broken module too', async () => {
  const reg = await buildAll({ loader: async (m) => { if (m === 'world') throw new Error('nope'); return { build: () => ({}) }; } });
  assert.ok(reg.errors.world);
  const p = reg.get('tile_road', 0);
  assert.deepEqual(p.get(0, 0).r, 255);
  assert.equal(p.get(0, 0).b, 255);
  const wrong = assemble({ world: { tile_road: [new (p.constructor)(3, 3)] } });
  assert.ok(wrong.missing.includes('tile_road(size)'));
  assert.equal(wrong.get('tile_road').w, 16);
});

test('painter: all lane items are drawn at itemLeft (one pass over a fake state)', async () => {
  const reg = await buildAll(), sp = spritesFor(reg);
  const g = fakeGame(1, 3.2);
  const calls = [];
  const spy = new Surf(W, H), ctx = spy.getContext();
  const orig = ctx.drawImage.bind(ctx);
  ctx.drawImage = (s, x, y) => { calls.push([s, x, y]); return orig(s, x, y); };
  const origDraw = sp.draw;
  const drawn = [];
  const sp2 = { ...sp, draw: (c, n, f, x, y, o) => { drawn.push({ n, x, y }); return origDraw(c, n, f, x, y, o); } };
  paintWorld(ctx, sp2, g, null, {}, null);
  for (const row of [2, 3, 4, 8, 9, 10]) for (const it of g.lanes[row].items) {
    const k = KINDS[it.type], left = Math.round(itemLeft(g.lanes[row], it, g.t));
    if (!(left < W && left + itemW(it.type) > 0)) continue;
    const want = k.dives ? 'turtle' : k.sprite;
    assert.ok(drawn.some((d) => d.n === want && d.y === row * CELL && d.x >= left && d.x < left + itemW(it.type)), `${it.type} in row ${row}`);
    if (!k.dives) assert.ok(drawn.some((d) => d.n === want && d.x === left && d.y === row * CELL), `${it.type} at itemLeft`);
  }
});

test('painter: frog follows pose/frame, mirrors left, lifts in a hop, blinks while invulnerable', async () => {
  const reg = await buildAll(), sp = spritesFor(reg);
  const g = fakeGame(1, 3.2); const seen = [];
  const sp2 = { ...sp, draw: (c, n, f, x, y, o) => { if (n.startsWith('colby_') && n !== 'colby_home') seen.push({ n, f, x, y, flip: !!(o && o.flip) }); } };
  const run = (mut) => { seen.length = 0; const q = fakeGame(1, 3.2); Object.assign(q.frog, mut); paintWorld(new Surf(W, H).getContext(), sp2, q, null, {}, null); return seen.slice(); };
  assert.deepEqual(run({}), [{ n: 'colby_up', f: 0, x: 112, y: rowY(10) - 8, flip: false }]);
  assert.equal(run({ pose: 'side', face: 'left', frame: 1 })[0].flip, true);
  assert.equal(run({ pose: 'side', face: 'right' })[0].flip, false);
  const hop = run({ mode: 'hop', hopT: 0.5, row: 9, fromRow: 10 })[0];
  assert.ok(hop.y < rowY(9.5) - 8 - 2.5, 'lifted by about 3 px at mid hop: ' + hop.y);
  assert.equal(run({ mode: 'home' }).length, 0);
  const blink = new Set([0, 0.03, 0.06, 0.09].map((t) => { const q = fakeGame(1, t); q.frog.inv = 0.5; seen.length = 0; paintWorld(new Surf(W, H).getContext(), sp2, q, null, {}, null); return seen.length; }));
  assert.equal(blink.size, 2, 'blinks');
});

test('painter: full frame differs by sky level; night draws headlights; bays and roller render', async () => {
  const reg = await buildAll(), sp = spritesFor(reg);
  const frame = (level) => { const s = new Surf(W, H); paintWorld(s.getContext(), sp, fakeGame(level, 2), null, {}, null); return s; };
  const day = frame(1), night = frame(5), noroller = (() => { const g = fakeGame(1, 2); g.pete.state = 'off'; const s = new Surf(W, H); paintWorld(s.getContext(), sp, g, null, {}, null); return s; })();
  assert.ok(changed(day.data, night.data) > 20000, 'night differs from day');
  assert.ok(changed(day.data, noroller.data) > 50, 'roller drawn');
  assert.ok(px(day, 3, 3)[3] > 0);
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) assert.ok(px(day, x, y)[3] > 0, `opaque at ${x},${y} ${px(day,x,y)}`);
});

test('drawStatic and drawGround work for all five sky levels', async () => {
  const reg = assemble({ world: { bg_skyline: new PixBuf(240, 32) } });   // transparent skyline so the sky shows
  const a = new Surf(W, H), b = new Surf(W, H);
  for (let l = 1; l <= 5; l++) drawStatic(a.getContext(), reg, l, l);
  drawStatic(b.getContext(), reg, 1, 0);
  assert.ok(changed(a.data, b.data) > 1000, 'sky bands differ by level');
  drawGround(new Surf(W, H).getContext(), spritesFor(reg));
});

test('particles: events spawn, expire, and are capped; shake decays', () => {
  const bus = createBus(), p = createParticles(bus);
  bus.emit('fx', { type: 'splash', x: 10, y: 10 }); bus.emit('fx', { type: 'confetti', x: 10, y: 10 }); bus.emit('popup', { text: '+50', x: 5, y: 5 });
  assert.ok(p.list.length >= 3);
  bus.emit('shake', { mag: 4, dur: 0.2 });
  const o = [...Array(6)].map(() => { p.update(0.016); return p.shakeOffset(); });
  assert.ok(o.some((v) => v.x || v.y));
  for (let i = 0; i < 100; i++) p.update(0.05);
  assert.equal(p.list.length, 0);
  assert.deepEqual(p.shakeOffset(), { x: 0, y: 0 });
  for (let i = 0; i < 1000; i++) bus.emit('fx', { type: 'dust', x: 0, y: 0 });
  assert.ok(p.list.length <= MAX_PARTICLES);
  bus.emit('fx', { type: 'bogus', x: 0, y: 0 }); bus.emit('fx', null);
});

test('renderer: draw to a fake canvas letterboxed at an integer scale, CRT toggles, writes a preview on request', async () => {
  const reg = await buildAll(), bus = createBus();
  const canvas = new Surf(1, 1); canvas.clientWidth = 1000; canvas.clientHeight = 700;
  const ctx0 = canvas.getContext();
  let cw = 0, ch = 0;   // assigning width/height reallocates the pixel store, like a real canvas
  Object.defineProperty(canvas, 'width', { get: () => cw, set: (v) => { cw = v; canvas.data = new Uint8ClampedArray(cw * ch * 4 || 4); } });
  Object.defineProperty(canvas, 'height', { get: () => ch, set: (v) => { ch = v; canvas.data = new Uint8ClampedArray(cw * ch * 4 || 4); } });
  canvas.__s = canvas;
  const r = createRenderer(canvas, { bus, art: reg, settings: { crt: false } });
  assert.equal(r.view.scale, 2);
  assert.equal(r.view.w, W * 2);
  assert.equal(canvas.width, 1000);
  let huds = 0, overs = 0; r.hud = () => { huds++; }; r.overlay = () => { overs++; };
  bus.emit('shake', { mag: 3, dur: 0.3 }); bus.emit('fx', { type: 'splash', x: 100, y: 100 });
  r.draw(fakeGame(3, 4), 1);
  assert.equal(huds, 1); assert.equal(overs, 1);
  const s = canvas.__s;
  assert.deepEqual(px(s, 2, 2).slice(0, 3), [0, 0, 0], 'letterbox is black');
  assert.ok(px(s, r.view.x + 100, r.view.y + 100)[3] > 0);
  const plain = Uint8ClampedArray.from(s.data);
  r.setCRT(true); r.draw(fakeGame(3, 4), 1);
  assert.ok(changed(plain, s.data) > 1000, 'CRT darkens scanlines');
  if (process.env.RENDER_SHOT) writeFileSync(process.env.RENDER_SHOT, encodePNG(canvas.width, canvas.height, s.data));
});
