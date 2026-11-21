// collision3d.js: zero-dependency, deterministic 3D collision (Float64, Node-safe ES module).
// Conventions: right-handed, Y UP (unlike the y-down 2D libs). Vectors are [x,y,z]. Triangle soups are flat
// arrays, 9 numbers per triangle (ax,ay,az,bx,by,bz,cx,cy,cz), CCW seen from the front. Ray = origin o + t*d (d need
// not be unit; t is the parameter along d). Contacts: {normal, depth}: normal is a unit vector, translate shape A by
// normal*depth to separate it from B. Touching (depth 0) is NOT a contact. Spec: spec/v3/collision3d.md.
export const EPS = 1e-12;
const EPS2 = 1e-24;

// ---------------- vec3 ----------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len2 = (a) => dot(a, a);
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => { const l = len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const vec3 = { add, sub, scale: mul, dot, cross, lenSq: len2, len, normalize: norm, clamp, madd,
  dist: (a, b) => len(sub(a, b)), lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  min: (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
  max: (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] };

// ---------------- primitive constructors ----------------
export const aabb = (min, max) => ({ min: [...min], max: [...max] });
export const aabbFromCenter = (c, h) => ({ min: [c[0] - h[0], c[1] - h[1], c[2] - h[2]], max: [c[0] + h[0], c[1] + h[1], c[2] + h[2]] });
export const sphere = (c, r) => ({ c: [...c], r });
export const capsule = (a, b, r) => ({ a: [...a], b: [...b], r });
export const plane = (n, d) => ({ n: norm(n), d }); // points p with dot(n,p) = d
export const planeFromPoints = (a, b, c) => { const n = norm(cross(sub(b, a), sub(c, a))); return { n, d: dot(n, a) }; };
export const triangle = (a, b, c) => [[...a], [...b], [...c]];
// OBB: centre c, half extents h, axes = three orthonormal vectors (local x,y,z in world space).
export const obb = (c, h, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) => ({ c: [...c], h: [...h], axes: axes.map((a) => [...a]) });
export function obbFromQuat(c, h, q) { // q = [x,y,z,w], need not be unit
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; const x = q[0] / n, y = q[1] / n, z = q[2] / n, w = q[3] / n;
  return obb(c, h, [[1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)], [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]]);
}
export const triNormal = (a, b, c) => norm(cross(sub(b, a), sub(c, a)));
export const triangleAABB = (a, b, c) => ({ min: [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2])], max: [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])] });
export const aabbOverlap = (a, b) => a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1] && a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
export const aabbUnion = (a, b) => ({ min: vec3.min(a.min, b.min), max: vec3.max(a.max, b.max) });

// ---------------- closest points ----------------
export function closestPointSegment(p, a, b) {
  const ab = sub(b, a), l = dot(ab, ab);
  const t = l > EPS2 ? clamp(dot(sub(p, a), ab) / l, 0, 1) : 0;
  return madd(a, ab, t);
}
export function closestPointAABB(p, box) {
  return [clamp(p[0], box.min[0], box.max[0]), clamp(p[1], box.min[1], box.max[1]), clamp(p[2], box.min[2], box.max[2])];
}
export function closestPointOBB(p, o) {
  const d = sub(p, o.c); const out = [...o.c];
  for (let i = 0; i < 3; i++) { const k = clamp(dot(d, o.axes[i]), -o.h[i], o.h[i]); out[0] += o.axes[i][0] * k; out[1] += o.axes[i][1] * k; out[2] += o.axes[i][2] * k; }
  return out;
}
export const closestPointPlane = (p, pl) => madd(p, pl.n, pl.d - dot(pl.n, p));
export const closestPointSphere = (p, s) => { const d = sub(p, s.c), l = len(d); return l > 0 ? madd(s.c, d, s.r / l) : [s.c[0] + s.r, s.c[1], s.c[2]]; };
// Ericson, Real-Time Collision Detection 5.1.5. Degenerate (zero-area) triangles fall back to the three edges.
export function closestPointTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [...a];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [...b];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return madd(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [...c];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return madd(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return madd(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const sum = va + vb + vc;
  if (!(sum > 0) || !Number.isFinite(1 / sum)) { // degenerate
    let best = null, bd = Infinity;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) { const q = closestPointSegment(p, u, v), dd = len2(sub(p, q)); if (dd < bd) { bd = dd; best = q; } }
    return best;
  }
  const denom = 1 / sum;
  return add(a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
}
// Ericson 5.1.9. s,t in [0,1] along each segment.
export function closestSegSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= EPS2 && e <= EPS2) { s = 0; t = 0; }
  else if (a <= EPS2) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= EPS2) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = madd(p1, d1, s), c2 = madd(p2, d2, t);
  return { s, t, p1: c1, p2: c2, d2: len2(sub(c1, c2)) };
}
function baryInside(p, a, b, c, eps = EPS) {
  const v0 = sub(c, a), v1 = sub(b, a), v2 = sub(p, a);
  const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
  const den = d00 * d11 - d01 * d01; if (!(den > 0)) return false;
  const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den;
  return u >= -eps && v >= -eps && u + v <= 1 + eps;
}
// Closest points between segment [p,q] and triangle. {d2, ps (on segment), pt (on triangle), crossing, da, db}.
export function closestSegTri(p, q, a, b, c) {
  const n = cross(sub(b, a), sub(c, a));
  if (len2(n) > 0) {
    const da = dot(sub(p, a), n), db = dot(sub(q, a), n);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const x = madd(p, sub(q, p), da / (da - db));
      if (baryInside(x, a, b, c)) { const nl = len(n); return { d2: 0, ps: x, pt: x, crossing: true, da: da / nl, db: db / nl }; }
    }
  }
  let best = null;
  const take = (ps, pt) => { const d2 = len2(sub(ps, pt)); if (!best || d2 < best.d2) best = { d2, ps, pt, crossing: false }; };
  take(p, closestPointTriangle(p, a, b, c));
  take(q, closestPointTriangle(q, a, b, c));
  for (const [u, v] of [[a, b], [b, c], [c, a]]) { const r = closestSegSeg(p, q, u, v); take(r.p1, r.p2); }
  return best;
}

