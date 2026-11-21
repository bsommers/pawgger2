// Example: art-kit tiles + scenery packed into a sheet with a validated manifest, and fx-kit's day/night sky.
// Run: node src/kits/examples/art-and-fx.mjs -> out/kit-sheet.png (4x) and out/kit-sky.txt
import { makeTile, makeScenery, packSheet, validateManifest, encodePng } from '../art-kit/index.js';
import { skyRamp, DAY_NIGHT_STOPS, makeSilhouetteStrip } from '../fx-kit/index.js';

const sprites = {};
for (const k of ['dirt', 'stone', 'brick', 'grass', 'water', 'planks']) sprites['tile_' + k] = makeTile(k, 16, {}, 7);
for (const k of ['tree', 'bush', 'cloud', 'rock']) sprites['scn_' + k] = makeScenery(k);
sprites.fg_trees = makeSilhouetteStrip('trees', 96, 32);
const { sheet, manifest } = packSheet(sprites, { width: 160 });
const problems = validateManifest(manifest, sheet, Object.keys(sprites));
console.log(problems.length ? problems : 'manifest ok', sheet.w + 'x' + sheet.h);
if (import.meta.url === `file://${process.argv[1]}`) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('out', { recursive: true });
  writeFileSync('out/kit-sheet.png', encodePng(sheet, 4));
  writeFileSync('out/kit-sky.txt', [0, 0.25, 0.55, 0.7, 0.85].map((t) => `${t} ${JSON.stringify(skyRamp(DAY_NIGHT_STOPS, t))}`).join('\n') + '\n');
}
