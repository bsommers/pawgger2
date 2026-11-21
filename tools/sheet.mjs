#!/usr/bin/env node
// Art contact sheets: node tools/sheet.mjs <artModule> [--scale N] [--only substr] [--out dir]
// Renders out/previews/<module>.png (albedo over a checker) and <module>.mat.png (R=emit G=gloss B=spark),
// one row per name (frames left→right), and validates the module against defs.artManifest().
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const mod = args.find((a) => !a.startsWith('--'));
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  if (!mod) { console.error('usage: sheet.mjs <artModule> [--scale N] [--only substr] [--out dir]'); process.exit(2); }
  const only = opt('only', null), outDir = join(root, opt('out', 'out/previews'));
  const { artManifest } = await import(pathToFileURL(join(root, 'src/core/defs.js')));
  const t0 = performance.now();
  const built = (await import(pathToFileURL(join(root, 'src/art', mod + '.js')) + '?t=' + Date.now())).build();
  const ms = performance.now() - t0;
  const want = artManifest().filter((a) => a.module === mod);
  const problems = [];
  for (const a of want) {
    const v = built[a.name];
    if (!v) { problems.push(`MISSING ${a.name} (${a.frames} frame(s) ${a.w}x${a.h}): ${a.desc}`); continue; }
    const fr = Array.isArray(v) ? v : [v];
    if (fr.length !== a.frames) problems.push(`FRAMES ${a.name}: have ${fr.length}, want ${a.frames}`);
    for (const f of fr) if (f.w !== a.w || f.h !== a.h) { problems.push(`SIZE ${a.name}: have ${f.w}x${f.h}, want ${a.w}x${a.h}`); break; }
    if (a.kind === 'tile') for (const f of fr) { let holes = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] < 255) holes++; if (holes) { problems.push(`ALPHA ${a.name}: tile has ${holes} non-opaque pixels`); break; } }
    if (a.kind === 'sprite') for (const f of fr) { let op = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] >= 128) op++; if (op === 0) { problems.push(`EMPTY ${a.name}: a frame is fully transparent`); break; } if (op === f.w * f.h) { problems.push(`OPAQUE ${a.name}: sprite frame has no transparent background`); break; } }
  }
  for (const k of Object.keys(built)) if (!want.some((a) => a.name === k)) problems.push(`EXTRA ${k} (not in manifest for module ${mod})`);

  const rows = Object.entries(built).filter(([k]) => !only || k.includes(only)).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
  if (!rows.length) { console.error('nothing to draw'); process.exit(1); }
  const maxW = Math.max(...rows.map(([, f]) => f[0].w));
  const scale = Number(opt('scale', maxW >= 128 ? 2 : maxW <= 16 ? 6 : 3)), gap = 4;
  const W = Math.max(...rows.map(([, f]) => f.reduce((s, p) => s + p.w * scale + gap, gap)));
  const H = rows.reduce((s, [, f]) => s + Math.max(...f.map((p) => p.h)) * scale + gap, gap);
  const alb = new Uint8Array(W * H * 4), mat = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { alb.set([24, 22, 30, 255], i * 4); mat.set([0, 0, 0, 255], i * 4); }
  let y0 = gap;
  rows.forEach(([name, frames], r) => {
    let x0 = gap; const rh = Math.max(...frames.map((p) => p.h));
    for (const p of frames) {
      for (let y = 0; y < p.h * scale; y++) for (let x = 0; x < p.w * scale; x++) {
        const sx = (x / scale) | 0, sy = (y / scale) | 0, si = (sy * p.w + sx) * 4, di = ((y0 + y) * W + x0 + x) * 4;
        const a = p.rgba[si + 3] / 255, ck = ((sx >> 3) + (sy >> 3)) & 1 ? 70 : 52;   // checker shows transparency
        alb[di] = p.rgba[si] * a + ck * (1 - a); alb[di + 1] = p.rgba[si + 1] * a + ck * (1 - a); alb[di + 2] = p.rgba[si + 2] * a + (ck + 14) * (1 - a);
        if (a > 0.5) { mat[di] = p.mat[si]; mat[di + 1] = p.mat[si + 1]; mat[di + 2] = p.mat[si + 2]; } else { mat[di] = mat[di + 1] = mat[di + 2] = 20; }
      }
      x0 += p.w * scale + gap;
    }
    console.log(`row ${String(r).padStart(2)}  y=${String(y0).padStart(4)}  ${name}  x${frames.length}  ${frames[0].w}x${frames[0].h}`);
    y0 += rh * scale + gap;
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, mod + '.png'), encodePNG(W, H, alb));
  writeFileSync(join(outDir, mod + '.mat.png'), encodePNG(W, H, mat));
  console.log(`\nwrote ${join(outDir, mod + '.png')} and .mat.png  (${W}x${H}, scale ${scale}, build ${ms.toFixed(1)} ms)`);
  if (problems.length) { console.log('\nPROBLEMS:\n  ' + problems.join('\n  ')); process.exitCode = 1; } else console.log(`OK: all ${want.length} manifest names present with correct sizes/frames.`);
}
