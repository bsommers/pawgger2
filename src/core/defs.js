// Pawgger canonical data. FROZEN (orchestrator) except the numbers in TUNING, which sim-core may adjust.
// Node-safe: no DOM at import time. Every module imports constants from here; never duplicate numbers.
// NOTE for editors: never write a star-slash inside a block comment (it ends the comment). Use // notes.

// ---------------------------------------------------------------- display & layout (logical pixels)
export const W = 240, H = 256;               // logical canvas (15 x 16 cells of 16px); integer scaled, pixelated
export const CELL = 16, COLS = 15, ROWS = 16;
export const FPS = 60, DT = 1 / 60;          // fixed sim step

// Row map, top to bottom. y of row r = r * CELL. Hop targets are rows 1..13 (the frog never enters HUD rows).
export const ROW = Object.freeze({
  hudTop: 0,                                  // score / hi-score strip
  bays: 1,                                    // home bays row (5 bays) with hedge between them
  river: [2, 3, 4, 5, 6],                     // 5 river lanes (row 2 = nearest the bays, row 6 = nearest the median)
  median: 7,                                  // safe strip (Pete's roller may cross it on later levels)
  road: [8, 9, 10, 11, 12],                   // 5 road lanes (row 8 = nearest the median, row 12 = nearest the start)
  start: 13,                                  // safe start strip
  hudBottom: [14, 15],                        // lives, timer bar, level, messages
});
export const FROG_MIN_ROW = 1, FROG_MAX_ROW = 13, START_ROW = 13, START_COL = 7;
export const BAY_COLS = Object.freeze([1, 4, 7, 10, 13]);   // bay centre columns; a bay is open |x - cx| <= bayReach px
export const colX = (col) => col * CELL + CELL / 2;           // centre x of a grid column
export const rowY = (row) => row * CELL + CELL / 2;           // centre y of a grid row
export const LAYOUT = Object.freeze({
  playTop: CELL, playBottom: 14 * CELL,       // y range of the playfield (rows 1..13)
  riverTop: 2 * CELL, riverBottom: 7 * CELL,  // water band y 32..111
  roadTop: 8 * CELL, roadBottom: 13 * CELL,   // asphalt band y 128..207
  skylineH: 16,                               // skyline strip drawn behind the HUD top (art 'bg_skyline')
});

