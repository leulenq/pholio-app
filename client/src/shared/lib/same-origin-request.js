const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const SAME_ORIGIN_REQUEST_HEADER = 'X-Pholio-Request';
export const SAME_ORIGIN_REQUEST_VALUE = 'same-origin';

export function sameOriginMutationHeaders(method = 'GET') {
  if (SAFE_METHODS.has(String(method).toUpperCase())) return {};

  return {
    [SAME_ORIGIN_REQUEST_HEADER]: SAME_ORIGIN_REQUEST_VALUE,
  };
}
