// Capability detection. Pure given an injected environment; never throws.
// tier: 'webgpu' (compute path tracer) > 'sdf' (WebGL2 ray marcher) > 'raster' (2D canvas painter).
export function detectCapabilities(env = globalThis) {
  const reasons = [];
  let webgpu = false, webgl2 = false;
  try { webgpu = !!(env.navigator && env.navigator.gpu && typeof env.navigator.gpu.requestAdapter === 'function'); } catch { /* ignore */ }
  if (!webgpu) reasons.push('navigator.gpu missing (no WebGPU)');
  try {
    if (typeof env.document?.createElement === 'function') {
      const c = env.document.createElement('canvas');
      webgl2 = !!(c && typeof c.getContext === 'function' && c.getContext('webgl2'));
    }
  } catch { /* ignore */ }
  if (!webgl2) reasons.push('WebGL2 unavailable');
  return { webgpu, webgl2, tier: webgpu ? 'webgpu' : webgl2 ? 'sdf' : 'raster', reasons };
}
// Confirms an adapter really exists (navigator.gpu can be present but yield null).
export async function probeWebGPU(env = globalThis) {
  try { const a = await env.navigator.gpu.requestAdapter(); return a ? { ok: true, adapter: a } : { ok: false, reason: 'no adapter' }; }
  catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
}
// Ordered tier ladder starting at `prefer` (default best available), always ending at 'raster'.
export function tierLadder(caps, prefer) {
  const all = ['webgpu', 'sdf', 'raster'], ok = { webgpu: caps.webgpu, sdf: caps.webgl2, raster: true };
  const start = prefer && all.includes(prefer) ? all.indexOf(prefer) : 0;
  return all.slice(start).filter((t) => ok[t]);
}
