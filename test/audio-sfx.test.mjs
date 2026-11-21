// Audio SFX: recipe coverage, offline render numbers, live schedule against a mock context, audio shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SFX } from '../src/core/defs.js';
import { createBus } from '../src/core/events.js';
import { SFX_NAMES, describe, renderSfx, schedule, stats } from '../src/audio/sfx.js';
import { createAudio } from '../src/audio/audio.js';
import { encodeWav } from '../tools/sfx-wav.mjs';

const SR = 44100;

test('SFX_NAMES matches defs.SFX and every name has a non-empty recipe', () => {
  assert.deepEqual([...SFX_NAMES], [...SFX]);
  for (const name of SFX) {
    const v = describe(name);
    assert.ok(v.length > 0, `${name} has no voices`);
    for (const x of v) {
      assert.ok(['square', 'triangle', 'sine', 'noise'].includes(x.wave), `${name} wave`);
      assert.ok(x.dur > 0 && x.at >= 0 && x.vol > 0 && x.vol <= 1, `${name} timing/gain`);
      if (x.wave !== 'noise') assert.ok(x.f0 > 0 && x.f1 > 0, `${name} freq`);
    }
  }
});

test('describe returns copies and unknown names give no voices', () => {
  const a = describe('hop');
  a[0].vol = 99;
  assert.notEqual(describe('hop')[0].vol, 99);
  assert.deepEqual(describe('no_such_sfx'), []);
});

for (const name of SFX) {
  test(`render ${name}: finite, audible, under full scale, no click, no clipping`, () => {
    const pcm = renderSfx(name, SR);
    assert.ok(pcm instanceof Float32Array);
    let bad = 0;
    for (const x of pcm) if (!Number.isFinite(x)) bad++;
    assert.equal(bad, 0, 'NaN/Infinity samples');
    const s = stats(pcm, SR);
    assert.ok(s.peak > 0.05 && s.peak <= 1, `peak ${s.peak}`);
    assert.ok(s.rms > 0.02, `rms ${s.rms}`);
    assert.ok(s.sec >= 0.025 && s.sec <= 1.5, `length ${s.sec}s`);
    assert.ok(Math.abs(pcm[0]) < 0.01 && Math.abs(pcm[pcm.length - 1]) < 0.01, 'start/end should fade to zero');
    assert.ok(s.centroid > 20 && s.centroid < 16000, `centroid ${s.centroid}`);
  });
}

test('renders are deterministic', () => {
  for (const name of ['splash', 'hop', 'die']) {
    assert.deepEqual(renderSfx(name, SR), renderSfx(name, SR));
  }
});

test('stats on a known signal', () => {
  const pcm = new Float32Array([0, 0.5, -0.5, 0.5]);
  const s = stats(pcm, 4);
  assert.equal(s.peak, 0.5);
  assert.equal(s.len, 4);
  assert.equal(s.sec, 1);
  assert.ok(Math.abs(s.rms - Math.sqrt(0.75 / 4)) < 1e-9);
});

test('encodeWav writes a valid 16-bit mono header', () => {
  const buf = encodeWav(new Float32Array([0, 1, -1, 0.5]), SR);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(buf.readUInt16LE(22), 1);
  assert.equal(buf.readUInt32LE(24), SR);
  assert.equal(buf.readUInt16LE(34), 16);
  assert.equal(buf.readUInt32LE(40), 8);
  assert.equal(buf.length, 52);
  assert.equal(buf.readInt16LE(46), 32767);
  assert.equal(buf.readInt16LE(48), -32768);
});

// Minimal WebAudio stand-in that records what schedule() asks for.
function mockCtx() {
  const log = { osc: [], buf: [], gains: [] };
  const param = () => ({
    v: 0,
    setValueAtTime(v) { this.v = v; return this; },
    linearRampToValueAtTime(v) { this.v = v; return this; },
    exponentialRampToValueAtTime(v) { this.v = v; return this; },
  });
  const node = () => ({ connect() {}, start() { this.started = true; }, stop() { this.stopped = true; } });
  return {
    sampleRate: SR, currentTime: 0, state: 'running', destination: {}, log,
    createGain() { const g = { ...node(), gain: param() }; log.gains.push(g); return g; },
    createOscillator() { const o = { ...node(), frequency: param(), type: 'sine' }; log.osc.push(o); return o; },
    createBufferSource() { return node(); },
    createBuffer(ch, n, sr) { const b = { data: new Float32Array(n), getChannelData() { return this.data; } }; log.buf.push(b); return b; },
  };
}

test('schedule on a mock context builds gains, oscillators and returns the end time', () => {
  const ctx = mockCtx();
  const dest = {};
  const end = schedule(ctx, dest, describe('honk'), 1, { name: 'honk' });
  assert.ok(Math.abs(end - 1.25) < 1e-9);
  assert.equal(ctx.log.osc.length, 2);
  for (const o of ctx.log.osc) {
    assert.ok(o.started && o.stopped);
    assert.equal(o.type, 'square');
  }
  const endN = schedule(ctx, dest, describe('splash'), 0, { name: 'splash' });
  assert.ok(Math.abs(endN - 0.35) < 1e-9);
  assert.equal(ctx.log.buf.length, 1, 'noise voice uses one buffer');
});

test('audio shell: no AudioContext means safe no-ops', () => {
  const saved = [globalThis.AudioContext, globalThis.webkitAudioContext];
  globalThis.AudioContext = undefined;
  globalThis.webkitAudioContext = undefined;
  try {
    const bus = createBus();
    const audio = createAudio(bus, { master: 0.8, sfx: 1, music: 0.7, mute: false });
    assert.equal(audio.unlock(), false);
    assert.doesNotThrow(() => bus.emit('sfx', { name: 'hop' }));
    assert.doesNotThrow(() => bus.emit('sfx', { name: 'bogus' }));
    assert.doesNotThrow(() => bus.emit('music', { name: 'title' }));
    assert.doesNotThrow(() => audio.setVolume(2, -1, NaN));
    assert.doesNotThrow(() => audio.setMute(true));
    audio.dispose();
    assert.equal(audio.unlock(), false);
    audio.dispose();
  } finally {
    [globalThis.AudioContext, globalThis.webkitAudioContext] = saved;
  }
});

test('audio shell with a mock AudioContext: unlock creates the graph and sfx events schedule voices', async () => {
  const saved = globalThis.AudioContext;
  const made = [];
  globalThis.AudioContext = class {
    constructor() { Object.assign(this, mockCtx()); made.push(this); }
    resume() { this.resumed = true; }
  };
  try {
    const bus = createBus();
    const audio = createAudio(bus, { master: 0.5, sfx: 1, music: 0.7, mute: false });
    bus.emit('sfx', { name: 'hop' });            // before unlock: ignored
    assert.equal(made.length, 0);
    assert.equal(audio.unlock(), true);
    const ctx = made[0];
    const before = ctx.log.osc.length;
    bus.emit('sfx', { name: 'hop' });
    assert.equal(ctx.log.osc.length, before + 1);
    bus.emit('sfx', { name: 'bogus' });
    assert.equal(ctx.log.osc.length, before + 1);
    audio.setMute(true);
    bus.emit('sfx', { name: 'hop' });
    assert.equal(ctx.log.osc.length, before + 1, 'muted');
    audio.setMute(false);
    audio.dispose();
  } finally {
    globalThis.AudioContext = saved;
  }
});
