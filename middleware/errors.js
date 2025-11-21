/**
 * Custom Error Classes for OurSociety Application
 * Provides structured error handling with appropriate HTTP status codes
 */

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - 400 Bad Request
 * Used for input validation failures
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication Error - 401 Unauthorized
 * Used for authentication failures
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization Error - 403 Forbidden
 * Used when user doesn't have permission for the resource
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not Found Error - 404 Not Found
 * Used when requested resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND_ERROR', details);
  }
}

/**
 * Conflict Error - 409 Conflict
 * Used for resource conflicts (e.g., duplicate entries)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Database Error - 500 Internal Server Error
 * Used for database operation failures
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * External Service Error - 502 Bad Gateway
 * Used for external service failures (e.g., Clerk API)
 */
class ExternalServiceError extends AppError {
  constructor(message = 'External service unavailable', details = null) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', details);
  }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 * Used when rate limits are exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError
};