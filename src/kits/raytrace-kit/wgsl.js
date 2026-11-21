// WGSL: progressive compute path tracer + fullscreen blit. Reads the flat BVH/prim/material buffers (see README).
// NOTE: written against the WebGPU spec; not validated on a GPU in this repo's CI (no headless GPU). Treat as a tested-on-device item.
export const TRACE_WGSL = /* wgsl */ `
struct Params {
  size : vec4<u32>,      // width, height, frame, seed
  counts : vec4<u32>,    // nodeCount, primCount, maxDepth, 0
  origin : vec4<f32>, fwd : vec4<f32>, right : vec4<f32>, up : vec4<f32>,
  cam : vec4<f32>,       // halfW, halfH, lensRadius, focus
  skyTop : vec4<f32>, skyBottom : vec4<f32>,
};
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read> nodes : array<vec4<f32>>;   // 2 vec4 per node: (min.xyz, leftFirst:u32 bits), (max.xyz, count:u32 bits)
@group(0) @binding(2) var<storage, read> prims : array<vec4<f32>>;   // 3 vec4 per prim: (a.xyz, kind), (b.xyz, mat), (c.xyz, 0)
@group(0) @binding(3) var<storage, read> mats : array<vec4<f32>>;    // 3 vec4 per material: (rgb, type), (emit.rgb, rough), (ior,0,0,0)
@group(0) @binding(5) var<storage, read_write> accum : array<vec4<f32>>;

var<private> rng : u32;
fn pcg(v : u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn rnd() -> f32 { rng = pcg(rng); return f32(rng) / 4294967296.0; }

struct Hit { t : f32, prim : u32, ok : bool };

fn hitPrim(i : u32, o : vec3<f32>, d : vec3<f32>, tmax : f32) -> f32 {
  let a = prims[i * 3u]; let b = prims[i * 3u + 1u]; let c = prims[i * 3u + 2u];
  if (a.w > 0.5) { // sphere: center a.xyz, radius b.x
    let l = o - a.xyz; let bb = dot(l, d); let cc = dot(l, l) - b.x * b.x; let disc = bb * bb - cc;
    if (disc < 0.0) { return -1.0; }
    let s = sqrt(disc); var t = -bb - s; if (t <= 1e-4) { t = -bb + s; }
    if (t > 1e-4 && t < tmax) { return t; }
    return -1.0;
  }
  let e1 = b.xyz - a.xyz; let e2 = c.xyz - a.xyz; let pv = cross(d, e2); let det = dot(e1, pv);
  if (abs(det) < 1e-12) { return -1.0; }
  let iv = 1.0 / det; let tv = o - a.xyz; let u = dot(tv, pv) * iv;
  if (u < 0.0 || u > 1.0) { return -1.0; }
  let q = cross(tv, e1); let v = dot(d, q) * iv;
  if (v < 0.0 || u + v > 1.0) { return -1.0; }
  let t = dot(e2, q) * iv;
  if (t > 1e-4 && t < tmax) { return t; }
  return -1.0;
}

fn intersect(o : vec3<f32>, d : vec3<f32>) -> Hit {
  var h : Hit; h.t = 1e30; h.ok = false; h.prim = 0u;
  if (P.counts.x == 0u) { return h; }
  let inv = 1.0 / d;
  var stack : array<u32, 32>; var sp = 0u; var node = 0u;
  loop {
    let n0 = nodes[node * 2u]; let n1 = nodes[node * 2u + 1u];
    let ta = (n0.xyz - o) * inv; let tb = (n1.xyz - o) * inv;
    let tn = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), min(ta.z, tb.z));
    let tf = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
    var descended = false;
    if (tn <= tf && tf > 1e-4 && tn < h.t) {
      let leftFirst = bitcast<u32>(n0.w); let count = bitcast<u32>(n1.w);
      if (count == 0u) { if (sp < 32u) { stack[sp] = leftFirst; sp = sp + 1u; } node = node + 1u; descended = true; }
      else {
        for (var k = 0u; k < count; k = k + 1u) {
          let t = hitPrim(leftFirst + k, o, d, h.t);
          if (t > 0.0) { h.t = t; h.prim = leftFirst + k; h.ok = true; }
        }
      }
    }
    if (!descended) { if (sp == 0u) { break; } sp = sp - 1u; node = stack[sp]; }
  }
  return h;
}

fn primNormal(i : u32, p : vec3<f32>) -> vec3<f32> {
  let a = prims[i * 3u]; let b = prims[i * 3u + 1u]; let c = prims[i * 3u + 2u];
  if (a.w > 0.5) { return normalize(p - a.xyz); }
  return normalize(cross(b.xyz - a.xyz, c.xyz - a.xyz));
}
fn cosDir(n : vec3<f32>) -> vec3<f32> {
  var ax = vec3<f32>(1.0, 0.0, 0.0); if (abs(n.x) > 0.9) { ax = vec3<f32>(0.0, 1.0, 0.0); }
  let t = normalize(cross(ax, n)); let b = cross(n, t);
  let r1 = 6.2831853 * rnd(); let r2 = rnd(); let s = sqrt(r2);
  return t * (cos(r1) * s) + b * (sin(r1) * s) + n * sqrt(1.0 - r2);
}
fn sky(d : vec3<f32>) -> vec3<f32> { let t = 0.5 * (d.y + 1.0); return mix(P.skyBottom.xyz, P.skyTop.xyz, t); }

fn trace(o0 : vec3<f32>, d0 : vec3<f32>) -> vec3<f32> {
  var o = o0; var d = d0; var thr = vec3<f32>(1.0); var L = vec3<f32>(0.0);
  for (var depth = 0u; depth < P.counts.z; depth = depth + 1u) {
    let h = intersect(o, d);
    if (!h.ok) { L = L + thr * sky(d); break; }
    let p = o + d * h.t; let b = prims[h.prim * 3u + 1u]; let mi = u32(b.w);
    let m0 = mats[mi * 3u]; let m1 = mats[mi * 3u + 1u]; let m2 = mats[mi * 3u + 2u];
    let ty = u32(m0.w);
    if (ty == 3u) { L = L + thr * m1.xyz; break; }
    var n = primNormal(h.prim, p); let front = dot(d, n) < 0.0; if (!front) { n = -n; }
    if (ty == 0u) { d = cosDir(n); thr = thr * m0.xyz; o = p + n * 1e-3; }
    else if (ty == 1u) {
      var r = reflect(d, n) + m1.w * (vec3<f32>(rnd(), rnd(), rnd()) * 2.0 - 1.0);
      r = normalize(r); if (dot(r, n) <= 0.0) { break; } d = r; thr = thr * m0.xyz; o = p + n * 1e-3;
    } else {
      let ior = m2.x; var eta = ior; if (front) { eta = 1.0 / ior; }
      let cosi = -dot(d, n); let s2 = eta * eta * (1.0 - cosi * cosi);
      let r0 = pow((1.0 - ior) / (1.0 + ior), 2.0); var refl = 1.0; if (s2 <= 1.0) { refl = r0 + (1.0 - r0) * pow(1.0 - cosi, 5.0); }
      if (rnd() < refl) { d = reflect(d, n); o = p + n * 1e-3; } else { d = normalize(eta * d + (eta * cosi - sqrt(1.0 - s2)) * n); o = p - n * 1e-3; }
      thr = thr * m0.xyz;
    }
    if (depth >= 3u) { let q = min(0.95, max(thr.x, max(thr.y, thr.z))); if (rnd() > q) { break; } thr = thr / q; }
  }
  return min(L, vec3<f32>(20.0));
}

@compute @workgroup_size(8, 8, 1)
fn cs(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = P.size.x; let h = P.size.y;
  if (gid.x >= w || gid.y >= h) { return; }
  let idx = gid.y * w + gid.x;
  rng = pcg(idx ^ pcg(P.size.w + P.size.z * 9781u));
  let sx = ((f32(gid.x) + rnd()) / f32(w)) * 2.0 - 1.0; let sy = 1.0 - ((f32(gid.y) + rnd()) / f32(h)) * 2.0;
  var d = normalize(P.fwd.xyz + sx * P.cam.x * P.right.xyz + sy * P.cam.y * P.up.xyz);
  var o = P.origin.xyz;
  if (P.cam.z > 0.0) {
    let fp = o + d * (P.cam.w / dot(d, P.fwd.xyz));
    let a = 6.2831853 * rnd(); let r = P.cam.z * sqrt(rnd());
    o = o + P.right.xyz * (cos(a) * r) + P.up.xyz * (sin(a) * r); d = normalize(fp - o);
  }
  let c = trace(o, d);
  var prev = vec4<f32>(0.0); if (P.size.z > 0u) { prev = accum[idx]; }
  accum[idx] = prev + vec4<f32>(c, 1.0);
}

struct VOut { @builtin(position) pos : vec4<f32> };
@vertex fn vs(@builtin(vertex_index) i : u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : VOut; o.pos = vec4<f32>(p[i], 0.0, 1.0); return o;
}
@fragment fn fs(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
  let x = u32(pos.x); let y = u32(pos.y); let a = accum[y * P.size.x + x];
  var c = a.xyz / max(a.w, 1.0);
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return vec4<f32>(pow(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2)), 1.0);
}
`;
