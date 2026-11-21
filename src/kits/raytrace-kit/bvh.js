// Self-contained flat BVH builder (median split on the widest centroid axis). Zero deps, deterministic.
// Used verbatim by tools/render (CPU tracer) and copied into the raytrace-kit (browser/WebGPU); keep both copies identical.
//
// Node layout: 8 x 32-bit words (32 bytes) per node, Float32 + Uint32 views over one ArrayBuffer:
//   w0..w2 = min.xyz (f32)   w3 = leftFirst (u32)   w4..w6 = max.xyz (f32)   w7 = count (u32)
//   interior node: count == 0, left child = this+1, right child = leftFirst
//   leaf node:     count  > 0, primitives are order[leftFirst .. leftFirst+count)
// Bounds are padded outward so float32 rounding never makes a box miss its geometry. Node 0 is the root.
export function buildBVH(bounds, { leafSize = 4 } = {}) {
  const n = (bounds.length / 6) | 0;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  if (!n) return { buffer: new ArrayBuffer(0), f32: new Float32Array(0), u32: new Uint32Array(0), nodeCount: 0, order };
  const cen = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) cen[i * 3 + a] = (bounds[i * 6 + a] + bounds[i * 6 + 3 + a]) * 0.5;
  const buf = new ArrayBuffer(2 * n * 32), f32 = new Float32Array(buf), u32 = new Uint32Array(buf);
  let count = 0;
  const build = (lo, hi) => {
    const idx = count++, o = idx * 8;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
    for (let k = lo; k < hi; k++) {
      const p = order[k];
      for (let a = 0; a < 3; a++) {
        mn[a] = Math.min(mn[a], bounds[p * 6 + a]); mx[a] = Math.max(mx[a], bounds[p * 6 + 3 + a]);
        cmn[a] = Math.min(cmn[a], cen[p * 3 + a]); cmx[a] = Math.max(cmx[a], cen[p * 3 + a]);
      }
    }
    for (let a = 0; a < 3; a++) {
      f32[o + a] = mn[a] - 1e-5 * (1 + Math.abs(mn[a]));
      f32[o + 4 + a] = mx[a] + 1e-5 * (1 + Math.abs(mx[a]));
    }
    let axis = 0, best = -1;
    for (let a = 0; a < 3; a++) if (cmx[a] - cmn[a] > best) { best = cmx[a] - cmn[a]; axis = a; }
    if (hi - lo <= leafSize || best <= 0) { u32[o + 3] = lo; u32[o + 7] = hi - lo; return idx; }
    order.subarray(lo, hi).sort((p, q) => cen[p * 3 + axis] - cen[q * 3 + axis] || p - q);
    const mid = (lo + hi) >> 1;
    build(lo, mid);
    u32[o + 3] = build(mid, hi); u32[o + 7] = 0;
    return idx;
  };
  build(0, n);
  const out = buf.slice(0, count * 32);
  return { buffer: out, f32: new Float32Array(out), u32: new Uint32Array(out), nodeCount: count, order };
}
