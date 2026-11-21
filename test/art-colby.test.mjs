import test from 'node:test';
import assert from 'node:assert/strict';
import { artManifest } from '../src/core/defs.js';
import { build } from '../src/art/colby.js';

const want = artManifest().filter((a) => a.module === 'colby');
const frames = (v) => (Array.isArray(v) ? v : [v]);
const bbox = (f) => {
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.rgba[(y * f.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

test('colby matches manifest', () => {
  const b = build();
  assert.deepEqual(Object.keys(b).sort(), want.map((a) => a.name).sort());
  for (const a of want) {
    const fr = frames(b[a.name]);
    assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) { assert.equal(f.w, a.w); assert.equal(f.h, a.h); }
  }
});

test('colby sprites are non-empty, unclipped and roughly centred', () => {
  const b = build();
  for (const a of want) for (const f of frames(b[a.name])) {
    const { x0, y0, x1, y1 } = bbox(f);
    assert.ok(x1 >= 0, a.name + ' empty');
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= f.w - 1 && y1 <= f.h - 1, `${a.name} bbox ${x0},${y0},${x1},${y1}`);
    if (a.name.startsWith('colby_') && a.name !== 'colby_life' && !['colby_drown', 'colby_squash'].includes(a.name)) {
      assert.ok(x0 >= 1 && x1 <= f.w - 2, `${a.name} margin`);
      assert.ok(Math.abs(x0 + x1 + 1 - f.w) <= 3, `${a.name} x centring ${x0},${x1}`);
    }
  }
});

test('colby deterministic and fast', () => {
  const t0 = performance.now(); const a = build(); const ms = performance.now() - t0;
  const b = build();
  assert.ok(ms < 400, 'build ' + ms);
  for (const k of Object.keys(a)) frames(a[k]).forEach((f, i) => { assert.deepEqual(f.rgba, frames(b[k])[i].rgba); assert.deepEqual(f.mat, frames(b[k])[i].mat); });
});
