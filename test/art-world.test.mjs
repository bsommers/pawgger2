import test from 'node:test'; import assert from 'node:assert/strict';
import { artManifest } from '../src/core/defs.js';
import { build } from '../src/art/world.js';

const want = artManifest().filter((a) => a.module === 'world');
const frames = (v) => (Array.isArray(v) ? v : [v]);
const bytes = (b) => JSON.stringify(Object.entries(b).map(([k, v]) => [k, frames(v).map((f) => Buffer.from(f.rgba).toString('base64'))]));
const px = (f, x, y) => [...f.rgba.slice((y * f.w + x) * 4, (y * f.w + x) * 4 + 4)];
const opaque = (f) => { for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] < 255) return false; return true; };
// seam smoothness: fraction of edge pixel pairs that are within a small colour distance
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

test('manifest conformance', () => {
  const b = build();
  for (const a of want) {
    assert.ok(b[a.name], a.name);
    const fr = frames(b[a.name]);
    assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) { assert.equal(f.w, a.w); assert.equal(f.h, a.h); }
  }
  assert.deepEqual(Object.keys(b).sort(), want.map((a) => a.name).sort());
});
test('deterministic', () => assert.equal(bytes(build()), bytes(build())));
test('build time < 400 ms', () => { const t = performance.now(); build(); assert.ok(performance.now() - t < 400); });
test('ground tiles are fully opaque', () => {
  const b = build();
  for (const n of ['tile_road', 'tile_road_line', 'tile_road_edge', 'tile_median', 'tile_start', 'tile_water', 'tile_bank', 'tile_hedge', 'bay_empty', 'bay_filled']) for (const f of frames(b[n])) assert.ok(opaque(f), n);
});
test('x-seamless tiles: wrap edge is as smooth as interior', () => {
  const b = build();
  for (const n of ['tile_road', 'tile_median', 'tile_start', 'tile_hedge', 'tile_bank', 'tile_water', 'tile_road_line', 'tile_road_edge']) for (const f of frames(b[n])) {
    let seam = 0, inner = 0;
    for (let y = 0; y < 16; y++) { seam += dist(px(f, 15, y), px(f, 0, y)); inner += dist(px(f, 7, y), px(f, 8, y)); }
    assert.ok(seam <= inner * 2 + 400, `${n} x seam ${seam} vs ${inner}`);
  }
});
test('water is seamless in y and its frames differ and loop', () => {
  const w = build().tile_water;
  for (const f of w) { let seam = 0, inner = 0; for (let x = 0; x < 16; x++) { seam += dist(px(f, x, 15), px(f, x, 0)); inner += dist(px(f, x, 7), px(f, x, 8)); } assert.ok(seam <= inner * 2 + 400, 'y seam'); }
  for (let i = 0; i < 4; i++) assert.notEqual(Buffer.from(w[i].rgba).toString('base64'), Buffer.from(w[(i + 1) % 4].rgba).toString('base64'));
});
test('skyline and jungle are x-tileable (edge columns close in height)', () => {
  const b = build();
  for (const f of [b.bg_skyline, ...b.bg_jungle]) {
    const top = (x) => { for (let y = 0; y < f.h; y++) if (f.rgba[(y * f.w + x) * 4 + 3]) return y; return f.h; };
    assert.ok(Math.abs(top(0) - top(f.w - 1)) <= 3, 'edge heights ' + top(0) + ' ' + top(f.w - 1));
  }
});
test('roller_warn frames differ', () => { const r = build().roller_warn; assert.notEqual(Buffer.from(r[0].rgba).toString('base64'), Buffer.from(r[1].rgba).toString('base64')); });
