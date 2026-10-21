# Godot QA

## Passed

- Godot 4.7.2 headless core: 4,534 checks, 12 boards, 18 complete matches, 276 turns.
  Original 2,878 captured-web comparisons remain unchanged; 1,656 additional
  checks verify exact effect receipts, including round-end burn attribution.
  `artifacts/core-report.json`.
- Headless main scene: preparation, Sylphi/Barrier selection, real shield 150,
  AI round two, completed match and retained in-memory selection. `smoke.log`.
- Real GPU Compatibility rendering (RTX 4060 Ti), native preparation/battle at
  390x844 plus three other window dimensions; four board dimensions. 12 measured
  layouts use a 56px header and 16px content insets in Godot logical units.
- Engine-injected pointer route 11 -> 10 -> 9 is recorded once. A duplicate
  release does not finish the next turn. Actual process-driven AI reaches round
  two, and an accelerated deadline calls real timeout assistance.
- Pause freezes the clock; help and result windows render; result/retry/return
  work. Fixed a result-label wrapping minimum-size issue and refreshed the timer
  on new matches even while paused. `artifacts/render-report.json` and PNGs.
- Godot Web release generation and real PCK main-scene smoke test pass.
  Internal task/docs/tests/fixtures/build/artifacts are excluded from the pack.
- GODOT-003A: real Chromium/Edge WebAssembly execution on trusted loopback and
  ordinary insecure HTTP; staging and public Dothome URLs. Actual touch taps
  start the match and use a spell. Pointer drag completes immediately and real
  AI reaches round two; a real 15-second idle wait triggers assistance and the
  next AI turn. A clean context without the QA query also builds the full UI.
- The browser parses the manifest and icons. It correctly reports
  `not-from-secure-origin` on HTTP: this is NOT a promoted/installable secure PWA.
  There is no service worker or offline support. The Web engine mixer uses
  Dummy; GODOT-002C supplies real audio through the gesture-unlocked bridge.
- 390x844, 360x640 and 844x390 browser screenshots/canvas pixel checks pass.
  Notch/bottom insets and standalone media are explicit simulations, not a real
  iOS installation. `artifacts/web-staging-report.json`, `web-live-report.json`.
- Initial release `godot-e4ea82872310c52d`: 15 runtime files / 46,322,788 bytes uploaded
  and read back exactly. Old root HTML backed up before replacement. No other
  game directory is touched.
- GODOT-003B release `godot-085ad0356729c55b`: 20 runtime files / 62,180,029 bytes
  including raw fallback and gzip copies, uploaded and read back exactly.
  Browser responses for JS/WASM/PCK are gzip, correct MIME and Vary; transferred
  payload is 15,851,630 bytes versus 45,441,333 raw. `deploy-publish.json` and
  `web-staging-report.json` / `web-live-report.json`.
- Host visibility events freeze the real clock; canceling back preserves manual
  pause; back in preparation shows a cancelable exit dialog. SDK and CSS safe
  areas use max rather than summing, and Godot skips a second native inset on Web.
  New Node host/adapter tests: 5 passing, no per-frame SDK calls or auto retries.
- Official SDK 3.8.1 / Devtools mock: direct Godot canvas, real AI round two,
  SDK SafeArea subscription changes canvas bounds, SDK backEvent reaches Godot's
  leave confirmation. Zero page errors/warnings. `toss-devtools-report.json`.
- `.ait` is built for `soullink`, 20,308,526 bytes. Official reader confirms SDK,
  no permissions, 30 entries and byte-identical engine/PCK/audio; no external game URL,
  iframe or Godot import metadata. The unsigned Windows CLI artifact's separators
  are normalized through official Reader/Writer, preserving identity/metadata.
  `toss-preflight-report.json`. This is NOT an actual Toss runtime test.
