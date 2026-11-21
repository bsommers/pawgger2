# audio-music report

## What I built
- `src/audio/music.js`: `MUSIC_NAMES`, `describeMusic(name)` (pure data: bpm, bars, length, voices/notes), `renderMusic(name, sr, seconds)` (offline mono Float32Array), `createMusic(ctx, dest) -> {play(name|null), stop()}` (live WebAudio, lookahead scheduler, 50 ms fade on switch), plus `stats(pcm)`, `parseBar`, `midiOf`, `freqOf`, `envGain`.
- All six `defs.MUSIC` tracks, as bar strings (16 sixteenth-steps/bar, validated; a bad bar throws): level_day (C major, 140 bpm, 8 bars, marimba arpeggio + bouncy bass), level_dusk (A minor, 100 bpm, 8 bars), level_night (128 bpm, sparse, driving 8th bass), title (120 bpm, heroic, Pete tuba motif in last 2 bars), levelclear and gameover stings (non-looping, with tail).
- `tools/music-wav.mjs [names] [--out dir]` writes 16-bit mono WAVs to `out/music/` and prints stats. `test/audio-music.test.mjs` (7 tests).

## Verification evidence
`node --test test/audio-music.test.mjs` passes. Numbers (44.1 kHz): title 16.0 s peak .72 rms .235; level_day 13.7 s peak .68 rms .141; level_dusk 19.2 s peak .58 rms .204; level_night 15.0 s peak .51 rms .109; levelclear 4.0 s peak .57; gameover 8.8 s peak .60. Tests assert no NaN, peak <= 1, rms sane, centroid 200-9000 Hz, stings end silent, a two-loop render repeats exactly (seamless loop), determinism, and createMusic runs against a fake AudioContext. **Nothing was listened to**; numbers only. Live WebAudio path was only exercised with a mock context, not a real browser.

## Deviations from the contract
None. `renderMusic` `seconds` defaults to loop length (+tail for stings).

## Mistakes I made and how I fixed them
- First spectral centroid subsampled the DFT (aliased, 11 kHz); fixed with a full DFT.
- Loop renders differed between loops: global noise state, float rounding of note start samples, and wrapped tail notes starting at phase 0. Fixed with per-note noise seed, integer sample indices, wrapping previous-loop tails with the correct phase.

## Learnings for a future agent
Compute note start as integer samples; never floor a float time. Keep loop length times sr an integer for exact loop tests. Centroid is high (3-6 kHz) because naive pulse waves and noise hats are bright; a lowpass on the live bus would soften it.

## Requests for other modules
audio-sfx's `createAudio` should construct `createMusic(ctx, musicGain)` and call `play(name)` on `music {name}` events (null/unknown name -> stop). Square waves are naive in offline render (aliasing); acceptable for chiptune.
