const { requireAgencyOnboardingComplete } = require('../../src/domains/auth/middleware/require-auth');

describe('requireAgencyOnboardingComplete', () => {
  function runMiddleware(reqOverrides = {}, allow = []) {
    const req = {
      method: 'GET',
      originalUrl: '/api/agency/applications',
      path: '/api/agency/applications',
      session: { role: 'AGENCY', userId: 'agency-1', agencyId: 'agency-1' },
      get: () => 'application/json',
      xhr: false,
      ...reqOverrides,
    };
    const res = {
      statusCode: 200,
      body: null,
      redirectedTo: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
      redirect(path) {
        this.redirectedTo = path;
        return this;
      },
    };
    const next = jest.fn();
    requireAgencyOnboardingComplete({ allow })(req, res, next);
    return { req, res, next };
  }

  test('blocks incomplete agency API routes with setup redirect payload', () => {
    const { res, next } = runMiddleware();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: 'AGENCY_SETUP_REQUIRED',
      redirect: '/dashboard/agency/setup',
    });
  });

  test('allows explicitly allowlisted setup routes', () => {
    const { next } = runMiddleware(
      { method: 'PATCH', originalUrl: '/api/agency/setup/profile' },
      [{ method: 'PATCH', pathPrefix: '/setup/' }],
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('allows agencies with completed setup', () => {
    const { next } = runMiddleware({
      session: {
        role: 'AGENCY',
        userId: 'agency-1',
        agencyId: 'agency-1',
        agencyOnboardingCompletedAt: '2026-07-10T00:00:00.000Z',
      },
    });

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('passes through non-agency sessions', () => {
    const { next } = runMiddleware({
      session: { role: 'TALENT', userId: 'user-1' },
    });

    expect(next).toHaveBeenCalledTimes(1);
  });
});
