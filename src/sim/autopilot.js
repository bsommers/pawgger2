// Pawgger autopilot (ARCHITECTURE section 11). Time-expanded look-ahead search over (row, x, time) using the sim's
// own predicates (supportAt, hitVehicle, itemLeft via lanes.js). Pure, Node-safe, deterministic (own seeded rng).
//   const ap = createAutopilot(game, { skill: 1, seed: 1 });  const input = ap.step(dt);  g.update(dt, input);
// skill (0..1): 1 = perfect execution of the plan; lower values delay hops by a random number of ticks and
// sometimes freeze for a moment (reaction noise), so a low-skill bot dies like a human would.
import { CELL, W, TUNING, ROW, colX, bayHazardOn, FROG_MIN_ROW, FROG_MAX_ROW } from '../core/defs.js';
import { supportAt } from './lanes.js';
import { hitVehicle } from './collide.js';

const STEP = 1 / 30;                       // planning step (2 sim ticks)
const HOP_STEPS = Math.ceil((Math.ceil(TUNING.hopTime * 60 - 1e-9) / 60) / STEP - 1e-9);
const DIRS = ['up', 'left', 'right', 'down'];

function mulberry(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createAutopilot(game, { skill = 1, seed = 1 } = {}) {
  const rng = mulberry(seed * 7919 + 13);
  const g = game;
  const stats = { plans: 0, replans: 0, fallbacks: 0, noPlan: 0 };
  let plan = null;            // { t0, path: [{k,row,x}], hops: Map(k -> dir) }
  let pending = null;         // delayed hop { dir, ticks }
  let freeze = 0;             // ticks of reaction freeze
  let lastProg = { t: 0, score: -1 };
  let lastBays = 0;
  let stuckFor = 0;
  let margin = 1.5;
  let lastPete = 'off';

  // ------------------------------------------------------------ danger predicates
  const rollerHit = (t, tNow, x) => {
    const p = g.pete;
    if (!p || (p.state !== 'roller' && p.state !== 'rollerWarn')) return false;
    const dt = t - tNow;
    const half = TUNING.frogHalf + 7 + margin + 2;
    if (p.state === 'roller') {
      const rx = p.rollerX + (p.rollerDir ?? 1) * TUNING.rollerSpeed * dt;
      return Math.abs(rx - x) < half;
    }
    const left = Math.max(0, TUNING.rollerWarn - (p.t ?? 0));
    if (dt < left) return false;
    const dir = p.rollerDir ?? 1;
    const rx = (dir > 0 ? -8 : W + 8) + dir * TUNING.rollerSpeed * (dt - left);
    return Math.abs(rx - x) < half;
  };

  const safeAt = (row, x, t, tNow, landing, fromRow) => {
    const m = margin;
    if (row === ROW.median) return !rollerHit(t, tNow, x);
    if (row >= ROW.road[0] && row <= ROW.road[4]) {
      if (hitVehicle(g, row, x - m, t) || hitVehicle(g, row, x + m, t)) return false;
      if (hitVehicle(g, row, x, t - 0.03) || hitVehicle(g, row, x, t + 0.03)) return false;
      if (landing && fromRow !== row && fromRow >= ROW.road[0] && fromRow <= ROW.road[4]) {
        if (hitVehicle(g, fromRow, x - m, t) || hitVehicle(g, fromRow, x + m, t)) return false;
      }
      return true;
    }
    if (row >= ROW.river[0] && row <= ROW.river[4]) {
      if (!supportAt(g, row, x - m, t) || !supportAt(g, row, x + m, t)) return false;
      if (!supportAt(g, row, x, t - 0.04) || !supportAt(g, row, x, t + 0.04)) return false;
      return true;
    }
    return true;   // start strip
  };

  const bayOk = (x, t) => {
    let best = -1, bd = Infinity;
    const bays = g.bays;
    for (let i = 0; i < bays.length; i++) { const d = Math.abs(x - colX(bays[i].col)); if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > TUNING.bayReach - Math.min(margin, 3)) return false;
    if (g.filled[best]) return false;
    for (const h of g.def.bays?.hazards ?? []) {
      if (h.bay !== best) continue;
      if (bayHazardOn(h, t) || bayHazardOn(h, t - 0.12) || bayHazardOn(h, t + 0.05)) return false;
    }
    return true;
  };

  // ------------------------------------------------------------ search
  // A* over (row, x, step) with an admissible heuristic (rows still to climb * HOP_STEPS). It returns the same earliest
  // arrival as a plain time-layered BFS but expands only nodes that can still beat the best route, so a replan costs a
  // small fraction of the old full-width sweep (that sweep stalled single frames for up to ~0.5 s on busy levels).
  // MAX_EXPAND bounds the worst case; hitting it counts as "no plan at this margin" and the caller degrades gracefully.
  const MAX_EXPAND = 6000;
  function search(t0, maxSteps) {
    const f = g.frog;
    const key = (row, x) => row * 1024 + Math.round(x);
    const heap = [];                         // binary min-heap on (f, -k)
    const less = (a, b) => a.f < b.f || (a.f === b.f && (a.k > b.k || (a.k === b.k && a.id < b.id)));
    let ids = 0;
    const push = (n) => {
      n.f = n.k + (n.row - ROW.bays) * HOP_STEPS; n.id = ids++;
      let i = heap.push(n) - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
        }
      }
      return top;
    };
    const seen = new Set();
    const open = (n) => { const id = key(n.row, n.x) * 1024 + n.k; if (seen.has(id)) return; seen.add(id); push(n); };
    open({ k: 0, row: f.row, x: f.x, parent: null, dir: null });
    let expanded = 0;
    while (heap.length) {
      const n = pop();
      if (n.row === ROW.bays) return n;
      if (++expanded > MAX_EXPAND) return null;
      const k = n.k;
      if (k >= maxSteps) continue;
      const tk = t0 + k * STEP;
      // wait one step
      {
        const lane = g.lanes[n.row];
        const riding = n.row >= ROW.river[0] && n.row <= ROW.river[4];
        const nx = riding && lane ? n.x + lane.dir * lane.speed * STEP : n.x;
        if (nx >= -TUNING.edgeDeath + 2 && nx <= W + TUNING.edgeDeath - 2 && safeAt(n.row, nx, tk + STEP, t0, false, n.row)) {
          open({ k: k + 1, row: n.row, x: nx, parent: n, dir: null });
        }
      }
      // hops
      for (const d of DIRS) {
        let row = n.row, x = n.x;
        if (d === 'up') row = Math.max(FROG_MIN_ROW, row - 1);
        else if (d === 'down') row = Math.min(FROG_MAX_ROW, row + 1);
        else if (d === 'left') x = Math.max(CELL / 2, x - CELL);
        else x = Math.min(W - CELL / 2, x + CELL);
        if (row === n.row && x === n.x) continue;
        if (row === ROW.bays) {
          if (n.row === ROW.river[0] && bayOk(x, tk + HOP_STEPS * STEP)) open({ k: k + HOP_STEPS, row, x, parent: n, dir: d });
          continue;
        }
        const ta = tk + HOP_STEPS * STEP;
        if (!safeAt(row, x, ta, t0, true, n.row)) continue;
        open({ k: k + HOP_STEPS, row, x, parent: n, dir: d });
      }
    }
    return null;
  }

  function buildPlan(goal, t0) {
    const nodes = [];
    for (let n = goal; n; n = n.parent) nodes.push(n);
    nodes.reverse();
    const hops = new Map();
    const path = [];
    for (const n of nodes) { path.push({ k: n.k, row: n.row, x: n.x }); if (n.dir) hops.set(n.parent.k, n.dir); }
    return { t0, path, hops, last: goal.k };
  }

  function makePlan(dt) {
    const t0 = g.t + dt;
    const horizon = Math.min(Math.ceil(Math.max(g.timeLeft, 3) / STEP), 600);
    for (const mg of [margin, 0.5, 0]) {
      const saved = margin; margin = mg;
      const goal = search(t0, horizon);
      margin = saved;
      if (goal) { stats.plans++; return buildPlan(goal, t0); }
    }
    stats.noPlan++;
    return null;
  }

  // one-tick fallback: stay if safe, otherwise hop to a safe neighbour
  function fallback(dt) {
    stats.fallbacks++;
    const f = g.frog, t = g.t + dt;
    if (safeAt(f.row, f.x, t + STEP, t, false, f.row)) return null;
    for (const d of ['up', 'down', 'left', 'right']) {
      let row = f.row, x = f.x;
      if (d === 'up') row--; else if (d === 'down') row++; else if (d === 'left') x -= CELL; else x += CELL;
      if (row < 2 || row > 13 || x < 8 || x > W - 8) continue;
      if (safeAt(row, x, t + HOP_STEPS * STEP, t, true, f.row)) return d;
    }
    return null;
  }

  const expected = (idx) => {
    const p = plan.path;
    let best = p[0];
    for (const n of p) { if (n.k <= idx) best = n; else break; }
    return best;
  };

  // ------------------------------------------------------------ public step
  function step(dt = 1 / 60) {
    if (g.state !== 'play' || !g.frog) { plan = null; pending = null; return { hop: null }; }
    const f = g.frog;
    if (f.mode !== 'idle' && f.mode !== 'ride') { plan = null; return { hop: null }; }   // mid-hop / dying / home: replan after landing

    // watchdog: no progress (score) for 12 s of play -> drop plan, use wider margin
    if (g.score !== lastProg.score || g.stats.baysFilled !== lastBays) { lastProg = { t: g.t, score: g.score }; lastBays = g.stats.baysFilled; stuckFor = 0; margin = 1.5; }
    else if (g.t - lastProg.t > 12) { stuckFor++; plan = null; margin = [1.5, 2.5, 0.5, 3.5][stuckFor % 4]; lastProg.t = g.t; }

    if (freeze > 0) { freeze--; return { hop: null }; }
    if (pending) {
      if (pending.ticks-- > 0) return { hop: null };
      const d = pending.dir; pending = null; plan = null;
      return { hop: d };
    }

    const now = g.t + dt;
    const ps = g.pete ? g.pete.state : 'off';
    if (ps !== lastPete) { lastPete = ps; plan = null; }
    if (plan) {
      const idx = Math.round((now - plan.t0) / STEP);
      const e = expected(idx);
      const dx = Math.abs(f.x - e.x);
      if (idx > plan.last || e.row !== f.row || dx > 3 + (idx - e.k) * 0.5) { plan = null; stats.replans++; }
    }
    if (!plan) { plan = makePlan(dt); if (!plan) return { hop: fallback(dt) }; }

    const idx = Math.round((now - plan.t0) / STEP);
    // hop is issued on the tick whose time is nearest the planned step time
    const dir = plan.hops.get(idx);
    if (dir && (now - plan.t0) >= idx * STEP - dt / 2 - 1e-9 && (now - plan.t0) < idx * STEP + dt / 2 + 1e-9) {
      if (skill < 1) {
        if (rng() < (1 - skill) * 0.12) { freeze = 1 + Math.floor(rng() * 10 * (1 - skill)); return { hop: null }; }
        const delay = Math.floor(rng() * (1 - skill) * 14);
        if (delay > 0) { pending = { dir, ticks: delay - 1 }; return { hop: null }; }
      }
      return { hop: dir };
    }
    return { hop: null };
  }

  return { step, stats, get plan() { return plan; }, reset() { plan = null; pending = null; freeze = 0; } };
}

export default createAutopilot;
