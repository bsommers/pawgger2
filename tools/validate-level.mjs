#!/usr/bin/env node
// Fairness validator for generated levels (ARCHITECTURE section 6). All numbers come from defs.js.
// Usage: node tools/validate-level.mjs --levels 12 --seeds 8 [--verbose]
import { fileURLToPath } from 'node:url';
import {
  CELL, W, BAY_COLS, START_COL, START_ROW, TUNING, KINDS, itemW, itemLeft, turtleState, crocMouth,
  bayHazardOn, colX,
} from '../src/core/defs.js';
import { generateLevel } from '../src/levels/lanegen.js';
import { supportAt as simSupportAt, crocBiteAt } from '../src/sim/lanes.js';
import { hitVehicle as simHitVehicle } from '../src/sim/collide.js';

// ---- thin adapters over the sim-core predicates (single source of truth; see test/validator-parity.test.mjs) ----
export function hitVehicle(lane, x, t) { return !!simHitVehicle(lane, lane.row, x, t); }
// returns null (no support) | { item, lethal:'croc'|null }
export function supportAt(lane, x, t) {
  const item = simSupportAt(lane, lane.row, x, t);
  if (item) return { item, lethal: null };
  const bite = crocBiteAt(lane, lane.row, x, t);
  return bite ? { item: bite, lethal: 'croc' } : null;
}

const DT = 1 / 25;                                // search step; hop = HOP_STEPS steps (0.12 s exactly)
const HOP_STEPS = Math.max(1, Math.ceil(TUNING.hopTime / DT - 1e-9));
const XMIN = -TUNING.edgeDeath, XMAX = W + TUNING.edgeDeath;
const NB = Math.ceil((XMAX - XMIN) * 2) + 1;      // 0.5 px buckets
const bucket = (x) => Math.round((x - XMIN) * 2);
const WAIT_NEEDED = Math.ceil(0.5 / DT);          // steps of waiting on a platform required by the "waits" proof

/**
 * Time-expanded search over (row, x, step). `starts`: [{row, x, step}]. Returns earliest arrival info.
 *  goalRow: stop-row (7) or 1 (bays).  limit: number of steps allowed from each start.
 */
function search(def, starts, goalRow, limitSteps, trackWait) {
  const lanes = def.lanes, haz = def.bays.hazards;
  const bayOpen = (b, t) => !haz.some((h) => h.bay === b && bayHazardOn(h, t));
  const nb = BAY_COLS.length;
  const bayFirst = new Array(nb).fill(Infinity), bayFirstWait = new Array(nb).fill(Infinity);
  let rowFirst = Infinity;
  const t0 = Math.min(...starts.map((s) => s.step));
  const endStep = Math.max(...starts.map((s) => s.step)) + limitSteps;
  let cur = new Map();                             // key row*NB+bucket -> [x, waitCount]
  const put = (m, row, x, wc) => {
    const k = row * NB + bucket(x), e = m.get(k);
    if (!e) m.set(k, [x, wc]); else if (wc > e[1]) { e[0] = x; e[1] = wc; }
  };
  const pend = new Map();                          // step -> Map (states arriving later, from hops)
  const addAt = (step, row, x, wc) => { let m = pend.get(step); if (!m) pend.set(step, m = new Map()); put(m, row, x, wc); };
  for (const s of starts) addAt(s.step, s.row, s.x, 0);

  const standOk = (row, x, t) => {                 // idle/ride validity at time t in row
    const ln = lanes[row];
    if (!ln || ln.kind === 'safe') return true;
    if (ln.kind === 'road') return !hitVehicle(ln, x, t);
    if (x < XMIN || x > XMAX) return false;
    const s = supportAt(ln, x, t);
    return !!s && !s.lethal;
  };

  for (let step = t0; step <= endStep; step++) {
    const t = step * DT;
    const arrive = pend.get(step); pend.delete(step);
    if (arrive) for (const [k, e] of arrive) { const row = Math.floor(k / NB); put(cur, row, e[0], e[1]); }
    if (!cur.size) { if (!pend.size) break; continue; }
    const nxt = new Map();
    for (const [k, [x, wc]] of cur) {
      const row = Math.floor(k / NB);
      // wait one step
      const ln = lanes[row];
      let nx = x;
      if (ln.kind === 'river') nx = x + ln.dir * ln.speed * DT;
      const wc2 = (ln.kind === 'river' && trackWait) ? Math.min(WAIT_NEEDED, wc + 1) : wc;
      if (standOk(row, nx, t + DT)) put(nxt, row, nx, wc2);
      // hops
      if (step + HOP_STEPS > endStep) continue;
      const te = t + HOP_STEPS * DT;
      const tryHop = (nrow, hx) => {
        if (hx < 8 - 1e-9 || hx > W - 8 + 1e-9) return;
        if (nrow < 1 || nrow > START_ROW) return;
        const nl = lanes[nrow];
        if (nrow === 1) {                          // bay resolution (only from row 2)
          if (row !== 2) return;
          let bi = -1, bd = Infinity;
          BAY_COLS.forEach((c, i) => { const d = Math.abs(hx - colX(c)); if (d < bd) { bd = d; bi = i; } });
          if (bd > TUNING.bayReach || !bayOpen(bi, te)) return;
          if (step + HOP_STEPS < bayFirst[bi]) bayFirst[bi] = step + HOP_STEPS;
          if (wc >= WAIT_NEEDED && step + HOP_STEPS < bayFirstWait[bi]) bayFirstWait[bi] = step + HOP_STEPS;
          return;
        }
        if (!nl) return;
        if (nl.kind === 'road' && hitVehicle(nl, hx, te)) return;
        if (lanes[row].kind === 'road' && hitVehicle(lanes[row], hx, te)) return;
        if (nl.kind === 'river' && !standOk(nrow, hx, te)) return;
        addAt(step + HOP_STEPS, nrow, hx, wc);
      };
      tryHop(row - 1, x); tryHop(row + 1, x); tryHop(row, x - CELL); tryHop(row, x + CELL);
    }
    cur = nxt;
    if (goalRow === 7) {
      for (const k of cur.keys()) if (Math.floor(k / NB) === 7) { rowFirst = Math.min(rowFirst, step); }
      if (rowFirst < Infinity) break;
    } else if (bayFirst.every((v) => v < Infinity) && (!trackWait || bayFirstWait.every((v) => v < Infinity))) break;
  }
  return { rowFirst, bayFirst, bayFirstWait, t0 };
}

