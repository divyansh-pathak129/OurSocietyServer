const { clerkClient, verifyToken } = require("@clerk/clerk-sdk-node");
const {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ExternalServiceError,
} = require("./errors");
const { UserService, SocietyService } = require("../models/services");
const dbConnection = require("../config/database");

/**
 * Admin role definitions and permissions
 */
const ADMIN_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  WING_CHAIRMAN: "wing_chairman",
  MODERATOR: "moderator",
};

const ROLE_PERMISSIONS = {
  [ADMIN_ROLES.SUPER_ADMIN]: ["*"], // Full access to everything
  [ADMIN_ROLES.ADMIN]: [
    "maintenance:*",
    "users:*",
    "announcements:*",
    "notifications:*",
    "analytics:*",
    "society:read",
    "society:write",
    "forum:moderate",
    "join_requests:*",
    "events:*",
  ],
  [ADMIN_ROLES.WING_CHAIRMAN]: [
    "maintenance:read",
    "maintenance:approve",
    "users:read",
    "users:wing_only",
    "announcements:read",
    "announcements:write",
    "announcements:wing_only",
    "notifications:read",
    "notifications:send",
    "notifications:wing_only",
    "analytics:read",
    "analytics:wing_only",
    "join_requests:read",
    "join_requests:approve",
    "events:read",
    "events:create",
  ],
  [ADMIN_ROLES.MODERATOR]: [
    "forum:*",
    "announcements:read",
    "notifications:read",
    "users:read",
  ],
};

/**
 * Get permissions for a specific role
 */
const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

/**
 * Check if a role has permission for a specific resource and action
 */
const hasPermission = (userRole, resource, action) => {
  if (!userRole || !ROLE_PERMISSIONS[userRole]) {
    return false;
  }

  const permissions = ROLE_PERMISSIONS[userRole];

  // Super admin has all permissions
  if (permissions.includes("*")) {
    return true;
  }

  // Check for exact permission match
  if (permissions.includes(`${resource}:${action}`)) {
    return true;
  }

  // Check for wildcard resource permission
  if (permissions.includes(`${resource}:*`)) {
    return true;
  }

  return false;
};

/**
 * Middleware to verify admin authentication and role
 */
