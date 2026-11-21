// Settings + hi-score persistence. Node-safe: every storage access is guarded; pass `storage` to inject a fake.
export const SETTINGS_KEY = 'pawfall.settings';
export const HI_KEY = 'pawfall.hi';
export const HI_MAX = 8;
export const DEFAULTS = Object.freeze({ master: 0.8, sfx: 1, music: 0.7, crt: true, invert: false, autofire: false, mute: false });
export const DEFAULT_HI = Object.freeze([
  { name: 'COL', score: 20000 }, { name: 'PET', score: 12000 }, { name: 'CAT', score: 8000 }, { name: 'RAT', score: 6000 },
  { name: 'NIP', score: 4000 }, { name: 'TUN', score: 3000 }, { name: 'PAW', score: 2000 }, { name: 'ZZZ', score: 1000 },
]);

function store(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
const clamp01 = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Validate arbitrary parsed data into a full settings object (unknown keys dropped, bad values defaulted). */
export function sanitizeSettings(o) {
  o = o && typeof o === 'object' ? o : {};
  const b = (k) => (typeof o[k] === 'boolean' ? o[k] : DEFAULTS[k]);
  return { master: clamp01(o.master, DEFAULTS.master), sfx: clamp01(o.sfx, DEFAULTS.sfx), music: clamp01(o.music, DEFAULTS.music),
    crt: b('crt'), invert: b('invert'), autofire: b('autofire'), mute: b('mute') };
}
export function loadSettings(storage) {
  try { const s = store(storage); return sanitizeSettings(s ? JSON.parse(s.getItem(SETTINGS_KEY)) : null); } catch { return sanitizeSettings(null); }
}
export function saveSettings(settings, storage) {
  try { const s = store(storage); if (s) { s.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings))); return true; } } catch { /* ignore */ }
  return false;
}

/** Clean a hi-score list: valid entries only, sorted descending, 3-letter A-Z names, capped. */
export function sanitizeHi(list) {
  if (!Array.isArray(list)) return DEFAULT_HI.map((e) => ({ ...e }));
  const out = list.filter((e) => e && typeof e.score === 'number' && isFinite(e.score) && e.score >= 0)
    .map((e) => ({ name: String(e.name ?? '???').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, '-'), score: Math.floor(e.score) }))
    .sort((a, b) => b.score - a.score).slice(0, HI_MAX);
  return out.length ? out : DEFAULT_HI.map((e) => ({ ...e }));
}
export function loadHi(storage) {
  try { const s = store(storage); return sanitizeHi(s ? JSON.parse(s.getItem(HI_KEY)) : null); } catch { return sanitizeHi(null); }
}
export function saveHi(list, storage) {
  try { const s = store(storage); if (s) { s.setItem(HI_KEY, JSON.stringify(sanitizeHi(list))); return true; } } catch { /* ignore */ }
  return false;
}
/** Rank (0-based) the score would take in the table, or -1 if it does not qualify. */
export function hiRank(list, score) {
  if (!(score > 0)) return -1;
  const i = list.findIndex((e) => score > e.score);
  if (i >= 0) return i;
  return list.length < HI_MAX ? list.length : -1;
}
/** Returns a NEW list with the entry inserted (capped at HI_MAX). */
export function insertHi(list, name, score) {
  const r = hiRank(list, score);
  if (r < 0) return list.slice();
  const out = list.slice(); out.splice(r, 0, { name, score: Math.floor(score) });
  return sanitizeHi(out.slice(0, HI_MAX));
}
/** Best score in the table (used as game.hiscore). */
export const topScore = (list) => (list.length ? list[0].score : 0);
