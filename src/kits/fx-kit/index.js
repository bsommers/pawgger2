// fx-kit: particles, screen shake, flashes, popups, sky/day-night ramp, parallax, foreground silhouettes.
// Everything is deterministic (seeded LCG, no Math.random) and takes dt in seconds. Drawing takes a Canvas2D context,
// but all state/update logic is pure and Node-testable.
import { PixBuf, hex, mix, ink } from '../art-kit/pixbuf.js';

export const lcg = (seed = 1) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const colorOf = (c) => (typeof c === 'string' ? c : hex(c));

// ---- particles -----------------------------------------------------------------------------------------------------
export const PRESETS = {                      // burst presets: [count, speed, lifeSec, gravity, arc0, arc, size]
  splash: { n: 10, v: 70, life: 0.7, g: 220, a0: -Math.PI * 0.9, arc: Math.PI * 0.8, colors: ['#9fe4ff', '#3b9bd8', '#ffffff'] },
  dust: { n: 5, v: 24, life: 0.4, g: -10, a0: -Math.PI, arc: Math.PI, colors: ['#c9b99a', '#a89878'] },
  sparkle: { n: 12, v: 80, life: 0.8, g: 40, a0: 0, arc: Math.PI * 2, colors: ['#ffd23f', '#ffb347', '#ffffff'] },
  confetti: { n: 28, v: 60, life: 2, g: 70, a0: -Math.PI, arc: Math.PI, colors: ['#e63946', '#ffd23f', '#3fb950', '#4cc9f0', '#ff8fa3'] },
  poof: { n: 8, v: 30, life: 0.45, g: 0, a0: 0, arc: Math.PI * 2, colors: ['#ffffff', '#dddddd'] },
};
/** createParticles({ seed, max, presets }) -> { burst(type|opts,x,y), update(dt), draw(ctx), count, clear() }. */
export function createParticles({ seed = 12345, max = 400, presets = {} } = {}) {
  const list = [], rnd = lcg(seed), table = { ...PRESETS, ...presets };
  return {
    get count() { return list.length; }, list,
    clear() { list.length = 0; },
    burst(type, x, y, over = {}) {
      const P = { ...(typeof type === 'string' ? table[type] : type), ...over };
      if (!P.n) throw new Error('unknown particle preset ' + type);
      for (let i = 0; i < P.n; i++) {
        const a = (P.a0 ?? 0) + rnd() * (P.arc ?? Math.PI * 2), v = P.v * (0.4 + rnd() * 0.8);
        if (list.length >= max) list.shift();
        list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: P.g ?? 0, age: 0, life: P.life * (0.6 + rnd() * 0.6), sz: P.sz ?? 1, col: P.colors[(rnd() * P.colors.length) | 0] });
      }
    },
    update(dt) {
      dt = Math.max(0, Math.min(0.1, dt));
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.age += dt;
        if (p.age >= p.life) { list.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    },
    draw(ctx) {
      for (const p of list) { ctx.globalAlpha = Math.min(1, (p.life - p.age) / (p.life * 0.4)); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz); }
      ctx.globalAlpha = 1;
    },
  };
}

// ---- screen shake / flash ------------------------------------------------------------------------------------------
/** Trauma-style shake: kick(amount 0..1) then offset() each frame. Integer pixel offsets (keeps pixel art crisp). */
export function createShake({ maxPx = 4, decay = 2.2, seed = 7 } = {}) {
  let trauma = 0, t = 0; const rnd = lcg(seed);
  return {
    get trauma() { return trauma; },
    kick(a = 0.5) { trauma = Math.min(1, trauma + a); },
    update(dt) { trauma = Math.max(0, trauma - decay * dt); t += dt; },
    offset() { if (trauma <= 0) return { x: 0, y: 0 }; const k = trauma * trauma * maxPx; return { x: Math.round((rnd() * 2 - 1) * k), y: Math.round((rnd() * 2 - 1) * k) }; },
  };
}
/** Full-screen flash that decays: trigger('#fff', 0.4s). draw(ctx, w, h). */
export function createFlash() {
  let col = '#fff', life = 0, age = 0, peak = 0.8;
  return {
    get alpha() { return life ? Math.max(0, 1 - age / life) * peak : 0; },
    trigger(color = '#ffffff', dur = 0.25, a = 0.8) { col = colorOf(color); life = dur; age = 0; peak = a; },
    update(dt) { if (life) { age += dt; if (age >= life) { life = 0; age = 0; } } },
    draw(ctx, w, h) { const a = this.alpha; if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; } },
  };
}

// ---- popups --------------------------------------------------------------------------------------------------------
/** Floating text. drawText(ctx, text, x, y, color) is supplied by the game's font (default: ctx.fillText). */
export function createPopups({ life = 1.1, rise = 16, max = 24 } = {}) {
  const list = [];
  return {
    get count() { return list.length; },
    add(text, x, y, color = '#ffffff') { if (list.length >= max) list.shift(); list.push({ text: String(text), x, y, color: colorOf(color), age: 0 }); },
    update(dt) { for (let i = list.length - 1; i >= 0; i--) { list[i].age += dt; if (list[i].age >= life) list.splice(i, 1); } },
    draw(ctx, drawText = (c, t, x, y, col) => { c.fillStyle = col; c.fillText(t, x, y); }) {
      for (const p of list) { ctx.globalAlpha = Math.min(1, (life - p.age) * 3); drawText(ctx, p.text, Math.round(p.x), Math.round(p.y - (p.age / life) * rise), p.color); }
      ctx.globalAlpha = 1;
    },
    list,
  };
}

