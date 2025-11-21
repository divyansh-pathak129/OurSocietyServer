const {
  emitToAdmins,
  emitToSocietyAdmins,
  emitToAdmin,
} = require("./websocket");
const { logger } = require("./errorHandler");

/**
 * Emit maintenance payment uploaded event
 * @param {string} societyId - Society ID
 * @param {Object} paymentData - Payment data
 */
function emitMaintenancePaymentUploaded(societyId, paymentData) {
  try {
    const eventData = {
      type: "maintenance_payment_uploaded",
      societyId,
      paymentId: paymentData._id,
      userId: paymentData.userId,
      userName: paymentData.userName,
      month: paymentData.month,
      year: paymentData.year,
      amount: paymentData.amount,
      uploadedAt: paymentData.paymentProof?.uploadedAt || new Date(),
    };

    emitToSocietyAdmins(societyId, "maintenance_payment_uploaded", eventData);
    logger.info("Emitted maintenance payment uploaded event", {
      societyId,
      paymentId: paymentData._id,
    });
  } catch (error) {
    logger.error("Error emitting maintenance payment uploaded event:", error);
  }
}

/**
 * Emit join request submitted event
 * @param {string} societyId - Society ID
 * @param {Object} requestData - Join request data
 */
function emitJoinRequestSubmitted(societyId, requestData) {
  try {
    const eventData = {
      type: "join_request_submitted",
      societyId,
      requestId: requestData._id,
      userId: requestData.clerkUserId,
      userName: requestData.requestedData?.name || "Unknown User",
      wing: requestData.requestedData?.wing,
      flatNumber: requestData.requestedData?.flatNumber,
      residentType: requestData.requestedData?.residentType,
      submittedAt: requestData.createdAt,
    };

    emitToSocietyAdmins(societyId, "join_request_submitted", eventData);
    logger.info("Emitted join request submitted event", {
      societyId,
      requestId: requestData._id,
    });
  } catch (error) {
    logger.error("Error emitting join request submitted event:", error);
  }
}

/**
 * Emit forum post created event
 * @param {string} societyId - Society ID
 * @param {Object} postData - Forum post data
 */
function emitForumPostCreated(societyId, postData) {
  try {
    const eventData = {
      type: "forum_post_created",
      societyId,
      postId: postData._id,
      userId: postData.userId,
      userName: postData.userName,
      title: postData.title,
      content: postData.content?.substring(0, 100) + "...",
      forumName: postData.forumName || "General",
      createdAt: postData.createdAt,
    };

    emitToSocietyAdmins(societyId, "forum_post_created", eventData);
    logger.info("Emitted forum post created event", {
      societyId,
      postId: postData._id,
    });
  } catch (error) {
    logger.error("Error emitting forum post created event:", error);
  }
}

/**
 * Emit user activity update event
 * @param {string} societyId - Society ID
 * @param {Object} activityData - User activity data
 */
function emitUserActivityUpdate(societyId, activityData) {
  try {
    const eventData = {
      type: "user_activity_update",
      societyId,
      userId: activityData.userId,
      userName: activityData.userName,
      activity: activityData.activity,
      timestamp: activityData.timestamp || new Date(),
    };

    emitToSocietyAdmins(societyId, "user_activity_update", eventData);
    logger.info("Emitted user activity update event", {
      societyId,
      userId: activityData.userId,
    });
  } catch (error) {
    logger.error("Error emitting user activity update event:", error);
  }
}

/**
 * Emit dashboard update event
 * @param {string} societyId - Society ID
 * @param {Object} updateData - Dashboard update data
 */
function emitDashboardUpdate(societyId, updateData) {
  try {
    const eventData = {
      type: "dashboard_update",
      societyId,
      updateType: updateData.type, // 'stats', 'metrics', 'counts', etc.
      data: updateData.data,
      timestamp: new Date(),
    };

    emitToSocietyAdmins(societyId, "dashboard_update", eventData);
    logger.info("Emitted dashboard update event", {
      societyId,
      updateType: updateData.type,
    });
  } catch (error) {
    logger.error("Error emitting dashboard update event:", error);
  }
}

/**
 * Emit system event
 * @param {string} societyId - Society ID (optional, if null emits to all admins)
 * @param {Object} eventData - System event data
 */
function emitSystemEvent(societyId, eventData) {
  try {
    const systemEventData = {
      type: "system_event",
      title: eventData.title,
      message: eventData.message,
      severity: eventData.severity || "info", // 'info', 'warning', 'error', 'success'
      data: eventData.data,
      timestamp: new Date(),
    };

    if (societyId) {
      emitToSocietyAdmins(societyId, "system_event", systemEventData);
    } else {
      emitToAdmins("system_event", systemEventData);
    }

    logger.info("Emitted system event", { societyId, title: eventData.title });
  } catch (error) {
    logger.error("Error emitting system event:", error);
  }
}

/**
 * Emit maintenance payment status change
 * @param {string} societyId - Society ID
 * @param {Object} statusData - Status change data
 */
