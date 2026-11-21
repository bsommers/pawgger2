// collision2d: general 2D collision toolkit (zero deps, Node-safe, deterministic: no Date/Math.random, stable iteration order).
// Coordinates: x right, y DOWN. Angles in radians (rotation is the usual x'=x*cos-y*sin, y'=x*sin+y*cos). Time-free; pure functions on plain data.
//
// Shapes (plain data, position = centre):
//   {type:'aabb',    x,y,hw,hh}                       axis-aligned box, half extents
//   {type:'circle',  x,y,r}
//   {type:'obb',     x,y,hw,hh,angle}                 rotated box
//   {type:'polygon', x,y,angle,points:[{x,y}...]}     convex, local points (any winding; normalised internally)
//   {type:'capsule', x,y,hl,r,angle}                  segment of half length hl along local x, swept by radius r
// Everything is reduced to a "hull" {v:[pts], r}: circle = 1 vertex + r, capsule = 2 vertices + r, polygon = n vertices, r 0.
//
// Manifold (collide(a,b)): null or {normal:{x,y}, depth, points:[{x,y,depth}]}. normal is a unit vector pointing from a TOWARD b;
// moving b by +normal*depth (or a by -normal*depth) separates them. points has 1 or 2 world contact points (midway between the
// two surfaces), each with its own penetration depth. Touching with zero depth is not a collision. aabb-vs-aabb is exact and
// returns two points along the contact face. Disjoint-hull cases use closest features, overlapping hulls use SAT (+ clipping).
// Ties are broken deterministically (shape a's faces first, first index wins).
//
// Queries return unit "surface normals facing the ray origin / mover": raycast -> {t,x,y,normal,inside}; p = o + d*t, t in [0,maxT].
// A ray that starts inside a shape returns t 0, inside:true and normal = -dir. sweptAABB / shapeCast -> {t,normal,x,y} for t in [0,1]
// of the displacement; t 0 + overlap:true when already overlapping. shapeCast is exact conservative advancement (hit tolerance 1e-9).
//
// Colliders (static world geometry for the tilemap / scene / character controller):
//   {kind:'solid'|'oneway'|'slope', minX,minY,maxX,maxY, slope?:{x0,y0,x1,y1}, layer?, mask?, col?, row?}
//   oneway: only the top (minY) is solid, from above. slope: floor line from (x0,y0) to (x1,y1) with x0<x1, solid below it down to maxY.
// Tilemap: createTilemap({cols,rows,tileSize,tiles,x?,y?,outside?,oneWayThickness?}); tile kinds in TILE (SLOPES gives left/right
// surface height as a fraction of the tile height).

const sqrt = Math.sqrt;
const len = (x, y) => sqrt(x * x + y * y);
const EPS = 1e-9;

export const TILE = Object.freeze({ EMPTY: 0, SOLID: 1, ONEWAY: 2, SLOPE_R: 3, SLOPE_L: 4, SLOPE_R_LO: 5, SLOPE_R_HI: 6, SLOPE_L_HI: 7, SLOPE_L_LO: 8 });
// kind -> [left, right] floor height as a fraction of the tile height (0 = tile bottom, 1 = tile top)
export const SLOPES = Object.freeze({ 3: [0, 1], 4: [1, 0], 5: [0, 0.5], 6: [0.5, 1], 7: [1, 0.5], 8: [0.5, 0] });

