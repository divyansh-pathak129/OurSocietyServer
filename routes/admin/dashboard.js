const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../../middleware/errorHandler");
const {
  verifyAdminAuth,
  requirePermission,
} = require("../../middleware/adminAuth");
const { UserService, SocietyService } = require("../../models/services");
const MaintenanceService = require("../../models/services/MaintenanceService");
const JoinRequestService = require("../../models/services/JoinRequestService");
const dbConnection = require("../../config/database");

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get comprehensive dashboard statistics
 * @access  Admin
 */
router.get(
  "/stats",
  verifyAdminAuth,
  requirePermission("analytics", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const db = dbConnection.getDb();
    
    try {
      // Initialize services
      const userService = new UserService(db);
      const maintenanceService = new MaintenanceService(db);
      const joinRequestService = new JoinRequestService(db);
      
      // Get user statistics
      let userStats = { total: 0, active: 0, inactive: 0 };
      if (adminUser.role === "WING_CHAIRMAN") {
        const allowedWings = adminUser.assignedWings.length > 0 
          ? adminUser.assignedWings 
          : [adminUser.wing];
        const result = await userService.getUsersByWings(adminUser.societyId, allowedWings, { activeOnly: false });
        const users = result.data || [];
        userStats = {
          total: users.length,
          active: users.filter(u => u.isActive).length,
          inactive: users.filter(u => !u.isActive).length,
        };
      } else {
        const result = await userService.getSocietyMemberStats(adminUser.societyId);
        if (result.success) {
          userStats = result.data;
        }
      }
      
      // Get maintenance statistics
      const maintenanceStatsRes = await maintenanceService.getSocietyStats(adminUser.societyId);
      const maintenanceStats = maintenanceStatsRes && maintenanceStatsRes.success ? maintenanceStatsRes.data : {
        totalRecords: 0,
        totalAmount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        approvedAmount: 0,
      };
      
      // Get join request statistics
      const joinRequestStats = await joinRequestService.getJoinRequestStats(adminUser.societyId);
      
      // Calculate dashboard metrics
      const stats = {
        totalUsers: userStats.total || 0,
        pendingPayments: maintenanceStats.pendingCount || 0,
        joinRequests: (joinRequestStats && (joinRequestStats.pending || joinRequestStats.pendingCount)) || 0,
        activeAnnouncements: 0, // TODO: Add announcement service
        totalRevenue: maintenanceStats.approvedAmount || 0,
        overduePayments: maintenanceStats.overdue || 0, // if not available, backend can compute later
        newUsersThisMonth: userStats.newThisMonth || 0,
        forumPosts: 0, // TODO: Add forum service
      };
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard statistics",
        message: error.message,
      });
    }
  })
);

/**
 * @route   GET /api/admin/dashboard/activity
 * @desc    Get recent activity for dashboard
 * @access  Admin
 */
router.get(
  "/activity",
  verifyAdminAuth,
  requirePermission("analytics", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { limit = 10 } = req.query;
    const db = dbConnection.getDb();
    
    try {
      const maintenanceService = new MaintenanceService(db);
      
      // Get recent maintenance activities
      const recentMaintenance = await maintenanceService.getRecentActivities(
        adminUser.societyId,
        parseInt(limit)
      );

      // Normalize to array
      const records = Array.isArray(recentMaintenance?.data)
        ? recentMaintenance.data
        : Array.isArray(recentMaintenance)
        ? recentMaintenance
        : [];

      // Transform to dashboard format
      const activities = records.map((record, index) => ({
        id: `maintenance_${record._id || index}`,
        type: 'payment',
        title: `Maintenance Payment - ${record.userName || 'Unknown User'}`,
        description: `Payment for ${record.month}/${record.year} - ₹${record.amount}`,
        timestamp: new Date(record.updatedAt || record.createdAt || Date.now()).toISOString(),
        user: record.userName || 'Unknown User',
        status: record.status === 'approved' ? 'approved' : 
               record.status === 'rejected' ? 'rejected' : 'pending',
      }));
      
      res.json({
        success: true,
        data: activities,
      });
    } catch (error) {
      console.error("Dashboard activity error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch recent activity",
        message: error.message,
      });
    }
  })
);

/**
 * @route   GET /api/admin/dashboard/trends
 * @desc    Get payment trends for dashboard
 * @access  Admin
 */
router.get(
  "/trends",
  verifyAdminAuth,
  requirePermission("analytics", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { period = "6months" } = req.query;
    const db = dbConnection.getDb();
    
    try {
      const maintenanceService = new MaintenanceService(db);
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case "1month":
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case "3months":
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case "6months":
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case "1year":
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 6);
      }
      
      // Get payment trends
      const trends = await maintenanceService.getPaymentTrends(adminUser.societyId, startDate, endDate);
      
      res.json({
        success: true,
        data: trends,
      });
    } catch (error) {
      console.error("Dashboard trends error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment trends",
        message: error.message,
      });
    }
  })
);

/**
 * @route   GET /api/admin/dashboard/growth
 * @desc    Get user growth data for dashboard
 * @access  Admin
 */
router.get(
  "/growth",
  verifyAdminAuth,
  requirePermission("analytics", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const db = dbConnection.getDb();
    
    try {
      const userService = new UserService(db);
      
      // Get user growth data for the last 6 months
      const growthData = await userService.getUserGrowthData(adminUser.societyId, 6);
      
      res.json({
        success: true,
        data: growthData,
      });
    } catch (error) {
      console.error("Dashboard growth error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user growth data",
        message: error.message,
      });
    }
  })
);

module.exports = router;


