// world-gen: seeded, deterministic, CIRCULAR screen generator driven by a declarative rule table,
// plus a reusable fairness validator. Zero deps, Node-safe. Generalised from PawFall src/levels/gen.js.
//
// Rule table (all optional except count/slots):
// {
//   seed: 1234, count: 120, start: 0,
//   blocks: { size: 12, deck: ['hole','hole','pit','plain','rest'], fixed: { 6: 'boss' }, firstSlot: 'rest' },
//     // each block of `size` screens gets the deck shuffled over the non-fixed positions (deck may be shorter: wraps)
//   spacing: { edgeClear: 36, gap: 48, step: 4 },       // px; used by ctx.freeXs
//   slots: {
//     plain: { place: [ { kinds: [{kind:'log', weight:4}, {kind:'cheese', weight:1.5, minT:0.35, perT:1.5}],
//                         chance: {base:0.5, perT:0}, count: 1, maxT: 1, mode: 'rolling'|'static' } ],
//              pit: null, set: {} },
//     boss:  { set: { boss: true }, place: [ { kinds: [{kind:'cheese'}], chance: 1, fixedX: null } ] },
//     rest:  {},
//     custom:{ build(def, ctx) { ... } }                       // escape hatch, runs after `place`
//   },
//   pits: ... NOT built in: set def.pit/zones from a slot's build() so games keep their own pit kinds.
//   collectibles: { count: 30, tiers: [{type:'tuna', upTo:12}, {type:'gold', upTo:30}],
//                   exclude: (def)=>def.boss, prefer: (def, k)=>k%3===0 && def.pit?.kind==='hole',
//                   offsets: [0,1,-1,2,-2], xRange:[30,290], xStep:10, clear: 44, zoneClear: 28 }
// }
// A generated screen: { idx, tag, t, items:[{kind,x,...}], zones:[{x0,x1}], pit?, collectible:null, ...set }
// items with an x are *static* (spacing-checked); rolling items (mode 'rolling') have no x and are excluded.

export function createRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p,
  };
}

export const wrap = (i, n) => ((i % n) + n) % n;
/** Circular distance between screens a and b in a world of n. */
export const circDist = (a, b, n) => { const d = wrap(a - b, n); return Math.min(d, n - d); };
/** Difficulty 0 at `start` .. 1 at the opposite side of the circle. */
export const rampOf = (i, start, n) => circDist(i, start, n) / (n / 2);
/** Linear interpolation helper for {from,to} / number values driven by t. */
export const lerpVal = (v, t) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const a = v.from ?? v.base ?? 0;
  return a + ((v.to ?? a) - a) * t + (v.perT ?? 0) * t;
};

export function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = rng.int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
export function pickWeighted(rng, items) {
  const tot = items.reduce((a, [, w]) => a + w, 0);
  let r = rng.next() * tot;
  for (const [v, w] of items) { if ((r -= w) < 0) return v; }
  return items[items.length - 1][0];
}

function blockSlots(rules, b) {
  const bl = rules.blocks ?? {}, size = bl.size ?? 12, fixed = bl.fixed ?? {};
  const deck = bl.deck ?? ['plain'];
  const rng = createRng((rules.seed ?? 1) * 7 + 7001 + b * 31);
  const free = []; for (let p = 0; p < size; p++) if (!(p in fixed)) free.push(p);
  const cards = shuffle(Array.from({ length: free.length }, (_, k) => deck[k % deck.length]), rng);
  const m = { ...fixed };
  free.forEach((p, k) => { m[p] = cards[k]; });
  if (b === 0 && bl.firstSlot && m[0] !== bl.firstSlot) {   // gentle start: swap the first matching slot into position 0
    const k = free.find((p) => m[p] === bl.firstSlot);
    if (k != null) [m[0], m[k]] = [m[k], m[0]];
  }
  return m;
}

/** Free x positions on a screen honouring zones (padded), existing static items (gap) and edges. */
export function freeXs(def, rules, { edgeClear, gap, extra = [], lo = 0, hi = 320 } = {}) {
  const sp = rules.spacing ?? {}, ec = edgeClear ?? sp.edgeClear ?? 36, g = gap ?? sp.gap ?? 48, step = sp.step ?? 4;
  const out = [];
  for (let x = lo + ec; x <= hi - ec; x += step) {
    if (def.zones.some((z) => x > z.x0 - ec && x < z.x1 + ec)) continue;
    if (def.items.some((h) => h.x != null && Math.abs(h.x - x) < g)) continue;
    if (extra.some((e) => Math.abs(e - x) < g)) continue;
    out.push(x);
  }
  return out;
}

