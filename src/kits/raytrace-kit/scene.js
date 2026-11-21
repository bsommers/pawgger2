// Pure functions: scene JSON -> GPU-ready buffers, camera math, and a CPU reference traversal used as a test oracle.
// Scene (browser subset): { camera:{from,at,up,fov,aperture,focus}, env:{top,bottom}, materials:{name:{type,color,emission,rough,ior}},
//   objects:[{type:'sphere',center,radius,material}|{type:'triangle',v:[a,b,c],material}|{type:'quad',corner,u,v,material}] }
// Buffer spec is documented in README.md; constants below are the single source of truth.
import { buildBVH } from './bvh.js';

export const MAT_TYPES = { lambert: 0, metal: 1, dielectric: 2, emissive: 3 };
export const PRIM_STRIDE = 12; // floats per primitive
export const MAT_STRIDE = 12;  // floats per material
const v3 = (a, d = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? [+a[0], +a[1], +a[2]] : d);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Camera basis; ray dir = normalize(fwd + sx*halfW*right + sy*halfH*up), sx,sy in [-1,1] (sy = +1 at top).
export function cameraBasis(cam = {}, aspect = 1) {
  const from = v3(cam.from, [0, 1, 5]), at = v3(cam.at, [0, 0, 0]);
  const fwd = norm(sub(at, from)), right = norm(cross(v3(cam.up, [0, 1, 0]), fwd)), up = cross(fwd, right);
  const halfH = Math.tan(((cam.fov ?? 40) * Math.PI) / 360);
  return { origin: from, fwd, right, up, halfW: halfH * aspect, halfH, lensRadius: (cam.aperture ?? 0) / 2, focus: cam.focus ?? len(sub(at, from)) };
}
export function primaryRay(basis, sx, sy, lens = [0, 0]) {
  const d = [0, 1, 2].map((k) => basis.fwd[k] + sx * basis.halfW * basis.right[k] + sy * basis.halfH * basis.up[k]);
  const dn = norm(d);
  if (!basis.lensRadius) return { o: basis.origin.slice(), d: dn };
  const t = basis.focus / (dn[0] * basis.fwd[0] + dn[1] * basis.fwd[1] + dn[2] * basis.fwd[2]);
  const focusPt = [0, 1, 2].map((k) => basis.origin[k] + dn[k] * t);
  const o = [0, 1, 2].map((k) => basis.origin[k] + basis.right[k] * lens[0] * basis.lensRadius + basis.up[k] * lens[1] * basis.lensRadius);
  return { o, d: norm(sub(focusPt, o)) };
}

