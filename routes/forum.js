const express = require('express');
const { verifyClerkToken, getUserDetails, clerkClient } = require('../middleware/auth');
const { ForumService, UserService, SocietyService } = require('../models/services/index');
const dbConnection = require('../config/database');
const { ObjectId } = require('mongodb');

const router = express.Router();

/**
 * GET /api/forum
 * Get society-specific forum posts
 * Requires authentication
 */
router.get('/', verifyClerkToken, async (req, res) => {
  try {
    const { category, page = 1, limit = 20, search, announcementsOnly } = req.query;

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);

    // Get user profile to determine society
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;
    const societyId = user.societyId;

    // Prepare query options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    let result;

    if (search) {
      // Search posts
      result = await forumService.searchPosts(societyId, search, {
        ...options,
        category: category || undefined
      });
    } else if (announcementsOnly === 'true') {
      // Get announcements only
      result = await forumService.getAnnouncements(societyId, options);
    } else if (category) {
      // Get posts by category
      result = await forumService.getPostsByCategory(societyId, category, options);
    } else {
      // Get all society forum posts
      result = await forumService.getSocietyForumPosts(societyId, options);
    }

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Load Forum Posts',
        message: 'Unable to retrieve forum posts'
      });
    }

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination || null,
      societyId: societyId.toString()
    });

  } catch (error) {
    console.error('Get forum posts error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving forum posts'
    });
  }
});

/**
 * POST /api/forum
 * Create new forum post
 * Requires authentication
 */
router.post('/', verifyClerkToken, getUserDetails, async (req, res) => {
  try {
    const { title, content, category = 'general' } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Title and content are required',
        details: {
          title: !title ? 'Title is required' : null,
          content: !content ? 'Content is required' : null
        }
      });
    }

    // Validate category
    const validCategories = ['general', 'maintenance', 'events', 'complaints'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);

    // Get user profile to determine society and user details
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;

    // Get user name from Clerk since name field doesn't exist in DB
    let authorName = 'Anonymous User';
    try {
      const clerkUser = await clerkClient.users.getUser(req.userId);
      authorName = clerkUser.firstName && clerkUser.lastName 
        ? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
        : clerkUser.emailAddresses?.[0]?.emailAddress || 'Anonymous User';
    } catch (clerkError) {
      console.warn('Failed to fetch Clerk user data:', clerkError.message);
      authorName = 'Anonymous User';
    }

    // Validate wing information
    if (!user.wing || typeof user.wing !== 'string' || user.wing.trim() === '') {
      return res.status(400).json({
        error: 'Invalid User Data',
        message: 'User wing information is required to create forum posts. Please update your profile.',
        requiresProfileUpdate: true
      });
    }

    // Prepare forum post data
    const postData = {
      societyId: user.societyId,
      authorId: req.userId,
      authorName: authorName.trim(),
      authorWing: user.wing.trim(),
      title: title.trim(),
      content: content.trim(),
      category,
      isAnnouncement: false,
      isPinned: false,
      replies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create the forum post
    const result = await forumService.createForumPost(postData);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Create Post',
        message: 'Unable to create forum post',
        details: result.errors
      });
    }

    res.status(201).json({
      success: true,
      message: 'Forum post created successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Create forum post error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the forum post'
    });
  }
});

/**
 * PUT /api/forum/:id
 * Update forum post
 * Requires authentication and ownership or admin privileges
 */
router.put('/:id', verifyClerkToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category } = req.body;

    // Validate post ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid post ID format'
      });
    }

    // Validate category if provided
    if (category) {
      const validCategories = ['general', 'maintenance', 'events', 'complaints'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        });
      }
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);
    const societyService = new SocietyService(db);

    // Get user profile
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;

    // Check if user is admin
    const societyResult = await societyService.findById(user.societyId);
    const isAdmin = societyResult.data?.adminUsers?.includes(req.userId) || false;

    // Prepare update data
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (content) updateData.content = content.trim();
    if (category) updateData.category = category;
    updateData.updatedAt = new Date();

    // Update the forum post
    const result = await forumService.updateForumPost(id, updateData, req.userId, isAdmin);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Update Post',
        message: 'Unable to update forum post',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: 'Forum post updated successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Update forum post error:', error);
    
    if (error.message === 'Forum post not found') {
      return res.status(404).json({
        error: 'Post Not Found',
        message: 'The specified forum post does not exist'
      });
    }
    
    if (error.message === 'You can only update your own posts') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own posts'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the forum post'
    });
  }
});

/**
 * DELETE /api/forum/:id
 * Delete forum post
 * Requires authentication and ownership or admin privileges
 */
router.delete('/:id', verifyClerkToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate post ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid post ID format'
      });
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);
    const societyService = new SocietyService(db);

    // Get user profile
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;

    // Check if user is admin
    const societyResult = await societyService.findById(user.societyId);
    const isAdmin = societyResult.data?.adminUsers?.includes(req.userId) || false;

    // Delete the forum post
    const result = await forumService.deleteForumPost(id, req.userId, isAdmin);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Delete Post',
        message: 'Unable to delete forum post',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: 'Forum post deleted successfully'
    });

  } catch (error) {
    console.error('Delete forum post error:', error);
    
    if (error.message === 'Forum post not found') {
      return res.status(404).json({
        error: 'Post Not Found',
        message: 'The specified forum post does not exist'
      });
    }
    
    if (error.message === 'You can only delete your own posts') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only delete your own posts'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the forum post'
    });
  }
});
/**
 *
 POST /api/forum/:id/reply
 * Add reply to forum post
 * Requires authentication
 */
