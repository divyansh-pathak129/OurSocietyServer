const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../middleware/errorHandler");
const {
  verifyAdminAuth,
  requirePermission,
  requireAdmin,
  requireSuperAdmin,
  logAdminAction,
  ADMIN_ROLES,
} = require("../middleware/adminAuth");
const { UserService, SocietyService } = require("../models/services");
const dbConnection = require("../config/database");
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require("../middleware/errors");

// Import admin sub-routes
const maintenanceRoutes = require("./admin/maintenance");
const dashboardRoutes = require("./admin/dashboard");
const societyRoutes = require("./admin/society");

/**
 * Admin Authentication and Role Verification Endpoints
 * Implements requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

/**
 * @route   POST /api/admin/auth/verify
 * @desc    Verify admin role and permissions
 * @access  Admin
 */
router.post(
  "/auth/verify",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser, society } = req;

    // Log admin verification
    await logAdminAction(adminUser, "auth_verify", "admin_panel", {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Admin authentication verified",
      data: {
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          societyId: adminUser.societyId,
          societyName: adminUser.societyName,
          wing: adminUser.wing,
          assignedWings: adminUser.assignedWings,
          permissions: adminUser.permissions,
          lastAdminLogin: adminUser.lastAdminLogin,
        },
        society: {
          id: society._id,
          name: society.name,
          address: society.address,
          totalWings: society.totalWings,
          totalFlats: society.totalFlats,
        },
        sessionInfo: {
          loginTime: new Date(),
          expiresIn: "24h", // JWT token expiry
        },
      },
    });
  })
);

/**
 * @route   POST /api/admin/auth/login
 * @desc    Admin login with role assignment (enhanced verification)
 * @access  Admin
 */
router.post(
  "/auth/login",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser, society } = req;
    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Update last admin login
    await userService.updateLastAdminLogin(adminUser.clerkUserId);

    // Log admin login
    await logAdminAction(adminUser, "admin_login", "admin_panel", {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
      loginTime: new Date(),
    });

    res.json({
      success: true,
      message: "Admin login successful",
      data: {
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          societyId: adminUser.societyId,
          societyName: adminUser.societyName,
          wing: adminUser.wing,
          assignedWings: adminUser.assignedWings,
          permissions: adminUser.permissions,
          adminSettings: adminUser.adminSettings || {
            emailNotifications: true,
            pushNotifications: true,
            dashboardLayout: "default",
          },
        },
        society: {
          id: society._id,
          name: society.name,
          address: society.address,
          totalWings: society.totalWings,
          totalFlats: society.totalFlats,
          settings: society.settings,
        },
        capabilities: getAdminCapabilities(adminUser.role),
        sessionInfo: {
          loginTime: new Date(),
          expiresIn: "24h",
        },
      },
    });
  })
);

/**
 * @route   POST /api/admin/auth/logout
 * @desc    Admin logout with session cleanup
 * @access  Admin
 */
router.post(
  "/auth/logout",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;

    // Log admin logout
    await logAdminAction(adminUser, "admin_logout", "admin_panel", {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
      logoutTime: new Date(),
    });

    res.json({
      success: true,
      message: "Admin logout successful",
      data: {
        logoutTime: new Date(),
      },
    });
  })
);

/**
 * @route   GET /api/admin/profile
 * @desc    Get admin profile information
 * @access  Admin
 */
router.get(
  "/profile",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser, society } = req;

    res.json({
      success: true,
      data: {
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          societyId: adminUser.societyId,
          societyName: adminUser.societyName,
          wing: adminUser.wing,
          assignedWings: adminUser.assignedWings,
          permissions: adminUser.permissions,
          lastAdminLogin: adminUser.lastAdminLogin,
          adminSettings: adminUser.adminSettings,
        },
        society: {
          id: society._id,
          name: society.name,
          address: society.address,
        },
      },
    });
  })
);

/**
 * @route   PUT /api/admin/profile/settings
 * @desc    Update admin settings
 * @access  Admin
 */
