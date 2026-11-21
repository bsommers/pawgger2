// Pete (ARCHITECTURE section 5, owner sim-pete): taunts, limo honk, median cheese roller.
// Pure, Node-safe, fixed step. Randomness only through g.rng (seeded createRng).
import { W, TUNING, itemLeft, rowY } from '../core/defs.js';
import { itemWidth } from './lanes.js';
import { hitRoller } from './collide.js';

// Original cat-vs-rat lines, all caps, <= 26 characters, no real brands.
export const TAUNTS = Object.freeze([
  'MEOW MEANS MOVE OVER, PETE',
  'NINE LIVES, ZERO VEST',
  'YOUR CHEESE IS MY SNACK',
  'SCRATCH THIS, VERMIN!',
  'PURR-LEASE, PAY THE TOLL',
  'HISS ALL YOU LIKE, PETE',
  'CURIOSITY KILLED THE RAT',
  'FURBALL FOR YOUR FACE!',
  'THIS PARKWAY IS MY CATWALK',
  'STAY OFF MY ROAD, RODENT',
  'WHISKERS UP, VEST DOWN',
  'I SMELL CHEESE AND TREASON',
]);

const ROLLER_ROW = 7;
const ROLLER_OFF = 8;          // roller centre starts/ends this far beyond the screen edge
const MIN_INTERVAL = 4;
const clampX = (x) => Math.max(0, Math.min(W, x));

// createPete(g) -> { state, t, rollerX, rollerDir, update(dt), reset() }
// state: 'off' (no pete in this level) | 'idle' | 'rollerWarn' | 'roller'
export function createPete(g) {
  const p = { state: 'off', t: 0, rollerX: 0, rollerDir: 1, update, reset };
  let tauntT = 0;
  let cd = null;                       // seconds until the next roller; null = not yet armed
  const honkVis = new Map();           // limo item -> was its left edge on screen last step

  const cfgOf = () => (g.def && g.def.pete) || null;

  // Level-adjusted interval comes from lane-gen (def.pete.rollerEvery already applies 0.92^(level-3), min 4).
  // Fallback recomputes the same rule when a def omits it.
  const intervalOf = (c) => (Number.isFinite(c.rollerEvery) && c.rollerEvery > 0
    ? c.rollerEvery
    : Math.max(MIN_INTERVAL, TUNING.rollerEvery * Math.pow(0.92, (g.level ?? 3) - 3)));

  function honkCheck(c) {
    const lane = g.lanes && g.lanes[c.limoLane];
    if (!lane || !Array.isArray(lane.items)) return;
    lane.items.forEach((item, i) => {
      if (item.type !== 'limo') return;
      const key = item.id ?? i;
      const left = itemLeft(lane, item, g.t);
      const on = left >= 0 && left < W;          // left edge inside the screen
      if (!honkVis.has(key)) { honkVis.set(key, on); return; }
      const was = honkVis.get(key);
      honkVis.set(key, on);
      if (on && !was) g.sfx('honk', clampX(left), rowY(c.limoLane));
    });
  }

  function startWarn() {
    p.state = 'rollerWarn';
    p.t = 0;
    p.rollerDir = g.rng.chance(0.5) ? 1 : -1;
    p.rollerX = p.rollerDir > 0 ? -ROLLER_OFF : W + ROLLER_OFF;   // telegraph at the entry edge
    g.sfx('roller_warn', clampX(p.rollerX), rowY(ROLLER_ROW));
  }

  function update(dt) {
    const c = cfgOf();
    if (!c) { p.state = 'off'; return; }
    if (p.state === 'off') p.state = 'idle';

    if (c.tauntEvery > 0) {
      tauntT += dt;
      if (tauntT >= c.tauntEvery) {
        tauntT -= c.tauntEvery;
        g.taunt(TAUNTS[g.rng.int(0, TAUNTS.length - 1)]);
        g.sfx('pete_laugh');
      }
    }

    honkCheck(c);

    if (!c.roller) return;
    if (cd === null) cd = intervalOf(c);

    if (p.state === 'idle') {
      cd -= dt;
      if (cd <= 0) {
        const f = g.frog;
        // Never start while the frog is mid-hop into the median: wait one step and try again.
        if (f && f.mode === 'hop' && f.row === ROLLER_ROW && f.fromRow !== ROLLER_ROW) cd = 0;
        else startWarn();
      }
    } else if (p.state === 'rollerWarn') {
      p.t += dt;
      if (p.t >= TUNING.rollerWarn) {
        p.state = 'roller';
        p.t = 0;
        g.sfx('roller_rumble', clampX(p.rollerX), rowY(ROLLER_ROW));
      }
    } else if (p.state === 'roller') {
      p.t += dt;
      p.rollerX += p.rollerDir * TUNING.rollerSpeed * dt;
      const f = g.frog;
      if (f && f.row === ROLLER_ROW && hitRoller(p.rollerX, f.x)) g.kill('roller');
      if (p.rollerX < -ROLLER_OFF || p.rollerX > W + ROLLER_OFF) {
        p.state = 'idle';
        p.t = 0;
        cd = intervalOf(c);
      }
    }
  }

  function reset() {
    const c = cfgOf();
    p.state = c ? 'idle' : 'off';
    p.t = 0;
    p.rollerX = 0;
    p.rollerDir = 1;
    tauntT = 0;
    cd = c && c.roller ? intervalOf(c) : null;
    honkVis.clear();
  }

  return p;
}
