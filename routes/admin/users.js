const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../../middleware/errorHandler");
const {
  verifyAdminAuth,
  requirePermission,
  requireAdmin,
  requireSuperAdmin,
  logAdminAction,
  ADMIN_ROLES,
} = require("../../middleware/adminAuth");
const { UserService, SocietyService } = require("../../models/services");
const dbConnection = require("../../config/database");
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require("../../middleware/errors");

/**
 * @route   GET /api/admin/users/test
 * @desc    Test route to check if routing works
 * @access  Public
 */
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Users route is working", timestamp: new Date() });
});

/**
 * @route   GET /api/admin/users/simple
 * @desc    Simple route without auth to test basic functionality
 * @access  Public
 */
router.get("/simple", asyncHandler(async (req, res) => {
  res.json({ 
    success: true, 
    message: "Simple users route working", 
    timestamp: new Date(),
    query: req.query 
  });
}));

/**
 * @route   GET /api/admin/users
 * @desc    Get all users in the society - SIMPLIFIED VERSION
 * @access  Admin
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    console.log("Users route hit - fetching society residents");
    
    const { societyId, page = 1, limit = 50, search, wing, residentType, status } = req.query;

    if (!societyId) {
      return res.status(400).json({
        success: false,
        message: "societyId is required"
      });
    }

    const db = dbConnection.getDb();

    try {
      console.log(`Fetching society with ID: ${societyId}`);
      
      // Step 1: Find the society in the societies collection
      const societiesCollection = db.collection('societies');
      const { ObjectId } = require('mongodb');
      
      const society = await societiesCollection.findOne({ 
        _id: new ObjectId(societyId) 
      });
      
      if (!society) {
        return res.status(404).json({
          success: false,
          message: "Society not found"
        });
      }
      
      console.log(`Found society: ${society.name}`);
      
      // Step 2: Extract residents array (Clerk IDs) from society
      const residentsIds = society.residents || [];
      console.log(`Society has ${residentsIds.length} residents`);
      console.log(`Resident IDs:`, residentsIds);
      
      if (residentsIds.length === 0) {
        return res.json({
          success: true,
          data: {
            users: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0,
            },
            stats: {
              total: 0,
              active: 0,
              inactive: 0,
              owners: 0,
              tenants: 0,
              byWing: {}
            }
          },
        });
      }

      // Step 3: Fetch Clerk user details for each resident ID
      console.log(`Fetching Clerk data for ${residentsIds.length} residents...`);
      
      const users = await Promise.all(
        residentsIds.map(async (clerkId) => {
          try {
            // Fetch user data from Clerk API
            const clerkResponse = await fetch(
              `https://api.clerk.com/v1/users/${clerkId}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (!clerkResponse.ok) {
              console.warn(`Failed to fetch Clerk data for user ${clerkId}: ${clerkResponse.status}`);
              return null; // Skip this user if Clerk API fails
            }

            const clerkData = await clerkResponse.json();

            // Also try to get MongoDB user data if it exists
            const usersCollection = db.collection('users');
            const mongoUser = await usersCollection.findOne({ clerkUserId: clerkId });

            return {
              id: clerkId,
              clerkUserId: clerkId,
              societyId: societyId,
              name: clerkData.first_name && clerkData.last_name 
                ? `${clerkData.first_name} ${clerkData.last_name}` 
                : clerkData.email_addresses?.[0]?.email_address || 'Unknown',
              email: clerkData.email_addresses?.[0]?.email_address || '',
              wing: mongoUser?.wing || 'Unknown',
              flatNumber: mongoUser?.flatNumber || 'Unknown',
              residentType: mongoUser?.residentType || 'Resident',
              contactNumber: mongoUser?.contactNumber || clerkData.phone_numbers?.[0]?.phone_number || '',
              isActive: mongoUser?.isActive !== false, // Default to true if not specified
              joinedAt: new Date(clerkData.created_at),
              adminRole: mongoUser?.adminRole || null,
              // Clerk enriched data
              clerkData: {
                profileImageUrl: clerkData.profile_image_url,
                firstName: clerkData.first_name,
                lastName: clerkData.last_name,
                lastSignInAt: clerkData.last_sign_in_at,
                createdAt: clerkData.created_at,
                emailAddresses: clerkData.email_addresses,
                phoneNumbers: clerkData.phone_numbers,
              },
            };
          } catch (clerkError) {
            console.warn(`Failed to fetch Clerk data for user ${clerkId}:`, clerkError);
            return null; // Skip this user if there's an error
          }
        })
      );

      // Filter out null results (failed Clerk API calls)
      const validUsers = users.filter(user => user !== null);
      console.log(`Successfully fetched data for ${validUsers.length} users`);

      // Apply filters
      let filteredUsers = validUsers;
      
      if (search) {
        const searchLower = search.toLowerCase();
        filteredUsers = filteredUsers.filter(user => 
          user.email?.toLowerCase().includes(searchLower) ||
          user.contactNumber?.toLowerCase().includes(searchLower) ||
          user.flatNumber?.toLowerCase().includes(searchLower)
        );
      }

      if (wing && wing !== "all") {
        filteredUsers = filteredUsers.filter(user => user.wing === wing);
      }

      if (residentType && residentType !== "all") {
        filteredUsers = filteredUsers.filter(user => user.residentType === residentType);
      }

      if (status && status !== "all") {
        const isActive = status === "active";
        filteredUsers = filteredUsers.filter(user => user.isActive === isActive);
      }

      // Apply pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
      const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

      // Calculate stats
      const stats = {
        total: filteredUsers.length,
        active: filteredUsers.filter(u => u.isActive).length,
        inactive: filteredUsers.filter(u => !u.isActive).length,
        owners: filteredUsers.filter(u => u.residentType === 'Owner').length,
        tenants: filteredUsers.filter(u => u.residentType === 'Tenant').length,
        byWing: {}
      };

      // Calculate wing distribution
      filteredUsers.forEach(user => {
        if (user.wing) {
          stats.byWing[user.wing] = (stats.byWing[user.wing] || 0) + 1;
        }
    });

    res.json({
      success: true,
      data: {
          users: paginatedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
            total: filteredUsers.length,
            pages: Math.ceil(filteredUsers.length / parseInt(limit)),
          },
          stats
      },
    });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
        error: error.message
      });
    }
  })
);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get individual user details
 * @access  Admin
 */
