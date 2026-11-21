// platformer-physics: fixed-step 2D platformer core (zero deps, Node-safe, deterministic).
// Generalised from PawFall's sim (src/sim/player.js, physics.js, screens.js). Coordinates: x right,
// y DOWN, a body's (x,y) is its FEET centre; the hitbox is hitW wide and hitH tall above y.
//
// World description (plain data, rebuilt per screen/level by the game):
//   { groundY, pits:[{x0,x1,kind,deadly?,drop?}], platforms:[{id?,x,y,w,dx?,dy?}],
//     ladders:[{x,top,bottom,w?}], ropes:[pendulum], bounds:{minY?} }
//   - pits: no ground between x0..x1. deadly (default true) kills (mode 'dead', emit 'death');
//     drop:true is a safe hole (emit 'drop', body.layer++ is the game's job).
//   - platforms: one-way tops (land from above only). dx/dy = movement this tick (see movingPlatform).
//   - ropes: see pendulum(); a falling body whose hands are within grabR of the tip grabs it.
// Modes: 'ground' | 'air' | 'climb' | 'swing' | 'dead'. Events go to cfg.emit(name, body, extra).

export const DEFAULTS = Object.freeze({
  gravity: 520, jumpV: 200, runSpeed: 60, airSpeed: 60, airAccel: 160, climbSpeed: 40,
  hitW: 8, hitH: 16, grabR: 8, grabCooldown: 0.35, swingBlend: 0.12,
  edgeL: 4, edgeR: 316, stride: 1,
});

export const makeConfig = (over = {}) => ({ ...DEFAULTS, ...over });

/** Max horizontal distance a run-jump covers on flat ground (use for pit-width fairness checks). */
export const jumpRange = (cfg = DEFAULTS) => (cfg.runSpeed * 2 * cfg.jumpV) / cfg.gravity;
/** Apex height of a jump. */
export const jumpHeight = (cfg = DEFAULTS) => (cfg.jumpV * cfg.jumpV) / (2 * cfg.gravity);

export function makeBody(x = 0, y = 0) {
  return { x, y, vx: 0, vy: 0, face: 1, mode: 'ground', layer: 0, onPlatform: null, landed: true,
    grabCd: 0, swingK: 0, offX: 0, offY: 0, rope: null, t: 0, deathKind: null };
}

// ---- pendulum rope / vine ---------------------------------------------------------------------
/** Pendulum: angle = amp*sin(2*pi*t/period); tip hangs `len` below (px,py). */
export function pendulum({ px, py, len, amp, period }) {
  const w = (2 * Math.PI) / period;
  const angle = (t) => amp * Math.sin(w * t);
  return {
    px, py, len, amp, period, angle,
    tip(t) { const a = angle(t); return { x: px + Math.sin(a) * len, y: py + Math.cos(a) * len, a }; },
    tipVel(t) {
      const a = angle(t), om = amp * w * Math.cos(w * t);
      return { x: len * om * Math.cos(a), y: -len * om * Math.sin(a) };
    },
  };
}

// ---- moving platforms -------------------------------------------------------------------------
/** Ping-pong platform on the segment (x0,y0)-(x1,y1). Call .update(dt) each tick; .dx/.dy are this tick's delta. */
export function movingPlatform({ id, x0, y0, x1 = x0, y1 = y0, w = 24, speed = 20, phase = 0 }) {
  const span = Math.hypot(x1 - x0, y1 - y0) || 1;
  const p = { id, x: x0, y: y0, w, dx: 0, dy: 0, t: phase };
  const place = () => {
    const d = (p.t * speed) % (2 * span), u = (d <= span ? d : 2 * span - d) / span;
    p.x = x0 + (x1 - x0) * u; p.y = y0 + (y1 - y0) * u;
  };
  place();
  p.update = (dt) => { const ox = p.x, oy = p.y; p.t += dt; place(); p.dx = p.x - ox; p.dy = p.y - oy; };
  return p;
}

