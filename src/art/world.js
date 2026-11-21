// world: ground tiles, bays, skyline, jungle, clouds, sun, stars, lamp, roller warning. PixBuf only, deterministic.
import { PixBuf, hash2 } from './pixbuf.js';
import { PAL } from '../core/defs.js';

const OL = PAL.outline;
const W = (v, n = 16) => ((v % n) + n) % n;
const tile = () => new PixBuf(16, 16);

function road(v) {
  const p = tile().fill(PAL.road);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = hash2(x, y, 31 + v * 7);
    if (h < 0.09) p.set(x, y, PAL.roadD); else if (h > 0.93) p.set(x, y, PAL.roadL);
  }
  if (v === 1) { p.hline(3, 9, 4, PAL.roadD); p.hline(10, 4, 3, PAL.roadD); }
  return p;
}
function roadLine() {
  const p = road(0);
  for (let x = 0; x < 16; x++) if (W(x) < 9) { p.set(x, 0, PAL.lane); p.set(x, 1, PAL.lane); }
  return p;
}
function roadEdge(top) {
  const p = road(top);
  const rows = top ? [0, 1, 2] : [13, 14, 15];
  const hi = top ? 2 : 13, lo = top ? 0 : 15;
  for (const y of rows) p.hline(0, y, 16, y === hi ? PAL.curbL : y === lo ? PAL.gutter : PAL.curb);
  p.hline(0, top ? 3 : 12, 16, PAL.roadD);
  for (let x = 0; x < 16; x += 8) { p.set(x, top ? 1 : 14, PAL.gutter); p.set(x + 1, top ? 1 : 14, PAL.gutter); }
  return p;
}
function median(v) {
  const p = tile().fill(PAL.median);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = hash2(x, y, 41 + v * 5);
    if (h < 0.12) p.set(x, y, PAL.medianD); else if (h > 0.94) p.set(x, y, PAL.leafL);
  }
  const fl = v === 0 ? [[3, 4, '#ffd23a'], [11, 3, '#fff6e0'], [7, 11, '#ff6a58'], [13, 13, '#ffd23a']] : [[2, 11, '#fff6e0'], [9, 5, '#ff8fa3'], [13, 10, '#ffd23a'], [5, 2, '#ff6a58']];
  for (const [x, y, c] of fl) { p.set(x, y, c); p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, c); p.set(x, y, PAL.gold); }
  return p;
}
function start(v) {
  const p = tile().fill(PAL.curb);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = hash2(x, y, 51);
    if (h < 0.1) p.set(x, y, PAL.gutter); else if (h > 0.92) p.set(x, y, PAL.curbL);
  }
  const [cx, cy] = v === 0 ? [5, 8] : [10, 7];
  const pad = (x, y) => { p.rect(x - 1, y, 3, 2, PAL.roadD); for (const dx of [-2, 0, 2]) p.set(x + dx - (dx === 0 ? 0 : 0), y - 1, PAL.roadD); p.set(x - 2, y - 1, PAL.roadD); p.set(x + 2, y - 1, PAL.roadD); p.set(x, y - 2, PAL.roadD); };
  pad(cx, cy); pad(cx + (v === 0 ? 5 : -5), cy - 4 + (v === 0 ? 0 : 6) );
  return p;
}
function water(f) {
  const p = tile().fill(PAL.water);
  // periodic base texture (period 16 in x and y)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hash2(x, y, 61) < 0.1) p.set(x, y, PAL.waterD);
  const dashes = [[1, 2, 4], [9, 5, 3], [4, 9, 4], [12, 12, 3], [7, 14, 3]];
  for (const [dx, dy, len] of dashes) {
    const sx = dx + f * 4, sy = dy;
    for (let i = 0; i < len; i++) p.set(W(sx + i), W(sy), PAL.waterL);
    for (let i = 1; i < len - 1; i++) p.set(W(sx + i + 1), W(sy + 1), PAL.waterD);
  }
  p.set(W(14 + f * 4), 7, PAL.white); p.set(W(5 + f * 4), 3, PAL.white);
  return p;
}
function bank() {
  const p = tile().fill(PAL.dirt);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = hash2(x, y, 71);
    if (h < 0.15) p.set(x, y, PAL.dirtD); else if (h > 0.9) p.set(x, y, PAL.dirtL);
  }
  p.rect(0, 12, 16, 4, PAL.waterD); for (let x = 0; x < 16; x += 4) p.set(x + 1, 13, PAL.waterL);
  for (const [x, h] of [[1, 8], [4, 11], [7, 7], [10, 10], [13, 8]]) {
    p.vline(x, 11 - h + 4, h, PAL.leaf); p.vline(x + 1, 12 - h + 4, h - 1, PAL.leafD);
    p.set(x, 11 - h + 3, PAL.trunkL); p.set(x, 11 - h + 4, PAL.trunk);
  }
  return p;
}
function hedge(v) {
  const p = tile().fill(PAL.hedge);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const h = hash2(x, y, 81 + v * 9);
    if (h < 0.2) p.set(x, y, PAL.hedgeD); else if (h > 0.8) p.set(x, y, PAL.hedgeL);
  }
  for (const [x, y] of v === 0 ? [[3, 3], [11, 8], [6, 12]] : [[9, 3], [3, 9], [12, 13]]) { p.rect(x, y, 2, 2, PAL.leafHL); p.set(x + 1, y + 1, PAL.hedgeL); }
  return p;
}
function bay(filled) {
  const p = hedge(0);
  p.rect(2, 2, 12, 12, PAL.bayWater);
  p.frame(1, 1, 14, 14, PAL.hedgeD);
  for (const [x, y] of [[3, 4], [9, 3], [5, 11], [11, 10]]) p.set(x, y, PAL.waterD);
  p.set(3, 12, PAL.waterL); p.set(12, 5, PAL.waterL);
  p.circle(8, 8, 4, PAL.leafM);
  p.circle(8, 8, 3, PAL.leaf);
  p.rect(8, 8, 5, 1, PAL.bayWater); // lily pad notch
  p.set(7, 7, PAL.leafL); p.set(6, 8, PAL.leafL);
  if (!filled) { p.set(5, 6, PAL.hatHL); p.set(11, 11, PAL.waterL); } else { p.set(8, 8, PAL.leafHL); p.set(9, 9, PAL.leafHL); }
  return p;
}

