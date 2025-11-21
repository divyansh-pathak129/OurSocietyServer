/**
 * Integration tests for user endpoints
 * Tests user registration, profile management, and society verification
 */

const request = require('supertest');
const app = require('../../app');
const { setupTestDatabase, cleanupTestDatabase, teardownTestDatabase, setupTestData } = require('../setup');
const { createAuthHeader, mockClerkClient, TEST_USERS } = require('../helpers/auth');

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

describe('User API Integration Tests', () => {
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

  describe('POST /api/users/register-society', () => {
    it('should register a new user with society successfully', async () => {
      const registrationData = {
        societyId: testData.societyIds[0].toString(),
        wing: 'C',
        flatNumber: '301',
        residentType: 'Owner',
        contactNumber: '9876543215'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', createAuthHeader('new_user_123'))
        .send(registrationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User successfully registered with society');
      expect(response.body.data).toMatchObject({
        societyName: 'Test Society 1',
        wing: 'C',
        flatNumber: '301',
        residentType: 'Owner'
      });
    });

    it('should return 409 if user is already registered', async () => {
      const registrationData = {
        societyId: testData.societyIds[0].toString(),
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner',
        contactNumber: '9876543210'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(registrationData)
        .expect(409);

      expect(response.body.error).toBe('Conflict');
      expect(response.body.message).toContain('already completed society registration');
    });

    it('should return 404 if society does not exist', async () => {
      const registrationData = {
        societyId: '507f1f77bcf86cd799439011', // Non-existent society ID
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner',
        contactNumber: '9876543210'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', createAuthHeader('new_user_456'))
        .send(registrationData)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
      expect(response.body.message).toBe('The specified society does not exist');
    });

    it('should return 400 for invalid input data', async () => {
      const registrationData = {
        societyId: 'invalid-id',
        wing: '',
        residentType: 'InvalidType'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', createAuthHeader('new_user_789'))
        .send(registrationData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 401 without authentication', async () => {
      const registrationData = {
        societyId: testData.societyIds[0].toString(),
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .send(registrationData)
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
    });
  });

  describe('GET /api/users/profile', () => {
    it('should return user profile for registered user', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        clerkUserId: 'test_user_1',
        name: 'Test User 1',
        email: 'test1@example.com',
        society: {
          name: 'Test Society 1'
        },
        residence: {
          wing: 'A',
          flatNumber: '101',
          residentType: 'Owner'
        },
        isActive: true
      });
    });

    it('should return 404 for unregistered user', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .expect(404);

      expect(response.body.error).toBe('Not Found');
      expect(response.body.message).toContain('Please complete society registration first');
      expect(response.body.details.requiresRegistration).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        contactNumber: '9999999999',
        flatNumber: '102'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.data).toMatchObject({
        contactNumber: '9999999999',
        flatNumber: '102'
      });
    });

    it('should handle partial updates', async () => {
      const updateData = {
        contactNumber: '8888888888'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.contactNumber).toBe('8888888888');
    });

    it('should return 404 for unregistered user', async () => {
      const updateData = {
        contactNumber: '9999999999'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Not Found');
      expect(response.body.details.requiresRegistration).toBe(true);
    });
  });

  describe('GET /api/users/societies', () => {
    it('should return list of available societies', async () => {
      const response = await request(app)
        .get('/api/users/societies')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        name: 'Test Society 1',
        address: '123 Test Street, Test City'
      });
      expect(response.body.count).toBe(2);
    });
  });

  describe('POST /api/users/verify-society', () => {
    it('should verify user belongs to society', async () => {
      const verificationData = {
        societyId: testData.societyIds[0].toString()
      };

      const response = await request(app)
        .post('/api/users/verify-society')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(verificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.belongs).toBe(true);
      expect(response.body.user).toMatchObject({
        societyName: 'Test Society 1',
        wing: 'A',
        residentType: 'Owner'
      });
    });

    it('should return false for different society', async () => {
      const verificationData = {
        societyId: testData.societyIds[1].toString()
      };

      const response = await request(app)
        .post('/api/users/verify-society')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(verificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.belongs).toBe(false);
    });

    it('should return 400 for invalid society ID', async () => {
      const verificationData = {
        societyId: 'invalid-id'
      };

      const response = await request(app)
        .post('/api/users/verify-society')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(verificationData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });
  });
});