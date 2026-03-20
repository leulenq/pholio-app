const knex = require('../db/knex');
const config = require('../config');
const { getSubscriptionStatus, getTrialDaysRemaining, isInTrial, isCanceling } = require('../lib/subscriptions');

async function attachLocals(req, res, next) {
  res.locals.currentUser = null;
  res.locals.currentProfile = null;
  res.locals.currentSubscription = null;
  res.locals.trialDaysRemaining = null;
  res.locals.isInTrial = false;
  res.locals.isCanceling = false;
  if (typeof res.locals.isDashboard === 'undefined') {
    res.locals.isDashboard = false;
  }

  // Try to load user from session first
  if (req.session && req.session.userId) {
    try {
      const user = await knex('users').where({ id: req.session.userId }).first();
      if (user) {
        req.currentUser = user;
        res.locals.currentUser = { id: user.id, role: user.role, email: user.email };
            if (user.role === 'TALENT') {
              try {
                const profile = await knex('profiles').where({ user_id: user.id }).first();
                if (profile) {
                  req.currentProfile = profile;
                  res.locals.currentProfile = profile;
                }

                // Load subscription status for TALENT users
                try {
                  const subscription = await getSubscriptionStatus(user.id);
                  if (subscription) {
                    res.locals.currentSubscription = subscription;
                    res.locals.trialDaysRemaining = getTrialDaysRemaining(subscription);
                    res.locals.isInTrial = isInTrial(subscription);
                    res.locals.isCanceling = isCanceling(subscription);
                  }
                } catch (subscriptionError) {
                  // Log subscription query error but don't fail the request
                  console.error('[attachLocals] Error loading subscription:', subscriptionError.message);
                }
              } catch (profileError) {
                // Log profile query error but don't fail the request
                // This allows the app to continue even if profile query fails
                console.error('[attachLocals] Error loading profile:', profileError.message);
              }
            }
      }
    } catch (error) {
      // Check if it's a database connection error
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || 
          error.code === 'ECONNRESET' || error.message && (
            error.message.includes('connect') || 
            error.message.includes('connection') || 
            error.message.includes('DATABASE_URL') || 
            error.message.includes('database') ||
            error.message.includes('Cannot find module \'pg\'') ||
            error.message.includes('Knex: run')
          )) {
        // Log database connection error but don't fail the request for non-dashboard routes
        // Dashboard and PDF routes will handle their own database errors
        console.error('[attachLocals] Database connection error:', error.message);
        // For dashboard and PDF routes, let the error propagate so it can be handled properly
        if (req.path && (req.path.startsWith('/dashboard') || req.path.startsWith('/pdf'))) {
          return next(error);
        }
        // For other routes, continue without user data
        // This allows public pages to still work even if database is down
      } else {
        // For other errors, pass to error handler
        return next(error);
      }
    }
  } else {
    // No session, try Firebase token as fallback
    const { extractIdToken } = require('../middleware/firebase-auth');
    const { verifyIdToken } = require('../lib/firebase-admin');
    
    const idToken = extractIdToken(req);
    if (idToken) {
      try {
        const decodedToken = await verifyIdToken(idToken);
        const firebaseUid = decodedToken.uid;
        
        if (firebaseUid) {
          // Look up user by Firebase UID
          const user = await knex('users').where({ firebase_uid: firebaseUid }).first();
          if (user) {
            req.currentUser = user;
            res.locals.currentUser = { id: user.id, role: user.role, email: user.email };
            
            // Create session for this request
            req.session.userId = user.id;
            req.session.role = user.role;
            
            if (user.role === 'TALENT') {
              try {
                const profile = await knex('profiles').where({ user_id: user.id }).first();
                if (profile) {
                  req.currentProfile = profile;
                  res.locals.currentProfile = profile;
                }

                // Load subscription status for TALENT users
                try {
                  const subscription = await getSubscriptionStatus(user.id);
                  if (subscription) {
                    res.locals.currentSubscription = subscription;
                    res.locals.trialDaysRemaining = getTrialDaysRemaining(subscription);
                    res.locals.isInTrial = isInTrial(subscription);
                    res.locals.isCanceling = isCanceling(subscription);
                  }
                } catch (subscriptionError) {
                  console.error('[attachLocals] Error loading subscription:', subscriptionError.message);
                }
              } catch (profileError) {
                console.error('[attachLocals] Error loading profile:', profileError.message);
              }
            }
          }
        }
      } catch (error) {
        // Token verification failed, continue without authentication
        // This is fine for public routes
        console.log('[attachLocals] Firebase token verification failed (non-critical):', error.message);
      }
    }
  }

  res.locals.messages = req.session?.messages || [];
  if (req.session) {
    req.session.messages = [];
  }

  // Add Firebase config to res.locals for client-side use
  // Include all fields from official Firebase config object
  res.locals.firebaseConfig = {
    apiKey: config.firebase.apiKey || '',
    authDomain: config.firebase.authDomain || '',
    projectId: config.firebase.projectId || '',
    storageBucket: config.firebase.storageBucket || '',
    messagingSenderId: config.firebase.messagingSenderId || '',
    appId: config.firebase.appId || '',
    measurementId: config.firebase.measurementId || ''
  };

  // Add Stripe publishable key to res.locals for client-side use
  res.locals.stripePublishableKey = config.stripe.publishableKey || '';

  // Debug logging for Firebase config (only log if missing critical values)
  if (!res.locals.firebaseConfig.apiKey || !res.locals.firebaseConfig.authDomain || !res.locals.firebaseConfig.projectId) {
    console.warn('[Firebase Config] Missing client-side Firebase configuration:');
    console.warn('[Firebase Config]', {
      apiKey: res.locals.firebaseConfig.apiKey ? 'SET' : 'MISSING',
      authDomain: res.locals.firebaseConfig.authDomain ? 'SET' : 'MISSING',
      projectId: res.locals.firebaseConfig.projectId ? 'SET' : 'MISSING',
      storageBucket: res.locals.firebaseConfig.storageBucket ? 'SET' : 'MISSING',
      messagingSenderId: res.locals.firebaseConfig.messagingSenderId ? 'SET' : 'MISSING',
      appId: res.locals.firebaseConfig.appId ? 'SET' : 'MISSING',
      envVars: {
        FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ? 'SET' : 'MISSING',
        FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN ? 'SET' : 'MISSING',
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
        FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET ? 'SET' : 'MISSING',
        FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID ? 'SET' : 'MISSING',
        FIREBASE_APP_ID: process.env.FIREBASE_APP_ID ? 'SET' : 'MISSING'
      }
    });
  }

  next();
}

function addMessage(req, type, text) {
  if (!req.session) return;
  if (!req.session.messages) {
    req.session.messages = [];
  }
  req.session.messages.push({ type, text });
}

module.exports = {
  attachLocals,
  addMessage
};
