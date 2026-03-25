/**
 * API Client Wrapper
 * Handles base URL, headers, and error handling
 */

// Base URL handling - Vite proxy forwards /api requests
const BASE_URL = '/api/talent';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Generic fetch wrapper
 */
async function request(endpoint, options = {}) {
  const url = options.baseURL ? `${options.baseURL}${endpoint}` : `${BASE_URL}${endpoint}`;
  
  const defaultHeaders = {
    'Accept': 'application/json',
  };

  // Only add Content-Type if we're not sending FormData (file upload)
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    credentials: 'include', // Ensure cookies are sent with requests
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Handle 401 Unauthorized - Redirect to login (unless suppressed)
    if (response.status === 401) {
      if (!options.skipRedirect) {
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      }
      // If skipping redirect, we still return the response (or throw error/return null depending on logic below)
      // But typically we want to let the caller handle the 401 if they skipped redirect
      if (!options.skipRedirect) return; // Stop execution if redirecting
    }

    // Try to parse JSON response
    let data;
    try {
      data = await response.json();
    } catch (err) {
      // If response is not JSON
      data = null;
    }

    if (!response.ok) {
      throw new ApiError(
        (data && data.error) || (data && data.message) || response.statusText || 'API Error',
        response.status,
        data
      );
    }

    // Unwrap standardized API response: { success: true, data: {...} } → {...}
    if (data && data.success === true && data.data !== undefined) {
      return data.data;
    }

    return data;
  } catch (error) {
    // If it's already an ApiError, rethrow
    if (error instanceof ApiError) throw error;
    
    // Use fallback message
    throw new ApiError(error.message || 'Network error', 0, null);
  }
}

export const apiClient = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => request(endpoint, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
  put: (endpoint, body, options) => request(endpoint, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
  patch: (endpoint, body, options) => request(endpoint, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};