// ---------------------------------------------------------------- palette (all art uses ONLY these + shade()/mix() of them)
// The first block is PawFall's PAL verbatim, so Colby and Pete sprites from the shared library match.
export const PAL = Object.freeze({
  peteHL: '#9a96a8', hatHL: '#e8d68a', scarfHL: '#ff6a58',
  outline: '#1a1420', black: '#0a0710', white: '#fff6e0',
  // colby (orange tabby; SuperColby costume below)
  furD: '#b8561a', fur: '#f08a24', furL: '#ffc26a', cream: '#fff0d0', stripe: '#a8430f', nose: '#ff8fa3', eye: '#7bd44a', eyeD: '#1f4a12',
  hat: '#c9b26a', hatD: '#8f7a3c', hatBand: '#8a2a1a', scarf: '#d63a2f', boot: '#5a3a1a',
  // SuperColby costume (blue shirt, red/yellow C shield, orange cape)
  shirt: '#3a6fc4', shirtD: '#28508f', shirtL: '#5a8ee0', shieldR: '#d63a2f', shieldY: '#ffd23a', cape: '#d23c1c', capeD: '#8a240c', capeL: '#f0663a',
  // pete v1 suit colours (still used by HUD panels, mountains, registry tints)
  peteFur: '#7a7688', peteFurD: '#4f4b5e', peteSuit: '#2a2f55', peteSuitL: '#444c85', peteStripe: '#8d96d6', peteTie: '#ffd23a', peteTooth: '#ffd23a', peteShade: '#0a0710', peteEar: '#e8a0b0',
  // pete v2 (feral sewer rat: dark matted fur, red eyes, fangs, tactical vest)
  ratD: '#2a2420', rat: '#4a423b', ratL: '#72675c', ratBelly: '#5e564e', ratSkin: '#b07a78', ratSkinD: '#7a4e4e', ratEye: '#ff2a2a', ratEyeL: '#ffb0a0', fang: '#f0e2a8', drool: '#e8f0f0', vest: '#2c2e2a', vestL: '#4a4d46', vestD: '#161814',
  // jungle
  leafD: '#0b3d1a', leaf: '#1d7a2c', leafM: '#2f9a34', leafL: '#3fae3f', leafHL: '#8ad65a', leafDark2: '#06240f',
  trunkD: '#3d2610', trunk: '#5a3a1a', trunkL: '#7b4f26', trunkHL: '#a06a34',
  path: '#d9a441', pathD: '#a87a2a', pathL: '#f0c868', grass: '#2f9a34', grassD: '#1d7a2c',
  dirt: '#5a3a22', dirtD: '#3a2416', dirtL: '#7a5232', brick: '#a0522d', brickD: '#6e3319', brickL: '#c4744a', mortar: '#2a1810', tunnelDark: '#120a12', tunnelMid: '#241420',
  water: '#2a6fd6', waterD: '#1b4a9a', waterL: '#7ec8ff', tar: '#1a1420', tarL: '#3a2f48', quick: '#e0c060', quickD: '#b8903a', slime: '#8ad65a',
  // critters
  log: '#8a5a2a', logD: '#5a3a1a', logRing: '#c48a4a', fire: '#ff7a1a', fireL: '#ffd23a', fireD: '#d63a2f',
  snake: '#3fae3f', snakeD: '#1d7a2c', snakeBelly: '#e8e0a0', croc: '#4f8a3a', crocD: '#2f5a28', crocMouth: '#e86a7a', tooth: '#fff6e0',
  scorp: '#c4c4d0', scorpD: '#7a7688', cheese: '#ffd23a', cheeseD: '#d9a41a', cheeseHole: '#a87a2a',
  // treasures
  gold: '#ffd23a', goldD: '#d9a41a', silver: '#d8e0f0', silverD: '#8d96b8', gem: '#7ee8ff', gemD: '#2a9ad6', tuna: '#ff7a8a', can: '#c8d0e0',
  // ui
  hudBg: '#0a0710', hudTxt: '#ffd23a', hudDim: '#8d7a3a', red: '#ff4a3a', green: '#6cf06c',

  // traffic & river (Pawgger additions)
  road: '#3a3a48', roadD: '#2a2a36', roadL: '#4a4a5c', lane: '#e8e0a0', curb: '#8d8aa0', curbL: '#b8b4c8',
  carRed: '#d63a2f', carRedD: '#8a2418', carBlue: '#3a6fc4', carBlueD: '#28508f', carYellow: '#ffd23a', carYellowD: '#d9a41a', carGreen: '#3fae3f', carGreenD: '#1d7a2c',
  glass: '#7ec8ff', glassD: '#2a6fd6', tire: '#14101a', chrome: '#d8e0f0', headlight: '#fff6a0', taillight: '#ff4a3a',
  pickle: '#6cb83a', pickleD: '#3f7a1d', limoBlack: '#1e1c28', limoL: '#3a3850', gutter: '#6a6a7e',
  median: '#4aa83a', medianD: '#2f7a28', hedge: '#1d7a2c', hedgeD: '#0b3d1a', hedgeL: '#3fae3f', bayWater: '#1b4a9a',
  turtleShell: '#3f9a4a', turtleShellD: '#1d6a2c', turtleSkin: '#8ad65a', mouse: '#b8b4c8', mouseD: '#7a7688', fish: '#ff9a4a', fishD: '#d6602a',
});