// ---- shape factories ----------------------------------------------------------------------------------------
export const aabb = (x, y, hw, hh) => ({ type: 'aabb', x, y, hw, hh });
export const circle = (x, y, r) => ({ type: 'circle', x, y, r });
export const obb = (x, y, hw, hh, angle = 0) => ({ type: 'obb', x, y, hw, hh, angle });
export const polygon = (x, y, points, angle = 0) => ({ type: 'polygon', x, y, angle, points });
export const capsule = (x, y, hl, r, angle = 0) => ({ type: 'capsule', x, y, hl, r, angle });
export const aabbFromBounds = (b) => aabb((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2);
export const translate = (s, dx, dy) => ({ ...s, x: s.x + dx, y: s.y + dy });

const area2 = (v) => { let s = 0; for (let i = 0; i < v.length; i++) { const p = v[i], q = v[(i + 1) % v.length]; s += p.x * q.y - q.x * p.y; } return s; };

/** Reduce a shape to {v:[{x,y}], r} (world space; polygons get positive winding so outward normal of edge e is (ey,-ex)). */
export function hull(s) {
  switch (s.type) {
    case 'circle': return { v: [{ x: s.x, y: s.y }], r: s.r };
    case 'aabb': return { v: [{ x: s.x - s.hw, y: s.y - s.hh }, { x: s.x + s.hw, y: s.y - s.hh }, { x: s.x + s.hw, y: s.y + s.hh }, { x: s.x - s.hw, y: s.y + s.hh }], r: 0 };
    case 'obb': case 'polygon': {
      const a = s.angle || 0, c = Math.cos(a), sn = Math.sin(a);
      const pts = s.type === 'obb' ? [{ x: -s.hw, y: -s.hh }, { x: s.hw, y: -s.hh }, { x: s.hw, y: s.hh }, { x: -s.hw, y: s.hh }] : s.points;
      const v = pts.map((p) => ({ x: s.x + p.x * c - p.y * sn, y: s.y + p.x * sn + p.y * c }));
      if (area2(v) < 0) v.reverse();
      return { v, r: 0 };
    }
    case 'capsule': {
      const a = s.angle || 0, c = Math.cos(a), sn = Math.sin(a);
      return { v: [{ x: s.x - s.hl * c, y: s.y - s.hl * sn }, { x: s.x + s.hl * c, y: s.y + s.hl * sn }], r: s.r };
    }
    default: throw new Error('collision2d: unknown shape type ' + s.type);
  }
}

/** World bounds {minX,minY,maxX,maxY} of a shape. */
export function bounds(s) {
  if (s.type === 'aabb') return { minX: s.x - s.hw, minY: s.y - s.hh, maxX: s.x + s.hw, maxY: s.y + s.hh };
  if (s.type === 'circle') return { minX: s.x - s.r, minY: s.y - s.r, maxX: s.x + s.r, maxY: s.y + s.r };
  const h = hull(s); let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of h.v) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  return { minX: minX - h.r, minY: minY - h.r, maxX: maxX + h.r, maxY: maxY + h.r };
}
export const boundsOverlap = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
/** Layer/mask filter: each side's layer bit must be in the other's mask. Defaults: layer 1, mask all bits. */
export const canCollide = (a, b) => (((a.layer ?? 1) & (b.mask ?? -1)) !== 0) && (((b.layer ?? 1) & (a.mask ?? -1)) !== 0);

// ---- hull helpers -------------------------------------------------------------------------------------------
function faces(h) {
  const v = h.v, n = v.length, out = [];
  if (n < 2) return out;
  for (let i = 0; i < n; i++) {
    const p = v[i], q = v[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, l = len(ex, ey);
    if (l === 0) continue;
    out.push({ i, p, nx: ey / l, ny: -ex / l });
  }
  if (n === 2) { // a segment also needs its end-cap axes
    const a = v[0], b = v[1], ex = b.x - a.x, ey = b.y - a.y, l = len(ex, ey);
    if (l > 0) { out.push({ i: -1, p: b, nx: ex / l, ny: ey / l }); out.push({ i: -1, p: a, nx: -ex / l, ny: -ey / l }); }
  }
  return out;
}
const minDot = (h, f) => { let m = Infinity; for (const p of h.v) { const d = (p.x - f.p.x) * f.nx + (p.y - f.p.y) * f.ny; if (d < m) m = d; } return m; };

function separation(A, B) {
  let best = -Infinity, bf = null, fromA = true;
  for (const f of faces(A)) { const s = minDot(B, f); if (s > best) { best = s; bf = f; fromA = true; } }
  for (const f of faces(B)) { const s = minDot(A, f); if (s > best + EPS) { best = s; bf = f; fromA = false; } }
  return { best, f: bf, fromA };
}

function segClosest(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + ex * t, y: ay + ey * t };
}
function edgesOf(h) {
  const v = h.v, n = v.length;
  if (n === 1) return [[v[0], v[0]]];
  if (n === 2) return [[v[0], v[1]]];
  const out = []; for (let i = 0; i < n; i++) out.push([v[i], v[(i + 1) % n]]); return out;
}
/** Closest points between two DISJOINT hulls (brute force vertex-vs-edge, first minimum wins). */
function closestPair(A, B) {
  let best = Infinity, pA = null, pB = null;
  const ea = edgesOf(A), eb = edgesOf(B);
  for (const v of A.v) for (const [p, q] of eb) { const c = segClosest(v.x, v.y, p.x, p.y, q.x, q.y), dx = c.x - v.x, dy = c.y - v.y, d2 = dx * dx + dy * dy; if (d2 < best) { best = d2; pA = v; pB = c; } }
  for (const w of B.v) for (const [p, q] of ea) { const c = segClosest(w.x, w.y, p.x, p.y, q.x, q.y), dx = w.x - c.x, dy = w.y - c.y, d2 = dx * dx + dy * dy; if (d2 < best) { best = d2; pA = c; pB = w; } }
  const dist = sqrt(best);
  const n = dist > 0 ? { x: (pB.x - pA.x) / dist, y: (pB.y - pA.y) / dist } : { x: 1, y: 0 };
  return { dist, pA, pB, n };
}