function emitMaintenanceStatusChange(societyId, statusData) {
  try {
    const eventData = {
      type: "maintenance_status_change",
      societyId,
      paymentId: statusData.paymentId,
      userId: statusData.userId,
      userName: statusData.userName,
      status: statusData.status, // 'approved', 'rejected'
      approvedBy: statusData.approvedBy,
      reason: statusData.reason,
      timestamp: new Date(),
    };

    emitToSocietyAdmins(societyId, "maintenance_status_change", eventData);

    // Also emit dashboard update for stats
    emitDashboardUpdate(societyId, {
      type: "maintenance_stats",
      data: {
        action: statusData.status,
        paymentId: statusData.paymentId,
      },
    });

    logger.info("Emitted maintenance status change event", {
      societyId,
      paymentId: statusData.paymentId,
      status: statusData.status,
    });
  } catch (error) {
    logger.error("Error emitting maintenance status change event:", error);
  }
}

/**
 * Emit join request status change
 * @param {string} societyId - Society ID
 * @param {Object} statusData - Status change data
 */
function emitJoinRequestStatusChange(societyId, statusData) {
  try {
    const eventData = {
      type: "join_request_status_change",
      societyId,
      requestId: statusData.requestId,
      userId: statusData.userId,
      userName: statusData.userName,
      status: statusData.status, // 'approved', 'rejected'
      reviewedBy: statusData.reviewedBy,
      reason: statusData.reason,
      timestamp: new Date(),
    };

    emitToSocietyAdmins(societyId, "join_request_status_change", eventData);

    // Also emit dashboard update for stats
    emitDashboardUpdate(societyId, {
      type: "user_stats",
      data: {
        action: statusData.status,
        requestId: statusData.requestId,
      },
    });

    logger.info("Emitted join request status change event", {
      societyId,
      requestId: statusData.requestId,
      status: statusData.status,
    });
  } catch (error) {
    logger.error("Error emitting join request status change event:", error);
  }
}

/**
 * Emit admin session update
 * @param {string} adminId - Admin ID
 * @param {Object} sessionData - Session data
 */
function emitAdminSessionUpdate(adminId, sessionData) {
  try {
    const eventData = {
      type: "admin_session_update",
      adminId,
      adminName: sessionData.adminName,
      sessionId: sessionData.sessionId,
      connectedAt: sessionData.connectedAt,
      timestamp: new Date(),
      isActive: sessionData.isActive,
    };

    emitToAdmins("admin_session_update", eventData);
    logger.info("Emitted admin session update event", { adminId });
  } catch (error) {
    logger.error("Error emitting admin session update event:", error);
  }
}

/**
 * Emit online users count update
 * @param {string} societyId - Society ID
 * @param {number} count - Online users count
 */
function emitOnlineUsersCount(societyId, count) {
  try {
    const eventData = {
      type: "online_users_count",
      societyId,
      count,
      timestamp: new Date(),
    };

    emitToSocietyAdmins(societyId, "online_users_count", eventData);
    logger.info("Emitted online users count update", { societyId, count });
  } catch (error) {
    logger.error("Error emitting online users count update:", error);
  }
}

/**
 * Emit bulk operation complete event
 * @param {string} societyId - Society ID
 * @param {Object} operationData - Operation data
 */
function emitBulkOperationComplete(societyId, operationData) {
  try {
    const eventData = {
      type: "bulk_operation_complete",
      societyId,
      operation: operationData.operation,
      successCount: operationData.successCount,
      failureCount: operationData.failureCount,
      details: operationData.details,
      timestamp: new Date(),
    };

    emitToSocietyAdmins(societyId, "bulk_operation_complete", eventData);
    logger.info("Emitted bulk operation complete event", {
      societyId,
      operation: operationData.operation,
    });
  } catch (error) {
    logger.error("Error emitting bulk operation complete event:", error);
  }
}

/**
 * Emit admin session sync event
 * @param {string} societyId - Society ID
 * @param {Object} syncData - Sync data
 */
function emitAdminSessionSync(societyId, syncData) {
  try {
    const eventData = {
      type: "admin_session_sync",
      societyId,
      syncType: syncData.type, // 'settings_changed', 'data_updated', etc.
      adminId: syncData.adminId,
      adminName: syncData.adminName,
      data: syncData.data,
      timestamp: new Date(),
    };

    emitToSocietyAdmins(societyId, "admin_session_sync", eventData);
    logger.info("Emitted admin session sync event", {
      societyId,
      syncType: syncData.type,
    });
  } catch (error) {
    logger.error("Error emitting admin session sync event:", error);
  }
}

module.exports = {
  emitMaintenancePaymentUploaded,
  emitJoinRequestSubmitted,
  emitForumPostCreated,
  emitUserActivityUpdate,
  emitDashboardUpdate,
  emitSystemEvent,
  emitMaintenanceStatusChange,
  emitJoinRequestStatusChange,
  emitAdminSessionUpdate,
  emitOnlineUsersCount,
  emitBulkOperationComplete,
  emitAdminSessionSync,
};