// ---------------- overlap + contact ----------------
const UP = [0, 1, 0];
export function sphereSphere(A, B) {
  const d = sub(A.c, B.c), l2 = len2(d), R = A.r + B.r;
  if (!(l2 < R * R)) return null;
  const l = Math.sqrt(l2);
  return l > EPS ? { normal: mul(d, 1 / l), depth: R - l } : { normal: [...UP], depth: R };
}
export function spherePlane(s, pl) {
  const dist = dot(pl.n, s.c) - pl.d;
  return dist < s.r ? { normal: [...pl.n], depth: s.r - dist } : null;
}
export function capsulePlane(cp, pl) {
  const da = dot(pl.n, cp.a) - pl.d, db = dot(pl.n, cp.b) - pl.d, m = Math.min(da, db);
  return m < cp.r ? { normal: [...pl.n], depth: cp.r - m } : null;
}
export function aabbPlane(box, pl) {
  const c = mul(add(box.min, box.max), 0.5), h = mul(sub(box.max, box.min), 0.5);
  const rad = h[0] * Math.abs(pl.n[0]) + h[1] * Math.abs(pl.n[1]) + h[2] * Math.abs(pl.n[2]);
  const dist = dot(pl.n, c) - pl.d;
  return dist < rad ? { normal: [...pl.n], depth: rad - dist } : null;
}
// sphere (centre local to a box centred at origin with half extents h) vs box; returns {n (local), depth}.
function sphereBoxLocal(c, r, h) {
  const q = [clamp(c[0], -h[0], h[0]), clamp(c[1], -h[1], h[1]), clamp(c[2], -h[2], h[2])];
  const d = sub(c, q), l2 = len2(d);
  if (l2 > 0) { if (l2 >= r * r) return null; const l = Math.sqrt(l2); return { n: mul(d, 1 / l), depth: r - l }; }
  // centre inside the box: leave through the nearest face (ties x,y,z)
  let ax = 0, best = h[0] - Math.abs(c[0]);
  for (let i = 1; i < 3; i++) { const g = h[i] - Math.abs(c[i]); if (g < best) { best = g; ax = i; } }
  const n = [0, 0, 0]; n[ax] = c[ax] >= 0 ? 1 : -1;
  return { n, depth: r + best };
}
export function sphereAABB(s, box) {
  const ctr = mul(add(box.min, box.max), 0.5), h = mul(sub(box.max, box.min), 0.5);
  const r = sphereBoxLocal(sub(s.c, ctr), s.r, h);
  return r ? { normal: r.n, depth: r.depth } : null;
}
export function sphereOBB(s, o) {
  const d = sub(s.c, o.c), lc = [dot(d, o.axes[0]), dot(d, o.axes[1]), dot(d, o.axes[2])];
  const r = sphereBoxLocal(lc, s.r, o.h);
  if (!r) return null;
  return { normal: add(add(mul(o.axes[0], r.n[0]), mul(o.axes[1], r.n[1])), mul(o.axes[2], r.n[2])), depth: r.depth };
}
export function aabbAABB(A, B) {
  let depth = Infinity, ax = -1, sgn = 1;
  for (let i = 0; i < 3; i++) {
    const o = Math.min(A.max[i], B.max[i]) - Math.max(A.min[i], B.min[i]);
    if (!(o > 0)) return null;
    if (o < depth) { depth = o; ax = i; sgn = (A.min[i] + A.max[i]) >= (B.min[i] + B.max[i]) ? 1 : -1; }
  }
  const n = [0, 0, 0]; n[ax] = sgn;
  return { normal: n, depth };
}
// OBB vs OBB, 15-axis SAT. Normal points from B to A.
export function obbOBB(A, B) {
  const t = sub(B.c, A.c);
  let depth = Infinity, best = null;
  const test = (ax) => {
    const l2 = len2(ax); if (l2 < 1e-18) return true;
    const l = Math.sqrt(l2), u = [ax[0] / l, ax[1] / l, ax[2] / l];
    const rA = A.h[0] * Math.abs(dot(u, A.axes[0])) + A.h[1] * Math.abs(dot(u, A.axes[1])) + A.h[2] * Math.abs(dot(u, A.axes[2]));
    const rB = B.h[0] * Math.abs(dot(u, B.axes[0])) + B.h[1] * Math.abs(dot(u, B.axes[1])) + B.h[2] * Math.abs(dot(u, B.axes[2]));
    const dist = dot(t, u), o = rA + rB - Math.abs(dist);
    if (!(o > 0)) return false;
    if (o < depth) { depth = o; best = dist > 0 ? mul(u, -1) : u; }
    return true;
  };
  for (let i = 0; i < 3; i++) if (!test(A.axes[i])) return null;
  for (let i = 0; i < 3; i++) if (!test(B.axes[i])) return null;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!test(cross(A.axes[i], B.axes[j]))) return null;
  return { normal: best, depth };
}
export function sphereCapsule(s, cp) {
  const q = closestPointSegment(s.c, cp.a, cp.b), d = sub(s.c, q), l2 = len2(d), R = s.r + cp.r;
  if (!(l2 < R * R)) return null;
  const l = Math.sqrt(l2);
  if (l > EPS) return { normal: mul(d, 1 / l), depth: R - l };
  const ax = norm(sub(cp.b, cp.a)); const n = len2(ax) > 0 ? norm(cross(ax, Math.abs(ax[1]) < 0.9 ? UP : [1, 0, 0])) : [...UP];
  return { normal: n, depth: R };
}
// Normal points from B to A. Intersecting axes fall back to a direction perpendicular to both.
export function capsuleCapsule(A, B) {
  const r = closestSegSeg(A.a, A.b, B.a, B.b), R = A.r + B.r;
  if (!(r.d2 < R * R)) return null;
  const l = Math.sqrt(r.d2);
  if (l > EPS) return { normal: mul(sub(r.p1, r.p2), 1 / l), depth: R - l };
  let n = cross(sub(A.b, A.a), sub(B.b, B.a));
  if (len2(n) < EPS2) { const ax = sub(A.b, A.a); n = len2(ax) > EPS2 ? cross(ax, Math.abs(ax[1]) < 0.9 * len(ax) ? UP : [1, 0, 0]) : [...UP]; }
  return { normal: norm(n), depth: R };
}
export function sphereTriangle(s, tri) {
  const [a, b, c] = tri, q = closestPointTriangle(s.c, a, b, c), d = sub(s.c, q), l2 = len2(d);
  if (!(l2 < s.r * s.r)) return null;
  const l = Math.sqrt(l2);
  if (l > EPS) return { normal: mul(d, 1 / l), depth: s.r - l };
  const n = triNormal(a, b, c);
  return { normal: len2(n) > 0 ? n : [...UP], depth: s.r };
}
function capTriContact(pa, pb, r, a, b, c) {
  const res = closestSegTri(pa, pb, a, b, c);
  if (res.crossing) {
    const n = triNormal(a, b, c), s = Math.abs(res.da) >= Math.abs(res.db) ? (res.da >= 0 ? 1 : -1) : (res.db >= 0 ? 1 : -1);
    return { normal: mul(n, s), depth: r + Math.min(Math.abs(res.da), Math.abs(res.db)), crossing: true, ps: res.ps, pt: res.pt };
  }
  if (!(res.d2 < r * r)) return null;
  const l = Math.sqrt(res.d2);
  if (l > EPS) return { normal: mul(sub(res.ps, res.pt), 1 / l), depth: r - l, ps: res.ps, pt: res.pt };
  const n = triNormal(a, b, c);
  return { normal: len2(n) > 0 ? n : [...UP], depth: r, ps: res.ps, pt: res.pt };
}
export function capsuleTriangle(cp, tri) {
  const r = capTriContact(cp.a, cp.b, cp.r, tri[0], tri[1], tri[2]);
  return r ? { normal: r.normal, depth: r.depth } : null;
}
// Box (centre bc, half h) vs triangle SAT (13 axes). Returns depth (>=0 overlapping/touching, <0 separated) + normal.
function boxTriSat(bc, h, tri) {
  const v = [sub(tri[0], bc), sub(tri[1], bc), sub(tri[2], bc)];
  const e = [sub(v[1], v[0]), sub(v[2], v[1]), sub(v[0], v[2])];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], cross(e[0], e[1])];
  for (let i = 0; i < 3; i++) { const u = [0, 0, 0]; u[i] = 1; for (let j = 0; j < 3; j++) axes.push(cross(u, e[j])); }
  let depth = Infinity, best = null;
  for (let k = 0; k < axes.length; k++) {
    const l2 = len2(axes[k]); if (l2 < 1e-18) continue;
    const l = Math.sqrt(l2), u = [axes[k][0] / l, axes[k][1] / l, axes[k][2] / l];
    const rad = h[0] * Math.abs(u[0]) + h[1] * Math.abs(u[1]) + h[2] * Math.abs(u[2]);
    const p0 = dot(v[0], u), p1 = dot(v[1], u), p2 = dot(v[2], u);
    const tmin = Math.min(p0, p1, p2), tmax = Math.max(p0, p1, p2);
    if (tmin > rad || tmax < -rad) return { depth: -1, normal: null };
    const lo = rad - tmin, hi = tmax + rad;
    const o = Math.min(lo, hi);
    if (o < depth) { depth = o; best = lo < hi ? mul(u, -1) : u; }
  }
  return { depth, normal: best };
}
export function aabbTriangle(box, tri) {
  const r = boxTriSat(mul(add(box.min, box.max), 0.5), mul(sub(box.max, box.min), 0.5), tri);
  return r.depth > 0 ? { normal: r.normal, depth: r.depth } : null;
}
// Inclusive boolean (touching counts); used for broad-phase exact queries.
export function aabbTriangleOverlap(box, tri) {
  return boxTriSat(mul(add(box.min, box.max), 0.5), mul(sub(box.max, box.min), 0.5), tri).depth >= 0;
}

