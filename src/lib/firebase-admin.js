const admin = require('firebase-admin');
const config = require('../config');

let adminApp = null;

/**
 * Initialize Firebase Admin SDK
 * Should be called once at application startup
 */
function initializeFirebaseAdmin() {
  // Return existing instance if already initialized (for serverless environments)
  if (adminApp) {
    return adminApp;
  }

  // Check if Firebase config is provided
  if (!config.firebase.projectId || !config.firebase.privateKey || !config.firebase.clientEmail) {
    console.warn('[Firebase Admin] Firebase configuration missing. Firebase authentication will not work.');
    console.warn('[Firebase Admin] Required env vars: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
    return null;
  }

  try {
    // Initialize Firebase Admin with service account credentials
    adminApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        privateKey: config.firebase.privateKey,
        clientEmail: config.firebase.clientEmail,
        clientId: config.firebase.clientId
      }),
      projectId: config.firebase.projectId
    });

    console.log('[Firebase Admin] Initialized successfully');
    return adminApp;
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error.message);
    return null;
  }
}

/**
 * Get Firebase Admin Auth instance
 */
function getAuth() {
  if (!adminApp) {
    initializeFirebaseAdmin();
  }
  return adminApp ? admin.auth() : null;
}

/**
 * Verify a Firebase ID token
 * @param {string} idToken - The Firebase ID token to verify
 * @returns {Promise<admin.auth.DecodedIdToken>} Decoded token with user info
 */
async function verifyIdToken(idToken) {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Firebase Admin not initialized');
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    // Re-throw with more context
    if (error.code === 'auth/id-token-expired') {
      throw new Error('Token expired');
    } else if (error.code === 'auth/id-token-revoked') {
      throw new Error('Token revoked');
    } else if (error.code === 'auth/argument-error') {
      throw new Error('Invalid token format');
    } else {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }
}

/**
 * Create a new Firebase user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {object} additionalData - Additional user data (displayName, etc.)
 * @returns {Promise<admin.auth.UserRecord>} Created user record
 */
async function createUser(email, password, additionalData = {}) {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Firebase Admin not initialized');
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      ...additionalData
    });
    return userRecord;
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new Error('Email already exists');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak');
    } else {
      throw new Error(`User creation failed: ${error.message}`);
    }
  }
}

/**
 * Delete a Firebase user by UID
 * @param {string} uid - Firebase user UID
 */
async function deleteUser(uid) {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Firebase Admin not initialized');
  }

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    throw new Error(`User deletion failed: ${error.message}`);
  }
}

/**
 * Get user by Firebase UID
 * @param {string} uid - Firebase user UID
 * @returns {Promise<admin.auth.UserRecord>} User record
 */
async function getUser(uid) {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Firebase Admin not initialized');
  }

  try {
    const userRecord = await auth.getUser(uid);
    return userRecord;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    throw new Error(`Get user failed: ${error.message}`);
  }
}

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<admin.auth.UserRecord | null>} User record or null
 */
async function getUserByEmail(email) {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Firebase Admin not initialized');
  }

  try {
    const userRecord = await auth.getUserByEmail(email);
    return userRecord;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    throw new Error(`Get user by email failed: ${error.message}`);
  }
}

module.exports = {
  initializeFirebaseAdmin,
  getAuth,
  verifyIdToken,
  createUser,
  deleteUser,
  getUser,
  getUserByEmail
};

