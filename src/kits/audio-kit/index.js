// audio-kit: synth voices, SFX recipe tables, tracker-style songs, offline render, WAV writer, jingle/soundtrack helpers.
// Pure JS: Node-importable, deterministic. Live WebAudio playback via scheduleVoices() / scheduleSong().
//
// Voice (plain data): { src:'sine'|'square'|'saw'|'triangle'|'noise', t, dur, gain, att, f: Hz | Hz[] (exp-interpolated),
//                       fm?:{ratio,depth}, filters?:[{type:'lp'|'hp'|'bp', f, q, g?}], parallel?:bool }
// SFX recipe table: { name: (v, helpers) => void } where v(voice) appends a voice.
// Song: { bpm, bars, loop, channels: { name: { wave:'pulse'|'tri', duty, vel, gate, sus, pat:[bar strings] } }, drums?: { vel, pat:[16-char bars] } }
//   bar string tokens: NOTE[:len16ths] | .[:len]  e.g. "D5:2 F#5:2 A5:4 .:8"  (must total 16 steps); drums: k s h t K(k+h) S(s+h) .

export const STEPS_PER_BAR = 16;
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** number, or array spread evenly over u in [0,1]; exponential between positive points. */
export function curve(c, u) {
  if (typeof c === 'number') return c;
  const n = c.length - 1;
  if (n === 0) return c[0];
  const x = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(x), n - 1), k = x - i, a = c[i], b = c[i + 1];
  return a > 0 && b > 0 ? a * Math.pow(b / a, k) : a + (b - a) * k;
}
const scaleF = (f, p) => (typeof f === 'number' ? f * p : f.map((x) => x * p));

// ---- SFX recipes ---------------------------------------------------------------------------------------------------
/** Notes (MIDI numbers) one after another: arp(v, [72,76,79], 0.05, {src,dur,gain,lp}). */
export const arp = (v, notes, step, o = {}) => notes.forEach((n, i) => v({
  src: o.src || 'square', t: (o.t0 || 0) + i * step, dur: o.dur ?? step * 1.6, gain: o.gain ?? 0.2, att: 0.004, f: midiHz(n),
  filters: o.lp ? [{ type: 'lp', f: o.lp, q: 0.7 }] : undefined,
}));
/** Recipe table -> voices for one name. opts.pitch scales every pitched voice (variation without new recipes). */
export function describeSfx(table, name, { pitch = 1 } = {}) {
  if (!Object.hasOwn(table, name)) throw new Error(`unknown sfx: ${name}`);
  const list = [];
  table[name]((spec) => list.push({ src: 'sine', t: 0, dur: 0.1, gain: 0.3, att: 0.003, f: 440, ...spec }), { arp, midiHz });
  if (pitch !== 1) for (const o of list) {
    if (o.src !== 'noise') o.f = scaleF(o.f, pitch);
    if (o.filters) o.filters = o.filters.map((fs) => ({ ...fs, f: scaleF(fs.f, pitch) }));
  }
  return list;
}
export const voicesDuration = (voices) => voices.reduce((d, o) => Math.max(d, o.t + o.dur), 0);

/** Starter table so a new game has sound on day one. */
export const DEFAULT_SFX = {
  blip: (v) => v({ src: 'square', dur: 0.08, gain: 0.16, f: [440, 660] }),
  jump: (v) => { v({ src: 'square', dur: 0.16, gain: 0.16, f: [260, 640], filters: [{ type: 'lp', f: 3000, q: 0.7 }] }); v({ src: 'triangle', dur: 0.16, gain: 0.12, f: [130, 300] }); },
  land: (v) => { v({ src: 'sine', dur: 0.14, gain: 0.35, f: [110, 48] }); v({ src: 'noise', dur: 0.06, gain: 0.12, f: 1, filters: [{ type: 'lp', f: 700, q: 0.7 }] }); },
  pickup: (v, { arp }) => arp(v, [76, 79, 83, 88], 0.05, { dur: 0.14, gain: 0.18 }),
  hurt: (v) => { v({ src: 'saw', dur: 0.3, gain: 0.22, f: [400, 90], filters: [{ type: 'lp', f: 1500, q: 1 }] }); v({ src: 'noise', dur: 0.12, gain: 0.12, f: 1 }); },
  splash: (v) => v({ src: 'noise', dur: 0.35, gain: 0.25, att: 0.01, f: 1, filters: [{ type: 'bp', f: [2500, 500], q: 1 }] }),
};

