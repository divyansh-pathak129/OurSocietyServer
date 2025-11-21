const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { RateLimitError } = require('./errors');

/**
 * Security middleware configuration
 */

/**
 * Rate limiting configuration
 */
const createRateLimit = (windowMs, max, message, skipSuccessfulRequests = false, skip = null) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: skip || (() => false),
    handler: (req, res) => {
      throw new RateLimitError(message);
    }
  });
};

/**
 * General API rate limiting
 * More permissive for development and localhost
 */
const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  1000, // Increased from 100 to 1000 for development
  'Too many requests from this IP, please try again later',
  false,
  // Skip rate limiting for localhost and development
  (req) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    return isLocalhost || isDevelopment;
  }
);

/**
 * Development-friendly rate limiting (disabled for localhost)
 */
const developmentRateLimit = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const isLocalhost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
  
  // Skip rate limiting entirely for localhost and development
  if (isLocalhost || isDevelopment) {
    return next();
  }
  
  // Apply normal rate limiting for production
  return generalRateLimit(req, res, next);
};

/**
 * Authentication rate limiting
 * 5 login attempts per 15 minutes per IP
 */
const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5,
  'Too many authentication attempts, please try again later'
);

/**
 * Forum posting rate limiting
 * 10 posts per hour per user
 */
const forumRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  10,
  'Too many forum posts, please wait before posting again'
);

/**
 * Contact creation rate limiting
 * 5 contacts per hour per user
 */
const contactRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  5,
  'Too many contact creation attempts, please wait before adding more contacts'
);

/**
 * Helmet security configuration
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for API usage
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * Request sanitization middleware
 * Removes potentially dangerous characters from request data
 */
const sanitizeRequest = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove HTML tags and potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  if (req.query) {
    req.query = sanitize(req.query);
  }
  
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * IP whitelist middleware (for admin endpoints)
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length === 0 || allowedIPs.includes(clientIP)) {
      return next();
    }
    
    const error = new Error('Access denied from this IP address');
    error.statusCode = 403;
    error.code = 'IP_NOT_ALLOWED';
    throw error;
  };
};

/**
 * Request size limiting middleware
 */
const requestSizeLimit = (limit = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('content-length');
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const limitInMB = parseInt(limit);
      
      if (sizeInMB > limitInMB) {
        const error = new Error(`Request size too large. Maximum allowed: ${limit}`);
        error.statusCode = 413;
        error.code = 'REQUEST_TOO_LARGE';
        throw error;
      }
    }
    
    next();
  };
};

module.exports = {
  generalRateLimit,
  developmentRateLimit,
  authRateLimit,
  forumRateLimit,
  contactRateLimit,
  helmetConfig,
  sanitizeRequest,
  ipWhitelist,
  requestSizeLimit
};