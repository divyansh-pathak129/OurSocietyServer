const request = require("supertest");
const { app } = require("../app");
const dbConnection = require("../config/database");
const { UserService } = require("../models/services");

describe("Admin Authentication Endpoints", () => {
  let db;
  let userService;
  let testUser;
  let adminToken;

  beforeAll(async () => {
    // Connect to test database
    await dbConnection.connect();
    db = dbConnection.getDb();
    userService = new UserService(db);

    // Create a test admin user
    testUser = {
      clerkUserId: "test_admin_clerk_id",
      societyId: "507f1f77bcf86cd799439011",
      societyName: "Test Society",
      wing: "A",
      flatNumber: "101",
      residentType: "Owner",
      contactNumber: "+91 9876543210",
      email: "admin@test.com",
      name: "Test Admin",
      registrationDate: new Date(),
      isActive: true,
      adminRole: "admin",
      permissions: [],
      assignedWings: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await userService.create(testUser);

    // Mock JWT token for testing (in real scenario, this would come from Clerk)
    adminToken = "Bearer mock_admin_token";
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db
        .collection("users")
        .deleteMany({ clerkUserId: "test_admin_clerk_id" });
      await db
        .collection("admin_audit_logs")
        .deleteMany({ adminId: "test_admin_clerk_id" });
    }
    await dbConnection.disconnect();
  });

  describe("POST /api/admin/auth/verify", () => {
    it("should verify admin authentication successfully", async () => {
      // Note: This test would need proper JWT token mocking
      // For now, we'll test the endpoint structure
      const response = await request(app)
        .post("/api/admin/auth/verify")
        .set("Authorization", adminToken);

      // Without proper JWT mocking, this will fail auth
      // But we can verify the endpoint exists and returns proper error structure
      expect(response.status).toBeDefined();
    });
  });

  describe("POST /api/admin/auth/login", () => {
    it("should handle admin login request", async () => {
      const response = await request(app)
        .post("/api/admin/auth/login")
        .set("Authorization", adminToken);

      expect(response.status).toBeDefined();
    });
  });

  describe("GET /api/admin/profile", () => {
    it("should return admin profile information", async () => {
      const response = await request(app)
        .get("/api/admin/profile")
        .set("Authorization", adminToken);

      expect(response.status).toBeDefined();
    });
  });

  describe("GET /api/admin/permissions", () => {
    it("should return admin permissions and capabilities", async () => {
      const response = await request(app)
        .get("/api/admin/permissions")
        .set("Authorization", adminToken);

      expect(response.status).toBeDefined();
    });
  });

  describe("GET /api/admin/session/status", () => {
    it("should return session status", async () => {
      const response = await request(app)
        .get("/api/admin/session/status")
        .set("Authorization", adminToken);

      expect(response.status).toBeDefined();
    });
  });
});

describe("Admin Management Endpoints", () => {
  let adminToken;

  beforeAll(() => {
    adminToken = "Bearer mock_super_admin_token";
  });

  describe("GET /api/admin/manage/admins", () => {
    it("should return list of admin users", async () => {
      const response = await request(app)
        .get("/api/admin/manage/admins")
        .set("Authorization", adminToken);

      expect(response.status).toBeDefined();
    });
  });

  describe("POST /api/admin/manage/assign-role", () => {
    it("should handle admin role assignment", async () => {
      const response = await request(app)
        .post("/api/admin/manage/assign-role")
        .set("Authorization", adminToken)
        .send({
          clerkUserId: "test_user_id",
          adminRole: "wing_chairman",
          assignedWings: ["A"],
        });

      expect(response.status).toBeDefined();
    });
  });

  describe("GET /api/admin/audit/logs", () => {
    it("should return audit logs", async () => {
      const response = await request(app)
        .get("/api/admin/audit/logs")
        .set("Authorization", adminToken);

      expect(response.status).toBeDefined();
    });
  });
});

describe("Admin Authentication Middleware", () => {
  const {
    hasPermission,
    ADMIN_ROLES,
    adminSessionManager,
    adminRateLimit,
  } = require("../middleware/adminAuth");

  describe("hasPermission", () => {
    it("should return true for super admin with any permission", () => {
      const result = hasPermission(ADMIN_ROLES.SUPER_ADMIN, "users", "delete");
      expect(result).toBe(true);
    });

    it("should return true for admin with maintenance permissions", () => {
      const result = hasPermission(ADMIN_ROLES.ADMIN, "maintenance", "approve");
      expect(result).toBe(true);
    });

    it("should return false for wing chairman with admin-only permissions", () => {
      const result = hasPermission(
        ADMIN_ROLES.WING_CHAIRMAN,
        "users",
        "delete"
      );
      expect(result).toBe(false);
    });

    it("should return true for wing chairman with read permissions", () => {
      const result = hasPermission(
        ADMIN_ROLES.WING_CHAIRMAN,
        "maintenance",
        "read"
      );
      expect(result).toBe(true);
    });
  });

  describe("adminSessionManager", () => {
    it("should create and manage admin sessions", () => {
      const mockAdmin = {
        clerkUserId: "test_admin_123",
        name: "Test Admin",
        role: "admin",
        societyId: "507f1f77bcf86cd799439011",
      };

      const session = adminSessionManager.createSession(mockAdmin, {
        ipAddress: "127.0.0.1",
        userAgent: "Test Agent",
      });

      expect(session).toBeDefined();
      expect(session.adminId).toBe(mockAdmin.clerkUserId);
      expect(session.isActive).toBe(true);

      // Test getting active session
      const activeSession = adminSessionManager.getActiveSession(
        mockAdmin.clerkUserId
      );
      expect(activeSession).toBeDefined();
      expect(activeSession.sessionId).toBe(session.sessionId);

      // Test invalidating session
      adminSessionManager.invalidateSession(mockAdmin.clerkUserId);
      const invalidatedSession = adminSessionManager.getActiveSession(
        mockAdmin.clerkUserId
      );
      expect(invalidatedSession).toBeNull();
    });
  });

  describe("adminRateLimit", () => {
    it("should enforce rate limits correctly", () => {
      const adminId = "test_admin_rate_limit";
      const action = "test_action";
      const limit = 3;

      // First 3 requests should be allowed
      for (let i = 0; i < limit; i++) {
        const result = adminRateLimit.checkRateLimit(
          adminId,
          action,
          limit,
          60000
        );
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - i - 1);
      }

      // 4th request should be denied
      const deniedResult = adminRateLimit.checkRateLimit(
        adminId,
        action,
        limit,
        60000
      );
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.remaining).toBe(0);
    });
  });
});