// ---- support queries --------------------------------------------------------------------------
export function pitAt(world, x) {
  for (const q of world.pits ?? []) if (x > q.x0 && x < q.x1) return q;
  return null;
}
export function ladderAt(world, x, feetY) {
  for (const l of world.ladders ?? []) {
    if (Math.abs(x - l.x) <= (l.w ?? 8) / 2 && feetY >= l.top - 1 && feetY <= l.bottom + 1) return l;
  }
  return null;
}
function platformUnder(world, x, y, prevY) {
  for (const p of world.platforms ?? []) {
    if (Math.abs(x - p.x) <= p.w / 2 && prevY <= p.y + 1 && y >= p.y) return p;
  }
  return null;
}
function platformCarrying(world, x, y) {
  for (const p of world.platforms ?? []) if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(y - p.y) <= 3) return p;
  return null;
}
/** Walkable support under a standing body: {y,platform?} or null (nothing: it falls). */
export function supportAt(world, x, y) {
  const p = platformCarrying(world, x, y);
  if (p) return { y: p.y, platform: p };
  const q = pitAt(world, x);
  if (q) return null;
  return { y: world.groundY };
}

const emit = (cfg, name, b, extra) => cfg.emit && cfg.emit(name, b, extra);

function enterPit(b, q, world, cfg) {
  if (q.drop) { b.vx = 0; b.vy = 0; b.y = world.groundY; b.landed = true; emit(cfg, 'drop', b, q); return; }
  b.mode = 'dead'; b.deathKind = q.kind ?? 'pit'; b.vx = 0; b.vy = 0; b.y = world.groundY;
  emit(cfg, 'death', b, q);
}

function ballistic(b, dt, dx, world, cfg) {
  const prevY = b.y;
  if (dx) {
    const target = dx * cfg.airSpeed, a = cfg.airAccel * dt;
    b.vx = b.vx < target ? Math.min(target, b.vx + a) : Math.max(target, b.vx - a);
  }
  b.vy += cfg.gravity * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  b.landed = false; b.onPlatform = null;
  if (world.bounds?.minY != null && b.y - cfg.hitH < world.bounds.minY) { b.y = world.bounds.minY + cfg.hitH; if (b.vy < 0) b.vy = 0; }
  if (b.vy >= 0) {
    const p = platformUnder(world, b.x, b.y, prevY);
    if (p) { b.y = p.y; b.vy = 0; b.vx *= 0.5; b.landed = true; b.onPlatform = p.id ?? p; emit(cfg, 'land', b, p); return; }
  }
  if (b.vy >= 0 && b.y >= world.groundY) {
    const q = pitAt(world, b.x);
    if (q) { enterPit(b, q, world, cfg); return; }
    if (b.vy > 140) emit(cfg, 'hardland', b);
    b.y = world.groundY; b.vy = 0; b.landed = true; emit(cfg, 'land', b);
  }
}

function tryGrab(b, world, t, cfg) {
  if (b.grabCd > 0) return false;
  for (const r of world.ropes ?? []) {
    const tip = r.tip(t), hx = b.x, hy = b.y - cfg.hitH;
    if (Math.hypot(tip.x - hx, tip.y - hy) <= cfg.grabR) {
      b.mode = 'swing'; b.rope = r; b.swingK = 1; b.offX = hx - tip.x; b.offY = hy - tip.y; b.vx = 0; b.vy = 0;
      emit(cfg, 'grab', b, tip); return true;
    }
  }
  return false;
}

function stepGround(b, input, dt, world, cfg) {
  const dx = input.dx | 0, dy = input.dy | 0;
  const lad = ladderAt(world, b.x, b.y);
  if (lad && ((dy < 0 && b.y > lad.top + 1) || (dy > 0 && b.y < lad.bottom - 1))) {
    b.mode = 'climb'; b.x = lad.x; b.vx = 0; b.vy = 0; b.ladder = lad; emit(cfg, 'climb', b, lad); return;
  }
  if (input.jumpPressed) {
    b.vy = -cfg.jumpV; b.vx = dx * cfg.airSpeed; if (dx) b.face = dx;
    b.mode = 'air'; b.onPlatform = null; b.landed = false; emit(cfg, 'jump', b); return;
  }
  b.vx = dx * cfg.runSpeed; if (dx) b.face = dx;
  const prevX = b.x;
  b.x += b.vx * dt;
  const carry = platformCarrying(world, prevX, b.y);
  if (carry) { b.x += carry.dx ?? 0; b.y += carry.dy ?? 0; }
  const sup = supportAt(world, b.x, b.y);
  if (!sup) { b.mode = 'air'; b.vy = 0; b.onPlatform = null; }
  else { b.y = sup.y; b.onPlatform = sup.platform ? (sup.platform.id ?? sup.platform) : null; }
}

