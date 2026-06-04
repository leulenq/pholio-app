import { PHOLIO_AUTH_CHANNEL } from './constants';

export function notifyAuthChange(detail = {}) {
  if (typeof window === 'undefined') return;

  try {
    const channel = new BroadcastChannel(PHOLIO_AUTH_CHANNEL);
    channel.postMessage({ type: 'auth-changed', ...detail });
    channel.close();
  } catch {
    // BroadcastChannel unavailable
  }

  try {
    window.localStorage.setItem(
      PHOLIO_AUTH_CHANNEL,
      JSON.stringify({ at: Date.now(), ...detail })
    );
    window.localStorage.removeItem(PHOLIO_AUTH_CHANNEL);
  } catch {
    // storage blocked
  }
}

export function subscribeAuthChanges(handler) {
  if (typeof window === 'undefined') return () => {};

  let channel;
  try {
    channel = new BroadcastChannel(PHOLIO_AUTH_CHANNEL);
    channel.onmessage = (event) => handler(event.data);
  } catch {
    channel = null;
  }

  const onStorage = (event) => {
    if (event.key === PHOLIO_AUTH_CHANNEL) handler({ type: 'auth-changed' });
  };
  window.addEventListener('storage', onStorage);

  return () => {
    if (channel) channel.close();
    window.removeEventListener('storage', onStorage);
  };
}