function clipLine(p0, p1, nx, ny, off) { // keep dot(p,n) <= off
  const d0 = p0.x * nx + p0.y * ny - off, d1 = p1.x * nx + p1.y * ny - off, out = [];
  if (d0 <= 0) out.push(p0);
  if (d1 <= 0) out.push(p1);
  if (d0 * d1 < 0) { const t = d0 / (d0 - d1); out.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }); }
  return out;
}
function clipManifoldPoints(A, B, fromA, f) {
  const ref = fromA ? A : B, inc = fromA ? B : A, n = inc.v.length, m = ref.v.length;
  const v1 = ref.v[f.i], v2 = ref.v[(f.i + 1) % m];
  let bi = 0, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const p = inc.v[i], q = inc.v[(i + 1) % n], ex = q.x - p.x, ey = q.y - p.y, l = len(ex, ey);
    if (l === 0) continue;
    const d = (ey / l) * f.nx + (-ex / l) * f.ny;
    if (d < bd) { bd = d; bi = i; }
  }
  const p0 = inc.v[bi], p1 = inc.v[(bi + 1) % n];
  let tx = v2.x - v1.x, ty = v2.y - v1.y; const tl = len(tx, ty); tx /= tl; ty /= tl;
  const c1 = clipLine(p0, p1, -tx, -ty, -(v1.x * tx + v1.y * ty)); if (c1.length < 2) return null;
  const c2 = clipLine(c1[0], c1[1], tx, ty, v2.x * tx + v2.y * ty); if (c2.length < 2) return null;
  const pts = [];
  for (const p of c2) {
    const sep = (p.x - v1.x) * f.nx + (p.y - v1.y) * f.ny;
    if (sep <= EPS) pts.push({ x: p.x - f.nx * sep / 2, y: p.y - f.ny * sep / 2, depth: Math.max(0, -sep) });
  }
  return pts.length ? pts : null;
}

function collideAABB(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, ox = a.hw + b.hw - Math.abs(dx), oy = a.hh + b.hh - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return null;
  const x0 = Math.max(a.x - a.hw, b.x - b.hw), x1 = Math.min(a.x + a.hw, b.x + b.hw);
  const y0 = Math.max(a.y - a.hh, b.y - b.hh), y1 = Math.min(a.y + a.hh, b.y + b.hh);
  if (ox < oy) {
    const xm = (x0 + x1) / 2;
    return { normal: { x: dx < 0 ? -1 : 1, y: 0 }, depth: ox, points: [{ x: xm, y: y0, depth: ox }, { x: xm, y: y1, depth: ox }] };
  }
  const ym = (y0 + y1) / 2;
  return { normal: { x: 0, y: dy < 0 ? -1 : 1 }, depth: oy, points: [{ x: x0, y: ym, depth: oy }, { x: x1, y: ym, depth: oy }] };
}

