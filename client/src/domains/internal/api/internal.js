import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

async function internalRequest(path, options = {}) {
  const response = await fetch(`/api/internal${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...sameOriginMutationHeaders(options.method),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || 'Unable to complete the review action.');
    error.status = response.status;
    error.code = payload?.error;
    throw error;
  }
  return payload?.data;
}

export function listAgencyRequests(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return internalRequest(`/agency-requests${query}`);
}

export function getAgencyRequest(requestId) {
  return internalRequest(`/agency-requests/${encodeURIComponent(requestId)}`);
}

export function scheduleAgencyQualificationCall(requestId, input) {
  return internalRequest(
    `/agency-requests/${encodeURIComponent(requestId)}/qualification-call`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function approveAgencyRequest(requestId, input) {
  return internalRequest(`/agency-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function declineAgencyRequest(requestId, input) {
  return internalRequest(`/agency-requests/${encodeURIComponent(requestId)}/decline`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