const verifyAdminAuth = async (req, res, next) => {
  try {
    // First verify the Clerk token
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError(
        "Missing or invalid authorization header. Expected format: Bearer <token>"
      );
    }

    const token = authHeader.substring(7);

    if (!token) {
      throw new AuthenticationError("No session token provided");
    }

    // Verify the JWT token with Clerk
    let payload;
    try {
      payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
    } catch (clerkError) {
      console.error("Clerk token verification failed:", clerkError.message);

      if (
        clerkError.message.includes("expired") ||
        clerkError.message.includes("Expired")
      ) {
        throw new AuthenticationError(
          "Session token has expired. Please log in again."
        );
      }

      if (
        clerkError.message.includes("invalid") ||
        clerkError.message.includes("Invalid")
      ) {
        throw new AuthenticationError("Invalid session token provided.");
      }

      throw new ExternalServiceError("Unable to verify session token.");
    }

    const userId = payload.sub;

    if (!userId) {
      throw new AuthenticationError(
        "Token does not contain valid user information."
      );
    }

    // Get user details from Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(userId);
    } catch (clerkError) {
      throw new NotFoundError("User not found in Clerk.");
    }

    // Get user details from database
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const userResult = await userService.findByClerkUserId(userId);
    const user = userResult.data;

    // Check admin role from BOTH sources - if either has admin role, grant access
    const clerkAdminRole = clerkUser.publicMetadata?.adminRole;
    const dbAdminRole = user?.adminRole;
    
    // Determine which admin role to use (prioritize Clerk, fallback to database)
    // If user is authenticated through Clerk (external admin), make them super_admin
    let adminRole = clerkAdminRole || dbAdminRole;
    
    // If user has admin role through Clerk and is an external admin (no societyId), upgrade to super_admin
    if (clerkAdminRole && (!user || !user.societyId)) {
      adminRole = ADMIN_ROLES.SUPER_ADMIN;
    }
    
    // For external admins, get society info from Clerk metadata
    const clerkSocietyId = clerkUser.publicMetadata?.societyId;
    const clerkSocietyName = clerkUser.publicMetadata?.societyName;
    
    if (!adminRole) {
      throw new AuthorizationError("Access denied. Admin privileges required.");
    }
    
    if (!Object.values(ADMIN_ROLES).includes(adminRole)) {
      throw new AuthorizationError(`Invalid admin role assigned to user: ${adminRole}. Valid roles: ${Object.values(ADMIN_ROLES).join(', ')}`);
    }

    // Get society details if user has society info
    // Get society information (from user database record or Clerk metadata for external admins)
    let society = null;
    const societyId = user?.societyId || clerkSocietyId;
    
    // Always fetch society name from MongoDB (not from user data or Clerk metadata)
    let societyName = null;
    if (societyId) {
      const societyService = new SocietyService(db);
      const societyResult = await societyService.findById(societyId);
      society = societyResult.data;
      // Use society name from MongoDB document
      if (society?.name) {
        societyName = society.name;
      }
    }
    
    // Fallback to Clerk metadata only if MongoDB fetch failed (for external admins)
    if (!societyName && clerkSocietyName) {
      societyName = clerkSocietyName;
    }

    // Attach admin user info to request
    req.userId = userId;
    req.adminUser = {
      id: user?._id || userId,
      clerkUserId: userId,
      name: user?.name || clerkUser.firstName || 'Admin User',
      email: user?.email || clerkUser.emailAddresses?.[0]?.emailAddress,
      role: adminRole, // This is what the permission check looks for
      adminRole: adminRole, // Keep this for backward compatibility
      societyId: societyId, // Use societyId from either user record or Clerk metadata
      societyName: societyName, // Always from MongoDB, fallback to Clerk metadata only if needed
      wing: user?.wing,
      assignedWings: user?.assignedWings || [],
      permissions: getRolePermissions(adminRole),
      lastAdminLogin: new Date(),
      // Track which source provided the admin role
      adminRoleSource: clerkAdminRole ? 'clerk' : 'database',
      // Track if this is an external admin (not a resident)
      isExternalAdmin: !user || !user.societyId,
    };

    req.society = society;

    // Log admin access
    if (process.env.NODE_ENV === "development") {
      console.log(
        `✅ Admin authenticated: ${req.adminUser.name} (${adminRole}) - Source: ${req.adminUser.adminRoleSource} - Society: ${user?.societyName || 'External Admin'}`
      );
      console.log(`🔍 Admin role details:`, {
        finalRole: adminRole,
        clerkAdminRole,
        userAdminRole: user?.adminRole,
        isExternalAdmin: !user || !user.societyId,
        permissions: getRolePermissions(adminRole)
      });
      console.log(`🔍 Society ID details:`, {
        userSocietyId: user?.societyId,
        clerkSocietyId,
        finalSocietyId: societyId,
        societyName: req.adminUser.societyName
      });
    }

    // Update last admin login timestamp (only if user exists in database)
    if (user) {
      try {
        await userService.updateLastAdminLogin(userId);
      } catch (updateError) {
        // Log the error but don't fail authentication for external admins
        console.warn(`Failed to update admin login timestamp for external admin ${userId}:`, updateError.message);
      }
    }

    next();
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }

    console.error("Admin authentication middleware error:", error);
    throw new ExternalServiceError(
      "An error occurred during admin authentication verification."
    );
  }
};

/**
 * Middleware factory to require specific admin permissions
 */
