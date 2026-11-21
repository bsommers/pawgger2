# art-vehicles report
## What I built
`src/art/vehicles.js`: car (3 colourways x 2), racer, truck (2 x 2), pickle_truck (giant pickle on roof), tuna_bus (fish windows), limo (Pete peeking, frame 1 honk flash), cheese_roll (4 rotation frames), headlight (dithered alpha cone). All face RIGHT, 1px PAL.outline, wheel tread alternates per frame.
## Verification evidence
`node tools/sheet.mjs vehicles --scale 6` prints OK (build ~8 ms); previewed PNG once. `node --test test/art-vehicles.test.mjs`: 3/3 pass (manifest, 1px margin + vertical centring, determinism, <400 ms).
## Deviations from the contract
None.
## Mistakes I made and how I fixed them
Left a redundant hood-highlight rect in sedan; removed.
## Learnings for a future agent
Wheels at rows 2/13 plus outline fill rows 1..14 exactly; keep bodies in rows 3..12.
## Requests for other modules
Renderer: draw `headlight` at the vehicle front (mirror with lane.dir). Wished-for palette colours: a distinct roof colour per car, a pink/red "honk" flash colour.
