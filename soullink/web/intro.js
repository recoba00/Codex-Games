(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SoulLinkIntro = factory(root, document);
})(globalThis, function createIntro(win, doc) {
  'use strict';
  const el = id => doc.getElementById('intro-' + id);
  const screen = doc.getElementById('intro'), video = el('video'), skip = el('skip');
  const start = el('start'), play = el('play'), retry = el('retry'), bar = el('progress');
  const sound = el('sound');
  const canvas = doc.getElementById('canvas');
  let phase = 'film', engineReady = false, cycleDone = false, skipped = false, cycles = 0;
  let loaded = 0, total = 0, mediaError = false, blocked = false, hostVisible = true;
  let watchdog, revealTimer, exitTimer, lastMediaTime = -1, lastAdvance = win.performance.now();
  const listeners = [];
  function on(target, name, callback) {
    target.addEventListener(name, callback);
    listeners.push(() => target.removeEventListener(name, callback));
  }
  function setPhase(value) { phase = value; screen.dataset.phase = value; }
  function paintAudio() {
    const state = win.SoulLinkAudio?.diagnostics ? JSON.parse(win.SoulLinkAudio.diagnostics()) : null;
    sound.hidden = Boolean(state?.musicPlaying);
  }
  function paint() {
    if (phase === 'failed' || phase === 'entered') return;
    if (engineReady) { bar.max = 1; bar.value = 1; el('percent').textContent = '100%'; }
    else if (total > 0) { bar.max = total; bar.value = loaded; el('percent').textContent = Math.min(99, Math.floor(loaded / total * 100)) + '%'; }
    else { bar.removeAttribute('value'); el('percent').textContent = ''; }
    el('label').textContent = engineReady ? 'READY' : 'LOADING';
    start.hidden = phase !== 'title'; start.disabled = !engineReady;
    skip.hidden = phase !== 'film';
    play.hidden = !blocked || phase !== 'film';
    if (phase !== 'failed') el('note').textContent = mediaError ? '영상을 재생할 수 없어 타이틀로 이동했어요.' : !engineReady && phase === 'title' ? '게임을 불러오는 중' : '';
  }
  function reveal(reason) {
    if (phase !== 'film') return;
    skipped = reason === 'skip'; cycleDone = reason === 'cycle';
    win.clearInterval(watchdog); blocked = false; setPhase('reveal'); paint();
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    revealTimer = win.setTimeout(() => { if (phase === 'reveal') { setPhase('title'); paint(); } }, reduced ? 0 : 900);
  }
  function playback() {
    if (mediaError || phase === 'entered' || phase === 'entering' || !hostVisible || doc.hidden) return;
    video.muted = true; video.defaultMuted = true; video.volume = 0;
    const attempt = video.play();
    if (attempt) attempt.then(() => { blocked = false; paint(); }).catch(error => {
      if (error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') { blocked = true; paint(); }
      else mediaFailure();
    });
  }
  function mediaFailure() {
    mediaError = true; video.pause(); reveal('media-error'); paint();
  }
  function enter(event) {
    if (phase !== 'title' || !engineReady) return;
    // Keep the first genuine title gesture within the browser's audio policy.
    win.SoulLinkAudio?.unlock(event);
    win.SoulLinkAudio?.endIntro?.();
    setPhase('entering'); canvas.inert = false; canvas.removeAttribute('aria-hidden');
    doc.documentElement.dataset.gameState = 'running'; canvas.focus({ preventScroll: true });
    video.pause();
    exitTimer = win.setTimeout(() => {
      screen.hidden = true; setPhase('entered');
      video.removeAttribute('src'); video.load();
      for (const off of listeners.splice(0)) off();
    }, win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
  }
  function visibility() {
    win.SoulLinkAudio?.introVisibility?.(!doc.hidden && hostVisible);
    if (doc.hidden || !hostVisible) video.pause();
    else { lastAdvance = win.performance.now(); playback(); }
  }
  canvas.inert = true; canvas.setAttribute('aria-hidden', 'true');
  video.muted = true; video.defaultMuted = true; video.volume = 0;
  on(skip, 'click', () => reveal('skip'));
  on(play, 'click', playback);
  on(start, 'click', enter);
  on(sound, 'click', event => win.SoulLinkAudio?.unlock(event));
  on(win, 'soullink-audio-state', paintAudio);
  on(retry, 'click', () => win.location.reload());
  on(video, 'ended', () => {
    cycles++; reveal('cycle'); video.loop = true; video.currentTime = 0; playback();
  });
  on(video, 'error', mediaFailure);
  on(video, 'timeupdate', () => {
    if (video.currentTime !== lastMediaTime) { lastMediaTime = video.currentTime; lastAdvance = win.performance.now(); }
  });
  on(doc, 'visibilitychange', visibility);
  on(win, 'soullink-host-visibility', event => { hostVisible = event.detail; visibility(); });
  on(win, 'pagehide', () => video.pause());
  on(win, 'pageshow', visibility);
  // Network/media failure cannot strand the player behind the cinematic gate.
  watchdog = win.setInterval(() => {
    if (!doc.hidden && hostVisible && !blocked && win.performance.now() - lastAdvance > 18000) mediaFailure();
  }, 1000);
  paint(); paintAudio(); playback(); win.SoulLinkAudio?.startIntro?.();
  return Object.freeze({
    progress(current, size) { loaded = Math.max(0, current); total = Math.max(0, size); paint(); },
    ready() { engineReady = true; paint(); doc.documentElement.dataset.gameState = 'title'; },
    back() {
      if (phase === 'entered') return false;
      if (phase === 'film') reveal('skip');
      else win.SoulLinkHost?.requestClose();
      return true;
    },
    fail(error) {
      console.error(error); win.clearInterval(watchdog); win.clearTimeout(revealTimer); win.clearTimeout(exitTimer);
      setPhase('failed'); screen.hidden = false; skip.hidden = true; start.hidden = true; play.hidden = true;
      retry.hidden = false; bar.hidden = true; el('label').textContent = 'CONNECTION ERROR'; el('percent').textContent = '';
      el('note').textContent = '게임을 불러오지 못했어요.\n네트워크를 확인한 뒤 다시 시도해 주세요.';
      doc.documentElement.dataset.gameState = 'failed';
    },
    diagnostics() { return { phase, engineReady, cycleDone, skipped, cycles, loaded, total, mediaError, blocked, hostVisible,
      videoTime: video.currentTime, duration: video.duration, muted: video.muted, volume: video.volume, paused: video.paused, loop: video.loop }; }
  });
});
