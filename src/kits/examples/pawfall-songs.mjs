// Worked example: PawFall's "jungle" theme and a victory sting as audio-kit songs, plus a mini SFX table.
// Run: node src/kits/examples/pawfall-songs.mjs  -> writes out/kit-jungle.wav and out/kit-treasure.wav
import { renderSong, renderSfx, toWav, pcmStats, jingle } from '../audio-kit/index.js';

const rep = (a, n) => Array.from({ length: n }, () => a).flat();
const stab = (lo, hi) => `.:2 ${lo}:2 .:2 ${hi}:2 .:2 ${lo}:2 .:2 ${hi}:2`;
const bounce = (r, f) => `${r}:3 .:1 ${f}:3 .:1 ${r}:3 .:1 ${f}:3 .:1`;
export const JUNGLE = {
  bpm: 132, bars: 4, loop: true,
  channels: {
    lead: { wave: 'pulse', duty: 0.25, vel: 0.30, gate: 0.7, sus: 0.3, pat: [
      'F#5:2 A5:1 F#5:1 D5:2 F#5:2 A5:2 F#5:2 D5:2 .:2', 'E5:2 F#5:2 A5:2 B5:2 A5:4 F#5:2 .:2',
      'G5:2 B5:1 G5:1 D5:2 G5:2 B5:2 G5:2 D5:2 .:2', 'A5:2 G5:2 F#5:2 G5:2 B5:4 G5:2 .:2'] },
    harm: { wave: 'pulse', duty: 0.125, vel: 0.12, gate: 0.5, sus: 0.2, pat: [stab('A4', 'F#4'), stab('A4', 'F#4'), stab('B4', 'D5'), stab('B4', 'D5')] },
    bass: { wave: 'tri', vel: 0.40, gate: 0.85, sus: 0.8, pat: [bounce('D2', 'A2'), bounce('D2', 'A2'), bounce('G2', 'D3'), bounce('G2', 'D3')] },
  },
  drums: { vel: 1, pat: rep(['K.h.S.hhK.h.S.h.'], 3).concat(['K.h.S.h.K.ttSsss']) },
};
export const SFX = {
  treasure: (v, { arp }) => { arp(v, [76, 79, 83, 88], 0.05, { dur: 0.14, gain: 0.18 }); v({ src: 'sine', t: 0.2, dur: 0.3, gain: 0.12, f: [1046, 1319] }); },
};
export const VICTORY = jingle('D5:2 D5:2 D5:2 D5:2 F#5:4 A5:4', { bpm: 144 });

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('out', { recursive: true });
  const song = renderSong(JUNGLE), sfx = renderSfx(SFX, 'treasure');
  writeFileSync('out/kit-jungle.wav', toWav(song)); writeFileSync('out/kit-treasure.wav', toWav(sfx));
  console.log('jungle', pcmStats(song), 'treasure', pcmStats(sfx), 'victory bars', VICTORY.bars);
}
