// Art module 'vehicles': top-down road traffic, all facing RIGHT. PixBuf only, deterministic.
import { PixBuf, ink, hash2 } from './pixbuf.js';
import { PAL } from '../core/defs.js';

const O = PAL.outline;

// Wheels poke out above and below the body (rows 2 and 13); tread pixel alternates with frame f.
function wheels(b, xs, f) {
  for (const x of xs) {
    for (const y of [2, 13]) {
      b.rect(x, y, 3, 1, PAL.tire);
      b.set(x + (f ? 2 : 0), y, PAL.tarL);
    }
  }
}

function rounded(b, x, y, w, h) {
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) b.erase(cx, cy);
}

function sedan(main, dark, f) {
  const b = new PixBuf(16, 16);
  wheels(b, [3, 10], f);
  b.rect(2, 3, 12, 10, main);
  b.hline(2, 12, 12, dark);
  rounded(b, 2, 3, 12, 10);
  b.rect(11, 4, 2, 8, main); b.vline(11, 4, 8, mixLight(main));
  b.rect(9, 4, 2, 8, PAL.glass);               // windscreen
  b.vline(9, 4, 8, PAL.glassD);
  b.rect(5, 4, 4, 8, dark);                    // roof
  b.rect(5, 4, 4, 1, main);
  b.rect(3, 4, 2, 8, PAL.glassD);              // rear window
  b.set(13, 4, PAL.headlight); b.set(13, 11, PAL.headlight);
  b.set(2, 5, PAL.taillight); b.set(2, 10, PAL.taillight);
  return b.outline(O);
}
const mixLight = (c) => PAL.chrome && c === PAL.carYellow ? PAL.white : PAL.chrome;

function racer(f) {
  const b = new PixBuf(16, 16);
  wheels(b, [4, 10], f);
  b.rect(2, 5, 12, 6, PAL.carRed);
  b.poly([[14, 6], [15, 7], [15, 9], [14, 10]], PAL.carRed);
  b.hline(2, 10, 12, PAL.carRedD);
  b.rect(1, 3, 2, 10, PAL.white);              // spoiler
  b.rect(1, 3, 1, 10, PAL.chrome);
  b.hline(5, 7, 8, PAL.white); b.hline(5, 8, 8, PAL.white);   // racing stripe
  b.rect(8, 6, 3, 4, PAL.glassD); b.rect(9, 7, 1, 2, PAL.glass); // cockpit
  b.set(14, 6, PAL.headlight); b.set(14, 9, PAL.headlight);
  return b.outline(O);
}

function truck(boxCol, boxD, cabCol, cabD, f) {
  const b = new PixBuf(32, 16);
  wheels(b, [4, 9, 23], f);
  b.rect(2, 3, 19, 10, boxCol);                // cargo box
  b.hline(2, 12, 19, boxD);
  b.hline(2, 3, 19, PAL.white);
  b.vline(2, 3, 10, boxD);
  for (let x = 6; x < 20; x += 4) b.vline(x, 4, 8, boxD);
  b.rect(21, 4, 9, 8, cabCol);                 // cab
  b.hline(21, 11, 9, cabD);
  b.rect(26, 4, 3, 8, PAL.glass); b.vline(26, 4, 8, PAL.glassD);
  b.rect(29, 4, 1, 8, cabD);
  b.set(30, 4, PAL.headlight); b.set(30, 11, PAL.headlight);
  b.set(2, 4, PAL.taillight); b.set(2, 11, PAL.taillight);
  return b.outline(O);
}

function pickleTruck(f) {
  const b = new PixBuf(32, 16);
  wheels(b, [4, 9, 23], f);
  b.rect(2, 3, 19, 10, PAL.white);
  b.hline(2, 12, 19, PAL.chrome);
  b.rect(21, 4, 9, 8, PAL.pickleD);
  b.hline(21, 11, 9, PAL.leafD);
  b.rect(26, 4, 3, 8, PAL.glass); b.vline(26, 4, 8, PAL.glassD);
  b.set(30, 4, PAL.headlight); b.set(30, 11, PAL.headlight);
  b.set(2, 4, PAL.taillight); b.set(2, 11, PAL.taillight);
  // giant pickle lying along the roof
  b.ellipse(12, 8, 9, 3, PAL.pickle);
  b.hline(5, 9, 14, PAL.pickleD); b.hline(6, 10, 12, PAL.pickleD);
  b.hline(6, 6, 6, PAL.leafHL);
  for (const [x, y] of [[8, 7], [12, 8], [16, 7], [10, 9], [14, 9]]) b.set(x, y, PAL.leafHL);
  b.set(11, 6, PAL.leafM); b.set(15, 6, PAL.leafM);
  return b.outline(O);
}

function tunaBus(f) {
  const b = new PixBuf(48, 16);
  wheels(b, [6, 12, 33], f);
  b.rect(2, 3, 44, 10, PAL.can);               // can body
  b.rect(2, 3, 44, 1, PAL.white);
  b.hline(2, 12, 44, PAL.silverD);
  b.rect(2, 3, 2, 10, PAL.chrome); b.rect(44, 3, 2, 10, PAL.chrome);   // rims
  b.vline(3, 3, 10, PAL.silverD); b.vline(44, 3, 10, PAL.silverD);
  b.rect(4, 5, 40, 6, PAL.tuna);               // label band
  b.rect(4, 5, 40, 1, PAL.fish);
  for (let i = 0; i < 4; i++) {                // fish-logo windows
    const x = 6 + i * 9;
    b.rect(x, 6, 7, 4, PAL.glass);
    b.hline(x + 1, 8, 4, PAL.fish); b.set(x + 5, 7, PAL.fish); b.set(x + 5, 9, PAL.fish);  // fish body + tail
    b.set(x + 2, 7, PAL.black);
  }
  b.rect(42, 6, 2, 4, PAL.glass);              // windscreen
  b.set(45, 4, PAL.headlight); b.set(45, 11, PAL.headlight);
  b.set(2, 4, PAL.taillight); b.set(2, 11, PAL.taillight);
  return b.outline(O);
}

