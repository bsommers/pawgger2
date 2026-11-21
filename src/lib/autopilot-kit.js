// autopilot-kit: game-agnostic building blocks for a deterministic look-ahead bot (zero deps, Node-safe).
// Generalised from PawFall src/sim/autopilot.js, but kept independent of it: PawFall's bot also mirrors its own
// player rules, which is game specific and stays in the game. What is reusable is below:
//   trajectory()   step cloned hazards forward N ticks with the game's own update functions
//   searchMacros() score families of "do A for n ticks then B" macro-plans, prefer ROBUST ones (smoothed over neighbours)
//   makeWatchdog() detect no-progress and flail for a while (unsticks bots in unforeseen geometry)
//   humanize()     deterministic late take-offs so a skill<1 bot behaves like a player (for difficulty tuning)
//   createAutopilot() glue: decide(g) -> input, wrapped with watchdog + humanizer + error containment + stats
// Input shape: {dx, dy, jump, jumpPressed}.

export const input = (dx = 0, dy = 0, jp = false) => ({ dx, dy, jump: jp, jumpPressed: jp });

export function botRng(seed = 0x9e3779b9) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Snapshots of entities for ticks 0..n (index j = after j updates). `update(e, dt)` is the game's real hazard step
 * (e.g. registry.update([e], dt, g)); entities are deep-cloned so the live game is untouched. `snap` picks fields.
 */
export function trajectory(ents, n, dt, update, snap = (e) => ({ ...e, st: { ...e.st } })) {
  const cur = ents.filter((e) => !e.dead).map((e) => ({ ...e, st: { ...(e.st ?? {}) } }));
  const out = [cur.map(snap)];
  for (let j = 0; j < n; j++) {
    for (const e of cur) { try { update(e, dt); } catch { /* a faulty behaviour must not kill the planner */ } }
    out.push(cur.map(snap));
  }
  return out;
}

/**
 * Macro-plan search.
 *   families: [{ bias, make(n) -> macro }]   n = delay in ticks (0, stride, 2*stride ...)
 *   cost(macro) -> number (lower is better; a hit/death should cost >> bias terms)
 *   opts: { count: 30, stride: 3, robustBelow: 24, nTax: 0.004 }
 * Pass 1 smooths each cost with its neighbours (max of i-1,i,i+1) so a plan that only works at one exact tick is not
 * trusted; if some smoothed plan is below `robustBelow` the best of those wins, otherwise raw costs decide.
 * Returns { cost, family, n, macro } or null.
 */
export function searchMacros(families, cost, opts = {}) {
  const NN = opts.count ?? 30, stride = opts.stride ?? 3, robust = opts.robustBelow ?? 24, tax = opts.nTax ?? 0.004;
  const grid = families.map((f) => ({ f, costs: Array.from({ length: NN }, (_, i) => cost(f.make(i * stride))) }));
  for (const smooth of [true, false]) {
    let best = null;
    grid.forEach(({ f, costs }, fi) => {
      for (let i = 0; i < NN; i++) {
        const c = (smooth ? Math.max(costs[i], costs[i - 1] ?? costs[i], costs[i + 1] ?? costs[i]) : costs[i]) + (f.bias ?? 0) + i * tax;
        if (!best || c < best.cost) best = { cost: c, family: fi, n: i * stride, macro: f.make(i * stride) };
      }
    });
    if (best && (!smooth || best.cost < robust)) return best;
  }
  return null;
}

/** Progress watchdog. tick(key, time) returns true while the bot should flail (key unchanged for `limit` seconds). */
export function makeWatchdog({ limit = 40, panicTicks = 90 } = {}) {
  let key = '', since = 0, panic = 0;
  return {
    stuck: 0,
    tick(k, time) {
      if (k !== key) { key = k; since = time; panic = 0; }
      if (panic === 0 && time - since > limit) { this.stuck++; panic = panicTicks; since = time; }
      if (panic > 0) { panic--; return true; }
      return false;
    },
    /** Flail input for the current panic tick: alternate direction, hop now and then. */
    flail(tickNo) { return input(tickNo % 120 < 60 ? 1 : -1, 0, tickNo % 40 === 0); },
  };
}

/** Deterministic human lag: delays each jump by up to ~(1-skill)*14 ticks. skill>=1 is a perfect bot. */
export function humanize(skill = 1, rng = botRng(1)) {
  let pending = 0;
  return (r, canAct = true) => {
    if (skill >= 1 || !canAct) return r;
    if (pending > 0) { pending--; return pending === 0 ? { ...r, jump: true, jumpPressed: true } : input(r.dx, 0, false); }
    if (r.jumpPressed) {
      const late = Math.round((1 - skill) * 14);
      pending = late + Math.floor(rng() * (late + 1));
      if (pending > 0) return input(r.dx, 0, false);
    }
    return r;
  };
}

/**
 * Glue. cfg: { decide(g, dt) -> input, progressKey(g) -> string, time(g) -> seconds, playing(g) -> bool,
 *              canHumanize(g) -> bool, skill: 1, seed, watchdog: {limit, panicTicks} }
 * Returns { stats, input(g, dt) }. Errors in decide() are contained (bot runs right) and counted in stats.errors.
 */
export function createAutopilot(cfg) {
  const stats = { errors: 0, stuck: 0, lastError: null };
  const wd = makeWatchdog(cfg.watchdog), lag = humanize(cfg.skill ?? 1, botRng(cfg.seed ?? 1));
  let tickNo = 0;
  return {
    stats,
    input(g, dt) {
      tickNo++;
      const playing = cfg.playing ? cfg.playing(g) : true;
      if (playing && wd.tick(cfg.progressKey(g), cfg.time(g))) { stats.stuck = wd.stuck; return wd.flail(tickNo); }
      let r;
      try { r = cfg.decide(g, dt); } catch (e) { stats.errors++; stats.lastError = String((e && e.stack) || e); r = input(1); }
      return lag(r, cfg.canHumanize ? cfg.canHumanize(g) : true);
    },
  };
}
