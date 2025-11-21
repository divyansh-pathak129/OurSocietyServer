const BaseService = require('./BaseService');
const { validateForum } = require('../schemas');
const { ObjectId } = require('mongodb');

/**
 * Forum Service Class
 * Handles all forum-related database operations
 */

class ForumService extends BaseService {
  constructor(db) {
    super(db, 'forums', validateForum);
  }

  /**
   * Get forum posts for a society
   */
  async getSocietyForumPosts(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const query = { societyId: new ObjectId(societyId) };
      
      // Add category filter if specified
      if (options.category) {
        query.category = options.category;
      }

      // Add announcement filter if specified
      if (options.announcementsOnly) {
        query.isAnnouncement = true;
      }

      return await this.find(query, {
        ...options,
        sort: { isPinned: -1, createdAt: -1 }
      });
    } catch (error) {
      console.error('Error getting society forum posts:', error.message);
      throw error;
    }
  }

  /**
   * Create a new forum post
   */
  async createForumPost(postData) {
    try {
      // Ensure societyId is ObjectId
      if (postData.societyId && typeof postData.societyId === 'string') {
        postData.societyId = new ObjectId(postData.societyId);
      }

      // Set default values
      if (postData.isAnnouncement === undefined) {
        postData.isAnnouncement = false;
      }
      if (postData.isPinned === undefined) {
        postData.isPinned = false;
      }
      if (!postData.replies) {
        postData.replies = [];
      }

      return await this.create(postData);
    } catch (error) {
      console.error('Error creating forum post:', error.message);
      throw error;
    }
  }

  /**
   * Add reply to a forum post
   */
  async addReply(postId, replyData) {
    try {
      if (!ObjectId.isValid(postId)) {
        throw new Error('Valid postId is required');
      }

      const post = await this.findById(postId);
      if (!post.data) {
        throw new Error('Forum post not found');
      }

      const reply = {
        authorId: replyData.authorId,
        authorName: replyData.authorName,
        content: replyData.content,
        createdAt: new Date()
      };

      const updatedReplies = [...post.data.replies, reply];
      
      return await this.updateById(postId, { replies: updatedReplies });
    } catch (error) {
      console.error('Error adding reply to forum post:', error.message);
      throw error;
    }
  }

  /**
   * Update forum post (only by author or admin)
   */
  async updateForumPost(postId, updateData, userId, isAdmin = false) {
    try {
      if (!ObjectId.isValid(postId)) {
        throw new Error('Valid postId is required');
      }

      const post = await this.findById(postId);
      if (!post.data) {
        throw new Error('Forum post not found');
      }

      // Check if user can update this post
      if (!isAdmin && post.data.authorId !== userId) {
        throw new Error('You can only update your own posts');
      }

      // Prevent updating certain fields by non-admins
      if (!isAdmin) {
        const restrictedFields = ['societyId', 'authorId', 'authorName', 'authorWing', 'isPinned', 'isAnnouncement'];
        restrictedFields.forEach(field => {
          if (updateData.hasOwnProperty(field)) {
            delete updateData[field];
          }
        });
      }

      return await this.updateById(postId, updateData);
    } catch (error) {
      console.error('Error updating forum post:', error.message);
      throw error;
    }
  }

  /**
   * Delete forum post (only by author or admin)
   */
  async deleteForumPost(postId, userId, isAdmin = false) {
    try {
      if (!ObjectId.isValid(postId)) {
        throw new Error('Valid postId is required');
      }

      const post = await this.findById(postId);
      if (!post.data) {
        throw new Error('Forum post not found');
      }

      // Check if user can delete this post
      if (!isAdmin && post.data.authorId !== userId) {
        throw new Error('You can only delete your own posts');
      }

      return await this.deleteById(postId);
    } catch (error) {
      console.error('Error deleting forum post:', error.message);
      throw error;
    }
  }

  /**
   * Pin/Unpin forum post (admin only)
   */
  async togglePin(postId, isPinned) {
    try {
      if (!ObjectId.isValid(postId)) {
        throw new Error('Valid postId is required');
      }

      const post = await this.findById(postId);
      if (!post.data) {
        throw new Error('Forum post not found');
      }

      return await this.updateById(postId, { isPinned: Boolean(isPinned) });
    } catch (error) {
      console.error('Error toggling pin status:', error.message);
      throw error;
    }
  }

  /**
   * Mark post as announcement (admin only)
   */
  async toggleAnnouncement(postId, isAnnouncement) {
    try {
      if (!ObjectId.isValid(postId)) {
        throw new Error('Valid postId is required');
      }

      const post = await this.findById(postId);
      if (!post.data) {
        throw new Error('Forum post not found');
      }

      return await this.updateById(postId, { isAnnouncement: Boolean(isAnnouncement) });
    } catch (error) {
      console.error('Error toggling announcement status:', error.message);
      throw error;
    }
  }

  /**
   * Get forum posts by category
   */
  async getPostsByCategory(societyId, category, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const validCategories = ['general', 'maintenance', 'events', 'complaints'];
      if (!validCategories.includes(category)) {
        throw new Error('Invalid category');
      }

      return await this.getSocietyForumPosts(societyId, {
        ...options,
        category
      });
    } catch (error) {
      console.error('Error getting posts by category:', error.message);
      throw error;
    }
  }

  /**
   * Get announcements for a society
   */
  async getAnnouncements(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      return await this.getSocietyForumPosts(societyId, {
        ...options,
        announcementsOnly: true
      });
    } catch (error) {
      console.error('Error getting announcements:', error.message);
      throw error;
    }
  }

  /**
   * Get forum statistics for a society
   */
  async getSocietyForumStats(societyId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const pipeline = [
        { $match: { societyId: new ObjectId(societyId) } },
        { $group: {
          _id: '$category',
          count: { $sum: 1 },
          announcements: { $sum: { $cond: ['$isAnnouncement', 1, 0] } },
          pinned: { $sum: { $cond: ['$isPinned', 1, 0] } },
          totalReplies: { $sum: { $size: '$replies' } }
        }},
        { $sort: { _id: 1 } }
      ];

      const stats = await this.aggregate(pipeline);
      
      // Format the results
      const formattedStats = {
        totalPosts: 0,
        totalReplies: 0,
        totalAnnouncements: 0,
        totalPinned: 0,
        byCategory: {}
      };

      stats.data.forEach(item => {
        formattedStats.totalPosts += item.count;
        formattedStats.totalReplies += item.totalReplies;
        formattedStats.totalAnnouncements += item.announcements;
        formattedStats.totalPinned += item.pinned;
        formattedStats.byCategory[item._id] = {
          posts: item.count,
          replies: item.totalReplies,
          announcements: item.announcements,
          pinned: item.pinned
        };
      });

      return {
        success: true,
        data: formattedStats
      };
    } catch (error) {
      console.error('Error getting society forum stats:', error.message);
      throw error;
    }
  }

  /**
   * Search forum posts
   */
  async searchPosts(societyId, searchTerm, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }
      if (!searchTerm || typeof searchTerm !== 'string') {
        throw new Error('Valid search term is required');
      }

      const query = {
        societyId: new ObjectId(societyId),
        $or: [
          { title: { $regex: searchTerm, $options: 'i' } },
          { content: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      // Add category filter if specified
      if (options.category) {
        query.category = options.category;
      }

      return await this.find(query, {
        ...options,
        sort: { isPinned: -1, createdAt: -1 }
      });
    } catch (error) {
      console.error('Error searching forum posts:', error.message);
      throw error;
    }
  }

  /**
   * Get user's forum posts
   */
  async getUserPosts(clerkUserId, options = {}) {
    try {
      if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Valid clerkUserId is required');
      }

      const query = { authorId: clerkUserId };

      return await this.find(query, {
        ...options,
        sort: { createdAt: -1 }
      });
    } catch (error) {
      console.error('Error getting user forum posts:', error.message);
      throw error;
    }
  }
}

module.exports = ForumService;