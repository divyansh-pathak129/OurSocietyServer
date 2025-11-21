const BaseService = require("./BaseService");
const { validateJoinRequest } = require("../schemas");
const { ObjectId } = require("mongodb");

/**
 * Join Request Service Class
 * Handles all join request-related database operations
 */

class JoinRequestService extends BaseService {
  constructor(db) {
    super(db, "join_requests", validateJoinRequest);
  }

  /**
   * Create a new join request
   */
  async createJoinRequest(requestData) {
    try {
      // Check if user already has a pending request for this society
      const existingRequest = await this.findOne({
        clerkUserId: requestData.clerkUserId,
        societyId: new ObjectId(requestData.societyId),
        status: "pending",
      });

      if (existingRequest.data) {
        throw new Error(
          "User already has a pending join request for this society"
        );
      }

      // Ensure societyId is ObjectId
      if (requestData.societyId && typeof requestData.societyId === "string") {
        requestData.societyId = new ObjectId(requestData.societyId);
      }

      // Set default values
      requestData.status = "pending";
      requestData.documents = requestData.documents || [];

      return await this.create(requestData);
    } catch (error) {
      console.error("Error creating join request:", error.message);
      throw error;
    }
  }

  /**
   * Get join requests by society ID with filtering
   */
  async getJoinRequestsBySociety(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error("Valid societyId is required");
      }

      const query = { societyId: new ObjectId(societyId) };

      // Add status filter
      if (options.status) {
        query.status = options.status;
      }

      // Add wing filter (for wing chairman)
      if (options.wings && Array.isArray(options.wings)) {
        query["requestedData.wing"] = { $in: options.wings };
      }

      // Add date range filter
      if (options.startDate || options.endDate) {
        query.createdAt = {};
        if (options.startDate) {
          query.createdAt.$gte = new Date(options.startDate);
        }
        if (options.endDate) {
          query.createdAt.$lte = new Date(options.endDate);
        }
      }

      // Add search functionality
      if (options.search) {
        const searchRegex = new RegExp(options.search, "i");
        query.$or = [
          { clerkUserId: searchRegex },
          { "requestedData.wing": searchRegex },
          { "requestedData.flatNumber": searchRegex },
          { "requestedData.contactNumber": searchRegex },
        ];
      }

      const sortOptions = options.sort || { createdAt: -1 };
      const result = await this.find(query, { sort: sortOptions });

