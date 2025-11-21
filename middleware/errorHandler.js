const winston = require('winston');
const { AppError } = require('./errors');

/**
 * Configure Winston logger for error logging
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'oursociety-api' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Centralized error handling middleware
 * Processes all errors and returns appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  // Default error values
  let error = { ...err };
  error.message = err.message;

  // Log error details
  const errorLog = {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.userId || 'anonymous',
    timestamp: new Date().toISOString()
  };

  // Log based on error severity
  if (error.statusCode >= 500) {
    logger.error('Server Error', errorLog);
  } else if (error.statusCode >= 400) {
    logger.warn('Client Error', errorLog);
  } else {
    logger.info('Request Error', errorLog);
  }

  // Handle specific error types
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID format';
    error = new AppError(message, 400, 'INVALID_ID');
  }

  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new AppError(message, 400, 'DUPLICATE_FIELD');
  }

  if (err.name === 'ValidationError') {
    let message;
    if (err.errors && typeof err.errors === 'object') {
      message = Object.values(err.errors).map(val => val?.message || 'Validation failed');
    } else if (err.details) {
      // Support Joi-style validation errors
      message = err.details.map(detail => detail.message || 'Validation failed');
    } else {
      message = err.message || 'Validation failed';
    }
    error = new AppError(message, 400, 'VALIDATION_ERROR');
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again';
    error = new AppError(message, 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired. Please log in again';
    error = new AppError(message, 401, 'TOKEN_EXPIRED');
  }

  // MongoDB connection errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    const message = 'Database connection error';
    error = new AppError(message, 500, 'DATABASE_ERROR');
  }

  // Rate limiting errors
  if (err.status === 429) {
    const message = 'Too many requests. Please try again later';
    error = new AppError(message, 429, 'RATE_LIMIT_EXCEEDED');
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Something went wrong'
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // Add error details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = error.stack;
    if (error.details) {
      errorResponse.error.details = error.details;
    }
  }

  // Add request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  // Send error response
  res.status(error.statusCode || 500).json(errorResponse);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * Handles requests to non-existent routes
 */
const notFoundHandler = (req, res, next) => {
  const message = `Route ${req.originalUrl} not found`;
  const error = new AppError(message, 404, 'ROUTE_NOT_FOUND');
  next(error);
};

/**
 * Request ID middleware
 * Adds unique request ID for tracking
 */
const requestId = (req, res, next) => {
  req.requestId = Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  requestId,
  logger
};