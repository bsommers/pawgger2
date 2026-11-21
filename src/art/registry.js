// Art registry (owner: render). Loads every art module with a dynamic import; anything missing or malformed is
// replaced by a magenta placeholder PixBuf of the manifest size so the renderer always has something to draw.
// Node-safe: PixBufs only, no DOM.
import { ART } from '../core/defs.js';
import { PixBuf } from './pixbuf.js';

export const ART_MODULES = Object.freeze([...new Set(ART.map((a) => a.module))]);

/** Magenta/black checker placeholder of the manifest size (kind 'tile' is opaque, sprites too, so it is obvious). */
export function placeholder(w, h) {
  const p = new PixBuf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, ((x >> 1) + (y >> 1)) & 1 ? '#ff00ff' : '#400040');
  p.frame(0, 0, w, h, '#ff00ff');
  return p;
}

const isPix = (p, w, h) => p && p.rgba && p.w === w && p.h === h;

/**
 * Pure assembly (no imports): mods = { moduleName: { build } | { [name]: PixBuf|PixBuf[] } | built object }.
 * Returns the registry plus `missing` (list of names that fell back to a placeholder).
 */
export function assemble(built = {}) {
  const table = new Map();   // name -> PixBuf[]
  const missing = [];
  for (const a of ART) {
    const src = built[a.module]?.[a.name];
    let frames = src ? (Array.isArray(src) ? src : [src]) : null;
    if (!frames || !frames.length || !frames.every((f) => isPix(f, a.w, a.h))) {
      if (frames && frames.length) {   // wrong size: keep a placeholder of the manifest size so layout stays right
        missing.push(a.name + '(size)');
      } else missing.push(a.name);
      frames = Array.from({ length: a.frames }, () => placeholder(a.w, a.h));
    }
    table.set(a.name, frames);
  }
  const sizes = new Map(ART.map((a) => [a.name, { w: a.w, h: a.h }]));
  return {
    /** PixBuf for a name; frame wraps modulo the frame count; unknown names give a 16x16 placeholder. */
    get(name, frame = 0) {
      const f = table.get(name);
      if (!f) { if (!placeholderCache.has(name)) placeholderCache.set(name, placeholder(16, 16)); return placeholderCache.get(name); }
      const n = f.length, i = ((Math.floor(frame) % n) + n) % n;
      return f[i];
    },
    size(name) { const s = sizes.get(name); return s ? { w: s.w, h: s.h } : { w: 16, h: 16 }; },
    frames(name) { return table.get(name)?.length ?? 1; },
    names() { return [...table.keys()]; },
    missing,
  };
}
const placeholderCache = new Map();

/** Dynamic-import each src/art/<module>.js (try/catch per module) and assemble. Async because of import(). */
export async function buildAll({ modules = ART_MODULES, loader } = {}) {
  const built = {};
  const errors = {};
  for (const m of modules) {
    try {
      const mod = loader ? await loader(m) : await import(/* @vite-ignore */ `./${m}.js`);
      const out = typeof mod.build === 'function' ? mod.build() : null;
      if (out && typeof out === 'object') built[m] = out; else errors[m] = 'build() returned nothing';
    } catch (e) { errors[m] = String(e && e.message || e); }
  }
  const reg = assemble(built);
  reg.errors = errors;
  return reg;
}
