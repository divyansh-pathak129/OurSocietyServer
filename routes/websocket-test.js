const express = require("express");
const router = express.Router();
const { verifyClerkToken } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  emitMaintenancePaymentUploaded,
  emitJoinRequestSubmitted,
  emitForumPostCreated,
  emitSystemEvent,
  emitDashboardUpdate,
} = require("../middleware/websocketEvents");

/**
 * Test endpoint to emit maintenance payment uploaded event
 */
router.post(
  "/test/maintenance-payment",
  verifyClerkToken,
  asyncHandler(async (req, res) => {
    const { societyId } = req.body;

    const mockPaymentData = {
      _id: "test_payment_" + Date.now(),
      userId: req.userId,
      userName: "Test User",
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      amount: 5000,
      paymentProof: {
        uploadedAt: new Date(),
      },
    };

    emitMaintenancePaymentUploaded(societyId, mockPaymentData);

    res.json({
      success: true,
      message: "Test maintenance payment event emitted",
      data: mockPaymentData,
    });
  })
);

/**
 * Test endpoint to emit join request submitted event
 */
router.post(
  "/test/join-request",
  verifyClerkToken,
  asyncHandler(async (req, res) => {
    const { societyId } = req.body;

    const mockRequestData = {
      _id: "test_request_" + Date.now(),
      clerkUserId: req.userId,
      requestedData: {
        name: "Test User",
        wing: "A",
        flatNumber: "101",
        residentType: "owner",
      },
      createdAt: new Date(),
    };

    emitJoinRequestSubmitted(societyId, mockRequestData);

    res.json({
      success: true,
      message: "Test join request event emitted",
      data: mockRequestData,
    });
  })
);

/**
 * Test endpoint to emit forum post created event
 */
router.post(
  "/test/forum-post",
  verifyClerkToken,
  asyncHandler(async (req, res) => {
    const { societyId } = req.body;

    const mockPostData = {
      _id: "test_post_" + Date.now(),
      userId: req.userId,
      userName: "Test User",
      title: "Test Forum Post",
      content: "This is a test forum post to check real-time notifications.",
      forumName: "General Discussion",
      createdAt: new Date(),
    };

    emitForumPostCreated(societyId, mockPostData);

    res.json({
      success: true,
      message: "Test forum post event emitted",
      data: mockPostData,
    });
  })
);

/**
 * Test endpoint to emit system event
 */
router.post(
  "/test/system-event",
  verifyClerkToken,
  asyncHandler(async (req, res) => {
    const { societyId, title, message, severity } = req.body;

    emitSystemEvent(societyId, {
      title: title || "Test System Event",
      message: message || "This is a test system event notification.",
      severity: severity || "info",
      data: {
        testEvent: true,
        timestamp: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Test system event emitted",
    });
  })
);

/**
 * Test endpoint to emit dashboard update
 */
router.post(
  "/test/dashboard-update",
  verifyClerkToken,
  asyncHandler(async (req, res) => {
    const { societyId } = req.body;

    emitDashboardUpdate(societyId, {
      type: "stats",
      data: {
        totalUsers: Math.floor(Math.random() * 100) + 50,
        pendingPayments: Math.floor(Math.random() * 20) + 5,
        joinRequests: Math.floor(Math.random() * 10) + 2,
        activeAnnouncements: Math.floor(Math.random() * 5) + 1,
      },
    });

    res.json({
      success: true,
      message: "Test dashboard update emitted",
    });
  })
);

/**
 * Get WebSocket connection status
 */
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const { getIO } = require("../middleware/websocket");
    const io = getIO();

    const adminNamespace = io.of("/admin");
    const connectedAdmins = [];

    adminNamespace.sockets.forEach((socket) => {
      connectedAdmins.push({
        socketId: socket.id,
        adminId: socket.adminId,
        connected: socket.connected,
        rooms: Array.from(socket.rooms),
      });
    });

    res.json({
      success: true,
      websocketStatus: "active",
      connectedAdmins: connectedAdmins.length,
      adminConnections: connectedAdmins,
    });
  })
);

module.exports = router;
