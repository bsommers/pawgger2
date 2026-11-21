# art-colby report
**What I built**: src/art/colby.js (12 manifest entries: colby up/down/side/drown/squash/home/life, pete idle/laugh/head, bay mouse, fish) and test/art-colby.test.mjs.
**Verification evidence**: `node tools/sheet.mjs colby --scale 6` prints OK (build ~9 ms); previews viewed twice; node --test passes (manifest, bbox margin/centring, determinism, <400 ms).
**Deviations from the contract**: none. Margin/centring check skips drown and squash (wide splash/pancake art touches x=1..14) and Pete/bay sprites.
**Mistakes I made and how I fixed them**: used nonexistent PAL.ratEar (real name PAL.peteEar); side/down sprites touched the frame edge, shifted them in.
**Learnings for a future agent**: PAL has no ratEar; outline adds 1px around drawn shapes so keep shapes within 2..13.
**Requests for other modules**: wished-for palette colours: a dark pink inner-ear for mouse, a dedicated rat tail pink ramp, a brighter bubble white.
