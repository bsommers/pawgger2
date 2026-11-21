// Art module 'fx': particles, PAWGGER logo, title strip, cursor, touch buttons. PixBuf only, deterministic.
import { PixBuf, hash2 } from './pixbuf.js';
import { PAL } from '../core/defs.js';
import { build as buildColby } from './colby.js';

const O = PAL.outline;
const mk = (w, h) => new PixBuf(w, h);
const four = (fn) => [0, 1, 2, 3].map((f) => fn(f, mk(16, 16)));

function splash(f, b) {
  const r = [3, 5, 6, 7][f], up = [3, 6, 5, 2][f];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = 8 + s * Math.round(r * (0.4 + i * 0.35)), y = 12 - Math.round(up * (1 - Math.abs(i - 1) * 0.45)) + (f > 1 ? i : 0);
    b.rect(x - (s < 0 ? 1 : 0), y, 2, 2, i === 1 ? PAL.waterL : PAL.white);
  }
  b.rect(7, 12 - up, 2, 2 + (f < 2 ? 1 : 0), PAL.waterL); b.set(8, 11 - up, PAL.white);
  b.hline(8 - r - 1, 13, 2 * r + 2, PAL.waterL); b.hline(8 - r, 14, 2 * r, PAL.water);
  if (f === 3) b.hline(2, 15, 12, PAL.waterD);
  return b;
}
function squash(f, b) {
  const R = [3, 6, 7, 7][f], r = [2, 3, 4, 5][f];
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, d = i % 2 ? r : R; pts.push([8 + Math.cos(a) * d, 8 + Math.sin(a) * d]); }
  b.poly(pts, f > 2 ? PAL.fireD : PAL.shieldY);
  if (f < 3) { const c = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, d = (i % 2 ? r : R) * 0.55; c.push([8 + Math.cos(a) * d, 8 + Math.sin(a) * d]); } b.poly(c, f === 0 ? PAL.white : PAL.fireL); }
  return b.outline(O);
}
function dust(f) {
  const b = mk(8, 8), r = [1, 2, 2, 3][f];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) b.circle(4 + dx * f, 5 + dy * (f > 1 ? 1 : 0), r - (f === 3 ? 1 : 0), f < 2 ? PAL.cream : PAL.curbL);
  if (f === 3) { b.erase(4, 5); }
  b.hline(1, 7, 6 - f, PAL.curb);
  return b;
}
function sparkle(f) {
  const b = mk(8, 8), L = [1, 3, 2, 1][f], c = f === 1 ? PAL.white : PAL.shieldY;
  b.hline(4 - L, 4, 2 * L + 1, c); b.vline(4, 4 - L, 2 * L + 1, c);
  b.set(3, 3, PAL.white); b.set(4, 4, f === 3 ? PAL.fireL : PAL.white);
  if (f === 1) { b.set(2, 2, PAL.fireL); b.set(6, 6, PAL.fireL); b.set(2, 6, PAL.fireL); b.set(6, 2, PAL.fireL); }
  return b;
}
function ripple(f, b) {
  for (let k = 0; k < 2; k++) {
    const t = f - k * 2; if (t < 0) continue;
    const rx = 2 + t * 2, ry = 1 + t;
    b.ring(8, 8, rx, ry, t > 1 ? PAL.waterL : PAL.white);
  }
  if (f === 0) b.rect(7, 7, 2, 2, PAL.white);
  return b;
}
function poof(f, b) {
  const R = [3, 4, 5, 6][f];
  const blobs = [[0, 0, R], [-R * 0.7, 1, R - 1], [R * 0.7, 1, R - 1], [0, -R * 0.5, R - 1], [0, R * 0.4, R - 1]];
  const body = f < 3 ? PAL.white : PAL.curbL;
  for (const [dx, dy, r] of blobs) b.circle(8 + Math.round(dx), 8 + Math.round(dy), Math.max(1, r - 1), PAL.curbL);
  for (const [dx, dy, r] of blobs) b.circle(8 + Math.round(dx) - 1, 8 + Math.round(dy) - 1, Math.max(1, r - 2), body);
  if (f === 3) for (let i = 0; i < 40; i++) { const x = (hash2(i, 5, 9) * 16) | 0, y = (hash2(i, 6, 9) * 16) | 0; if (hash2(x, y, 3) > 0.45) b.erase(x, y); }
  return b.outline(O);
}
function smoke(f) {
  const b = mk(8, 8), y = 6 - f, r = [1, 2, 2, 3][f];
  b.circle(4, y, r, f < 2 ? PAL.curbL : PAL.curb);
  b.circle(3 + (f & 1), y + 1, Math.max(1, r - 1), PAL.tarL);
  if (f > 1) for (let i = 0; i < 6; i++) b.erase((hash2(i, f, 4) * 8) | 0, (hash2(i, f, 5) * 8) | 0);
  return b;
}