// Sky: 7 bands behind the skyline/HUD, driven by level (day -> golden hour -> dusk -> night, repeating every 5 levels).
export const SKY_KEYS = Object.freeze([
  { t: 0.00, bands: ['#3a8ae6', '#4a98ee', '#5aa6f2', '#6ab4f4', '#7ec2f6', '#94d0f8', '#b0e0fa'], sun: '#fff6a0', star: 0 },
  { t: 0.45, bands: ['#3a78d6', '#5a8ee0', '#7aa0e0', '#a8b0d8', '#e0b8b0', '#f0c890', '#f8d878'], sun: '#ffe060', star: 0 },
  { t: 0.75, bands: ['#4a3a8a', '#7a4a9a', '#b0508a', '#d86a6a', '#f08a4a', '#f8aa3a', '#ffd04a'], sun: '#ff8a2a', star: 0.3 },
  { t: 1.00, bands: ['#080820', '#0c0c30', '#121440', '#1a1a52', '#24246a', '#303080', '#3c3c94'], sun: '#dfe8ff', star: 1 },
]);
// t01 in [0,1]. Use skyForLevel(level) for the level colour, or pass a smoothed value yourself.
export function skyFor(t01) {
  const k = SKY_KEYS, t = Math.max(0, Math.min(1, t01));
  let i = 0; while (i < k.length - 2 && t > k[i + 1].t) i++;
  const a = k[i], b = k[i + 1], u = a.t === b.t ? 0 : (t - a.t) / (b.t - a.t);
  const hex = (c) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16));
  const mixc = (c1, c2) => '#' + hex(c1).map((v, n) => Math.round(v + (hex(c2)[n] - v) * u).toString(16).padStart(2, '0')).join('');
  return { bands: a.bands.map((c, n) => mixc(c, b.bands[n])), sun: mixc(a.sun, b.sun), star: a.star + (b.star - a.star) * u };
}
export function skyForLevel(level) { return skyFor(((level - 1) % 5) / 4); }   // level 1 = day ... level 5 = night, then repeats
export function isNight(level) { return ((level - 1) % 5) >= 3; }              // headlights glow on road lanes

// ---------------------------------------------------------------- rules / tuning (px, seconds)
export const START_LIVES = 3;
export const EXTRA_LIFE_AT = 20000;           // one extra life when the score first passes this (once)
export const BAYS = 5;

export const TUNING = {                       // sim-core may tune these numbers (nothing else in this file)
  hopTime: 0.12,                              // seconds a hop animation lasts; the move is applied at hop start, support is checked at the END
  hopBuffer: 0.10,                            // a hop press during a hop is buffered this long, then dropped
  attemptTime: 30,                            // seconds per attempt (one frog); level 1
  attemptTimeMin: 20, attemptTimeStep: 1,     // attempt time = max(min, attemptTime - step*(level-1))
  frogHalf: 5,                                // frog hitbox half-size (10x10 square centred on the frog)
  vehicleInset: 1,                            // vehicle hitbox shrinks by this many px per side
  supportInset: 2,                            // a platform supports the frog if frog.x is within [left+inset, right-inset]
  edgeDeath: 6,                               // frog centre beyond [-edgeDeath, W+edgeDeath] while carried => dies (off screen)
  bayReach: 7,                                // |x - bayCentreX| <= this to land in a bay (else dies on the hedge)
  hopSideMargin: 0,                           // horizontal hops cannot leave 0..W (clamped; cannot hop off screen)
  deathTime: 1.1, respawnInvuln: 0.8,
  introTime: 1.5, clearTime: 2.2,
  roadSpeed: [22, 30, 38, 28, 46],            // level-1 base speed px/s for road lanes 8..12 (generator may jitter within +-12%)
  riverSpeed: [18, 26, 22, 30, 20],           // level-1 base speed px/s for river lanes 2..6
  speedGrowth: 0.10, speedCap: 2.2,           // speed scale = min(cap, 1 + growth*(level-1))
  turtlePeriod: 6.0, turtleWarn: 0.6, turtleDown: 1.4,   // dive cycle: up (period - warn - down), warn (sinking), down (no support)
  crocPeriod: 5.0, crocOpenFrac: 0.35,        // croc head cell is lethal while the mouth is open
  bayHazardPeriod: 8.0,                       // a bay hazard (croc head / snake) appears for bayHazardOn seconds each period
  bayHazardOn: 3.0,
  bonusPeriod: 14.0, bonusOn: 5.0,            // a mouse or fish appears in an empty bay for bonusOn seconds each bonusPeriod
  peteFromLevel: 2, peteRollerFromLevel: 3,   // Pete limo + taunts from level 2, median cheese roller from level 3
  rollerWarn: 1.0, rollerSpeed: 130, rollerEvery: 9.0,   // roller telegraph s, px/s, base interval s (shrinks with level)
};
export const attemptTimeFor = (level) => Math.max(TUNING.attemptTimeMin, TUNING.attemptTime - TUNING.attemptTimeStep * (level - 1));
export const speedScale = (level) => Math.min(TUNING.speedCap, 1 + TUNING.speedGrowth * (level - 1));

