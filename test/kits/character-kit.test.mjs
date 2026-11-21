import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacter, createAnimator, validateSpec } from '../../src/kits/character-kit/index.js';
import { COLBY, PETE } from '../../src/kits/examples/colby-rig.mjs';

test('worked examples build with every anim frame non-empty', () => {
  for (const spec of [COLBY, PETE]) {
    const c = buildCharacter(spec);
    for (const [n, a] of Object.entries(c.anims)) for (const f of a.frames) assert.ok(f.has(f.w >> 1, f.h >> 1) || [...f.rgba].some((v, i) => i % 4 === 3 && v), `${spec.name}.${n}`);
  }
  assert.equal(buildCharacter(COLBY).anims.run.frames.length, 4);
});
test('validateSpec catches mistakes', () => {
  const errs = validateSpec({ size: [4, 4], palette: {}, poses: { a: {} }, anims: { x: { frames: ['nope'], fps: 0 } } });
  assert.equal(errs.length, 3);
  assert.throws(() => buildCharacter({ name: 'x', size: [4, 4], palette: {}, poses: {}, anims: { a: { frames: [] } } }), /no frames/);
});
test('ascii poses render', () => {
  const c = buildCharacter({ name: 'b', size: [4, 4], palette: { x: '#fff' }, poses: { p: { rows: ['xx', 'xx'] } }, anims: { a: { frames: ['p'], fps: 1 } } });
  assert.ok(c.poses.p.has(0, 3));
});
test('animator loops, one-shots, restarts', () => {
  const an = createAnimator({ run: { frames: ['a', 'b', 'c'], fps: 10 }, hit: { frames: ['x', 'y'], fps: 10, loop: false } }, 'run');
  an.update(0.05); assert.equal(an.frame(), 'a');
  an.update(0.1); assert.equal(an.frame(), 'b');
  an.update(0.2); assert.equal(an.frame(), 'a');
  an.play('hit'); an.update(1); assert.equal(an.frame(), 'y'); assert.ok(an.done);
  an.play('hit'); assert.ok(an.done);
  an.play('hit', { restart: true }); assert.ok(!an.done);
  assert.throws(() => an.play('zzz'));
});
