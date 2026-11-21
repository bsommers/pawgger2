import test from 'node:test';
import assert from 'node:assert/strict';
import { lockPalette, spriteFromAscii, spriteFromFn, packSheet, validateManifest, makeTile, makeScenery, encodePng, hex } from '../../src/kits/art-kit/index.js';

const PAL = { a: '#ff0000', b: '#00ff00', c: '#0000ff' };
test('ascii sprite + palette lock', () => {
  const s = spriteFromAscii(['aab', '.c.'], PAL);
  assert.equal([s.w, s.h].join('x'), '3x2');
  assert.equal(hex(s.get(2, 0)), '#00ff00');
  const lock = lockPalette(PAL);
  assert.deepEqual(lock.offenders(s), []);
  s.set(0, 0, '#fe0101');
  assert.equal(lock.offenders(s).length, 1);
  lock.snap(s);
  assert.deepEqual(lock.offenders(s), []);
  assert.throws(() => spriteFromAscii(['z'], PAL), /no legend/);
});
test('sheet packs without overlap and validates', () => {
  const f = (c) => spriteFromFn(8, 8, (p) => p.rect(1, 1, 6, 6, c));
  const { sheet, manifest } = packSheet({ one: f('#f00'), walk: [f('#0f0'), f('#00f'), f('#ff0')], big: spriteFromFn(40, 20, (p) => p.fill('#fff')) }, { width: 64 });
  assert.deepEqual(validateManifest(manifest, sheet, ['one', 'walk']), []);
  assert.equal(manifest.walk.frames, 3);
  assert.match(validateManifest(manifest, sheet, ['nope'])[0], /missing/);
  const bad = { ...manifest, ghost: { x: 0, y: 0, w: 4, h: 4, frames: 1, fw: 4, fh: 4 } };
  assert.ok(validateManifest(bad, sheet).some((e) => /overlaps|empty/.test(e)));
});
test('tiles are seamless and deterministic', () => {
  for (const kind of ['dirt', 'stone', 'brick', 'grass', 'water', 'planks']) {
    const a = makeTile(kind, 16, {}, 3), b = makeTile(kind, 16, {}, 3);
    assert.deepEqual(a.rgba, b.rgba, kind);
    assert.ok(a.has(0, 0));
  }
  assert.throws(() => makeTile('lava'), /unknown/);
  for (const k of ['tree', 'bush', 'cloud', 'rock']) { const t = makeScenery(k); assert.ok([...t.rgba].some((v, i) => i % 4 === 3 && v), k); }
});
test('png encodes with signature and sane size', () => {
  const png = encodePng(makeTile('dirt', 8), 2);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 16);
});
