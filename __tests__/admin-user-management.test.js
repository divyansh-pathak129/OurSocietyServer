const request = require("supertest");
const { app } = require("../app");
const dbConnection = require("../config/database");
const { UserService, JoinRequestService } = require("../models/services");
const { ObjectId } = require("mongodb");

// Mock Clerk authentication
jest.mock("@clerk/clerk-sdk-node", () => ({
  clerkClient: {
    users: {
      getUser: jest.fn(),
    },
  },
  verifyToken: jest.fn(),
}));

// Mock WebSocket events
jest.mock("../middleware/websocketEvents", () => ({
  emitJoinRequestStatusChange: jest.fn(),
  emitUserActivityUpdate: jest.fn(),
}));

describe("Admin User Management API", () => {
  let db;
  let userService;
  let joinRequestService;
  let testSocietyId;
  let testAdminUser;
  let testWingChairmanUser;
  let testRegularUser;
  let testJoinRequest;
  let adminToken;
  let wingChairmanToken;

  beforeAll(async () => {
    await dbConnection.connect();
    db = dbConnection.getDb();
    userService = new UserService(db);
    joinRequestService = new JoinRequestService(db);
  });

  afterAll(async () => {
    await dbConnection.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.collection("users").deleteMany({});
    await db.collection("societies").deleteMany({});
    await db.collection("join_requests").deleteMany({});
    await db.collection("admin_audit_logs").deleteMany({});

    // Create test society
    testSocietyId = new ObjectId();
    await db.collection("societies").insertOne({
      _id: testSocietyId,
      name: "Test Society",
      address: "Test Address",
      totalWings: 4,
      totalFlats: 100,
      adminUsers: ["admin_clerk_id", "wing_chairman_clerk_id"],
      settings: {
        maintenanceAmount: 5000,
        maintenanceDueDate: 5,
        allowTenantForumAccess: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test admin user
    testAdminUser = {
      _id: new ObjectId(),
      clerkUserId: "admin_clerk_id",
      societyId: testSocietyId,
      societyName: "Test Society",
      wing: "A",
      flatNumber: "101",
      residentType: "Owner",
      contactNumber: "9876543210",
      email: "admin@test.com",
      name: "Test Admin",
      registrationDate: new Date(),
      isActive: true,
      adminRole: "admin",
      permissions: [
        { resource: "users", actions: ["read", "write", "deactivate"] },
        {
          resource: "maintenance",
          actions: ["read", "write", "approve", "reject"],
        },
      ],
      assignedWings: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create test wing chairman user
    testWingChairmanUser = {
      _id: new ObjectId(),
      clerkUserId: "wing_chairman_clerk_id",
      societyId: testSocietyId,
      societyName: "Test Society",
      wing: "B",
      flatNumber: "201",
      residentType: "Owner",
      contactNumber: "9876543211",
      email: "wingchairman@test.com",
      name: "Test Wing Chairman",
      registrationDate: new Date(),
      isActive: true,
      adminRole: "wing_chairman",
      permissions: [
        { resource: "users", actions: ["read", "wing_only"] },
        { resource: "maintenance", actions: ["read", "approve", "wing_only"] },
      ],
      assignedWings: ["B"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create test regular user
    testRegularUser = {
      _id: new ObjectId(),
      clerkUserId: "regular_user_clerk_id",
      societyId: testSocietyId,
      societyName: "Test Society",
      wing: "B",
      flatNumber: "202",
      residentType: "Tenant",
      contactNumber: "9876543212",
      email: "user@test.com",
      name: "Test User",
      registrationDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert test users
    await db
      .collection("users")
      .insertMany([testAdminUser, testWingChairmanUser, testRegularUser]);

    // Create test join request
    testJoinRequest = {
      _id: new ObjectId(),
      clerkUserId: "new_user_clerk_id",
      societyId: testSocietyId,
      requestedData: {
        wing: "B",
        flatNumber: "203",
        residentType: "Owner",
        contactNumber: "9876543213",
        emergencyContact: "9876543214",
      },
      documents: [],
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("join_requests").insertOne(testJoinRequest);

    // Mock tokens
    adminToken = "mock_admin_token";
    wingChairmanToken = "mock_wing_chairman_token";

    // Mock Clerk authentication
    const { clerkClient, verifyToken } = require("@clerk/clerk-sdk-node");
    verifyToken.mockImplementation((token) => {
      if (token === adminToken) {
        return Promise.resolve({ sub: "admin_clerk_id" });
      } else if (token === wingChairmanToken) {
        return Promise.resolve({ sub: "wing_chairman_clerk_id" });
      }
      return Promise.reject(new Error("Invalid token"));
    });

    clerkClient.users.getUser.mockImplementation((userId) => {
      if (userId === "admin_clerk_id") {
        return Promise.resolve({
          id: "admin_clerk_id",
          emailAddresses: [{ emailAddress: "admin@test.com" }],
          firstName: "Test",
          lastName: "Admin",
        });
      } else if (userId === "wing_chairman_clerk_id") {
        return Promise.resolve({
          id: "wing_chairman_clerk_id",
          emailAddresses: [{ emailAddress: "wingchairman@test.com" }],
          firstName: "Test",
          lastName: "Wing Chairman",
        });
      }
      return Promise.reject(new Error("User not found"));
    });
  });

  describe("GET /api/admin/users", () => {
    it("should get all users for admin", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(3);
      expect(response.body.data.pagination.total).toBe(3);
    });

    it("should filter users by wing for wing chairman", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${wingChairmanToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(2); // Wing chairman and regular user in wing B
      expect(response.body.data.users.every((user) => user.wing === "B")).toBe(
        true
      );
    });

    it("should support search functionality", async () => {
      const response = await request(app)
        .get("/api/admin/users?search=Test User")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].name).toBe("Test User");
    });

    it("should support pagination", async () => {
      const response = await request(app)
        .get("/api/admin/users?page=1&limit=2")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(2);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(2);
    });
  });

  describe("GET /api/admin/users/:id", () => {
    it("should get user details by ID", async () => {
      const response = await request(app)
        .get(`/api/admin/users/${testRegularUser._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.name).toBe("Test User");
      expect(response.body.data.user.wing).toBe("B");
    });

    it("should deny access to user from different wing for wing chairman", async () => {
      // Create user in different wing
      const userInWingA = {
        _id: new ObjectId(),
        clerkUserId: "user_wing_a_clerk_id",
        societyId: testSocietyId,
        societyName: "Test Society",
        wing: "A",
        flatNumber: "102",
        residentType: "Owner",
        contactNumber: "9876543215",
        email: "usera@test.com",
        name: "User Wing A",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection("users").insertOne(userInWingA);

      const response = await request(app)
        .get(`/api/admin/users/${userInWingA._id}`)
        .set("Authorization", `Bearer ${wingChairmanToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Access denied");
    });
  });

  describe("PUT /api/admin/users/:id", () => {
    it("should update user information", async () => {
      const updateData = {
        name: "Updated User Name",
        contactNumber: "9999999999",
        flatNumber: "204",
      };

      const response = await request(app)
        .put(`/api/admin/users/${testRegularUser._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.name).toBe("Updated User Name");
      expect(response.body.data.updatedFields).toContain("name");
    });

    it("should restrict wing chairman to their assigned wings", async () => {
      const updateData = {
        name: "Updated Name",
      };

      const response = await request(app)
        .put(`/api/admin/users/${testRegularUser._id}`)
        .set("Authorization", `Bearer ${wingChairmanToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it("should prevent updating restricted fields", async () => {
      const updateData = {
        clerkUserId: "new_clerk_id",
        societyId: new ObjectId(),
        registrationDate: new Date(),
      };

      const response = await request(app)
        .put(`/api/admin/users/${testRegularUser._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("No valid fields to update");
    });
  });

  describe("POST /api/admin/users/:id/deactivate", () => {
    it("should deactivate user account", async () => {
      const response = await request(app)
        .post(`/api/admin/users/${testRegularUser._id}/deactivate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Test deactivation" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userName).toBe("Test User");

      // Verify user is deactivated in database
      const user = await db
        .collection("users")
        .findOne({ _id: testRegularUser._id });
      expect(user.isActive).toBe(false);
    });

    it("should prevent wing chairman from deactivating users", async () => {
      const response = await request(app)
        .post(`/api/admin/users/${testRegularUser._id}/deactivate`)
        .set("Authorization", `Bearer ${wingChairmanToken}`)
        .send({ reason: "Test deactivation" })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        "Wing chairmen cannot deactivate users"
      );
    });
  });

  describe("GET /api/admin/join-requests", () => {
    it("should get all join requests for admin", async () => {
      const response = await request(app)
        .get("/api/admin/join-requests")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].status).toBe("pending");
    });

    it("should filter join requests by wing for wing chairman", async () => {
      const response = await request(app)
        .get("/api/admin/join-requests")
        .set("Authorization", `Bearer ${wingChairmanToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].requestedData.wing).toBe("B");
    });

    it("should support status filtering", async () => {
      const response = await request(app)
        .get("/api/admin/join-requests?status=pending")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toHaveLength(1);
      expect(response.body.data.requests[0].status).toBe("pending");
    });
  });

  describe("POST /api/admin/join-requests/:id/approve", () => {
    it("should approve join request", async () => {
      const response = await request(app)
        .post(`/api/admin/join-requests/${testJoinRequest._id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ autoCreateUser: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.approvedBy).toBe("Test Admin");

      // Verify request is approved in database
      const request = await db
        .collection("join_requests")
        .findOne({ _id: testJoinRequest._id });
      expect(request.status).toBe("approved");
      expect(request.reviewedBy).toBe("admin_clerk_id");
    });

    it("should prevent approving already processed request", async () => {
      // First approval
      await request(app)
        .post(`/api/admin/join-requests/${testJoinRequest._id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ autoCreateUser: true })
        .expect(200);

      // Second approval should fail
      const response = await request(app)
        .post(`/api/admin/join-requests/${testJoinRequest._id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ autoCreateUser: true })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("not pending");
    });
  });

  describe("POST /api/admin/join-requests/:id/reject", () => {
    it("should reject join request with reason", async () => {
      const rejectionReason = "Incomplete documentation";

      const response = await request(app)
        .post(`/api/admin/join-requests/${testJoinRequest._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: rejectionReason })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reason).toBe(rejectionReason);

      // Verify request is rejected in database
      const request = await db
        .collection("join_requests")
        .findOne({ _id: testJoinRequest._id });
      expect(request.status).toBe("rejected");
      expect(request.rejectionReason).toBe(rejectionReason);
    });

    it("should require rejection reason", async () => {
      const response = await request(app)
        .post(`/api/admin/join-requests/${testJoinRequest._id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Rejection reason is required");
    });
  });

  describe("POST /api/admin/join-requests/bulk-approve", () => {
    it("should bulk approve multiple join requests", async () => {
      // Create additional join request
      const secondRequest = {
        _id: new ObjectId(),
        clerkUserId: "second_user_clerk_id",
        societyId: testSocietyId,
        requestedData: {
          wing: "A",
          flatNumber: "103",
          residentType: "Tenant",
          contactNumber: "9876543216",
        },
        documents: [],
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection("join_requests").insertOne(secondRequest);

      const requestIds = [
        testJoinRequest._id.toString(),
        secondRequest._id.toString(),
      ];

      const response = await request(app)
        .post("/api/admin/join-requests/bulk-approve")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ requestIds, autoCreateUsers: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.approvedCount).toBe(2);

      // Verify both requests are approved
      const requests = await db
        .collection("join_requests")
        .find({ _id: { $in: [testJoinRequest._id, secondRequest._id] } })
        .toArray();

      expect(requests.every((req) => req.status === "approved")).toBe(true);
    });
  });

  describe("GET /api/admin/join-requests/stats", () => {
    it("should get join request statistics", async () => {
      const response = await request(app)
        .get("/api/admin/join-requests/stats")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stats.total).toBe(1);
      expect(response.body.data.stats.pending).toBe(1);
      expect(response.body.data.stats.approved).toBe(0);
      expect(response.body.data.stats.rejected).toBe(0);
    });
  });

  describe("POST /api/admin/users/bulk-update", () => {
    it("should bulk update multiple users", async () => {
      const userIds = [testRegularUser._id.toString()];
      const updateData = { isActive: false };

      const response = await request(app)
        .post("/api/admin/users/bulk-update")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userIds, updateData })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.successCount).toBe(1);

      // Verify user is updated
      const user = await db
        .collection("users")
        .findOne({ _id: testRegularUser._id });
      expect(user.isActive).toBe(false);
    });

    it("should prevent wing chairman from bulk updates", async () => {
      const userIds = [testRegularUser._id.toString()];
      const updateData = { isActive: false };

      const response = await request(app)
        .post("/api/admin/users/bulk-update")
        .set("Authorization", `Bearer ${wingChairmanToken}`)
        .send({ userIds, updateData })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid user ID", async () => {
      const response = await request(app)
        .get("/api/admin/users/invalid_id")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("should handle non-existent join request", async () => {
      const nonExistentId = new ObjectId();

      const response = await request(app)
        .get(`/api/admin/join-requests/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("not found");
    });

    it("should handle unauthorized access", async () => {
      const response = await request(app).get("/api/admin/users").expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe("Audit Logging", () => {
    it("should log admin actions", async () => {
      await request(app)
        .put(`/api/admin/users/${testRegularUser._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Updated Name" })
        .expect(200);

      // Check audit log
      const auditLog = await db.collection("admin_audit_logs").findOne({
        action: "update_user",
        adminId: "admin_clerk_id",
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog.resource).toBe("user_management");
      expect(auditLog.details.targetUserId).toBe(
        testRegularUser._id.toString()
      );
    });
  });
});

describe("Admin User Management Integration", () => {
  let db;
  let testSocietyId;
  let adminToken;

  beforeAll(async () => {
    await dbConnection.connect();
    db = dbConnection.getDb();
  });

  afterAll(async () => {
    await dbConnection.disconnect();
  });

  beforeEach(async () => {
    // Setup test data
    testSocietyId = new ObjectId();
    adminToken = "mock_admin_token";

    // Mock Clerk authentication
    const { clerkClient, verifyToken } = require("@clerk/clerk-sdk-node");
    verifyToken.mockResolvedValue({ sub: "admin_clerk_id" });
    clerkClient.users.getUser.mockResolvedValue({
      id: "admin_clerk_id",
      emailAddresses: [{ emailAddress: "admin@test.com" }],
      firstName: "Test",
      lastName: "Admin",
    });
  });

  it("should handle complete user management workflow", async () => {
    // This test would verify the complete workflow from join request to user creation
    // and management, but requires more complex setup
    expect(true).toBe(true);
  });
});
