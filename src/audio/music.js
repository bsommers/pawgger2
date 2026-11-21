// Pawgger music. One pure-data description (describeMusic) drives BOTH live WebAudio (createMusic)
// and offline PCM rendering (renderMusic). Chiptune: square / triangle / noise.
// Notation: a voice is a list of bar strings; each bar is 16 sixteenth-steps of space-separated tokens
// "<note>[:len]" (len in steps, default 1). note = c4 f#3 bb2, '-' = rest, drums k s h.
import { MUSIC } from '../core/defs.js';

export const MUSIC_NAMES = MUSIC;
export const STEPS_PER_BAR = 16;

const NOTE_IDX = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function midiOf(name) {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const freqOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// parse one bar string -> [{step,len,note}] and total steps
export function parseBar(str) {
  const out = []; let step = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    const [n, l] = tok.split(':'); const len = l === undefined ? 1 : Number(l);
    if (!(len > 0)) throw new Error('bad token ' + tok);
    if (n !== '-') out.push({ step, len, note: n });
    step += len;
  }
  return { events: out, steps: step };
}

// arpeggio helper: 8 eighth notes from chord tones by index pattern
const arp = (notes, pat = [0, 1, 2, 1, 0, 1, 2, 3]) => pat.map((i) => notes[i] + ':2').join(' ');
const rep = (s, n) => Array(n).fill(s);

