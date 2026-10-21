# Audio

## Sources And Rights

Verified 2026-10-20 from the original upload pages and Kenney's included licenses.
Only CC0 audio is added: commercial use, modification and distribution in the
game do not require an on-screen attribution. Provenance and the pack licenses
are retained in `assets/licenses/`, not displayed as mandatory game credits.

- Menu: Joth, [Technovillain](https://opengameart.org/content/technovillain-0),
  electronic loop, full track, 96kbps stereo MP3, gain -1.5dB.
- Battle: Joth, [Black Diamond](https://opengameart.org/content/black-diamond),
  143 BPM drum-and-bass, credit explicitly optional. Game edit keeps 64 bars from
  bar 17 (26.853146853s, length 107.412587413s), 112kbps stereo MP3, gain -3dB.
- Effects: [Digital Audio](https://kenney.nl/assets/digital-audio),
  [Impact Sounds](https://kenney.nl/assets/impact-sounds) and
  [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney.
  [Creator FAQ](https://kenney.nl/support) confirms commercial use and optional credit.
- [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/) allows commercial
  reuse; it is not a warranty of third-party ownership or Content ID clearance.

This is an electronic direction reference, not a NIKKE soundtrack reproduction.
No NIKKE composition, recording, voice or extracted audio is distributed.

## Runtime

- Two music files and 13 short effects total 2,805,099 bytes. They are local to
  each versioned release or Toss bundle, with no runtime request to an audio site.
- Native F5 uses `AudioStreamPlayer` and looped MP3 streams; SFX use six reusable
  players. The headless Web-PCK smoke intentionally does not open audio devices.
- Web uses one ordinary Web Audio context, decoded MP3 BGM with native
  `AudioBufferSourceNode.loop`, and predecoded PCM WAV effects. Each music track
  is downloaded/decoded once on demand; repeat boundaries do not seek/refetch.
  The two stereo tracks occupy about 65 MiB decoded at 44.1 kHz (more if the
  device resamples to 48 kHz); actual mobile memory remains a release check. This
  avoids Godot's secure-only AudioWorklet initialization on the HTTP preview.
  The stock engine is unchanged and its Web mixer uses Dummy on all origins.
- GODOT-002G bootstraps the validated catalog before Godot downloads finish.
  Intro music immediately attempts allowed autoplay at 35% and ignores saved
  gameplay mute/volume only while the title is visible, per the user's request.
  Game entry restores saved settings without restarting an already-playing track.
  A music button or first intro/canvas touch/key unlocks restricted browsers.
  No autoplay bypass, microphone,
  permission request, external player, timer-based gesture spoofing or iframe.
- BGM/SFX sliders and master mute share the native Godot UI. ConfigFile saves
  are debounced 350ms and survive browser reload when storage is available.
- Match sounds play at effect application, hit/shield at actual contact, drop
  at falling start, with turn, drag-swap, cast, victory/defeat and UI cues.
  Color matches are deduplicated per wave, not played once per tile.
- A six-voice limit, per-cue cooldowns, a Web output compressor, conservative
  gain and brief impact ducking keep dense cascades from drowning the music.
- Background/manual pause stops SFX and pauses BGM without restarting it on
  return. The sound dialog previews the mix while the gameplay clock is paused.
  Hidden-tab state and game pause are independent. Late-decoded sounds are dropped.

Web export excludes `assets/audio/*` from PCK and stages the same catalog as
`audio/` sidecar assets. Native source assets remain present for F5 and future
native export presets must include them. Deployment and `.ait` preflight hash
every sound, and music loading is lazy so it does not block the first game UI.

## Verification

- `tools/prepare-audio.ps1`: reproducible FFmpeg conversion from downloaded CC0
  originals in `build/audio-source/`; no tool binary is shipped. Conversion
  source/output hashes are in `artifacts/audio-conversion.json`; original pack/
  track and runtime hashes are also recorded in `artifacts/audio-provenance.json`.
- `run-godot.ps1 -Mode audio`: native WASAPI, real loaded streams, combat cues,
  background pause, mute/slider UI and its screenshot.
- `node --test tests/audio.test.cjs`: gesture/policy, voice cap, local paths,
  mute, pause/visibility independence, cleanup and catalog checks.
- `tools/check-audio.cjs`, used by Web and Toss Devtools checks: real initial
  gesture, 13 decoded assets, BGM and isolated SFX waveform RMS, independent
  levels, rendered master mute, ConfigFile reload and actual context suspension.
- Existing battle/feedback/layout/timeout/back checks remain required.

Browser signal measurements are not a physical speaker/headphone or iPhone/
Android/Toss device listening test. Autoplay policy, interruptions, silent switch
and audio latency on actual target devices still need GODOT-003C verification.