// ---- offline renderer (PCM) ----------------------------------------------------------------------------------------
function biquad(type, fc, q, sr) {
  const w = 2 * Math.PI * Math.min(Math.max(fc, 20), sr * 0.45) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.max(q, 0.1));
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
}
function renderVoice(o, sr, out, seed) {
  const start = Math.round(o.t * sr), n = Math.min(Math.round(o.dur * sr), out.length - start);
  if (n <= 0) return;
  const tau = Math.PI * 2, decayK = Math.log(0.0008 / Math.max(o.gain, 1e-4));
  let ph = 0, mph = 0, s = (seed * 2654435761) >>> 0 || 1;
  const fl = (o.filters || []).map((f) => ({ f, c: [0, 0, 0, 0, 0], x1: 0, x2: 0, y1: 0, y2: 0 }));
  const att = Math.min(o.att, o.dur / 2), fade = Math.min(0.01 * sr, n);
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(n - 1, 1), tt = i / sr;
    let x;
    if (o.src === 'noise') { s = (s * 1664525 + 1013904223) >>> 0; x = s / 2147483648 - 1; } else {
      const f = curve(o.f, u); let inst = f;
      if (o.fm) { mph += tau * f * o.fm.ratio / sr; inst = f + o.fm.depth * Math.sin(mph); }
      ph += inst / sr; ph -= Math.floor(ph);
      x = o.src === 'sine' ? Math.sin(tau * ph) : o.src === 'square' ? (ph < 0.5 ? 1 : -1) : o.src === 'saw' ? 2 * ph - 1 : 4 * Math.abs(ph - 0.5) - 1;
    }
    if (fl.length) {
      const run = (st, v) => {
        if ((i & 15) === 0) st.c = biquad(st.f.type, curve(st.f.f, u), st.f.q ?? 0.7, sr);
        const c = st.c, y = c[0] * v + c[1] * st.x1 + c[2] * st.x2 - c[3] * st.y1 - c[4] * st.y2;
        st.x2 = st.x1; st.x1 = v; st.y2 = st.y1; st.y1 = y; return y;
      };
      if (o.parallel) { let sum = 0; for (const st of fl) sum += run(st, x) * (st.f.g ?? 1); x = sum; } else for (const st of fl) x = run(st, x);
    }
    const env = o.gain * (tt < att ? tt / att : Math.exp(decayK * (tt - att) / Math.max(o.dur - att, 1e-4)));
    out[start + i] += x * env * (i > n - fade ? (n - i) / fade : 1);
  }
}
/** Voices -> mono Float32Array. Peak limited to 0.98. */
export function renderVoices(voices, sr = 44100, { tail = 0.02, seed = 1 } = {}) {
  const out = new Float32Array(Math.ceil((voicesDuration(voices) + tail) * sr));
  voices.forEach((o, i) => renderVoice(o, sr, out, seed + i * 7919));
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  if (peak > 0.98) for (let i = 0; i < out.length; i++) out[i] *= 0.98 / peak;
  return out;
}
export const renderSfx = (table, name, sr = 44100, opts = {}) => renderVoices(describeSfx(table, name, opts), sr, opts);