function applyPlace(def, rule, ctx) {
  const { rng, t, rules } = ctx;
  const ch = lerpVal(rule.chance ?? 1, t);
  if (rule.minT != null && t < rule.minT) return;
  if (rule.maxT != null && t > rule.maxT) return;
  if (!rng.chance(ch)) return;
  const tt = rule.clampT != null ? Math.min(t, rule.clampT) : t;
  const kinds = rule.kinds
    .filter((k) => (k.minT == null || tt > k.minT) && (k.maxT == null || tt <= k.maxT))
    .map((k) => [k, (k.weight ?? 1) + (k.perT ?? 0) * tt]);
  if (!kinds.length) return;
  const n = rule.count ?? 1;
  for (let i = 0; i < n; i++) {
    const k = pickWeighted(rng, kinds);
    if (rule.mode === 'rolling') { def.items.push({ kind: k.kind, ...(k.props ?? {}) }); continue; }
    const xs = freeXs(def, rules, { lo: rule.lo ?? 0, hi: rule.hi ?? 320 });
    if (!xs.length) return;
    def.items.push({ kind: k.kind, x: rule.fixedX ?? rng.pick(xs), ...(k.props ?? {}) });
  }
}

/**
 * Generate the world. Returns { screens, collectibles } (plain JSON-able data).
 * Each screen: {idx, tag, t, items, zones, collectible, ...slot.set}; slot.build(def, ctx) may add def.pit, def.zones, etc.
 * Pure function of the rule table: same seed => same world, independent of call order.
 */
export function generateWorld(rules) {
  const n = rules.count, start = rules.start ?? 0, size = rules.blocks?.size ?? 12;
  const maps = []; for (let b = 0; b < Math.ceil(n / size); b++) maps.push(blockSlots(rules, b));
  const screens = [];
  for (let i = 0; i < n; i++) {
    const rng = createRng((rules.seed ?? 1) * 101 + 90001 + i * 7919);
    const t = rampOf(i, start, n);
    const tag = maps[Math.floor(i / size)][i % size] ?? 'plain';
    const slot = rules.slots[tag] ?? {};
    const def = { idx: i, tag, t, items: [], zones: [], collectible: null, ...structuredClone(slot.set ?? {}) };
    const ctx = { rng, t, rules, idx: i, n, freeXs: (o) => freeXs(def, rules, o) };
    for (const rule of slot.place ?? []) applyPlace(def, rule, ctx);
    slot.build?.(def, ctx);
    if (def.pit && def.pit.x0 != null && !def.zones.some((z) => z.pit)) def.zones.push({ x0: def.pit.x0, x1: def.pit.x0 + (def.pit.w ?? 0), pit: true });
    screens.push(def);
  }
  const collectibles = rules.collectibles ? placeCollectibles(screens, rules) : [];
  rules.finish?.(screens, collectibles);
  return { screens, collectibles };
}

/** Spread `count` collectibles round the circle, nudged to valid screens; tier by distance rank from start. */
export function placeCollectibles(screens, rules) {
  const c = rules.collectibles, n = screens.length, start = rules.start ?? 0;
  const used = new Set([start]), picks = [], rng = createRng((rules.seed ?? 1) * 13 + 555);
  const [xlo, xhi] = c.xRange ?? [30, 290], step = c.xStep ?? 10, clear = c.clear ?? 44, zc = c.zoneClear ?? 28;
  for (let k = 0; k < c.count; k++) {
    const target = Math.round(((k + 0.5) * n) / c.count);
    let cands = (c.offsets ?? [0, 1, -1, 2, -2]).map((o) => wrap(target + o, n)).filter((i) => !used.has(i) && !(c.exclude?.(screens[i])));
    if (c.prefer) { const pr = cands.filter((i) => c.prefer(screens[i], k)); if (pr.length) cands = pr; }
    const si = cands[0];
    if (si == null) throw new Error('world-gen: collectible placement failed for ' + k);
    used.add(si);
    const s = screens[si];
    s.items = s.items.filter((h) => h.x != null);           // rolling hazards would sweep the collectible
    const okX = (x, items) => !s.zones.some((z) => x > z.x0 - zc && x < z.x1 + zc) && !items.some((h) => Math.abs(h.x - x) < clear);
    let xs = []; for (let x = xlo; x <= xhi; x += step) if (okX(x, s.items)) xs.push(x);
    if (!xs.length) { s.items = []; for (let x = xlo; x <= xhi; x += step) if (okX(x, [])) xs.push(x); }
    if (!xs.length) throw new Error('world-gen: no free x for collectible on screen ' + si);
    picks.push({ screen: si, x: rng.pick(xs) });
  }
  picks.sort((a, b) => a.screen - b.screen);
  const order = picks.map((p, id) => ({ id, ...p, d: circDist(p.screen, start, n) })).sort((a, b) => a.d - b.d || a.screen - b.screen);
  const tierOf = (rank) => (c.tiers.find((t) => rank < t.upTo) ?? c.tiers[c.tiers.length - 1]).type;
  const out = order.map((o, rank) => ({ id: o.id, type: tierOf(rank), screen: o.screen, x: o.x }));
  out.sort((a, b) => a.id - b.id);
  for (const tr of out) screens[tr.screen].collectible = { id: tr.id, type: tr.type, x: tr.x };
  return out;
}

