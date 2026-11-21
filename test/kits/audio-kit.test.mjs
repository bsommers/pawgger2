import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBar, noteMidi, midiHz, describeSfx, DEFAULT_SFX, renderSfx, renderSong, pcmStats, toWav, fromWav, jingle, soundtrack, describeSong } from '../../src/kits/audio-kit/index.js';
import { JUNGLE, VICTORY, SFX } from '../../src/kits/examples/pawfall-songs.mjs';

test('notes and bars', () => {
  assert.equal(noteMidi('A4'), 69); assert.equal(midiHz(69), 440);
  assert.equal(parseBar('C5:8 .:4 E5:4').length, 2);
  assert.throws(() => parseBar('C5:8'), /need 16/); assert.throws(() => parseBar('H5:16'), /bad token/);
});
test('every default sfx renders audible, unclipped, deterministic', () => {
  for (const name of Object.keys(DEFAULT_SFX)) {
    const a = renderSfx(DEFAULT_SFX, name, 22050), b = renderSfx(DEFAULT_SFX, name, 22050), s = pcmStats(a);
    assert.ok(s.peak > 0.02 && s.peak <= 0.98 && s.rms > 0.005, `${name} ${JSON.stringify(s)}`);
    assert.deepEqual(a, b);
  }
  assert.throws(() => describeSfx(DEFAULT_SFX, 'nope'));
  assert.ok(describeSfx(DEFAULT_SFX, 'jump', { pitch: 2 })[0].f[0] > 400);
  assert.ok(pcmStats(renderSfx(SFX, 'treasure', 22050)).peak > 0.05);
});
test('song renders, loops seamlessly, WAV round trips', () => {
  const T = describeSong(JUNGLE);
  assert.equal(T.bars, 4); assert.ok(T.events.some((e) => e.kind === 'drum'));
  const pcm = renderSong(JUNGLE, 22050), s = pcmStats(pcm);
  assert.ok(s.peak > 0.3 && s.peak <= 1 && s.rms > 0.05, JSON.stringify(s));
  assert.ok(Math.abs(pcm.length / 22050 - T.length) < 0.01);
  assert.ok(Math.abs(pcm[0] - pcm[pcm.length - 1]) < 0.5);
  const wav = toWav(pcm.subarray(0, 1000), 22050), back = fromWav(wav);
  assert.equal(back.sr, 22050); assert.ok(Math.abs(back.pcm[500] - pcm[500]) < 1e-3);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF');
});
test('jingle + soundtrack', () => {
  assert.equal(VICTORY.bars, 1);
  assert.equal(jingle('C5:8 E5:8 G5:16', { bpm: 120 }).bars, 2);
  assert.throws(() => jingle('C5:12 E5:8'), /bar line/);
  const st = soundtrack({ menu: 'title', play: 'jungle' });
  assert.equal(st.changed('menu'), 'title'); assert.equal(st.changed('menu'), undefined); assert.equal(st.changed('play'), 'jungle');
  assert.equal(st.for('??'), null);
});