- GODOT-002A native GPU: central turn banner locks input without spending time;
  exact match HP/shield text fits the effect lane; attacker lunges and victim
  shakes/flashes with actual damage; AI cursor/swap is visible; drop and barrier
  visuals render. Background freezes presentation elapsed time. Canceling during
  a special restores card alpha and cannot deliver stale callbacks. Six rendered
  screenshots inspected. `feedback-report.json`, `feedback-*.png`.
- GODOT-002A browser: intro/AI/match/impact/drop trace, real drag, spell and
  15-second timeout pass locally and on staged/public HTTP; input resumes only
  after presentation. Three viewport checks and clean-context startup pass.
  Official Toss Devtools mock also passes after the presentation changes.
- GODOT-002B: generated 1254px RGBA atlas is loaded with additive blending;
  native light-on/off comparisons prove visible match and impact contribution.
  All four elements together render rings/streams/bolt and a fitting exact
  receipt. A short windup, contact hold and accelerated match/hit durations are
  asserted. Seven native screenshots inspected. Native 12-layout/input tests,
  core 4,534 checks, five host tests and exported-PCK smoke still pass.
  A pixel-identical strip above the grid at two different fall positions proves
  falling tiles cannot cover the combo/HUD lane.
- GODOT-002B local browser: tactical-v2 identity, actual textured skill impact
  screenshot, drag/AI and full timeout, background freeze, safe-area/layout,
  clean-context startup pass on loopback and ordinary HTTP with no page errors
  or warnings. Official Toss Devtools mock also passes. No phone FPS claim.
- GODOT-002C: native WASAPI loads two looped music streams/13 effects, synchronizes
  cast/hit cues, freezes audio on background and renders working mute/volume UI.
  `audio-native-report.json`, `audio-settings.png`. Nine Node audio/host tests pass.
- Actual browser audio on loopback, insecure HTTP and official Toss Devtools mock:
  no autoplay before touch; 13 WAV assets decode; BGM and isolated SFX have
  nonzero waveform RMS; independent levels/master mute work; mute/volume persist
  across a real reload. Background pauses media, stops voices and suspends the
  actual context; resume works. Combat produces fresh hit/swap/drop cues.
  No browser errors/warnings. Browser checks still cover drag/AI/full timeout,
  three layouts, host back/visibility and startup without QA.
- Latest published release `godot-8f475b442510ea2c`: 36 runtime files, 67,558,688
  stored bytes; gzip JS/WASM/PCK transfer 17,132,177 bytes (46,726,521 raw),
  plus 2,805,099 bytes for all 15 music/effect sidecars. MP3 range requests work.
  Runtime byte readback, staged-browser gate and public URL verification pass.
  Latest `deploy-publish.json`, `web-staging-report.json`, `web-live-report.json`.

## Not Yet Verified

- Actual Apps-in-Toss host integration after console upload/QR launch, iPhone/
  Android input/safe area/native close button/orientation and low-end memory/
  startup. Devtools mocks and successful packaging do not verify the real host.
- Installed home-screen launch, device audio focus/silent-switch/latency,
  payment/ads, user identity/save and offline
  behavior. Bundle budgets in preflight are internal, not claimed Toss limits.
- Godot logical layout units are not a claim of 56 physical pixels on every
  screen: canvas_items scaling adapts the 390x844 design viewport. Landscape
  currently fits the baseline but is not a polished Steam/desktop layout.
- Full 15-second physical-device waiting, real multi-touch and human usability.
  Native engine testing accelerates the deadline; browser integration waits the
  full duration. Neither is a claim of a human playing on an actual phone.
- Old tutorial/gallery/recent-results/event-detail feature parity; additional
  special-specific effects and reduced-motion settings.
- Steam SDK/Windows release and Android signing/Google Play preparation.

The stock engine JS remains unchanged. The custom single-thread preview shell
retains WebGL2/Fetch/thread checks and treats only the blanket Secure Context
notice as non-fatal for HTTP, with a dummy audio driver. It does not fake
isSecureContext or unlock any browser security feature. This compatibility
result is specific to the tested game/browser and is not a general promise of
Godot HTTP, PWA or Toss compatibility.
