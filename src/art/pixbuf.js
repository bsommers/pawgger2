// PixBuf — tiny dependency-free pixel-art canvas with a material plane. Runs in Node and the browser.
// FROZEN: owned by the orchestrator.
//
//   rgba : Uint8ClampedArray(w*h*4)  albedo + alpha
//   mat  : Uint8ClampedArray(w*h*4)  R = emissive, G = gloss/reflectivity, B = sparkle, A = 255
//
// Everything that takes an `ink` accepts: an ink() object, '#rgb' / '#rrggbb' / '#rrggbbaa', or [r,g,b(,a)] (0-255).
// Coordinates are integers (floats are floored); drawing outside the buffer is silently clipped.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function parseColor(c) {
  if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0, c.length > 3 ? c[3] | 0 : 255];
  if (typeof c !== 'string' || c[0] !== '#') throw new Error('bad colour: ' + JSON.stringify(c));
  let h = c.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  if (h.length === 6) return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  if (h.length === 8) return [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  throw new Error('bad colour: ' + c);
}

/** Make an ink: colour + material. mat = { emit, gloss, spark } each 0..1, optional alpha `a` 0..255. */
export function ink(color, mat = {}) {
  if (color && color.__ink) return mat && Object.keys(mat).length ? { ...color, ...matOf(mat, color) } : color;
  const [r, g, b, a] = parseColor(color);
  return { __ink: true, r, g, b, a: mat.a ?? a, ...matOf(mat) };
}
function matOf(m, base = { emit: 0, gloss: 0, spark: 0 }) {
  return { emit: clamp01(m.emit ?? base.emit), gloss: clamp01(m.gloss ?? base.gloss), spark: clamp01(m.spark ?? base.spark) };
}
const toInk = (c) => (c && c.__ink ? c : ink(c));