// ---- logo ----
const FONT = {
  P: ['1111 ', '1   1', '1   1', '1111 ', '1    ', '1    ', '1    '],
  W: ['1   1', '1   1', '1   1', '1 1 1', '1 1 1', '11 11', '1   1'],
  G: [' 111 ', '1   1', '1    ', '1 111', '1   1', '1   1', ' 111 '],
  E: ['11111', '1    ', '1    ', '1111 ', '1    ', '1    ', '11111'],
  R: ['1111 ', '1   1', '1   1', '1111 ', '1 1  ', '1  1 ', '1   1'],
};
function letterMask(ch, S) {
  const m = mk(5 * S, 7 * S);
  if (ch === 'A') { // paw print
    m.ellipse(12, 24, 9, 7, PAL.white);
    m.circle(12, 8, 4, PAL.white); m.circle(4, 14, 3, PAL.white); m.circle(20, 14, 3, PAL.white);
    m.circle(12, 8, 4, PAL.white);
    return m;
  }
  FONT[ch].forEach((row, j) => [...row].forEach((c, i) => { if (c === '1') m.rect(i * S, j * S, S, S, PAL.white); }));
  return m;
}
function logo() {
  const W = 208, H = 48, S = 5, gap = 4, ex = 3;
  const text = 'PAWGGER', x0 = Math.floor((W - (7 * 5 * S + 6 * gap)) / 2) - 1, y0 = 8;
  const mask = mk(W, H), side = mk(W, H), face = mk(W, H);
  const has = (x, y) => mask.has(x, y);
  [...text].forEach((ch, i) => mask.blit(letterMask(ch, S), x0 + i * (5 * S + gap), y0));
  for (let k = ex; k >= 1; k--) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (has(x, y)) side.set(x + k, y + k, k > ex - 2 ? PAL.stripe : PAL.furD);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!has(x, y)) continue;
    let c = PAL.fur;
    if (!has(x, y - 1) || !has(x - 1, y)) c = PAL.furL;
    else if (!has(x, y - 2) || !has(x - 2, y)) c = PAL.fureL || PAL.furL;
    if (!has(x + 1, y) || !has(x, y + 1)) c = PAL.furD;
    if (c === PAL.fur && y - y0 > 22 && ((x + y) & 1) === 0 && !has(x, y + 3)) c = PAL.furD;
    face.set(x, y, c);
  }
  // yellow gleam on top edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (has(x, y) && !has(x, y - 1) && !has(x - 1, y - 1) && ((x >> 1) & 1) === 0) face.set(x, y, PAL.shieldY);
  const b = mk(W, H); b.blit(side).blit(face);
  b.outline(O, { diagonal: true });
  // paw toe pads (dark dots on the A pad)
  const ax = x0 + 1 * (5 * S + gap);
  b.circle(ax + 12, y0 + 24, 3, PAL.furD); b.circle(ax + 12, y0 + 24, 2, PAL.nose);
  // frog hat on first G (index 3)
  const gx = x0 + 3 * (5 * S + gap) + 3, gy = y0 - 1;
  const hat = mk(19, 9);
  hat.rect(1, 3, 17, 5, PAL.leafM); hat.rect(2, 2, 15, 1, PAL.leafM); hat.hline(2, 3, 15, PAL.leafL); hat.hline(1, 7, 17, PAL.leaf);
  hat.circle(4, 2, 2, PAL.leafL); hat.circle(14, 2, 2, PAL.leafL);
  hat.rect(3, 1, 2, 2, PAL.white); hat.rect(13, 1, 2, 2, PAL.white); hat.set(4, 2, O); hat.set(14, 2, O);
  hat.outline(O);
  b.blit(hat, gx, gy - 6);
  return b;
}

