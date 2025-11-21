/**
 * Integration tests for authentication middleware
 * Tests JWT verification, user details extraction, and authorization logic
 */

const request = require('supertest');
const app = require('../../app');
const { setupTestDatabase, cleanupTestDatabase, teardownTestDatabase, setupTestData } = require('../setup');
const { createAuthHeader, createMockToken, mockClerkClient } = require('../helpers/auth');

// Mock Clerk client
jest.mock('@clerk/clerk-sdk-node', () => {
  const mockClient = mockClerkClient();
  return {
    clerkClient: mockClient,
    verifyToken: jest.fn().mockImplementation(async (token) => {
      const jwt = require('jsonwebtoken');
      return jwt.verify(token, process.env.CLERK_SECRET_KEY || 'test-secret-key');
    })
  };
});

describe('Authentication Middleware Integration Tests', () => {
  let testData;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
    testData = await setupTestData();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('JWT Token Verification', () => {
    it('should accept valid JWT token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject request without authorization header', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toContain('Missing or invalid authorization header');
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'InvalidHeader')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toContain('Missing or invalid authorization header');
    });

    it('should reject request with empty token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toBe('No session token provided');
    });

    it('should reject expired token', async () => {
      const expiredToken = createMockToken('test_user_1', {
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toContain('expired');
    });

    it('should reject invalid token signature', async () => {
      const invalidToken = createMockToken('test_user_1') + 'invalid';

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
    });

    it('should reject token without user ID', async () => {
      const jwt = require('jsonwebtoken');
      const tokenWithoutSub = jwt.sign(
        {
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
          // Missing 'sub' field
        },
        process.env.CLERK_SECRET_KEY || 'test-secret-key'
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${tokenWithoutSub}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toContain('does not contain valid user information');
    });
  });

  describe('User Details Extraction', () => {
    it('should extract user details from Clerk', async () => {
      // Mock specific user data
      const { clerkClient } = require('@clerk/clerk-sdk-node');
      clerkClient.users.setMockUser('test_user_details', {
        email: 'details@example.com',
        firstName: 'Details',
        lastName: 'User',
        imageUrl: 'https://example.com/image.jpg'
      });

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('test_user_details'))
        .send({
          title: 'Test Post',
          content: 'Test content'
        })
        .expect(404); // User not registered, but auth should work

      // Should fail at user registration check, not auth
      expect(response.body.error).toBe('User Not Found');
      expect(response.body.requiresRegistration).toBe(true);
    });

    it('should handle Clerk API errors gracefully', async () => {
      // Mock Clerk to throw an error
      const { clerkClient } = require('@clerk/clerk-sdk-node');
      clerkClient.users.getUser.mockRejectedValueOnce(new Error('Clerk API Error'));

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('error_user'))
        .send({
          title: 'Test Post',
          content: 'Test content'
        })
        .expect(500);

      expect(response.body.error).toBe('External Service Error');
    });
  });

  describe('Society-based Authorization', () => {
    it('should allow access to own society data', async () => {
      const response = await request(app)
        .get('/api/forum')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.societyId).toBe(testData.societyIds[0].toString());
    });

    it('should prevent cross-society data access', async () => {
      // User from society 2 trying to access society 1 data
      const response = await request(app)
        .get('/api/forum')
        .set('Authorization', createAuthHeader('test_user_2'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.societyId).toBe(testData.societyIds[1].toString());
      // Should only see their own society's data
      expect(response.body.data).toHaveLength(0); // No posts in society 2
    });

    it('should enforce admin privileges for admin-only endpoints', async () => {
      const contactData = {
        name: 'Test Contact',
        role: 'Security',
        phoneNumber: '9876543299'
      };

      // Regular user should be denied
      const userResponse = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(contactData)
        .expect(403);

      expect(userResponse.body.error).toBe('Forbidden');

      // Admin user should be allowed
      const adminResponse = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(contactData)
        .expect(201);

      expect(adminResponse.body.success).toBe(true);
    });
  });

  describe('Rate Limiting and Security', () => {
    it('should handle multiple valid requests', async () => {
      const requests = Array(5).fill().map(() =>
        request(app)
          .get('/api/users/profile')
          .set('Authorization', createAuthHeader('test_user_1'))
      );

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should maintain session across multiple requests', async () => {
      const authHeader = createAuthHeader('test_user_1');

      // First request
      const response1 = await request(app)
        .get('/api/users/profile')
        .set('Authorization', authHeader)
        .expect(200);

      // Second request with same token
      const response2 = await request(app)
        .get('/api/users/profile')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response1.body.data.clerkUserId).toBe(response2.body.data.clerkUserId);
    });
  });

  describe('Error Handling', () => {
    it('should return consistent error format for auth failures', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.error).toBe('Authentication Error');
    });

    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).not.toContain('secret');
      expect(response.body.message).not.toContain('key');
      expect(response.body.message).not.toContain('CLERK_SECRET_KEY');
    });

    it('should handle malformed JWT tokens gracefully', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toContain('Invalid session token');
    });
  });

  describe('Optional Authentication', () => {
    it('should handle public endpoints without authentication', async () => {
      const response = await request(app)
        .get('/api/users/societies')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle health check without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
    });
  });
});