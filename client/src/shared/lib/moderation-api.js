/**
 * Moderation API (moderator-only endpoints under /api).
 */

async function moderationFetch(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Moderation request failed');
  }
  return data;
}

export const moderationApi = {
  getMe: () => moderationFetch('/moderation/me'),
  getQueue: (status = 'pending') =>
    moderationFetch(`/moderation/queue?status=${encodeURIComponent(status)}`),
  reviewQueueItem: (id, action, note) =>
    moderationFetch(`/moderation/queue/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, note }),
    }),
  getCsamEscalations: () => moderationFetch('/moderation/csam-escalations'),
  updateCsamEscalation: (id, status, notes) =>
    moderationFetch(`/moderation/csam-escalations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    }),
  getReports: (status = 'pending') =>
    moderationFetch(`/reports?status=${encodeURIComponent(status)}`),
  updateReport: (id, status) =>
    moderationFetch(`/reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  suspendUser: (userId, reason) =>
    moderationFetch(`/moderation/users/${encodeURIComponent(userId)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  banUser: (userId, reason) =>
    moderationFetch(`/moderation/users/${encodeURIComponent(userId)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
