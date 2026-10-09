import { ApiError } from '../api/agency';
import { sameOriginMutationHeaders } from '../../../shared/lib/same-origin-request';

async function request(endpoint, options = {}) {
  const response = await fetch(`/api/agency${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...sameOriginMutationHeaders(options.method),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // No JSON body.
  }

  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    throw new ApiError('Authentication required', 401, data);
  }

  if (!response.ok) {
    const message = data?.message || (typeof data?.error === 'string' ? data.error : null) || response.statusText;
    throw new ApiError(message, response.status, data);
  }

  return data?.success === true && data.data !== undefined ? data.data : data;
}

export function getArrival() {
  return request('/setup/arrival');
}

export function commitArrival(answers) {
  return request('/setup/arrival', { method: 'POST', body: JSON.stringify(answers) });
}
