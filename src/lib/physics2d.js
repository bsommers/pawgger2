// physics2d: deterministic 2D rigid-body engine + kinematic character controller (zero deps, Node-safe, fixed timestep).
// Builds on collision2d.js. Coordinates: x right, y DOWN, angles radians (positive = clockwise on screen), default units px / seconds.
//
// World: createWorld({gravity:{x,y}, velocityIterations, slop, baumgarte, maxBias, restitutionThreshold, warmRadius, cellSize,
//   sleep:true, ccd:true (fast dynamic bodies are swept against static bodies: no tunnelling), timeToSleep, linearSleep, angularSleep, onEvent}). One fixed step(dt) per tick; no clocks, no randomness.
// Body (addBody(def) returns the id; ids count up from 1 and bodies always iterate in id order):
//   {type:'static'|'dynamic'|'kinematic', x,y,angle, vx,vy,w, shape:{type:'circle',r}|{type:'box',hw,hh}|{type:'polygon',points}|{type:'capsule',hl,r},
//    density(1), friction(0.5), restitution(0), layer(1), mask(-1), sensor(false), linearDamping, angularDamping, gravityScale(1),
//    fixedRotation, allowSleep(true), userData (structured-cloneable)}
//   polygon points are re-centred on their centroid (x,y is then the centroid). Sensors detect overlap only (no response).
// Joints: addJoint({type:'distance'|'spring'|'revolute', a, b, anchorA:{x,y}, anchorB:{x,y} (body-local), length, stiffness, damping,
//   collideConnected:false}). distance = rigid (soft if stiffness>0), spring = soft (stiffness default 200), revolute = pin.
// Step order: integrate velocities (id order) -> broadphase (spatial hash, pairs sorted by id) -> narrowphase (contacts keyed "a:b",
//   warm-started from the previous step's impulses matched by nearest point) -> joints then contacts solved for `velocityIterations`
//   (friction before normal, forward order) -> integrate positions -> sleep islands. Events are emitted after the step in pair order:
//   world.events = [{type:'begin'|'end', a, b} (solid contacts) | {type:'enter'|'stay'|'exit', sensor, other} (sensor overlaps)].
// snapshot() returns a deep copy of the entire state (incl. warm-start impulses, sleep timers, contacts); restore(s) rewinds exactly, so a
// restored world replays bit-identically (rollback netcode, replays, tests).
//
// Character controller (drop-in for platformer-physics): makeCharacter(x,y) (feet-anchored like makeBody), makeCharConfig(over),
//   stepCharacter(body, {dx,dy,jumpPressed}, dt, scene, cfg). `scene` is anything with query(bounds)->colliders (collision2d createScene /
//   createTilemap / fromPlatformerWorld). Slopes, step-up, one-way tops (dy>0 + jumpPressed drops through), ground snap, events via cfg.emit.

import { aabb, obb, circle, capsule, polygon, bounds, collide, canCollide, createSpatialHash, raycast, containsPoint, surfaceY, boundsOverlap, shapeCast, translate } from './collision2d.js';

const sqrt = Math.sqrt;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

export const WORLD_DEFAULTS = Object.freeze({
  gravity: { x: 0, y: 600 }, velocityIterations: 10, slop: 0.25, baumgarte: 0.2, maxBias: 150, restitutionThreshold: 30,
  warmRadius: 4, cellSize: 64, sleep: true, ccd: true, timeToSleep: 0.5, linearSleep: 5, angularSleep: 0.1,
});

