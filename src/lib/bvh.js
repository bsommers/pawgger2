// bvh.js: deterministic SAH-binned BVH over triangles or AABBs. Zero deps, Node-safe. Spec: spec/v3/bvh.md.
// Build math is Float64; node bounds are stored as Float32 rounded OUTWARD (so traversal never misses). The serialized
// buffer (serialize/deserialize) is also the GPU upload format. Triangle input: flat 9 numbers per tri; AABB input:
// flat 6 numbers per box (minx,miny,minz,maxx,maxy,maxz). Query results report ORIGINAL primitive indices.
import { rayTriangleFlat, aabbTriangleOverlap, closestPointTriangle, normWorld } from './collision3d.js';

export const MAGIC = 0x33485642; // 'BVH3' little-endian bytes 42 56 48 33
export const VERSION = 1;
export const KIND_TRI = 0, KIND_AABB = 1;
export const NODE_WORDS = 8, HEADER_WORDS = 16;
const BINS = 16;

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function f32Down(x) { f32[0] = x; let r = f32[0]; if (r > x) { u32[0] = r > 0 ? u32[0] - 1 : (r === 0 ? 0x80000001 : u32[0] + 1); r = f32[0]; } return r; }
function f32Up(x) { f32[0] = x; let r = f32[0]; if (r < x) { u32[0] = r >= 0 ? (r === 0 ? 1 : u32[0] + 1) : u32[0] - 1; r = f32[0]; } return r; }

function primBounds(kind, src, n) {
  const st = kind === KIND_TRI ? 9 : 6, mn = new Float64Array(n * 3), mx = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      let lo, hi;
      if (kind === KIND_TRI) { const a = src[i * 9 + k], b = src[i * 9 + 3 + k], c = src[i * 9 + 6 + k]; lo = Math.min(a, b, c); hi = Math.max(a, b, c); }
      else { lo = src[i * 6 + k]; hi = src[i * 6 + 3 + k]; }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('bvh: non-finite primitive ' + i);
      mn[i * 3 + k] = lo; mx[i * 3 + k] = hi;
    }
  }
  return { mn, mx, st };
}