function collideHulls(A, B) {
  const rr = A.r + B.r, { best, f, fromA } = separation(A, B);
  if (f === null || best > 0) {
    if (rr === 0 && f !== null) return null;
    const cp = closestPair(A, B);
    const depth = rr - cp.dist;
    if (depth <= 0) return null;
    const sax = cp.pA.x + cp.n.x * A.r, say = cp.pA.y + cp.n.y * A.r, sbx = cp.pB.x - cp.n.x * B.r, sby = cp.pB.y - cp.n.y * B.r;
    let pts = [{ x: (sax + sbx) / 2, y: (say + sby) / 2, depth }];
    const n = cp.n; // a segment (capsule) lying flat on a face: report both end vertices so resting contact is stable
    if (B.v.length === 2 || A.v.length === 2) {
      const segB = B.v.length === 2, two = [];
      for (const v of segB ? B.v : A.v) {
        const s = segB ? (v.x - cp.pA.x) * n.x + (v.y - cp.pA.y) * n.y : (cp.pB.x - v.x) * n.x + (cp.pB.y - v.y) * n.y, d = rr - s;
        if (d > 0) two.push(segB ? { x: v.x - n.x * B.r + n.x * d / 2, y: v.y - n.y * B.r + n.y * d / 2, depth: d } : { x: v.x + n.x * A.r - n.x * d / 2, y: v.y + n.y * A.r - n.y * d / 2, depth: d });
      }
      if (two.length === 2) pts = two;
    }
    return { normal: n, depth, points: pts };
  }
  const depth = rr - best;
  if (depth <= 0) return null;
  const n = fromA ? { x: f.nx, y: f.ny } : { x: -f.nx, y: -f.ny };
  let pts = null;
  if (rr === 0 && A.v.length >= 3 && B.v.length >= 3) pts = clipManifoldPoints(A, B, fromA, f);
  if (!pts) { // rounded or mixed hulls: the (up to two) vertices of the other hull that penetrate the reference face
    const other = fromA ? B : A, cand = [];
    other.v.forEach((v, k) => cand.push({ k, v, s: (v.x - f.p.x) * f.nx + (v.y - f.p.y) * f.ny }));
    cand.sort((p, q) => p.s - q.s || p.k - q.k);
    pts = [];
    for (const c of cand.slice(0, 2)) {
      const d = rr - c.s;
      if (d <= 0 && pts.length) break;
      const dd = Math.max(d, 0);
      pts.push(fromA ? { x: c.v.x - n.x * B.r + n.x * dd / 2, y: c.v.y - n.y * B.r + n.y * dd / 2, depth: dd } : { x: c.v.x + n.x * A.r - n.x * dd / 2, y: c.v.y + n.y * A.r - n.y * dd / 2, depth: dd });
    }
  }
  return { normal: n, depth, points: pts };
}

/** Contact manifold between two shapes, or null. See header for the data shape. */
export function collide(a, b) {
  if (a.type === 'aabb' && b.type === 'aabb') return collideAABB(a, b);
  return collideHulls(hull(a), hull(b));
}
export const overlaps = (a, b) => collide(a, b) !== null;
/** Indices of the shapes in `list` overlapping `shape` (ascending). */
export function overlapAll(shape, list) { const out = []; for (let i = 0; i < list.length; i++) if (collide(shape, list[i])) out.push(i); return out; }

/** Distance between two shapes: {distance, normal (a->b), pointA, pointB, overlap}; distance 0 + overlap:true when they intersect. */
export function distance(a, b) {
  const A = hull(a), B = hull(b), { best, f, fromA } = separation(A, B);
  if (f !== null && best <= 0) return { distance: 0, overlap: true, normal: fromA ? { x: f.nx, y: f.ny } : { x: -f.nx, y: -f.ny }, pointA: null, pointB: null };
  const cp = closestPair(A, B), d = cp.dist - A.r - B.r;
  if (d <= 0) return { distance: 0, overlap: true, normal: cp.n, pointA: null, pointB: null };
  return { distance: d, overlap: false, normal: cp.n, pointA: { x: cp.pA.x + cp.n.x * A.r, y: cp.pA.y + cp.n.y * A.r }, pointB: { x: cp.pB.x - cp.n.x * B.r, y: cp.pB.y - cp.n.y * B.r } };
}

