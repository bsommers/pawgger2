# raytrace-kit

`createRaytracer(canvas, scene, {prefer})` -> `{tier:'webgpu'|'sdf'|'raster', errors, render(), setCamera(cam), destroy()}`. Never throws; if WebGPU is absent it falls to WebGL2 SDF spheres, then Canvas2D. Zero deps. The WGSL is spec-written and needs on-device validation (no headless GPU in CI).

Scene subset: camera{from,at,up,fov,aperture,focus}, env{top,bottom}, materials{lambert|metal|dielectric|emissive}, objects sphere|triangle|quad.

## Buffer spec (own spec; `bvh.js` is a self-contained copy of tools/render/bvh.mjs)
- BVH nodes: 8 x 32-bit words per node (32 bytes). w0-2 min xyz f32, w3 leftFirst u32, w4-6 max xyz f32, w7 count u32. count==0: interior, left = node+1, right = leftFirst. count>0: leaf, prims `[leftFirst, leftFirst+count)` in the already-reordered prim buffer. Node 0 is root. In WGSL read as 2 vec4<f32> per node, `bitcast<u32>` on the .w lanes.
- Prims: 12 floats each: `a.xyz, kind(0 tri,1 sphere)`, `b.xyz, mat`, `c.xyz, 0`. Sphere: a=center, b.x=radius. Triangle: a,b,c.
- Materials: 12 floats: `rgb, type(0 lambert,1 metal,2 dielectric,3 emissive)`, `emit.rgb, rough`, `ior,0,0,0`.
- Params uniform: 144 bytes, see `packParams` in webgpu.js. Accumulation buffer: width*height vec4<f32> (sum rgb, count).