      return {
        success: true,
        data: result.data || [],
        count: result.data ? result.data.length : 0,
      };
    } catch (error) {
      console.error("Error getting join requests by society:", error.message);
      throw error;
    }
  }

  /**
   * Get join request by ID
   */
  async getJoinRequestById(requestId) {
    try {
      if (!ObjectId.isValid(requestId)) {
        throw new Error("Valid requestId is required");
      }

      return await this.findById(requestId);
    } catch (error) {
      console.error("Error getting join request by ID:", error.message);
      throw error;
    }
  }

  /**
   * Approve join request
   */
  async approveJoinRequest(requestId, reviewedBy) {
    try {
      if (!ObjectId.isValid(requestId)) {
        throw new Error("Valid requestId is required");
      }

      if (!reviewedBy || typeof reviewedBy !== "string") {
        throw new Error("Valid reviewedBy is required");
      }

      const request = await this.findById(requestId);
      if (!request.data) {
        throw new Error("Join request not found");
      }

      if (request.data.status !== "pending") {
        throw new Error("Join request is not pending");
      }

      const updateData = {
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };

      return await this.updateById(requestId, updateData);
    } catch (error) {
      console.error("Error approving join request:", error.message);
      throw error;
    }
  }

  /**
   * Reject join request
   */
  async rejectJoinRequest(requestId, reviewedBy, rejectionReason) {
    try {
      if (!ObjectId.isValid(requestId)) {
        throw new Error("Valid requestId is required");
      }

      if (!reviewedBy || typeof reviewedBy !== "string") {
        throw new Error("Valid reviewedBy is required");
      }

      if (!rejectionReason || typeof rejectionReason !== "string") {
        throw new Error("Valid rejectionReason is required");
      }

      const request = await this.findById(requestId);
      if (!request.data) {
        throw new Error("Join request not found");
      }

      if (request.data.status !== "pending") {
        throw new Error("Join request is not pending");
      }

      const updateData = {
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason,
        updatedAt: new Date(),
      };

      return await this.updateById(requestId, updateData);
    } catch (error) {
      console.error("Error rejecting join request:", error.message);
      throw error;
    }
  }

  /**
   * Get join request statistics for a society
   */
  async getJoinRequestStats(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error("Valid societyId is required");
      }

      const query = { societyId: new ObjectId(societyId) };

      // Add wing filter for wing chairman
      if (options.wings && Array.isArray(options.wings)) {
        query["requestedData.wing"] = { $in: options.wings };
      }

      // Add date range filter
      if (options.startDate || options.endDate) {
        query.createdAt = {};
        if (options.startDate) {
          query.createdAt.$gte = new Date(options.startDate);
        }
        if (options.endDate) {
          query.createdAt.$lte = new Date(options.endDate);
        }
      }

      const pipeline = [
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ];

      const stats = await this.aggregate(pipeline);

      // Format the results
      const formattedStats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      stats.data.forEach((item) => {
        formattedStats[item._id] = item.count;
        formattedStats.total += item.count;
      });

      return {
        success: true,
        data: formattedStats,
      };
    } catch (error) {
      console.error("Error getting join request stats:", error.message);
      throw error;
    }
  }

  /**
   * Bulk approve join requests
   */
  async bulkApproveJoinRequests(requestIds, reviewedBy) {
    try {
      if (!Array.isArray(requestIds) || requestIds.length === 0) {
        throw new Error("Valid requestIds array is required");
      }

      if (!reviewedBy || typeof reviewedBy !== "string") {
        throw new Error("Valid reviewedBy is required");
      }

      // Validate all request IDs
      const objectIds = requestIds.map((id) => {
        if (!ObjectId.isValid(id)) {
          throw new Error(`Invalid requestId: ${id}`);
        }
        return new ObjectId(id);
      });

      const updateData = {
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.collection.updateMany(
        {
          _id: { $in: objectIds },
          status: "pending",
        },
        { $set: updateData }
      );

      return {
        success: true,
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
      };
    } catch (error) {
      console.error("Error bulk approving join requests:", error.message);
      throw error;
    }
  }

  /**
   * Bulk reject join requests
   */
  async bulkRejectJoinRequests(requestIds, reviewedBy, rejectionReason) {
    try {
      if (!Array.isArray(requestIds) || requestIds.length === 0) {
        throw new Error("Valid requestIds array is required");
      }

      if (!reviewedBy || typeof reviewedBy !== "string") {
        throw new Error("Valid reviewedBy is required");
      }

      if (!rejectionReason || typeof rejectionReason !== "string") {
        throw new Error("Valid rejectionReason is required");
      }

      // Validate all request IDs
      const objectIds = requestIds.map((id) => {
        if (!ObjectId.isValid(id)) {
          throw new Error(`Invalid requestId: ${id}`);
        }
        return new ObjectId(id);
      });

      const updateData = {
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason,
        updatedAt: new Date(),
      };

      const result = await this.collection.updateMany(
        {
          _id: { $in: objectIds },
          status: "pending",
        },
        { $set: updateData }
      );

      return {
        success: true,
        data: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
      };
    } catch (error) {
      console.error("Error bulk rejecting join requests:", error.message);
      throw error;
    }
  }

  /**
   * Get pending join requests count for a society
   */
  async getPendingRequestsCount(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error("Valid societyId is required");
      }

      const query = {
        societyId: new ObjectId(societyId),
        status: "pending",
      };

      // Add wing filter for wing chairman
      if (options.wings && Array.isArray(options.wings)) {
        query["requestedData.wing"] = { $in: options.wings };
      }

      const count = await this.collection.countDocuments(query);

      return {
        success: true,
        data: { count },
      };
    } catch (error) {
      console.error("Error getting pending requests count:", error.message);
      throw error;
    }
  }

  /**
   * Delete join request (for cleanup)
   */
  async deleteJoinRequest(requestId) {
    try {
      if (!ObjectId.isValid(requestId)) {
        throw new Error("Valid requestId is required");
      }

      return await this.deleteById(requestId);
    } catch (error) {
      console.error("Error deleting join request:", error.message);
      throw error;
    }
  }

  /**
   * Get join requests by user
   */
  async getJoinRequestsByUser(clerkUserId) {
    try {
      if (!clerkUserId || typeof clerkUserId !== "string") {
        throw new Error("Valid clerkUserId is required");
      }

      return await this.find({ clerkUserId }, { sort: { createdAt: -1 } });
    } catch (error) {
      console.error("Error getting join requests by user:", error.message);
      throw error;
    }
  }
}

module.exports = JoinRequestService;