// ---- point / ray / segment / shape casts --------------------------------------------------------------------
export function containsPoint(s, px, py) {
  const h = hull(s);
  if (h.v.length < 3) {
    const [p, q] = edgesOf(h)[0], c = segClosest(px, py, p.x, p.y, q.x, q.y), dx = px - c.x, dy = py - c.y;
    return dx * dx + dy * dy <= h.r * h.r;
  }
  for (const f of faces(h)) if ((px - f.p.x) * f.nx + (py - f.p.y) * f.ny > 0) return false;
  return true;
}

function rayCircle(cx, cy, r, ox, oy, dx, dy, maxT) {
  const fx = ox - cx, fy = oy - cy, a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (a === 0) return null;
  if (c <= 0) { const l = sqrt(a); return { t: 0, x: ox, y: oy, normal: { x: -dx / l, y: -dy / l }, inside: true }; }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const x = ox + dx * t, y = oy + dy * t;
  return { t, x, y, normal: { x: (x - cx) / r, y: (y - cy) / r }, inside: false };
}
function rayPoly(h, ox, oy, dx, dy, maxT) {
  const l = len(dx, dy);
  if (l === 0) return null;
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0;
  for (const f of faces(h)) {
    const denom = dx * f.nx + dy * f.ny, dist = (ox - f.p.x) * f.nx + (oy - f.p.y) * f.ny;
    if (denom === 0) { if (dist > 0) return null; continue; }
    const t = -dist / denom;
    if (denom < 0) { if (t > tmin) { tmin = t; nx = f.nx; ny = f.ny; } } else if (t < tmax) tmax = t;
  }
  if (tmin > tmax) return null;
  if (tmin < 0) { if (tmax < 0) return null; return { t: 0, x: ox, y: oy, normal: { x: -dx / l, y: -dy / l }, inside: true }; }
  if (tmin > maxT) return null;
  return { t: tmin, x: ox + dx * tmin, y: oy + dy * tmin, normal: { x: nx, y: ny }, inside: false };
}
/** Ray o + d*t, t in [0,maxT] (d need not be unit). Nearest hit or null. */
export function raycast(s, ox, oy, dx, dy, maxT = 1) {
  if (s.type === 'circle') return rayCircle(s.x, s.y, s.r, ox, oy, dx, dy, maxT);
  if (s.type === 'capsule') {
    const h = hull(s), a = h.v[0], b = h.v[1];
    const cand = [rayCircle(a.x, a.y, s.r, ox, oy, dx, dy, maxT), rayCircle(b.x, b.y, s.r, ox, oy, dx, dy, maxT), rayPoly(hull(obb(s.x, s.y, s.hl, s.r, s.angle || 0)), ox, oy, dx, dy, maxT)];
    let best = null;
    for (const c of cand) { if (!c) continue; if (c.inside) return c; if (!best || c.t < best.t) best = c; }
    return best;
  }
  return rayPoly(hull(s), ox, oy, dx, dy, maxT);
}
/** Segment (x0,y0)->(x1,y1) cast: raycast with t in [0,1]. */
export const segmentcast = (s, x0, y0, x1, y1) => raycast(s, x0, y0, x1 - x0, y1 - y0, 1);
/** Nearest raycast hit over a list of shapes: {index,...hit} (ties: lowest index) or null. */
export function raycastNearest(list, ox, oy, dx, dy, maxT = 1) {
  let best = null;
  for (let i = 0; i < list.length; i++) { const h = raycast(list[i], ox, oy, dx, dy, maxT); if (h && (!best || h.t < best.t)) best = { index: i, ...h }; }
  return best;
}

/**
 * Continuous shape cast: move shape a by (dx,dy) against static shape b. Returns {t,normal,x,y,overlap} or null.
 * normal faces the mover (points from b toward a); x,y = contact point. Exact for translation (conservative advancement, tolerance 1e-9).
 */
