/**
 * Integration tests for forum endpoints
 * Tests forum post creation, retrieval, updates, and replies
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

describe('Forum API Integration Tests', () => {
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

  describe('GET /api/forum', () => {
    it('should return society-specific forum posts', async () => {
      const response = await request(app)
        .get('/api/forum')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        authorName: 'Test User 1',
        title: 'Test Forum Post 1',
        category: 'general'
      });
      expect(response.body.societyId).toBe(testData.societyIds[0].toString());
    });

    it('should filter posts by category', async () => {
      const response = await request(app)
        .get('/api/forum?category=general')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(post => post.category === 'general')).toBe(true);
    });

    it('should return announcements only', async () => {
      const response = await request(app)
        .get('/api/forum?announcementsOnly=true')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every(post => post.isAnnouncement === true)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/forum?page=1&limit=1')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });

    it('should return 404 for unregistered user', async () => {
      const response = await request(app)
        .get('/api/forum')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
      expect(response.body.requiresRegistration).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/forum')
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
    });
  });

  describe('POST /api/forum', () => {
    it('should create a new forum post successfully', async () => {
      const postData = {
        title: 'New Test Post',
        content: 'This is a new test post content',
        category: 'maintenance'
      };

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(postData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Forum post created successfully');
      expect(response.body.data).toMatchObject({
        title: 'New Test Post',
        content: 'This is a new test post content',
        category: 'maintenance',
        authorName: 'Test User 1',
        authorWing: 'A'
      });
    });

    it('should default to general category', async () => {
      const postData = {
        title: 'Post Without Category',
        content: 'This post has no category specified'
      };

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(postData)
        .expect(201);

      expect(response.body.data.category).toBe('general');
    });

    it('should return 400 for missing required fields', async () => {
      const postData = {
        title: 'Post Without Content'
      };

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(postData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('content are required');
    });

    it('should return 400 for invalid category', async () => {
      const postData = {
        title: 'Post With Invalid Category',
        content: 'This post has invalid category',
        category: 'invalid_category'
      };

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(postData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('Invalid category');
    });

    it('should return 404 for unregistered user', async () => {
      const postData = {
        title: 'Test Post',
        content: 'Test content'
      };

      const response = await request(app)
        .post('/api/forum')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .send(postData)
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
    });
  });

  describe('PUT /api/forum/:id', () => {
    it('should update own forum post successfully', async () => {
      const updateData = {
        title: 'Updated Test Post',
        content: 'Updated content',
        category: 'events'
      };

      const response = await request(app)
        .put(`/api/forum/${testData.forumIds[0]}`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Forum post updated successfully');
      expect(response.body.data).toMatchObject({
        title: 'Updated Test Post',
        content: 'Updated content',
        category: 'events'
      });
    });

    it('should allow admin to update any post', async () => {
      const updateData = {
        title: 'Admin Updated Post'
      };

      const response = await request(app)
        .put(`/api/forum/${testData.forumIds[0]}`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Admin Updated Post');
    });

    it('should return 403 when trying to update others post', async () => {
      const updateData = {
        title: 'Unauthorized Update'
      };

      const response = await request(app)
        .put(`/api/forum/${testData.forumIds[1]}`) // Admin's post
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('only update your own posts');
    });

    it('should return 400 for invalid post ID', async () => {
      const updateData = {
        title: 'Updated Title'
      };

      const response = await request(app)
        .put('/api/forum/invalid-id')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('Invalid post ID format');
    });

    it('should return 404 for non-existent post', async () => {
      const updateData = {
        title: 'Updated Title'
      };

      const response = await request(app)
        .put('/api/forum/507f1f77bcf86cd799439011')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Post Not Found');
    });
  });

  describe('DELETE /api/forum/:id', () => {
    it('should delete own forum post successfully', async () => {
      const response = await request(app)
        .delete(`/api/forum/${testData.forumIds[0]}`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Forum post deleted successfully');
    });

    it('should allow admin to delete any post', async () => {
      const response = await request(app)
        .delete(`/api/forum/${testData.forumIds[0]}`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 403 when trying to delete others post', async () => {
      const response = await request(app)
        .delete(`/api/forum/${testData.forumIds[1]}`) // Admin's post
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('only delete your own posts');
    });

    it('should return 400 for invalid post ID', async () => {
      const response = await request(app)
        .delete('/api/forum/invalid-id')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('POST /api/forum/:id/reply', () => {
    it('should add reply to forum post successfully', async () => {
      const replyData = {
        content: 'This is a test reply'
      };

      const response = await request(app)
        .post(`/api/forum/${testData.forumIds[0]}/reply`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(replyData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Reply added successfully');
      expect(response.body.data).toMatchObject({
        authorName: 'Test User 1',
        content: 'This is a test reply'
      });
    });

    it('should return 400 for missing content', async () => {
      const replyData = {};

      const response = await request(app)
        .post(`/api/forum/${testData.forumIds[0]}/reply`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(replyData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('Reply content is required');
    });

    it('should return 404 for non-existent post', async () => {
      const replyData = {
        content: 'Reply to non-existent post'
      };

      const response = await request(app)
        .post('/api/forum/507f1f77bcf86cd799439011/reply')
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(replyData)
        .expect(404);

      expect(response.body.error).toBe('Post Not Found');
    });
  });

  describe('PUT /api/forum/:id/pin', () => {
    it('should allow admin to pin post', async () => {
      const pinData = {
        isPinned: true
      };

      const response = await request(app)
        .put(`/api/forum/${testData.forumIds[0]}/pin`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(pinData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Post pinned successfully');
    });

    it('should return 403 for non-admin user', async () => {
      const pinData = {
        isPinned: true
      };

      const response = await request(app)
        .put(`/api/forum/${testData.forumIds[0]}/pin`)
        .set('Authorization', createAuthHeader('test_user_1'))
        .send(pinData)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Only society administrators');
    });

    it('should return 400 for invalid isPinned value', async () => {
      const pinData = {
        isPinned: 'invalid'
      };

      const response = await request(app)
        .put(`/api/forum/${testData.forumIds[0]}/pin`)
        .set('Authorization', createAuthHeader('test_admin_1'))
        .send(pinData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toBe('isPinned must be a boolean value');
    });
  });

  describe('GET /api/forum/stats', () => {
    it('should return forum statistics for society', async () => {
      const response = await request(app)
        .get('/api/forum/stats')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.societyId).toBe(testData.societyIds[0].toString());
    });

    it('should return 404 for unregistered user', async () => {
      const response = await request(app)
        .get('/api/forum/stats')
        .set('Authorization', createAuthHeader('unregistered_user'))
        .expect(404);

      expect(response.body.error).toBe('User Not Found');
    });
  });

  describe('GET /api/forum/my-posts', () => {
    it('should return current user forum posts', async () => {
      const response = await request(app)
        .get('/api/forum/my-posts')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination for user posts', async () => {
      const response = await request(app)
        .get('/api/forum/my-posts?page=1&limit=5')
        .set('Authorization', createAuthHeader('test_user_1'))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });
  });
});