# audio-sfx report

Finished: 2026-11-21T19:46:15Z

## What I built
- `src/audio/sfx.js`: `SFX_NAMES` (= `defs.SFX`, all 27), `describe(name)` (pure voice data, returns copies), `renderSfx(name, sr)` (offline Float32 PCM), `schedule(ctx, dest, voices, t0, opts)` (live WebAudio, same voices), `stats(pcm, sr)`.
- `src/audio/audio.js`: `createAudio(bus, settings)` returning `{ unlock, setVolume, setMute, dispose }`. Subscribes to `sfx` and `music` at construction. AudioContext is created in `unlock()`. `music.js` is loaded by dynamic import in a try/catch, so its absence is fine.
- `tools/sfx-wav.mjs`: renders WAV files to `out/sfx/<name>.wav` (or `--out dir`, `--sr`), prints peak, rms, length and centroid per name. Exports `encodeWav`.
- `test/audio-sfx.test.mjs`: 35 tests, all passing (`node --test test/audio-sfx.test.mjs`).

## Verification evidence
- All 27 recipes render: finite samples, peak between 0.14 and 0.69, rms 0.08 to 0.27, length 0.03 s to 1.35 s, fade-in and fade-out to zero at both ends (no clicks), no clipping.
- Renders are deterministic (noise is seeded xorshift).
- Live path tested against a mock AudioContext: gains and oscillators are created and started/stopped, end time matches, mute blocks playback, unknown names are ignored.
- Shell without an AudioContext: all calls are safe no-ops.
- `node tools/sfx-wav.mjs` ran fine. Output went to a scratch dir, not `out/`.
- Nothing was listened to. Audio is judged by numbers only, with no audio device.

## Deviations from the contract
- `stats()` returns `{peak, rms, len, sec, centroid}`. `len` is the sample count, and `sec` is added. `centroid` is a zero-crossing estimate, not a true spectral centroid.
- `schedule()` takes `opts.name` to seed noise voices. Without it, noise uses a fixed seed, so live and offline noise differ only if the name is omitted.
- `audio.js` ignores `sfx` events until `unlock()` is called, which is by design.

## Mistakes I made and how I fixed them
- None outstanding. The first draft of the decay envelope mixed two time origins, so I made the decay start after the attack in both the offline and live paths.

## Learnings for a future agent
- Keep one envelope formula. Offline `env = min(1,t/A)*min(1,(dur-t)/R)*vol*exp(-decay*max(0,t-A))` must match the live gain ramps.
- The tool exports `encodeWav` and only runs `main()` when executed directly, so tests can import it safely.

## Requests for other modules
- audio-music: `music.js` should export `createMusic(ctx, dest) -> { play(name|null), stop() }`. `audio.js` already calls it this way when the module exists.
- Nothing requested from defs, events or settings. `settings.mute` and `master/sfx/music` are read at construction.
