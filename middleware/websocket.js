const { Server } = require("socket.io");
const { verifyClerkToken } = require("./auth");
const { logger } = require("./errorHandler");

let io = null;

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 */
function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  // Admin namespace for admin panel connections
  const adminNamespace = io.of("/admin");

  // Authentication middleware for admin namespace
  adminNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const adminId = socket.handshake.auth.adminId;

      if (!token || !adminId) {
        logger.error(
          "WebSocket authentication failed: Missing token or adminId"
        );
        return next(new Error("Authentication required"));
      }

      // Verify Clerk token directly using the SDK
      const { verifyToken } = require("@clerk/clerk-sdk-node");

      let payload;
      try {
        payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });
      } catch (clerkError) {
        logger.error("Clerk token verification failed:", clerkError.message);
        return next(new Error("Authentication failed"));
      }

      if (!payload || !payload.sub) {
        logger.error("Invalid token payload");
        return next(new Error("Invalid token"));
      }

      // Store user info in socket
      socket.userId = payload.sub;
      socket.adminId = adminId;

      logger.info(`Admin WebSocket connected: ${adminId}`, {
        socketId: socket.id,
        userId: payload.sub,
      });
      next();
    } catch (error) {
      logger.error("WebSocket authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  // Handle admin connections
  adminNamespace.on("connection", (socket) => {
    logger.info(`Admin ${socket.adminId} connected to WebSocket`, {
      socketId: socket.id,
    });

    // Join admin room for broadcasting
    socket.join("admins");

    // Store connection timestamp
    socket.connectedAt = new Date();

    // Emit admin session update
    const { emitAdminSessionUpdate } = require("./websocketEvents");
    emitAdminSessionUpdate(socket.adminId, {
      adminName: socket.adminId, // This would be the actual admin name in production
      sessionId: socket.id,
      connectedAt: socket.connectedAt,
      isActive: true,
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      logger.info(`Admin ${socket.adminId} disconnected: ${reason}`, {
        socketId: socket.id,
      });

      // Emit admin session update for disconnection
      emitAdminSessionUpdate(socket.adminId, {
        adminName: socket.adminId,
        sessionId: socket.id,
        connectedAt: socket.connectedAt,
        isActive: false,
      });
    });

    // Handle admin-specific events
    socket.on("join_society_room", (societyId) => {
      socket.join(`society_${societyId}`);
      socket.societyId = societyId;
      logger.info(`Admin ${socket.adminId} joined society room: ${societyId}`);
    });

    socket.on("leave_society_room", (societyId) => {
      socket.leave(`society_${societyId}`);
      logger.info(`Admin ${socket.adminId} left society room: ${societyId}`);
    });

    // Handle activity tracking
    socket.on("track_admin_activity", (data) => {
      const { emitUserActivityUpdate } = require("./websocketEvents");
      if (socket.societyId) {
        emitUserActivityUpdate(socket.societyId, {
          userId: socket.adminId,
          userName: socket.adminId, // This would be the actual admin name in production
          activity: data.activity,
          timestamp: data.timestamp,
        });
      }
    });

    // Handle request for activity data
    socket.on("request_activity_data", () => {
      // Send current admin sessions
      const adminSockets = adminNamespace.sockets;
      const activeSessions = [];

      for (const [socketId, adminSocket] of adminSockets) {
        if (adminSocket.adminId) {
          activeSessions.push({
            adminId: adminSocket.adminId,
            adminName: adminSocket.adminId,
            sessionId: socketId,
            connectedAt: adminSocket.connectedAt,
            isActive: adminSocket.connected,
          });
        }
      }

      socket.emit("admin_sessions_data", activeSessions);
    });

    // Handle request for admin sessions
    socket.on("request_admin_sessions", () => {
      const adminSockets = adminNamespace.sockets;
      const activeSessions = [];

      for (const [socketId, adminSocket] of adminSockets) {
        if (adminSocket.adminId) {
          activeSessions.push({
            adminId: adminSocket.adminId,
            adminName: adminSocket.adminId,
            sessionId: socketId,
            connectedAt: adminSocket.connectedAt,
            lastActivity: new Date(),
            isActive: adminSocket.connected,
            currentPage: adminSocket.currentPage,
          });
        }
      }

      socket.emit("admin_sessions_data", activeSessions);
    });

    // Handle admin page change
    socket.on("admin_page_change", (data) => {
      socket.currentPage = data.page;

      // Broadcast to other admins in the same society
      if (socket.societyId) {
        socket.to(`society_${socket.societyId}`).emit("admin_session_update", {
          adminId: socket.adminId,
          adminName: socket.adminId,
          sessionId: socket.id,
          connectedAt: socket.connectedAt,
          timestamp: new Date(),
          isActive: true,
          currentPage: data.page,
        });
      }
    });

    // Handle admin action performed
    socket.on("admin_action_performed", (data) => {
      const { emitAdminSessionSync } = require("./websocketEvents");

      if (socket.societyId) {
        emitAdminSessionSync(socket.societyId, {
          type: "action_performed",
          adminId: socket.adminId,
          adminName: socket.adminId,
          data: {
            action: data.action,
            ...data.data,
          },
        });
      }
    });

    // Handle request for dashboard metrics
    socket.on("request_dashboard_metrics", () => {
      // In a real implementation, this would fetch actual metrics from the database
      const mockMetrics = {
        total_users: Math.floor(Math.random() * 50) + 200,
        pending_payments: Math.floor(Math.random() * 20) + 5,
        join_requests: Math.floor(Math.random() * 10) + 2,
        active_announcements: Math.floor(Math.random() * 5) + 1,
      };

      socket.emit("dashboard_update", {
        updateType: "stats",
        data: mockMetrics,
        timestamp: new Date(),
      });
    });

    // Send welcome message
    socket.emit("connected", {
      message: "Connected to admin WebSocket",
      timestamp: new Date().toISOString(),
    });
  });

  // Main namespace for mobile app connections (if needed)
  io.on("connection", (socket) => {
    logger.info("Client connected to main namespace", { socketId: socket.id });

    socket.on("disconnect", (reason) => {
      logger.info(`Client disconnected: ${reason}`, { socketId: socket.id });
    });
  });

  logger.info("WebSocket server initialized");
  return io;
}

/**
 * Get Socket.io instance
 * @returns {Server} Socket.io server instance
 */
function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}

/**
 * Emit event to all admins
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function emitToAdmins(event, data) {
  if (io) {
    io.of("/admin")
      .to("admins")
      .emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    logger.info(`Emitted ${event} to all admins`, { data });
  }
}

/**
 * Emit event to admins of a specific society
 * @param {string} societyId - Society ID
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function emitToSocietyAdmins(societyId, event, data) {
  if (io) {
    io.of("/admin")
      .to(`society_${societyId}`)
      .emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    logger.info(`Emitted ${event} to society ${societyId} admins`, { data });
  }
}

/**
 * Emit event to specific admin
 * @param {string} adminId - Admin ID
 * @param {string} event - Event name
 * @param {any} data - Event data
 */
function emitToAdmin(adminId, event, data) {
  if (io) {
    // Find socket by adminId
    const adminSockets = io.of("/admin").sockets;
    for (const [socketId, socket] of adminSockets) {
      if (socket.adminId === adminId) {
        socket.emit(event, {
          ...data,
          timestamp: new Date().toISOString(),
        });
        logger.info(`Emitted ${event} to admin ${adminId}`, { data });
        break;
      }
    }
  }
}

module.exports = {
  initializeWebSocket,
  getIO,
  emitToAdmins,
  emitToSocietyAdmins,
  emitToAdmin,
};