function limo(f) {
  const b = new PixBuf(48, 16);
  wheels(b, [6, 12, 36], f);
  b.rect(2, 3, 44, 10, PAL.limoBlack);
  b.hline(2, 3, 44, PAL.limoL);
  b.hline(2, 12, 44, PAL.black);
  rounded(b, 2, 3, 44, 10);
  b.rect(40, 4, 3, 8, PAL.glassD);             // windscreen
  b.rect(5, 4, 3, 8, PAL.glassD);              // rear glass
  b.hline(10, 4, 28, PAL.limoL); b.hline(10, 11, 28, PAL.limoL);   // roof edges
  b.rect(18, 5, 10, 6, PAL.black);             // sunroof opening
  // Pete peeking out: feral rat head, red eyes, pink ears
  b.rect(20, 6, 6, 4, PAL.rat);
  b.rect(21, 5, 4, 1, PAL.ratD);
  b.set(19, 6, PAL.ratEar ?? PAL.peteEar); b.set(26, 6, PAL.peteEar);
  b.set(22, 7, PAL.ratEye); b.set(24, 7, PAL.ratEye);
  b.set(23, 9, PAL.fang); b.set(25, 8, PAL.ratSkin);
  b.hline(10, 7, 6, PAL.limoL); b.hline(30, 7, 6, PAL.limoL);
  b.set(45, 4, PAL.headlight); b.set(45, 11, PAL.headlight);
  b.set(2, 4, PAL.taillight); b.set(2, 11, PAL.taillight);
  if (f) {                                     // honk flash: bright lamps and burst
    b.rect(44, 4, 2, 2, PAL.white); b.rect(44, 10, 2, 2, PAL.white);
    b.set(43, 3, PAL.headlight); b.set(43, 12, PAL.headlight);
    b.set(8, 3, PAL.fireL); b.set(9, 12, PAL.fireL);
    b.set(22, 6, PAL.white); b.set(24, 6, PAL.white);
  }
  return b.outline(O);
}

function cheese(k) {
  const b = new PixBuf(16, 16);
  b.circle(8, 8, 6, PAL.cheese);
  b.ellipse(7, 7, 4, 4, PAL.cheese);
  b.ring(8, 8, 6, 6, PAL.cheeseD, 1);
  const a0 = (k * Math.PI) / 8;                // 4 frames over a 45-degree repeat-ish turn (wedge pattern has 8-fold look)
  for (let i = 0; i < 4; i++) {                // rotating wedge lines
    const a = a0 + (i * Math.PI) / 2;
    b.line(8, 8, Math.round(8 + Math.cos(a) * 5), Math.round(8 + Math.sin(a) * 5), PAL.cheeseD);
  }
  for (let i = 0; i < 3; i++) {                // holes orbiting
    const a = a0 * 2 + i * 2.1, r = 2 + i;
    b.set(Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), PAL.cheeseHole);
  }
  b.set(8, 8, PAL.cheeseHole);
  return b.outline(O);
}

function headlight() {
  const b = new PixBuf(16, 16);
  for (let x = 1; x < 16; x++) {
    const half = Math.round(0.5 + (x * 6.5) / 15);
    for (let y = 8 - half; y < 8 + half; y++) {
      const edge = Math.abs(y - 7.5) / half, fade = x / 15;
      const dither = hash2(x, y, 7) < 0.5 || (x + y) % 2 === 0;
      const alpha = fade < 0.5 && edge < 0.7 ? 200 : 130 - fade * 60;
      if (edge > 0.85 && !dither) continue;
      if (fade > 0.6 && !((x + y) % 2 === 0)) continue;
      b.set(x, y, ink(PAL.headlight, { a: Math.round(alpha), emit: 1 }));
    }
  }
  return b;
}

export function build() {
  const cols = [[PAL.carRed, PAL.carRedD], [PAL.carBlue, PAL.carBlueD], [PAL.carYellow, PAL.carYellowD]];
  const car = [];
  cols.forEach(([m, d]) => { for (let f = 0; f < 2; f++) car.push(sedan(m, d, f)); });
  const trucks = [];
  for (const [bc, bd, cc, cd] of [[PAL.white, PAL.chrome, PAL.carRed, PAL.carRedD], [PAL.carBlue, PAL.carBlueD, PAL.carYellow, PAL.carYellowD]])
    for (let f = 0; f < 2; f++) trucks.push(truck(bc, bd, cc, cd, f));
  return {
    car,
    racer: [racer(0), racer(1)],
    truck: trucks,
    pickle_truck: [pickleTruck(0), pickleTruck(1)],
    tuna_bus: [tunaBus(0), tunaBus(1)],
    limo: [limo(0), limo(1)],
    cheese_roll: [0, 1, 2, 3].map(cheese),
    headlight: headlight(),
  };
}