// ---- mass properties ----------------------------------------------------------------------------------------
function polyProps(pts) { // area, centroid, inertia about centroid (unit density)
  let a2 = 0, cx = 0, cy = 0, I = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], cr = p.x * q.y - q.x * p.y;
    a2 += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
    I += cr * (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y);
  }
  const area = a2 / 2, sgn = area < 0 ? -1 : 1, A = Math.abs(area);
  cx /= 6 * area; cy /= 6 * area;
  const Io = sgn * I / 12; // inertia about origin
  return { area: A, cx, cy, I: Io - A * (cx * cx + cy * cy) };
}
function massProps(sh, density) {
  if (sh.type === 'circle') { const m = density * Math.PI * sh.r * sh.r; return { m, I: 0.5 * m * sh.r * sh.r }; }
  if (sh.type === 'box') { const m = density * 4 * sh.hw * sh.hh; return { m, I: m * (4 * sh.hw * sh.hw + 4 * sh.hh * sh.hh) / 12 }; }
  if (sh.type === 'capsule') {
    const mr = density * 4 * sh.hl * sh.r, mc = density * Math.PI * sh.r * sh.r, d = 4 * sh.r / (3 * Math.PI), hm = mc / 2;
    const Ir = mr * (4 * sh.hl * sh.hl + 4 * sh.r * sh.r) / 12;
    const Ih = 0.5 * hm * sh.r * sh.r - hm * d * d + hm * (sh.hl + d) * (sh.hl + d);
    return { m: mr + mc, I: Ir + 2 * Ih };
  }
  const pp = polyProps(sh.points); return { m: density * pp.area, I: density * pp.I };
}
function placed(b) {
  const s = b.shape;
  if (s.type === 'circle') return circle(b.x, b.y, s.r);
  if (s.type === 'box') return b.angle === 0 ? aabb(b.x, b.y, s.hw, s.hh) : obb(b.x, b.y, s.hw, s.hh, b.angle);
  if (s.type === 'capsule') return capsule(b.x, b.y, s.hl, s.r, b.angle);
  return polygon(b.x, b.y, s.points, b.angle);
}
export const bodyShape = placed;

const pairKey = (a, b) => a + ':' + b;