function stepAir(b, input, dt, world, cfg) {
  const dx = input.dx | 0;
  if (dx) b.face = dx;
  ballistic(b, dt, dx, world, cfg);
  if (b.mode !== 'air') return;
  if (b.landed) { b.mode = 'ground'; return; }
  tryGrab(b, world, world.t ?? b.t, cfg);
}

function stepSwing(b, input, dt, world, cfg) {
  const r = b.rope, t = world.t ?? b.t;
  if (!r) { b.mode = 'air'; return; }
  const tip = r.tip(t), tv = r.tipVel(t);
  b.swingK = Math.max(0, b.swingK - dt / cfg.swingBlend);
  b.x = tip.x + b.offX * b.swingK; b.y = tip.y + cfg.hitH + b.offY * b.swingK;
  if (Math.abs(tv.x) > 12) b.face = tv.x > 0 ? 1 : -1;
  b.vx = tv.x; b.vy = tv.y;
  if (input.jumpPressed) { b.mode = 'air'; b.rope = null; b.grabCd = cfg.grabCooldown; b.landed = false; emit(cfg, 'release', b); return; }
  if (b.y >= world.groundY - 2 && !pitAt(world, b.x)) {
    b.mode = 'ground'; b.rope = null; b.y = world.groundY; b.vx = 0; b.vy = 0; b.grabCd = cfg.grabCooldown; emit(cfg, 'land', b);
  }
}

function stepClimb(b, input, dt, world, cfg) {
  const dy = input.dy | 0, l = b.ladder;
  if (!l) { b.mode = 'air'; return; }
  if (dy) b.y += dy * cfg.climbSpeed * dt;
  if (b.y <= l.top) { b.y = l.top; b.mode = 'ground'; b.ladder = null; emit(cfg, 'climbEnd', b, 'top'); }
  else if (b.y >= l.bottom) { b.y = l.bottom; b.mode = 'ground'; b.ladder = null; emit(cfg, 'climbEnd', b, 'bottom'); }
}

/**
 * Advance one body one fixed tick. input = {dx:-1|0|1, dy:-1|0|1 (up negative), jumpPressed}.
 * Returns the body. world.t (seconds) drives ropes; falls back to body.t.
 */
export function stepBody(b, input, dt, world, cfg = DEFAULTS) {
  b.t += dt;
  if (b.grabCd > 0) b.grabCd -= dt;
  switch (b.mode) {
    case 'ground': stepGround(b, input, dt, world, cfg); break;
    case 'air': stepAir(b, input, dt, world, cfg); break;
    case 'swing': stepSwing(b, input, dt, world, cfg); break;
    case 'climb': stepClimb(b, input, dt, world, cfg); break;
    default: break;
  }
  return b;
}

// ---- screen-edge transitions ------------------------------------------------------------------
export const wrapIndex = (i, n) => ((i % n) + n) % n;

/**
 * If the body left a screen edge, returns {dir, idx, x} for the circular world of `count` screens.
 * stride may be a number or fn(body)->number (e.g. tunnels skip 3 screens). Body x is NOT mutated.
 */
export function edgeTransition(b, idx, count, cfg = DEFAULTS) {
  if (b.mode !== 'ground' && b.mode !== 'air') return null;
  const dir = b.x < cfg.edgeL ? -1 : b.x > cfg.edgeR ? 1 : 0;
  if (!dir) return null;
  const stride = typeof cfg.stride === 'function' ? cfg.stride(b) : cfg.stride;
  return { dir, idx: wrapIndex(idx + dir * stride, count), x: dir > 0 ? cfg.edgeL + 1 : cfg.edgeR - 1 };
}
/** Apply an edgeTransition result to the body. */
export function applyTransition(b, tr) { if (tr) b.x = tr.x; return b; }