/** '#rrggbb' of an ink or colour. */
export function hex(c) {
  const k = toInk(c);
  return '#' + [k.r, k.g, k.b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Multiply brightness: f<1 darkens, f>1 lightens toward white. Keeps the material of an ink. */
export function shade(c, f) {
  const k = toInk(c);
  const ch = (v) => Math.round(f <= 1 ? v * f : v + (255 - v) * Math.min(1, f - 1));
  return { ...k, r: ch(k.r), g: ch(k.g), b: ch(k.b) };
}
/** Linear blend of two inks/colours (colour and material), t in 0..1. */
export function mix(c1, c2, t) {
  const a = toInk(c1), b = toInk(c2), l = (x, y) => x + (y - x) * t;
  return { __ink: true, r: Math.round(l(a.r, b.r)), g: Math.round(l(a.g, b.g)), b: Math.round(l(a.b, b.b)), a: Math.round(l(a.a, b.a)),
    emit: l(a.emit, b.emit), gloss: l(a.gloss, b.gloss), spark: l(a.spark, b.spark) };
}
/** n-step shade ramp around a base colour, dark → light, with hue shift (cool shadows, warm highlights). */
export function ramp(base, n = 4, spread = 0.45) {
  const k = toInk(base), out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;        // -1 .. 1
    let c = shade(k, 1 + t * spread);
    c = t < 0 ? mix(c, { ...c, r: c.r * 0.85, b: Math.min(255, c.b * 1.12 + 6) }, -t * 0.6)
              : mix(c, { ...c, r: Math.min(255, c.r * 1.05 + 6), b: c.b * 0.9 }, t * 0.6);
    out.push({ ...c, r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
  }
  return out;
}
/** Deterministic hash → [0,1). Use for all "randomness" in art. */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class PixBuf {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.rgba = new Uint8ClampedArray(w * h * 4);
    this.mat = new Uint8ClampedArray(w * h * 4);
  }
  clone() { const p = new PixBuf(this.w, this.h); p.rgba.set(this.rgba); p.mat.set(this.mat); return p; }
  clear() { this.rgba.fill(0); this.mat.fill(0); return this; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** true if the pixel is opaque (alpha >= 128). */
  has(x, y) { x |= 0; y |= 0; return this.inside(x, y) && this.rgba[(y * this.w + x) * 4 + 3] >= 128; }
  /** Read a pixel as an ink, or null if outside. */
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return null;
    const i = (y * this.w + x) * 4, d = this.rgba, m = this.mat;
    return { __ink: true, r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3], emit: m[i] / 255, gloss: m[i + 1] / 255, spark: m[i + 2] / 255 };
  }
  /** Write a pixel. Inks with alpha < 255 blend over what is there; alpha 0 erases. */
  set(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return this;
    const k = toInk(c), i = (y * this.w + x) * 4, d = this.rgba, m = this.mat;
    if (k.a >= 255 || k.a === 0 || d[i + 3] === 0) {
      d[i] = k.r; d[i + 1] = k.g; d[i + 2] = k.b; d[i + 3] = k.a;
      m[i] = k.emit * 255; m[i + 1] = k.gloss * 255; m[i + 2] = k.spark * 255; m[i + 3] = 255;
      if (k.a === 0) { d[i] = d[i + 1] = d[i + 2] = 0; m[i] = m[i + 1] = m[i + 2] = 0; }
    } else {
      const t = k.a / 255, l = (o, n) => o + (n - o) * t;
      d[i] = l(d[i], k.r); d[i + 1] = l(d[i + 1], k.g); d[i + 2] = l(d[i + 2], k.b); d[i + 3] = Math.max(d[i + 3], k.a);
      m[i] = l(m[i], k.emit * 255); m[i + 1] = l(m[i + 1], k.gloss * 255); m[i + 2] = l(m[i + 2], k.spark * 255); m[i + 3] = 255;
    }
    return this;
  }
  erase(x, y) { return this.set(x, y, [0, 0, 0, 0]); }
  fill(c) { return this.rect(0, 0, this.w, this.h, c); }
  hline(x, y, len, c) { for (let i = 0; i < len; i++) this.set(x + i, y, c); return this; }
  vline(x, y, len, c) { for (let i = 0; i < len; i++) this.set(x, y + i, c); return this; }
  /** Filled rectangle. */
  rect(x, y, w, h, c) { const k = toInk(c); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, k); return this; }
  /** 1px rectangle outline. */
  frame(x, y, w, h, c) { const k = toInk(c); this.hline(x, y, w, k); this.hline(x, y + h - 1, w, k); this.vline(x, y, h, k); this.vline(x + w - 1, y, h, k); return this; }
  line(x0, y0, x1, y1, c) {
    const k = toInk(c);
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, k);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  /** Filled ellipse centred on (cx,cy) with radii rx, ry (floats fine; use x.5 centres for even sizes). */
  ellipse(cx, cy, rx, ry, c) {
    const k = toInk(c);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / (rx || 0.5), v = (y + 0.5 - cy) / (ry || 0.5);
        if (u * u + v * v <= 1) this.set(x, y, k);
      }
    return this;
  }
  circle(cx, cy, r, c) { return this.ellipse(cx, cy, r, r, c); }
  /** Ellipse outline of the given thickness (default 1px). */
  ring(cx, cy, rx, ry, c, thick = 1) {
    const k = toInk(c);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy;
        const o = (px / (rx || 0.5)) ** 2 + (py / (ry || 0.5)) ** 2;
        const irx = Math.max(0.01, rx - thick), iry = Math.max(0.01, ry - thick);
        const inn = (px / irx) ** 2 + (py / iry) ** 2;
        if (o <= 1 && inn > 1) this.set(x, y, k);
      }
    return this;
  }
  /** Filled polygon, points = [[x,y], ...] (even-odd scanline). */
  poly(points, c) {
    const k = toInk(c);
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, k);
    }
    return this;
  }
  /** Copy another PixBuf onto this one at (dx,dy); transparent source pixels are skipped. opts: { flipX, flipY, sx, sy, sw, sh }. */
  blit(src, dx = 0, dy = 0, opts = {}) {
    const { flipX = false, flipY = false, sx = 0, sy = 0, sw = src.w - sx, sh = src.h - sy } = opts;
    for (let j = 0; j < sh; j++)
      for (let i = 0; i < sw; i++) {
        const p = src.get(sx + (flipX ? sw - 1 - i : i), sy + (flipY ? sh - 1 - j : j));
        if (p && p.a > 0) this.set(dx + i, dy + j, p);
      }
    return this;
  }
  /** New PixBuf mirrored left↔right. */
  flipX() { return new PixBuf(this.w, this.h).blit(this, 0, 0, { flipX: true }); }
  /** New PixBuf scaled by an integer factor (nearest neighbour). */
  scaled(f) {
    const p = new PixBuf(this.w * f, this.h * f);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const s = this.get((x / f) | 0, (y / f) | 0); if (s.a > 0) p.set(x, y, s); }
    return p;
  }
  /** Add a 1px outline in `c` on transparent pixels that touch an opaque pixel (4-neighbour; diagonal: true for 8). */
  outline(c = '#1a1420', { diagonal = false } = {}) {
    const k = toInk(c), hits = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.has(x, y)) continue;
        const n = this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || this.has(x, y + 1) ||
          (diagonal && (this.has(x - 1, y - 1) || this.has(x + 1, y - 1) || this.has(x - 1, y + 1) || this.has(x + 1, y + 1)));
        if (n) hits.push(x, y);
      }
    for (let i = 0; i < hits.length; i += 2) this.set(hits[i], hits[i + 1], k);
    return this;
  }
  /** Per-pixel transform over every pixel: fn(x, y, ink) → ink | colour | undefined (unchanged). */
  map(fn) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const cur = this.get(x, y), r = fn(x, y, cur);
        if (r !== undefined && r !== null) { const i = (y * this.w + x) * 4; this.rgba[i + 3] = 0; this.set(x, y, r); }
      }
    return this;
  }
  /** Brightness jitter of ±amount (0..1) on opaque pixels, deterministic per seed. Optional cell size for chunkier grain. */
  noise(amount = 0.08, seed = 1, cell = 1) {
    return this.map((x, y, p) => (p.a < 128 ? undefined : shade(p, 1 + (hash2((x / cell) | 0, (y / cell) | 0, seed) * 2 - 1) * amount)));
  }
  /** Overwrite material on opaque pixels inside a rectangle (default: whole buffer). m = { emit, gloss, spark } (omitted keys unchanged). */
  setMat(m, x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (!this.has(i, j)) continue;
        const o = (j * this.w + i) * 4;
        if (m.emit !== undefined) this.mat[o] = clamp01(m.emit) * 255;
        if (m.gloss !== undefined) this.mat[o + 1] = clamp01(m.gloss) * 255;
        if (m.spark !== undefined) this.mat[o + 2] = clamp01(m.spark) * 255;
      }
    return this;
  }
}

/** Convenience: new PixBuf. */
export const pix = (w = 64, h = 64) => new PixBuf(w, h);