export function shapeCast(a, dx, dy, b) {
  let t = 0;
  for (let it = 0; it < 128; it++) {
    const at = translate(a, dx * t, dy * t), m = collide(at, b);
    if (m) return { t, normal: { x: -m.normal.x, y: -m.normal.y }, x: m.points[0].x, y: m.points[0].y, overlap: it === 0 };
    const d = distance(at, b);
    if (d.overlap) return { t, normal: { x: -d.normal.x, y: -d.normal.y }, x: at.x, y: at.y, overlap: it === 0 };
    const closing = dx * d.normal.x + dy * d.normal.y;
    if (closing <= 0) return null;
    if (d.distance <= EPS) return { t, normal: { x: -d.normal.x, y: -d.normal.y }, x: (d.pointA.x + d.pointB.x) / 2, y: (d.pointA.y + d.pointB.y) / 2, overlap: false };
    t += d.distance / closing;
    if (t > 1) return null;
  }
  return null;
}

// ---- swept AABB (continuous, no tunnelling) -----------------------------------------------------------------
/** Move box a by (dx,dy) against static box b. {t,normal,x,y,overlap} (t in [0,1], normal faces the mover) or null. */
export function sweptAABB(a, dx, dy, b) {
  const hx = a.hw + b.hw, hy = a.hh + b.hh;
  let n0 = -Infinity, f0 = Infinity, n1 = -Infinity, f1 = Infinity;
  if (dx === 0) { if (Math.abs(a.x - b.x) >= hx) return null; } else { const t1 = (b.x - hx - a.x) / dx, t2 = (b.x + hx - a.x) / dx; n0 = Math.min(t1, t2); f0 = Math.max(t1, t2); }
  if (dy === 0) { if (Math.abs(a.y - b.y) >= hy) return null; } else { const t1 = (b.y - hy - a.y) / dy, t2 = (b.y + hy - a.y) / dy; n1 = Math.min(t1, t2); f1 = Math.max(t1, t2); }
  const entry = Math.max(n0, n1), exit = Math.min(f0, f1);
  if (entry >= exit || exit <= 0 || entry > 1) return null;
  if (entry < 0) { // already overlapping
    const m = collideAABB(b, a);
    if (!m) return null;
    return { t: 0, normal: m.normal, x: a.x, y: a.y, overlap: true };
  }
  const normal = n0 > n1 ? { x: dx > 0 ? -1 : 1, y: 0 } : { x: 0, y: dy > 0 ? -1 : 1 };
  return { t: entry, normal, x: a.x + dx * entry, y: a.y + dy * entry, overlap: false };
}

/**
 * Move-and-slide an AABB through a list of static AABBs with swept tests (no tunnelling at any speed).
 * Returns {x,y,hits:[{index,t,normal}]}; remaining motion is projected along each hit surface (up to `iterations` bounces).
 */
export function moveAABB(a, dx, dy, boxes, iterations = 4) {
  let x = a.x, y = a.y, rx = dx, ry = dy; const hits = [];
  for (let it = 0; it < iterations; it++) {
    if (rx === 0 && ry === 0) break;
    let best = null, bi = -1;
    for (let i = 0; i < boxes.length; i++) { const s = sweptAABB(aabb(x, y, a.hw, a.hh), rx, ry, boxes[i]); if (s && (!best || s.t < best.t)) { best = s; bi = i; } }
    if (!best) { x += rx; y += ry; rx = ry = 0; break; }
    x += rx * best.t; y += ry * best.t;
    hits.push({ index: bi, t: best.t, normal: best.normal });
    const rem = 1 - best.t; let px = rx * rem, py = ry * rem;
    const dot = px * best.normal.x + py * best.normal.y;
    if (dot < 0) { px -= best.normal.x * dot; py -= best.normal.y * dot; }
    rx = px; ry = py;
  }
  return { x, y, hits };
}

// ---- uniform spatial hash broadphase ------------------------------------------------------------------------
const cmpId = (a, b) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);

