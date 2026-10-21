# Engine / Target References

- Installed engine and export templates: Godot 4.7.2 stable, observed locally.
- Godot Web export uses WebAssembly/WebGL2 with Compatibility. Godot 4 C# Web
  export is not supported in the referenced stable docs. Single-threaded export
  avoids the multithreaded cross-origin-isolation requirement:
  https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- The actual locally generated 4.7.2 `build/web/index.js` unconditionally adds a
  Secure Context error to missing features on insecure origins, even before its
  separate `supportsThreads` branch. The engine JS is unchanged. A custom shell
  ignores only this blanket notice for the single-thread HTTP preview, preserving
  actual WebGL2/Fetch/thread checks. Godot's AudioWorklet initialization fails on
  insecure HTTP; the engine mixer explicitly uses `--audio-driver Dummy`.
  GODOT-002C supplies a separate ordinary Web Audio bridge for music/effects
  on both HTTP and Toss; it does not patch the engine or require AudioWorklet.
  Real browser execution was verified before publication, not inferred from export.
- Custom shells are a supported way to control engine startup:
  https://docs.godotengine.org/en/stable/tutorials/platform/web/customizing_html5_shell.html
- Promoted PWA installation requires HTTPS or localhost/loopback. Metadata alone
  does not grant offline service workers or secure-only APIs. The current HTTP
  preview has no service worker and is online-only:
  https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Safari's current home-screen flow includes Open as Web App. It is distinct
  from secure-origin PWA installability and has not been tested on a physical
  iPhone here:
  https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- iOS native export requires macOS/Xcode; it is not part of the user's current
  first-release destination:
  https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html
- Pretendard's copyright/OFL provenance:
  https://github.com/orioncactus/pretendard/blob/main/LICENSE
- Apps-in-Toss WebView integration is a separate host SDK/build validation task.
  The game being implemented in Godot is not proof that its export already runs
  inside Toss. Consult current official docs when beginning GODOT-003:
  https://developers-apps-in-toss.toss.im/

Initial Web output is approximately 39.5MB raw WASM plus 5.6MB PCK. This is not a
measured mobile download/startup budget. Prioritize an actual Toss startup test,
compression/size limits and low-end-device memory/performance before expanding
more native-only features or claiming release readiness.

2026-10-20 update: SDK/Devtools 3.8.1 verified from npm and installed in the
isolated Toss host project. The current 3.x guide supersedes the older tutorial's
granite.config/web.commands names. Production uses real SDK; Vite dev uses the
official Devtools mock. See docs/TOSS.md for exact references and remaining gates.
Actual Dothome gzip/MIME responses work: raw engine/pack/JS 45,441,333 bytes,
compressed transfer 15,851,630 bytes. The `.ait` is locally verified, not uploaded
or accepted by Toss. Internal byte budgets are not stated as official limits.