// ---- world ----------------------------------------------------------------------------------------------------
export function createWorld(opts = {}) {
  const cfg = { ...WORLD_DEFAULTS, ...opts, gravity: { ...WORLD_DEFAULTS.gravity, ...(opts.gravity ?? {}) } };
  const onEvent = cfg.onEvent; delete cfg.onEvent;
  let st = { bodies: [], joints: [], contacts: [], sensors: [], nextId: 1, nextJoint: 1, nextIsland: 1, time: 0, steps: 0 };
  let byId = new Map();
  let events = [];
  const jointSkip = () => { const s = new Set(); for (const j of st.joints) if (!j.collideConnected) s.add(j.a < j.b ? pairKey(j.a, j.b) : pairKey(j.b, j.a)); return s; };
  const reindex = () => { byId = new Map(st.bodies.map((b) => [b.id, b])); };

  function wake(b) {
    if (!b.asleep) { b.sleepT = 0; return; }
    const isl = b.island;
    for (const o of st.bodies) if (o.asleep && (o === b || (isl !== null && o.island === isl))) { o.asleep = false; o.island = null; o.sleepT = 0; }
  }

  function addBody(def) {
    const sh = def.shape; if (!sh) throw new Error('physics2d: body needs a shape');
    const type = def.type ?? 'dynamic', density = def.density ?? 1;
    const shape = sh.type === 'polygon' ? { type: 'polygon', points: sh.points.map((p) => ({ x: p.x, y: p.y })) } : { ...sh };
    let x = def.x ?? 0, y = def.y ?? 0;
    if (shape.type === 'polygon') {
      const pp = polyProps(shape.points), c = Math.cos(def.angle ?? 0), s = Math.sin(def.angle ?? 0);
      x += pp.cx * c - pp.cy * s; y += pp.cx * s + pp.cy * c;
      shape.points = shape.points.map((p) => ({ x: p.x - pp.cx, y: p.y - pp.cy }));
    }
    let invMass = 0, invI = 0;
    if (type === 'dynamic') { const mp = massProps(shape, density); invMass = mp.m > 0 ? 1 / mp.m : 0; invI = def.fixedRotation || mp.I <= 0 ? 0 : 1 / mp.I; }
    const b = {
      id: st.nextId++, type, x, y, angle: def.angle ?? 0, vx: def.vx ?? 0, vy: def.vy ?? 0, w: def.w ?? 0, fx: 0, fy: 0, torque: 0,
      shape, density, friction: def.friction ?? 0.5, restitution: def.restitution ?? 0, layer: def.layer ?? 1, mask: def.mask ?? -1,
      sensor: !!def.sensor, linearDamping: def.linearDamping ?? 0, angularDamping: def.angularDamping ?? 0, gravityScale: def.gravityScale ?? 1,
      fixedRotation: !!def.fixedRotation, allowSleep: def.allowSleep ?? true, invMass, invI, asleep: false, sleepT: 0, island: null,
      userData: def.userData ?? null,
    };
    st.bodies.push(b); byId.set(b.id, b);
    return b.id;
  }
  function removeBody(id) {
    st.bodies = st.bodies.filter((b) => b.id !== id); st.joints = st.joints.filter((j) => j.a !== id && j.b !== id);
    st.contacts = st.contacts.filter((c) => c.a !== id && c.b !== id); reindex();
  }
  function addJoint(def) {
    const A = byId.get(def.a), B = byId.get(def.b); if (!A || !B) throw new Error('physics2d: joint needs two bodies');
    const lA = def.anchorA ?? { x: 0, y: 0 }, lB = def.anchorB ?? { x: 0, y: 0 };
    const j = { id: st.nextJoint++, type: def.type ?? 'distance', a: def.a, b: def.b, ax: lA.x, ay: lA.y, bx: lB.x, by: lB.y, length: def.length, stiffness: def.stiffness ?? (def.type === 'spring' ? 200 : 0), damping: def.damping ?? 0, collideConnected: !!def.collideConnected, j: 0, jx: 0, jy: 0 };
    if (j.type !== 'revolute' && j.length === undefined) { const [pax, pay] = anchor(A, j.ax, j.ay), [pbx, pby] = anchor(B, j.bx, j.by); j.length = sqrt((pbx - pax) ** 2 + (pby - pay) ** 2); }
    st.joints.push(j); wake(A); wake(B);
    return j.id;
  }
  function anchor(b, lx, ly) { const c = Math.cos(b.angle), s = Math.sin(b.angle); return [b.x + lx * c - ly * s, b.y + lx * s + ly * c]; }
  const applyP = (b, px, py, rx, ry, k) => { b.vx += px * b.invMass * k; b.vy += py * b.invMass * k; b.w += b.invI * cross(rx, ry, px, py) * k; };

  function step(dt) {
    events = [];
    const bodies = st.bodies, g = cfg.gravity;
    // 1. integrate velocities
    for (const b of bodies) {
      if (b.type !== 'dynamic' || b.asleep) { b.fx = b.fy = b.torque = 0; continue; }
      b.vx += (g.x * b.gravityScale + b.fx * b.invMass) * dt; b.vy += (g.y * b.gravityScale + b.fy * b.invMass) * dt; b.w += b.torque * b.invI * dt;
      b.vx /= 1 + dt * b.linearDamping; b.vy /= 1 + dt * b.linearDamping; b.w /= 1 + dt * b.angularDamping;
      b.fx = b.fy = b.torque = 0;
    }
    // 2. broadphase + narrowphase
    const hash = createSpatialHash(cfg.cellSize), margin = cfg.slop * 2;
    for (const b of bodies) { const bb = bounds(placed(b)); hash.insert(b.id, { minX: bb.minX - margin, minY: bb.minY - margin, maxX: bb.maxX + margin, maxY: bb.maxY + margin }, b); }
    const skip = jointSkip(), prev = new Map(st.contacts.map((c) => [c.key, c])), prevSensors = new Map(st.sensors.map((s) => [s.key, s]));
    const contacts = [], sensors = [];
    const awake = (o) => (o.type === 'dynamic' && !o.asleep) || (o.type === 'kinematic' && !settled(o));
    const settled = (b) => b.type === 'static' || b.asleep || (b.type === 'kinematic' && b.vx === 0 && b.vy === 0 && b.w === 0);
    for (const [ia, ib] of hash.pairs()) {
      const A = byId.get(ia), B = byId.get(ib), key = pairKey(ia, ib), sp = A.sensor || B.sensor;
      if (A.sensor && B.sensor) continue;
      if (sp ? (A.type === 'static' && B.type === 'static') : (A.type !== 'dynamic' && B.type !== 'dynamic')) continue;
      if (skip.has(key)) continue;
      if (!sp && settled(A) && settled(B)) { const p = prev.get(key); if (p) contacts.push({ ...p, carried: true }); continue; }
      const m = collide(placed(A), placed(B));
      if (!m) continue;
      if (sp) { sensors.push({ key, sensor: A.sensor ? ia : ib, other: A.sensor ? ib : ia }); continue; }
        if (A.asleep && awake(B)) wake(A);
      if (B.asleep && awake(A)) wake(B);
      const old = prev.get(key), pts = m.points.map((p) => {
        let jn = 0, jt = 0;
        if (old) { let bd = cfg.warmRadius * cfg.warmRadius; for (const q of old.points) { const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d2 < bd) { bd = d2; jn = q.jn; jt = q.jt; } } }
        return { x: p.x, y: p.y, depth: p.depth, jn, jt };
      });
      contacts.push({ key, a: ia, b: ib, nx: m.normal.x, ny: m.normal.y, friction: sqrt(A.friction * B.friction), restitution: Math.max(A.restitution, B.restitution), points: pts, carried: false });
    }
    // events
    const curC = new Set(contacts.map((c) => c.key)), prevC = new Set(st.contacts.map((c) => c.key));
    for (const c of contacts) if (!prevC.has(c.key)) events.push({ type: 'begin', a: c.a, b: c.b });
    for (const c of st.contacts) if (!curC.has(c.key)) events.push({ type: 'end', a: c.a, b: c.b });
    const curS = new Set(sensors.map((s) => s.key));
    for (const s of sensors) events.push({ type: prevSensors.has(s.key) ? 'stay' : 'enter', sensor: s.sensor, other: s.other });
    for (const s of st.sensors) if (!curS.has(s.key)) events.push({ type: 'exit', sensor: s.sensor, other: s.other });

    // 3. pre-solve
    const solve = contacts.filter((c) => !c.carried);
    for (const c of solve) {
      const A = byId.get(c.a), B = byId.get(c.b), tx = c.ny, ty = -c.nx;
      for (const p of c.points) {
        p.rax = p.x - A.x; p.ray = p.y - A.y; p.rbx = p.x - B.x; p.rby = p.y - B.y;
        const rnA = cross(p.rax, p.ray, c.nx, c.ny), rnB = cross(p.rbx, p.rby, c.nx, c.ny), rtA = cross(p.rax, p.ray, tx, ty), rtB = cross(p.rbx, p.rby, tx, ty);
        const kN = A.invMass + B.invMass + A.invI * rnA * rnA + B.invI * rnB * rnB, kT = A.invMass + B.invMass + A.invI * rtA * rtA + B.invI * rtB * rtB;
        p.massN = kN > 0 ? 1 / kN : 0; p.massT = kT > 0 ? 1 / kT : 0;
        const dvx = (B.vx - B.w * p.rby) - (A.vx - A.w * p.ray), dvy = (B.vy + B.w * p.rbx) - (A.vy + A.w * p.rax), vn = dvx * c.nx + dvy * c.ny;
        const biasR = vn < -cfg.restitutionThreshold ? -c.restitution * vn : 0;
        const biasP = Math.min(cfg.maxBias, Math.max(0, p.depth - cfg.slop) * cfg.baumgarte / dt);
        p.bias = Math.max(biasR, biasP);
        const px = p.jn * c.nx + p.jt * tx, py = p.jn * c.ny + p.jt * ty;
        applyP(A, px, py, p.rax, p.ray, -1); applyP(B, px, py, p.rbx, p.rby, 1);
      }
    }
    for (const j of st.joints) { const A = byId.get(j.a), B = byId.get(j.b); if (A.asleep && awake(B)) wake(A); if (B.asleep && awake(A)) wake(B); }
    const jlive = st.joints.filter((j) => !(settled(byId.get(j.a)) && settled(byId.get(j.b))));
    for (const j of jlive) prestepJoint(j, dt);

    // 4. velocity iterations
    for (let it = 0; it < cfg.velocityIterations; it++) {
      for (const j of jlive) solveJoint(j);
      for (const c of solve) {
        const A = byId.get(c.a), B = byId.get(c.b), tx = c.ny, ty = -c.nx;
        for (const p of c.points) {
          const dvx = (B.vx - B.w * p.rby) - (A.vx - A.w * p.ray), dvy = (B.vy + B.w * p.rbx) - (A.vy + A.w * p.rax);
          const lam = -p.massT * (dvx * tx + dvy * ty), maxF = c.friction * p.jn, nj = Math.min(maxF, Math.max(-maxF, p.jt + lam)), d = nj - p.jt; p.jt = nj;
          applyP(A, tx * d, ty * d, p.rax, p.ray, -1); applyP(B, tx * d, ty * d, p.rbx, p.rby, 1);
        }
        for (const p of c.points) {
          const dvx = (B.vx - B.w * p.rby) - (A.vx - A.w * p.ray), dvy = (B.vy + B.w * p.rbx) - (A.vy + A.w * p.rax);
          const lam = -p.massN * (dvx * c.nx + dvy * c.ny - p.bias), nj = Math.max(p.jn + lam, 0), d = nj - p.jn; p.jn = nj;
          applyP(A, c.nx * d, c.ny * d, p.rax, p.ray, -1); applyP(B, c.nx * d, c.ny * d, p.rbx, p.rby, 1);
        }
      }
    }
    // 5. integrate positions
    for (const b of bodies) {
      if (b.type === 'static' || b.asleep) continue;
      let mx = b.vx * dt, my = b.vy * dt;
      if (b.type === 'dynamic' && !b.sensor && cfg.ccd) {
        const t = ccdFraction(b, mx, my, bodies);
        if (t < 1) { mx *= t; my *= t; }
      }
      b.x += mx; b.y += my; b.angle += b.w * dt;
    }
    // 6. sleeping (islands over dynamic-dynamic contacts and joints)
    if (cfg.sleep) {
      const live = bodies.filter((b) => b.type === 'dynamic' && !b.asleep), idx = new Map(live.map((b, i) => [b.id, i])), par = live.map((_, i) => i);
      const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      const uni = (a, b) => { const x = idx.get(a), y = idx.get(b); if (x === undefined || y === undefined) return; const rx = find(x), ry = find(y); if (rx !== ry) par[Math.max(rx, ry)] = Math.min(rx, ry); };
      for (const c of solve) uni(c.a, c.b);
      for (const j of jlive) uni(j.a, j.b);
      const minT = new Map();
      live.forEach((b, i) => {
        const still = b.allowSleep && b.vx * b.vx + b.vy * b.vy < cfg.linearSleep * cfg.linearSleep && b.w * b.w < cfg.angularSleep * cfg.angularSleep;
        b.sleepT = still ? b.sleepT + dt : 0;
        const r = find(i); minT.set(r, Math.min(minT.get(r) ?? Infinity, b.sleepT));
      });
      const isl = new Map();
      live.forEach((b, i) => {
        const r = find(i);
        if (minT.get(r) >= cfg.timeToSleep) { if (!isl.has(r)) isl.set(r, st.nextIsland++); b.asleep = true; b.island = isl.get(r); b.vx = b.vy = b.w = 0; }
      });
    }
    st.contacts = contacts.map((c) => ({ key: c.key, a: c.a, b: c.b, nx: c.nx, ny: c.ny, friction: c.friction, restitution: c.restitution, points: c.points.map((p) => ({ x: p.x, y: p.y, depth: p.depth, jn: p.jn, jt: p.jt })) }));
    st.sensors = sensors; st.time += dt; st.steps++;
    if (onEvent) for (const e of events) onEvent(e);
  }

  // Continuous collision for fast dynamic bodies against static solids: returns the fraction of the displacement that is safe and
  // bounces/stops the velocity on impact so the body can never tunnel through thin static geometry.
  function ccdFraction(b, mx, my, bodies) {
    const sh = placed(b), bb = bounds(sh), minDim = Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2, d = sqrt(mx * mx + my * my);
    if (d <= minDim * 0.5) return 1;
    let best = null;
    for (const o of bodies) {
      if (o.type !== 'static' || o.sensor || !canCollide(b, o)) continue;
      const ob = bounds(placed(o));
      if (!boundsOverlap({ minX: bb.minX + Math.min(0, mx), minY: bb.minY + Math.min(0, my), maxX: bb.maxX + Math.max(0, mx), maxY: bb.maxY + Math.max(0, my) }, ob)) continue;
      const h = shapeCast(sh, mx, my, placed(o));
      if (h && !h.overlap && h.t < (best ? best.t : 1)) best = { ...h, o };
    }
    if (!best) return 1;
    const vn = b.vx * best.normal.x + b.vy * best.normal.y;
    if (vn < 0) { const e = Math.max(b.restitution, best.o.restitution) * (-vn > cfg.restitutionThreshold ? 1 : 0); b.vx -= (1 + e) * vn * best.normal.x; b.vy -= (1 + e) * vn * best.normal.y; }
    return best.t * (1 - 1e-6);
  }

  // ---- joints --------------------------------------------------------------------------------------------------
  function prestepJoint(j, dt) {
    const A = byId.get(j.a), B = byId.get(j.b), ca = Math.cos(A.angle), sa = Math.sin(A.angle), cb = Math.cos(B.angle), sb = Math.sin(B.angle);
    j.rax = j.ax * ca - j.ay * sa; j.ray = j.ax * sa + j.ay * ca; j.rbx = j.bx * cb - j.by * sb; j.rby = j.bx * sb + j.by * cb;
    const dx = B.x + j.rbx - A.x - j.rax, dy = B.y + j.rby - A.y - j.ray;
    if (j.type === 'revolute') {
      const iA = A.invI, iB = B.invI, mm = A.invMass + B.invMass;
      const k11 = mm + iA * j.ray * j.ray + iB * j.rby * j.rby, k12 = -iA * j.rax * j.ray - iB * j.rbx * j.rby, k22 = mm + iA * j.rax * j.rax + iB * j.rbx * j.rbx;
      const det = k11 * k22 - k12 * k12, id = det !== 0 ? 1 / det : 0;
      j.m11 = k22 * id; j.m12 = -k12 * id; j.m22 = k11 * id;
      j.bx_ = dx * cfg.baumgarte / dt; j.by_ = dy * cfg.baumgarte / dt;
      applyP(A, j.jx, j.jy, j.rax, j.ray, -1); applyP(B, j.jx, j.jy, j.rbx, j.rby, 1);
      return;
    }
    const l = sqrt(dx * dx + dy * dy); j.ux = l > 0 ? dx / l : 1; j.uy = l > 0 ? dy / l : 0;
    const C = l - j.length, crA = cross(j.rax, j.ray, j.ux, j.uy), crB = cross(j.rbx, j.rby, j.ux, j.uy);
    const k = A.invMass + B.invMass + A.invI * crA * crA + B.invI * crB * crB;
    if (j.stiffness > 0) { j.gamma = 1 / (dt * (j.damping + dt * j.stiffness)); j.bias = C * dt * j.stiffness * j.gamma; } else { j.gamma = 0; j.bias = C * cfg.baumgarte / dt; }
    j.mass = k + j.gamma > 0 ? 1 / (k + j.gamma) : 0;
    applyP(A, j.ux * j.j, j.uy * j.j, j.rax, j.ray, -1); applyP(B, j.ux * j.j, j.uy * j.j, j.rbx, j.rby, 1);
  }
  function solveJoint(j) {
    const A = byId.get(j.a), B = byId.get(j.b);
    const cx = (B.vx - B.w * j.rby) - (A.vx - A.w * j.ray), cy = (B.vy + B.w * j.rbx) - (A.vy + A.w * j.rax);
    if (j.type === 'revolute') {
      const rx = -(cx + j.bx_), ry = -(cy + j.by_), ix = j.m11 * rx + j.m12 * ry, iy = j.m12 * rx + j.m22 * ry;
      j.jx += ix; j.jy += iy; applyP(A, ix, iy, j.rax, j.ray, -1); applyP(B, ix, iy, j.rbx, j.rby, 1);
      return;
    }
    const imp = -j.mass * (cx * j.ux + cy * j.uy + j.bias + j.gamma * j.j); j.j += imp;
    applyP(A, j.ux * imp, j.uy * imp, j.rax, j.ray, -1); applyP(B, j.ux * imp, j.uy * imp, j.rbx, j.rby, 1);
  }

  // ---- control + queries ---------------------------------------------------------------------------------------
  const need = (id) => { const b = byId.get(id); if (!b) throw new Error('physics2d: no body ' + id); return b; };
  const api = {
    config: cfg,
    addBody, removeBody, addJoint,
    removeJoint(id) { st.joints = st.joints.filter((j) => j.id !== id); },
    body: (id) => byId.get(id) ?? null,
    get bodies() { return st.bodies; }, get joints() { return st.joints; }, get contacts() { return st.contacts; },
    get events() { return events; }, get time() { return st.time; }, get steps() { return st.steps; },
    step,
    wake: (id) => wake(need(id)),
    setVelocity(id, vx, vy, w) { const b = need(id); wake(b); b.vx = vx; b.vy = vy; if (w !== undefined) b.w = w; },
    setPosition(id, x, y, angle) { const b = need(id); wake(b); b.x = x; b.y = y; if (angle !== undefined) b.angle = angle; },
    applyForce(id, fx, fy) { const b = need(id); wake(b); b.fx += fx; b.fy += fy; },
    applyTorque(id, t) { const b = need(id); wake(b); b.torque += t; },
    applyImpulse(id, ix, iy, px, py) { const b = need(id); wake(b); b.vx += ix * b.invMass; b.vy += iy * b.invMass; if (px !== undefined) b.w += b.invI * cross(px - b.x, py - b.y, ix, iy); },
    kinematicStep(id, vx, vy, w = 0) { const b = need(id); b.vx = vx; b.vy = vy; b.w = w; },
    /** kinetic + gravitational potential energy of all dynamic bodies (for conservation checks). */
    energy() {
      let e = 0;
      for (const b of st.bodies) if (b.type === 'dynamic' && b.invMass > 0) { const m = 1 / b.invMass; e += 0.5 * m * (b.vx * b.vx + b.vy * b.vy) + (b.invI > 0 ? 0.5 * (1 / b.invI) * b.w * b.w : 0) - m * (cfg.gravity.x * b.x + cfg.gravity.y * b.y) * b.gravityScale; }
      return e;
    },
    /** Nearest ray hit among non-sensor bodies (or sensors with includeSensors): {body,t,x,y,normal} (ties: lowest id). */
    raycast(ox, oy, dx, dy, maxT = 1, o = {}) {
      let best = null;
      for (const b of st.bodies) {
        if ((b.sensor && !o.includeSensors) || !canCollide(b, { layer: o.layer, mask: o.mask })) continue;
        const h = raycast(placed(b), ox, oy, dx, dy, maxT);
        if (h && (!best || h.t < best.t)) best = { body: b.id, ...h };
      }
      return best;
    },
    queryAABB(bb) { return st.bodies.filter((b) => boundsOverlap(bounds(placed(b)), bb)).map((b) => b.id); },
    queryPoint(x, y) { return st.bodies.filter((b) => containsPoint(placed(b), x, y)).map((b) => b.id); },
    snapshot() { return structuredClone({ st, cfg: { ...cfg } }); },
    restore(snap) {
      const c = structuredClone(snap); st = c.st; Object.assign(cfg, c.cfg); reindex(); events = [];
    },
  };
  return api;
}