// voice: {wave:'square'|'triangle'|'noise', env:'pluck'|'sustain'|'drum', vol, duty?, bars:[...]}
const TRACKS = (() => {
  const T = {};
  // ---- level_day: C major, 140 bpm, 8 bars (C Am F G x2), marimba arpeggio + bouncy bass
  const dC = ['c5', 'e5', 'g5', 'c6'], dA = ['a4', 'c5', 'e5', 'a5'], dF = ['f4', 'a4', 'c5', 'f5'], dG = ['g4', 'b4', 'd5', 'g5'];
  const dayArp = [dC, dC, dA, dA, dF, dF, dG, dG].map((c) => arp(c));
  const dayBass = ['c3:4 g3:4 c3:4 g3:4', 'c3:4 g3:4 c3:4 g3:4', 'a2:4 e3:4 a2:4 e3:4', 'a2:4 e3:4 a2:4 e3:4',
    'f2:4 c3:4 f2:4 c3:4', 'f2:4 c3:4 f2:4 c3:4', 'g2:4 d3:4 g2:4 d3:4', 'g2:4 d3:4 g2:4 b2:4'];
  const dayMel = ['-:16', '-:16', '-:16', '-:16', 'e6:4 d6:2 c6:2 d6:4 -:4', 'c6:2 a5:2 c6:4 e6:8', 'g6:4 e6:2 d6:2 e6:4 -:4', 'd6:4 b5:4 g5:8'];
  T.level_day = { bpm: 140, loop: true, voices: [
    { wave: 'square', env: 'pluck', vol: 0.15, duty: 0.25, bars: dayArp },
    { wave: 'square', env: 'sustain', vol: 0.12, duty: 0.5, bars: dayMel },
    { wave: 'triangle', env: 'pluck', vol: 0.3, bars: dayBass },
    { wave: 'noise', env: 'drum', vol: 0.12, bars: rep('k:1 -:1 h:1 -:1 s:1 -:1 h:1 -:1 k:1 -:1 h:1 k:1 s:1 -:1 h:1 h:1', 8) },
  ] };
  // ---- level_dusk: A minor-tinged, 100 bpm, 8 bars (Am Fmaj7 Dm E7) slower, softer
  const kA = ['a4', 'c5', 'e5', 'a5'], kF = ['f4', 'a4', 'c5', 'e5'], kD = ['d5', 'f5', 'a5', 'd6'], kE = ['e4', 'g#4', 'd5', 'e5'];
  const duskArp = [kA, kA, kF, kF, kD, kD, kE, kE].map((c) => arp(c, [0, 2, 1, 3, 0, 2, 1, 3]));
  const duskBass = ['a2:8 e3:8', 'a2:8 c3:8', 'f2:8 c3:8', 'f2:8 a2:8', 'd3:8 a2:8', 'd3:8 f3:8', 'e3:8 b2:8', 'e3:6 g#3:2 b3:8'];
  const duskMel = ['e5:6 -:2 c5:8', 'a4:8 -:8', 'c5:6 -:2 a4:8', 'f4:8 -:8', 'd5:6 -:2 f5:8', 'a5:8 -:8', 'g#5:6 -:2 b5:4 -:4', 'e5:12 -:4'];
  T.level_dusk = { bpm: 100, loop: true, voices: [
    { wave: 'square', env: 'pluck', vol: 0.12, duty: 0.25, bars: duskArp },
    { wave: 'square', env: 'sustain', vol: 0.09, duty: 0.125, bars: duskMel },
    { wave: 'triangle', env: 'sustain', vol: 0.3, bars: duskBass },
    { wave: 'noise', env: 'drum', vol: 0.09, bars: rep('k:1 -:3 s:1 -:3 k:1 -:3 s:1 -:1 h:1 h:1', 8) },
  ] };
  // ---- level_night: sparse and tense, 128 bpm, 8 bars of A minor/Bb pedal, driving eighth bass
  const nb = (r, r2) => `${r}:2 ${r}:2 ${r2}:2 ${r}:2 ${r}:2 ${r}:2 ${r2}:2 ${r}:2`;
  const nightBass = [nb('a2', 'a3'), nb('a2', 'a3'), nb('a2', 'a3'), nb('bb2', 'bb3'), nb('a2', 'a3'), nb('a2', 'a3'), nb('f2', 'f3'), nb('e2', 'e3')];
  const nightLead = ['-:16', 'e5:2 -:6 f5:2 -:6', '-:16', 'e5:2 -:2 e5:2 -:2 bb5:4 -:4', '-:16', 'a5:2 -:6 g#5:2 -:6', 'c6:4 -:4 a5:4 -:4', 'b5:2 -:2 g#5:2 -:2 e5:8'];
  const nightPing = rep('-:12 e6:1 -:3', 8);
  T.level_night = { bpm: 128, loop: true, voices: [
    { wave: 'triangle', env: 'pluck', vol: 0.32, bars: nightBass },
    { wave: 'square', env: 'pluck', vol: 0.12, duty: 0.125, bars: nightLead },
    { wave: 'square', env: 'pluck', vol: 0.05, duty: 0.5, bars: nightPing },
    { wave: 'noise', env: 'drum', vol: 0.1, bars: rep('k:1 -:1 -:1 h:1 -:2 s:1 -:1 k:1 -:1 -:1 h:1 -:1 k:1 s:1 -:1', 8) },
  ] };
  // ---- title: heroic jingle, 120 bpm, 8 bars C major, with a cheeky Pete tuba motif (low square, bars 7-8)
  T.title = { bpm: 120, loop: true, voices: [
    { wave: 'square', env: 'sustain', vol: 0.15, duty: 0.25, bars: [
      'c5:4 -:2 c5:2 e5:4 g5:4', 'c6:6 g5:2 e5:8', 'f5:4 -:2 f5:2 a5:4 c6:4', 'b5:6 g5:2 d6:8',
      'e6:4 -:2 e6:2 d6:4 c6:4', 'a5:4 c6:4 f6:4 e6:4', 'd6:4 g5:4 b5:4 d6:4', 'c6:12 -:4'] },
    { wave: 'square', env: 'sustain', vol: 0.08, duty: 0.5, bars: [
      'e4:4 -:2 e4:2 g4:4 c5:4', 'e5:6 c5:2 g4:8', 'a4:4 -:2 a4:2 c5:4 f5:4', 'd5:6 b4:2 g4:8',
      'g4:4 -:2 g4:2 b4:4 e5:4', 'c5:4 e5:4 a5:4 g5:4', 'b4:4 d5:4 g5:4 b5:4', 'e5:12 -:4'] },
    { wave: 'triangle', env: 'sustain', vol: 0.3, bars: [
      'c3:4 g3:4 c3:4 g3:4', 'c3:4 g3:4 c3:4 e3:4', 'f2:4 c3:4 f2:4 c3:4', 'g2:4 d3:4 g2:4 b2:4',
      'c3:4 g3:4 c3:4 g3:4', 'f2:4 c3:4 f2:4 c3:4', 'g2:8 g2:4 b2:4', 'c3:12 -:4'] },
    // Pete tuba: low square oom-pah-pah wobble answering the heroes
    { wave: 'square', env: 'tuba', vol: 0.16, duty: 0.5, bars: [
      '-:16', '-:16', '-:16', '-:16', '-:16', '-:16',
      '-:8 c2:2 -:2 c2:2 -:2', 'e2:2 -:2 d2:2 -:2 c2:4 -:4'] },
    { wave: 'noise', env: 'drum', vol: 0.1, bars: rep('k:1 -:1 h:1 -:1 s:1 -:1 h:1 -:1 k:1 -:1 h:1 -:1 s:1 -:1 h:1 h:1', 8) },
  ] };
  // ---- levelclear sting: 2 bars, 140 bpm, rising fanfare
  T.levelclear = { bpm: 140, loop: false, tail: 0.6, voices: [
    { wave: 'square', env: 'sustain', vol: 0.18, duty: 0.25, bars: ['c5:2 e5:2 g5:2 c6:2 e6:4 d6:2 e6:2', 'g6:12 -:4'] },
    { wave: 'square', env: 'sustain', vol: 0.09, duty: 0.5, bars: ['e5:2 g5:2 c6:2 e6:2 g6:4 f6:2 g6:2', 'c7:12 -:4'] },
    { wave: 'triangle', env: 'sustain', vol: 0.3, bars: ['c3:4 e3:4 g3:4 c4:4', 'c3:12 -:4'] },
  ] };
  // ---- gameover sting: 3 bars, 90 bpm, descending, minor, wah-wah tuba end
  T.gameover = { bpm: 90, loop: false, tail: 0.8, voices: [
    { wave: 'square', env: 'sustain', vol: 0.16, duty: 0.25, bars: ['e5:4 d5:4 c5:4 b4:4', 'a4:4 g4:4 f4:4 e4:4', 'a3:16'] },
    { wave: 'triangle', env: 'sustain', vol: 0.3, bars: ['a2:8 g2:8', 'f2:8 e2:8', 'a2:16'] },
    { wave: 'square', env: 'tuba', vol: 0.14, duty: 0.5, bars: ['-:16', '-:16', '-:4 g2:3 -:1 f#2:3 -:1 f2:4'] },
  ] };
  return T;
})();

