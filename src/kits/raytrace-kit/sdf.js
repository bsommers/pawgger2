// WebGL2 fragment ray-marcher fallback: SDF spheres + ground plane, soft shadows, AO, sky. Cheap and watchdog-safe (capped steps).
import { cameraBasis } from './scene.js';
export const MAX_SPHERES = 16;
export const SDF_VERT = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
export const SDF_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform vec3 uOrigin, uFwd, uRight, uUp; uniform vec2 uHalf; uniform vec3 uSkyTop, uSkyBottom, uSun;
uniform int uCount; uniform vec4 uSph[${MAX_SPHERES}]; uniform vec4 uCol[${MAX_SPHERES}]; uniform float uGround;
out vec4 o;
float map(vec3 p, out int id){ float d = p.y - uGround; id = -1;
  for(int i=0;i<${MAX_SPHERES};i++){ if(i>=uCount) break; float s = length(p-uSph[i].xyz)-uSph[i].w; if(s<d){ d=s; id=i; } } return d; }
float mapD(vec3 p){ int i; return map(p,i); }
vec3 nrm(vec3 p){ vec2 e=vec2(0.001,0.0); return normalize(vec3(mapD(p+e.xyy)-mapD(p-e.xyy), mapD(p+e.yxy)-mapD(p-e.yxy), mapD(p+e.yyx)-mapD(p-e.yyx))); }
float shadow(vec3 p, vec3 l){ float r=1.0, t=0.02; for(int i=0;i<32;i++){ float h=mapD(p+l*t); r=min(r,8.0*h/t); t+=clamp(h,0.02,0.5); if(r<0.001||t>20.0) break; } return clamp(r,0.0,1.0); }
float ao(vec3 p, vec3 n){ float s=0.0, k=1.0; for(int i=1;i<=4;i++){ float h=0.08*float(i); s+=(h-mapD(p+n*h))*k; k*=0.6; } return clamp(1.0-2.0*s,0.0,1.0); }
void main(){
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 d = normalize(uFwd + uv.x*uHalf.x*uRight + uv.y*uHalf.y*uUp);
  vec3 col = mix(uSkyBottom, uSkyTop, 0.5*(d.y+1.0)); float t = 0.0; int id = -1; bool hit = false;
  for(int i=0;i<128;i++){ vec3 p = uOrigin + d*t; float h = map(p,id); if(h<0.001){ hit=true; break; } t += h; if(t>60.0) break; }
  if(hit){ vec3 p = uOrigin + d*t; vec3 n = nrm(p); int k; map(p,k);
    vec3 alb = k>=0 ? uCol[k].rgb : vec3(0.65) * (0.6 + 0.4*mod(floor(p.x)+floor(p.z),2.0));
    float dif = max(dot(n,uSun),0.0) * shadow(p+n*0.01,uSun); col = alb * (dif*vec3(1.0,0.95,0.85) + 0.25*ao(p,n)*mix(uSkyBottom,uSkyTop,0.5*(n.y+1.0))); }
  col = (col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14); o = vec4(pow(clamp(col,0.0,1.0), vec3(1.0/2.2)), 1.0);
}`;
// Pure: scene -> uniform arrays. Triangles/quads are skipped (SDF tier draws spheres only); `skipped` reports how many.
export function sdfUniforms(scene, aspect = 1) {
  const sph = new Float32Array(MAX_SPHERES * 4), col = new Float32Array(MAX_SPHERES * 4);
  let n = 0, skipped = 0, ground = Infinity;
  for (const o of scene.objects || []) {
    if (o.type === 'sphere' && n < MAX_SPHERES) {
      sph.set([...o.center, o.radius], n * 4); col.set([...((scene.materials?.[o.material]?.color) || [0.7, 0.7, 0.7]), 1], n * 4); n++;
      ground = Math.min(ground, o.center[1] - o.radius);
    } else skipped++;
  }
  const b = cameraBasis(scene.camera, aspect);
  return { count: n, spheres: sph, colors: col, skipped, ground: Number.isFinite(ground) ? ground : 0, basis: b,
    skyTop: scene.env?.top || [0.5, 0.7, 1], skyBottom: scene.env?.bottom || [1, 1, 1], sun: scene.sun || [0.4, 0.8, -0.3] };
}
export function createSdfMarcher(canvas, scene) {
  const gl = canvas.getContext('webgl2'); if (!gl) throw new Error('WebGL2 unavailable');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed'); return s; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, SDF_VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SDF_FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
  const u = (n) => gl.getUniformLocation(prog, n);
  let sc = scene;
  const render = () => {
    const U = sdfUniforms(sc, canvas.width / canvas.height), b = U.basis;
    gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(prog);
    gl.uniform2f(u('uRes'), canvas.width, canvas.height); gl.uniform3fv(u('uOrigin'), b.origin); gl.uniform3fv(u('uFwd'), b.fwd); gl.uniform3fv(u('uRight'), b.right); gl.uniform3fv(u('uUp'), b.up);
    gl.uniform2f(u('uHalf'), b.halfW, b.halfH); gl.uniform3fv(u('uSkyTop'), U.skyTop); gl.uniform3fv(u('uSkyBottom'), U.skyBottom); gl.uniform3fv(u('uSun'), U.sun);
    gl.uniform1i(u('uCount'), U.count); gl.uniform4fv(u('uSph'), U.spheres); gl.uniform4fv(u('uCol'), U.colors); gl.uniform1f(u('uGround'), U.ground);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  return { tier: 'sdf', render, setCamera(cam) { sc = { ...sc, camera: { ...sc.camera, ...cam } }; }, destroy() { try { gl.deleteProgram(prog); } catch { /* ignore */ } } };
}
