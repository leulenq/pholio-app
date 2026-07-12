import { ApiError } from './agency';

const BASE_URL = '/api/agency';

async function request(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Response did not include JSON. Leave data as null.
  }

  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    throw new ApiError('Authentication required', response.status, data);
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || response.statusText || 'Agency setup request failed';
    throw new ApiError(
      errorMsg,
      response.status,
      data
    );
  }

  return data?.success === true && data.data !== undefined ? data.data : data;
}

export function getAgencySetup() {
  return request('/setup');
}

export function saveSetupProfile(payload) {
  return request('/setup/profile', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function saveSetupBoards(payload) {
  return request('/setup/boards', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function saveSetupTeam(payload = { skipped: true }) {
  return request('/setup/team', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function saveSetupRoster(payload) {
  return request('/setup/roster', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function createImportJob(payload) {
  return request('/import-jobs', { method: 'POST', body: JSON.stringify(payload) });
}

export function saveSetupOpenCall(payload) {
  return request('/setup/open-call', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function saveSetupDefaults(payload) {
  return request('/setup/defaults', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function saveSetupPrivacy(payload) {
  return request('/setup/privacy', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function completeAgencySetup() {
  return request('/setup/complete', { method: 'POST', body: JSON.stringify({}) });
}