// ---- title scene ----
function logRow(b, x, y, w) {
  b.rect(x, y, w, 8, PAL.log); b.hline(x, y, w, PAL.logRing); b.hline(x, y + 7, w, PAL.logD);
  b.rect(x, y, 2, 8, PAL.logRing); b.rect(x + w - 2, y, 2, 8, PAL.logD);
  for (let i = 8; i < w - 6; i += 9) b.hline(x + i, y + 3, 3, PAL.logD);
}
function carRow(b, x, y, main, dark) {
  b.rect(x, y + 2, 26, 11, main); b.hline(x, y + 12, 26, dark); b.rect(x + 16, y + 3, 4, 9, PAL.glass); b.rect(x + 7, y + 3, 8, 9, dark);
  b.rect(x + 3, y, 5, 2, PAL.tire); b.rect(x + 3, y + 13, 5, 2, PAL.tire); b.rect(x + 18, y, 5, 2, PAL.tire); b.rect(x + 18, y + 13, 5, 2, PAL.tire);
  b.rect(x + 25, y + 3, 1, 3, PAL.headlight); b.rect(x + 25, y + 9, 1, 3, PAL.headlight);
  // outline pass
  const t = new PixBuf(40, 18); t.blit(b, -(x - 2), -(y - 1)); t.outline(O); b.blit(t, x - 2, y - 1);
}
function titleScene() {
  const b = mk(240, 120);
  // bank + hedge 0..15
  for (let y = 0; y < 16; y++) for (let x = 0; x < 240; x++) b.set(x, y, hash2(x, y, 1) > 0.8 ? PAL.leafD : PAL.leaf);
  for (let x = 0; x < 240; x += 8) { b.rect(x, 0, 8, 12, PAL.hedge); b.rect(x + 1, 1, 6, 3, PAL.hedgeL); b.hline(x, 11, 8, PAL.hedgeD); b.vline(x, 0, 12, PAL.hedgeD); }
  b.hline(0, 12, 240, PAL.dirtD); b.rect(0, 13, 240, 3, PAL.dirt);
  // river 16..63
  for (let y = 16; y < 64; y++) for (let x = 0; x < 240; x++) {
    const n = hash2(x >> 2, y >> 1, 2), band = ((y >> 4) & 1);
    b.set(x, y, ((x + y * 3) % 17 === 0 || n > 0.93) ? PAL.waterL : (n < 0.12 ? PAL.waterD : PAL.water));
  }
  logRow(b, 10, 20, 70); logRow(b, 130, 20, 90); logRow(b, 60, 38, 80); logRow(b, 190, 38, 60); logRow(b, 0, 52, 40); logRow(b, 100, 52, 64);
  // median 64..79
  for (let y = 64; y < 80; y++) for (let x = 0; x < 240; x++) b.set(x, y, hash2(x, y, 3) > 0.85 ? PAL.medianD : PAL.median);
  b.hline(0, 64, 240, PAL.curbL); b.hline(0, 79, 240, PAL.curb);
  // road 80..111
  for (let y = 80; y < 112; y++) for (let x = 0; x < 240; x++) b.set(x, y, hash2(x, y, 4) > 0.9 ? PAL.roadL : (hash2(x, y, 5) < 0.1 ? PAL.roadD : PAL.road));
  for (let x = 0; x < 240; x += 24) b.hline(x + 4, 95, 14, PAL.lane);
  carRow(b, 150, 82, PAL.carRed, PAL.carRedD); carRow(b, 30, 98, PAL.carBlue, PAL.carBlueD); carRow(b, 196, 98, PAL.carYellow, PAL.carYellowD);
  b.hline(0, 112, 240, PAL.curb);
  for (let y = 113; y < 120; y++) for (let x = 0; x < 240; x++) b.set(x, y, hash2(x, y, 6) > 0.8 ? PAL.grassD : PAL.grass);
  // Colby mid-hop over the median, shadow below
  let cb = null;
  try { cb = buildColby().colby_up[1]; } catch { /* colby module missing: strip stays empty */ }
  addColby(b, cb);
  for (const [x, y] of [[0, 0], [239, 0], [0, 119], [239, 119]]) b.erase(x, y); // rounded corners (sheet tool wants a non-opaque sprite)
  return b;
}
function addColby(scene, colbyFrame) {
  if (!colbyFrame) return scene;
  const big = colbyFrame.scaled(2); // 32x32
  const x = 104, y = 48;
  for (let i = -14; i <= 14; i++) for (let j = -3; j <= 3; j++) if ((i * i) / 196 + (j * j) / 9 <= 1 && scene.get(120 + i, 76 + j)) scene.set(120 + i, 76 + j, PAL.medianD);
  scene.blit(big, x, y);
  return scene;
}

