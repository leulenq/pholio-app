import { describe, expect, test } from 'vitest';
import {
  SAME_ORIGIN_REQUEST_HEADER,
  SAME_ORIGIN_REQUEST_VALUE,
  sameOriginMutationHeaders,
} from '../same-origin-request';

describe('sameOriginMutationHeaders', () => {
  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('marks %s requests', (method) => {
    expect(sameOriginMutationHeaders(method)).toEqual({
      [SAME_ORIGIN_REQUEST_HEADER]: SAME_ORIGIN_REQUEST_VALUE,
    });
  });

  test.each(['GET', 'HEAD', 'OPTIONS', undefined])('leaves %s requests untouched', (method) => {
    expect(sameOriginMutationHeaders(method)).toEqual({});
  });
});
