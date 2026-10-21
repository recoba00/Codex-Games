(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SoulLinkHost = factory(root, root.document);
})(globalThis, function createHost(window, document) {
  let listener = null;
  let disposePlatform = null;
  let closeScreen = null;
  let closing = false;
  let visible = !document.hidden;
  const disposers = [];
  function emit(message) { if (listener) listener(JSON.stringify(message)); }
  function visibility(next) {
    if (visible === next) return;
    visible = next;
    if (window.CustomEvent) window.dispatchEvent(new window.CustomEvent('soullink-host-visibility', { detail: visible }));
    emit({ type: 'visibility', visible });
  }
  function listen(target, name, handler) {
    target.addEventListener(name, handler);
    disposers.push(() => target.removeEventListener(name, handler));
  }
  listen(document, 'visibilitychange', () => visibility(!document.hidden));
  listen(window, 'pagehide', event => {
    visibility(false);
    if (!event.persisted && disposePlatform) { disposePlatform(); disposePlatform = null; }
  });
  listen(window, 'pageshow', () => visibility(!document.hidden));

  const host = {
    setListener(callback) {
      listener = callback;
      emit({ type: 'visibility', visible });
    },
    clearListener() { listener = null; },
    back() { if (!window.SoulLinkIntro?.back()) emit({ type: 'back' }); },
    visibility,
    safeArea(insets) {
      if (!insets || !['top', 'right', 'bottom', 'left'].every(side => Number.isFinite(insets[side]) && insets[side] >= 0 && insets[side] <= 500)) return false;
      const game = document.getElementById('game');
      for (const side of ['top', 'right', 'bottom', 'left']) game.style.setProperty(`--host-safe-${side}`, `${insets[side]}px`);
      return true;
    },
    attachPlatform(dispose, close) {
      if (disposePlatform) disposePlatform();
      disposePlatform = dispose;
      closeScreen = close;
    },
    requestClose() {
      if (closing || !closeScreen) return;
      closing = true;
      Promise.resolve().then(closeScreen).catch(() => emit({ type: 'close-failed' })).finally(() => { closing = false; });
    },
    publishDiagnostics(json) {
      if (new URL(window.location.href).searchParams.get('qa') !== '1') return;
      window.__SOUL_LINK_SNAPSHOT__ = JSON.parse(json);
    },
    dispose() {
      if (disposePlatform) disposePlatform();
      disposePlatform = null;
      for (const dispose of disposers.splice(0)) dispose();
      listener = null;
    },
  };
  return Object.freeze(host);
});
