// raytrace-kit entry. createRaytracer never throws: it walks webgpu -> sdf (WebGL2) -> raster (Canvas2D) and reports why.
import { detectCapabilities, probeWebGPU, tierLadder } from './detect.js';
import { createWebGPUTracer } from './webgpu.js';
import { createSdfMarcher } from './sdf.js';
import { rasterRender } from './raster.js';
export { sceneToBuffers, cameraBasis, primaryRay, intersectBuffers, MAT_TYPES, PRIM_STRIDE, MAT_STRIDE } from './scene.js';
export { buildBVH } from './bvh.js';
export { detectCapabilities, probeWebGPU, tierLadder } from './detect.js';
export { sdfUniforms, createSdfMarcher, MAX_SPHERES } from './sdf.js';
export { rasterRender, rasterItems } from './raster.js';
export { TRACE_WGSL } from './wgsl.js';
export { packParams, PARAMS_BYTES } from './webgpu.js';

// opts: { prefer:'webgpu'|'sdf'|'raster', env (injectable globalThis), maxDepth, seed }
// Returns { tier, errors:[{tier,message}], render(), setCamera(cam), samples, destroy() } -- always usable.
export async function createRaytracer(canvas, scene, opts = {}) {
  const env = opts.env || globalThis, errors = [];
  let caps; try { caps = detectCapabilities(env); } catch { caps = { webgpu: false, webgl2: false, tier: 'raster', reasons: ['detect failed'] }; }
  for (const tier of tierLadder(caps, opts.prefer)) {
    try {
      if (tier === 'webgpu') { const p = await probeWebGPU(env); if (!p.ok) throw new Error(p.reason); return { ...(await createWebGPUTracer(canvas, scene, opts)), errors, caps }; }
      if (tier === 'sdf') return { ...createSdfMarcher(canvas, scene), samples: 1, errors, caps };
    } catch (e) { errors.push({ tier, message: String(e && e.message || e) }); }
  }
  let sc = scene, ctx2d = null;
  try { ctx2d = canvas.getContext('2d'); } catch (e) { errors.push({ tier: 'raster', message: String(e && e.message || e) }); }
  return {
    tier: 'raster', errors, caps, samples: 1,
    render() { try { if (ctx2d) rasterRender(ctx2d, sc, canvas.width, canvas.height); } catch (e) { errors.push({ tier: 'raster', message: String(e && e.message || e) }); } },
    setCamera(cam) { sc = { ...sc, camera: { ...sc.camera, ...cam } }; },
    destroy() {},
  };
}
