# render report

## What I built
- `src/art/registry.js`: `buildAll({modules?, loader?})` (async, dynamic import per module in try/catch), `assemble(built)` (pure, sync), magenta placeholders of manifest size for missing/wrong-size art; `get/size/frames/names/missing/errors`.
- `src/render/scene.js`: sprite cache (`spritesFor(art)`, `setSurfaceFactory`), painters (bays, river items, pickups, road items, headlights, roller, frog, night overlay), `paintWorld`, `drawStatic(ctx, art, level, t)`.
- `src/render/background.js`: sky bands/sun/stars/clouds/skyline, static ground.
- `src/render/particles.js`: fx/popup/shake from the bus, capped at 160.
- `src/render/crt.js`: scanlines + cached vignette.
- `src/render/renderer.js`: `createRenderer(canvas,{bus,art,settings})` -> `draw, resize, setCRT, shot, hud, overlay`.
- `test/render.test.mjs`: software-canvas tests against a fake game state.

## Verification evidence
`node --test test/render.test.mjs`: 8 pass. Items asserted at `itemLeft`; frog pose/mirror/hop lift/blink; day vs night frames; all pixels opaque; particle cap; renderer letterbox (scale 2 at 1000x700, black bars) and CRT. Viewed `out/previews/render_frame.png` with the real art (all 5 art modules present, 0 placeholders): looks right.

## Deviations from the contract
- `buildAll()` is async (dynamic import). UI shell must `await` it; `assemble()` is the sync path.
- CRT is drawn on the final scaled canvas after the HUD/overlay (nicer scanlines, also covers HUD) rather than before HUD.
- Headlights are drawn after the night overlay so they glow.
- Static cache is the ground layer only (level independent); sky is drawn live (cheap).
- Horizontal hop interpolation uses the renderer's memory of the previous x (sim has no fromX).

## Mistakes I made and how I fixed them
- Test canvas stub had zero size when the renderer grabbed its context; made width/height setters reallocate like a real canvas.
- Placeholder skyline covers row 0, hiding the sky in a test; used a transparent skyline there.

## Learnings for a future agent
- `bg_skyline` is opaque 32 px tall and bottom-aligned at y=16, so row 0 sky is almost hidden; art could leave gaps if sky should show.
- Assumed `g.pete.rollerX` is the roller centre and `rollerDir` is its sign.

## Requests for other modules
- sim-core: expose `rollerDir` in `g.pete`; keep `g.bays[i].hazard/bonus` recomputed each tick; set `frog.fromRow`.
- ui-shell: `await buildAll()`; call `renderer.resize()` on window resize.
