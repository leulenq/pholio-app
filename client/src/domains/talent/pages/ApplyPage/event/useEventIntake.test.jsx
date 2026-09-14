import { act, renderHook } from '@testing-library/react';
import { useEventIntake } from './useEventIntake';

const BASE_PAGES = [{ id: 'review' }];

describe('useEventIntake consent binding', () => {
  test('carries the server-authored event terms revision into every submission', () => {
    const claim = {
      openCallLinkId: 'call-1',
      call: {
        callKind: 'event_casting',
        consentRevision: 'terms-sha256',
        event: { startsOn: '2026-09-14', endsOn: '2026-09-18' },
        intake: {},
      },
    };
    const { result } = renderHook(() =>
      useEventIntake({ basePages: BASE_PAGES, claim }),
    );

    expect(result.current.submissionFields).toMatchObject({
      openCallLinkId: 'call-1',
      eventTermsRevision: 'terms-sha256',
    });

    act(() => result.current.setWalkVideoUrl(' https://vimeo.com/1 '));
    expect(result.current.submissionFields).toMatchObject({
      eventTermsRevision: 'terms-sha256',
      walkVideoUrl: 'https://vimeo.com/1',
    });
  });

  test('representation submissions do not acquire event-only fields', () => {
    const { result } = renderHook(() =>
      useEventIntake({ basePages: BASE_PAGES, claim: null }),
    );
    expect(result.current.submissionFields).toEqual({
      openCallLinkId: null,
      availability: null,
      walkVideoUrl: null,
    });
  });
});
