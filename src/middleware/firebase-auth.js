const { verifyIdToken } = require('../lib/firebase-admin');
const knex = require('../db/knex');

/**
 * Extract Firebase ID token from request
 * Checks Authorization header (Bearer token) or cookie
 * @param {object} req - Express request object
 * @returns {string|null} Firebase ID token or null
 */
function extractIdToken(req) {
  // Check Authorization header: "Bearer <token>"
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  if (req.cookies && req.cookies.firebase_token) {
    return req.cookies.firebase_token;
  }

  // Check body for token (for form submissions)
  if (req.body && req.body.firebase_token) {
    return req.body.firebase_token;
  }

  return null;
}

/**
 * Verify Firebase ID token and load user from database
 * Attaches user to req.user and creates session if missing
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware
 */
async function verifyFirebaseToken(req, res, next) {
  const idToken = extractIdToken(req);

  if (!idToken) {
    return next(); // No token provided, continue without authentication
  }

  try {
    // Verify Firebase ID token
    const decodedToken = await verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;

    if (!firebaseUid) {
      return next(); // Token verified but no UID (shouldn't happen)
    }

    // Look up user in database by Firebase UID
    const user = await knex('users').where({ firebase_uid: firebaseUid }).first();

    if (!user) {
      // User not found in database
      // This could happen if user was created in Firebase but not in our DB yet
      // Or if user hasn't completed signup
      return next(); // Continue without authentication, let route handle error
    }

    // Attach user to request
    req.user = user;
    req.firebaseUid = firebaseUid;
    req.firebaseToken = decodedToken;

    // Create or update session if missing
    if (!req.session || !req.session.userId || req.session.userId !== user.id) {
      req.session.userId = user.id;
      req.session.role = user.role;

      // Save session
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('[Firebase Auth] Error saving session:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    return next();
  } catch (error) {
    // Token verification failed
    console.error('[Firebase Auth] Token verification failed:', error.message);

    // Don't fail the request, just continue without authentication
    // Let individual routes handle authentication requirements
    return next();
  }
}

/**
 * Middleware to require Firebase authentication
 * Use this instead of verifyFirebaseToken if authentication is mandatory
 */
function requireFirebaseAuth(req, res, next) {
  verifyFirebaseToken(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return next();
  });
}

module.exports = {
  extractIdToken,
  verifyFirebaseToken,
  requireFirebaseAuth
};

