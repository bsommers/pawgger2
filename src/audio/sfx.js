// Sound effects as pure data (ARCHITECTURE §9). Each recipe is an array of voices. The same voices
// drive live WebAudio (schedule) and offline PCM (renderSfx), so what the tool renders is what plays.
import { SFX } from '../core/defs.js';

export const SFX_NAMES = SFX;
export const ATTACK = 0.02;    // seconds, linear fade-in on every voice
export const RELEASE = 0.02;   // seconds, linear fade-out on every voice

// voice: { wave: 'square'|'triangle'|'sine'|'noise', at, dur, f0, f1, vol, decay }
//   at     start offset within the effect (s)
//   f0->f1 exponential pitch sweep over dur (Hz); ignored for noise
//   vol    peak amplitude (0..1)
//   decay  exponential amplitude decay rate after the attack (1/s), 0 = flat sustain
const tone = (wave, at, dur, f0, vol, o = {}) => ({ wave, at, dur, f0, f1: o.f1 ?? f0, vol, decay: o.decay ?? 0 });
const noise = (at, dur, vol, o = {}) => ({ wave: 'noise', at, dur, f0: 0, f1: 0, vol, decay: o.decay ?? 0 });
// one tone per note, notes[i] starting at i*step
const seq = (wave, notes, step, dur, vol) => notes.map((f, i) => tone(wave, i * step, dur, f, vol));

const RECIPES = {
  hop: [tone('square', 0, 0.06, 520, 0.2, { f1: 760 })],
  hop_log: [tone('triangle', 0, 0.09, 180, 0.4, { f1: 260 }), noise(0, 0.04, 0.1, { decay: 30 })],
  land_safe: seq('square', [440, 660], 0.05, 0.07, 0.2),
  row_up: seq('square', [1047, 1319, 1568, 2093], 0.05, 0.06, 0.18),
  splash: [noise(0, 0.35, 0.35, { decay: 6 }), tone('triangle', 0, 0.25, 400, 0.2, { f1: 120 })],
  squash: [noise(0, 0.12, 0.45, { decay: 12 }), tone('square', 0, 0.12, 160, 0.25, { f1: 60 })],
  honk: [tone('square', 0, 0.25, 311, 0.18), tone('square', 0, 0.25, 370, 0.14)],
  honk_far: [tone('triangle', 0, 0.25, 311, 0.14)],
  croc_snap: [noise(0, 0.08, 0.45, { decay: 20 }), tone('square', 0, 0.1, 500, 0.2, { f1: 90 })],
  snake_hiss: [noise(0, 0.4, 0.25, { decay: 3 })],
  turtle_dive: [tone('triangle', 0, 0.35, 400, 0.35, { f1: 100, decay: 2 }), noise(0.1, 0.2, 0.12, { decay: 8 })],
  roller_rumble: [noise(0, 0.6, 0.25, { decay: 1.5 }), tone('triangle', 0, 0.6, 80, 0.3)],
  roller_warn: [tone('square', 0, 0.08, 880, 0.16), tone('square', 0.12, 0.08, 880, 0.16), tone('square', 0.24, 0.08, 880, 0.16)],
  bay_fill: seq('square', [784, 988, 1175, 1568], 0.04, 0.05, 0.18),
  bay_all: [...seq('square', [523, 659, 784, 1047], 0.08, 0.1, 0.18), tone('triangle', 0.32, 0.4, 523, 0.25)],
  bonus: [tone('square', 0, 0.06, 988, 0.2), tone('square', 0.06, 0.1, 1319, 0.2)],
  pickup: [tone('square', 0, 0.08, 1200, 0.18, { f1: 1800 }), tone('square', 0.08, 0.1, 1600, 0.16)],
  tick_low: [tone('square', 0, 0.03, 1000, 0.18)],
  die: [tone('square', 0, 0.6, 600, 0.25, { f1: 80, decay: 1.5 }), tone('triangle', 0, 0.6, 300, 0.18, { f1: 60, decay: 1 })],
  respawn: [tone('triangle', 0, 0.25, 220, 0.3, { f1: 880 })],
  oneup: seq('square', [659, 784, 1319, 1568, 2093], 0.07, 0.07, 0.18),
  pete_laugh: [0, 0.14, 0.28].map((at) => tone('square', at, 0.1, 330, 0.18, { f1: 240 })),
  level_clear: [...seq('square', [523, 659, 784, 1047], 0.1, 0.12, 0.18), tone('triangle', 0.4, 0.5, 1047, 0.25)],
  menu_move: [tone('square', 0, 0.03, 880, 0.14)],
  menu_select: [tone('square', 0, 0.05, 660, 0.18), tone('square', 0.05, 0.08, 990, 0.18)],
  gameover: [
    tone('square', 0, 0.25, 392, 0.18), tone('square', 0.25, 0.25, 349, 0.18), tone('square', 0.5, 0.25, 330, 0.18),
    tone('triangle', 0.75, 0.6, 262, 0.25, { decay: 1 }),
  ],
  start: [tone('square', 0, 0.08, 523, 0.18), tone('square', 0.08, 0.08, 784, 0.18), tone('square', 0.16, 0.15, 1047, 0.18)],
};

