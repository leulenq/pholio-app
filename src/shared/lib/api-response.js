/**
 * API Response Standardization
 * Ensures all API endpoints return consistent response structures
 */

/**
 * Send a successful response
 * @param {Object} res - Express response object
 * @param {*} data - The data to return
 * @param {number} [status=200] - HTTP status code
 */
function success(res, data, status = 200) {
  return res.status(status).json({
    success: true,
    data
  });
}

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} [status=400] - HTTP status code
 * @param {Object} [details=null] - Additional error details
 */
function error(res, message, status = 400, details = null) {
  const response = {
    success: false,
    error: message
  };

  if (details) {
    response.details = details;
  }

  return res.status(status).json(response);
}

/**
 * Send a not found response
 * @param {Object} res - Express response object
 * @param {string} [message='Resource not found'] - Error message
 */
function notFound(res, message = 'Resource not found') {
  return error(res, message, 404);
}

/**
 * Send an unauthorized response
 * @param {Object} res - Express response object
 * @param {string} [message='Unauthorized'] - Error message
 */
function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

/**
 * Send a forbidden response
 * @param {Object} res - Express response object
 * @param {string} [message='Forbidden'] - Error message
 */
function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {Object} errors - Validation errors object
 */
function validationError(res, errors) {
  return res.status(422).json({
    success: false,
    error: 'Validation failed',
    errors
  });
}

module.exports = {
  success,
  error,
  notFound,
  unauthorized,
  forbidden,
  validationError
};
