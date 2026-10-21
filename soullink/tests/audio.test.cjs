const { test } = require('node:test');
const assert = require('node:assert/strict');
const createAudio = require('../web/audio-bridge.js');
const catalog = require('../data/audio.json');
function fixture() {
  const handlers = new Map(), sources = [], contexts = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const param = () => ({ value: 0, setTargetAtTime() {}, cancelScheduledValues() {} });
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = node(); contexts.push(this); }
    createGain() { return { ...node(), gain: param() }; }
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
    createAnalyser() { return { ...node(), getByteTimeDomainData(array) { array.fill(128); } }; }
    createMediaElementSource() { return node(); }
    decodeAudioData() { return Promise.resolve({ duration: 85 }); }
    createBufferSource() {
      const source = { ...node(), playbackRate: param(), start(...args) { this.starts = (this.starts || 0) + 1; this.offset = args[1] || 0; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(source); return source;
    }
    async resume() { this.state = 'running'; this.onstatechange?.(); }
    async suspend() { this.state = 'suspended'; this.onstatechange?.(); }
    async close() { this.state = 'closed'; }
  }
  class Audio {
    constructor(url) { this.url = url; this.paused = true; this.currentTime = 1; }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
  }
  const document = { hidden: false, currentScript: { src: 'http://host/release/audio-bridge.js' },
    addEventListener: (name, cb) => handlers.set(name, cb), removeEventListener: name => handlers.delete(name) };
  const window = { AudioContext: Context, Audio, location: { href: 'http://host/' },
    performance: { now: () => 0 }, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) };
  const audio = createAudio(window, document);
  audio.setCatalog(JSON.stringify(catalog));
  const state = () => JSON.parse(audio.diagnostics());
  const unlock = async () => { await handlers.get('pointerdown')({ target: { id: 'canvas' } }); await new Promise(setImmediate); };
  return { audio, state, unlock, sources, contexts, document, handlers };
}
test('audio waits for a gesture, validates local assets and decodes a bounded catalog', async () => {
  const f = fixture(); f.audio.music('menu');
  assert.equal(f.state().unlocked, false); assert.equal(f.state().musicPlaying, false);
  await f.unlock(); assert.equal(f.state().decoded.length, 13); assert.equal(f.state().musicPlaying, true);
  assert.throws(() => f.audio.setCatalog(JSON.stringify({ music: { evil: { file: 'https://host/music.mp3' } } })), /Invalid/);
  f.audio.dispose();
});
test('voice count is capped at six and mute prevents queued or new sounds', async () => {
  const f = fixture(); await f.unlock();
  for (const id of ['hit', 'red', 'blue', 'green', 'mana', 'shield', 'cast']) await f.audio.play(id);
  assert.equal(f.state().voices, 6); assert.ok(f.sources.some(source => source.stopped));
  f.audio.configure(JSON.stringify({ music: .35, sfx: .75, muted: true }));
  const before = f.state().counts.hit; await f.audio.play('hit');
  assert.equal(f.state().counts.hit, before); assert.equal(f.state().voices, 0);
  f.audio.dispose();
});
test('document visibility does not override a game pause and disposal releases listeners', async () => {
  const f = fixture(); f.audio.music('battle'); await f.unlock();
  f.audio.suspend(true); f.document.hidden = false; f.handlers.get('visibilitychange')();
  assert.equal(f.state().state, 'suspended'); assert.equal(f.state().musicPlaying, false);
  f.audio.suspend(false); await new Promise(setImmediate);
  assert.equal(f.state().musicPlaying, true);
  f.audio.dispose(); assert.equal(f.handlers.size, 0); assert.equal(f.state().state, 'closed');
});
test('catalog has only CC0 sources and no remote runtime dependency', () => {
  for (const entry of Object.values(catalog.music)) assert.equal(entry.license, 'CC0-1.0');
  assert.equal(catalog.effects_source.license, 'CC0-1.0');
  assert.equal(require('../tools/audio-runtime.cjs').files.length, 15);
});

test('intro BGM starts before engine settings, restores saved mute only on game entry', async () => {
  const f = fixture();
  f.audio.startIntro();
  assert.equal(f.state().introRequested, true);
  await new Promise(setImmediate);
  assert.equal(f.state().musicPlaying, true);
  f.audio.configure(JSON.stringify({ music: .35, sfx: .75, muted: true }));
  await new Promise(setImmediate);
  assert.equal(f.state().musicPlaying, true);
  f.audio.endIntro();
  assert.equal(f.state().musicPlaying, false);
  f.audio.configure(JSON.stringify({ music: .35, sfx: .75, muted: false }));
  await new Promise(setImmediate);
  assert.equal(f.state().current, 'menu'); assert.equal(f.state().musicPlaying, true);
  assert.equal(f.state().unlocked, true);
  f.audio.dispose();
});

test('decoded music loops on one source, preserves offset through mute and visibility', async () => {
  const f = fixture(); f.audio.startIntro(); await new Promise(setImmediate);
  const source = f.sources.find(item => item.loop);
  assert.ok(source); assert.equal(source.starts, 1);
  f.contexts[0].currentTime = 172;
  assert.equal(f.state().musicLoops, 2); assert.equal(f.state().musicSeconds, 2);
  f.audio.introVisibility(false); assert.equal(f.state().musicPlaying, false);
  f.audio.introVisibility(true); await new Promise(setImmediate);
  assert.equal(f.sources.filter(item => item.loop).length, 1);
  assert.equal(source.stopped, undefined);
  f.audio.endIntro();
  f.audio.configure(JSON.stringify({ music: 0, sfx: .75, muted: false }));
  assert.equal(source.stopped, true);
  f.audio.configure(JSON.stringify({ music: .35, sfx: .75, muted: false }));
  await new Promise(setImmediate);
  assert.equal(f.sources.filter(item => item.loop).at(-1).offset, 2);
  f.audio.dispose();
});

test('delivery bridge bootstraps the same validated catalog before Godot loads', () => {
  const source = require('../tools/audio-runtime.cjs').bridge();
  assert.ok(source.includes('const bootstrap = ' + JSON.stringify(catalog)));
  assert.ok(!source.includes('/* SOUL_LINK_AUDIO_CATALOG */ null'));
});