router.put(
  "/profile/settings",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { emailNotifications, pushNotifications, dashboardLayout } = req.body;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    const settings = {};
    if (typeof emailNotifications === "boolean") {
      settings.emailNotifications = emailNotifications;
    }
    if (typeof pushNotifications === "boolean") {
      settings.pushNotifications = pushNotifications;
    }
    if (dashboardLayout && typeof dashboardLayout === "string") {
      settings.dashboardLayout = dashboardLayout;
    }

    const result = await userService.updateAdminSettings(
      adminUser.clerkUserId,
      settings
    );

    if (!result.success) {
      throw new ValidationError("Failed to update admin settings");
    }

    // Log settings update
    await logAdminAction(adminUser, "update_settings", "admin_profile", {
      updatedSettings: settings,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Admin settings updated successfully",
      data: {
        settings: {
          ...adminUser.adminSettings,
          ...settings,
        },
      },
    });
  })
);

/**
 * @route   GET /api/admin/permissions
 * @desc    Get admin permissions and capabilities
 * @access  Admin
 */
router.get(
  "/permissions",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;

    const capabilities = getAdminCapabilities(adminUser.role);

    res.json({
      success: true,
      data: {
        role: adminUser.role,
        permissions: adminUser.permissions,
        capabilities,
        assignedWings: adminUser.assignedWings,
        restrictions: {
          wingRestricted: adminUser.role === ADMIN_ROLES.WING_CHAIRMAN,
          allowedWings:
            adminUser.role === ADMIN_ROLES.WING_CHAIRMAN
              ? adminUser.assignedWings.length > 0
                ? adminUser.assignedWings
                : [adminUser.wing]
              : null,
        },
      },
    });
  })
);

/**
 * @route   GET /api/admin/session/status
 * @desc    Check admin session status
 * @access  Admin
 */
router.get(
  "/session/status",
  verifyAdminAuth,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;

    res.json({
      success: true,
      data: {
        isActive: true,
        admin: {
          id: adminUser.id,
          name: adminUser.name,
          role: adminUser.role,
          societyName: adminUser.societyName,
        },
        sessionInfo: {
          lastActivity: new Date(),
          expiresIn: "24h",
        },
      },
    });
  })
);

/**
 * Admin Management Endpoints (Super Admin only)
 */

/**
 * @route   GET /api/admin/manage/admins
 * @desc    Get all admin users in society
 * @access  Super Admin
 */
router.get(
  "/manage/admins",
  verifyAdminAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { role } = req.query;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    const options = {};
    if (role && Object.values(ADMIN_ROLES).includes(role)) {
      options.role = role;
    }

    const result = await userService.getAdminUsers(
      adminUser.societyId,
      options
    );

    if (!result.success) {
      throw new ValidationError("Failed to fetch admin users");
    }

    res.json({
      success: true,
      data: {
        admins: result.data,
        count: result.count,
        roles: Object.values(ADMIN_ROLES),
      },
    });
  })
);

/**
 * @route   POST /api/admin/manage/assign-role
 * @desc    Assign admin role to user
 * @access  Super Admin
 */
router.post(
  "/manage/assign-role",
  verifyAdminAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { clerkUserId, adminRole, assignedWings = [] } = req.body;

    if (!clerkUserId || !adminRole) {
      throw new ValidationError("clerkUserId and adminRole are required");
    }

    if (!Object.values(ADMIN_ROLES).includes(adminRole)) {
      throw new ValidationError("Invalid admin role");
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Verify user exists and belongs to same society
    const userResult = await userService.findByClerkUserId(clerkUserId);
    if (!userResult.data) {
      throw new NotFoundError("User not found");
    }

    if (
      userResult.data.societyId.toString() !== adminUser.societyId.toString()
    ) {
      throw new ForbiddenError(
        "Cannot assign admin role to user from different society"
      );
    }

    // Assign admin role
    const result = await userService.assignAdminRole(
      clerkUserId,
      adminRole,
      [],
      assignedWings
    );

    if (!result.success) {
      throw new ValidationError("Failed to assign admin role");
    }

    // Log admin role assignment
    await logAdminAction(adminUser, "assign_admin_role", "user_management", {
      targetUserId: clerkUserId,
      targetUserName: userResult.data.name,
      assignedRole: adminRole,
      assignedWings,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Admin role assigned successfully",
      data: {
        user: {
          id: userResult.data._id,
          name: userResult.data.name,
          email: userResult.data.email,
          adminRole,
          assignedWings,
        },
      },
    });
  })
);