/** Static checks on the lane data. */
function structural(def, level, seed) {
  const errs = [];
  for (const ln of def.lanes) {
    if (!ln) continue;
    if (ln.loop % CELL) errs.push(`row ${ln.row}: loop ${ln.loop} not multiple of CELL`);
    if (ln.kind === 'safe') { if (ln.items.length) errs.push(`row ${ln.row}: safe row has items`); continue; }
    if (ln.loop < W + 7 * CELL) errs.push(`row ${ln.row}: loop ${ln.loop} too short`);
    const its = ln.items.slice().sort((a, b) => a.off - b.off);
    its.forEach((it, i) => {
      if (it.off % CELL) errs.push(`row ${ln.row}: off ${it.off} not multiple of CELL`);
      if (it.off + itemW(it.type) > ln.loop) errs.push(`row ${ln.row}: item ${it.id} crosses the loop seam`);
      const nx = its[(i + 1) % its.length]; const end = it.off + itemW(it.type);
      const gap = (nx.off - end + ln.loop) % ln.loop || (its.length === 1 ? ln.loop - itemW(it.type) : 0);
      if (its.length > 1 && nx.off < end && i < its.length - 1) errs.push(`row ${ln.row}: ${it.id} overlaps ${nx.id}`);
      if (ln.kind === 'river' && gap > 2 * CELL) errs.push(`row ${ln.row}: open-water gap ${gap / CELL} cells > 2`);
      if (ln.kind === 'road' && gap < 2 * CELL) errs.push(`row ${ln.row}: road gap ${gap / CELL} cells < 2`);
    });
  }
  // (d) staggered turtles: neighbouring groups never both down over a full cycle
  for (const ln of def.lanes) {
    if (!ln || ln.kind !== 'river') continue;
    const tg = ln.items.filter((i) => KINDS[i.type].dives).sort((a, b) => a.off - b.off);
    for (let i = 0; i < tg.length && tg.length > 1; i++) {
      const a = tg[i], b = tg[(i + 1) % tg.length];
      if (a === b) continue;
      for (let t = 0; t < TUNING.turtlePeriod; t += 0.05) {
        if (turtleState(a, t) === 'down' && turtleState(b, t) === 'down') { errs.push(`row ${ln.row}: neighbour turtles ${a.id}/${b.id} dive together`); break; }
      }
    }
  }
  // bays: hazards and bonuses on distinct bays; never all hazards active at once
  const hb = def.bays.hazards.map((h) => h.bay), bb = def.bays.bonuses.map((b) => b.bay);
  if (new Set([...hb, ...bb]).size !== hb.length + bb.length) errs.push('bay hazard/bonus overlap on a bay');
  if (def.bays.hazards.length > 1) {
    let all = false;
    for (let t = 0; t < TUNING.bayHazardPeriod * 2; t += 0.1) if (def.bays.hazards.every((h) => bayHazardOn(h, t))) all = true;
    if (all) errs.push('all bay hazards active together');
  }
  return errs;
}

