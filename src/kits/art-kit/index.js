// art-kit: PixBuf helpers, palette locking, sprite builders, sheet packer + manifest validator, tile/scenery generators.
// Zero deps; runs in Node and the browser.
import { PixBuf, ink, hex, shade, mix, ramp, hash2, pix } from './pixbuf.js';
export { PixBuf, ink, hex, shade, mix, ramp, hash2, pix };

const rgbOf = (c) => { const k = ink(c); return [k.r, k.g, k.b]; };

/** Palette lock: pal = { name: '#rrggbb' }. -> { names, nearest(c), snap(pixbuf), offenders(pixbuf) }. */
export function lockPalette(pal) {
  const names = Object.keys(pal), rgb = names.map((n) => rgbOf(pal[n]));
  const nearest = (c) => {
    const [r, g, b] = rgbOf(c); let best = 0, bd = Infinity;
    rgb.forEach((q, i) => { const d = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2; if (d < bd) { bd = d; best = i; } });
    return names[best];
  };
  const key = (r, g, b) => (r << 16) | (g << 8) | b;
  const allowed = new Set(rgb.map((q) => key(...q)));
  return {
    names, nearest,
    /** Snap every opaque pixel to the nearest palette colour (in place). */
    snap(p) { return p.map((x, y, k) => (k.a ? ink(pal[nearest([k.r, k.g, k.b])], { emit: k.emit, gloss: k.gloss, spark: k.spark, a: k.a }) : undefined)); },
    /** List of {x,y,color} for opaque pixels whose colour is not in the palette. */
    offenders(p) {
      const out = [];
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const k = p.get(x, y);
        if (k.a && !allowed.has(key(k.r, k.g, k.b))) out.push({ x, y, color: hex(k) });
      }
      return out;
    },
  };
}

/** Sprite from ASCII rows. legend: { char: colour|ink }. '.' and ' ' are transparent; unknown chars throw. */
export function spriteFromAscii(rows, legend) {
  const w = Math.max(...rows.map((r) => r.length)), p = new PixBuf(w, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    if (!Object.hasOwn(legend, ch)) throw new Error(`spriteFromAscii: no legend entry for "${ch}" at ${x},${y}`);
    p.set(x, y, legend[ch]);
  }));
  return p;
}
/** Sprite from a draw function: fn(p) draws on a fresh w*h PixBuf. Optional outline colour. */
export function spriteFromFn(w, h, fn, { outline } = {}) {
  const p = new PixBuf(w, h); fn(p);
  return outline ? p.outline(outline) : p;
}

/** Pack sprites into one sheet. sprites: { name: PixBuf | PixBuf[] } (arrays = animation frames, laid out in row order).
 *  -> { sheet: PixBuf, manifest: { name: { x, y, w, h, frames, fw, fh } } } (x,y,w,h cover all frames of the entry). */
export function packSheet(sprites, { width = 256, pad = 1 } = {}) {
  const items = [];
  for (const [name, v] of Object.entries(sprites)) items.push({ name, frames: Array.isArray(v) ? v : [v] });
  let x = pad, y = pad, rowH = 0, maxW = 0; const placed = [];
  for (const it of items) {
    const fw = Math.max(...it.frames.map((f) => f.w)), fh = Math.max(...it.frames.map((f) => f.h)), tw = fw * it.frames.length;
    if (x + tw + pad > width && x > pad) { x = pad; y += rowH + pad; rowH = 0; }
    placed.push({ ...it, x, y, fw, fh, tw }); x += tw + pad; rowH = Math.max(rowH, fh); maxW = Math.max(maxW, x);
  }
  const sheet = new PixBuf(Math.max(width, maxW), y + rowH + pad), manifest = {};
  for (const it of placed) {
    it.frames.forEach((f, i) => sheet.blit(f, it.x + i * it.fw, it.y));
    manifest[it.name] = { x: it.x, y: it.y, w: it.tw, h: it.fh, frames: it.frames.length, fw: it.fw, fh: it.fh };
  }
  return { sheet, manifest };
}
/** Validate a manifest against a sheet and (optionally) the names the game expects. -> string[] of problems (empty = ok). */
export function validateManifest(manifest, sheet, expected = []) {
  const errs = [], rects = [];
  for (const name of expected) if (!Object.hasOwn(manifest, name)) errs.push(`missing sprite: ${name}`);
  for (const [name, m] of Object.entries(manifest)) {
    for (const k of ['x', 'y', 'w', 'h', 'frames']) if (!Number.isInteger(m[k])) errs.push(`${name}: ${k} not an integer`);
    if (m.x < 0 || m.y < 0 || m.x + m.w > sheet.w || m.y + m.h > sheet.h) { errs.push(`${name}: outside sheet`); continue; }
    if (m.frames < 1 || m.w !== m.fw * m.frames) errs.push(`${name}: frame geometry inconsistent`);
    let opaque = 0;
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (sheet.has(m.x + i, m.y + j)) opaque++;
    if (!opaque) errs.push(`${name}: empty (fully transparent)`);
    for (const [n2, r] of rects) if (m.x < r.x + r.w && r.x < m.x + m.w && m.y < r.y + r.h && r.y < m.y + m.h) errs.push(`${name}: overlaps ${n2}`);
    rects.push([name, m]);
  }
  return errs;
}

