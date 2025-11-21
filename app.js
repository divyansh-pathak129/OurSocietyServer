const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const path = require("path");
require("dotenv").config();

const dbConnection = require("./config/database");
const {
  errorHandler,
  notFoundHandler,
  requestId,
  asyncHandler,
  logger,
} = require("./middleware/errorHandler");
const {
  helmetConfig,
  developmentRateLimit,
  sanitizeRequest,
} = require("./middleware/security");
const { initializeWebSocket } = require("./middleware/websocket");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Security middleware
app.use(helmetConfig);
app.use(developmentRateLimit);

// Request logging
app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// Request ID middleware
app.use(requestId);

// CORS middleware (should be before all routes)
const corsOptions = {
  origin: process.env.NODE_ENV === "production" 
    ? [
        "http://localhost:8080", // Frontend dev server
        "http://localhost:8081", // Mobile app dev server
        "http://localhost:3000", // Alternative frontend port
        "http://localhost:3002", // Admin panel
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3002",
      ]
    : true, // Allow all origins in development
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
    "ngrok-skip-browser-warning", // Allow ngrok skip header
  ],
  exposedHeaders: ["Content-Length", "X-Request-ID"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Additional CORS debugging middleware
app.use((req, res, next) => {
  console.log(`🌐 CORS Request: ${req.method} ${req.url} from origin: ${req.headers.origin}`);
  next();
});

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request sanitization
app.use(sanitizeRequest);

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const isDbHealthy = dbConnection.isHealthy();
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      database: isDbHealthy ? "Connected" : "Disconnected",
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
const userRoutes = require("./routes/users");
const societyRoutes = require("./routes/societies");
const maintenanceRoutes = require("./routes/maintenance");
const forumRoutes = require("./routes/forum");
const contactRoutes = require("./routes/contacts");
const websocketTestRoutes = require("./routes/websocket-test");
const adminRoutes = require("./routes/admin");
const joinRequestRoutes = require("./routes/joinRequests");
const adminMaintenanceRoutes = require("./routes/admin/maintenance");
const eventRoutes = require("./routes/events");
const adminEventRoutes = require("./routes/admin/events");
const uploadthingRoutes = require("./routes/uploadthing");

app.use("/api/users", userRoutes);
app.use("/api/societies", societyRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/websocket", websocketTestRoutes);
app.use("/api/join-requests", joinRequestRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/maintenance", adminMaintenanceRoutes);
app.use("/api/admin/events", adminEventRoutes);
app.use("/api/uploadthing", uploadthingRoutes);

// API endpoint to serve maintenance images with proper CORS
app.get("/api/maintenance/image/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", "maintenance", filename);
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Content-Type', 'image/jpeg');
  
  // Check if file exists
  if (!require('fs').existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Serve the file
  res.sendFile(filePath);
});

// Static file hosting for uploaded assets
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Basic route
app.get("/", (req, res) => {
  res.json({
    message: "OurSociety API Server",
    version: "1.0.0",
    status: "Running",
    endpoints: {
      users: "/api/users",
      health: "/health",
    },
  });
});

// 404 handler - must come before error handler
app.use(notFoundHandler);

// Global error handling middleware - must be last
app.use(errorHandler);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT. Graceful shutdown...");
  await dbConnection.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM. Graceful shutdown...");
  await dbConnection.disconnect();
  process.exit(0);
});

// Start server and connect to database
async function startServer() {
  try {
    // Connect to database first
    await dbConnection.connect();

    // Initialize WebSocket server
    initializeWebSocket(server);

    // Start the server
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📱 Mobile access: http://192.168.1.4:${PORT}`);
      console.log(`🔌 WebSocket server initialized`);
      console.log(
        `📊 Health check available at http://localhost:${PORT}/health`
      );
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

// Only start server if not in test environment
if (process.env.NODE_ENV !== "test") {
  startServer();
}

// Export app and server for testing
module.exports = { app, server };