// ---- fairness validator -----------------------------------------------------------------------
/**
 * validateWorld(world, opts) -> { ok, failures:[{screen, rule, msg}], stats }
 * opts:
 *   crossable(def, ctx) -> true | false | string   REQUIRED reachability predicate: can a player get from the
 *       left edge to the right edge of this screen? (string = failure reason). Wire it to your physics numbers,
 *       e.g. pit width <= jumpRange(cfg) - hitW - margin.
 *   collectibleReachable(def, tr, ctx) -> true | false | string   optional: can the collectible be picked up?
 *   edgeClear (36), gap (48), collectClear (44): spacing minimums for static items.
 *   checks: [(def, ctx) => string|null]            extra game-specific rules
 *   maxHardRun, isHard(def): at most `maxHardRun` consecutive hard screens (circular)
 */
export function validateWorld(world, opts = {}) {
  const { screens, collectibles } = world, n = screens.length, failures = [];
  const ec = opts.edgeClear ?? 36, gap = opts.gap ?? 48, cc = opts.collectClear ?? 44;
  const fail = (def, rule, msg) => failures.push({ screen: def.idx, rule, msg });
  const ctx = { n, screens };
  for (const def of screens) {
    if (opts.crossable) { const r = opts.crossable(def, ctx); if (r !== true) fail(def, 'crossable', typeof r === 'string' ? r : 'not crossable'); }
    const st = def.items.filter((h) => h.x != null).sort((a, b) => a.x - b.x);
    for (let k = 0; k < st.length; k++) {
      if (st[k].x < ec || st[k].x > 320 - ec) { if (!opts.allowEdgeItems) fail(def, 'edgeClear', `${st[k].kind}@${st[k].x} within ${ec} of edge`); }
      if (k && st[k].x - st[k - 1].x < gap) fail(def, 'gap', `${st[k - 1].kind}/${st[k].kind} only ${st[k].x - st[k - 1].x}px apart`);
      for (const z of def.zones) if (st[k].x > z.x0 - ec && st[k].x < z.x1 + ec && !opts.allowItemsNearZones) fail(def, 'zoneClear', `${st[k].kind}@${st[k].x} too near a zone`);
    }
    const col = def.collectible;
    if (col) {
      for (const h of st) if (Math.abs(h.x - col.x) < cc) fail(def, 'collectClear', `${h.kind} ${Math.abs(h.x - col.x)}px from collectible`);
      if (def.items.some((h) => h.x == null) && opts.rollingSweepsCollectible) fail(def, 'rolling', 'rolling hazard on collectible screen');
      if (opts.collectibleReachable) { const r = opts.collectibleReachable(def, col, ctx); if (r !== true) fail(def, 'collectibleReachable', typeof r === 'string' ? r : 'unreachable'); }
    }
    for (const chk of opts.checks ?? []) { const msg = chk(def, ctx); if (msg) fail(def, 'custom', msg); }
  }
  if (opts.maxHardRun && opts.isHard) {
    let run = 0, worst = 0;
    for (let i = 0; i < 2 * n; i++) { run = opts.isHard(screens[i % n]) ? run + 1 : 0; worst = Math.max(worst, run); }
    if (worst > opts.maxHardRun && worst < 2 * n) failures.push({ screen: -1, rule: 'hardRun', msg: `${worst} consecutive hard screens (max ${opts.maxHardRun})` });
  }
  if (collectibles) {
    const ids = new Set(collectibles.map((c) => c.screen));
    if (ids.size !== collectibles.length) failures.push({ screen: -1, rule: 'collectibleUnique', msg: 'two collectibles share a screen' });
  }
  return { ok: failures.length === 0, failures, stats: { screens: n, collectibles: collectibles?.length ?? 0 } };
}

/** True if generating twice yields deeply identical worlds (guards against hidden nondeterminism / iteration-order bugs). */
export function isDeterministic(rules) {
  const a = JSON.stringify(generateWorld(rules).screens), b = JSON.stringify(generateWorld(rules).screens);
  return a === b;
}