const DRUM = { k: { dur: 0.09, hz0: 150, hz1: 45 }, s: { dur: 0.11 }, h: { dur: 0.035 } };
const MAX_DUR = { pluck: 0.5, tuba: 1 };

// Describe a track as pure data. Throws if any bar is not exactly 16 steps.
export function describeMusic(name) {
  const tr = TRACKS[name];
  if (!tr) throw new Error('unknown music ' + name);
  const stepSec = 60 / tr.bpm / 4;
  let bars = 0;
  const voices = tr.voices.map((v, vi) => {
    if (bars && v.bars.length !== bars) throw new Error(`${name}: voice ${vi} has ${v.bars.length} bars, expected ${bars}`);
    bars = v.bars.length;
    const notes = [];
    v.bars.forEach((b, bi) => {
      const p = parseBar(b);
      if (p.steps !== STEPS_PER_BAR) throw new Error(`${name}: voice ${vi} bar ${bi + 1} has ${p.steps} steps`);
      for (const e of p.events) {
        const t = (bi * STEPS_PER_BAR + e.step) * stepSec;
        if (v.wave === 'noise') notes.push({ t, dur: DRUM[e.note].dur, drum: e.note, vol: v.vol * (e.note === 'h' ? 0.6 : 1) });
        else {
          const midi = midiOf(e.note);
          if (midi == null) throw new Error(`${name}: bad note ${e.note}`);
          notes.push({ t, dur: e.len * stepSec, freq: freqOf(midi), vol: v.vol });
        }
      }
    });
    return { wave: v.wave, env: v.env, duty: v.duty ?? 0.5, notes };
  });
  return { name, bpm: tr.bpm, bars, loop: tr.loop, tail: tr.tail ?? 0, length: bars * STEPS_PER_BAR * stepSec, voices };
}