// ---------------- rays ----------------
// Ray-vs-shape results: {t, point, normal} or null. Origin inside a solid shape returns t=0 and normal=-normalize(d).
const hitAt = (o, d, t, n) => ({ t, point: madd(o, d, t), normal: n });
const insideNormal = (d) => { const n = norm(d); return [-n[0], -n[1], -n[2]]; };
export function rayPlane(o, d, pl, tmax = Infinity) {
  const den = dot(pl.n, d); if (Math.abs(den) < 1e-300) return null;
  const t = (pl.d - dot(pl.n, o)) / den; if (t < 0 || t > tmax) return null;
  return hitAt(o, d, t, den < 0 ? [...pl.n] : mul(pl.n, -1));
}
export function raySphere(o, d, s, tmax = Infinity) {
  const m = sub(o, s.c), a = dot(d, d), cc = dot(m, m) - s.r * s.r;
  if (cc <= 0) return hitAt(o, d, 0, insideNormal(d));
  if (!(a > 0)) return null;
  const b = dot(m, d); if (b >= 0) return null;
  const disc = b * b - a * cc; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a; if (t > tmax) return null;
  const p = madd(o, d, t);
  return { t, point: p, normal: mul(sub(p, s.c), 1 / s.r) };
}
// Slab test. Returns t (entry, clamped to tmin) or -1; out[0] = entry axis (-1 if inside), out[1] = normal sign.
export function rayBoxT(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, tmin, tmax, out) {
  let tn = -Infinity, tf = Infinity, ax = -1, sg = 0;
  const O = [ox, oy, oz], D = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    const d = D[i];
    if (d === 0) { if (O[i] < lo[i] || O[i] > hi[i]) return -1; continue; }
    const inv = 1 / d; let t1 = (lo[i] - O[i]) * inv, t2 = (hi[i] - O[i]) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tn) { tn = t1; ax = i; sg = d > 0 ? -1 : 1; }
    if (t2 < tf) tf = t2;
  }
  if (tn > tf || tf < tmin) return -1;
  let t = tn;
  if (tn < tmin) { t = tmin; ax = -1; }
  if (t > tmax) return -1;
  if (out) { out[0] = ax; out[1] = sg; }
  return t;
}
export function rayAABB(o, d, box, tmax = Infinity) {
  const out = [0, 0];
  const t = rayBoxT(o[0], o[1], o[2], d[0], d[1], d[2], box.min[0], box.min[1], box.min[2], box.max[0], box.max[1], box.max[2], 0, tmax, out);
  if (t < 0) return null;
  const n = [0, 0, 0]; if (out[0] >= 0) n[out[0]] = out[1]; else return hitAt(o, d, t, insideNormal(d));
  return hitAt(o, d, t, n);
}
export function rayOBB(o, d, ob, tmax = Infinity) {
  const lo = sub(o, ob.c), O = [dot(lo, ob.axes[0]), dot(lo, ob.axes[1]), dot(lo, ob.axes[2])];
  const D = [dot(d, ob.axes[0]), dot(d, ob.axes[1]), dot(d, ob.axes[2])];
  const out = [0, 0];
  const t = rayBoxT(O[0], O[1], O[2], D[0], D[1], D[2], -ob.h[0], -ob.h[1], -ob.h[2], ob.h[0], ob.h[1], ob.h[2], 0, tmax, out);
  if (t < 0) return null;
  if (out[0] < 0) return hitAt(o, d, t, insideNormal(d));
  return hitAt(o, d, t, mul(ob.axes[out[0]], out[1]));
}
// Ray param t against a capsule, -1 if none. Internal (shared with sweeps).
function rayCapT(o, d, a, b, r, tmax) {
  const ab = sub(b, a), dd = dot(ab, ab), q = closestPointSegment(o, a, b);
  if (len2(sub(o, q)) <= r * r) return 0;
  const a0 = dot(d, d); if (!(a0 > 0)) return -1;
  let best = Infinity;
  const sph = (c) => { const m = sub(o, c), b1 = dot(m, d), c1 = dot(m, m) - r * r; if (b1 >= 0) return; const disc = b1 * b1 - a0 * c1; if (disc < 0) return; const t = (-b1 - Math.sqrt(disc)) / a0; if (t >= 0 && t < best) best = t; };
  sph(a); sph(b);
  if (dd > EPS2) {
    const m = sub(o, a), md = dot(m, ab), nd = dot(d, ab);
    const A = dd * a0 - nd * nd, B = dd * dot(m, d) - nd * md, C = dd * (dot(m, m) - r * r) - md * md;
    if (A > 1e-18 * dd * a0) {
      const disc = B * B - A * C;
      if (disc >= 0) { const t = (-B - Math.sqrt(disc)) / A; const s = md + t * nd; if (t >= 0 && s >= 0 && s <= dd && t < best) best = t; }
    }
  }
  return best <= tmax && best !== Infinity ? best : -1;
}
export function rayCapsule(o, d, cp, tmax = Infinity) {
  const t = rayCapT(o, d, cp.a, cp.b, cp.r, tmax); if (t < 0) return null;
  if (t === 0) return hitAt(o, d, 0, insideNormal(d));
  const p = madd(o, d, t), q = closestPointSegment(p, cp.a, cp.b);
  return { t, point: p, normal: mul(sub(p, q), 1 / cp.r) };
}
// Moller-Trumbore on a flat soup (9 per triangle at offset off). Returns t or -1; out[0]=u (weight of b), out[1]=v (weight of c),
// out[2] = det sign (+1 front face = ray against the CCW normal). Edge/vertex hits are inclusive within 1e-12 barycentric
// (so closed meshes do not leak). Degenerate triangles and rays parallel to the plane never hit.
export function rayTriangleFlat(ox, oy, oz, dx, dy, dz, T, off, tmin, tmax, cull, out) {
  const ax = T[off], ay = T[off + 1], az = T[off + 2];
  const e1x = T[off + 3] - ax, e1y = T[off + 4] - ay, e1z = T[off + 5] - az;
  const e2x = T[off + 6] - ax, e2y = T[off + 7] - ay, e2z = T[off + 8] - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz), dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (nl === 0 || Math.abs(det) <= 1e-14 * nl * dl) return -1;
  if (cull && det < 0) return -1;
  const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -EPS || u > 1 + EPS) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -EPS || u + v > 1 + EPS) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (t < tmin || t > tmax) return -1;
  if (out) { out[0] = u; out[1] = v; out[2] = det > 0 ? 1 : -1; }
  return t;
}
export function rayTriangle(o, d, tri, opts = {}) {
  const T = [...tri[0], ...tri[1], ...tri[2]], out = [0, 0, 0];
  const t = rayTriangleFlat(o[0], o[1], o[2], d[0], d[1], d[2], T, 0, opts.tmin ?? 0, opts.tmax ?? Infinity, !!opts.cullBack, out);
  if (t < 0) return null;
  const n = triNormal(tri[0], tri[1], tri[2]);
  return { t, u: out[0], v: out[1], point: madd(o, d, t), normal: out[2] > 0 ? n : mul(n, -1), front: out[2] > 0 };
}

