// 2D fallback: painter's-algorithm flat-shaded spheres and triangles on a Canvas2D context. Cheap, no GPU.
import { cameraBasis } from './scene.js';
const v3 = (a) => [+a[0], +a[1], +a[2]];
function project(b, p, w, h) {
  const r = [p[0] - b.origin[0], p[1] - b.origin[1], p[2] - b.origin[2]];
  const z = r[0] * b.fwd[0] + r[1] * b.fwd[1] + r[2] * b.fwd[2];
  if (z <= 0.01) return null;
  const x = (r[0] * b.right[0] + r[1] * b.right[1] + r[2] * b.right[2]) / (z * b.halfW), y = (r[0] * b.up[0] + r[1] * b.up[1] + r[2] * b.up[2]) / (z * b.halfH);
  return { x: (x * 0.5 + 0.5) * w, y: (0.5 - y * 0.5) * h, z, scale: (0.5 * h) / (z * b.halfH) };
}
const css = (c, k = 1) => `rgb(${[0, 1, 2].map((i) => Math.round(Math.min(1, Math.max(0, (c[i] ?? 0.7) * k)) * 255)).join(',')})`;
export function rasterItems(scene, w, h) {
  const b = cameraBasis(scene.camera, w / h), items = [];
  const col = (m) => (scene.materials?.[m]?.color) || [0.7, 0.7, 0.7];
  for (const o of scene.objects || []) {
    if (o.type === 'sphere') { const p = project(b, v3(o.center), w, h); if (p) items.push({ z: p.z, kind: 'circle', x: p.x, y: p.y, r: o.radius * p.scale, color: col(o.material) }); }
    else if (o.type === 'triangle' || o.type === 'quad') {
      const pts = o.type === 'triangle' ? o.v.map(v3) : (() => { const c = v3(o.corner), u = v3(o.u), q = v3(o.v); return [c, [c[0] + u[0], c[1] + u[1], c[2] + u[2]], [c[0] + u[0] + q[0], c[1] + u[1] + q[1], c[2] + u[2] + q[2]], [c[0] + q[0], c[1] + q[1], c[2] + q[2]]]; })();
      const pr = pts.map((p) => project(b, p, w, h)); if (pr.some((p) => !p)) continue;
      items.push({ z: pr.reduce((s, p) => s + p.z, 0) / pr.length, kind: 'poly', pts: pr, color: col(o.material) });
    }
  }
  return items.sort((a, c) => c.z - a.z);
}
export function rasterRender(ctx, scene, w, h) {
  const sky = scene.env?.top || [0.5, 0.7, 1];
  ctx.fillStyle = css(sky, 0.6); ctx.fillRect(0, 0, w, h);
  for (const it of rasterItems(scene, w, h)) {
    ctx.fillStyle = css(it.color);
    ctx.beginPath();
    if (it.kind === 'circle') ctx.arc(it.x, it.y, Math.max(0.5, it.r), 0, Math.PI * 2);
    else { it.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
    ctx.fill();
  }
}
