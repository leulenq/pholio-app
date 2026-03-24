/**
 * Centralized Error Handler Middleware
 * 
 * Provides consistent error handling and user-friendly error messages across the application.
 * Handles database errors, validation errors, and general application errors.
 */

/**
 * Helper to determine if a request is an API request
 */
function isApiRequest(req) {
  const path = req.path || req.originalUrl || '';
  const accept = req.get ? req.get('accept') : '';
  return (
    path.startsWith('/api/') ||
    path.startsWith('/onboarding/') ||
    (typeof accept === 'string' && accept.includes('application/json')) ||
    Boolean(req.xhr)
  );
}

/**
 * Standard error handler middleware for Express
 * Should be used as the last middleware in the app
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Log error with context
  console.error('[Error Handler]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    status: err.status || err.statusCode || 500,
    code: err.code,
    path: req.path,
    method: req.method,
    userId: req.session?.userId,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  });

  // Determine error type and status code
  const statusCode = err.status || err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  // Database connection errors
  if (isDatabaseConnectionError(err)) {
    return handleDatabaseError(err, req, res, statusCode, isDevelopment);
  }

  // Database query errors (table missing, etc.)
  if (isDatabaseQueryError(err)) {
    return handleDatabaseQueryError(err, req, res, statusCode, isDevelopment);
  }

  // Validation errors (Zod, etc.)
  if (isValidationError(err)) {
    return handleValidationError(err, req, res, statusCode, isDevelopment);
  }

  // File upload errors
  if (isFileUploadError(err)) {
    return handleFileUploadError(err, req, res, statusCode, isDevelopment);
  }

  // Authentication/Authorization errors
  if (statusCode === 401 || statusCode === 403) {
    return handleAuthError(err, req, res, statusCode, isDevelopment);
  }

  // Not found errors
  if (statusCode === 404) {
    return handleNotFoundError(err, req, res, statusCode, isDevelopment);
  }

  // Generic server errors
  return handleGenericError(err, req, res, statusCode, isDevelopment);
}

/**
 * Check if error is a database connection error
 */
function isDatabaseConnectionError(err) {
  const connectionErrorCodes = [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    '28P01', // PostgreSQL invalid password
    '3D000'  // PostgreSQL database does not exist
  ];

  return connectionErrorCodes.includes(err.code) ||
    (err.message && (
      err.message.includes('connect') ||
      err.message.includes('connection') ||
      err.message.includes('DATABASE_URL') ||
      err.message.includes('Cannot find module \'pg\'') ||
      err.message.includes('Knex: run')
    ));
}

/**
 * Check if error is a database query error (missing tables, etc.)
 */
function isDatabaseQueryError(err) {
  return err.code === '42P01' || // PostgreSQL relation does not exist
    err.code === '42P07' || // PostgreSQL relation already exists
    (err.message && (
      (err.message.includes('relation') && err.message.includes('does not exist')) ||
      (err.message.includes('table') && err.message.includes('does not exist'))
    ));
}

/**
 * Check if error is a validation error
 */
function isValidationError(err) {
  return err.name === 'ZodError' ||
    err.name === 'ValidationError' ||
    err.isJoi ||
    err.statusCode === 422 ||
    err.status === 422;
}

/**
 * Check if error is a file upload error
 */
function isFileUploadError(err) {
  return err.code === 'LIMIT_FILE_SIZE' ||
    err.code === 'LIMIT_FILE_COUNT' ||
    err.code === 'LIMIT_UNEXPECTED_FILE' ||
    err.name === 'MulterError';
}

/**
 * Handle database connection errors
 */
function handleDatabaseError(err, req, res, statusCode, isDevelopment) {
  const message = 'Unable to connect to the database. Please check your database configuration.';
  const details = isDevelopment ? err.message : undefined;

  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(500).json({
      success: false,
      error: {
        message,
        code: 'DATABASE_CONNECTION_ERROR',
        details: isDevelopment ? details : undefined
      }
    });
  }

  // For page requests, render error page
  return res.status(500).render('errors/500', {
    title: 'Database Connection Error',
    layout: 'layout',
    error: {
      message,
      code: err.code,
      name: err.name,
      details,
      isDatabaseError: true
    },
    isDevelopment,
    showDetails: isDevelopment
  });
}

/**
 * Handle database query errors (missing tables, etc.)
 */
function handleDatabaseQueryError(err, req, res, statusCode, isDevelopment) {
  const message = 'Database tables do not exist. Please run migrations to set up the database.';
  const details = isDevelopment ? err.message : undefined;

  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(500).json({
      success: false,
      error: {
        message,
        code: 'DATABASE_SETUP_REQUIRED',
        details: isDevelopment ? details : undefined,
        migrationRequired: true
      }
    });
  }

  // For page requests, render error page
  return res.status(500).render('errors/500', {
    title: 'Database Setup Required',
    layout: 'layout',
    error: {
      message,
      code: err.code,
      name: err.name,
      details,
      migrationRequired: true
    },
    isDevelopment,
    showDetails: isDevelopment
  });
}

/**
 * Handle validation errors
 */