// ---- songs ---------------------------------------------------------------------------------------------------------
/** Parse one bar string into [{step, midi, len}]; throws unless it fills exactly 16 steps. */
export function parseBar(str) {
  const out = []; let step = 0;
  for (const tok of str.replace(/\|/g, ' ').trim().split(/\s+/)) {
    const m = /^([A-G][#b]?-?\d|\.)(?::(\d+))?$/.exec(tok);
    if (!m) throw new Error(`bad token "${tok}" in "${str}"`);
    const len = m[2] ? +m[2] : 1;
    if (m[1] !== '.') out.push({ step, midi: noteMidi(m[1]), len });
    step += len;
  }
  if (step !== STEPS_PER_BAR) throw new Error(`bar "${str}" is ${step} steps, need ${STEPS_PER_BAR}`);
  return out;
}
const DRUM = {
  k: { sweep: [150, 45, 0.12], decay: 0.2, gain: 0.60 }, s: { hp: 1400, decay: 0.13, gain: 0.26, tone: [185, 0.07, 0.18] },
  h: { hp: 6500, decay: 0.045, gain: 0.10 }, t: { sweep: [230, 110, 0.15], decay: 0.24, gain: 0.40 },
};
const DRUM_CHARS = { k: ['k'], s: ['s'], h: ['h'], t: ['t'], K: ['k', 'h'], S: ['s', 'h'] };
const ATT = 0.006, REL = 0.02, MASTER = 0.78;

/** Song -> { bpm, bars, loop, length (s per pass), events: [{t, kind:'tone'|'drum', ...}] } sorted by t. Deterministic. */
export function describeSong(song) {
  const ss = 60 / song.bpm / 4, events = [];
  for (const [ch, C] of Object.entries(song.channels || {})) {
    for (let b = 0; b < song.bars; b++) for (const n of parseBar(C.pat[b % C.pat.length])) {
      events.push({ t: (b * STEPS_PER_BAR + n.step) * ss, kind: 'tone', ch, wave: C.wave || 'pulse', duty: C.duty ?? 0.5, hz: midiHz(n.midi), vel: C.vel ?? 0.2, dur: Math.max(0.04, n.len * ss * (C.gate ?? 0.8)), sus: C.sus ?? 0.5 });
    }
  }
  if (song.drums) {
    let ni = 0;
    for (let b = 0; b < song.bars; b++) {
      const bar = song.drums.pat[b % song.drums.pat.length];
      if (bar.length !== STEPS_PER_BAR) throw new Error('drum bar must be 16 chars: ' + bar);
      for (let s = 0; s < bar.length; s++) for (const d of DRUM_CHARS[bar[s]] ?? []) events.push({ t: (b * STEPS_PER_BAR + s) * ss, kind: 'drum', ch: 'drums', d, vel: song.drums.vel ?? 1, noiseOff: (ni++ * 0.0731) % 0.9 });
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { bpm: song.bpm, bars: song.bars, loop: !!song.loop, length: song.bars * STEPS_PER_BAR * ss, events };
}
const polyblep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
const toneTail = (ev) => ev.dur + REL;
function toneAmp(ev, t) {
  if (t < ATT) return t / ATT;
  if (t < ev.dur) return ev.sus ** ((t - ATT) / Math.max(1e-4, ev.dur - ATT));
  const r = 1 - (t - ev.dur) / REL; return r > 0 ? ev.sus * r : 0;
}
function addTone(out, sr, i0, ev) {
  const n = Math.ceil(toneTail(ev) * sr), dt = ev.hz / sr;
  let ph = 0;
  for (let i = 0; i < n; i++, ph += dt) {
    if (ph >= 1) ph -= 1;
    const idx = i0 + i; if (idx >= out.length) break;
    let v;
    if (ev.wave === 'tri') v = 4 * Math.abs(ph - 0.5) - 1; else { v = ph < ev.duty ? 1 : -1; v += polyblep(ph, dt) - polyblep((ph + 1 - ev.duty) % 1, dt); }
    if (idx >= 0) out[idx] += v * ev.vel * toneAmp(ev, i / sr) * MASTER;
  }
}
function addDrum(out, sr, i0, ev, noise) {
  const D = DRUM[ev.d], n = Math.ceil((D.decay + 0.01) * sr), a = D.hp ? 1 - Math.exp((-2 * Math.PI * D.hp) / sr) : 0;
  let lp = 0, ph = 0, ni = Math.floor(ev.noiseOff * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, idx = i0 + i; if (idx >= out.length) break;
    const env = (t < 0.002 ? t / 0.002 : 0.001 ** (t / D.decay)) * ev.vel * D.gain * MASTER;
    let v = 0;
    if (D.sweep) { const [f0, f1, T] = D.sweep; ph += (f0 * (f1 / f0) ** Math.min(1, t / T)) / sr; v += Math.sin(2 * Math.PI * ph); }
    if (D.hp) { const x = noise[ni++ % noise.length]; lp += a * (x - lp); v += x - lp; }
    if (D.tone) v += Math.sin(2 * Math.PI * D.tone[0] * t) * D.tone[2] / D.gain * 0.6 * 0.001 ** (t / D.tone[1]);
    if (idx >= 0) out[idx] += v * env;
  }
}
function noiseTable(sr) { const n = Math.round(sr), a = new Float32Array(n); let s = 12345; for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; a[i] = (s / 4294967296) * 2 - 1; } return a; }
/** Offline render of a song (one pass; loops wrap seamlessly; non-loops get a 0.6 s tail). */
export function renderSong(song, sr = 44100, seconds) {
  const T = describeSong(song), secs = seconds ?? (T.loop ? T.length : T.length + 0.6);
  const N = Math.max(1, Math.round(secs * sr)), out = new Float32Array(N), noise = noiseTable(sr);
  for (let k = T.loop ? -1 : 0, kTo = T.loop ? Math.ceil(secs / T.length) : 0; k <= kTo; k++) {
    for (const ev of T.events) {
      const t0 = ev.t + k * T.length;
      if (t0 >= secs) break;
      if (t0 + (ev.kind === 'tone' ? toneTail(ev) : DRUM[ev.d].decay + 0.01) <= 0) continue;
      if (ev.kind === 'tone') addTone(out, sr, Math.round(t0 * sr), ev); else addDrum(out, sr, Math.round(t0 * sr), ev, noise);
    }
  }
  for (let i = 0; i < N; i++) out[i] = out[i] > 1 ? 1 : out[i] < -1 ? -1 : out[i];
  return out;
}
export function pcmStats(pcm) {
  let peak = 0, sq = 0;
  for (const x of pcm) { const a = Math.abs(x); if (a > peak) peak = a; sq += x * x; }
  return { peak, rms: Math.sqrt(sq / Math.max(1, pcm.length)), len: pcm.length };
}

// ---- WAV ----------------------------------------------------------------------------------------------------------
/** Float32Array mono -> 16-bit PCM WAV bytes (Uint8Array). */
export function toWav(pcm, sr = 44100) {
  const b = new Uint8Array(44 + pcm.length * 2), v = new DataView(b.buffer), w = (o, s) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
  return b;
}
/** Parse a WAV made by toWav -> { sr, pcm }. */
export function fromWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = v.getUint32(40, true) / 2, pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = v.getInt16(44 + i * 2, true) / 32767;
  return { sr: v.getUint32(24, true), pcm };
}

// ---- jingles & soundtrack ------------------------------------------------------------------------------------------
/** A jingle as a one-line song: jingle("C5:2 E5:2 G5:4 C6:8", {bpm}) -> song (pad with rests to a whole bar is automatic). */
export function jingle(notes, { bpm = 140, wave = 'pulse', duty = 0.25, vel = 0.3, bass } = {}) {
  const toks = notes.trim().split(/\s+/); let steps = 0;
  for (const t of toks) steps += +(t.split(':')[1] || 1);
  const bars = Math.max(1, Math.ceil(steps / STEPS_PER_BAR)), pad = bars * STEPS_PER_BAR - steps;
  const all = pad ? [...toks, `.:${pad}`] : toks, pat = [];
  for (let b = 0, cur = [], n = 0, i = 0; b < bars; ) {      // split token stream into 16-step bars (long notes split with ties not supported: keep notes <= bar)
    const t = all[i++], len = +(t.split(':')[1] || 1);
    if (n + len > STEPS_PER_BAR) throw new Error('jingle: note crosses a bar line: ' + t);
    cur.push(t); n += len;
    if (n === STEPS_PER_BAR) { pat.push(cur.join(' ')); cur = []; n = 0; b++; }
  }
  const song = { bpm, bars, loop: false, channels: { lead: { wave, duty, vel, gate: 0.85, sus: 0.5, pat } } };
  if (bass) song.channels.bass = { wave: 'tri', vel: 0.4, gate: 0.9, sus: 0.8, pat: bass };
  return song;
}
/** Soundtrack: maps game state -> track name. soundtrack({ menu:'title', play:'jungle', dead:'gameover' }) -> { for(state), changed(state) }. */
export function soundtrack(map, fallback = null) {
  let last = undefined;
  return {
    for: (state) => (Object.hasOwn(map, state) ? map[state] : fallback),
    /** returns the track to start when the state change requires a different track, else undefined (keep playing). */
    changed(state) { const t = this.for(state); if (t === last) return undefined; last = t; return t; },
  };
}

// ---- live WebAudio (browser) ---------------------------------------------------------------------------------------
function rampParam(param, c, t0, dur) {
  const arr = typeof c === 'number' ? [c, c] : c, n = arr.length - 1;
  param.setValueAtTime(arr[0], t0);
  for (let i = 1; i <= n; i++) param.exponentialRampToValueAtTime(Math.max(arr[i], 1e-3), t0 + dur * (i / n));
}
/** Schedule SFX voices on a BaseAudioContext at time t0; returns the end time. */
export function scheduleVoices(ctx, dest, voices, t0, { pan = 0, gain = 1 } = {}) {
  let end = t0; const out = ctx.createGain(); out.gain.value = gain; let tail = out;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); tail = p; }
  tail.connect(dest);
  let nb = null;
  for (const o of voices) {
    const t = t0 + o.t, e = t + o.dur + 0.01, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain, t + Math.min(o.att, o.dur / 2));
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur); g.gain.linearRampToValueAtTime(0, e);
    let src;
    if (o.src === 'noise') {
      if (!nb) { nb = ctx.createBuffer(1, ctx.sampleRate | 0, ctx.sampleRate); const d = nb.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } }
      src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    } else {
      src = ctx.createOscillator(); src.type = o.src === 'saw' ? 'sawtooth' : o.src; rampParam(src.frequency, o.f, t, o.dur);
    }
    const nodes = (o.filters || []).map((fs) => { const f = ctx.createBiquadFilter(); f.type = fs.type === 'bp' ? 'bandpass' : fs.type === 'lp' ? 'lowpass' : 'highpass'; f.Q.value = fs.q ?? 0.7; rampParam(f.frequency, fs.f, t, o.dur); return f; });
    let prev = src; for (const f of nodes) { prev.connect(f); prev = f; } prev.connect(g); g.connect(out);
    src.start(t); src.stop(e); end = Math.max(end, e);
  }
  return end;
}
/** Simple live song player: schedules every tone event as an oscillator (drums via short noise bursts are left to renderSong). Returns { stop() }. */
export function scheduleSong(ctx, dest, song, t0 = ctx.currentTime + 0.05) {
  const T = describeSong(song), nodes = [];
  for (const ev of T.events) {
    if (ev.kind !== 'tone') continue;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + ev.t;
    o.type = ev.wave === 'tri' ? 'triangle' : 'square'; o.frequency.value = ev.hz;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(ev.vel * MASTER, t + ATT);
    g.gain.exponentialRampToValueAtTime(Math.max(ev.vel * ev.sus * MASTER, 0.0005), t + ev.dur); g.gain.linearRampToValueAtTime(0, t + ev.dur + REL);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + ev.dur + REL + 0.01); nodes.push(o);
  }
  return { length: T.length, stop() { for (const o of nodes) { try { o.stop(); } catch { /* already stopped */ } } } };
}