const requirePermission = (resource, action) => {
  return (req, res, next) => {
    try {
      if (!req.adminUser) {
        throw new AuthenticationError(
          "Admin authentication required. Use verifyAdminAuth middleware first."
        );
      }

      const userRole = req.adminUser.role;

      // Debug logging for permission check
      if (process.env.NODE_ENV === "development") {
        console.log(`🔍 Permission check: User role: ${userRole}, Required: ${resource}:${action}`);
        console.log(`🔍 User permissions:`, ROLE_PERMISSIONS[userRole]);
        console.log(`🔍 Has permission:`, hasPermission(userRole, resource, action));
      }

      if (!hasPermission(userRole, resource, action)) {
        throw new AuthorizationError(
          `Insufficient permissions. Required: ${resource}:${action}`
        );
      }

      // For wing chairman, ensure they can only access their assigned wings
      if (
        userRole === ADMIN_ROLES.WING_CHAIRMAN &&
        action.includes("wing_only")
      ) {
        req.wingRestricted = true;
        req.allowedWings =
          req.adminUser.assignedWings.length > 0
            ? req.adminUser.assignedWings
            : [req.adminUser.wing]; // Default to their own wing
      }

      next();
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }

      console.error("Permission check middleware error:", error);
      throw new ExternalServiceError(
        "An error occurred during permission verification."
      );
    }
  };
};

/**
 * Middleware to require super admin role
 */
const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.adminUser) {
      throw new AuthenticationError(
        "Admin authentication required. Use verifyAdminAuth middleware first."
      );
    }

    if (req.adminUser.role !== ADMIN_ROLES.SUPER_ADMIN) {
      throw new AuthorizationError(
        "Super admin privileges required for this action."
      );
    }

    next();
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }

    console.error("Super admin check middleware error:", error);
    throw new ExternalServiceError(
      "An error occurred during super admin verification."
    );
  }
};

/**
 * Middleware to require admin or super admin role
 */
const requireAdmin = (req, res, next) => {
  try {
    if (!req.adminUser) {
      throw new AuthenticationError(
        "Admin authentication required. Use verifyAdminAuth middleware first."
      );
    }

    const allowedRoles = [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN];

    if (!allowedRoles.includes(req.adminUser.role)) {
      throw new AuthorizationError("Admin privileges required for this action.");
    }

    next();
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }

    console.error("Admin check middleware error:", error);
    throw new ExternalServiceError(
      "An error occurred during admin verification."
    );
  }
};

/**
 * Filter data based on wing restrictions for wing chairmen
 */
const filterByWingAccess = (data, req) => {
  if (!req.wingRestricted || !Array.isArray(data)) {
    return data;
  }

  const allowedWings = req.allowedWings || [];

  return data.filter((item) => {
    if (item.wing && allowedWings.includes(item.wing)) {
      return true;
    }
    return false;
  });
};

/**
 * Audit logging for admin actions
 */
const logAdminAction = async (adminUser, action, resource, details = {}) => {
  try {
    const db = dbConnection.getDb();
    const auditLog = {
      adminId: adminUser.clerkUserId,
      adminName: adminUser.name,
      adminRole: adminUser.role,
      societyId: adminUser.societyId,
      action,
      resource,
      details,
      timestamp: new Date(),
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
    };

    await db.collection("admin_audit_logs").insertOne(auditLog);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `📝 Admin action logged: ${adminUser.name} performed ${action} on ${resource}`
      );
    }
  } catch (error) {
    console.error("Failed to log admin action:", error);
    // Don't throw error as this shouldn't break the main flow
  }
};

/**
 * Session management for admin users
 */
