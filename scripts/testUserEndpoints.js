const express = require('express');
const request = require('supertest');
const { ObjectId } = require('mongodb');
require('dotenv').config();

// Mock Clerk SDK for testing
jest.mock('@clerk/clerk-sdk-node', () => ({
  clerkClient: {
    sessions: {
      verifySession: jest.fn()
    },
    users: {
      getUser: jest.fn()
    }
  }
}));

const { clerkClient } = require('@clerk/clerk-sdk-node');
const dbConnection = require('../config/database');
const { UserService, SocietyService } = require('../models/services');

// Create test app
const app = express();
app.use(express.json());

// Import routes
const userRoutes = require('../routes/users');
app.use('/api/users', userRoutes);

// Test data
const testSocietyId = new ObjectId();
const testUserId = 'test_clerk_user_123';
const testSessionToken = 'test_session_token_123';

const mockUser = {
  id: testUserId,
  emailAddresses: [{ emailAddress: 'test@example.com' }],
  firstName: 'John',
  lastName: 'Doe',
  imageUrl: 'https://example.com/avatar.jpg',
  createdAt: new Date(),
  updatedAt: new Date()
};

const mockSession = {
  userId: testUserId,
  status: 'active',
  id: 'session_123'
};

const testSociety = {
  _id: testSocietyId,
  name: 'Test Society',
  address: '123 Test Street',
  totalWings: 4,
  totalFlats: 100,
  adminUsers: [],
  settings: {
    maintenanceAmount: 5000,
    maintenanceDueDate: 5,
    allowTenantForumAccess: true
  },
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('User Management API Endpoints', () => {
  let db;
  let userService;
  let societyService;

  beforeAll(async () => {
    // Connect to test database
    await dbConnection.connect();
    db = dbConnection.getDb();
    userService = new UserService(db);
    societyService = new SocietyService(db);

    // Setup test society
    await societyService.create(testSociety);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await db.collection('users').deleteMany({ clerkUserId: testUserId });
      await db.collection('societies').deleteMany({ _id: testSocietyId });
    } catch (error) {
      console.log('Cleanup error:', error.message);
    }
    
    await dbConnection.disconnect();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mock responses
    clerkClient.sessions.verifySession.mockResolvedValue(mockSession);
    clerkClient.users.getUser.mockResolvedValue(mockUser);
  });

  describe('POST /api/users/register-society', () => {
    test('should successfully register user with society', async () => {
      const registrationData = {
        societyId: testSocietyId.toString(),
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner',
        contactNumber: '+1234567890'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(registrationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User successfully registered with society');
      expect(response.body.data.societyName).toBe('Test Society');
      expect(response.body.data.wing).toBe('A');
      expect(response.body.data.residentType).toBe('Owner');

      // Verify user was created in database
      const user = await userService.findByClerkUserId(testUserId);
      expect(user.data).toBeTruthy();
      expect(user.data.societyId.toString()).toBe(testSocietyId.toString());
    });

    test('should return 400 for missing required fields', async () => {
      const incompleteData = {
        wing: 'A'
        // Missing societyId and residentType
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details.societyId).toBeTruthy();
      expect(response.body.details.residentType).toBeTruthy();
    });

    test('should return 400 for invalid society ID', async () => {
      const invalidData = {
        societyId: 'invalid_id',
        wing: 'A',
        residentType: 'Owner'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('Invalid society ID format');
    });

    test('should return 400 for invalid resident type', async () => {
      const invalidData = {
        societyId: testSocietyId.toString(),
        wing: 'A',
        residentType: 'InvalidType'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('Invalid resident type');
    });

    test('should return 404 for non-existent society', async () => {
      const nonExistentSocietyId = new ObjectId();
      const registrationData = {
        societyId: nonExistentSocietyId.toString(),
        wing: 'A',
        residentType: 'Owner'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(registrationData)
        .expect(404);

      expect(response.body.error).toBe('Society Not Found');
    });

    test('should return 401 for missing authorization', async () => {
      const registrationData = {
        societyId: testSocietyId.toString(),
        wing: 'A',
        residentType: 'Owner'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .send(registrationData)
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    test('should return 401 for invalid session token', async () => {
      clerkClient.sessions.verifySession.mockRejectedValue(new Error('invalid token'));

      const registrationData = {
        societyId: testSocietyId.toString(),
        wing: 'A',
        residentType: 'Owner'
      };

      const response = await request(app)
        .post('/api/users/register-society')
        .set('Authorization', `Bearer invalid_token`)
        .send(registrationData)
        .expect(401);

      expect(response.body.error).toBe('Authentication Failed');
    });
  });

  describe('GET /api/users/profile', () => {
    beforeEach(async () => {
      // Ensure user exists for profile tests
      const userData = {
        clerkUserId: testUserId,
        societyId: testSocietyId,
        societyName: 'Test Society',
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner',
        contactNumber: '+1234567890',
        email: 'test@example.com',
        name: 'John Doe',
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await userService.create(userData);
    });

    afterEach(async () => {
      // Clean up user after each test
      await db.collection('users').deleteMany({ clerkUserId: testUserId });
    });

    test('should return user profile successfully', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.clerkUserId).toBe(testUserId);
      expect(response.body.data.name).toBe('John Doe');
      expect(response.body.data.society.name).toBe('Test Society');
      expect(response.body.data.residence.wing).toBe('A');
      expect(response.body.data.residence.residentType).toBe('Owner');
    });

    test('should return 404 for non-existent user', async () => {
      // Delete the user first
      await db.collection('users').deleteMany({ clerkUserId: testUserId });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
      expect(response.body.requiresRegistration).toBe(true);
    });

    test('should return 401 for missing authorization', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/users/profile', () => {
    beforeEach(async () => {
      // Ensure user exists for update tests
      const userData = {
        clerkUserId: testUserId,
        societyId: testSocietyId,
        societyName: 'Test Society',
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner',
        contactNumber: '+1234567890',
        email: 'test@example.com',
        name: 'John Doe',
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await userService.create(userData);
    });

    afterEach(async () => {
      // Clean up user after each test
      await db.collection('users').deleteMany({ clerkUserId: testUserId });
    });

    test('should update user profile successfully', async () => {
      const updateData = {
        contactNumber: '+9876543210',
        flatNumber: '102'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.data.contactNumber).toBe('+9876543210');
      expect(response.body.data.flatNumber).toBe('102');

      // Verify update in database
      const user = await userService.findByClerkUserId(testUserId);
      expect(user.data.contactNumber).toBe('+9876543210');
      expect(user.data.flatNumber).toBe('102');
    });

    test('should handle empty update data', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile updated successfully');
    });

    test('should return 404 for non-existent user', async () => {
      // Delete the user first
      await db.collection('users').deleteMany({ clerkUserId: testUserId });

      const updateData = {
        contactNumber: '+9876543210'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
      expect(response.body.requiresRegistration).toBe(true);
    });
  });

  describe('GET /api/users/societies', () => {
    test('should return list of available societies', async () => {
      const response = await request(app)
        .get('/api/users/societies')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.count).toBeGreaterThan(0);
      
      const society = response.body.data.find(s => s.name === 'Test Society');
      expect(society).toBeTruthy();
      expect(society.address).toBe('123 Test Street');
    });
  });

  describe('POST /api/users/verify-society', () => {
    beforeEach(async () => {
      // Ensure user exists for verification tests
      const userData = {
        clerkUserId: testUserId,
        societyId: testSocietyId,
        societyName: 'Test Society',
        wing: 'A',
        flatNumber: '101',
        residentType: 'Owner',
        contactNumber: '+1234567890',
        email: 'test@example.com',
        name: 'John Doe',
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await userService.create(userData);
    });

    afterEach(async () => {
      // Clean up user after each test
      await db.collection('users').deleteMany({ clerkUserId: testUserId });
    });

    test('should verify user belongs to society', async () => {
      const verificationData = {
        societyId: testSocietyId.toString()
      };

      const response = await request(app)
        .post('/api/users/verify-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(verificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.belongs).toBe(true);
      expect(response.body.user.societyName).toBe('Test Society');
    });

    test('should return false for different society', async () => {
      const differentSocietyId = new ObjectId();
      const verificationData = {
        societyId: differentSocietyId.toString()
      };

      const response = await request(app)
        .post('/api/users/verify-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(verificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.belongs).toBe(false);
      expect(response.body.reason).toBe('User does not belong to this society');
    });

    test('should return 400 for invalid society ID', async () => {
      const verificationData = {
        societyId: 'invalid_id'
      };

      const response = await request(app)
        .post('/api/users/verify-society')
        .set('Authorization', `Bearer ${testSessionToken}`)
        .send(verificationData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });
  });
});

// Manual testing function for development
async function runManualTests() {
  console.log('🧪 Starting manual user endpoint tests...\n');

  try {
    await dbConnection.connect();
    console.log('✅ Database connected');

    // Test 1: Get societies (public endpoint)
    console.log('\n📋 Test 1: Get available societies');
    const societiesResponse = await request(app)
      .get('/api/users/societies');
    
    console.log(`Status: ${societiesResponse.status}`);
    console.log(`Societies found: ${societiesResponse.body.count || 0}`);

    // Test 2: Test authentication middleware
    console.log('\n🔒 Test 2: Test authentication (should fail without token)');
    const authResponse = await request(app)
      .get('/api/users/profile');
    
    console.log(`Status: ${authResponse.status}`);
    console.log(`Error: ${authResponse.body.error}`);

    console.log('\n✅ Manual tests completed');
    console.log('\n💡 To test with real Clerk tokens:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Use a tool like Postman or curl');
    console.log('3. Include Authorization: Bearer <your-clerk-session-token>');

  } catch (error) {
    console.error('❌ Manual test error:', error.message);
  } finally {
    await dbConnection.disconnect();
  }
}

// Export for testing framework or run manual tests
if (require.main === module) {
  runManualTests();
} else {
  module.exports = { app, runManualTests };
}