// ---- ui ----
function cursor(f) {
  const b = mk(10, 10), y = f ? 1 : 0;
  b.circle(5, 7 + y, 3, PAL.fur); b.rect(3, 6 + y, 5, 3, PAL.fur);
  for (const [x, yy] of [[1, 3], [4, 1], [7, 1], [9, 3]]) b.rect(x - 1 + (x === 9 ? 0 : 0), yy + y, 2, 2, PAL.furL);
  b.set(5, 8 + y, PAL.nose); b.set(4, 8 + y, PAL.nose); b.set(6, 8 + y, PAL.nose);
  return b.outline(O);
}
function touchBtn(f) {
  const b = mk(32, 32), p = f === 1;
  b.circle(15, 16, 14, p ? PAL.shirtD : PAL.shirt);
  b.ring(15, 16, 14, 14, O, 1); b.ring(15, 16, 13, 13, p ? PAL.outline : PAL.shirtL, 1);
  if (!p) { b.circle(12, 12, 6, PAL.shirtL); b.circle(15, 16, 9, PAL.shirt); b.circle(13, 14, 7, PAL.shirt); }
  else b.circle(15, 16, 9, PAL.shirtD);
  b.ring(15, 16, 14, 14, O, 1);
  return b;
}
function arrow(dir) {
  const b = mk(16, 16);
  const up = [[8, 3], [13, 9], [10, 9], [10, 13], [6, 13], [6, 9], [3, 9]];
  const rot = (p) => { let [x, y] = p; for (let i = 0; i < dir; i++) [x, y] = [15 - y, x]; return [x, y]; };
  b.poly(up.map(rot), PAL.white);
  b.outline(O);
  return b;
}

export function build() {
  const out = {
    fx_splash: four(splash), fx_squash: four(squash), fx_dust: [0, 1, 2, 3].map(dust), fx_sparkle: [0, 1, 2, 3].map(sparkle),
    fx_ripple: four(ripple), fx_poof: four(poof), fx_smoke: [0, 1, 2, 3].map(smoke),
    logo: logo(), title_scene: titleScene(), cursor_paw: [cursor(0), cursor(1)], touch_btn: [touchBtn(0), touchBtn(1)],
    touch_arrow: [0, 1, 2, 3].map(arrow),
  };
  return out;
}