/**
 * Uniform grid broadphase. Items are {id (number|string), bounds, layer?, mask?}. All results are sorted by id (numbers before
 * strings) so iteration never depends on insertion order or hash layout.
 *   insert(id,bounds,{layer,mask}) update(id,bounds) remove(id) clear() has(id) size()
 *   query(bounds) -> ids   queryPoint(x,y) -> ids   pairs(filter?) -> [[idA,idB]...] with idA<idB, sorted, bounds-overlapping, layer/mask filtered
 */
export function createSpatialHash(cellSize = 32) {
  const cells = new Map(), items = new Map(); let ord = 0;
  const key = (cx, cy) => cx + ',' + cy;
  const cellRange = (b) => [Math.floor(b.minX / cellSize), Math.floor(b.minY / cellSize), Math.floor(b.maxX / cellSize), Math.floor(b.maxY / cellSize)];
  function put(id, bounds, meta, o) {
    const [x0, y0, x1, y1] = cellRange(bounds), keys = [];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const k = key(cx, cy); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(id); keys.push(k); }
    items.set(id, { id, bounds: { ...bounds }, layer: meta.layer, mask: meta.mask, keys, ord: o });
  }
  function drop(id) {
    const it = items.get(id); if (!it) return;
    for (const k of it.keys) { const c = cells.get(k); const i = c.indexOf(id); if (i >= 0) c.splice(i, 1); if (!c.length) cells.delete(k); }
    items.delete(id);
  }
  return {
    insert(id, bounds, meta = {}) { drop(id); put(id, bounds, meta, ord++); return this; },
    update(id, bounds) { const it = items.get(id); if (!it) throw new Error('spatial hash: unknown id ' + id); const o = it.ord; drop(id); put(id, bounds, it, o); return this; },
    remove(id) { drop(id); return this; },
    clear() { cells.clear(); items.clear(); ord = 0; },
    has: (id) => items.has(id),
    size: () => items.size,
    query(b) {
      const [x0, y0, x1, y1] = cellRange(b), seen = new Set(), out = [];
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const id of cells.get(key(cx, cy)) ?? []) {
        if (seen.has(id)) continue; seen.add(id);
        if (boundsOverlap(items.get(id).bounds, b)) out.push(id);
      }
      return out.sort(cmpId);
    },
    queryPoint(x, y) { return this.query({ minX: x, minY: y, maxX: x, maxY: y }); },
    pairs(filter) {
      const seen = new Set(), out = [];
      for (const [, c] of cells) {
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
          const A = items.get(c[i]), B = items.get(c[j]);
          const [lo, hi] = A.ord < B.ord ? [A, B] : [B, A], k = lo.ord + '|' + hi.ord;
          if (seen.has(k)) continue; seen.add(k);
          if (!boundsOverlap(A.bounds, B.bounds) || !canCollide(A, B) || (filter && !filter(A.id, B.id))) continue;
          out.push(cmpId(A.id, B.id) <= 0 ? [A.id, B.id] : [B.id, A.id]);
        }
      }
      return out.sort((p, q) => cmpId(p[0], q[0]) || cmpId(p[1], q[1]));
    },
  };
}

// ---- colliders, scene, tilemap ------------------------------------------------------------------------------
/** Floor height of a collider at world x (slope: interpolated and clamped to its span; others: top edge). */
export function surfaceY(c, x) {
  if (c.kind !== 'slope') return c.minY;
  const s = c.slope, u = Math.min(1, Math.max(0, (x - s.x0) / (s.x1 - s.x0)));
  return s.y0 + (s.y1 - s.y0) * u;
}
/** Shape of a collider (aabb, or a polygon for slopes) for use with collide()/raycast(). */
export function colliderShape(c) {
  if (c.kind !== 'slope') return aabb((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.maxX - c.minX) / 2, (c.maxY - c.minY) / 2);
  const s = c.slope;
  return polygon(0, 0, [{ x: s.x0, y: c.maxY }, { x: s.x1, y: c.maxY }, { x: s.x1, y: s.y1 }, { x: s.x0, y: s.y0 }]);
}