// ---------------- sweeps (swept sphere / capsule vs triangle soup) ----------------
// World = flat tris array, or {tris, count?, candidates?(min,max) -> ascending index array} (see bvh.asWorld).
export function normWorld(w) {
  if (Array.isArray(w) || ArrayBuffer.isView(w)) return { tris: w, count: Math.floor(w.length / 9), candidates: null };
  return { tris: w.tris, count: w.count ?? Math.floor(w.tris.length / 9), candidates: w.candidates || null };
}
const triAt = (T, o) => [[T[o], T[o + 1], T[o + 2]], [T[o + 3], T[o + 4], T[o + 5]], [T[o + 6], T[o + 7], T[o + 8]]];
function ids(w, min, max) { return w.candidates ? w.candidates(min, max) : null; }
const orient = (A, B, C, nrm) => { const f = triNormal(A, B, C); return len2(f) > 0 ? (dot(f, nrm) >= 0 ? f : mul(f, -1)) : nrm; };
function sweepSphereTri(c, r, d, A, B, C) {
  const q0 = closestPointTriangle(c, A, B, C), dv = sub(c, q0), dd = len2(dv), n = triNormal(A, B, C);
  if (dd < r * r) {
    const dist = Math.sqrt(dd);
    let nrm = dist > EPS ? mul(dv, 1 / dist) : (len2(n) > 0 ? n : [...UP]);
    if (dist <= EPS && dot(nrm, d) > 0) nrm = mul(nrm, -1);
    if (dot(d, nrm) >= 0) return null;
    return { t: 0, normal: nrm, face: orient(A, B, C, nrm), point: q0, depth: r - dist, penetrating: true };
  }
  let best = Infinity;
  if (len2(n) > 0) {
    const sd = dot(sub(c, A), n), s = sd >= 0 ? 1 : -1, dn = dot(d, n) * s;
    if (dn < 0) {
      const t = (r - s * sd) / dn;
      if (t >= 0 && t <= 1 && baryInside(madd(madd(c, d, t), n, -s * r), A, B, C)) best = t;
    }
  }
  for (const [u, v] of [[A, B], [B, C], [C, A]]) { const t = rayCapT(c, d, u, v, r, 1); if (t >= 0 && t < best) best = t; }
  if (!(best <= 1)) return null;
  const hc = madd(c, d, best), q = closestPointTriangle(hc, A, B, C), dir = sub(hc, q), l = len(dir);
  const normal = l > EPS ? mul(dir, 1 / l) : (len2(n) > 0 ? mul(n, dot(n, d) < 0 ? 1 : -1) : [...UP]);
  return { t: best, normal, face: orient(A, B, C, normal), point: q, depth: 0, penetrating: false };
}
function sweepCapsuleTri(pa, pb, r, d, A, B, C) {
  const dl2 = len2(d);
  let t = 0;
  for (let it = 0; it < 48; it++) {
    const sa = madd(pa, d, t), sb = madd(pb, d, t);
    const res = closestSegTri(sa, sb, A, B, C);
    if (it === 0 && (res.crossing || res.d2 < r * r)) {
      const k = capTriContact(sa, sb, r, A, B, C); if (!k) return null;
      if (dot(d, k.normal) >= 0) return null;
      return { t: 0, normal: k.normal, face: orient(A, B, C, k.normal), point: k.pt, depth: k.depth, penetrating: true };
    }
    if (res.crossing) { const fn = triNormal(A, B, C), nn = dot(fn, d) < 0 ? fn : mul(fn, -1); return { t, normal: nn, face: nn, point: res.pt, depth: 0, penetrating: false }; }
    const dist = Math.sqrt(res.d2), gap = dist - r;
    const u = dist > EPS ? mul(sub(res.ps, res.pt), 1 / dist) : [...UP];
    const closing = -dot(d, u);
    if (!(closing > 1e-12) || !(dl2 > 0)) return null;
    if (gap <= 1e-9) return { t, normal: u, face: orient(A, B, C, u), point: res.pt, depth: 0, penetrating: false };
    t += gap / closing;
    if (t > 1) return null;
  }
  return null;
}
function sweepAll(w, bmin, bmax, fn) {
  const list = ids(w, bmin, bmax), n = list ? list.length : w.count;
  let best = null;
  for (let k = 0; k < n; k++) {
    const i = list ? list[k] : k, o = i * 9;
    const h = fn(w.tris, o);
    if (h && (!best || h.t < best.t)) { h.index = i; best = h; }
  }
  return best;
}
// d = full displacement over the step; hit.t in [0,1] fraction of d. normal: unit, from surface toward the shape.
export function sweepSphere(c, r, d, world) {
  const w = normWorld(world), P = 1e-6;
  const lo = [Math.min(c[0], c[0] + d[0]) - r - P, Math.min(c[1], c[1] + d[1]) - r - P, Math.min(c[2], c[2] + d[2]) - r - P];
  const hi = [Math.max(c[0], c[0] + d[0]) + r + P, Math.max(c[1], c[1] + d[1]) + r + P, Math.max(c[2], c[2] + d[2]) + r + P];
  return sweepAll(w, lo, hi, (T, o) => { const t = triAt(T, o); return sweepSphereTri(c, r, d, t[0], t[1], t[2]); });
}
export function sweepCapsule(a, b, r, d, world) {
  const w = normWorld(world), P = 1e-6;
  const lo = [0, 1, 2].map((i) => Math.min(a[i], b[i], a[i] + d[i], b[i] + d[i]) - r - P);
  const hi = [0, 1, 2].map((i) => Math.max(a[i], b[i], a[i] + d[i], b[i] + d[i]) + r + P);
  return sweepAll(w, lo, hi, (T, o) => { const t = triAt(T, o); return sweepCapsuleTri(a, b, r, d, t[0], t[1], t[2]); });
}
// Penetrating contacts of a capsule against a soup: [{index, normal, depth}].
export function capsuleContacts(a, b, r, world) {
  const w = normWorld(world), P = 1e-6;
  const lo = [0, 1, 2].map((i) => Math.min(a[i], b[i]) - r - P), hi = [0, 1, 2].map((i) => Math.max(a[i], b[i]) + r + P);
  const list = ids(w, lo, hi), n = list ? list.length : w.count, out = [];
  for (let k = 0; k < n; k++) {
    const i = list ? list[k] : k, t = triAt(w.tris, i * 9), c = capTriContact(a, b, r, t[0], t[1], t[2]);
    if (c) out.push({ index: i, normal: c.normal, depth: c.depth });
  }
  return out;
}

