// hazard-kit: behaviour registry + contact resolution + ready-made hazard patterns (zero deps, deterministic).
// Generalised from PawFall src/sim/hazards.js. An entity is plain data with feet-anchored box
// {id,kind,x,y,w,h,vx,t,st,frame,lethal,solidTop,points,dead,layer}.
// A behaviour is {init(e,g), update(e,dt,g), onTouch?(e,player,g)}; `g` is the game facade the
// behaviours use: {spawn(kind,props), rng?, emit?(name,data), width?}. Nothing here touches Math.random.
//   lethal: null | 'life' (kills) | 'points' (score penalty, no death)
//   solidTop: true means the entity's top can be stood on (physics reads it; see solidTopUnder).

export function createRegistry() {
  const defs = new Map();
  let nextId = 1;
  return {
    register(kind, behaviour, defaults = {}) { defs.set(kind, { b: behaviour, defaults }); return this; },
    has: (kind) => defs.has(kind),
    kinds: () => [...defs.keys()],
    /** Make an entity (calls init). Caller stores it. */
    spawn(kind, props = {}, g = {}) {
      const d = defs.get(kind);
      if (!d) throw new Error('hazard-kit: unknown kind ' + kind);
      const e = { id: nextId++, kind, x: 0, y: 0, w: 8, h: 8, vx: 0, t: 0, frame: 0, lethal: null, solidTop: false,
        dead: false, layer: 'surface', ...d.defaults, ...props, st: { ...(d.defaults.st ?? {}), ...(props.st ?? {}) } };
      d.b.init?.(e, g);
      return e;
    },
    /** Tick every live entity. */
    update(ents, dt, g = {}) {
      for (const e of ents) if (!e.dead) defs.get(e.kind)?.b.update?.(e, dt, g);
    },
    touch(e, player, g) { return defs.get(e.kind)?.b.onTouch?.(e, player, g); },
    reset() { nextId = 1; },
  };
}

/** Feet-anchored player box {x,y} with half-width hw and height hh vs entity box. */
export const overlaps = (p, hw, hh, e) =>
  p.x + hw > e.x - e.w / 2 && p.x - hw < e.x + e.w / 2 && p.y > e.y - e.h && p.y - hh < e.y;

/**
 * Resolve contacts. Returns an ordered list of results:
 *   {type:'kill', ent, kind}      lethal 'life' (or custom onTouch result)
 *   {type:'points', ent, amount}  lethal 'points' (amount = ent.points ?? opts.pointsPenalty)
 *   {type:'collect', ent}         ent.collect true
 * solidTop entities that are NOT lethal are skipped (standing on them is physics, not contact).
 * onTouch(e,player,g) may return a result object to override. Entities with e.touched flag (cooldown) are skipped
 * for 'points' so a roller does not re-hit every tick: use opts.hitCooldown seconds (default 0.6) via e.st.hitT.
 */
export function resolveContacts(registry, player, ents, opts = {}, g = {}) {
  const hw = (opts.hitW ?? 8) / 2, hh = opts.hitH ?? 16, cd = opts.hitCooldown ?? 0.6, out = [];
  for (const e of ents) {
    if (e.dead) continue;
    if (e.layer && player.layer != null && e.layer !== player.layer) continue;
    if (!overlaps(player, hw, hh, e)) continue;
    const custom = registry.touch(e, player, g);
    if (custom) { out.push({ ent: e, ...custom }); continue; }
    if (e.collect) { out.push({ type: 'collect', ent: e }); continue; }
    if (e.lethal === 'life') out.push({ type: 'kill', ent: e, kind: e.kind });
    else if (e.lethal === 'points') {
      const last = e.st.hitT ?? -Infinity;
      if ((g.time ?? e.t) - last >= cd) { e.st.hitT = g.time ?? e.t; out.push({ type: 'points', ent: e, amount: e.points ?? opts.pointsPenalty ?? -100 }); }
    }
  }
  return out;
}

/** Entity whose solid top a body falling from prevY to y lands on (or null). */
export function solidTopUnder(ents, x, y, prevY, slack = 2) {
  for (const e of ents) {
    if (e.dead || !e.solidTop) continue;
    const top = e.topY ?? e.y - e.h;
    if (Math.abs(x - e.x) <= e.w / 2 + slack && prevY <= top + 1 && y >= top) return e;
  }
  return null;
}
/** Entity currently carrying a body standing at (x,y). */
export function solidTopCarrying(ents, x, y, slack = 2) {
  for (const e of ents) {
    if (e.dead || !e.solidTop) continue;
    if (Math.abs(x - e.x) <= e.w / 2 + slack && Math.abs(y - (e.topY ?? e.y - e.h)) <= 3) return e;
  }
  return null;
}

// ---- helpers ----------------------------------------------------------------------------------
const advance = (e, dx, framePx, frames) => { e.st.dist = (e.st.dist ?? 0) + Math.abs(dx); e.frame = Math.floor(e.st.dist / framePx) % frames; };

