import { PHOLIO_AUTH_CHANNEL } from './constants';

/**
 * Cross-tab auth notification.
 *
 * A BroadcastChannel delivers a posted message to every OTHER channel object
 * with the same name — including other instances inside the SAME tab. This file
 * used to construct a throwaway channel per notifyAuthChange() call, so a
 * subscriber in the same tab received that tab's own broadcast, called back into
 * the handler, which notified again: an unbounded feedback loop that hammered
 * GET /api/session several times a second for as long as the page stayed open.
 *
 * Posting and subscribing now share ONE module-level channel instance, which is
 * exactly the case BroadcastChannel does not echo back to itself. Handlers live
 * in a Set so several subscribers can share it, and the channel is torn down
 * only once the last one unsubscribes.
 */

let channel = null;
const handlers = new Set();

function ensureChannel() {
  if (channel || typeof window === 'undefined') return channel;
  try {
    channel = new BroadcastChannel(PHOLIO_AUTH_CHANNEL);
    channel.onmessage = (event) => {
      handlers.forEach((handler) => handler(event.data));
    };
  } catch {
    channel = null; // BroadcastChannel unavailable
  }
  return channel;
}

function closeChannelIfIdle() {
  if (channel && handlers.size === 0) {
    try {
      channel.close();
    } catch {
      // already closed
    }
    channel = null;
  }
}

export function notifyAuthChange(detail = {}) {
  if (typeof window === 'undefined') return;

  try {
    const active = ensureChannel();
    if (active) active.postMessage({ type: 'auth-changed', ...detail });
  } catch {
    // BroadcastChannel unavailable
  }

  // Cross-tab fallback. The storage event does not fire in the originating tab,
  // so this cannot feed back into this tab's own subscriber.
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

  handlers.add(handler);
  ensureChannel();

  const onStorage = (event) => {
    if (event.key === PHOLIO_AUTH_CHANNEL) handler({ type: 'auth-changed' });
  };
  window.addEventListener('storage', onStorage);

  return () => {
    handlers.delete(handler);
    window.removeEventListener('storage', onStorage);
    closeChannelIfIdle();
  };
}