export function sceneToBuffers(scene) {
  const mats = [], names = new Map();
  const mat = (m) => {
    if (m == null) m = '__default';
    if (typeof m === 'string' && names.has(m)) return names.get(m);
    const def = m === '__default' ? { type: 'lambert', color: [0.7, 0.7, 0.7] } : (scene.materials || {})[m];
    if (!def) throw new Error(`unknown material "${m}"`);
    if (!(def.type in MAT_TYPES)) throw new Error(`material "${m}": unknown type "${def.type}"`);
    mats.push(def); names.set(m, mats.length - 1); return mats.length - 1;
  };
  const prims = []; // {kind, a, b, c, mat}
  const quad = (c, u, w, m) => {
    const p1 = [c[0] + u[0], c[1] + u[1], c[2] + u[2]], p3 = [c[0] + w[0], c[1] + w[1], c[2] + w[2]], p2 = [p1[0] + w[0], p1[1] + w[1], p1[2] + w[2]];
    prims.push({ kind: 0, a: c, b: p1, c: p2, mat: m }, { kind: 0, a: c, b: p2, c: p3, mat: m });
  };
  for (const o of scene.objects || []) {
    const m = mat(o.material);
    if (o.type === 'sphere') prims.push({ kind: 1, a: v3(o.center), b: [+o.radius, 0, 0], c: [0, 0, 0], mat: m });
    else if (o.type === 'triangle') prims.push({ kind: 0, a: v3(o.v[0]), b: v3(o.v[1]), c: v3(o.v[2]), mat: m });
    else if (o.type === 'quad') quad(v3(o.corner), v3(o.u), v3(o.v), m);
    else throw new Error(`unsupported object type "${o.type}" (browser kit: sphere|triangle|quad)`);
  }
  if (!mats.length) mat(null);
  const bounds = new Float32Array(prims.length * 6);
  prims.forEach((p, i) => {
    for (let k = 0; k < 3; k++) {
      if (p.kind === 1) { bounds[i * 6 + k] = p.a[k] - p.b[0]; bounds[i * 6 + 3 + k] = p.a[k] + p.b[0]; }
      else { bounds[i * 6 + k] = Math.min(p.a[k], p.b[k], p.c[k]); bounds[i * 6 + 3 + k] = Math.max(p.a[k], p.b[k], p.c[k]); }
    }
  });
  const bvh = buildBVH(bounds);
  const primBuf = new Float32Array(Math.max(1, prims.length) * PRIM_STRIDE);
  for (let k = 0; k < prims.length; k++) {
    const p = prims[bvh.order[k]], o = k * PRIM_STRIDE;
    primBuf.set([...p.a, p.kind, ...p.b, p.mat, ...p.c, 0], o);
  }
  const matBuf = new Float32Array(mats.length * MAT_STRIDE);
  mats.forEach((m, i) => {
    const col = v3(m.color, [0.8, 0.8, 0.8]), I = m.intensity ?? 1, em = m.emission ? v3(m.emission) : m.type === 'emissive' ? col.map((x) => x * I) : [0, 0, 0];
    matBuf.set([...col, MAT_TYPES[m.type], ...em, m.rough ?? 0, m.ior ?? 1.5, 0, 0, 0], i * MAT_STRIDE);
  });
  const e = scene.env || {};
  return {
    nodes: bvh.buffer, nodeCount: bvh.nodeCount, prims: primBuf, primCount: prims.length, materials: matBuf, materialCount: mats.length,
    sky: { top: v3(e.top, [0.5, 0.7, 1]), bottom: v3(e.bottom, [1, 1, 1]) },
  };
}

// CPU reference: closest hit against the flat buffers. Returns {t, prim, mat} or null. Mirrors the WGSL traversal.
export function intersectBuffers(b, o, d, tmax = Infinity) {
  if (!b.nodeCount) return null;
  const f = new Float32Array(b.nodes), u = new Uint32Array(b.nodes), P = b.prims;
  const inv = d.map((x) => 1 / x), stack = [0];
  let best = tmax, hit = null;
  while (stack.length) {
    const n = stack.pop(), w = n * 8;
    let tn = -Infinity, tf = Infinity;
    for (let a = 0; a < 3; a++) {
      const t0 = (f[w + a] - o[a]) * inv[a], t1 = (f[w + 4 + a] - o[a]) * inv[a];
      tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
    }
    if (tn > tf || tf < 1e-6 || tn >= best) continue;
    const cnt = u[w + 7];
    if (!cnt) { stack.push(u[w + 3], n + 1); continue; }
    for (let k = u[w + 3]; k < u[w + 3] + cnt; k++) {
      const p = k * PRIM_STRIDE, A = [P[p], P[p + 1], P[p + 2]], B = [P[p + 4], P[p + 5], P[p + 6]], C = [P[p + 8], P[p + 9], P[p + 10]];
      let t = null;
      if (P[p + 3] === 1) {
        const l = sub(o, A), bb = l[0] * d[0] + l[1] * d[1] + l[2] * d[2], cc = l[0] * l[0] + l[1] * l[1] + l[2] * l[2] - B[0] * B[0], disc = bb * bb - cc;
        if (disc >= 0) { const s = Math.sqrt(disc); t = -bb - s > 1e-5 ? -bb - s : -bb + s > 1e-5 ? -bb + s : null; }
      } else {
        const e1 = sub(B, A), e2 = sub(C, A), pv = cross(d, e2), det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
        if (Math.abs(det) > 1e-12) {
          const iv = 1 / det, tv = sub(o, A), uu = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * iv;
          if (uu >= 0 && uu <= 1) {
            const q = cross(tv, e1), vv = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * iv;
            if (vv >= 0 && uu + vv <= 1) { const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * iv; if (tt > 1e-5) t = tt; }
          }
        }
      }
      if (t !== null && t < best) { best = t; hit = { t, prim: k, mat: P[p + 7] }; }
    }
  }
  return hit;
}