// ---- kinematic character controller -----------------------------------------------------------------------------
export const CHAR_DEFAULTS = Object.freeze({
  gravity: 520, jumpV: 200, runSpeed: 60, airSpeed: 60, airAccel: 160, hitW: 8, hitH: 16, stepHeight: 4, snapDist: 4, maxFall: 1000, dropTime: 0.25,
});
export const makeCharConfig = (over = {}) => ({ ...CHAR_DEFAULTS, ...over });
/** Feet-anchored character state (same fields platformer-physics uses, plus ground/dropT). */
export const makeCharacter = (x = 0, y = 0) => ({ x, y, vx: 0, vy: 0, face: 1, mode: 'ground', layer: 0, onPlatform: null, landed: true, t: 0, dropT: 0, ground: null });

const openOv = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

function findSupport(cs, b, hw, maxDrop) { // highest floor s with y-eps <= s <= y+maxDrop under the box
  let best = Infinity, bc = null;
  for (const c of cs) {
    if (c.kind === 'oneway' && b.dropT > 0) continue;
    let s;
    if (c.kind === 'slope') { if (b.x < c.minX || b.x > c.maxX) continue; s = surfaceY(c, b.x); } else { if (!openOv(b.x - hw, b.x + hw, c.minX, c.maxX)) continue; s = c.minY; }
    if (s >= b.y - 1e-6 && s <= b.y + maxDrop + 1e-9 && s < best) { best = s; bc = c; }
  }
  return bc ? { s: best, c: bc } : null;
}

