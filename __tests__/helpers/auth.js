/**
 * Authentication helpers for testing
 * Provides mock JWT tokens and authentication utilities
 */

const jwt = require('jsonwebtoken');

/**
 * Create a mock JWT token for testing
 */
function createMockToken(userId, options = {}) {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    ...options
  };

  // Use a test secret key
  const secret = process.env.CLERK_SECRET_KEY || 'test-secret-key';
  return jwt.sign(payload, secret);
}

/**
 * Create authorization header with Bearer token
 */
function createAuthHeader(userId, options = {}) {
  const token = createMockToken(userId, options);
  return `Bearer ${token}`;
}

/**
 * Mock Clerk user data
 */
function createMockClerkUser(userId, overrides = {}) {
  return {
    id: userId,
    emailAddresses: [
      {
        emailAddress: overrides.email || `${userId}@example.com`
      }
    ],
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || 'User',
    imageUrl: overrides.imageUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Mock the Clerk client for testing
 */
function mockClerkClient() {
  const mockUsers = new Map();

  return {
    users: {
      getUser: jest.fn().mockImplementation(async (userId) => {
        if (mockUsers.has(userId)) {
          return mockUsers.get(userId);
        }
        
        // Return default mock user
        const mockUser = createMockClerkUser(userId);
        mockUsers.set(userId, mockUser);
        return mockUser;
      }),
      
      // Helper to set specific user data
      setMockUser: (userId, userData) => {
        mockUsers.set(userId, createMockClerkUser(userId, userData));
      }
    },
    
    sessions: {
      verifySession: jest.fn().mockImplementation(async (token) => {
        try {
          const decoded = jwt.verify(token, process.env.CLERK_SECRET_KEY || 'test-secret-key');
          return {
            userId: decoded.sub,
            status: 'active'
          };
        } catch (error) {
          throw new Error('Invalid session token');
        }
      })
    }
  };
}

/**
 * Test user credentials for different scenarios
 */
const TEST_USERS = {
  VALID_USER: {
    id: 'test_user_1',
    email: 'test1@example.com',
    firstName: 'Test',
    lastName: 'User'
  },
  ADMIN_USER: {
    id: 'test_admin_1',
    email: 'admin1@example.com',
    firstName: 'Test',
    lastName: 'Admin'
  },
  UNREGISTERED_USER: {
    id: 'unregistered_user',
    email: 'unregistered@example.com',
    firstName: 'Unregistered',
    lastName: 'User'
  },
  DIFFERENT_SOCIETY_USER: {
    id: 'test_user_2',
    email: 'test2@example.com',
    firstName: 'Test',
    lastName: 'User2'
  }
};

module.exports = {
  createMockToken,
  createAuthHeader,
  createMockClerkUser,
  mockClerkClient,
  TEST_USERS
};