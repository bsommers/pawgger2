# art-river report
## What I built
`src/art/river.js`: logs (bark texture, end-grain rings, 3 lengths), turtle (2 swim, 2 sinking-warn with dimmed shell, bubbles, waterline dither; 1 ripple), croc raft (closed / open with teeth), bay croc, bay snake, 4 treasure pickups x3 shimmer frames. Outlined with PAL.outline.
## Verification evidence
`node tools/sheet.mjs river --scale 6` prints OK (build ~10 ms); previewed once; bbox measured numerically; `test/art-river.test.mjs` passes (manifest, determinism, <400 ms, warn-vs-swim pixel diff > 150).
## Deviations from the contract
None.
## Mistakes I made and how I fixed them
None notable; stray corner marks beside the logs in the preview are sheet gaps, not sprite pixels.
## Learnings for a future agent
PixBuf.outline() adds outline outside the body, so keep bodies 1 px inside the frame.
## Requests for other modules
None. Wished-for palette colours: a dedicated bark highlight and a muted/sunken shell tone (I used mix()).
