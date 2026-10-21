const { test } = require('node:test');
const assert = require('node:assert/strict');
const createHost = require('../web/host-bridge.js');

function fixture() {
  const style = new Map();
  const window = new EventTarget();
  window.location = { href: 'http://example.test/games/soullink/?qa=1' };
  const document = new EventTarget();
  document.hidden = false;
  document.getElementById = () => ({ style: { setProperty: (key, value) => style.set(key, value) } });
  const host = createHost(window, document);
  const events = [];
  host.setListener(json => events.push(JSON.parse(json)));
  return { host, window, document, events, style };
}

test('visibility is event-driven, deduplicated and survives bfcache', () => {
  const { host, document, window, events } = fixture();
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, [{ type: 'visibility', visible: true }, { type: 'visibility', visible: false }]);
  let disposed = 0;
  host.attachPlatform(() => disposed++, async () => {});
  const hidden = new Event('pagehide'); hidden.persisted = true;
  window.dispatchEvent(hidden); assert.equal(disposed, 0);
  document.hidden = false; window.dispatchEvent(new Event('pageshow'));
  assert.equal(events.at(-1).visible, true);
  host.dispose(); assert.equal(disposed, 1);
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(events.at(-1).visible, true);
});

test('SDK safe areas are validated and remain CSS values, not duplicate padding', () => {
  const { host, style } = fixture();
  assert.equal(host.safeArea({ top: 59, left: 0, right: 0, bottom: 34 }), true);
  assert.equal(style.get('--host-safe-top'), '59px');
  for (const top of [-1, Infinity, NaN, '59', 501]) assert.equal(host.safeArea({ top, left: 0, right: 0, bottom: 0 }), false);
  assert.equal(host.safeArea(null), false);
  assert.equal(style.get('--host-safe-top'), '59px');
});

test('close calls are not spammed; rejection is reported once and can be retried', async () => {
  const { host, events } = fixture();
  let calls = 0, reject;
  host.attachPlatform(() => {}, () => { calls++; return new Promise((_, fail) => { reject = fail; }); });
  host.requestClose(); host.requestClose();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  reject(new Error('host unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.filter(event => event.type === 'close-failed').length, 1);
  host.attachPlatform(() => {}, async () => { calls++; });
  host.requestClose(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
});

test('only explicit QA visits receive parsed data; no executable strings', () => {
  const { host, window, events } = fixture();
  host.publishDiagnostics('{"round":2}'); assert.equal(window.__SOUL_LINK_SNAPSHOT__.round, 2);
  window.location.href = 'http://example.test/games/soullink/';
  host.publishDiagnostics('{"round":3}'); assert.equal(window.__SOUL_LINK_SNAPSHOT__.round, 2);
  host.back(); assert.equal(events.at(-1).type, 'back');
  host.clearListener(); host.back(); assert.equal(events.at(-1).type, 'back');
});

test('Toss adapter uses official 3.x API shapes and releases subscriptions', async () => {
  const { connectToss } = await import('../platform/toss/src/adapter.js');
  const { host, events, style } = fixture();
  const handlers = {}; let subscriptions = 0, unsubscriptions = 0, closes = 0;
  const sdk = {
    SafeArea: { get: () => ({ top: 59, right: 0, bottom: 34, left: 0 }), subscribe: ({ onEvent }) => {
      handlers.safeArea = onEvent; subscriptions++; return () => unsubscriptions++;
    } },
    graniteEvent: { addEventListener: (name, { onEvent, onError }) => {
      assert.equal(typeof onError, 'function'); handlers[name] = onEvent;
      subscriptions++; return () => unsubscriptions++;
    } },
    Screen: { close: async () => { closes++; } },
  };
  connectToss(sdk, host); assert.equal(subscriptions, 3);
  handlers.backEvent(); assert.equal(events.at(-1).type, 'back');
  handlers.homeEvent(); assert.equal(events.at(-1).visible, false);
  handlers.safeArea({ top: 12, right: 0, bottom: 21, left: 0 }); assert.equal(style.get('--host-safe-top'), '12px');
  host.requestClose(); await new Promise(resolve => setImmediate(resolve)); assert.equal(closes, 1);
  connectToss(sdk, host); assert.equal(unsubscriptions, 3);
  host.dispose(); assert.equal(unsubscriptions, 6);
});