export function validateLevel(level, seed, opts = {}) {
  const def = opts.def ?? generateLevel(level, seed), errs = structural(def, level, seed);
  const limit = Math.floor(def.timeLimit / DT);
  const startTimes = opts.startTimes ?? [TUNING.introTime, TUNING.introTime + 2.7, TUNING.introTime + 5.3];
  const proof = { level, seed, road: [], river: [], full: null };
  for (const st of startTimes) {
    const s0 = Math.round(st / DT);
    const a = search(def, [{ row: START_ROW, x: colX(START_COL), step: s0 }], 7, limit, false);
    if (a.rowFirst === Infinity) errs.push(`(a) no road crossing from start at t=${st.toFixed(1)}`);
    else proof.road.push(+((a.rowFirst - s0) * DT).toFixed(2));
    const b = search(def, [{ row: 7, x: colX(START_COL), step: s0 }], 1, limit, true);
    const miss = b.bayFirst.map((v, i) => (v === Infinity ? i : -1)).filter((i) => i >= 0);
    const missW = b.bayFirstWait.map((v, i) => (v === Infinity ? i : -1)).filter((i) => i >= 0);
    if (miss.length) errs.push(`(b) bays ${miss} unreachable from median at t=${st.toFixed(1)}`);
    else if (missW.length) errs.push(`(b) bays ${missW} unreachable with a platform wait at t=${st.toFixed(1)}`);
    else proof.river.push(+(Math.max(...b.bayFirst.map((v) => v - s0)) * DT).toFixed(2));
  }
  const s0 = Math.round(startTimes[0] / DT);
  const f = search(def, [{ row: START_ROW, x: colX(START_COL), step: s0 }], 1, limit, false);
  const worst = Math.max(...f.bayFirst.map((v) => v - s0)) * DT;
  proof.full = Number.isFinite(worst) ? +worst.toFixed(2) : null;
  if (!Number.isFinite(worst)) errs.push('(f) start to bay crossing not found');
  else if (worst * 1.4 > def.timeLimit) errs.push(`(f) crossing ${worst.toFixed(1)}s needs more than ${(def.timeLimit / 1.4).toFixed(1)}s (limit ${def.timeLimit}s, 40% slack)`);
  // (e) determinism and seed sensitivity
  if (JSON.stringify(generateLevel(level, seed)) !== JSON.stringify(def)) errs.push('(e) generator not deterministic');
  if (JSON.stringify(generateLevel(level, seed + 1)) === JSON.stringify(def)) errs.push('(e) different seed gave identical level');
  return { level, seed, ok: errs.length === 0, errs, proof };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
  const L = get('levels', 12), S = get('seeds', 8), verbose = args.includes('--verbose');
  let fail = 0, n = 0;
  for (let lv = 1; lv <= L; lv++) {
    const bad = []; let minWorst = Infinity, maxWorst = 0, maxRoad = 0;
    for (let sd = 1; sd <= S; sd++) {
      const r = validateLevel(lv, sd); n++;
      if (!r.ok) { fail++; bad.push(r); }
      if (r.proof.full != null) { minWorst = Math.min(minWorst, r.proof.full); maxWorst = Math.max(maxWorst, r.proof.full); }
      if (r.proof.road.length) maxRoad = Math.max(maxRoad, ...r.proof.road);
    }
    console.log(`level ${String(lv).padStart(2)}: ${bad.length ? 'FAIL' : 'ok  '} seeds=${S}  road<=${maxRoad}s  full crossing ${minWorst}..${maxWorst}s  limit ${generateLevel(lv, 1).timeLimit}s`);
    for (const r of bad) for (const e of r.errs) console.log(`    seed ${r.seed}: ${e}`);
  }
  console.log(fail ? `FAILED ${fail}/${n} level instances` : `all ${n} level instances fair`);
  process.exit(fail ? 1 : 0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
