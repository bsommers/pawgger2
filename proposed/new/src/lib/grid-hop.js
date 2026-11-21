// grid-hop: pure lane geometry for Frogger-style games. Everything is a function of (lane, item, t); no state, no DOM.
// Config object `cfg`: { cell, kinds:{type:{cells, dives?:bool, head?:bool}}, inset:{support, vehicle}, frogHalf,
//   cycles:{ dive:{period,warn,down}, mouth:{period,openFrac} } }. Lane: { dir:-1|1, speed, loop, kind:'road'|'river'|'safe', items }.
// Item: { type, off, phase? }. `loop` must be a multiple of cfg.cell and >= viewW + maxItemW so wrapping is seamless.

const mod = (a, n) => ((a % n) + n) % n;

export function createGridHop(cfg) {
  const { cell, kinds } = cfg;
  const maxItemW = Math.max(...Object.values(kinds).map((k) => k.cells)) * cell;
  const itemWidth = (it) => (kinds[it.type] ? kinds[it.type].cells * cell : cell);

  /** Left edge x of an item at time t. Visible when left < viewW and left + width > 0. */
  const itemLeft = (lane, it, t) => mod(it.off + lane.dir * lane.speed * t, lane.loop) - maxItemW;
  const itemSpan = (lane, it, t) => { const l = itemLeft(lane, it, t); return [l, l + itemWidth(it)]; };

  /** Dive cycle: 'up' | 'warn' (sinking, still supports) | 'down' (does not support). */
  function diveState(it, t) {
    const { period: P, warn, down } = cfg.cycles.dive, ph = mod(t + (it.phase || 0), P);
    if (ph < P - warn - down) return 'up';
    return ph < P - down ? 'warn' : 'down';
  }
  /** Mouth cycle: 'closed' | 'open'. */
  function mouthState(it, t) {
    const { period: P, openFrac } = cfg.cycles.mouth;
    return mod(t + (it.phase || 0), P) < P * (1 - openFrac) ? 'closed' : 'open';
  }
  const headSpan = (lane, it, t) => { const [l, r] = itemSpan(lane, it, t); return lane.dir >= 0 ? [r - cell, r] : [l, l + cell]; };

  /** Does platform item `it` hold a frog at x at time t? Head cell of a `head` kind is lethal while the mouth is open. */
  function supports(lane, it, t, x) {
    const k = kinds[it.type] || {};
    if (k.head && x !== undefined) {
      const [a, b] = headSpan(lane, it, t);
      if (x >= a && x <= b && mouthState(it, t) === 'open') return false;
    }
    if (k.dives) return diveState(it, t) !== 'down';
    return true;
  }
  /** Platform under x on a river lane, or null (open water, sunk diver, open head). */
  function supportAt(lane, x, t) {
    if (!lane || lane.kind !== 'river') return null;
    for (const it of lane.items) {
      const [l, r] = itemSpan(lane, it, t);
      if (x < l + cfg.inset.support || x > r - cfg.inset.support) continue;
      if (supports(lane, it, t, x)) return it;
    }
    return null;
  }
  /** Platform under x ignoring dives (distinguishes "sank" from "fell in water"). */
  function platformAt(lane, x, t) {
    if (!lane || lane.kind !== 'river') return null;
    for (const it of lane.items) {
      const [l, r] = itemSpan(lane, it, t);
      if (x >= l + cfg.inset.support && x <= r - cfg.inset.support) return it;
    }
    return null;
  }
  /** Vehicle overlapping a frog of half-width cfg.frogHalf at x, or null. */
  function hitAt(lane, x, t) {
    if (!lane) return null;
    for (const it of lane.items) {
      const [l, r] = itemSpan(lane, it, t);
      if (x + cfg.frogHalf > l + cfg.inset.vehicle && x - cfg.frogHalf < r - cfg.inset.vehicle) return it;
    }
    return null;
  }
  /** Carry: new frog x after dt standing on a platform of `lane`. */
  const carry = (lane, x, dt) => x + lane.dir * lane.speed * dt;
  /** Snap x to the nearest grid column centre (hop landing). */
  const snapCol = (x, firstCenter = cell / 2) => Math.round((x - firstCenter) / cell) * cell + firstCenter;

  return { cfg, maxItemW, itemWidth, itemLeft, itemSpan, diveState, mouthState, headSpan, supports, supportAt, platformAt, hitAt, carry, snapCol };
}
export default createGridHop;