// Envelope gain at time u (s) into a note of duration dur. Short attack / release => no clicks.
const ATT = 0.006, REL = 0.02;
export function envGain(env, u, dur) {
  if (u < 0) return 0;
  const a = Math.min(1, u / ATT);
  let g = a;
  if (env === 'pluck') {
    g *= Math.exp(-u / 0.16);
    const rel0 = Math.min(dur, MAX_DUR.pluck);
    if (u > rel0) g *= Math.max(0, 1 - (u - rel0) / REL);
    return u > rel0 + REL ? 0 : g;
  }
  if (env === 'drum') return g * Math.exp(-u / (dur * 0.35));
  if (env === 'tuba') g *= 0.75 + 0.25 * Math.exp(-u / 0.08);
  const rel = Math.min(REL, dur * 0.4);
  if (u > dur - rel) g *= Math.max(0, (dur - u) / rel);
  return u > dur ? 0 : g;
}

function noteSpan(v, n) { return v.env === 'pluck' ? Math.min(n.dur, MAX_DUR.pluck) + REL : n.dur; }

// Offline render -> mono Float32Array. Loops wrap around when seconds > loop length.
export function renderMusic(name, sr = 44100, seconds) {
  const d = describeMusic(name);
  const total = seconds ?? (d.length + d.tail);
  const N = Math.round(total * sr);
  const out = new Float32Array(N);
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const loops = d.loop ? Math.ceil(total / d.length) : 1;
  for (const v of d.voices) {
    for (let lp = d.loop ? -1 : 0; lp < loops; lp++) {   // lp -1 wraps ringing notes from the previous loop into the start
      for (const n of v.notes) {
        const t0 = (lp * Math.round(d.length * sr) + Math.round(n.t * sr)) / sr;   // sample-aligned so every loop renders identically
        if (t0 >= total) continue;
        const span = n.drum ? n.dur * 2 : noteSpan(v, n);
        if (t0 + span <= 0) continue;
        const iS = lp * Math.round(d.length * sr) + Math.round(n.t * sr);
        const i0 = Math.max(0, iS), i1 = Math.min(N, iS + Math.ceil(span * sr));
        let ph = 0, lo = 0, lpState = 0;
        seed = (Math.round(n.t * 1000) * 2654435761 + 12345) >>> 0;   // per-note noise seed: loops repeat exactly
        if (n.freq) { ph = (n.freq * (i0 - iS) / sr) % 1; }   // wrapped notes enter mid-phase
        for (let i = i0; i < i1; i++) {
          const u = (i - iS) / sr;
          let s;
          if (n.drum === 'k') { const f = 45 + 105 * Math.exp(-u / 0.025); ph += f / sr; s = Math.sin(2 * Math.PI * ph); }
          else if (n.drum === 's') { s = rnd() * 0.8 + (Math.sin(2 * Math.PI * 190 * u) * 0.4); }
          else if (n.drum === 'h') { const x = rnd(); s = x - lo; lo = x; }   // crude high-pass
          else {
            ph += n.freq / sr; ph -= Math.floor(ph);
            if (v.wave === 'square') s = ph < v.duty ? 1 : -1;
            else s = 4 * Math.abs(ph - 0.5) - 1;
            if (v.env === 'tuba') s = 0.7 * s + 0.3 * Math.sin(2 * Math.PI * ph);
          }
          out[i] += s * n.vol * envGain(n.drum ? 'drum' : v.env, u, n.dur);
        }
        void lpState;
      }
    }
  }
  // soft safety: never exceed 0.95
  let pk = 0; for (let i = 0; i < N; i++) { const a = Math.abs(out[i]); if (a > pk) pk = a; }
  if (pk > 0.95) { const g = 0.95 / pk; for (let i = 0; i < N; i++) out[i] *= g; }
  return out;
}

// Numbers for judging by eye-less ear: peak, rms, length, spectral centroid (Hz), loop seam jump.
export function stats(pcm, sr = 44100) {
  let peak = 0, sum = 0, nan = 0;
  for (let i = 0; i < pcm.length; i++) { const x = pcm[i]; if (!Number.isFinite(x)) { nan++; continue; } peak = Math.max(peak, Math.abs(x)); sum += x * x; }
  // centroid from a zero-crossing-free DFT over a few 2048-sample windows
  const W = 1024, hop = Math.max(W, Math.floor(pcm.length / 24)); let cn = 0, cd = 0;
  for (let s = 0; s + W <= pcm.length; s += hop) {
    for (let k = 1; k < W / 2; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < W; i++) { const w = pcm[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / W)); re += w * Math.cos(2 * Math.PI * k * i / W); im -= w * Math.sin(2 * Math.PI * k * i / W); }
      const m = Math.hypot(re, im); cn += m * (k * sr / W); cd += m;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, pcm.length)), len: pcm.length / sr, centroid: cd ? cn / cd : 0, nan };
}

