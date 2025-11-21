const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { asyncHandler } = require("../../middleware/errorHandler");
const {
  verifyAdminAuth,
  requirePermission,
  logAdminAction,
  ADMIN_ROLES,
} = require("../../middleware/adminAuth");
const dbConnection = require("../../config/database");
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require("../../middleware/errors");

/**
 * Communication API Endpoints for Announcements and Notifications
 * Implements requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

/**
 * @route   POST /api/admin/communication/announcements
 * @desc    Create and publish announcements
 * @access  Admin (with announcement permissions)
 */
router.post(
  "/announcements",
  verifyAdminAuth,
  requirePermission("announcements", "write"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const {
      title,
      content,
      type = "announcement",
      targetAudience = {},
      expiresAt,
      isPinned = false,
      attachments = [],
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      throw new ValidationError("Title and content are required");
    }

    if (!["announcement", "urgent", "event", "maintenance"].includes(type)) {
      throw new ValidationError(
        "Type must be one of: announcement, urgent, event, maintenance"
      );
    }

    const db = dbConnection.getDb();

    // Validate target audience based on admin role
    const validatedTargetAudience = await validateTargetAudience(
      targetAudience,
      adminUser,
      db
    );

    // Create announcement document
    const announcement = {
      societyId: new ObjectId(adminUser.societyId),
      authorId: adminUser.clerkUserId,
      authorName: adminUser.name,
      authorRole: adminUser.role,
      title: title.trim(),
      content: content.trim(),
      type,
      targetAudience: validatedTargetAudience,
      publishedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isPinned,
      attachments: attachments.map((att) => ({
        name: att.name,
        url: att.url,
        type: att.type,
        uploadedAt: new Date(),
      })),
      deliveryStats: {
        totalTargeted: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert announcement
    const result = await db.collection("announcements").insertOne(announcement);

    if (!result.insertedId) {
      throw new ValidationError("Failed to create announcement");
    }

    // Calculate target audience size
    const targetCount = await calculateTargetAudienceSize(
      validatedTargetAudience,
      adminUser.societyId,
      db
    );

    // Update delivery stats
    await db.collection("announcements").updateOne(
      { _id: result.insertedId },
      {
        $set: {
          "deliveryStats.totalTargeted": targetCount,
        },
      }
    );

    // Send notifications to target audience
    await sendAnnouncementNotifications(
      result.insertedId,
      announcement,
      validatedTargetAudience,
      adminUser.societyId,
      db
    );

    // Log admin action
    await logAdminAction(adminUser, "create_announcement", "communication", {
      announcementId: result.insertedId,
      title,
      type,
      targetAudience: validatedTargetAudience,
      targetCount,
    });

    res.status(201).json({
      success: true,
      message: "Announcement created and published successfully",
      data: {
        announcementId: result.insertedId,
        title,
        type,
        publishedAt: announcement.publishedAt,
        targetCount,
        deliveryStats: {
          totalTargeted: targetCount,
          delivered: 0,
          read: 0,
          failed: 0,
        },
      },
    });
  })
);

/**
 * @route   GET /api/admin/communication/announcements
 * @desc    Get announcement history with filtering
 * @access  Admin
 */
router.get(
  "/announcements",
  verifyAdminAuth,
  requirePermission("announcements", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const {
      page = 1,
      limit = 20,
      type,
      authorId,
      startDate,
      endDate,
      includeExpired = "true",
    } = req.query;

    const db = dbConnection.getDb();
    const query = { societyId: new ObjectId(adminUser.societyId) };

    // Apply filters
    if (
      type &&
      ["announcement", "urgent", "event", "maintenance"].includes(type)
    ) {
      query.type = type;
    }

    if (authorId) {
      query.authorId = authorId;
    }

    if (startDate || endDate) {
      query.publishedAt = {};
      if (startDate) {
        query.publishedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.publishedAt.$lte = new Date(endDate);
      }
    }

    // Filter expired announcements
    if (includeExpired === "false") {
      query.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
    }

    // Role-based filtering for wing chairmen
    if (adminUser.role === ADMIN_ROLES.WING_CHAIRMAN) {
      const allowedWings =
        adminUser.assignedWings.length > 0
          ? adminUser.assignedWings
          : [adminUser.wing];

      query.$or = [
        { authorId: adminUser.clerkUserId }, // Own announcements
        { "targetAudience.wings": { $in: allowedWings } }, // Targeted to their wings
        { "targetAudience.wings": { $size: 0 } }, // Society-wide announcements
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const announcements = await db
      .collection("announcements")
      .find(query)
      .sort({ isPinned: -1, publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("announcements").countDocuments(query);

    res.json({
      success: true,
      data: {
        announcements: announcements.map(formatAnnouncementResponse),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        filters: {
          type,
          authorId,
          startDate,
          endDate,
          includeExpired,
        },
      },
    });
  })
);

/**
 * @route   POST /api/admin/communication/notifications/send
 * @desc    Send custom notifications with targeting options
 * @access  Admin
 */
router.post(
  "/notifications/send",
  verifyAdminAuth,
  requirePermission("notifications", "send"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const {
      title,
      message,
      targetAudience = {},
      priority = "normal",
      scheduledAt,
      expiresAt,
    } = req.body;

    // Validate required fields
    if (!title || !message) {
      throw new ValidationError("Title and message are required");
    }

    if (!["low", "normal", "high", "urgent"].includes(priority)) {
      throw new ValidationError(
        "Priority must be one of: low, normal, high, urgent"
      );
    }

    const db = dbConnection.getDb();

    // Validate target audience based on admin role
    const validatedTargetAudience = await validateTargetAudience(
      targetAudience,
      adminUser,
      db
    );

    // Create notification document
    const notification = {
      societyId: new ObjectId(adminUser.societyId),
      senderId: adminUser.clerkUserId,
      senderName: adminUser.name,
      senderRole: adminUser.role,
      title: title.trim(),
      message: message.trim(),
      priority,
      targetAudience: validatedTargetAudience,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: scheduledAt ? "scheduled" : "sent",
      deliveryStats: {
        totalTargeted: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert notification
    const result = await db.collection("notifications").insertOne(notification);

    if (!result.insertedId) {
      throw new ValidationError("Failed to create notification");
    }

    // Calculate target audience size
    const targetCount = await calculateTargetAudienceSize(
      validatedTargetAudience,
      adminUser.societyId,
      db
    );

    // Update delivery stats
    await db.collection("notifications").updateOne(
      { _id: result.insertedId },
      {
        $set: {
          "deliveryStats.totalTargeted": targetCount,
        },
      }
    );

    // Send notifications immediately if not scheduled
    if (!scheduledAt) {
      await sendCustomNotifications(
        result.insertedId,
        notification,
        validatedTargetAudience,
        adminUser.societyId,
        db
      );
    }

    // Log admin action
    await logAdminAction(adminUser, "send_notification", "communication", {
      notificationId: result.insertedId,
      title,
      priority,
      targetAudience: validatedTargetAudience,
      targetCount,
      scheduledAt: notification.scheduledAt,
    });

    res.status(201).json({
      success: true,
      message: scheduledAt
        ? "Notification scheduled successfully"
        : "Notification sent successfully",
      data: {
        notificationId: result.insertedId,
        title,
        priority,
        status: notification.status,
        scheduledAt: notification.scheduledAt,
        targetCount,
        deliveryStats: {
          totalTargeted: targetCount,
          delivered: 0,
          read: 0,
          failed: 0,
        },
      },
    });
  })
);

/**
 * @route   GET /api/admin/communication/notifications/history
 * @desc    Get notification history and analytics
 * @access  Admin
 */
router.get(
  "/notifications/history",
  verifyAdminAuth,
  requirePermission("notifications", "read"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const {
      page = 1,
      limit = 20,
      priority,
      status,
      senderId,
      startDate,
      endDate,
    } = req.query;

    const db = dbConnection.getDb();
    const query = { societyId: new ObjectId(adminUser.societyId) };

    // Apply filters
    if (priority && ["low", "normal", "high", "urgent"].includes(priority)) {
      query.priority = priority;
    }

    if (
      status &&
      ["scheduled", "sent", "delivered", "failed"].includes(status)
    ) {
      query.status = status;
    }

    if (senderId) {
      query.senderId = senderId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Role-based filtering for wing chairmen
    if (adminUser.role === ADMIN_ROLES.WING_CHAIRMAN) {
      const allowedWings =
        adminUser.assignedWings.length > 0
          ? adminUser.assignedWings
          : [adminUser.wing];

      query.$or = [
        { senderId: adminUser.clerkUserId }, // Own notifications
        { "targetAudience.wings": { $in: allowedWings } }, // Targeted to their wings
        { "targetAudience.wings": { $size: 0 } }, // Society-wide notifications
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const notifications = await db
      .collection("notifications")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("notifications").countDocuments(query);

    // Get analytics data
    const analytics = await getNotificationAnalytics(adminUser.societyId, db, {
      startDate,
      endDate,
      adminRole: adminUser.role,
      adminWings:
        adminUser.role === ADMIN_ROLES.WING_CHAIRMAN
          ? adminUser.assignedWings.length > 0
            ? adminUser.assignedWings
            : [adminUser.wing]
          : null,
    });

    res.json({
      success: true,
      data: {
        notifications: notifications.map(formatNotificationResponse),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        analytics,
        filters: {
          priority,
          status,
          senderId,
          startDate,
          endDate,
        },
      },
    });
  })
);

/**
 * @route   POST /api/admin/communication/notifications/bulk
 * @desc    Send bulk notifications to multiple target groups
 * @access  Admin
 */
router.post(
  "/notifications/bulk",
  verifyAdminAuth,
  requirePermission("notifications", "bulk"),
  asyncHandler(async (req, res) => {
    const { adminUser } = req;
    const { notifications } = req.body;

    if (!Array.isArray(notifications) || notifications.length === 0) {
      throw new ValidationError(
        "Notifications array is required and cannot be empty"
      );
    }

    if (notifications.length > 10) {
      throw new ValidationError(
        "Maximum 10 notifications allowed per bulk request"
      );
    }

    const db = dbConnection.getDb();
    const results = [];
    const errors = [];

    // Process each notification
    for (let i = 0; i < notifications.length; i++) {
      const notif = notifications[i];

      try {
        // Validate required fields
        if (!notif.title || !notif.message) {
          throw new ValidationError(
            `Notification ${i + 1}: Title and message are required`
          );
        }

        // Validate target audience
        const validatedTargetAudience = await validateTargetAudience(
          notif.targetAudience || {},
          adminUser,
          db
        );

        // Create notification document
        const notification = {
          societyId: new ObjectId(adminUser.societyId),
          senderId: adminUser.clerkUserId,
          senderName: adminUser.name,
          senderRole: adminUser.role,
          title: notif.title.trim(),
          message: notif.message.trim(),
          priority: notif.priority || "normal",
          targetAudience: validatedTargetAudience,
          scheduledAt: notif.scheduledAt
            ? new Date(notif.scheduledAt)
            : new Date(),
          expiresAt: notif.expiresAt ? new Date(notif.expiresAt) : null,
          status: notif.scheduledAt ? "scheduled" : "sent",
          deliveryStats: {
            totalTargeted: 0,
            delivered: 0,
            read: 0,
            failed: 0,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Insert notification
        const result = await db
          .collection("notifications")
          .insertOne(notification);

        // Calculate target audience size
        const targetCount = await calculateTargetAudienceSize(
          validatedTargetAudience,
          adminUser.societyId,
          db
        );

        // Update delivery stats
        await db.collection("notifications").updateOne(
          { _id: result.insertedId },
          {
            $set: {
              "deliveryStats.totalTargeted": targetCount,
            },
          }
        );

        // Send notifications immediately if not scheduled
        if (!notif.scheduledAt) {
          await sendCustomNotifications(
            result.insertedId,
            notification,
            validatedTargetAudience,
            adminUser.societyId,
            db
          );
        }

        results.push({
          index: i,
          notificationId: result.insertedId,
          title: notif.title,
          status: notification.status,
          targetCount,
        });
      } catch (error) {
        errors.push({
          index: i,
          title: notif.title || `Notification ${i + 1}`,
          error: error.message,
        });
      }
    }

    // Log admin action
    await logAdminAction(
      adminUser,
      "send_bulk_notifications",
      "communication",
      {
        totalNotifications: notifications.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
      }
    );

    res.status(201).json({
      success: true,
      message: `Bulk notification processing completed. ${results.length} successful, ${errors.length} failed.`,
      data: {
        successful: results,
        failed: errors,
        summary: {
          total: notifications.length,
          successful: results.length,
          failed: errors.length,
        },
      },
    });
  })
);

// Helper Functions

/**
 * Validate target audience based on admin role and permissions
 */
async function validateTargetAudience(targetAudience, adminUser, db) {
  const validated = {
    wings: [],
    residentTypes: [],
    specificUsers: [],
  };

  // For wing chairmen, restrict to their assigned wings
  if (adminUser.role === ADMIN_ROLES.WING_CHAIRMAN) {
    const allowedWings =
      adminUser.assignedWings.length > 0
        ? adminUser.assignedWings
        : [adminUser.wing];

    if (targetAudience.wings && targetAudience.wings.length > 0) {
      validated.wings = targetAudience.wings.filter((wing) =>
        allowedWings.includes(wing)
      );
    } else {
      // If no wings specified, default to their assigned wings
      validated.wings = allowedWings;
    }

    // Validate specific users belong to allowed wings
    if (
      targetAudience.specificUsers &&
      targetAudience.specificUsers.length > 0
    ) {
      const users = await db
        .collection("users")
        .find({
          clerkUserId: { $in: targetAudience.specificUsers },
          societyId: new ObjectId(adminUser.societyId),
          wing: { $in: allowedWings },
        })
        .toArray();

      validated.specificUsers = users.map((user) => user.clerkUserId);
    }
  } else {
    // For other admin roles, allow full targeting
    validated.wings = targetAudience.wings || [];
    validated.residentTypes = targetAudience.residentTypes || [];
    validated.specificUsers = targetAudience.specificUsers || [];
  }

  return validated;
}

/**
 * Calculate target audience size
 */
async function calculateTargetAudienceSize(targetAudience, societyId, db) {
  const query = { societyId: new ObjectId(societyId), isActive: true };

  // Apply wing filter
  if (targetAudience.wings && targetAudience.wings.length > 0) {
    query.wing = { $in: targetAudience.wings };
  }

  // Apply resident type filter
  if (targetAudience.residentTypes && targetAudience.residentTypes.length > 0) {
    query.residentType = { $in: targetAudience.residentTypes };
  }

  // Apply specific users filter
  if (targetAudience.specificUsers && targetAudience.specificUsers.length > 0) {
    query.clerkUserId = { $in: targetAudience.specificUsers };
  }

  return await db.collection("users").countDocuments(query);
}

/**
 * Send announcement notifications to target audience
 */
async function sendAnnouncementNotifications(
  announcementId,
  announcement,
  targetAudience,
  societyId,
  db
) {
  // Get target users
  const targetUsers = await getTargetUsers(targetAudience, societyId, db);

  // Create delivery records
  const deliveries = targetUsers.map((user) => ({
    announcementId,
    notificationId: null,
    recipientId: user.clerkUserId,
    recipientName: "Unknown", // Will be populated from Clerk in frontend
    recipientWing: user.wing,
    deliveryStatus: "sent",
    deliveredAt: new Date(),
    readAt: null,
    deviceInfo: null,
    errorMessage: null,
    createdAt: new Date(),
  }));

  if (deliveries.length > 0) {
    await db.collection("notification_deliveries").insertMany(deliveries);

    // Update announcement delivery stats
    await db.collection("announcements").updateOne(
      { _id: announcementId },
      {
        $inc: {
          "deliveryStats.delivered": deliveries.length,
        },
      }
    );
  }

  // TODO: Integrate with actual push notification service
  console.log(
    `Sent announcement "${announcement.title}" to ${deliveries.length} users`
  );

  return deliveries.length;
}

/**
 * Send custom notifications to target audience
 */
async function sendCustomNotifications(
  notificationId,
  notification,
  targetAudience,
  societyId,
  db
) {
  // Get target users
  const targetUsers = await getTargetUsers(targetAudience, societyId, db);

  // Create delivery records
  const deliveries = targetUsers.map((user) => ({
    announcementId: null,
    notificationId,
    recipientId: user.clerkUserId,
    recipientName: "Unknown", // Will be populated from Clerk in frontend
    recipientWing: user.wing,
    deliveryStatus: "sent",
    deliveredAt: new Date(),
    readAt: null,
    deviceInfo: null,
    errorMessage: null,
    createdAt: new Date(),
  }));

  if (deliveries.length > 0) {
    await db.collection("notification_deliveries").insertMany(deliveries);

    // Update notification delivery stats
    await db.collection("notifications").updateOne(
      { _id: notificationId },
      {
        $inc: {
          "deliveryStats.delivered": deliveries.length,
        },
      }
    );
  }

  // TODO: Integrate with actual push notification service
  console.log(
    `Sent notification "${notification.title}" to ${deliveries.length} users`
  );

  return deliveries.length;
}

/**
 * Get target users based on audience criteria
 */
async function getTargetUsers(targetAudience, societyId, db) {
  const query = { societyId: new ObjectId(societyId), isActive: true };

  // Apply wing filter
  if (targetAudience.wings && targetAudience.wings.length > 0) {
    query.wing = { $in: targetAudience.wings };
  }

  // Apply resident type filter
  if (targetAudience.residentTypes && targetAudience.residentTypes.length > 0) {
    query.residentType = { $in: targetAudience.residentTypes };
  }

  // Apply specific users filter
  if (targetAudience.specificUsers && targetAudience.specificUsers.length > 0) {
    query.clerkUserId = { $in: targetAudience.specificUsers };
  }

  return await db.collection("users").find(query).toArray();
}

/**
 * Get notification analytics
 */
async function getNotificationAnalytics(societyId, db, options = {}) {
  const { startDate, endDate, adminRole, adminWings } = options;

  const matchQuery = { societyId: new ObjectId(societyId) };

  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  // Apply role-based filtering
  if (adminRole === ADMIN_ROLES.WING_CHAIRMAN && adminWings) {
    matchQuery.$or = [
      { "targetAudience.wings": { $in: adminWings } },
      { "targetAudience.wings": { $size: 0 } },
    ];
  }

  const analytics = await db
    .collection("notifications")
    .aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalNotifications: { $sum: 1 },
          totalTargeted: { $sum: "$deliveryStats.totalTargeted" },
          totalDelivered: { $sum: "$deliveryStats.delivered" },
          totalRead: { $sum: "$deliveryStats.read" },
          totalFailed: { $sum: "$deliveryStats.failed" },
          byPriority: {
            $push: {
              priority: "$priority",
              count: 1,
            },
          },
          byStatus: {
            $push: {
              status: "$status",
              count: 1,
            },
          },
        },
      },
    ])
    .toArray();

  return (
    analytics[0] || {
      totalNotifications: 0,
      totalTargeted: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
      byPriority: [],
      byStatus: [],
    }
  );
}

/**
 * Format announcement response
 */
function formatAnnouncementResponse(announcement) {
  return {
    id: announcement._id,
    title: announcement.title,
    content: announcement.content,
    type: announcement.type,
    authorName: announcement.authorName,
    authorRole: announcement.authorRole,
    targetAudience: announcement.targetAudience,
    publishedAt: announcement.publishedAt,
    expiresAt: announcement.expiresAt,
    isPinned: announcement.isPinned,
    attachments: announcement.attachments,
    deliveryStats: announcement.deliveryStats,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
}

/**
 * Format notification response
 */
function formatNotificationResponse(notification) {
  return {
    id: notification._id,
    title: notification.title,
    message: notification.message,
    priority: notification.priority,
    senderName: notification.senderName,
    senderRole: notification.senderRole,
    targetAudience: notification.targetAudience,
    status: notification.status,
    scheduledAt: notification.scheduledAt,
    expiresAt: notification.expiresAt,
    deliveryStats: notification.deliveryStats,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

module.exports = router;
