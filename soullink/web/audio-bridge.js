(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SoulLinkAudio = factory(root, document);
})(globalThis, function (win, doc) {
  'use strict';
  const base = new URL('audio/', doc.currentScript?.src || win.location.href);
  let catalog = { music: {}, sfx: {} }, context, master, musicGain, fxGain, analyser;
  let current = '', suspended = false, hostSuspended = false, unlocked = false, disposed = false;
  let introRequested = false, introHostVisible = true;
  let settings = { music: .35, sfx: .75, muted: false };
  const tracks = new Map(), buffers = new Map(), voices = new Set(), last = new Map(), decoded = new Set();
  const counts = {}, errors = [], meter = new Uint8Array(256);
  const clamp = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const report = error => { if (errors.length < 8) errors.push(String(error?.message || error).slice(0, 180)); };
  const musicLevel = () => introRequested ? .35 : settings.music;
  const isMuted = () => !introRequested && settings.muted;
  function notify() { if (win.CustomEvent) win.dispatchEvent(new win.CustomEvent('soullink-audio-state')); }
  function levels() {
    if (!context) return;
    master.gain.setTargetAtTime(isMuted() ? 0 : .8, context.currentTime, .015);
    musicGain.gain.cancelScheduledValues(context.currentTime);
    musicGain.gain.setTargetAtTime(musicLevel(), context.currentTime, .08);
    fxGain.gain.setTargetAtTime(settings.sfx, context.currentTime, .015);
  }
  function init() {
    if (context || disposed) return;
    const Constructor = win.AudioContext || win.webkitAudioContext;
    if (!Constructor) return;
    context = new Constructor({ latencyHint: 'interactive' });
    master = context.createGain(); musicGain = context.createGain(); fxGain = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 6;
    limiter.attack.value = .003; limiter.release.value = .1;
    analyser = context.createAnalyser(); analyser.fftSize = 256;
    musicGain.connect(master); fxGain.connect(master); master.connect(limiter);
    limiter.connect(analyser); analyser.connect(context.destination);
    levels();
    context.onstatechange = () => {
      if (context.state === 'running') { unlocked = true; music(current); }
      notify();
    };
  }
  function load(id) {
    if (buffers.has(id)) return buffers.get(id);
    const spec = catalog.sfx[id];
    if (!spec || !context) return Promise.resolve(null);
    const promise = win.fetch(new URL(spec.file, base)).then(response => {
      if (!response.ok) throw Error('Sound HTTP ' + response.status + ': ' + id);
      return response.arrayBuffer();
    }).then(bytes => context.decodeAudioData(bytes)).then(buffer => { decoded.add(id); return buffer; }).catch(error => { report(error); return null; });
    buffers.set(id, promise);
    return promise;
  }
  function position(track) {
    return track.offset + (track.source ? Math.max(0, context.currentTime - track.startedAt) : 0);
  }
  function pauseTrack(track) {
    if (!track.source) return;
    track.offset = position(track);
    const source = track.source; track.source = null;
    source.stop(); source.disconnect();
  }
  function mayPlayMusic(id) {
    return !disposed && id === current && unlocked && !suspended && !isMuted() && musicLevel() > 0 && context?.state === 'running';
  }
  function music(id) {
    if (!Object.hasOwn(catalog.music, id)) return;
    current = id;
    for (const [key, track] of tracks) if (key !== id || isMuted() || musicLevel() === 0) pauseTrack(track);
    if (!context || disposed) return;
    let track = tracks.get(id);
    if (!track) {
      track = { source: null, buffer: null, offset: 0, startedAt: 0 };
      tracks.set(id, track);
      // Decode once: native audio-clock looping does not refetch or wait for
      // HTMLMediaElement seeking/buffering at every repeat.
      track.ready = win.fetch(new URL(catalog.music[id].file, base)).then(response => {
        if (!response.ok) throw Error('Music HTTP ' + response.status + ': ' + id);
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).then(buffer => { track.buffer = buffer; return buffer; })
        .catch(error => { report(error); if (tracks.get(id) === track) tracks.delete(id); notify(); return null; });
    }
    track.ready.then(buffer => {
      if (!buffer || track.source || !mayPlayMusic(id)) return;
      const source = context.createBufferSource();
      source.buffer = buffer; source.loop = true;
      source.connect(musicGain); track.source = source; track.startedAt = context.currentTime;
      source.onended = () => { if (track.source === source) { track.source = null; source.disconnect(); notify(); } };
      source.start(0, track.offset % buffer.duration); notify();
    });
  }
  async function unlock(event) {
    if (disposed || suspended || (event?.target && !['canvas', 'intro-start'].includes(event.target.id) && !event.target.closest?.('#intro'))) return;
    try {
      init();
      if (!context) return;
      await context.resume();
      unlocked = context.state === 'running';
      for (const id of Object.keys(catalog.sfx)) load(id);
      music(current);
      notify();
    } catch (error) { report(error); }
  }
  function startIntro() {
    introRequested = true;
    if (!current) current = 'menu';
    visibility();
    if (disposed || suspended) return;
    init();
    if (!context) return;
    levels(); music(current);
    // Browsers may leave resume pending until a real gesture. The title remains
    // fully usable and offers its music button without spoofing autoplay rights.
    context.resume().then(() => {
      if (disposed) return;
      unlocked = context.state === 'running'; music(current); notify();
    }).catch(error => { if (error.name !== 'NotAllowedError') report(error); notify(); });
  }
  function endIntro() {
    introRequested = false; levels(); visibility(); music(current); notify();
  }
  function introVisibility(visible) { introHostVisible = Boolean(visible); visibility(); }
  async function play(id, pitch = 1) {
    if (!unlocked || suspended || settings.muted || settings.sfx === 0 || !catalog.sfx[id] || context.state !== 'running') return;
    const now = win.performance.now(), spec = catalog.sfx[id];
    if (now - (last.get(id) ?? -Infinity) < spec.cooldown * 1000) return;
    last.set(id, now);
    const buffer = await load(id);
    // Never deliver an old combat sound after decoding, hiding, or muting.
    if (!buffer || suspended || settings.muted || settings.sfx === 0 || context.state !== 'running' || win.performance.now() - now > 180) return;
    if (voices.size >= 6) {
      const oldest = voices.values().next().value;
      voices.delete(oldest); oldest.stop();
    }
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.value = Math.min(1.25, Math.max(.75, pitch));
    gain.gain.value = spec.gain; source.connect(gain); gain.connect(fxGain);
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(); counts[id] = (counts[id] || 0) + 1;
    if (spec.duck) {
      const time = context.currentTime;
      musicGain.gain.cancelScheduledValues(time);
      musicGain.gain.setTargetAtTime(settings.music * .55, time, .01);
      musicGain.gain.setTargetAtTime(settings.music, time + .14, .09);
    }
  }
  function stopVoices() {
    for (const source of voices) { try { source.stop(); } catch {} }
    voices.clear();
  }
  function applySuspension(value) {
    if (suspended === Boolean(value)) return;
    suspended = Boolean(value);
    if (suspended) {
      stopVoices();
      if (context?.state === 'running') context.suspend().catch(report);
    } else if (unlocked && context) {
      context.resume().then(() => music(current)).catch(report);
    }
  }
  function suspend(value) { hostSuspended = Boolean(value); visibility(); }
  function configure(json) {
    const value = JSON.parse(json);
    if (!Number.isFinite(value.music) || !Number.isFinite(value.sfx) || typeof value.muted !== 'boolean') return;
    settings = { music: clamp(value.music), sfx: clamp(value.sfx), muted: value.muted };
    levels();
    music(current);
    if (settings.muted || settings.sfx === 0) stopVoices();
    if (introRequested && !unlocked) startIntro();
    notify();
  }
  function diagnostics() {
    let rms = 0;
    if (analyser && context.state === 'running' && !suspended) {
      analyser.getByteTimeDomainData(meter);
      for (const value of meter) rms += ((value - 128) / 128) ** 2;
      rms = Math.sqrt(rms / meter.length);
    }
    const track = tracks.get(current), duration = track?.buffer?.duration || 0;
    const seconds = track ? position(track) : 0;
    return JSON.stringify({ unlocked, state: context?.state || 'locked', suspended, settings, current, introRequested,
      musicPlaying: Boolean(track?.source && context?.state === 'running' && !suspended && !isMuted() && musicLevel() > 0),
      musicSeconds: duration ? seconds % duration : 0, musicDuration: duration,
      musicLoops: duration ? Math.floor(seconds / duration) : 0, musicLoop: Boolean(track?.source?.loop),
      musicBackend: 'decoded-buffer', voices: voices.size,
      decoded: [...decoded], counts: { ...counts }, rms, errors: [...errors] });
  }
  function setCatalog(json) {
    const value = JSON.parse(json);
    for (const group of ['music', 'sfx']) for (const [id, spec] of Object.entries(value[group] || {})) {
      if (!/^[a-z_]+$/.test(id) || !/^(music|sfx)\/[a-z0-9-]+\.(mp3|wav)$/.test(spec.file)) throw Error('Invalid sound asset');
    }
    catalog = value;
  }
  function visibility() { applySuspension(doc.hidden || (introRequested ? !introHostVisible : hostSuspended)); }
  function dispose() {
    disposed = true; stopVoices();
    for (const track of tracks.values()) pauseTrack(track);
    doc.removeEventListener('pointerdown', unlock, true); doc.removeEventListener('keydown', unlock, true);
    doc.removeEventListener('visibilitychange', visibility);
    if (context) context.close().catch(report);
  }
  doc.addEventListener('pointerdown', unlock, true); doc.addEventListener('keydown', unlock, true);
  doc.addEventListener('visibilitychange', visibility);
  const bootstrap = /* SOUL_LINK_AUDIO_CATALOG */ null;
  if (bootstrap) setCatalog(JSON.stringify(bootstrap));
  return Object.freeze({ setCatalog, configure, music, play, suspend, unlock, startIntro, endIntro, introVisibility, diagnostics, dispose });
});