router.get(
  "/:id",
  verifyAdminAuth,
  requirePermission("users", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { id } = req.params;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    const result = await userService.findById(id);

    if (!result.success || !result.data) {
      throw new NotFoundError("User not found");
    }

    const user = result.data;

    // Check if user belongs to same society
    if (user.societyId.toString() !== adminUser.societyId.toString()) {
      throw new ForbiddenError("Access denied");
    }

    // Check wing access for wing chairman
    if (adminUser.role === ADMIN_ROLES.WING_CHAIRMAN) {
      const allowedWings =
        adminUser.assignedWings.length > 0
          ? adminUser.assignedWings
          : [adminUser.wing];

      if (!allowedWings.includes(user.wing)) {
        throw new ForbiddenError("Access denied to this user");
      }
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user information
 * @access  Admin
 */
router.put(
  "/:id",
  verifyAdminAuth,
  requirePermission("users", "write"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { id } = req.params;
    const updateData = req.body;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Get current user data
    const currentUserResult = await userService.findById(id);
    if (!currentUserResult.success || !currentUserResult.data) {
      throw new NotFoundError("User not found");
    }

    const currentUser = currentUserResult.data;

    // Check society access
    if (currentUser.societyId.toString() !== adminUser.societyId.toString()) {
      throw new ForbiddenError("Access denied");
    }

    // Check wing access for wing chairman
    if (adminUser.role === ADMIN_ROLES.WING_CHAIRMAN) {
      const allowedWings =
        adminUser.assignedWings.length > 0
          ? adminUser.assignedWings
          : [adminUser.wing];

      if (!allowedWings.includes(currentUser.wing)) {
        throw new ForbiddenError("Access denied to this user");
      }
    }

    // Update user
    const result = await userService.update(id, updateData);

    if (!result.success) {
      throw new ValidationError("Failed to update user");
    }

    // Log admin action
    await logAdminAction(adminUser, "update_user", "user_management", {
      targetUserId: id,
      targetUserName: currentUser.name,
      updatedFields: Object.keys(updateData),
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "User updated successfully",
      data: result.data,
    });
  })
);

/**
 * @route   POST /api/admin/users/:id/deactivate
 * @desc    Deactivate user account
 * @access  Admin (not wing chairman)
 */
router.post(
  "/:id/deactivate",
  verifyAdminAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { id } = req.params;
    const { reason } = req.body;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Get current user data
    const currentUserResult = await userService.findById(id);
    if (!currentUserResult.success || !currentUserResult.data) {
      throw new NotFoundError("User not found");
    }

    const currentUser = currentUserResult.data;

    // Check society access
    if (currentUser.societyId.toString() !== adminUser.societyId.toString()) {
      throw new ForbiddenError("Access denied");
    }

    // Prevent deactivating own account
    if (currentUser.clerkUserId === adminUser.clerkUserId) {
      throw new ForbiddenError("Cannot deactivate your own account");
    }

    // Deactivate user
    const result = await userService.deactivateUser(currentUser.clerkUserId);

    if (!result.success) {
      throw new ValidationError("Failed to deactivate user");
    }

    // Log admin action
    await logAdminAction(adminUser, "deactivate_user", "user_management", {
      targetUserId: id,
      targetUserName: currentUser.name,
      reason: reason || "No reason provided",
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "User deactivated successfully",
      data: {
        userId: id,
        userName: currentUser.name,
        deactivatedAt: new Date(),
      },
    });
  })
);

/**
 * @route   POST /api/admin/users/:id/reactivate
 * @desc    Reactivate user account
 * @access  Admin (not wing chairman)
 */
router.post(
  "/:id/reactivate",
  verifyAdminAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { id } = req.params;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Get current user data
    const currentUserResult = await userService.findById(id);
    if (!currentUserResult.success || !currentUserResult.data) {
      throw new NotFoundError("User not found");
    }

    const currentUser = currentUserResult.data;

    // Check society access
    if (currentUser.societyId.toString() !== adminUser.societyId.toString()) {
      throw new ForbiddenError("Access denied");
    }

    // Reactivate user
    const result = await userService.update(id, {
      isActive: true,
      reactivatedAt: new Date(),
    });

    if (!result.success) {
      throw new ValidationError("Failed to reactivate user");
    }

    // Log admin action
    await logAdminAction(adminUser, "reactivate_user", "user_management", {
      targetUserId: id,
      targetUserName: currentUser.name,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: "User reactivated successfully",
      data: result.data,
    });
  })
);

module.exports = router;