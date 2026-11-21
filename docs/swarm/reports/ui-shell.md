# ui-shell report

## What I built
- `src/core/input.js`: adapted to `poll() -> { hop }` (latched edge, one per press, no repeat), `press(dir)` for touch, gamepad edges, UI actions kept; `stepInput(frame,k)` gives the hop to step 0 only.
- `src/ui/menus.js` (menu, options menu, 3-letter name entry; pure), `hud.js` (1UP/HI, lives, time bar red under 6 s, LV, Pete taunt banner, intro banner), `screens.js` (title, how to play, options, pause, game over + hi-score table, level clear), `touch.js` (d-pad of touch_btn + touch_arrow, hit test, pointer wiring).
- `src/main.js`: boot (`await buildAll()`), fixed step 1/60 max 5, hop edge carried across zero-step frames, pause (Esc/P, blur), M/C/F, settings and hi-score persistence, attract mode (own silent bus, autopilot via guarded dynamic import, otherwise traffic runs and frog idles), params `autostart level seed bot time nosound poll touch`, `window.__pawgger = { game, renderer, bus, input, mode, step(n), setInput({hop}), start }`.

## Verification evidence
- `node --test test/ui-shell.test.mjs`: 7 pass (input edges, gamepad, menus, touch, hud/screens with fake ctx, params).
- Headless Chrome via tools/shot.mjs: `out/shots/ui-title.png` (logo, menu, hi-scores over attract scene) and `out/shots/ui-play.png` (`bot=1`, status poll showed score 110, row 1, no console errors).
- Not verified visually: how-to, options, pause, game over, level clear screens, touch overlay (drawn only with touch input or `touch=1`); audio (no device).

## Deviations from the contract
- `poll` param: undefined in spec; I made it publish `window.__pawgger.status` each frame (mode, state, level, score, lives, row, bays).
- Attract mode renders a real sim game behind the title rather than the `title_scene` sprite.
- `time=N` is applied by clamping `timeLimit`/`timeLeft` after each step.

## Mistakes I made and how I fixed them
- Left some junk expressions in first draft of main.js/hud.js (dead ternary, double rank computation); cleaned up.

## Learnings for a future agent
- Headless shots time out under swarm load; pass `--timeout 120000`.
- `settings.js` storage keys are still `pawfall.*` (frozen file).

## Requests for other modules
- audio: `createAudio(bus, settings)` must expose `unlock/setVolume/setMute`; main calls them inside try/catch.
- sim: none. (game.js tolerates missing pete.js, shot showed a 404 log only.)
