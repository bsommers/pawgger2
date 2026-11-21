import test from 'node:test'; import assert from 'node:assert/strict';
import { artManifest } from '../src/core/defs.js';
import { build } from '../src/art/river.js';

const want = artManifest().filter((a) => a.module === 'river');
const frames = (v) => (Array.isArray(v) ? v : [v]);
const bytes = (b) => JSON.stringify(Object.entries(b).map(([k, v]) => [k, frames(v).map((f) => Buffer.from(f.rgba).toString('base64'))]));
const bbox = (f) => { let x0 = 99, x1 = -1, y0 = 99, y1 = -1; for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.rgba[(y * f.w + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.rgba.length; i++) if (a.rgba[i] !== b.rgba[i]) n++; return n; };

test('manifest conformance', () => {
  const b = build();
  for (const a of want) {
    assert.ok(b[a.name], a.name);
    const fr = frames(b[a.name]);
    assert.equal(fr.length, a.frames, a.name);
    for (const f of fr) { assert.equal(f.w, a.w); assert.equal(f.h, a.h); const bb = bbox(f); assert.ok(bb.x1 >= 0, a.name + ' empty'); }
  }
  assert.deepEqual(Object.keys(b).sort(), want.map((a) => a.name).sort());
});
test('deterministic', () => assert.equal(bytes(build()), bytes(build())));
test('build time < 400 ms', () => { const t = performance.now(); build(); assert.ok(performance.now() - t < 400); });
test('turtle warn frames clearly differ from swim frames', () => {
  const t = build().turtle;
  for (const s of [0, 1]) for (const w of [2, 3]) assert.ok(diff(t[s], t[w]) > 150, `${s} vs ${w}`);
  assert.ok(diff(t[0], t[1]) > 20);
});
test('croc open differs from closed; art inside frame margin', () => {
  const c = build().croc_raft; assert.ok(diff(c[0], c[1]) > 100);
  const bb = bbox(c[1]); assert.ok(bb.x1 <= 63 && bb.y0 >= 0);
});