export const SCORES = Object.freeze({
  forwardRow: 10,                             // each time the frog reaches a row further up than ever before this attempt
  bay: 50, bayTimePerSec: 10,                 // bay fill + remaining seconds * this
  allBays: 1000,                              // clearing the level (5 bays)
  mouse: 200, fish: 200,                      // bonus in a bay
  treasure: { tuna: 100, sardine: 200, gold: 300, collar: 500 },   // optional pickups riding on platforms / vehicles' lanes
});

// ---------------------------------------------------------------- lane / level data model
export const MAX_ITEM_W = 7 * CELL;           // widest item (long log) = 112 px; used for the wrap window
/**
 * KINDS: per item type: width in cells, lane kind, and what contact does.
 *  road items are always lethal on contact (rect overlap, see TUNING.vehicleInset).
 *  river items support the frog (rect rule TUNING.supportInset) unless noted.
 */
export const KINDS = Object.freeze({
  // road (all face RIGHT in art; renderer mirrors when lane.dir < 0)
  car:          { lane: 'road',  cells: 1, sprite: 'car',          variants: 3, note: 'small sedan, three colourways' },
  racer:        { lane: 'road',  cells: 1, sprite: 'racer',        variants: 1, note: 'fast low car; lane speed x1.0, used in the fastest lane' },
  truck:        { lane: 'road',  cells: 2, sprite: 'truck',        variants: 2, note: 'box truck' },
  pickle_truck: { lane: 'road',  cells: 2, sprite: 'pickle_truck', variants: 1, note: "Pete's Parkway Pickles delivery truck" },
  tuna_bus:     { lane: 'road',  cells: 3, sprite: 'tuna_bus',     variants: 1, note: 'a bus shaped like a tuna can' },
  limo:         { lane: 'road',  cells: 3, sprite: 'limo',         variants: 1, note: "Pete's limo; honks (sfx 'honk') as it enters the screen; Pete visible in the back" },
  cheese_roll:  { lane: 'road',  cells: 1, sprite: 'cheese_roll',  variants: 1, note: 'a runaway cheese wheel rolling along the road' },
  // river
  log_s:        { lane: 'river', cells: 3, sprite: 'log_s', variants: 1, note: 'short log, 48 px' },
  log_m:        { lane: 'river', cells: 5, sprite: 'log_m', variants: 1, note: 'medium log, 80 px' },
  log_l:        { lane: 'river', cells: 7, sprite: 'log_l', variants: 1, note: 'long log, 112 px' },
  turtle2:      { lane: 'river', cells: 2, sprite: 'turtle', variants: 1, dives: true, note: 'two turtles, dive on the turtle cycle' },
  turtle3:      { lane: 'river', cells: 3, sprite: 'turtle', variants: 1, dives: true, note: 'three turtles, dive on the turtle cycle' },
  croc:         { lane: 'river', cells: 4, sprite: 'croc_raft', variants: 1, headCells: 1, note: 'crocodile: back (3 cells, safe) + head (last cell in travel direction; lethal while mouth open, safe closed)' },
});
export const ROAD_KINDS = Object.freeze(Object.keys(KINDS).filter((k) => KINDS[k].lane === 'road'));
export const RIVER_KINDS = Object.freeze(Object.keys(KINDS).filter((k) => KINDS[k].lane === 'river'));
export const itemW = (type) => KINDS[type].cells * CELL;