function moveCharacter(b, dx, dy, world, cfg, wasGround) {
  const hw = cfg.hitW / 2, hh = cfg.hitH;
  let landed = false, ground = null;
  const q = (m) => world.query({ minX: b.x - hw - m, maxX: b.x + hw + m, minY: b.y - hh - m, maxY: b.y + m });
  const nx = Math.min(256, Math.max(1, Math.ceil(Math.abs(dx) / hw))), sx = dx / nx;
  for (let i = 0; i < nx && dx !== 0; i++) {
    b.x += sx;
    const cs = q(Math.abs(sx) + cfg.stepHeight);
    for (const c of cs) {
      if (c.kind !== 'solid' || !openOv(b.x - hw, b.x + hw, c.minX, c.maxX) || !openOv(b.y - hh, b.y, c.minY, c.maxY)) continue;
      const rise = b.y - c.minY;
      if ((wasGround || landed) && rise > 0 && rise <= cfg.stepHeight && !cs.some((o) => o.kind === 'solid' && openOv(b.x - hw, b.x + hw, o.minX, o.maxX) && openOv(b.y - rise - hh, b.y - rise, o.minY, o.maxY))) b.y -= rise;
      else { b.x = sx > 0 ? c.minX - hw : c.maxX + hw; b.vx = 0; }
    }
    for (const c of cs) {
      if (c.kind !== 'slope' || b.x < c.minX || b.x > c.maxX) continue;
      const s = surfaceY(c, b.x);
      if (!(b.y > s && b.y - hh < c.maxY)) continue;
      const grad = Math.abs(c.slope.y1 - c.slope.y0) / (c.slope.x1 - c.slope.x0);
      if (b.y - s <= Math.abs(sx) * grad + 1e-4) { b.y = s; landed = true; ground = c; }
      else { b.x = sx > 0 ? c.minX - hw : c.maxX + hw; b.vx = 0; }
    }
  }
  // vertical: swept ceilings and floors
  const prevY = b.y, cs = q(Math.abs(dy) + cfg.snapDist + 1);
  if (dy < 0) {
    let cl = -Infinity;
    for (const c of cs) {
      if (c.kind === 'oneway') continue;
      const inx = c.kind === 'slope' ? b.x >= c.minX && b.x <= c.maxX : openOv(b.x - hw, b.x + hw, c.minX, c.maxX);
      if (inx && prevY - hh >= c.maxY - 1e-6 && prevY + dy - hh < c.maxY && c.maxY > cl) cl = c.maxY;
    }
    if (cl > -Infinity) { b.y = cl + hh; b.vy = 0; } else b.y = prevY + dy;
    landed = false; ground = null; // rising: a slope lift this tick does not count as standing
  } else {
    const f = findSupport(cs, b, hw, dy);
    if (f) { b.y = f.s; landed = true; ground = f.c; } else b.y = prevY + dy;
  }
  if (!landed && wasGround && b.vy >= 0) {
    const f = findSupport(q(cfg.snapDist + 1), b, hw, cfg.snapDist);
    if (f) { b.y = f.s; landed = true; ground = f.c; }
  }
  b.landed = landed; b.ground = ground;
  b.onPlatform = ground && ground.kind === 'oneway' ? (ground.id ?? ground) : null;
  if (landed) { b.vy = 0; b.mode = 'ground'; } else b.mode = 'air';
}