function build(kind, input, opts = {}) {
  const src = Float64Array.from(input), st = kind === KIND_TRI ? 9 : 6, n = Math.floor(src.length / st);
  const maxLeaf = Math.max(1, opts.maxLeafSize ?? 4);
  const { mn, mx } = primBounds(kind, src, n);
  const order = new Uint32Array(n); for (let i = 0; i < n; i++) order[i] = i;
  const maxNodes = Math.max(1, 2 * n);
  const buf = new ArrayBuffer(maxNodes * NODE_WORDS * 4), nf = new Float32Array(buf), nu = new Uint32Array(buf);
  const tmp = new Uint32Array(n);
  let used = 1;
  const stack = [[0, 0, n]];
  const bmin = [0, 0, 0], bmax = [0, 0, 0];
  const cen = (i, k) => 0.5 * (mn[i * 3 + k] + mx[i * 3 + k]);
  while (stack.length) {
    const [node, s, e] = stack.pop(), cnt = e - s;
    for (let k = 0; k < 3; k++) { bmin[k] = Infinity; bmax[k] = -Infinity; }
    for (let j = s; j < e; j++) { const i = order[j]; for (let k = 0; k < 3; k++) { if (mn[i * 3 + k] < bmin[k]) bmin[k] = mn[i * 3 + k]; if (mx[i * 3 + k] > bmax[k]) bmax[k] = mx[i * 3 + k]; } }
    const o = node * NODE_WORDS;
    if (cnt === 0) { for (let k = 0; k < 3; k++) { nf[o + k] = 0; nf[o + 4 + k] = 0; } nu[o + 3] = 0; nu[o + 7] = 0; continue; }
    for (let k = 0; k < 3; k++) { nf[o + k] = f32Down(bmin[k]); nf[o + 4 + k] = f32Up(bmax[k]); }
    if (cnt <= maxLeaf) { nu[o + 3] = s; nu[o + 7] = cnt; continue; }
    // centroid bounds
    const cmin = [Infinity, Infinity, Infinity], cmax = [-Infinity, -Infinity, -Infinity];
    for (let j = s; j < e; j++) { const i = order[j]; for (let k = 0; k < 3; k++) { const c = cen(i, k); if (c < cmin[k]) cmin[k] = c; if (c > cmax[k]) cmax[k] = c; } }
    let bestCost = Infinity, bestAxis = -1, bestSplit = -1;
    for (let ax = 0; ax < 3; ax++) {
      const ext = cmax[ax] - cmin[ax]; if (!(ext > 0)) continue;
      const bc = new Uint32Array(BINS), bl = new Float64Array(BINS * 3).fill(Infinity), bh = new Float64Array(BINS * 3).fill(-Infinity);
      const scale = BINS / ext;
      for (let j = s; j < e; j++) {
        const i = order[j]; let b = Math.floor((cen(i, ax) - cmin[ax]) * scale); if (b >= BINS) b = BINS - 1; if (b < 0) b = 0;
        bc[b]++; for (let k = 0; k < 3; k++) { if (mn[i * 3 + k] < bl[b * 3 + k]) bl[b * 3 + k] = mn[i * 3 + k]; if (mx[i * 3 + k] > bh[b * 3 + k]) bh[b * 3 + k] = mx[i * 3 + k]; }
      }
      const lA = new Float64Array(BINS - 1), lC = new Uint32Array(BINS - 1);
      let c0 = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let b = 0; b < BINS - 1; b++) {
        c0 += bc[b];
        if (bc[b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], bl[b * 3 + k]); hi[k] = Math.max(hi[k], bh[b * 3 + k]); }
        lC[b] = c0; const dx = hi[0] - lo[0], dy = hi[1] - lo[1], dz = hi[2] - lo[2];
        lA[b] = c0 ? dx * dy + dy * dz + dz * dx : 0;
      }
      let c1 = 0; const lo2 = [Infinity, Infinity, Infinity], hi2 = [-Infinity, -Infinity, -Infinity];
      for (let b = BINS - 1; b >= 1; b--) {
        c1 += bc[b];
        if (bc[b]) for (let k = 0; k < 3; k++) { lo2[k] = Math.min(lo2[k], bl[b * 3 + k]); hi2[k] = Math.max(hi2[k], bh[b * 3 + k]); }
        const sp = b - 1; if (lC[sp] === 0 || c1 === 0) continue;
        const dx = hi2[0] - lo2[0], dy = hi2[1] - lo2[1], dz = hi2[2] - lo2[2];
        const cost = lC[sp] * lA[sp] + c1 * (dx * dy + dy * dz + dz * dx);
        // ties: lower axis first, then lower split (iterate high->low so use <=  for lower split on equal cost)
        if (cost < bestCost || (cost === bestCost && ax === bestAxis && sp < bestSplit)) { bestCost = cost; bestAxis = ax; bestSplit = sp; }
      }
    }
    let mid;
    if (bestAxis < 0) mid = s + (cnt >> 1); // identical centroids: split by order
    else {
      const ext = cmax[bestAxis] - cmin[bestAxis], scale = BINS / ext; let l = 0, r = 0;
      for (let j = s; j < e; j++) {
        const i = order[j]; let b = Math.floor((cen(i, bestAxis) - cmin[bestAxis]) * scale); if (b >= BINS) b = BINS - 1; if (b < 0) b = 0;
        if (b <= bestSplit) order[s + l++] = i; else tmp[r++] = i;
      }
      for (let q = 0; q < r; q++) order[s + l + q] = tmp[q];
      mid = s + l;
    }
    const left = used; used += 2;
    nu[o + 3] = left; nu[o + 7] = 0;
    stack.push([left + 1, mid, e], [left, s, mid]); // left popped first: deterministic
  }
  return finish(kind, src, n, order, buf, used);
}

function finish(kind, src, n, order, buf, used) {
  const st = kind === KIND_TRI ? 9 : 6, prims = new Float64Array(n * st);
  for (let j = 0; j < n; j++) for (let q = 0; q < st; q++) prims[j * st + q] = src[order[j] * st + q];
  return { kind, count: n, stride: st, nodeCount: used, buf, nodesF: new Float32Array(buf, 0, used * NODE_WORDS), nodesU: new Uint32Array(buf, 0, used * NODE_WORDS), order, prims, src };
}

export const buildTriangles = (tris, opts) => build(KIND_TRI, tris, opts);
export const buildAABBs = (boxes, opts) => build(KIND_AABB, boxes, opts);

