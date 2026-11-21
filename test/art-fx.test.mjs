import test from 'node:test'; import assert from 'node:assert/strict';
import { artManifest } from '../src/core/defs.js';
import { build } from '../src/art/fx.js';

const want = artManifest().filter((a) => a.module === 'fx');
const frames = (v) => (Array.isArray(v) ? v : [v]);
const bytes = (b) => JSON.stringify(Object.entries(b).map(([k, v]) => [k, frames(v).map((f) => Buffer.from(f.rgba).toString('base64'))]));

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
test('no frame empty; animated frames differ', () => {
  const b = build();
  for (const a of want) {
    const fr = frames(b[a.name]);
    for (const f of fr) assert.ok(f.rgba.some((v, i) => i % 4 === 3 && v > 0), a.name + ' empty');
    if (a.frames > 1) assert.equal(new Set(fr.map((f) => Buffer.from(f.rgba).toString('base64'))).size, a.frames, a.name + ' duplicate frames');
  }
});
test('logo stays inside its frame with a 1px margin', () => {
  const f = build().logo;
  for (let x = 0; x < f.w; x++) for (const y of [0, f.h - 1]) assert.equal(f.rgba[(y * f.w + x) * 4 + 3], 0, `edge ${x},${y}`);
  for (let y = 0; y < f.h; y++) for (const x of [0, f.w - 1]) assert.equal(f.rgba[(y * f.w + x) * 4 + 3], 0, `edge ${x},${y}`);
});