/** Advance one character one fixed tick. input = {dx:-1|0|1, dy:-1|0|1 (up negative), jumpPressed}. Returns the body. */
export function stepCharacter(b, input, dt, world, cfg = CHAR_DEFAULTS) {
  const emit = (n, extra) => cfg.emit && cfg.emit(n, b, extra);
  b.t += dt; if (b.dropT > 0) b.dropT -= dt;
  const dx = input.dx | 0, dy = input.dy | 0;
  let wasGround = b.mode === 'ground';
  if (dx) b.face = dx;
  if (wasGround) {
    if (input.jumpPressed && dy > 0 && b.ground && b.ground.kind === 'oneway') { b.dropT = cfg.dropTime; b.vy = 0; b.vx = dx * cfg.runSpeed; wasGround = false; }
    else if (input.jumpPressed) { b.vy = -cfg.jumpV; b.vx = dx * cfg.airSpeed; b.mode = 'air'; b.landed = false; b.ground = null; b.onPlatform = null; emit('jump'); return b; } // like platformer-physics: the jump frame does not move
    else { b.vx = dx * cfg.runSpeed; b.vy = 0; }
  }
  if (!wasGround) {
    if (dx) { const target = dx * cfg.airSpeed, a = cfg.airAccel * dt; b.vx = b.vx < target ? Math.min(target, b.vx + a) : Math.max(target, b.vx - a); }
    b.vy = Math.min(cfg.maxFall, b.vy + cfg.gravity * dt);
  }
  const impact = b.vy, was = b.mode;
  moveCharacter(b, b.vx * dt, b.vy * dt, world, cfg, wasGround);
  if (b.mode === 'ground' && (was === 'air' || !wasGround) ) { if (impact > 140) emit('hardland'); emit('land', b.ground); }
  return b;
}