// ---- tiles & scenery -----------------------------------------------------------------------------------------------
// All tiles tile seamlessly in x and y (hash lookups wrap on tile size). pal: { base, light, dark, accent? } colours.
const wrapN = (v, n) => ((v % n) + n) % n;
/** kind: 'dirt' | 'stone' | 'brick' | 'grass' | 'water' | 'planks'. */
export function makeTile(kind, size = 16, pal = {}, seed = 1) {
  const P = { base: '#8a5a32', light: '#a9784a', dark: '#5e3b20', accent: '#3f8a3a', ...pal }, p = new PixBuf(size, size);
  const h = (x, y, s = 0) => hash2(wrapN(x, size), wrapN(y, size), seed + s);
  p.fill(P.base);
  if (kind === 'dirt' || kind === 'stone') {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = h(x, y); if (r < 0.12) p.set(x, y, P.dark); else if (r > 0.9) p.set(x, y, P.light);
    }
    if (kind === 'stone') { p.hline(0, size - 1, size, P.dark); p.vline(size - 1, 0, size, P.dark); }
  } else if (kind === 'brick') {
    const bh = size >> 2;
    for (let r = 0; r < 4; r++) {
      const y = r * bh, off = r & 1 ? size >> 2 : 0; p.hline(0, y + bh - 1, size, P.dark);
      for (let x = off; x < size + size; x += size >> 1) { if (x < size) p.vline(x, y, bh, P.dark); else p.vline(x - size, y, bh, P.dark); }
      p.hline(0, y, size, P.light);
    }
  } else if (kind === 'grass') {
    p.fill(P.accent);
    for (let x = 0; x < size; x++) { const top = 2 + ((h(x, 0) * 3) | 0); p.vline(x, 0, top, P.light); p.set(x, top, P.dark); }
    for (let i = 0; i < size; i++) p.set((h(i, 1, 5) * size) | 0, 4 + ((h(i, 2, 5) * (size - 5)) | 0), P.dark);
  } else if (kind === 'water') {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (Math.sin((x / size) * Math.PI * 2 * 2 + y * 0.9) > 0.8) p.set(x, y, P.light);
  } else if (kind === 'planks') {
    const ph = size >> 2;
    for (let r = 0; r < 4; r++) { p.hline(0, r * ph + ph - 1, size, P.dark); p.set(wrapN(r * 5 + 3, size), r * ph + 1, P.dark); p.hline(0, r * ph, size, P.light); }
  } else throw new Error('makeTile: unknown kind ' + kind);
  return p;
}
/** Scenery: kind 'tree' | 'bush' | 'cloud' | 'rock'. -> transparent-background PixBuf. */
export function makeScenery(kind, pal = {}, seed = 1, scale = 1) {
  const P = { trunk: '#6b4423', leaf: '#2f8f3f', leafL: '#4fb85a', rock: '#8c8c96', cloud: '#ffffff', outline: '#1a1420', ...pal }, s = scale;
  if (kind === 'tree') {
    const p = new PixBuf(24 * s, 32 * s);
    p.rect(10 * s, 14 * s, 4 * s, 18 * s, P.trunk);
    for (const [cx, cy, r] of [[12, 9, 8], [7, 12, 5], [17, 12, 5]]) p.circle(cx * s, cy * s, r * s, P.leaf);
    p.circle(10 * s, 6 * s, 3 * s, P.leafL);
    return p.outline(P.outline);
  }
  if (kind === 'bush') {
    const p = new PixBuf(16 * s, 10 * s);
    p.ellipse(8 * s, 6 * s, 7 * s, 4 * s, P.leaf); p.ellipse(6 * s, 4 * s, 3 * s, 2 * s, P.leafL);
    return p.outline(P.outline);
  }
  if (kind === 'cloud') {
    const p = new PixBuf(28 * s, 12 * s);
    for (const [cx, cy, r] of [[8, 7, 5], [14, 5, 5], [20, 7, 4]]) p.circle(cx * s, cy * s, r * s, P.cloud);
    return p.rect(4 * s, 8 * s, 20 * s, 3 * s, P.cloud);
  }
  if (kind === 'rock') {
    const p = new PixBuf(14 * s, 10 * s);
    p.poly([[1, 9], [3, 3], [8, 1], [12, 4], [13, 9]].map(([x, y]) => [x * s, y * s]), P.rock);
    return p.outline(P.outline);
  }
  throw new Error('makeScenery: unknown kind ' + kind);
}

// ---- PNG (dependency free; zlib comes from Node) ------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** Encode a PixBuf as PNG bytes (Node only: needs zlib, taken from process.getBuiltinModule). scale = integer upscale. */
export function encodePng(p, scale = 1, zlib = globalThis.process?.getBuiltinModule?.('node:zlib')) {
  if (!zlib) throw new Error('encodePng needs node:zlib');
  const w = p.w * scale, h = p.h * scale, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) { const o = y * (w * 4 + 1) + 1 + x * 4, i = (((y / scale) | 0) * p.w + ((x / scale) | 0)) * 4; raw[o] = p.rgba[i]; raw[o + 1] = p.rgba[i + 1]; raw[o + 2] = p.rgba[i + 2]; raw[o + 3] = p.rgba[i + 3]; }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