/** Static geometry container: createScene(colliders, {cellSize}) -> {colliders, add(c), query(bounds)} (query returns insertion order). */
export function createScene(colliders = [], { cellSize = 32 } = {}) {
  const hash = createSpatialHash(cellSize), list = [];
  const sc = {
    colliders: list,
    add(c) { hash.insert(list.length, c); list.push(c); return sc; },
    query: (b) => hash.query(b).map((i) => list[i]),
  };
  for (const c of colliders) sc.add(c);
  return sc;
}

/** Tilemap of fixed tile size. tiles is row-major (length cols*rows). query(bounds) returns colliders in row-major order. */
export function createTilemap({ cols, rows, tileSize, tiles, x = 0, y = 0, outside = 0, oneWayThickness = 4 }) {
  const ts = tileSize, data = tiles ? tiles.slice() : new Array(cols * rows).fill(0);
  const kindAt = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? outside : data[r * cols + c]);
  function colliderAt(c, r) {
    const k = kindAt(c, r); if (k === TILE.EMPTY) return null;
    const minX = x + c * ts, minY = y + r * ts, maxX = minX + ts, maxY = minY + ts;
    if (k === TILE.SOLID) return { kind: 'solid', minX, minY, maxX, maxY, col: c, row: r, tile: k };
    if (k === TILE.ONEWAY) return { kind: 'oneway', minX, minY, maxX, maxY: minY + Math.min(oneWayThickness, ts), col: c, row: r, tile: k };
    const s = SLOPES[k]; if (!s) return null;
    return { kind: 'slope', minX, minY, maxX, maxY, slope: { x0: minX, y0: maxY - s[0] * ts, x1: maxX, y1: maxY - s[1] * ts }, col: c, row: r, tile: k };
  }
  return {
    cols, rows, tileSize: ts, x, y, tiles: data,
    get: kindAt,
    set(c, r, k) { if (c >= 0 && r >= 0 && c < cols && r < rows) data[r * cols + c] = k; },
    colliderAt,
    tileAt: (wx, wy) => { const c = Math.floor((wx - x) / ts), r = Math.floor((wy - y) / ts); return { col: c, row: r, kind: kindAt(c, r) }; },
    query(b) {
      const c0 = Math.floor((b.minX - x) / ts), c1 = Math.floor((b.maxX - x) / ts), r0 = Math.floor((b.minY - y) / ts), r1 = Math.floor((b.maxY - y) / ts), out = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const col = colliderAt(c, r); if (col) out.push(col); }
      return out;
    },
  };
}

/**
 * Collide a shape with a scene/tilemap. Returns [{collider, manifold}] (manifold normal points from the collider toward the shape).
 * opts: {layer,mask} filter; one-way colliders only count when the shape arrives from above: manifold normal up and
 * (opts.prevMaxY ?? -Infinity) <= collider.minY (the shape's previous bottom edge was above the platform top).
 */
export function collideSource(src, shape, opts = {}) {
  const out = [], f = { layer: opts.layer, mask: opts.mask };
  for (const c of src.query(bounds(shape))) {
    if (!canCollide(c, f)) continue;
    const m = collide(colliderShape(c), shape);
    if (!m) continue;
    if (c.kind === 'oneway' && !(m.normal.y < -0.5 && (opts.prevMaxY ?? -Infinity) <= c.minY + 1e-6)) continue;
    out.push({ collider: c, manifold: m });
  }
  return out;
}

/** Platformer-physics world {groundY,pits,platforms} -> collision scene (ground solids between pits, platforms as one-way tops). */
export function fromPlatformerWorld(w, { minX = -10000, maxX = 10000, depth = 64 } = {}) {
  const cs = []; let cur = minX;
  for (const p of [...(w.pits ?? [])].sort((a, b) => a.x0 - b.x0)) { if (p.x0 > cur) cs.push({ kind: 'solid', minX: cur, maxX: p.x0, minY: w.groundY, maxY: w.groundY + depth }); cur = Math.max(cur, p.x1); }
  if (maxX > cur) cs.push({ kind: 'solid', minX: cur, maxX, minY: w.groundY, maxY: w.groundY + depth });
  for (const p of w.platforms ?? []) cs.push({ kind: 'oneway', minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minY: p.y, maxY: p.y + 4, id: p.id });
  return createScene(cs, { cellSize: 64 });
}