// ---- patterns: each returns a behaviour {init,update} --------------------------------------------
/** Walks between minX and maxX, turning at the ends (scorpion, guard). */
export function patroller({ w = 12, h = 8, speed = 20, minX = 0, maxX = 320, lethal = 'life', framePx = 4, frames = 2 } = {}) {
  return {
    init(e) {
      Object.assign(e, { w, h, lethal, solidTop: false });
      e.st.minX = e.st.minX ?? minX; e.st.maxX = e.st.maxX ?? maxX; e.dir = e.dir === 1 ? 1 : -1;
      e.x = Math.min(e.st.maxX, Math.max(e.st.minX, e.x)); e.vx = e.dir * (e.speed ?? speed);
    },
    update(e, dt) {
      e.t += dt; const dx = e.vx * dt; e.x += dx;
      if (e.x <= e.st.minX) { e.x = e.st.minX; e.dir = 1; }
      if (e.x >= e.st.maxX) { e.x = e.st.maxX; e.dir = -1; }
      e.vx = e.dir * (e.speed ?? speed); advance(e, dx, framePx, frames);
    },
  };
}

/** Rolls in one direction and wraps around the screen width (rolling log). hop:{period,len,height} adds hops. */
export function roller({ w = 14, h = 8, speed = 46, lethal = 'points', framePx = 6, frames = 4, hop = null, width = 320 } = {}) {
  return {
    init(e) {
      Object.assign(e, { w, h, lethal, solidTop: false }); e.vx = (e.dir ?? -1) * (e.speed ?? speed); e.st.baseY = e.y;
    },
    update(e, dt) {
      e.t += dt; const dx = e.vx * dt; e.x += dx;
      if (e.x + e.w / 2 < 0) e.x += width + e.w;
      if (e.x - e.w / 2 > width) e.x -= width + e.w;
      if (hop) {
        const ph = e.t % hop.period, k = ph < hop.len ? Math.sin((Math.PI * ph) / hop.len) : 0;
        e.y = e.st.baseY - hop.height * k;
      }
      advance(e, dx, framePx, frames);
    },
  };
}

/** Stationary hazard with a flicker/sway animation (fire, snake, stationary log). */
export function stationary({ w = 8, h = 12, lethal = 'life', frames = 3, fps = 8 } = {}) {
  return {
    init(e) { Object.assign(e, { w, h, lethal, solidTop: false, vx: 0 }); e.st.phase = e.st.phase ?? 0; },
    update(e, dt) { e.t += dt; e.frame = ((Math.floor((e.t + e.st.phase) * fps) % frames) + frames) % frames; },
  };
}

/**
 * Open/closed cycle (crocodile, spike trap, laser gate). Closed = solidTop and harmless; open = lethal.
 * Stagger neighbours with e.st.phase (e.g. i*period/3). Pure function of e.t, so it is deterministic.
 */
export function cycler({ w = 22, h = 10, period = 2.8, openFrac = 0.45, openLethal = 'life', closedSolid = true } = {}) {
  const apply = (e) => {
    const p = e.st.period, cyc = (((e.t + e.st.phase) % p) + p) % p, open = cyc >= p * (1 - e.st.openFrac);
    e.frame = open ? 1 : 0; e.open = open; e.solidTop = closedSolid && !open; e.lethal = open ? openLethal : null;
  };
  return {
    init(e) {
      Object.assign(e, { w, h, vx: 0 });
      e.st.phase = e.st.phase ?? 0; e.st.period = e.st.period ?? period; e.st.openFrac = e.st.openFrac ?? openFrac; apply(e);
    },
    update(e, dt) { e.t += dt; apply(e); },
  };
}

/** Spawns `kind` every `every` seconds via g.spawn(kind, props). makeProps(e,g) -> props. */
export function spawner({ every = 4, kind, makeProps = () => ({}), first = null } = {}) {
  return {
    init(e) { e.w = e.w ?? 1; e.h = e.h ?? 1; e.st.timer = first ?? every; },
    update(e, dt, g) {
      e.t += dt; e.st.timer -= dt;
      while (e.st.timer <= 0) { e.st.timer += every; g.spawn?.(kind, makeProps(e, g)); }
    },
  };
}

/**
 * Taunting boss NPC: every `every` seconds picks a line with g.rng.pick, emits 'taunt', and optionally throws a hazard.
 * Harmless by itself (lethal null). throwKind/throwProps(e,g) are optional.
 */
export function tauntingBoss({ every = 4, taunts = ['HA HA!'], dur = 2.5, throwKind = null, throwProps = () => ({}), sfx = null } = {}) {
  return {
    init(e) { e.st.timer = e.st.timer ?? every; e.st.said = 0; },
    update(e, dt, g) {
      e.t += dt; e.st.timer -= dt;
      if (e.st.timer > 0) return;
      e.st.timer += every;
      const text = g.rng ? g.rng.pick(taunts) : taunts[e.st.said % taunts.length];
      e.st.said++; e.st.last = text;
      g.emit?.('taunt', { text, dur, ent: e });
      if (sfx) g.emit?.('sfx', { name: sfx });
      if (throwKind) g.spawn?.(throwKind, throwProps(e, g));
    },
  };
}
