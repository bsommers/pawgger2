// Worked example: Colby (orange tabby explorer) and Pete (rat villain) as draw-fn rigs, 16x16.
// Run: node src/kits/examples/colby-rig.mjs  -> writes out/kit-colby.png (a contact sheet at 6x)
import { buildCharacter } from '../character-kit/index.js';
import { packSheet, encodePng } from '../art-kit/index.js';

// A rig: one draw function, poses are just parameter sets {bob, legA, legB, arm, eyes}.
function catRig(p, pal, o) {
  const bob = o.bob ?? 0, y = 4 + bob;
  p.rect(5, y + 4, 6, 5, pal.fur);                               // body
  p.rect(4, y, 8, 5, pal.fur);                                   // head
  p.set(4, y - 1, pal.fur); p.set(5, y - 1, pal.furD); p.set(11, y - 1, pal.fur); p.set(10, y - 1, pal.furD);   // ears
  p.hline(5, y + 1, 6, pal.stripe);                              // tabby stripe
  if (o.eyes === 'shut') { p.hline(5, y + 2, 2, pal.ink); p.hline(9, y + 2, 2, pal.ink); }
  else { p.set(6, y + 2, pal.ink); p.set(9, y + 2, pal.ink); }
  p.set(7, y + 3, pal.nose); p.set(8, y + 3, pal.nose);
  p.rect(5, y + 5, 6, 1, pal.hat);                               // explorer scarf
  p.rect(5 + (o.legA ?? 0), y + 9, 2, 3 - bob, pal.furD);        // legs
  p.rect(9 + (o.legB ?? 0), y + 9, 2, 3 - bob, pal.furD);
  p.vline(12, y + 5 + (o.tail ?? 0), 4, pal.furD);               // tail
  p.vline(2 + (o.arm ?? 0), y + 5, 3, pal.fur);
}
function ratRig(p, pal, o) {
  const bob = o.bob ?? 0, y = 5 + bob;
  p.rect(4, y + 3, 8, 5, pal.fur); p.rect(9, y, 5, 4, pal.fur); p.circle(10, y, 1, pal.furD);
  p.set(12, y + 1, pal.ink); p.set(14, y + 2, pal.nose);
  p.rect(5 + (o.legA ?? 0), y + 8, 2, 3, pal.furD); p.rect(9 + (o.legB ?? 0), y + 8, 2, 3, pal.furD);
  p.hline(0, y + 7, 4, pal.tail); p.set(0, y + 6, pal.tail);
  p.rect(4, y + 4, 8, 1, pal.coat);
}
export const COLBY = {
  name: 'colby', size: [16, 16], outline: '#1a1420',
  palette: { fur: '#f08a2c', furD: '#c8631a', stripe: '#8a3d10', ink: '#1a1420', nose: '#ff8fa3', hat: '#4f9a3f' },
  poses: {
    stand: { draw: catRig }, blink: { draw: catRig, eyes: 'shut' },
    r1: { draw: catRig, legA: -1, legB: 1, bob: 1, arm: 1 }, r2: { draw: catRig, bob: 0 },
    r3: { draw: catRig, legA: 1, legB: -1, bob: 1, arm: -1 }, r4: { draw: catRig, bob: 0, tail: 1 },
    jump: { draw: catRig, legA: -1, legB: 1, tail: -1, bob: -1 },
  },
  anims: {
    idle: { frames: ['stand', 'stand', 'stand', 'blink'], fps: 3 },
    run: { frames: ['r1', 'r2', 'r3', 'r4'], fps: 12 },
    jump: { frames: ['jump'], fps: 1, loop: false },
  },
};
export const PETE = {
  name: 'pete', size: [16, 16], outline: '#1a1420',
  palette: { fur: '#8c8c9a', furD: '#5e5e6e', ink: '#1a1420', nose: '#ff8fa3', tail: '#d9a0a0', coat: '#7a2a2a' },
  poses: { a: { draw: ratRig }, b: { draw: ratRig, legA: 1, legB: -1, bob: 1 }, c: { draw: ratRig, legA: -1, legB: 1 } },
  anims: { scurry: { frames: ['a', 'b', 'a', 'c'], fps: 10 } },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const sprites = { ...buildCharacter(COLBY).sprites, ...buildCharacter(PETE).sprites };
  const { sheet, manifest } = packSheet(sprites, { width: 128 });
  mkdirSync('out', { recursive: true });
  writeFileSync('out/kit-colby.png', encodePng(sheet, 6));
  console.log('wrote out/kit-colby.png', Object.keys(manifest).join(' '));
}