// ---------------- kinematic character controller (capsule move-and-slide) ----------------
// pos = FEET centre. Capsule core runs from pos+r to pos+height-r along +Y. Y is up.
export function createCharacter(o = {}) {
  return { pos: [...(o.pos || [0, 0, 0])], vel: [0, 0, 0], grounded: false, groundNormal: [0, 1, 0],
    radius: o.radius ?? 0.4, height: o.height ?? 1.8, stepHeight: o.stepHeight ?? 0.35,
    minGroundY: o.minGroundY ?? 0.6427876096865394, // cos(50 deg): steeper than this is not walkable
    skin: o.skin ?? 1e-4, snapDistance: o.snapDistance ?? 0.3, maxIterations: o.maxIterations ?? 4 };
}
const capA = (ch, p) => [p[0], p[1] + ch.radius, p[2]];
const capB = (ch, p) => [p[0], p[1] + ch.height - ch.radius, p[2]];
const sweepCh = (ch, w, p, d) => sweepCapsule(capA(ch, p), capB(ch, p), ch.radius, d, w);
export function depenetrate(ch, world, iterations = 4) {
  const w = normWorld(world);
  for (let it = 0; it < iterations; it++) {
    const cs = capsuleContacts(capA(ch, ch.pos), capB(ch, ch.pos), ch.radius, w).filter((c) => c.depth > 1e-9);
    if (!cs.length) return;
    let best = cs[0]; for (const c of cs) if (c.depth > best.depth) best = c;
    ch.pos = madd(ch.pos, best.normal, best.depth + ch.skin);
  }
}
function slide(ch, w, p0, d0, stick, info) {
  let p = [...p0], d = [...d0]; const planes = [];
  for (let it = 0; it < ch.maxIterations && len2(d) > EPS2; it++) {
    const hit = sweepCh(ch, w, p, d);
    if (!hit) { p = add(p, d); d = [0, 0, 0]; break; }
    p = madd(madd(p, d, hit.t), hit.normal, ch.skin);
    const n = hit.normal, f = hit.face || n; info.hits.push(n);
    if (f[1] >= ch.minGroundY) { info.floor = f; if (stick) { d = [0, 0, 0]; break; } }
    else if (n[1] < -0.7) info.ceil = true;
    else info.wall = true;
    let nn = n;
    if (n[1] > 0 && f[1] < ch.minGroundY) { const l = Math.hypot(n[0], n[2]); if (l > 1e-9) nn = [n[0] / l, 0, n[2] / l]; }
    let rem = mul(d, 1 - hit.t);
    const into = dot(rem, nn); if (into < 0) rem = madd(rem, nn, -into);
    planes.push(nn);
    for (let k = 0; k < planes.length - 1; k++) {
      if (dot(rem, planes[k]) < -1e-9) {
        const cr = cross(nn, planes[k]), l = len(cr);
        rem = l < 1e-9 ? [0, 0, 0] : mul(cr, dot(rem, cr) / (l * l));
      }
    }
    for (const pl of planes) if (dot(rem, pl) < -1e-9) rem = [0, 0, 0];
    d = rem;
  }
  return p;
}
const hDist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function tryStep(ch, w, start, hd) {
  const up = sweepCh(ch, w, start, [0, ch.stepHeight, 0]);
  const rise = up ? up.t * ch.stepHeight - ch.skin : ch.stepHeight;
  if (rise <= 1e-6) return null;
  const p1 = [start[0], start[1] + rise, start[2]];
  const p2 = slide(ch, w, p1, hd, false, { hits: [] });
  const dn = rise + 1e-3, hit = sweepCh(ch, w, p2, [0, -dn, 0]);
  if (!hit || (hit.face || hit.normal)[1] < ch.minGroundY) return null;
  return madd(madd(p2, [0, -dn, 0], hit.t), hit.normal, ch.skin);
}
// Moves the character by vel*dt: horizontal slide (with step-up), vertical slide, ground snap. Mutates ch
// (pos, vel, grounded, groundNormal) and returns it. vel y includes gravity/jump, supplied by the caller.
export function moveAndSlide(ch, vel, dt, world) {
  const w = normWorld(world), wasGrounded = ch.grounded, start = [...ch.pos];
  depenetrate(ch, w);
  let cur = [...ch.pos];
  const hd = [vel[0] * dt, 0, vel[2] * dt], infoH = { hits: [], wall: false, floor: null, ceil: false };
  if (len2(hd) > 0) {
    cur = slide(ch, w, cur, hd, false, infoH);
    if (wasGrounded && infoH.wall && ch.stepHeight > 0) {
      const s = tryStep(ch, w, ch.pos, hd);
      if (s && hDist(s, ch.pos) > hDist(cur, ch.pos) + 1e-9) cur = s;
    }
  }
  const infoV = { hits: [], wall: false, floor: null, ceil: false };
  const vy = vel[1] * dt;
  if (vy !== 0) cur = slide(ch, w, cur, [0, vy, 0], true, infoV);
  let grounded = false, gn = [0, 1, 0];
  if (vel[1] <= 0) {
    if (infoV.floor) { grounded = true; gn = infoV.floor; }
    else {
      const dist = wasGrounded ? ch.snapDistance : ch.skin * 3, dv = [0, -dist, 0], hit = sweepCh(ch, w, cur, dv);
      if (hit && (hit.face || hit.normal)[1] >= ch.minGroundY) { cur = madd(madd(cur, dv, hit.t), hit.normal, ch.skin); grounded = true; gn = hit.face || hit.normal; }
    }
  }
  ch.pos = cur; ch.grounded = grounded; ch.groundNormal = gn;
  const inv = dt > 0 ? 1 / dt : 0;
  let vyOut = vel[1];
  if (grounded) vyOut = 0; else if (infoV.ceil && vyOut > 0) vyOut = 0;
  ch.vel = [(cur[0] - start[0]) * inv, vyOut, (cur[2] - start[2]) * inv];
  return ch;
}
