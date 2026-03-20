const { addMessage } = require('./context');

function ensureSignedIn(req) {
  return Boolean(req.session && req.session.userId);
}

function isApiRequest(req) {
  const accept = (req.get && req.get('accept')) ? req.get('accept') : '';
  const path = req.path || req.originalUrl || '';
  // Treat any /api/* or /onboarding/* route as API, plus explicit JSON Accept or XHR
  return (
    path.startsWith('/api/') ||
    path.startsWith('/onboarding/') ||
    (typeof accept === 'string' && accept.includes('application/json')) ||
    Boolean(req.xhr)
  );
}

function requireAuth(req, res, next) {
  if (!ensureSignedIn(req)) {
    if (isApiRequest(req)) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to continue.'
      });
    }
    addMessage(req, 'error', 'Please sign in to continue.');
    // Redirect to Client Login (Port 5173 in dev, /login in prod)
    const loginUrl = process.env.NODE_ENV === 'production' ? '/login' : 'http://localhost:5173/login';
    return res.redirect(loginUrl);
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!ensureSignedIn(req)) {
      if (isApiRequest(req)) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please sign in to continue.'
        });
      }
      addMessage(req, 'error', 'Please sign in to continue.');
      // Redirect to Client Login (Port 5173 in dev, /login in prod)
      const loginUrl = process.env.NODE_ENV === 'production' ? '/login' : 'http://localhost:5173/login';
      return res.redirect(loginUrl);
    }
    const userRole = req.session.role;
    if (roles.length && !roles.includes(userRole)) {
      if (isApiRequest(req)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource.',
          requiredRoles: roles,
          role: userRole || null
        });
      }
      return res.status(403).render('errors/403', { title: 'Forbidden' });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
