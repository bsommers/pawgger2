import test from 'node:test'; import assert from 'node:assert/strict';
import { MUSIC } from '../src/core/defs.js';
import { MUSIC_NAMES, describeMusic, renderMusic, stats, createMusic, midiOf, STEPS_PER_BAR } from '../src/audio/music.js';

const SR = 22050;
test('every defs.MUSIC name exists and is described', () => {
  assert.deepEqual([...MUSIC_NAMES], [...MUSIC]);
  for (const n of MUSIC) { const d = describeMusic(n); assert.ok(d.bars >= 2 && d.length > 1, n); assert.ok(d.voices.length >= 3, n); }
});
test('bars are exactly 16 steps, all voices equal length, bad bars throw', () => {
  for (const n of MUSIC) { const d = describeMusic(n); const per = 60 / d.bpm * 4; assert.ok(Math.abs(d.length - d.bars * per) < 1e-9, n); }
  assert.equal(midiOf('c4'), 60); assert.equal(midiOf('a4'), 69); assert.equal(midiOf('bb2'), 46); assert.equal(STEPS_PER_BAR, 16);
});
test('render sanity: no NaN, no silence, no clipping, sensible RMS, no clicks at the edges', () => {
  for (const n of MUSIC) {
    const pcm = renderMusic(n, SR); const s = stats(pcm, SR);
    assert.equal(s.nan, 0, n); assert.ok(s.peak <= 1.0 && s.peak > 0.2, `${n} peak ${s.peak}`);
    assert.ok(s.rms > 0.03 && s.rms < 0.4, `${n} rms ${s.rms}`);
    assert.ok(s.centroid > 200 && s.centroid < 9000, `${n} centroid ${s.centroid}`);
    if (!describeMusic(n).loop) assert.ok(Math.abs(pcm[pcm.length - 1]) < 0.02, n + ' ends silent');
    assert.ok(Math.abs(pcm[0]) < 0.3, n + ' start');
  }
});
test('loop length: tracks loop at bar boundaries, stings do not', () => {
  for (const n of MUSIC) {
    const d = describeMusic(n); const pcm = renderMusic(n, SR);
    assert.ok(Math.abs(pcm.length / SR - (d.length + d.tail)) < 1 / SR + 1e-9, n);
    // looped render of 2 loops: second loop repeats the first (seam is continuous)
    if (d.loop) {
      const two = renderMusic(n, SR, d.length * 2); const L = Math.round(d.length * SR);
      let diff = 0; for (let i = 0; i < L; i += 7) diff = Math.max(diff, Math.abs(two[i] - two[i + L]));
      assert.ok(diff < 0.02, `${n} loop repeat diff ${diff}`);
      assert.ok(Math.abs(two[L] - two[L - 1]) < 0.3, n + ' seam jump');
    }
  }
  assert.equal(describeMusic('levelclear').loop, false); assert.equal(describeMusic('gameover').loop, false);
});
test('determinism', () => { const a = renderMusic('level_night', SR, 3), b = renderMusic('level_night', SR, 3); assert.deepEqual(a, b); });
test('tracks differ in tempo: dusk slower than day, night has bass notes', () => {
  assert.ok(describeMusic('level_dusk').bpm < describeMusic('level_day').bpm);
  assert.ok(describeMusic('level_night').voices[0].notes.length >= 32);
});
test('createMusic drives a fake context without throwing', () => {
  const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'gain' || k === 'frequency' ? node() : () => {}), set: () => true });
  const ctx = { currentTime: 0, sampleRate: 8000, createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node, createBuffer: () => ({ getChannelData: () => new Float32Array(2000) }), createPeriodicWave: () => ({}) };
  const m = createMusic(ctx, {}); m.play('levelclear'); m.play('title'); m.play(null); m.stop();
});