// Deep copy so callers cannot mutate the recipe table.
export function describe(name) {
  const r = Object.prototype.hasOwnProperty.call(RECIPES, name) ? RECIPES[name] : [];
  return r.map((v) => ({ ...v }));
}

function fnv(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// Deterministic white noise in [-1, 1) (xorshift32). Same seed, same samples, live or offline.
function noiseBuf(n, seed) {
  const out = new Float32Array(n);
  let x = seed >>> 0 || 0x9e3779b9;
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    x >>>= 0;
    out[i] = x / 2147483648 - 1;
  }
  return out;
}

const seedFor = (name, idx) => (fnv(name) + idx * 7919 + 1) >>> 0;

// Offline PCM render, mono Float32 at sr. Peak is kept <= 1 by the recipe gains; nothing is normalised.
export function renderSfx(name, sr = 44100) {
  const voices = describe(name);
  const end = voices.reduce((m, v) => Math.max(m, v.at + v.dur), 0);
  const out = new Float32Array(Math.ceil(end * sr));
  voices.forEach((v, idx) => {
    const n0 = Math.round(v.at * sr);
    const n = Math.ceil(v.dur * sr);
    const A = Math.min(ATTACK, v.dur / 2);
    const R = Math.min(RELEASE, v.dur / 2);
    const nb = v.wave === 'noise' ? noiseBuf(n, seedFor(name, idx)) : null;
    let phase = 0;
    for (let i = 0; i < n && n0 + i < out.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / A) * Math.min(1, (v.dur - t) / R) * v.vol * Math.exp(-v.decay * Math.max(0, t - A));
      let s;
      if (nb) s = nb[i];
      else {
        const frac = phase - Math.floor(phase);
        if (v.wave === 'square') s = frac < 0.5 ? 1 : -1;
        else if (v.wave === 'triangle') s = 4 * Math.abs(frac - 0.5) - 1;
        else s = Math.sin(2 * Math.PI * frac);
        phase += (v.f0 * Math.pow(v.f1 / v.f0, t / v.dur)) / sr;
      }
      out[n0 + i] += env * s;
    }
  });
  return out;
}

// Live WebAudio: schedules the same voices on ctx, routed through dest. Returns the end time (s).
export function schedule(ctx, dest, voices, t0, opts = {}) {
  const scale = opts.volume ?? 1;
  const sr = ctx.sampleRate;
  let end = t0;
  voices.forEach((v, idx) => {
    const s = t0 + v.at;
    const e = s + v.dur;
    end = Math.max(end, e);
    const A = Math.min(ATTACK, v.dur / 2);
    const R = Math.min(RELEASE, v.dur / 2);
    const tail = v.dur - R;
    const peak = v.vol * scale;
    const g = ctx.createGain();
    g.connect(dest);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(peak, s + A);
    if (v.decay > 0 && tail > A) {
      g.gain.setValueAtTime(peak, s + A);
      g.gain.exponentialRampToValueAtTime(peak * Math.exp(-v.decay * (tail - A)), s + tail);
    } else {
      g.gain.setValueAtTime(peak, s + Math.max(A, tail));
    }
    g.gain.linearRampToValueAtTime(0, e);
    let src;
    if (v.wave === 'noise') {
      const n = Math.ceil(v.dur * sr);
      const buf = ctx.createBuffer(1, n, sr);
      buf.getChannelData(0).set(noiseBuf(n, seedFor(opts.name ?? '', idx)));
      src = ctx.createBufferSource();
      src.buffer = buf;
    } else {
      src = ctx.createOscillator();
      src.type = v.wave;
      src.frequency.setValueAtTime(v.f0, s);
      if (v.f1 !== v.f0) src.frequency.exponentialRampToValueAtTime(v.f1, e);
    }
    src.connect(g);
    src.start(s);
    src.stop(e + 0.01);
  });
  return end;
}

// Numbers for judging a render: peak, rms, length in samples and seconds, and a zero-crossing
// centroid estimate (Hz; a rough brightness proxy, not a true spectral centroid).
export function stats(pcm, sr = 44100) {
  let peak = 0, sq = 0, zc = 0;
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i];
    const a = Math.abs(x);
    if (a > peak) peak = a;
    sq += x * x;
    if (i > 0 && (pcm[i - 1] < 0) !== (x < 0)) zc++;
  }
  const len = pcm.length;
  const sec = len / sr;
  return { peak, rms: len ? Math.sqrt(sq / len) : 0, len, sec, centroid: sec > 0 ? zc / (2 * sec) : 0 };
}
