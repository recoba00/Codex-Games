const { test } = require('node:test');
const assert = require('node:assert/strict');
const createIntro = require('../web/intro.js');
function fixture() {
  const items = new Map(), timers = new Map(); let now = 0, next = 0, unlocked = 0;
  function element(id) {
    if (!items.has(id)) items.set(id, { id, dataset: {}, hidden: false, currentTime: 0, duration: 8,
      muted: false, paused: true, loop: false, value: 0, attrs: {}, handlers: {},
      addEventListener(name, fn) { this.handlers[name] = fn; },
      removeEventListener(name) { delete this.handlers[name]; },
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; }, focus() {}, load() {},
      play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }
    });
    return items.get(id);
  }
  const doc = Object.assign(element('document'), { hidden: false, documentElement: element('html'), getElementById: element });
  const win = Object.assign(element('window'), { performance: { now: () => now },
    setTimeout(fn) { timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { timers.set(++next, fn); return next; }, clearInterval(id) { timers.delete(id); },
    matchMedia: () => ({ matches: false }), SoulLinkAudio: { unlock() { unlocked++; } }, location: { reload() {} }
  });
  const intro = createIntro(win, doc);
  const fire = (id, event) => element(id).handlers[event]?.({ target: element(id), detail: false });
  const tick = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { intro, element, fire, tick, doc, advance(value) { now += value; }, unlocks: () => unlocked };
}
test('engine readiness never skips the first cinematic; a full cycle reveals the looping title', () => {
  const f = fixture(); f.intro.progress(500, 1000); f.intro.ready();
  assert.equal(f.intro.diagnostics().phase, 'film'); assert.equal(f.element('canvas').inert, true);
  f.fire('intro-video', 'ended');
  assert.equal(f.intro.diagnostics().phase, 'reveal'); assert.equal(f.element('intro-video').loop, true);
  f.tick(); assert.equal(f.intro.diagnostics().phase, 'title');
  f.fire('intro-start', 'click'); f.tick();
  assert.equal(f.intro.diagnostics().phase, 'entered'); assert.equal(f.unlocks(), 1);
  assert.equal(f.element('canvas').inert, false); assert.equal(f.element('intro').hidden, true);
});
test('SKIP reveals the logo but cannot enter before real engine readiness', () => {
  const f = fixture(); f.fire('intro-skip', 'click'); f.tick();
  assert.equal(f.intro.diagnostics().skipped, true); assert.equal(f.element('intro-start').disabled, true);
  f.fire('intro-start', 'click'); assert.equal(f.unlocks(), 0);
  f.intro.progress(1000, 1000); assert.equal(f.element('intro-percent').textContent, '99%');
  f.intro.ready(); assert.equal(f.element('intro-percent').textContent, '100%');
  f.fire('intro-start', 'click'); assert.equal(f.unlocks(), 1);
});
test('media failure does not prevent entry; engine errors keep retry accessible', () => {
  const f = fixture(); f.fire('intro-video', 'error'); f.tick();
  assert.equal(f.intro.diagnostics().mediaError, true); assert.equal(f.intro.diagnostics().phase, 'title');
  f.intro.ready(); f.fire('intro-start', 'click'); assert.equal(f.unlocks(), 1);
  const broken = fixture(); broken.intro.fail('expected-test-error'); broken.intro.progress(500, 1000);
  assert.equal(broken.element('intro-retry').hidden, false); assert.equal(broken.element('intro-progress').hidden, true);
  assert.equal(broken.intro.diagnostics().phase, 'failed');
});
test('muted video pauses with the host and stalled media has a fallback', () => {
  const f = fixture();
  assert.equal(f.element('intro-video').muted, true); assert.equal(f.element('intro-video').volume, 0);
  f.fire('window', 'soullink-host-visibility'); assert.equal(f.element('intro-video').paused, true);
  const stalled = fixture(); stalled.advance(19000); stalled.tick();
  assert.equal(stalled.intro.diagnostics().mediaError, true);
});
