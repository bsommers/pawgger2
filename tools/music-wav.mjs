// Renders every music track to out/music/<name>.wav (16-bit mono) and prints stats. Usage: node tools/music-wav.mjs [name...] [--out dir]
import fs from 'node:fs'; import path from 'node:path';
import { MUSIC_NAMES, renderMusic, stats } from '../src/audio/music.js';
const SR = 44100;
export function wavBytes(pcm, sr = SR) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  return b;
}
const args = process.argv.slice(2); const oi = args.indexOf('--out');
const dir = oi >= 0 ? args.splice(oi, 2)[1] : 'out/music';
const names = args.length ? args : MUSIC_NAMES;
fs.mkdirSync(dir, { recursive: true });
for (const n of names) {
  const pcm = renderMusic(n, SR); const s = stats(pcm, SR);
  fs.writeFileSync(path.join(dir, n + '.wav'), wavBytes(pcm));
  console.log(`${n.padEnd(12)} len=${s.len.toFixed(2)}s peak=${s.peak.toFixed(3)} rms=${s.rms.toFixed(3)} centroid=${s.centroid.toFixed(0)}Hz`);
}