const adminSessionManager = {
  // Store active admin sessions in memory (in production, use Redis)
  activeSessions: new Map(),

  /**
   * Create admin session
   */
  createSession: (adminUser, sessionData = {}) => {
    const sessionId = `admin_${adminUser.clerkUserId}_${Date.now()}`;
    const session = {
      sessionId,
      adminId: adminUser.clerkUserId,
      adminName: adminUser.name,
      adminRole: adminUser.role,
      societyId: adminUser.societyId,
      createdAt: new Date(),
      lastActivity: new Date(),
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      isActive: true,
    };

    adminSessionManager.activeSessions.set(sessionId, session);
    return session;
  },

  /**
   * Update session activity
   */
  updateActivity: (adminId) => {
    for (const [sessionId, session] of adminSessionManager.activeSessions) {
      if (session.adminId === adminId && session.isActive) {
        session.lastActivity = new Date();
        break;
      }
    }
  },

  /**
   * Get active session for admin
   */
  getActiveSession: (adminId) => {
    for (const [sessionId, session] of adminSessionManager.activeSessions) {
      if (session.adminId === adminId && session.isActive) {
        return session;
      }
    }
    return null;
  },

  /**
   * Invalidate admin session
   */
  invalidateSession: (adminId) => {
    for (const [sessionId, session] of adminSessionManager.activeSessions) {
      if (session.adminId === adminId) {
        session.isActive = false;
        session.endedAt = new Date();
      }
    }
  },

  /**
   * Clean up expired sessions (call periodically)
   */
  cleanupExpiredSessions: () => {
    const now = new Date();
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, session] of adminSessionManager.activeSessions) {
      if (now - session.lastActivity > sessionTimeout) {
        session.isActive = false;
        session.endedAt = now;
      }
    }
  },

  /**
   * Get all active sessions for society
   */
  getActiveSessions: (societyId) => {
    const sessions = [];
    for (const [sessionId, session] of adminSessionManager.activeSessions) {
      if (
        session.societyId.toString() === societyId.toString() &&
        session.isActive
      ) {
        sessions.push(session);
      }
    }
    return sessions;
  },
};

/**
 * Enhanced admin authentication middleware with session management
 */
const verifyAdminAuthWithSession = async (req, res, next) => {
  try {
    // First run the standard admin auth
    await new Promise((resolve, reject) => {
      verifyAdminAuth(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Update session activity
    adminSessionManager.updateActivity(req.adminUser.clerkUserId);

    // Add session info to request
    req.adminSession = adminSessionManager.getActiveSession(
      req.adminUser.clerkUserId
    );

    next();
  } catch (error) {
    throw error;
  }
};

/**
 * Rate limiting for admin actions
 */
const adminRateLimit = {
  // Store rate limit data in memory (in production, use Redis)
  rateLimitData: new Map(),

  /**
   * Check if admin action is rate limited
   */
  checkRateLimit: (adminId, action, limit = 100, windowMs = 60000) => {
    const key = `${adminId}_${action}`;
    const now = Date.now();

    if (!adminRateLimit.rateLimitData.has(key)) {
      adminRateLimit.rateLimitData.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return { allowed: true, remaining: limit - 1 };
    }

    const data = adminRateLimit.rateLimitData.get(key);

    if (now > data.resetTime) {
      // Reset the window
      data.count = 1;
      data.resetTime = now + windowMs;
      return { allowed: true, remaining: limit - 1 };
    }

    if (data.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.resetTime,
      };
    }

    data.count++;
    return { allowed: true, remaining: limit - data.count };
  },
};

/**
 * Middleware factory for admin rate limiting
 */
const createAdminRateLimit = (action, limit = 100, windowMs = 60000) => {
  return (req, res, next) => {
    if (!req.adminUser) {
      throw new AuthenticationError("Admin authentication required");
    }

    const rateCheck = adminRateLimit.checkRateLimit(
      req.adminUser.clerkUserId,
      action,
      limit,
      windowMs
    );

    if (!rateCheck.allowed) {
      throw new AuthorizationError(
        `Rate limit exceeded for ${action}. Try again after ${new Date(
          rateCheck.resetTime
        ).toISOString()}`
      );
    }

    // Add rate limit info to response headers
    res.set({
      "X-RateLimit-Limit": limit,
      "X-RateLimit-Remaining": rateCheck.remaining,
      "X-RateLimit-Reset": new Date(rateCheck.resetTime).toISOString(),
    });

    next();
  };
};

// Clean up expired sessions every hour (only in production)
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    adminSessionManager.cleanupExpiredSessions();
  }, 60 * 60 * 1000);
}

module.exports = {
  ADMIN_ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  verifyAdminAuth,
  verifyAdminAuthWithSession,
  requirePermission,
  requireSuperAdmin,
  requireAdmin,
  filterByWingAccess,
  logAdminAction,
  adminSessionManager,
  adminRateLimit,
  createAdminRateLimit,
};
