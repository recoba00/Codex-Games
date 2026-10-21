# Cinematic Title / GODOT-002D

The Web/Toss startup shell replaces the old static loader. The same Godot battle
pack runs underneath; gameplay is not moved into HTML. Native F5 startup is
unchanged; native cinematic/title integration belongs to the later native export.

## Flow

- Immediate muted inline 720x1280 / 24 fps / 8-second video with a still poster.
  `object-fit: contain` centers the complete source on all aspect ratios; letterbox
  space is intentional, rather than cropping characters to fill a different screen.
- Real engine progress only. Download completion displays at most 99% until the
  engine startup promise resolves. No simulated loading timer.
- First `ended` event reveals the dim layer and 850 ms falling/squashing logo,
  impact line and short shake. Video then uses native infinite looping.
- SKIP reveals the title early, without bypassing the engine readiness gate.
- Touch-to-start enables canvas interaction, fades the overlay, and releases
  video decoder/resources.
- GODOT-002G starts the existing CC0 menu BGM before the Godot loading/settings
  handshake using a build-injected validated catalog. Intro music is always enabled
  at 35%; saved gameplay mute/volume is restored on entry. Autoplay is attempted
  immediately; browser policy can still require the music button or first touch.
  Decoded music loops on the native audio clock, with no per-loop network/seek.
  Background suspension preserves its position. The original movie track is still
  removed (`-an`), with muted/defaultMuted/zero-volume video playback as well.
- Background/host hiding pauses video. Unsupported/failed/stalled video falls
  through to the title; an autoplay restriction offers replay or SKIP. Engine
  failure retains a retry button. Reduced-motion disables the slam and shake.
- 44px minimum controls, 16px side margins and host/browser safe area support.

## Assets

User video: Desktop/게임_인트로용_영상_제작_20261020101555.mp4.
`web/intro/cinematic.mp4`: libx264 main / CRF 26 / slow / yuv420p / faststart,
audio track removed, resolution and all 192 frames preserved.
`web/intro/poster.jpg`: frame at 0.1 seconds, JPEG quality 3.

Logo edit target: Desktop/Layer 1.png. Built-in image_gen, background-extraction,
transparent_background=true; no fallback API/CLI used.
Generated master: `assets/intro/logo-cutout.png`.
Web delivery: `web/intro/logo.webp` (800px wide, quality 90, alpha quality 100).
Original attachment and generated master are preserved. No runtime image API.

Exact final prompt:

> Use case: background-extraction. Edit target: the supplied SOULLINK winged metal shield logo. Produce a clean production PNG cutout on a genuinely transparent alpha background. Change ONLY: remove all bright green background, including green between the wings and around every edge, and remove the small pale-green four-point sparkle at bottom right. Preserve exactly the entire original emblem, lettering SOULLINK and GODDESS OF VICTORY, red runes, metallic detail, silhouette, proportions, red internal glow, and original colors. No redesign, no new text, no shadows outside the original silhouette, no green fringe, no checkerboard baked into pixels. Keep the full emblem uncropped and centered with a small transparent margin.

The immutable release and Toss bundle include the same five intro sidecars.
The project-only compressed preview budget increases from 20 to 24 MiB to keep
the supplied video self-contained instead of introducing a Dothome dependency.
The 64 MiB raw preview budget remains. These are not official Toss platform limits.
Console acceptance, physical iPhone/Android playback and device memory remain
separate release checks. HTTP does not gain secure-context PWA/offline privileges.

## Validation

- 20 Node tests: host/audio/state transitions, early catalog and buffer-loop/offset,
  video metadata/no audio track,
  faststart atom order, actual logo transparency and no opaque chroma green.
- Six local deployment manifest boundary tests, including shared-engine identity,
  changed-source rejection, path escape, mixed sources and exact target allowlist.
- Godot core 5,893 checks (historical 12 boards / 18 matches / 276 turns plus
  new five-color/healing/repeated-skill cases) and exported-PCK
  smoke: prepare, spell, real AI round, complete match, retained selection.
- Edge actual media decode/moving frames, full first cycle and native second-loop
  wrap, dim/title, menu BGM, background freeze, three layouts, real SKIP while PCK held by
  the test transport, disabled entry until engine ready, normal no-QA startup.
- Offline Web Audio rendering verifies the actual 84.924-second menu buffer's
  repeat boundary against its first samples, with zero repeat error and audible
  seam energy. This is an accelerated renderer test, not a physical-device listening test.
  The transport-held PCK check proves BGM can play before engine readiness.
  `SOULLINK_LONG_AUDIO=1` additionally waits through a real wall-clock music cycle
  and checks the live source remains running/audible after its first repeat.
  The live GODOT-002G report passed this 84.924-second cycle (loop count 1,
  post-wrap RMS 0.02136). Its reported startup observation includes that deliberate
  music-loop wait; it is not a 93-second engine-loading measurement.
- Existing real pointer combat, AI, 15-second timeout, sound decode/waveform,
  settings reload and host visibility/back checks remain required.
- Official Toss Devtools mock uses the same intro, self-contained local assets
  and SDK safe area/back. It does not certify actual Toss/device behavior.

Latest release: `godot-1b26e8c9a2f9e900` (GODOT-002G). Browser snapshots: `artifacts/intro/`.
The test harness measures a second full loop for evidence before entering; this
extra observation time is not a production startup delay (production reveals at
the first 8-second cycle, or SKIP, plus the 900 ms logo sequence).

Playback reference: [MDN video element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).
Audio references: [native buffer looping](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop),
[browser autoplay policy](https://developer.chrome.com/blog/web-audio-autoplay).