// ---- refit (dynamic objects): new prim data in ORIGINAL order, same count; topology unchanged ----
export function refit(bvh, input) {
  const st = bvh.stride, n = bvh.count;
  if (input.length < n * st) throw new Error('bvh.refit: expected ' + n * st + ' numbers');
  for (let i = 0; i < n * st; i++) bvh.src[i] = input[i];
  for (let j = 0; j < n; j++) for (let q = 0; q < st; q++) bvh.prims[j * st + q] = bvh.src[bvh.order[j] * st + q];
  const nf = bvh.nodesF, nu = bvh.nodesU, P = bvh.prims;
  for (let node = bvh.nodeCount - 1; node >= 0; node--) {
    const o = node * NODE_WORDS, cnt = nu[o + 7];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    if (cnt > 0) {
      for (let j = nu[o + 3]; j < nu[o + 3] + cnt; j++) for (let k = 0; k < 3; k++) {
        let a, b;
        if (bvh.kind === KIND_TRI) { const x = P[j * 9 + k], y = P[j * 9 + 3 + k], z = P[j * 9 + 6 + k]; a = Math.min(x, y, z); b = Math.max(x, y, z); } else { a = P[j * 6 + k]; b = P[j * 6 + 3 + k]; }
        if (a < lo[k]) lo[k] = a; if (b > hi[k]) hi[k] = b;
      }
    } else if (nu[o + 3] !== 0) {
      const l = nu[o + 3] * NODE_WORDS, r = l + NODE_WORDS;
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(nf[l + k], nf[r + k]); hi[k] = Math.max(nf[l + 4 + k], nf[r + 4 + k]); }
    } else continue; // empty root
    for (let k = 0; k < 3; k++) { nf[o + k] = f32Down(lo[k]); nf[o + 4 + k] = f32Up(hi[k]); }
  }
  return bvh;
}

// ---- serialization (see spec/v3/bvh.md) ----
export function serialize(bvh) {
  const st = bvh.stride, nw = bvh.nodeCount * NODE_WORDS, n = bvh.count;
  const nodesOff = HEADER_WORDS, orderOff = nodesOff + nw, primsOff = orderOff + n, total = primsOff + n * st;
  const out = new ArrayBuffer(total * 4), u = new Uint32Array(out), f = new Float32Array(out);
  u[0] = MAGIC; u[1] = VERSION; u[2] = bvh.kind; u[3] = bvh.nodeCount; u[4] = n; u[5] = nodesOff; u[6] = orderOff; u[7] = primsOff; u[8] = st; u[9] = 0;
  u.set(bvh.nodesU.subarray(0, nw), nodesOff);
  u.set(bvh.order, orderOff);
  for (let i = 0; i < n * st; i++) f[primsOff + i] = bvh.prims[i];
  return out;
}
export function deserialize(buffer) {
  const buf = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const u = new Uint32Array(buf), f = new Float32Array(buf);
  if (u[0] !== MAGIC) throw new Error('bvh: bad magic'); if (u[1] !== VERSION) throw new Error('bvh: unsupported version ' + u[1]);
  const kind = u[2], nodeCount = u[3], n = u[4], nodesOff = u[5], orderOff = u[6], primsOff = u[7], st = kind === KIND_TRI ? 9 : 6;
  if (u[8] !== st || buf.byteLength < (primsOff + n * st) * 4) throw new Error('bvh: corrupt buffer');
  const nb = new ArrayBuffer(nodeCount * NODE_WORDS * 4); new Uint32Array(nb).set(u.subarray(nodesOff, nodesOff + nodeCount * NODE_WORDS));
  const order = Uint32Array.from(u.subarray(orderOff, orderOff + n)), prims = new Float64Array(n * st), src = new Float64Array(n * st);
  for (let i = 0; i < n * st; i++) prims[i] = f[primsOff + i];
  for (let j = 0; j < n; j++) for (let q = 0; q < st; q++) src[order[j] * st + q] = prims[j * st + q];
  return { kind, count: n, stride: st, nodeCount, buf: nb, nodesF: new Float32Array(nb), nodesU: new Uint32Array(nb), order, prims, src };
}