// ---------------------------------------------------------------- live WebAudio
export function createMusic(ctx, dest) {
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(dest);
  let cur = null, noiseBuf = null;
  const getNoise = () => {
    if (noiseBuf) return noiseBuf;
    const n = Math.floor(ctx.sampleRate * 0.25); noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0); let s = 7; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; ch[i] = (s / 4294967296) * 2 - 1; }
    return noiseBuf;
  };
  const schedNote = (out, v, n, t0) => {
    const g = ctx.createGain(); g.connect(out);
    const peak = n.vol;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + ATT);
    let end;
    if (n.drum) {
      end = t0 + n.dur * 2;
      g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak * 0.05), t0 + n.dur * 0.35 * 3);
      g.gain.linearRampToValueAtTime(0, end);
      let src;
      if (n.drum === 'k') { src = ctx.createOscillator(); src.type = 'sine'; src.frequency.setValueAtTime(150, t0); src.frequency.exponentialRampToValueAtTime(45, t0 + 0.08); }
      else { src = ctx.createBufferSource(); src.buffer = getNoise(); if (n.drum === 'h') { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000; src.connect(hp); hp.connect(g); } }
      if (!(n.drum === 'h')) src.connect(g);
      src.start(t0); src.stop(end);
      return;
    }
    const osc = ctx.createOscillator();
    if (v.wave === 'square' && ctx.createPeriodicWave && v.duty !== 0.5) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * v.duty);   // pulse wave sine series
      for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * (1 - Math.cos(k * 2 * Math.PI * v.duty)) * 0;   // sine series only; DC ignored
      osc.setPeriodicWave(ctx.createPeriodicWave(re, im));
    } else osc.type = v.wave;
    osc.frequency.value = n.freq;
    osc.connect(g);
    if (v.env === 'pluck') {
      const hold = Math.min(n.dur, MAX_DUR.pluck);
      g.gain.setTargetAtTime(0, t0 + ATT, 0.16);
      end = t0 + hold + REL;
      g.gain.cancelScheduledValues(end - REL); g.gain.setValueAtTime(peak * Math.exp(-(hold - ATT) / 0.16), end - REL);
    } else { end = t0 + n.dur; g.gain.setValueAtTime(peak, Math.max(t0 + ATT, end - REL)); }
    g.gain.linearRampToValueAtTime(0, end);
    osc.start(t0); osc.stop(end + 0.01);
  };
  const stopCur = () => {
    if (!cur) return;
    const c = cur; cur = null; clearInterval(c.timer);
    const now = ctx.currentTime; try { c.out.gain.cancelScheduledValues(now); c.out.gain.setValueAtTime(c.out.gain.value, now); c.out.gain.linearRampToValueAtTime(0, now + 0.05); } catch (e) { /* ignore */ }
    setTimeout(() => { try { c.out.disconnect(); } catch (e) { /* ignore */ } }, 200);
  };
  return {
    play(name) {
      stopCur();
      if (name == null) return;
      const d = describeMusic(name);
      const out = ctx.createGain(); out.gain.value = 1; out.connect(bus);
      const st = { out, timer: null }; cur = st;
      let start = ctx.currentTime + 0.05, lp = 0;
      const AHEAD = 0.6;
      const pump = () => {
        if (cur !== st) return;
        while (start + lp * d.length < ctx.currentTime + AHEAD) {
          const base = start + lp * d.length;
          for (const v of d.voices) for (const n of v.notes) schedNote(out, v, n, base + n.t);
          lp++;
          if (!d.loop) { clearInterval(st.timer); return; }
        }
      };
      pump();
      if (d.loop) st.timer = setInterval(pump, 150);
    },
    stop: stopCur,
  };
}