function handleValidationError(err, req, res, statusCode, isDevelopment) {
  // Extract validation errors from Zod
  let formErrors = {};
  if (err.name === 'ZodError' && err.errors) {
    err.errors.forEach((error) => {
      const field = error.path.join('.');
      if (!formErrors[field]) {
        formErrors[field] = [];
      }
      formErrors[field].push(error.message);
    });
  } else if (err.errors) {
    // Handle other validation error formats
    formErrors = err.errors;
  } else {
    // Single error message
    formErrors._general = [err.message || 'Validation failed'];
  }

  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(422).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: formErrors
      }
    });
  }

  // For form submissions, store errors in session and redirect back
  // Route handlers should handle this, but if we get here, handle it
  if (!req.session) req.session = {};
  if (!req.session.messages) req.session.messages = [];
  req.session.messages.push({ type: 'error', message: 'Please correct the errors in the form' });
  req.session.formErrors = formErrors;

  // If it's a POST request, redirect back
  if (req.method === 'POST') {
    return res.redirect(req.path);
  }

  // Otherwise render with errors (if 422 template exists)
  // If template doesn't exist, fall back to generic error
  try {
    return res.status(422).render('errors/422', {
      title: 'Validation Error',
      layout: 'layout',
      error: {
        message: 'Validation failed',
        errors: formErrors
      },
      formErrors
    });
  } catch (renderErr) {
    // 422 template doesn't exist, use generic error handler
    return handleGenericError(err, req, res, 422, isDevelopment);
  }
}

/**
 * Handle file upload errors
 */
function handleFileUploadError(err, req, res, statusCode, isDevelopment) {
  let message = 'File upload failed';
  let details = isDevelopment ? err.message : undefined;

  if (err.code === 'LIMIT_FILE_SIZE') {
    message = 'File size exceeds the maximum allowed size (10MB)';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    message = 'Too many files uploaded. Maximum 12 files allowed.';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    message = 'Unexpected file field name';
  }

  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(400).json({
      success: false,
      error: {
        message,
        code: 'FILE_UPLOAD_ERROR',
        details: isDevelopment ? details : undefined
      }
    });
  }

  // For page requests, store error in session and redirect
  if (!req.session) req.session = {};
  if (!req.session.messages) req.session.messages = [];
  req.session.messages.push({ type: 'error', message });

  return res.redirect(req.path);
}

/**
 * Handle authentication/authorization errors
 */
function handleAuthError(err, req, res, statusCode, isDevelopment) {
  const message = statusCode === 401
    ? 'You must be logged in to access this page'
    : 'You do not have permission to access this page';
  
  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'
      }
    });
  }
  
  // For page requests, redirect to login or render 403
  if (statusCode === 401) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }

  return res.status(403).render('errors/403', {
    title: 'Access Denied',
    layout: 'layout',
    error: {
      message
    }
  });
}

/**
 * Handle not found errors
 */
function handleNotFoundError(err, req, res, statusCode, isDevelopment) {
  const message = err.message || 'Page not found';

  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(404).json({
      success: false,
      error: {
        message,
        code: 'NOT_FOUND'
      }
    });
  }

  // For page requests, render 404 page
  return res.status(404).render('errors/404', {
    title: 'Page Not Found',
      layout: 'layout',
    error: {
      message
    }
  });
}

/**
 * Handle generic server errors
 */
function handleGenericError(err, req, res, statusCode, isDevelopment) {
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'An unexpected error occurred';

  const details = isDevelopment ? {
    message: err.message,
    stack: err.stack,
    code: err.code
  } : undefined;

  // For API requests, return JSON
  if (isApiRequest(req)) {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: 'INTERNAL_SERVER_ERROR',
        details: isDevelopment ? details : undefined
      }
    });
  }

  // For page requests, render error page
  return res.status(statusCode).render('errors/500', {
    title: 'Server Error',
    layout: 'layout',
    error: {
      message,
      details,
      code: err.code,
      name: err.name
    },
    isDevelopment,
    showDetails: isDevelopment
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 * Automatically passes errors to error handler middleware
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 * 
 * @example
 * router.get('/route', asyncHandler(async (req, res) => {
 *   // async code that might throw
 * }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create a standardized error response for API routes
 * 
 * @param {Error|string} error - Error object or error message
 * @param {string} code - Error code (optional)
 * @returns {Object} Error response object
 */
function createErrorResponse(error, code = 'ERROR') {
  const message = error instanceof Error ? error.message : error;
  const errorObj = {
    success: false,
    error: {
      message,
      code
    }
  };
  
  if (error instanceof Error && error.code) {
    errorObj.error.code = error.code;
  }
  
  if (process.env.NODE_ENV === 'development' && error instanceof Error && error.stack) {
    errorObj.error.stack = error.stack;
  }
  
  return errorObj;
}

/**
 * Create a standardized success response for API routes
 * 
 * @param {*} data - Response data
 * @param {string} message - Success message (optional)
 * @returns {Object} Success response object
 */
function createSuccessResponse(data = null, message = null) {
  const response = {
    success: true
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

module.exports = {
  errorHandler,
  asyncHandler,
  createErrorResponse,
  createSuccessResponse,
  isDatabaseConnectionError,
  isDatabaseQueryError,
  isValidationError,
  isFileUploadError
};