// ---- queries ----
const STACK = new Int32Array(256);
function slab(nf, o, ox, oy, oz, ix, iy, iz, tmax) {
  // ix/iy/iz are 1/d, or Infinity-flag 0 when d === 0 (then the axis is an inclusive containment test)
  let tn = 0, tf = Infinity, t1, t2, lo, hi;
  if (ix === 0) { if (ox < nf[o] || ox > nf[o + 4]) return -1; } else { t1 = (nf[o] - ox) * ix; t2 = (nf[o + 4] - ox) * ix; lo = t1 < t2 ? t1 : t2; hi = t1 < t2 ? t2 : t1; if (lo > tn) tn = lo; if (hi < tf) tf = hi; }
  if (iy === 0) { if (oy < nf[o + 1] || oy > nf[o + 5]) return -1; } else { t1 = (nf[o + 1] - oy) * iy; t2 = (nf[o + 5] - oy) * iy; lo = t1 < t2 ? t1 : t2; hi = t1 < t2 ? t2 : t1; if (lo > tn) tn = lo; if (hi < tf) tf = hi; }
  if (iz === 0) { if (oz < nf[o + 2] || oz > nf[o + 6]) return -1; } else { t1 = (nf[o + 2] - oz) * iz; t2 = (nf[o + 6] - oz) * iz; lo = t1 < t2 ? t1 : t2; hi = t1 < t2 ? t2 : t1; if (lo > tn) tn = lo; if (hi < tf) tf = hi; }
  tf = tf * (1 + 1e-6) + 1e-30; // conservative against rounding
  return tn <= tf && tn <= tmax ? tn : -1;
}
// 1/d, with 0 as the "parallel to this slab" flag.
function inv(d) { return d === 0 ? 0 : 1 / d; }
function primRay(bvh, j, ox, oy, oz, dx, dy, dz, tmax, cull, out) {
  if (bvh.kind === KIND_TRI) return rayTriangleFlat(ox, oy, oz, dx, dy, dz, bvh.prims, j * 9, 0, tmax, cull, out);
  const P = bvh.prims, q = j * 6, O = [ox, oy, oz], D = [dx, dy, dz]; let tn = 0, tf = tmax;
  for (let i = 0; i < 3; i++) {
    if (D[i] === 0) { if (O[i] < P[q + i] || O[i] > P[q + 3 + i]) return -1; continue; }
    let t1 = (P[q + i] - O[i]) / D[i], t2 = (P[q + 3 + i] - O[i]) / D[i]; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tn) tn = t1; if (t2 < tf) tf = t2;
  }
  return tn <= tf ? tn : -1;
}
// Closest hit. Returns {t, index, u, v, front, point} or null. Equal-t ties go to the lowest original index.
export function raycast(bvh, o, d, opts = {}) {
  const any = !!opts.any, cull = !!opts.cullBack; let tmax = opts.tmax ?? Infinity;
  if (bvh.count === 0) return null;
  const nf = bvh.nodesF, nu = bvh.nodesU, ix = inv(d[0]), iy = inv(d[1]), iz = inv(d[2]);
  let best = null, sp = 0; const tmp = [0, 0, 0]; STACK[sp++] = 0;
  if (slab(nf, 0, o[0], o[1], o[2], ix, iy, iz, tmax) < 0) return null;
  while (sp > 0) {
    const node = STACK[--sp], w = node * NODE_WORDS, cnt = nu[w + 7];
    if (cnt > 0) {
      for (let j = nu[w + 3]; j < nu[w + 3] + cnt; j++) {
        const t = primRay(bvh, j, o[0], o[1], o[2], d[0], d[1], d[2], tmax, cull, tmp);
        if (t < 0) continue; const idx = bvh.order[j];
        if (!best || t < best.t || (t === best.t && idx < best.index)) {
          best = { t, index: idx, u: tmp[0], v: tmp[1], front: tmp[2] > 0 };
          tmax = t; if (any) { best.point = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]; return best; }
        }
      }
    } else {
      const l = nu[w + 3], r = l + 1;
      const tl = slab(nf, l * NODE_WORDS, o[0], o[1], o[2], ix, iy, iz, tmax), tr = slab(nf, r * NODE_WORDS, o[0], o[1], o[2], ix, iy, iz, tmax);
      // visit nearer first (ties: left); tmax compare is inclusive so equal-t edge ties still reach lower index
      if (tl >= 0 && tr >= 0) { if (tr < tl) { STACK[sp++] = l; STACK[sp++] = r; } else { STACK[sp++] = r; STACK[sp++] = l; } }
      else if (tl >= 0) STACK[sp++] = l; else if (tr >= 0) STACK[sp++] = r;
    }
  }
  if (best) best.point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  return best;
}
export const rayAny = (bvh, o, d, opts = {}) => raycast(bvh, o, d, { ...opts, any: true }) !== null;