/**
 * LaneDef (plain JSON-able, produced by levels/lanegen.js, deterministic per (level, seed)):
 * { row, kind: 'road'|'river'|'safe', dir: -1|1, speed (px/s, already level-scaled),
 *   loop (px, a multiple of CELL, >= W + MAX_ITEM_W; every item's span fits on it),
 *   items: [ { id, type (KINDS key), off (px along the loop, a multiple of CELL), variant?: 0.., phase?: seconds (dive/open phase offset),
 *              pickup?: null|'tuna'|'sardine'|'gold'|'collar' } ],
 *   tile: 'road'|'river'|'median'|'start' (ground art) }
 * LevelDef: { level, seed, timeLimit, lanes: LaneDef[13?] indexed by lane.row (rows 2..6 river, 8..12 road, optional 7 median),
 *             bays: { cols: BAY_COLS, hazards: [ {bay, kind:'croc'|'snake', phase} ], bonuses: [ {bay, kind:'mouse'|'fish', phase} ] },
 *             pete: null | { limoLane: row, tauntEvery: s, roller: boolean, rollerEvery: s }, sky: skyForLevel(level) }
 */

/** Left edge x of a lane item at sim time t (seconds). Pure; the loop wraps seamlessly. */
export function itemLeft(lane, item, t) {
  const p = item.off + lane.dir * lane.speed * t;
  const m = ((p % lane.loop) + lane.loop) % lane.loop;
  return m - MAX_ITEM_W;                      // visible when left < W and left + width > 0
}
/** Turtle cycle state at time t: 'up' (supports), 'warn' (sinking, still supports), 'down' (does NOT support). */
export function turtleState(item, t) {
  const P = TUNING.turtlePeriod, ph = (((t + (item.phase || 0)) % P) + P) % P;
  if (ph < P - TUNING.turtleWarn - TUNING.turtleDown) return 'up';
  if (ph < P - TUNING.turtleDown) return 'warn';
  return 'down';
}
/** Croc mouth at time t: 'closed' (head is safe, rideable) or 'open' (head is lethal). */
export function crocMouth(item, t) {
  const P = TUNING.crocPeriod, ph = (((t + (item.phase || 0)) % P) + P) % P;
  return ph < P * (1 - TUNING.crocOpenFrac) ? 'closed' : 'open';
}
/** Bay hazard / bonus visibility at time t for a descriptor {bay, kind, phase}. */
export function bayHazardOn(h, t) { const P = TUNING.bayHazardPeriod; return ((((t + h.phase) % P) + P) % P) < TUNING.bayHazardOn; }
export function bayBonusOn(b, t) { const P = TUNING.bonusPeriod; return ((((t + b.phase) % P) + P) % P) < TUNING.bonusOn; }

// ---------------------------------------------------------------- entities / state shapes (sim -> render)
/**
 * g.frog = { x (centre px, continuous), row (int 1..13), col (nearest int col, informational), face: 'up'|'down'|'left'|'right',
 *   mode: 'idle'|'hop'|'ride'|'dying'|'dead'|'home', pose, frame,   // pose+frame is what render draws (set where mode changes)
 *   hopT (0..1 progress of a hop, 0 when not hopping), fromRow, onItem: null|{lane:row,id}, inv (s),
 *   death: null|'car'|'water'|'offscreen'|'timeout'|'croc'|'snake'|'hedge'|'roller'|'turtle' }
 * g.pete = { state: 'off'|'limo'|'taunt'|'rollerWarn'|'roller', t, rollerX, rollerDir } (sim-owned; render draws the roller and the warning)
 * g.bays = [ { idx, col, filled:boolean, hazard:null|'croc'|'snake', bonus:null|'mouse'|'fish' } ]   (recomputed each tick from t)
 */