router.post('/:id/reply', verifyClerkToken, getUserDetails, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // Validate post ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid post ID format'
      });
    }

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Reply content is required'
      });
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);

    // Get user profile
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;

    // Get user name from Clerk since name field doesn't exist in DB
    let authorName = 'Anonymous User';
    try {
      const clerkUser = await clerkClient.users.getUser(req.userId);
      authorName = clerkUser.firstName && clerkUser.lastName 
        ? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
        : clerkUser.emailAddresses?.[0]?.emailAddress || 'Anonymous User';
    } catch (clerkError) {
      console.warn('Failed to fetch Clerk user data:', clerkError.message);
      authorName = 'Anonymous User';
    }

    // Verify the post exists and belongs to the same society
    const postResult = await forumService.findById(id);
    if (!postResult.data) {
      return res.status(404).json({
        error: 'Post Not Found',
        message: 'The specified forum post does not exist'
      });
    }

    // Check if user belongs to the same society as the post
    if (!postResult.data.societyId.equals(user.societyId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only reply to posts in your society'
      });
    }

    // Prepare reply data
    const replyData = {
      authorId: req.userId,
      authorName: authorName.trim(),
      content: content.trim()
    };

    // Add the reply
    const result = await forumService.addReply(id, replyData);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Add Reply',
        message: 'Unable to add reply to forum post',
        details: result.errors
      });
    }

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Add reply error:', error);
    
    if (error.message === 'Forum post not found') {
      return res.status(404).json({
        error: 'Post Not Found',
        message: 'The specified forum post does not exist'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while adding the reply'
    });
  }
});

/**
 * PUT /api/forum/:id/pin
 * Pin/Unpin forum post (admin only)
 * Requires authentication and admin privileges
 */
router.put('/:id/pin', verifyClerkToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPinned } = req.body;

    // Validate post ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid post ID format'
      });
    }

    // Validate isPinned
    if (typeof isPinned !== 'boolean') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'isPinned must be a boolean value'
      });
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);
    const societyService = new SocietyService(db);

    // Get user profile
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;

    // Check if user is admin
    const societyResult = await societyService.findById(user.societyId);
    const isAdmin = societyResult.data?.adminUsers?.includes(req.userId) || false;

    if (!isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can pin/unpin posts'
      });
    }

    // Toggle pin status
    const result = await forumService.togglePin(id, isPinned);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Update Pin Status',
        message: 'Unable to update post pin status',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: `Post ${isPinned ? 'pinned' : 'unpinned'} successfully`,
      data: result.data
    });

  } catch (error) {
    console.error('Toggle pin error:', error);
    
    if (error.message === 'Forum post not found') {
      return res.status(404).json({
        error: 'Post Not Found',
        message: 'The specified forum post does not exist'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating pin status'
    });
  }
});

/**
 * PUT /api/forum/:id/announcement
 * Mark/Unmark post as announcement (admin only)
 * Requires authentication and admin privileges
 */
router.put('/:id/announcement', verifyClerkToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isAnnouncement } = req.body;

    // Validate post ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid post ID format'
      });
    }

    // Validate isAnnouncement
    if (typeof isAnnouncement !== 'boolean') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'isAnnouncement must be a boolean value'
      });
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);
    const societyService = new SocietyService(db);

    // Get user profile
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;

    // Check if user is admin
    const societyResult = await societyService.findById(user.societyId);
    const isAdmin = societyResult.data?.adminUsers?.includes(req.userId) || false;

    if (!isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can mark posts as announcements'
      });
    }

    // Toggle announcement status
    const result = await forumService.toggleAnnouncement(id, isAnnouncement);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Update Announcement Status',
        message: 'Unable to update post announcement status',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: `Post ${isAnnouncement ? 'marked as announcement' : 'unmarked as announcement'} successfully`,
      data: result.data
    });

  } catch (error) {
    console.error('Toggle announcement error:', error);
    
    if (error.message === 'Forum post not found') {
      return res.status(404).json({
        error: 'Post Not Found',
        message: 'The specified forum post does not exist'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating announcement status'
    });
  }
});

/**
 * GET /api/forum/stats
 * Get forum statistics for the user's society
 * Requires authentication
 */
router.get('/stats', verifyClerkToken, async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const forumService = new ForumService(db);

    // Get user profile to determine society
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;
    const societyId = user.societyId;

    // Get forum statistics
    const result = await forumService.getSocietyForumStats(societyId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Load Forum Statistics',
        message: 'Unable to retrieve forum statistics'
      });
    }

    res.json({
      success: true,
      data: result.data,
      societyId: societyId.toString()
    });

  } catch (error) {
    console.error('Get forum stats error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving forum statistics'
    });
  }
});

/**
 * GET /api/forum/my-posts
 * Get current user's forum posts
 * Requires authentication
 */
router.get('/my-posts', verifyClerkToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const db = dbConnection.getDb();
    const forumService = new ForumService(db);

    // Prepare query options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    // Get user's forum posts
    const result = await forumService.getUserPosts(req.userId, options);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Load User Posts',
        message: 'Unable to retrieve user forum posts'
      });
    }

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination || null
    });

  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving user forum posts'
    });
  }
});

module.exports = router;