/**
 * @route   POST /api/admin/manage/remove-role
 * @desc    Remove admin role from user
 * @access  Super Admin
 */
router.post(
  "/manage/remove-role",
  verifyAdminAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { clerkUserId } = req.body;

    if (!clerkUserId) {
      throw new ValidationError("clerkUserId is required");
    }

    // Prevent removing own admin role
    if (clerkUserId === adminUser.clerkUserId) {
      throw new ForbiddenError("Cannot remove your own admin role");
    }

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Verify user exists
    const userResult = await userService.findByClerkUserId(clerkUserId);
    if (!userResult.data) {
      throw new NotFoundError("User not found");
    }

    if (!userResult.data.adminRole) {
      throw new ValidationError("User is not an admin");
    }

    // Remove admin role
    const result = await userService.removeAdminRole(clerkUserId);

    if (!result.success) {
      throw new ValidationError("Failed to remove admin role");
    }

    // Log admin role removal
    await logAdminAction(adminUser, "remove_admin_role", "user_management", {
      targetUserId: clerkUserId,
      targetUserName: userResult.data.name,
      removedRole: userResult.data.adminRole,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "Admin role removed successfully",
      data: {
        user: {
          id: userResult.data._id,
          name: userResult.data.name,
          email: userResult.data.email,
        },
      },
    });
  })
);

/**
 * @route   GET /api/admin/audit/logs
 * @desc    Get admin audit logs
 * @access  Super Admin
 */
router.get(
  "/audit/logs",
  verifyAdminAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const {
      page = 1,
      limit = 50,
      action,
      adminId,
      startDate,
      endDate,
    } = req.query;

    const db = dbConnection.getDb();
    const query = { societyId: adminUser.societyId };

    // Add filters
    if (action) {
      query.action = action;
    }
    if (adminId) {
      query.adminId = adminId;
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const logs = await db
      .collection("admin_audit_logs")
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("admin_audit_logs").countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  })
);

/**
 * Mount admin sub-routes
 */
const userRoutes = require("./admin/users");
const joinRequestRoutes = require("./admin/joinRequests");
const communicationRoutes = require("./admin/communication");

router.use("/maintenance", maintenanceRoutes);
router.use("/users", userRoutes);
router.use("/join-requests", joinRequestRoutes);
router.use("/communication", communicationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/society", societyRoutes);

/**
 * Helper function to get admin capabilities based on role
 */
function getAdminCapabilities(role) {
  const capabilities = {
    [ADMIN_ROLES.SUPER_ADMIN]: {
      userManagement: ["read", "write", "delete", "assign_roles"],
      maintenance: ["read", "write", "approve", "reject", "bulk_operations"],
      announcements: ["read", "write", "delete", "target_all"],
      society: ["read", "write", "settings", "audit"],
      forum: ["read", "write", "moderate", "delete"],
      analytics: ["read", "export"],
      adminManagement: ["read", "write", "assign", "remove"],
    },
    [ADMIN_ROLES.ADMIN]: {
      userManagement: ["read", "write", "deactivate"],
      maintenance: ["read", "write", "approve", "reject", "bulk_operations"],
      announcements: ["read", "write", "target_all"],
      society: ["read", "write"],
      forum: ["read", "moderate"],
      analytics: ["read"],
    },
    [ADMIN_ROLES.WING_CHAIRMAN]: {
      userManagement: ["read", "wing_only"],
      maintenance: ["read", "approve", "wing_only"],
      announcements: ["read", "write", "wing_only"],
      society: ["read"],
      forum: ["read"],
      analytics: ["read", "wing_only"],
    },
    [ADMIN_ROLES.MODERATOR]: {
      userManagement: ["read"],
      maintenance: ["read"],
      announcements: ["read"],
      society: ["read"],
      forum: ["read", "moderate", "delete"],
      analytics: ["read"],
    },
  };

  return capabilities[role] || {};
}

module.exports = router;