export const FROG_MODES = Object.freeze(['idle', 'hop', 'ride', 'dying', 'dead', 'home']);
export const DEATHS = Object.freeze(['car', 'water', 'offscreen', 'timeout', 'croc', 'snake', 'hedge', 'roller', 'turtle']);
export const GAME_STATES = Object.freeze(['intro', 'play', 'dying', 'levelclear', 'gameover']);

// ---------------------------------------------------------------- events (bus.emit(type, payload); sim emits, render/audio/ui subscribe)
export const EVENTS = Object.freeze([
  'sfx',        // { name, x?, y? }
  'music',      // { name|null }
  'fx',         // { type, x, y, opts? }     types: 'splash','dust','sparkle','squash','poof','confetti','ripple','smoke'
  'shake',      // { mag, dur }
  'popup',      // { text, x, y, color? }    floating text e.g. '+50'
  'hop',        // { fromRow, toRow, dir }
  'row',        // { row, score }            reached a new furthest row this attempt
  'bay',        // { idx, bonus?, timeBonus, score }
  'pickup',     // { type, value, x, y }
  'score',      // { score, delta }
  'life',       // { lives, reason }         reason in DEATHS
  'timer',      // { left }                  once per second
  'taunt',      // { text, dur }             Pete barks (HUD banner)
  'banner',     // { text, sub?, dur }
  'state',      // { state }                 one of GAME_STATES
  'level',      // { level }                 new level started
  'levelclear', // { level, score }
  'gameover',   // { score, level }
  'pause',      // { on }
]);

// ---------------------------------------------------------------- audio names (audio-sfx implements SFX; audio-music implements MUSIC)
export const SFX = Object.freeze([
  'hop', 'hop_log', 'land_safe', 'row_up', 'splash', 'squash', 'honk', 'honk_far', 'croc_snap', 'snake_hiss', 'turtle_dive', 'roller_rumble', 'roller_warn',
  'bay_fill', 'bay_all', 'bonus', 'pickup', 'tick_low', 'die', 'respawn', 'oneup', 'pete_laugh', 'level_clear',
  'menu_move', 'menu_select', 'gameover', 'start',
]);
export const MUSIC = Object.freeze(['title', 'level_day', 'level_dusk', 'level_night', 'levelclear', 'gameover']);   // loops except levelclear/gameover (stings)
export const musicForLevel = (level) => { const k = (level - 1) % 5; return k < 2 ? 'level_day' : k === 2 ? 'level_dusk' : 'level_night'; };

