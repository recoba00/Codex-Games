export function connectToss(sdk, host) {
  const subscriptions = [];
  const warn = error => console.warn('SOUL_LINK_TOSS_BRIDGE', error?.message || String(error));
  try { host.safeArea(sdk.SafeArea.get()); } catch (error) { warn(error); }
  for (const subscribe of [
    () => sdk.SafeArea.subscribe({ onEvent: insets => host.safeArea(insets) }),
    () => sdk.graniteEvent.addEventListener('backEvent', { onEvent: () => host.back(), onError: warn }),
    () => sdk.graniteEvent.addEventListener('homeEvent', { onEvent: () => host.visibility(false), onError: warn }),
  ]) {
    try { subscriptions.push(subscribe()); } catch (error) { warn(error); }
  }
  const dispose = () => { for (const unsubscribe of subscriptions.splice(0)) unsubscribe(); };
  host.attachPlatform(dispose, () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Screen.close timed out')), 8000);
    Promise.resolve().then(() => sdk.Screen.close()).then(resolve, reject).finally(() => clearTimeout(timeout));
  }));
  return dispose;
}
