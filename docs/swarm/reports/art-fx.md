# art-fx report
## What I built
`src/art/fx.js` (build() for all 12 fx manifest rows: splash, squash, dust, sparkle, ripple, poof, smoke, 208x48 logo with paw-print A and frog hat on first G, 240x120 title scene with Colby mid-hop, cursor paw, touch button, arrow glyphs) and `test/art-fx.test.mjs`.
## Verification evidence
`node tools/sheet.mjs fx --scale 6` prints OK (build ~25 ms); viewed out/previews/fx.png twice; `node --test test/art-fx.test.mjs` passes (conformance, determinism, <400 ms, distinct frames, logo margin).
## Deviations from the contract
title_scene has 4 transparent corner pixels because the sheet tool rejects fully opaque sprites. Title scene imports `./colby.js` statically (try/catch around its build) for the Colby sprite (colby_up frame 1, scaled 2x).
## Mistakes I made and how I fixed them
A stray erase in the car drawer made the sheet tool pass by accident while cars were invisible; found by viewing the preview. Colby was first 3x (too big); now 2x. Sparkle frames 0 and 3 were identical; fixed.
## Learnings for a future agent
View the preview, not just the tool's OK. Outline logos after extrusion with diagonal: true.
## Requests for other modules
None. Wished palette colours: a lighter yellow-orange for logo highlights (used shieldY), a dedicated "paw pad pink" (used nose).
