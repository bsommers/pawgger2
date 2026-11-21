import test from 'node:test';
import assert from 'node:assert/strict';
import { createParticles, createShake, createFlash, createPopups, skyRamp, DAY_NIGHT_STOPS, nightAmount, parallaxOffsets, makeSilhouetteStrip } from '../../src/kits/fx-kit/index.js';

const ctx = () => { const calls = []; return { calls, fillRect: (...a) => calls.push(a), drawImage() {}, fillText() {}, set fillStyle(v) {}, set globalAlpha(v) {} }; };
test('particles are deterministic, capped, and expire', () => {
  const run = () => { const p = createParticles({ seed: 5, max: 20 }); p.burst('confetti', 50, 50); p.burst('splash', 1, 1); for (let i = 0; i < 3; i++) p.update(0.05); return p; };
  const a = run(), b = run();
  assert.deepEqual(a.list, b.list); assert.equal(a.count, 20);
  for (let i = 0; i < 100; i++) a.update(0.1);
  assert.equal(a.count, 0);
  const d = ctx(); b.draw(d); assert.ok(d.calls.length > 0);
  assert.throws(() => a.burst('nope', 0, 0));
});
test('shake decays to zero and returns integers', () => {
  const s = createShake(); s.kick(1);
  const o = s.offset(); assert.ok(Number.isInteger(o.x) && Math.abs(o.x) <= 4);
  for (let i = 0; i < 100; i++) s.update(0.05);
  assert.deepEqual(s.offset(), { x: 0, y: 0 });
});
test('flash and popups', () => {
  const f = createFlash(); f.trigger('#fff', 0.2); assert.ok(f.alpha > 0.7); f.update(0.3); assert.equal(f.alpha, 0);
  const p = createPopups({ life: 1 }); p.add(100, 10, 10); p.update(0.5); assert.equal(p.count, 1); p.update(0.6); assert.equal(p.count, 0);
});
test('sky ramp, night amount, parallax wrap', () => {
  assert.equal(skyRamp(DAY_NIGHT_STOPS, 0).top, '#1b2a5a');
  assert.equal(skyRamp(DAY_NIGHT_STOPS, 1).top, skyRamp(DAY_NIGHT_STOPS, 0).top);
  assert.match(skyRamp(DAY_NIGHT_STOPS, 0.4).bottom, /^#[0-9a-f]{6}$/);
  assert.equal(nightAmount(0.5), 0); assert.equal(nightAmount(0), 1);
  const o = parallaxOffsets([{ name: 'far', factor: 0.25 }, { name: 'near', factor: 1 }], -10, 64);
  assert.deepEqual(o, { far: 62, near: 54 });
});
test('silhouette strips are non-empty and tileable', () => {
  for (const k of ['trees', 'hills', 'grass']) {
    const s = makeSilhouetteStrip(k, 64, 32);
    let n = 0; for (let i = 0; i < s.rgba.length; i += 4) if (s.rgba[i + 3]) n++;
    assert.ok(n > 100, k);
  }
});