// ---- sky / day-night -----------------------------------------------------------------------------------------------
/** stops: [[t01, '#top', '#bottom'], ...] sorted by t. -> { top, bottom } hex strings at time t01 (0..1, wraps). */
export function skyRamp(stops, t01) {
  const t = ((t01 % 1) + 1) % 1; let a = stops[stops.length - 1], b = stops[0], ta = a[0] - 1, tb = b[0];
  for (let i = 0; i < stops.length; i++) if (stops[i][0] <= t) { a = stops[i]; ta = a[0]; b = stops[(i + 1) % stops.length]; tb = i + 1 < stops.length ? b[0] : b[0] + 1; }
  const k = tb === ta ? 0 : (t - ta) / (tb - ta);
  return { top: hex(mix(a[1], b[1], k)), bottom: hex(mix(a[2], b[2], k)) };
}
export const DAY_NIGHT_STOPS = [[0, '#1b2a5a', '#3a3f7a'], [0.25, '#4cb5f5', '#bfe9ff'], [0.55, '#4cb5f5', '#ffe6a8'], [0.7, '#e8743b', '#ffb36b'], [0.85, '#2a2352', '#6a3b6a']];
/** 0 = full day, 1 = full night, smooth, for a t01 cycle where 0.85..1.15 is night. */
export function nightAmount(t01) { const t = ((t01 % 1) + 1) % 1, d = Math.min(Math.abs(t - 0), Math.abs(t - 1)); return Math.max(0, Math.min(1, 1 - d / 0.15)); }
/** Draw a vertical sky gradient as horizontal bands (pixel-art friendly). */
export function drawSkyBands(ctx, ramp, w, y0, y1, bands = 12) {
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = hex(mix(ramp.top, ramp.bottom, i / (bands - 1)));
    const ya = y0 + Math.floor(((y1 - y0) * i) / bands), yb = y0 + Math.floor(((y1 - y0) * (i + 1)) / bands);
    ctx.fillRect(0, ya, w, yb - ya);
  }
}

// ---- parallax ------------------------------------------------------------------------------------------------------
/** layers: [{ name, factor }] (factor 0 = fixed sky, 1 = moves with the world). -> offsets[name] = integer scroll x for a camera x. Wraps at `tileW` if given. */
export function parallaxOffsets(layers, camX, tileW) {
  const out = {};
  for (const l of layers) { const o = Math.round(camX * l.factor); out[l.name] = tileW ? ((o % tileW) + tileW) % tileW : o; }
  return out;
}
/** Draw a horizontally tiling image `img` (canvas/PixBuf-canvas) at scroll offset, covering width w at y. */
export function drawTiled(ctx, img, offset, y, w) {
  const iw = img.width; let x = -(((offset % iw) + iw) % iw);
  for (; x < w; x += iw) ctx.drawImage(img, x, y);
}

// ---- foreground silhouettes ----------------------------------------------------------------------------------------
/** Dark tileable strip of jungle foreground (kind 'trees' | 'hills' | 'grass'). Seamless in x. -> PixBuf (w x h). */
export function makeSilhouetteStrip(kind = 'trees', w = 160, h = 40, { seed = 3, color = '#0b1a12' } = {}) {
  const p = new PixBuf(w, h), rnd = lcg(seed);
  if (kind === 'hills') {
    const ph = [rnd() * 6.28, rnd() * 6.28];
    for (let x = 0; x < w; x++) { const y = h * 0.45 + Math.sin((x / w) * 6.2832 * 2 + ph[0]) * h * 0.18 + Math.sin((x / w) * 6.2832 * 5 + ph[1]) * h * 0.07; p.vline(x, Math.round(y), h - Math.round(y), color); }
  } else if (kind === 'grass') {
    for (let x = 0; x < w; x++) { const top = h - 3 - ((rnd() * (h * 0.5)) | 0); p.vline(x, top, h - top, color); if (rnd() < 0.2) p.set(x, top - 1, color); }
  } else {
    const n = 4;                                   // trunks with leaf canopies, evenly spread so the strip wraps
    for (let i = 0; i < n; i++) {
      const cx = Math.round(((i + 0.3 + rnd() * 0.4) * w) / n), tw = 2 + ((rnd() * 2) | 0), top = Math.round(h * (0.15 + rnd() * 0.3));
      p.rect(cx, top, tw, h - top, color); p.ellipse(cx + (tw >> 1), top, 6 + ((rnd() * 4) | 0), 4, color);
      for (let x = cx - 8; x <= cx + 8; x++) if (x < 0 || x >= w) { const xx = ((x % w) + w) % w; p.set(xx, top, color); }
    }
  }
  return p;
}
