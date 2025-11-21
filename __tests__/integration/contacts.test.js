/**
 * Integration tests for contacts endpoints
 * Tests contact management, emergency contacts, and role-based access
 */

const request = require('supertest');
const app = require('../../app');
const { setupTestDatabase, cleanupTestDatabase, teardownTestDatabase, setupTestData } = require('../setup');
const { createAuthHeader, mockClerkClient } = require('../helpers/auth');

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

describe('Contacts API Integration Tests', () => {
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

  describe('GET /api/contacts', () => {
    it('should return society-specific contacts', async () => {
      const response = await request(app)
        .get('/api/contacts')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        name: 'Security Guard',
        role: 'Security',
        phoneNumber: '9876543213',
        isEmergency: true
      });
      expect(response.body.societyId).toBe(testData.societyIds[0].toString());
    });

    it('should filter contacts by role', async () => {
      const response = await request(app)
        .get('/api/contacts?role=Security')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(contact => contact.role === 'Security')).toBe(true);
    });

    it('should return emergency contacts only', async () => {
      const response = await request(app)
        .get('/api/contacts?emergencyOnly=true')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(contact => contact.isEmergency === true)).toBe(true);
    });

    it('should support search functionality', async () => {
      const response = await request(app)
        .get('/api/contacts?search=Security')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/contacts?page=1&limit=1')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });

    it('should return 404 for unregistered user', async () => {
      const response = await request(app)
        .get('/api/contacts')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
      expect(response.body.requiresRegistration).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/contacts')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
    });
  });

  describe('POST /api/contacts', () => {
    it('should allow admin to create new contact', async () => {
      const contactData = {
        name: 'New Security Guard',
        role: 'Security',
        phoneNumber: '9876543220',
        email: 'newsecurity@testsociety1.com',
        isEmergency: true
      };

      const response = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(contactData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Contact created successfully');
      expect(response.body.data).toMatchObject({
        name: 'New Security Guard',
        role: 'Security',
        phoneNumber: '9876543220',
        isEmergency: true
      });
    });

    it('should return 403 for non-admin user', async () => {
      const contactData = {
        name: 'Unauthorized Contact',
        role: 'Security',
        phoneNumber: '9876543221'
      };

      const response = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(contactData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Only society administrators');
    });

    it('should return 400 for missing required fields', async () => {
      const contactData = {
        name: 'Incomplete Contact'
        // Missing role and phoneNumber
      };

      const response = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(contactData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('required');
    });

    it('should return 400 for invalid role', async () => {
      const contactData = {
        name: 'Invalid Role Contact',
        role: 'InvalidRole',
        phoneNumber: '9876543222'
      };

      const response = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(contactData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('Invalid role');
    });

    it('should return 404 for unregistered admin', async () => {
      const contactData = {
        name: 'Test Contact',
        role: 'Security',
        phoneNumber: '9876543223'
      };

      const response = await request(app)
        .post('/api/contacts')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .send(contactData)
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
    });
  });

  describe('PUT /api/contacts/:id', () => {
    it('should allow admin to update contact', async () => {
      const updateData = {
        name: 'Updated Security Guard',
        phoneNumber: '9876543230',
        isEmergency: false
      };

      const response = await request(app)
        .put(`/api/contacts/${testData.contactIds[0]}`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Contact updated successfully');
      expect(response.body.data).toMatchObject({
        name: 'Updated Security Guard',
        phoneNumber: '9876543230',
        isEmergency: false
      });
    });

    it('should return 403 for non-admin user', async () => {
      const updateData = {
        name: 'Unauthorized Update'
      };

      const response = await request(app)
        .put(`/api/contacts/${testData.contactIds[0]}`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Only society administrators');
    });

    it('should return 400 for invalid contact ID', async () => {
      const updateData = {
        name: 'Updated Name'
      };

      const response = await request(app)
        .put('/api/contacts/invalid-id')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(updateData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('Invalid contact ID format');
    });

    it('should return 404 for non-existent contact', async () => {
      const updateData = {
        name: 'Updated Name'
      };

      const response = await request(app)
        .put('/api/contacts/507f1f77bcf86cd799439011')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Contact Not Found');
    });

    it('should return 400 for invalid role in update', async () => {
      const updateData = {
        role: 'InvalidRole'
      };

      const response = await request(app)
        .put(`/api/contacts/${testData.contactIds[0]}`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(updateData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('Invalid role');
    });
  });

  describe('DELETE /api/contacts/:id', () => {
    it('should allow admin to delete contact', async () => {
      const response = await request(app)
        .delete(`/api/contacts/${testData.contactIds[0]}`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Contact deleted successfully');
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .delete(`/api/contacts/${testData.contactIds[0]}`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Only society administrators');
    });

    it('should return 400 for invalid contact ID', async () => {
      const response = await request(app)
        .delete('/api/contacts/invalid-id')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 404 for non-existent contact', async () => {
      const response = await request(app)
        .delete('/api/contacts/507f1f77bcf86cd799439011')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .expect(404);

      expect(response.body.error).toBe('Contact Not Found');
    });
  });

  describe('GET /api/contacts/emergency', () => {
    it('should return emergency contacts for society', async () => {
      const response = await request(app)
        .get('/api/contacts/emergency')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(contact => contact.isEmergency === true)).toBe(true);
      expect(response.body.societyId).toBe(testData.societyIds[0].toString());
    });

    it('should return 404 for unregistered user', async () => {
      const response = await request(app)
        .get('/api/contacts/emergency')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
    });
  });

  describe('GET /api/contacts/stats', () => {
    it('should return contact statistics for society', async () => {
      const response = await request(app)
        .get('/api/contacts/stats')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.societyId).toBe(testData.societyIds[0].toString());
    });

    it('should return 404 for unregistered user', async () => {
      const response = await request(app)
        .get('/api/contacts/stats')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
    });
  });

  describe('PUT /api/contacts/:id/emergency', () => {
    it('should allow admin to toggle emergency status', async () => {
      const emergencyData = {
        isEmergency: false
      };

      const response = await request(app)
        .put(`/api/contacts/${testData.contactIds[0]}/emergency`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(emergencyData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Contact unmarked as emergency successfully');
    });

    it('should return 403 for non-admin user', async () => {
      const emergencyData = {
        isEmergency: false
      };

      const response = await request(app)
        .put(`/api/contacts/${testData.contactIds[0]}/emergency`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(emergencyData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Only society administrators');
    });

    it('should return 400 for invalid isEmergency value', async () => {
      const emergencyData = {
        isEmergency: 'invalid'
      };

      const response = await request(app)
        .put(`/api/contacts/${testData.contactIds[0]}/emergency`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(emergencyData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('isEmergency must be a boolean value');
    });

    it('should return 400 for invalid contact ID', async () => {
      const emergencyData = {
        isEmergency: true
      };

      const response = await request(app)
        .put('/api/contacts/invalid-id/emergency')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(emergencyData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('Invalid contact ID format');
    });

    it('should return 404 for non-existent contact', async () => {
      const emergencyData = {
        isEmergency: true
      };

      const response = await request(app)
        .put('/api/contacts/507f1f77bcf86cd799439011/emergency')
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(emergencyData)
        .expect(404);

      expect(response.body.error).toBe('Contact Not Found');
    });
  });
});