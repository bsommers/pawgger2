# Content kits (`src/kits/`, copied by `factory new --web`)

Zero-dependency, Node-safe, tested ES modules extracted from PawFall (and its sibling games). Each kit works in Node (tests, tools) and the browser. `src/kits/index.js` re-exports all of them as namespaces (`art`, `character`, `audio`, `fx`, `docs`). Tests: `node --test test/kits/*.test.mjs`. Examples live in `src/kits/examples/` and write to `out/`.

| Kit | Folder | Gives you |
|---|---|---|
| art-kit | `src/kits/art-kit/` | PixBuf (+ materials), `lockPalette`, `spriteFromAscii`, `spriteFromFn`, `packSheet`, `validateManifest`, `makeTile`, `makeScenery`, `encodePng` |
| character-kit | `src/kits/character-kit/` | character spec to sprites (`buildCharacter`) and `createAnimator` |
| audio-kit | `src/kits/audio-kit/` | SFX recipes, tracker songs, offline render, WAV, jingles, soundtrack map, WebAudio schedulers |
| fx-kit | `src/kits/fx-kit/` | particles, shake, flash, popups, sky ramp, parallax, foreground silhouettes |
| docs-kit | `src/kits/docs-kit/` | templates + generator for README, HOW-TO-PLAY, HOW-IT-WAS-MADE and a Pages site |

## art-kit
```js
import { lockPalette, spriteFromAscii, packSheet, validateManifest, makeTile, encodePng } from './kits/art-kit/index.js';
const lock = lockPalette({ fur: '#f08a2c', ink: '#1a1420' });
const s = spriteFromAscii(['.ff.', 'ffff', 'i..i'], { f: '#f08a2c', i: '#1a1420' });
lock.offenders(s);                       // [] when every pixel is in the palette; lock.snap(s) forces it
const { sheet, manifest } = packSheet({ idle: [s, s], tile_dirt: makeTile('dirt', 16, {}, 7) }, { width: 128 });
validateManifest(manifest, sheet, ['idle']);   // string[] of problems; empty = ok
writeFileSync('sheet.png', encodePng(sheet, 4));  // Node only
```
Entries given as arrays are animation frames laid out left to right (`{x,y,w,h,frames,fw,fh}`). Tiles are seamless; kinds: dirt stone brick grass water planks. Scenery: tree bush cloud rock. Example: `examples/art-and-fx.mjs`.

## character-kit
A spec is `{ name, size, palette, outline?, poses, anims }`. A pose is either `{ rows: [ascii] }` or `{ draw(p, pal, pose), ...params }` (a rig: one draw function, poses are parameter sets such as `legA`, `bob`). Anims reference poses: `{ frames: ['r1','r2'], fps: 12, loop }`. `buildCharacter(spec)` returns `{ poses, anims, sprites }` where `sprites` is ready for `packSheet` (`<name>_<anim>`). `createAnimator(anims, 'idle')` gives `play/update/frame/done`; it is deterministic and works with sprites or indices. Worked examples (Colby the cat, Pete the rat): `examples/colby-rig.mjs`.

## audio-kit
- SFX: a recipe table `{ name: (v, { arp }) => { v({ src:'square', dur:.1, gain:.2, f:[300,600] }); } }`; `describeSfx(table, name, { pitch })` gives voices, `renderSfx` gives mono PCM, `scheduleVoices(ctx, dest, voices, t)` plays them live.
- Songs: `{ bpm, bars, loop, channels: { lead: { wave:'pulse', duty, vel, gate, sus, pat:[bars] }, ... }, drums: { vel, pat } }`. A bar is 16 sixteenths, tokens `NOTE[:len]` or `.[:len]` (`"D5:2 F#5:2 A5:4 .:8"`); drum chars `k s h t K S .`. `renderSong(song, sr)` loops seamlessly; `toWav(pcm, sr)` writes 16-bit WAV bytes.
- `jingle("C5:2 E5:2 G5:4", { bpm })` makes a one-bar sting; `soundtrack({ menu:'title', play:'jungle' })` maps game state to a track and tells you when to switch.
Example with PawFall's jungle theme: `examples/pawfall-songs.mjs` (writes `out/kit-jungle.wav`).

## fx-kit
`createParticles({ seed, max })` (`burst('splash'|'dust'|'sparkle'|'confetti'|'poof'|opts, x, y)`, `update(dt)`, `draw(ctx)`); `createShake()` (`kick`, `update`, integer `offset()`); `createFlash()`; `createPopups()`; `skyRamp(stops, t01)` with `DAY_NIGHT_STOPS` and `nightAmount`; `drawSkyBands`; `parallaxOffsets(layers, camX, tileW)`; `makeSilhouetteStrip('trees'|'hills'|'grass', w, h)` for dark foreground strips. All seeded and deterministic.

## docs-kit
`generateDocs(config)` returns `{ 'README.md', 'docs/HOW-TO-PLAY.md', 'docs/HOW-IT-WAS-MADE.md', 'docs/index.html' }`. The CLI reads a JSON config (copy `examples/docs-config.example.json`), turns every `docs/swarm/reports/*.md` into a "how it was made" entry (using each report's "What I built" section) and copies screenshots in:
```sh
node src/kits/docs-kit/cli.mjs docs.config.json . --reports docs/swarm/reports --shots out/shots
```
Publish `docs/index.html` with GitHub Pages (Settings, Pages, branch main, folder /docs). `render(tpl, data)` is a tiny mustache-lite (`{{x}}`, `{{#each}}`, `{{#if}}`) you can reuse for your own templates.

## Using the kits in a swarm
Hand each content agent the kit name in its prompt so it reuses the helpers instead of re-inventing PixBuf, the synth or the particle code. Kit code is a starting point: copy and specialise inside your game (do not edit the factory copy in a game repo expecting it to flow back).

## raytrace-kit
`createRaytracer(canvas, scene, { prefer })` never throws: WebGPU compute path tracer (flat BVH buffers), else WebGL2 SDF ray-marcher, else Canvas2D painter; `.tier`/`.errors` say what happened. Pure helpers `sceneToBuffers`, `cameraBasis`, `primaryRay`, `intersectBuffers`, `detectCapabilities`, `sdfUniforms` are unit-tested in Node. Buffer layout in `kits/raytrace-kit/README.md`; offline renders via `tools/render/pathtrace.mjs` (docs/RENDERING.md).
