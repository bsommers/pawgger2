// WebGPU runner. Throws on failure; index.js wraps it so callers never see the throw.
import { TRACE_WGSL } from './wgsl.js';
import { cameraBasis, sceneToBuffers } from './scene.js';

// Params uniform layout (floats/u32, 16-byte aligned) mirrored by WGSL `Params`; pure so it is unit-tested.
export const PARAMS_BYTES = 4 * 4 * 9;
export function packParams({ width, height, frame, seed, maxDepth = 5 }, buffers, basis) {
  const ab = new ArrayBuffer(PARAMS_BYTES), u = new Uint32Array(ab), f = new Float32Array(ab);
  u.set([width, height, frame, seed >>> 0, buffers.nodeCount, buffers.primCount, maxDepth, 0], 0);
  const v4 = (i, a, w = 0) => f.set([a[0], a[1], a[2], w], 8 + i * 4);
  v4(0, basis.origin); v4(1, basis.fwd); v4(2, basis.right); v4(3, basis.up);
  f.set([basis.halfW, basis.halfH, basis.lensRadius, basis.focus], 24);
  v4(5, buffers.sky.top); v4(6, buffers.sky.bottom);
  return ab;
}

export async function createWebGPUTracer(canvas, scene, { maxDepth = 5, seed = 1 } = {}) {
  const gpu = globalThis.navigator && navigator.gpu;
  if (!gpu) throw new Error('WebGPU unavailable');
  const adapter = await gpu.requestAdapter(); if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu'); if (!ctx) throw new Error('webgpu canvas context unavailable');
  const format = gpu.getPreferredCanvasFormat(); ctx.configure({ device, format, alphaMode: 'opaque' });
  const W = canvas.width, H = canvas.height, bufs = sceneToBuffers(scene);
  const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const mk = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, (data.byteLength + 3) & ~3), usage }); device.queue.writeBuffer(b, 0, data); return b; };
  const params = device.createBuffer({ size: PARAMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const nodesB = mk(new Uint8Array(bufs.nodes), S), primsB = mk(bufs.prims, S), matsB = mk(bufs.materials, S);
  const accum = device.createBuffer({ size: W * H * 16, usage: GPUBufferUsage.STORAGE });
  const module = device.createShaderModule({ code: TRACE_WGSL });
  const cpipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'cs' } });
  const rpipe = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] } });
  const e = (binding, buffer) => ({ binding, resource: { buffer } });
  const cbg = device.createBindGroup({ layout: cpipe.getBindGroupLayout(0), entries: [e(0, params), e(1, nodesB), e(2, primsB), e(3, matsB), e(5, accum)] });
  const rbg = device.createBindGroup({ layout: rpipe.getBindGroupLayout(0), entries: [e(0, params), e(5, accum)] });
  let frame = 0, basis = cameraBasis(scene.camera, W / H), alive = true;
  return {
    tier: 'webgpu',
    setCamera(cam) { basis = cameraBasis({ ...scene.camera, ...cam }, W / H); frame = 0; },
    render() { // one sample per pixel per call; accumulates until setCamera() resets
      if (!alive) return;
      device.queue.writeBuffer(params, 0, packParams({ width: W, height: H, frame, seed, maxDepth }, bufs, basis));
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass(); cp.setPipeline(cpipe); cp.setBindGroup(0, cbg); cp.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8)); cp.end();
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      rp.setPipeline(rpipe); rp.setBindGroup(0, rbg); rp.draw(3); rp.end();
      device.queue.submit([enc.finish()]); frame++;
    },
    get samples() { return frame; },
    destroy() { alive = false; try { device.destroy(); } catch { /* ignore */ } },
  };
}
