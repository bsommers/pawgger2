// lane-gen: deterministic lane layout helpers for grid-hop games. Takes a seeded rng {next,range,int,pick,chance}; never Math.random.
// Invariants it guarantees: loop is a multiple of `cell`; items never overlap on the loop; gaps >= minGap; dive phases staggered.

export const mixSeed = (level, seed) => {
  let h = Math.imul((seed | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((level | 0) + 0x7F4A7C15, 0xC2B2AE35);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12;
  return h >>> 0;
};

export function pickWeighted(rng, table) {            // table: [[value, weight], ...]
  let tot = 0; for (const [, w] of table) tot += w;
  let r = rng.next() * tot;
  for (const [v, w] of table) { r -= w; if (r < 0) return v; }
  return table[table.length - 1][0];
}

export function shuffle(rng, arr, ...parallel) {       // seeded Fisher-Yates; permutes parallel arrays identically
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    for (const a of [arr, ...parallel]) [a[i], a[j]] = [a[j], a[i]];
  }
  return arr;
}

/** Distribute `extra` whole cells over n gaps, each starting at minGap. */
export function spreadGaps(rng, n, minGap, extra) {
  const g = new Array(n).fill(minGap);
  for (let e = 0; e < extra; e++) g[rng.int(0, n - 1)]++;
  return g;
}

/** Offsets (px) for items laid out in order; gapsAfter[i] = free cells after item i (circular); random seam lead. */
export function placeItems(rng, cellsOf, gapsAfter, cell) {
  const n = cellsOf.length, offs = []; let c = rng.int(0, gapsAfter[n - 1]);
  for (let i = 0; i < n; i++) { offs.push(c * cell); c += cellsOf[i] + gapsAfter[i]; }
  return offs;
}

/**
 * Fill a loop with items from a weighted pool. Returns { types, offs, loopCells }.
 * opts: { cells(type), pool:[[type,w]], mustHave?:[], minLoopCells, loopJitter?:0, target, minGap }
 */
export function fillLane(rng, o) {
  const cell = o.cell;
  const loopCells = o.minLoopCells + (o.loopJitter ? rng.int(0, o.loopJitter) : 0);
  const types = [...(o.mustHave || [])];
  let S = types.reduce((a, t) => a + o.cells(t), 0);
  for (let tries = 0; types.length < o.target && tries < 20; tries++) {
    const t = pickWeighted(rng, o.pool);
    if (S + o.cells(t) + (types.length + 1) * o.minGap > loopCells) continue;
    types.push(t); S += o.cells(t);
  }
  if (!types.length) { types.push(o.fallback); S = o.cells(o.fallback); }
  shuffle(rng, types);
  const gaps = spreadGaps(rng, types.length, o.minGap, loopCells - S - types.length * o.minGap);
  return { types, offs: placeItems(rng, types.map(o.cells), gaps, cell), loopCells };
}

/** Evenly staggered dive phases so circular neighbours never dive together. `order` = indices sorted by position. */
export function staggerPhases(rng, offs, diveIdx, period) {
  const n = diveIdx.length, step = n ? period * Math.floor(n / 2) / n : 0, base = rng.range(0, period);
  const rank = new Map(diveIdx.slice().sort((a, b) => offs[a] - offs[b]).map((ix, k) => [ix, k]));
  return new Map(diveIdx.map((ix) => [ix, Math.round(((base + rank.get(ix) * step) % period) * 1000) / 1000]));
}