function walk(bvh, nodeTest, primTest) {
  const out = []; if (bvh.count === 0) return out;
  const nf = bvh.nodesF, nu = bvh.nodesU; let sp = 0; STACK[sp++] = 0;
  while (sp > 0) {
    const node = STACK[--sp], w = node * NODE_WORDS;
    if (!nodeTest(nf, w)) continue;
    const cnt = nu[w + 7];
    if (cnt > 0) { for (let j = nu[w + 3]; j < nu[w + 3] + cnt; j++) if (primTest(j)) out.push(bvh.order[j]); }
    else { STACK[sp++] = nu[w + 3] + 1; STACK[sp++] = nu[w + 3]; }
  }
  return out.sort((a, b) => a - b);
}
const primBox = (bvh, j) => {
  const P = bvh.prims;
  if (bvh.kind === KIND_AABB) return [P[j * 6], P[j * 6 + 1], P[j * 6 + 2], P[j * 6 + 3], P[j * 6 + 4], P[j * 6 + 5]];
  const q = j * 9; return [0, 1, 2].map((k) => Math.min(P[q + k], P[q + 3 + k], P[q + 6 + k])).concat([0, 1, 2].map((k) => Math.max(P[q + k], P[q + 3 + k], P[q + 6 + k])));
};
// Ascending original indices of prims overlapping the box (inclusive). Triangles: exact SAT. AABBs: box overlap.
export function queryAABB(bvh, box) {
  const lo = box.min, hi = box.max;
  return walk(bvh, (nf, w) => nf[w] <= hi[0] && nf[w + 4] >= lo[0] && nf[w + 1] <= hi[1] && nf[w + 5] >= lo[1] && nf[w + 2] <= hi[2] && nf[w + 6] >= lo[2], (j) => {
    if (bvh.kind === KIND_AABB) { const b = primBox(bvh, j); return b[0] <= hi[0] && b[3] >= lo[0] && b[1] <= hi[1] && b[4] >= lo[1] && b[2] <= hi[2] && b[5] >= lo[2]; }
    const q = j * 9, P = bvh.prims; return aabbTriangleOverlap(box, [[P[q], P[q + 1], P[q + 2]], [P[q + 3], P[q + 4], P[q + 5]], [P[q + 6], P[q + 7], P[q + 8]]]);
  });
}
// Prims within distance r (inclusive) of centre c.
export function querySphere(bvh, c, r) {
  const r2 = r * r;
  const d2box = (lo0, lo1, lo2, hi0, hi1, hi2) => { const x = Math.max(lo0 - c[0], 0, c[0] - hi0), y = Math.max(lo1 - c[1], 0, c[1] - hi1), z = Math.max(lo2 - c[2], 0, c[2] - hi2); return x * x + y * y + z * z; };
  return walk(bvh, (nf, w) => d2box(nf[w], nf[w + 1], nf[w + 2], nf[w + 4], nf[w + 5], nf[w + 6]) <= r2, (j) => {
    if (bvh.kind === KIND_AABB) { const b = primBox(bvh, j); return d2box(b[0], b[1], b[2], b[3], b[4], b[5]) <= r2; }
    const q = j * 9, P = bvh.prims, p = closestPointTriangle(c, [P[q], P[q + 1], P[q + 2]], [P[q + 3], P[q + 4], P[q + 5]], [P[q + 6], P[q + 7], P[q + 8]]);
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2]; return x * x + y * y + z * z <= r2;
  });
}
// World adapter for collision3d sweeps / character controller: broad-phase via this BVH (triangle BVHs only).
export function asWorld(bvh) {
  if (bvh.kind !== KIND_TRI) throw new Error('bvh.asWorld: triangle BVH required');
  return { tris: bvh.src, count: bvh.count, candidates: (min, max) => queryBounds(bvh, min, max) };
}
function queryBounds(bvh, lo, hi) { // by per-triangle bounds (conservative), ascending
  return walk(bvh, (nf, w) => nf[w] <= hi[0] && nf[w + 4] >= lo[0] && nf[w + 1] <= hi[1] && nf[w + 5] >= lo[1] && nf[w + 2] <= hi[2] && nf[w + 6] >= lo[2], (j) => {
    const b = primBox(bvh, j); return b[0] <= hi[0] && b[3] >= lo[0] && b[1] <= hi[1] && b[4] >= lo[1] && b[2] <= hi[2] && b[5] >= lo[2];
  });
}
export { normWorld };
export function stats(bvh) {
  let leaves = 0, maxDepth = 0, maxLeaf = 0; const st = [[0, 1]];
  while (st.length) { const [n, d] = st.pop(); maxDepth = Math.max(maxDepth, d); const w = n * NODE_WORDS, c = bvh.nodesU[w + 7]; if (c > 0) { leaves++; maxLeaf = Math.max(maxLeaf, c); } else if (bvh.nodesU[w + 3]) { st.push([bvh.nodesU[w + 3], d + 1], [bvh.nodesU[w + 3] + 1, d + 1]); } }
  return { nodes: bvh.nodeCount, leaves, maxDepth, maxLeaf };
}
