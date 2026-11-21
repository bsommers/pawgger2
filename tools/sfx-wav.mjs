#!/usr/bin/env node
// Render sound effects to 16-bit mono WAV and print numbers (peak, rms, length, centroid).
// Usage: node tools/sfx-wav.mjs [name ...] [--out dir] [--sr 44100]   (default: all defs.SFX, out/sfx/)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX_NAMES, renderSfx, stats } from '../src/audio/sfx.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function encodeWav(pcm, sr = 44100) {
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);       // byte rate
  buf.writeUInt16LE(2, 32);            // block align
  buf.writeUInt16LE(16, 34);           // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(x < 0 ? x * 32768 : x * 32767), 44 + i * 2);
  }
  return buf;
}

function main() {
  const args = process.argv.slice(2);
  let outDir = join(root, 'out', 'sfx');
  let sr = 44100;
  const names = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') outDir = resolve(args[++i]);
    else if (args[i] === '--sr') sr = Number(args[++i]);
    else names.push(args[i]);
  }
  const list = names.length ? names : SFX_NAMES;
  mkdirSync(outDir, { recursive: true });
  for (const name of list) {
    if (!SFX_NAMES.includes(name)) { console.error(`unknown sfx: ${name}`); process.exitCode = 1; continue; }
    const pcm = renderSfx(name, sr);
    writeFileSync(join(outDir, `${name}.wav`), encodeWav(pcm, sr));
    const s = stats(pcm, sr);
    console.log(`${name.padEnd(15)} peak ${s.peak.toFixed(3)}  rms ${s.rms.toFixed(3)}  ${s.sec.toFixed(3)}s  centroid ${Math.round(s.centroid)}Hz`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