// 3x5 pixel font for PICKLES
const FONT = {
  P: ['111', '101', '111', '100', '100'], I: ['111', '010', '010', '010', '111'], C: ['111', '100', '100', '100', '111'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'], E: ['111', '100', '110', '100', '111'], S: ['111', '100', '111', '001', '111'],
};
function skyline() {
  const p = new PixBuf(240, 32);
  const base = PAL.tunnelMid, edge = PAL.tunnelDark, win = PAL.hudDim;
  // building spans: [x, w, h]; first and last have equal height so x-wrap is clean
  const spans = []; let x = 0, i = 0;
  const hs = [14, 22, 17, 26, 12, 20, 24, 15];
  while (x < 240) {
    let w = 14 + Math.floor(hash2(i, 5, 91) * 14);
    if (240 - x - w < 12) w = 240 - x;
    spans.push([x, w, i === 0 || x + w >= 240 ? 16 : hs[i % hs.length] + Math.floor(hash2(i, 7, 92) * 4)]);
    x += w; i++;
  }
  spans.forEach(([bx, w, h], n) => {
    p.rect(bx, 32 - h, w, h, base);
    p.hline(bx, 32 - h, w, PAL.peteSuit);
    p.vline(bx, 32 - h, h, edge);
    if (n % 3 === 1) { p.vline(bx + (w >> 1), 32 - h - 4, 4, edge); p.set(bx + (w >> 1), 32 - h - 4, PAL.red); }
    for (let wy = 32 - h + 3; wy < 30; wy += 4) for (let wx = bx + 2; wx < bx + w - 2; wx += 4) if (hash2(wx, wy, 93) < 0.4) p.rect(wx, wy, 2, 2, win);
  });
  // PICKLES billboard on a rooftop, centred near x=120
  const bw = 31, bh = 11, bx = 104, by = 4;
  p.vline(bx + 5, by + bh, 32 - by - bh, edge); p.vline(bx + bw - 6, by + bh, 32 - by - bh, edge);
  p.rect(bx, by, bw, bh, PAL.pickleD); p.frame(bx, by, bw, bh, OL);
  p.hline(bx + 1, by + 1, bw - 2, PAL.pickle);
  let cx = bx + 2;
  for (const ch of 'PICKLES') { FONT[ch].forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '1') p.set(cx + rx, by + 3 + ry, PAL.peteTie); })); cx += 4; }
  return p;
}
function jungle(v) {
  const p = new PixBuf(240, 32);
  const top = (x) => {
    const t = x * 2 * Math.PI / 240;
    const a = v === 0 ? [[3, 4, 0.5], [7, 3, 1.7], [11, 2, 2.9]] : [[4, 4, 2.2], [9, 3, 0.4], [13, 2, 1.1]];
    return 14 + a.reduce((s, [k, amp, ph]) => s + Math.sin(k * t + ph) * amp, 0) + hash2(x, 0, 101 + v) * 2;
  };
  for (let x = 0; x < 240; x++) {
    const t = Math.round(top(x));
    for (let y = t; y < 32; y++) p.set(x, y, y < t + 3 ? PAL.leaf : y < t + 8 ? PAL.leafD : PAL.leafDark2);
    p.set(x, t, PAL.leafM);
    if (hash2(x, 3, 103 + v) > 0.8) p.set(x, t + 1, PAL.leafL);
  }
  // trunks / hanging vines
  for (let k = 0; k < 16; k++) { const vx = 8 + k * 15 + Math.floor(hash2(k, v, 104) * 6); const t = Math.round(top(vx)); p.vline(vx, t + 3, 12 + Math.floor(hash2(k, 1, 105) * 10), k & 1 ? PAL.trunkD : PAL.leafD); }
  return p;
}
function cloud(v) {
  const p = new PixBuf(40, 14);
  const blobs = [[[8, 9, 6, 4], [18, 7, 8, 6], [29, 9, 7, 4], [14, 10, 8, 3], [24, 10, 9, 3]], [[7, 9, 5, 4], [16, 8, 7, 5], [25, 6, 6, 5], [32, 9, 5, 4], [19, 10, 12, 3]], [[10, 9, 7, 4], [21, 6, 9, 5], [31, 9, 6, 4], [18, 10, 13, 3]]][v];
  for (const [cx, cy, rx, ry] of blobs) p.ellipse(cx, cy, rx, ry, PAL.white);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 40; x++) if (p.has(x, y) && (y >= 10 || (!p.has(x, y + 1) && y >= 7))) p.set(x, y, PAL.silver);
  for (let x = 0; x < 40; x++) if (p.has(x, 12) && !p.has(x, 13)) p.set(x, 12, PAL.silverD);
  return p;
}
function sun() {
  const p = new PixBuf(20, 20);
  p.circle(10, 10, 8, PAL.white);
  p.circle(10, 10, 6, '#ffffff');
  p.ring(10, 10, 8, 8, PAL.silver);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (p.has(x, y) && x + y > 22 && ((x + y) & 1) === 0 && hash2(x, y, 111) < 0.6) p.set(x, y, PAL.silver);
  for (const [x, y] of [[7, 6], [8, 5], [6, 7]]) p.set(x, y, '#ffffff');
  for (const [x, y] of [[0, 10], [19, 10], [10, 0], [10, 19]]) { p.set(x, y, PAL.white); p.set(x === 0 ? 1 : x === 19 ? 18 : x, y === 0 ? 1 : y === 19 ? 18 : y, PAL.white); }
  return p;
}
function star(f) {
  const p = new PixBuf(3, 3);
  if (f === 0) { p.set(1, 1, '#ffffff'); }
  else { p.set(1, 1, '#ffffff'); p.set(0, 1, PAL.silver); p.set(2, 1, PAL.silver); p.set(1, 0, PAL.silver); p.set(1, 2, PAL.silver); }
  return p;
}
function lamp(f) {
  const p = tile();
  const glow = f === 0 ? ['#ffe89040', '#ffe89028'] : ['#fff2b050', '#ffe89030'];
  const r = f === 0 ? 7 : 7;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d <= r) p.set(x, y, d <= 5 ? glow[0] : (((x + y) & 1) === 0 ? glow[1] : [0, 0, 0, 0]));
  }
  p.rect(6, 6, 4, 4, PAL.chrome); p.frame(5, 5, 6, 6, OL);
  p.rect(7, 7, 2, 2, f === 0 ? PAL.headlight : '#ffffff');
  p.set(6, 6, PAL.white);
  return p;
}
function rollerWarn(f) {
  const p = tile();
  const on = f === 0;
  const body = on ? PAL.red : PAL.carRedD, hi = on ? PAL.fireL : PAL.cheeseD;
  p.poly([[8, 1], [15, 14], [1, 14]], body);
  p.rect(7, 5, 2, 5, hi); p.rect(7, 11, 2, 2, hi);
  p.hline(2, 14, 12, body);
  return p.outline(OL);
}

export function build() {
  return {
    tile_road: [road(0), road(1)],
    tile_road_line: roadLine(),
    tile_road_edge: [roadEdge(false), roadEdge(true)],
    tile_median: [median(0), median(1)],
    tile_start: [start(0), start(1)],
    tile_water: [0, 1, 2, 3].map(water),
    tile_bank: bank(),
    tile_hedge: [hedge(0), hedge(1)],
    bay_empty: bay(false),
    bay_filled: bay(true),
    bg_skyline: skyline(),
    bg_jungle: [jungle(0), jungle(1)],
    cloud: [cloud(0), cloud(1), cloud(2)],
    sun: sun(),
    star: [star(0), star(1)],
    lamp: [lamp(0), lamp(1)],
    roller_warn: [rollerWarn(0), rollerWarn(1)],
  };
}
