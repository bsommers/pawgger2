# site report

## What I built
- `docs/site/index.html`, `docs/site/style.css`: single-page showcase (hero, play, how to play, cast, swarm story, tech notes). Links to /play/ and to the how-to and making-of docs on GitHub.
- `docs/site/shots/`: `title.png`, `play.png` (tools/shot.mjs at 960x540), `gameplay.gif` (24 frames at 180 ms, ffmpeg palette, cropped to the playfield).
- `docs/HOW-TO-PLAY.md`: controls, screen layout, goal, lives and timer (30 s down to 20 s min, from `TUNING`/`attemptTimeFor`), hazards, scoring (from `SCORES`), day/night.
- `docs/HOW-IT-WAS-MADE.md`: contract, swarm/ownership table, code-drawn art, synthesised audio, headless sim, verification tools.
- `README.md`: quick start, layout, controls, publishing.
- `.github/workflows/pages.yml`: build with `tools/build-web.mjs`, assemble `_site` (site at `/`, `dist/pawgger2.html` as `/play/index.html`, docs copied to root), deploy via actions/deploy-pages. Not run (no push).

## Verification evidence
- `node tools/build-web.mjs` succeeded: dist/pawgger2.html 245 KB (96 KB gzip).
- `tools/shot.mjs --timeout 120000` on title, gameplay and the assembled site: no errors reported; title and gameplay PNGs viewed and match the game. Assembled site on a local http server rendered correctly at 1100 px (viewed screenshot).
- Hop input in the GIF frames moved Colby (visible in frames).

## Deviations from the contract
- None to ARCHITECTURE.md. The contract's `docs/site/**` ownership respected; nothing outside owned files was edited.

## Mistakes I made and how I fixed them
- First draft of HOW-TO-PLAY.md contained unverified claims (Pete's cheese rhythm, traffic ramp). Removed them; only facts from defs.js and ARCHITECTURE.md remain.
- Site linked to `HOW-TO-PLAY.md` relatively, which GitHub Pages would serve as raw Markdown. Changed to GitHub blob links.
- Stray scratch screenshot written into docs/site; moved to scratchpad.

## Learnings for a future agent
- `tracker` path is `tools/swarm-tracker/bin/track.mjs`; `.tracker/bin/` does not exist.
- `pkill -f` on a server started from the same bash command kills the shell (exit 144); kill by PID instead.
- shot.mjs `--frames N --interval ms` writes `<name>-001.png...`, ready for ffmpeg.

## Requests for other modules
- None. Optional: a dedicated `docs/site/shots/` refresh once the art or HUD stabilises.