// ---------------------------------------------------------------- art manifest (art agents implement; tools/sheet.mjs <module> validates)
// kind 'sprite' = transparent bg; 'tile' = fully opaque, tileable. Sizes are exact. frames = animation frames (PixBuf[] when >1).
// Top-down view. Vehicles/animals face RIGHT; the renderer mirrors when lane.dir < 0. Everything is centred in its box.
const A = (module, name, w, h, frames, kind, desc) => ({ module, name, w, h, frames, kind, desc });
export const ART = Object.freeze([
  // --- module 'colby' : hero, villain, bay occupants, HUD icons
  A('colby', 'colby_up', 16, 16, 3, 'sprite', 'SuperColby from above facing UP: 0 sitting, 1 mid-hop stretched, 2 landing squash; red/yellow C shield on the cape, tail behind'),
  A('colby', 'colby_down', 16, 16, 3, 'sprite', 'facing DOWN (toward the viewer): 0 sitting, 1 mid-hop, 2 landing'),
  A('colby', 'colby_side', 16, 16, 3, 'sprite', 'facing RIGHT (mirrored for left): 0 sitting, 1 mid-hop, 2 landing'),
  A('colby', 'colby_drown', 16, 16, 4, 'sprite', 'splash death: flailing, paws up, sinking, bubbles (frame 3 = only ripples)'),
  A('colby', 'colby_squash', 16, 16, 3, 'sprite', 'flattened by a vehicle: pancake cat with swirly eyes, then stars'),
  A('colby', 'colby_home', 16, 16, 2, 'sprite', 'Colby cheering in a filled bay, paws up (2 frame loop)'),
  A('colby', 'colby_life', 8, 8, 1, 'sprite', 'tiny Colby head for the lives counter'),
  A('colby', 'pete_idle', 40, 48, 2, 'sprite', 'Perring Parkway Pete, feral vested rat, full figure (title/cutscene)'),
  A('colby', 'pete_laugh', 40, 48, 2, 'sprite', 'Pete laughing, jaws wide, body shaking'),
  A('colby', 'pete_head', 16, 16, 2, 'sprite', 'Pete head icon for taunt banners (frame 1 = grin)'),
  A('colby', 'bay_mouse', 16, 16, 2, 'sprite', 'bonus mouse in a bay (2 frames, ears twitch)'),
  A('colby', 'bay_fish', 16, 16, 2, 'sprite', 'bonus fish flopping in a bay'),
  // --- module 'vehicles' : road traffic. Each is exactly cells*16 wide, 16 tall, wheels animate over 2 frames
  A('vehicles', 'car', 16, 16, 6, 'sprite', 'sedan top-down: 3 colourways x 2 wheel frames, frames [v*2 + f]'),
  A('vehicles', 'racer', 16, 16, 2, 'sprite', 'low fast racing car with a spoiler, 2 frames'),
  A('vehicles', 'truck', 32, 16, 4, 'sprite', 'box truck: 2 colourways x 2 frames, frames [v*2 + f]'),
  A('vehicles', 'pickle_truck', 32, 16, 2, 'sprite', "Pete's Parkway Pickles delivery truck, giant pickle on the roof, 2 frames"),
  A('vehicles', 'tuna_bus', 48, 16, 2, 'sprite', 'bus shaped like a tuna can with fish-logo windows, 2 frames'),
  A('vehicles', 'limo', 48, 16, 2, 'sprite', "Pete's long black limo, sunroof with Pete peeking out; frame 1 = honk flash"),
  A('vehicles', 'cheese_roll', 16, 16, 4, 'sprite', 'runaway cheese wheel, 4 rotation frames'),
  A('vehicles', 'headlight', 16, 16, 1, 'sprite', 'additive-looking soft yellow glow cone, RIGHT-facing, for night levels; drawn at the vehicle front'),
  // --- module 'river' : platforms and bay hazards
  A('river', 'log_s', 48, 16, 1, 'sprite', 'short log, side-on rings at both ends, bark texture'),
  A('river', 'log_m', 80, 16, 1, 'sprite', 'medium log'),
  A('river', 'log_l', 112, 16, 1, 'sprite', 'long log'),
  A('river', 'turtle', 16, 16, 5, 'sprite', 'ONE turtle top-down: 0,1 swimming (flipper alternate), 2,3 sinking (warn, shell dimmer, bubbles), 4 submerged ripple only; renderer tiles one per cell'),
  A('river', 'croc_raft', 64, 16, 2, 'sprite', 'crocodile 4 cells long facing RIGHT: 3 cells back + head at the right; frame 0 mouth closed, frame 1 mouth open with teeth'),
  A('river', 'bay_croc', 16, 16, 2, 'sprite', 'crocodile head lurking in a bay: 0 eyes only, 1 jaws open'),
  A('river', 'bay_snake', 16, 16, 2, 'sprite', 'snake in a bay: 0 coiled, 1 striking'),
  A('river', 'tr_tuna', 12, 12, 3, 'sprite', 'tuna tin pickup + shimmer'),
  A('river', 'tr_sardine', 12, 12, 3, 'sprite', 'silver sardine pickup + shimmer'),
  A('river', 'tr_gold', 12, 12, 3, 'sprite', 'gold bar pickup + shimmer'),
  A('river', 'tr_collar', 12, 12, 3, 'sprite', 'diamond collar pickup + sparkle'),
  // --- module 'world' : ground, backdrop, scenery. Tiles are 16x16 unless noted
  A('world', 'tile_road', 16, 16, 2, 'tile', 'asphalt, 2 variants with subtle speckle; lane-direction neutral'),
  A('world', 'tile_road_line', 16, 16, 1, 'tile', 'asphalt with a dashed lane divider along the TOP edge'),
  A('world', 'tile_road_edge', 16, 16, 2, 'tile', 'asphalt meeting a kerb on its BOTTOM edge (0) / TOP edge (1)'),
  A('world', 'tile_median', 16, 16, 2, 'tile', 'grassy safe strip with flowers (2 variants)'),
  A('world', 'tile_start', 16, 16, 2, 'tile', 'paved start strip with painted paw prints (2 variants)'),
  A('world', 'tile_water', 16, 16, 4, 'tile', 'river water, 4 ripple frames, seamless in x and y'),
  A('world', 'tile_bank', 16, 16, 1, 'tile', 'reeds and mud strip along the river top edge, under the bays'),
  A('world', 'tile_hedge', 16, 16, 2, 'tile', 'jungle hedge between bays (2 variants); lethal to land on'),
  A('world', 'bay_empty', 16, 16, 1, 'tile', 'an open bay: dark pond with a lily pad, framed by hedge'),
  A('world', 'bay_filled', 16, 16, 1, 'tile', 'the same bay but plain lily pad (Colby is drawn over it as colby_home)'),
  A('world', 'bg_skyline', 240, 32, 1, 'sprite', 'city skyline silhouette with Pete\'s PICKLES billboard, tileable x, drawn behind the HUD top'),
  A('world', 'bg_jungle', 240, 32, 2, 'sprite', 'jungle canopy silhouette strip (2 variants), tileable x'),
  A('world', 'cloud', 40, 14, 3, 'sprite', 'blocky cloud, 3 variants'),
  A('world', 'sun', 20, 20, 1, 'sprite', 'sun/moon disc, tinted by skyFor().sun'),
  A('world', 'star', 3, 3, 2, 'sprite', 'night star twinkle, 2 frames'),
  A('world', 'lamp', 16, 16, 2, 'sprite', 'street lamp seen from above with a glow ring (2 frames); drawn on the median at night'),
  A('world', 'roller_warn', 16, 16, 2, 'sprite', 'red exclamation / arrow marker warning of the cheese roller, 2 flash frames'),
  // --- module 'fx' : effects + UI art
  A('fx', 'fx_splash', 16, 16, 4, 'sprite', 'water splash burst'),
  A('fx', 'fx_squash', 16, 16, 4, 'sprite', 'comic impact star'),
  A('fx', 'fx_dust', 8, 8, 4, 'sprite', 'hop dust puff'),
  A('fx', 'fx_sparkle', 8, 8, 4, 'sprite', 'pickup/bay sparkle'),
  A('fx', 'fx_ripple', 16, 16, 4, 'sprite', 'expanding ring ripple on water'),
  A('fx', 'fx_poof', 16, 16, 4, 'sprite', 'poof cloud'),
  A('fx', 'fx_smoke', 8, 8, 4, 'sprite', 'tyre smoke puff'),
  A('fx', 'logo', 208, 48, 1, 'sprite', 'PAWGGER title logo: chunky 3D blocky letters, orange/yellow, dark outline, a paw print for the A, tiny frog-hat on the first G'),
  A('fx', 'title_scene', 240, 120, 1, 'sprite', 'title backdrop strip: road and river cross-section with Colby mid-hop; no text'),
  A('fx', 'cursor_paw', 10, 10, 2, 'sprite', 'menu cursor paw (2 frames bob)'),
  A('fx', 'touch_btn', 32, 32, 2, 'sprite', 'round touch button base (frame 1 = pressed), no glyph'),
  A('fx', 'touch_arrow', 16, 16, 4, 'sprite', 'arrow glyphs up/right/down/left drawn over touch_btn'),
]);
export function artManifest() { return ART; }
