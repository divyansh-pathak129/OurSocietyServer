const { clerkClient, verifyToken } = require('@clerk/clerk-sdk-node');
const { AuthenticationError, ExternalServiceError, NotFoundError } = require('./errors');

/**
 * Clerk JWT verification middleware for protected routes
 * Extracts and validates userId from Clerk tokens
 * Implements error handling for invalid or expired tokens
 */
const verifyClerkToken = async (req, res, next) => {
  try {
    // Extract the session token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header. Expected format: Bearer <token>');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new AuthenticationError('No session token provided');
    }

    // Verify the JWT token with Clerk
    let payload;
    try {
      // Use the verifyToken function from Clerk SDK
      payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });
    } catch (clerkError) {
      console.error('Clerk token verification failed:', clerkError.message);
      console.error('Full error:', clerkError);
      
      // Handle specific Clerk errors
      if (clerkError.message.includes('expired') || clerkError.message.includes('Expired')) {
        throw new AuthenticationError('Session token has expired. Please log in again.');
      }
      
      if (clerkError.message.includes('invalid') || clerkError.message.includes('Invalid')) {
        throw new AuthenticationError('Invalid session token provided.');
      }

      // For other Clerk errors, treat as external service error
      throw new ExternalServiceError('Unable to verify session token.', 
        process.env.NODE_ENV === 'development' ? clerkError.message : null);
    }

    // Extract userId from the verified token payload
    const userId = payload.sub;
    
    if (!userId) {
      throw new AuthenticationError('Token does not contain valid user information.');
    }

    // Attach userId to request object for use in route handlers
    req.userId = userId;
    req.tokenPayload = payload;

    // Log successful authentication in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Authenticated user: ${userId}`);
    }

    next();
  } catch (error) {
    // If it's already one of our custom errors, just re-throw it
    if (error.isOperational) {
      throw error;
    }
    
    // For unexpected errors, wrap in a generic error
    console.error('Authentication middleware error:', error);
    throw new ExternalServiceError('An error occurred during authentication verification.');
  }
};

/**
 * Optional middleware to extract user info without requiring authentication
 * Useful for routes that work differently for authenticated vs anonymous users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth header, continue without user info
      req.userId = null;
      req.session = null;
      return next();
    }

    const sessionToken = authHeader.substring(7);
    
    if (!sessionToken) {
      req.userId = null;
      req.session = null;
      return next();
    }

    try {
      const session = await clerkClient.sessions.verifySession(sessionToken, {
        secretKey: process.env.CLERK_SECRET_KEY
      });

      if (session && session.status === 'active') {
        req.userId = session.userId;
        req.session = session;
      } else {
        req.userId = null;
        req.session = null;
      }
    } catch (clerkError) {
      // If verification fails, continue without user info
      req.userId = null;
      req.session = null;
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without user info on error
    req.userId = null;
    req.session = null;
    next();
  }
};

/**
 * Middleware to get user details from Clerk
 * Requires verifyClerkToken to be run first
 */
const getUserDetails = async (req, res, next) => {
  try {
    if (!req.userId) {
      throw new AuthenticationError('User ID not found. Ensure authentication middleware is applied first.');
    }

    // Fetch user details from Clerk
    const user = await clerkClient.users.getUser(req.userId);
    
    if (!user) {
      throw new NotFoundError('User details could not be retrieved.');
    }

    // Attach user details to request
    req.user = {
      id: user.id,
      email: user.emailAddresses?.[0]?.emailAddress || null,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || null,
      imageUrl: user.imageUrl || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    next();
  } catch (error) {
    // If it's already one of our custom errors, just re-throw it
    if (error.isOperational) {
      throw error;
    }
    
    console.error('Get user details middleware error:', error);
    throw new ExternalServiceError('An error occurred while retrieving user details.');
  }
};

module.exports = {
  verifyClerkToken,
  optionalAuth,
  getUserDetails,
  clerkClient
};