// Level generator (ARCHITECTURE section 6). Pure, deterministic per (level, seed), Node-safe.
import {
  CELL, W, MAX_ITEM_W, BAY_COLS, TUNING, KINDS, itemW, speedScale, attemptTimeFor, skyForLevel,
} from '../core/defs.js';
import { createRng } from '../core/rng.js';

export const ROAD_ROWS = [8, 9, 10, 11, 12];
export const RIVER_ROWS = [2, 3, 4, 5, 6];
export const MIN_LOOP_CELLS = Math.ceil((W + MAX_ITEM_W) / CELL);   // 22
const ROAD_MIN_GAP = 2;      // cells of free road between vehicles
const RIVER_MAX_GAP = 2;     // cells of open water between platforms (fairness rule c)

function mixSeed(level, seed) {
  let h = Math.imul((seed | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((level | 0) + 0x7F4A7C15, 0xC2B2AE35);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12;
  return h >>> 0;
}

const cells = (type) => KINDS[type].cells;

function pickWeighted(rng, table) {          // table: [[value, weight], ...]
  let tot = 0; for (const [, w] of table) tot += w;
  let r = rng.next() * tot;
  for (const [v, w] of table) { r -= w; if (r < 0) return v; }
  return table[table.length - 1][0];
}

function roadPool(level, idx) {              // idx 0..4 = rows 8..12 (row 8 is the slowest lane, row 12 the fastest)
  const t = [['car', 4], ['truck', 2]];
  if (idx === 0) t.push(['tuna_bus', 3]);
  if (level >= 2) t.push(['pickle_truck', idx === 0 ? 1 : 2]);
  if (level >= 3 && idx !== 0) t.push(['cheese_roll', 2]);
  if (idx === 4) t.push(['racer', 5]);
  return t;
}

// Distribute `extra` whole cells over n gaps.
function spreadGaps(rng, n, minGap, extra) {
  const g = new Array(n).fill(minGap);
  for (let e = 0; e < extra; e++) g[rng.int(0, n - 1)]++;
  return g;
}

// Place items sequentially; gaps[i] is the gap BEFORE item i (gaps[0] wraps the seam, split by `seamLead`).
function place(rng, types, gapsAfter, loopCells) {
  // gapsAfter[i] = free cells after item i (circular). Item 0 starts after a random part of the seam gap.
  const n = types.length;
  const lead = rng.int(0, gapsAfter[n - 1]);
  const offs = []; let c = lead;
  for (let i = 0; i < n; i++) { offs.push(c * CELL); c += cells(types[i]) + gapsAfter[i]; }
  return offs;
}

function genRoadLane(rng, level, idx, row, mustHave) {
  const loopCells = MIN_LOOP_CELLS + rng.int(0, 2);
  const target = Math.min(5, 2 + Math.floor((level - 1) / 3) + rng.int(0, 1));
  const types = [...mustHave];
  let S = types.reduce((a, t) => a + cells(t), 0);
  const pool = roadPool(level, idx);
  for (let tries = 0; types.length < target && tries < 20; tries++) {
    const t = pickWeighted(rng, pool);
    if (S + cells(t) + (types.length + 1) * ROAD_MIN_GAP > loopCells) continue;
    types.push(t); S += cells(t);
  }
  if (!types.length) { types.push('car'); S = 1; }
  // shuffle (Fisher-Yates, seeded)
  for (let i = types.length - 1; i > 0; i--) { const j = rng.int(0, i); [types[i], types[j]] = [types[j], types[i]]; }
  const extra = loopCells - S - types.length * ROAD_MIN_GAP;
  const gaps = spreadGaps(rng, types.length, ROAD_MIN_GAP, extra);
  const offs = place(rng, types, gaps, loopCells);
  return { types, offs, loopCells };
}

function genRiverLane(rng, level, turtles, crocWanted) {
  const types = []; const gaps = [];
  let total = 0, guard = 0;
  const p2 = Math.min(0.75, 0.3 + 0.05 * level);       // chance of a 2-cell gap rises with level
  if (crocWanted) { types.push('croc'); gaps.push(rng.chance(p2) ? 2 : 1); total += 4 + gaps[0]; }
  while (total < MIN_LOOP_CELLS && guard++ < 40) {
    let t;
    if (turtles) t = rng.chance(Math.min(0.8, 0.35 + 0.05 * level)) ? 'turtle2' : 'turtle3';
    else t = pickWeighted(rng, [['log_l', Math.max(1, 5 - level)], ['log_m', 4], ['log_s', 2 + Math.min(level, 4)]]);
    const g = rng.chance(p2) ? RIVER_MAX_GAP : 1;
    types.push(t); gaps.push(g); total += cells(t) + g;
  }
  for (let i = types.length - 1; i > 0; i--) {         // shuffle types and gaps together as pairs
    const j = rng.int(0, i);
    [types[i], types[j]] = [types[j], types[i]]; [gaps[i], gaps[j]] = [gaps[j], gaps[i]];
  }
  const offs = place(rng, types, gaps, total);
  return { types, offs, loopCells: total };
}

export function generateLevel(level = 1, seed = 1) {
  const rng = createRng(mixSeed(level, seed));
  for (let i = 0; i < 4; i++) rng.next();
  const scale = speedScale(level);
  const startSign = rng.chance(0.5) ? 1 : -1;
  const dirOf = (row) => startSign * (row % 2 === 0 ? 1 : -1);
  const speedOf = (base) => Math.min(base * TUNING.speedCap, base * scale * (1 + rng.range(-0.12, 0.12)));
  const petes = level >= TUNING.peteFromLevel;
  const limoLane = petes ? rng.pick([9, 10, 11]) : null;

  const lanes = [];
  const mkItems = (row, spec, kind, extras) => spec.types.map((type, i) => {
    const it = { id: `${row}-${i}`, type, off: spec.offs[i] };
    if (type === 'car') it.variant = rng.int(0, 2);
    else if (type === 'truck') it.variant = rng.int(0, 1);
    else if (KINDS[type].variants > 0) it.variant = 0;
    if (extras) extras(it, i);
    it.pickup = null;
    return it;
  });

  // road lanes
  ROAD_ROWS.forEach((row, idx) => {
    const spec = genRoadLane(rng, level, idx, row, row === limoLane ? ['limo'] : []);
    lanes[row] = {
      row, kind: 'road', dir: dirOf(row), speed: speedOf(TUNING.roadSpeed[idx]), loop: spec.loopCells * CELL,
      items: mkItems(row, spec, 'road'), tile: 'road',
    };
  });

  // river lanes: rows alternate logs / turtles (parity from the seed); a croc rides a log lane from level 2
  const turtleParity = rng.chance(0.5) ? 0 : 1;
  const logRows = RIVER_ROWS.filter((r) => (r + turtleParity) % 2 === 0);
  const crocRow = level >= 2 ? rng.pick(logRows) : null;
  RIVER_ROWS.forEach((row, idx) => {
    const turtles = (row + turtleParity) % 2 === 1;
    const spec = genRiverLane(rng, level, turtles, row === crocRow);
    const P = TUNING.turtlePeriod;
    const tIdx = []; spec.types.forEach((t, i) => { if (KINDS[t].dives) tIdx.push(i); });
    const n = tIdx.length, step = n ? P * Math.floor(n / 2) / n : 0;
    // neighbouring turtle groups (circularly, in position order) must not dive together
    const order = tIdx.slice().sort((a, b) => spec.offs[a] - spec.offs[b]);
    const base = rng.range(0, P);
    const phaseRank = new Map(order.map((ix, k) => [ix, k]));
    lanes[row] = {
      row, kind: 'river', dir: dirOf(row), speed: speedOf(TUNING.riverSpeed[idx]), loop: spec.loopCells * CELL,
      items: mkItems(row, spec, 'river', (it, i) => {
        if (KINDS[it.type].dives) it.phase = round3((base + phaseRank.get(i) * step) % P);
        else if (it.type === 'croc') it.phase = round3(rng.range(0, TUNING.crocPeriod));
      }),
      tile: 'river',
    };
  });

  // safe rows
  lanes[7] = { row: 7, kind: 'safe', dir: 1, speed: 0, loop: W + MAX_ITEM_W, items: [], tile: 'median' };
  lanes[13] = { row: 13, kind: 'safe', dir: 1, speed: 0, loop: W + MAX_ITEM_W, items: [], tile: 'start' };

  // pickups: at most 3, on log items only (never turtle or croc)
  const logItems = [];
  for (const row of RIVER_ROWS) for (const it of lanes[row].items) if (it.type.startsWith('log_')) logItems.push(it);
  const nPick = Math.min(3, logItems.length, 1 + Math.floor(level / 2), level >= 2 ? 3 : 1);
  for (let k = 0; k < nPick; k++) {
    const i = rng.int(0, logItems.length - 1);
    logItems[i].pickup = rng.pick(['tuna', 'tuna', 'sardine', 'gold', 'collar']);
    logItems.splice(i, 1);
  }

  // bays
  const bayIdx = [0, 1, 2, 3, 4];
  for (let i = 4; i > 0; i--) { const j = rng.int(0, i); [bayIdx[i], bayIdx[j]] = [bayIdx[j], bayIdx[i]]; }
  const nHaz = Math.min(2, level - 1);
  const hazards = [], bonuses = [];
  const hz0 = rng.range(0, TUNING.bayHazardPeriod);
  for (let k = 0; k < nHaz; k++) {
    hazards.push({ bay: bayIdx[k], kind: rng.chance(0.5) ? 'croc' : 'snake',
      phase: round3((hz0 + k * TUNING.bayHazardPeriod / 2) % TUNING.bayHazardPeriod) });
  }
  const nBon = Math.min(2, 5 - nHaz, rng.int(1, 2));
  const bz0 = rng.range(0, TUNING.bonusPeriod);
  for (let k = 0; k < nBon; k++) {
    bonuses.push({ bay: bayIdx[nHaz + k], kind: rng.chance(0.5) ? 'mouse' : 'fish',
      phase: round3((bz0 + k * TUNING.bonusPeriod / 2) % TUNING.bonusPeriod) });
  }

  const pete = petes ? {
    limoLane,
    tauntEvery: round3(Math.max(6, 14 - level) + rng.range(0, 2)),
    roller: level >= TUNING.peteRollerFromLevel,
    rollerEvery: level >= TUNING.peteRollerFromLevel ? round3(Math.max(4, TUNING.rollerEvery * Math.pow(0.92, level - TUNING.peteRollerFromLevel))) : 0,
  } : null;

  return {
    level, seed, timeLimit: attemptTimeFor(level), lanes,
    bays: { cols: BAY_COLS, hazards, bonuses }, pete, sky: skyForLevel(level),
  };
}

const round3 = (x) => Math.round(x * 1000) / 1000;
export const levelAt = generateLevel;
export default generateLevel;
