const BaseService = require('./BaseService');
const { validateUser } = require('../schemas');
const { ObjectId } = require('mongodb');

/**
 * User Service Class
 * Handles all user-related database operations
 */
class UserService extends BaseService {
  constructor(db) {
    super(db, 'users', validateUser);
  }

  /**
   * Find a user by Clerk user ID
   */
  async findByClerkUserId(clerkUserId) {
    try {
      if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Valid clerkUserId is required');
      }
      return await this.findOne({ clerkUserId });
    } catch (error) {
      console.error('Error finding user by clerkUserId:', error.message);
      throw error;
    }
  }

  /**
   * Update last admin login timestamp for a user
   */
  async updateLastAdminLogin(clerkUserId) {
    try {
      if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Valid clerkUserId is required');
      }
      const result = await this.collection.updateOne(
        { clerkUserId },
        { $set: { lastAdminLogin: new Date(), updatedAt: new Date() } }
      );
      return { success: true, modifiedCount: result.modifiedCount };
    } catch (error) {
      console.error('Error updating last admin login:', error.message);
      throw error;
    }
  }

  /**
   * Get aggregated member statistics for a society
   */
  async getSocietyMemberStats(societyId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const query = { societyId: new ObjectId(societyId) };

      const [totalRes, activeRes] = await Promise.all([
        this.count(query),
        this.count({ ...query, isActive: true }),
      ]);

      return {
        success: true,
        data: {
          total: totalRes.count || 0,
          active: activeRes.count || 0,
          inactive: Math.max(0, (totalRes.count || 0) - (activeRes.count || 0)),
        },
      };
    } catch (error) {
      console.error('Error getting society member stats:', error.message);
      throw error;
    }
  }

  /**
   * Get users by wings (optionally active only)
   */
  async getUsersByWings(societyId, wings = [], options = { activeOnly: false }) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const query = { societyId: new ObjectId(societyId) };
      if (Array.isArray(wings) && wings.length > 0) {
        query.wing = { $in: wings };
      }
      if (options?.activeOnly) {
        query.isActive = true;
      }

      const result = await this.find(query, { limit: 1000 });
      return { success: true, data: result.data };
    } catch (error) {
      console.error('Error getting users by wings:', error.message);
      throw error;
    }
  }

  /**
   * Get all members of a society with optional filters
   * @param {string} societyId - Society ID
   * @param {object} filters - Filter options (wing, residentType, search)
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async getSocietyMembers(societyId, filters = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const query = { 
        societyId: new ObjectId(societyId),
        isActive: true // Only get active members
      };

      // Apply filters
      if (filters.wing) {
        query.wing = filters.wing;
      }
      if (filters.residentType) {
        query.residentType = filters.residentType;
      }
      if (filters.search) {
        // Search in email, contactNumber, wing, flatNumber
        query.$or = [
          { email: { $regex: filters.search, $options: 'i' } },
          { contactNumber: { $regex: filters.search, $options: 'i' } },
          { wing: { $regex: filters.search, $options: 'i' } },
          { flatNumber: { $regex: filters.search, $options: 'i' } }
        ];
      }

      const result = await this.find(query, { 
        sort: { wing: 1, flatNumber: 1, registrationDate: -1 },
        limit: 1000 
      });

      return {
        success: true,
        data: result.data || []
      };
    } catch (error) {
      console.error('Error getting society members:', error.message);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  /**
   * Get user growth data for last N months
   * Returns [{ month: 'Jan', users: number, growth: number }]
   */
  async getUserGrowthData(societyId, months = 6) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - (months - 1));
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      // Aggregate registrations per month
      const pipeline = [
        { $match: { societyId: new ObjectId(societyId), registrationDate: { $gte: start, $lte: end } } },
        { $project: { y: { $year: '$registrationDate' }, m: { $month: '$registrationDate' } } },
        { $group: { _id: { y: '$y', m: '$m' }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } }
      ];

      const aggregated = await this.aggregate(pipeline);
      const byYearMonth = new Map();
      (aggregated.data || []).forEach((row) => {
        const key = `${row._id.y}-${String(row._id.m).padStart(2, '0')}`;
        byYearMonth.set(key, row.count);
      });

      // Build contiguous months list
      const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const result = [];
      let prevUsers = 0;
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const users = byYearMonth.get(key) || 0;
        const growth = prevUsers === 0 ? (users > 0 ? 100 : 0) : ((users - prevUsers) / prevUsers) * 100;
        result.push({ month: monthShort[d.getMonth()], users, growth: Math.round(growth * 10) / 10 });
        prevUsers = users;
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Error getting user growth data:', error.message);
      throw error;
    }
  }
}

module.exports = UserService;


