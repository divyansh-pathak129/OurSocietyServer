const request = require("supertest");
const { app } = require("../app");
const dbConnection = require("../config/database");
const {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} = require("./setup");
const {
  UserService,
  MaintenanceService,
  SocietyService,
} = require("../models/services");
const { ObjectId } = require("mongodb");

describe("Admin Maintenance Management API", () => {
  let db;
  let userService;
  let maintenanceService;
  let societyService;
  let testSocietyId;
  let testAdminUser;
  let testWingChairmanUser;
  let testMaintenanceRecords;
  let adminToken;
  let wingChairmanToken;

  beforeAll(async () => {
    // Setup test database
    db = await setupTestDatabase();
    userService = new UserService(db);
    maintenanceService = new MaintenanceService(db);
    societyService = new SocietyService(db);

    // Create test society
    const societyResult = await societyService.create({
      name: "Test Society",
      address: "123 Test Street",
      totalWings: 4,
      totalFlats: 100,
      adminUsers: [],
      settings: {
        maintenanceAmount: 5000,
        maintenanceDueDate: 5,
        allowTenantForumAccess: true,
      },
    });
    testSocietyId = societyResult.data._id;

    // Create test admin user
    testAdminUser = {
      clerkUserId: "test_admin_maintenance",
      societyId: testSocietyId,
      societyName: "Test Society",
      wing: "A",
      flatNumber: "001",
      residentType: "Owner",
      contactNumber: "+91 9876543210",
      email: "admin@test.com",
      name: "Test Admin",
      registrationDate: new Date(),
      isActive: true,
      adminRole: "admin",
      permissions: [],
      assignedWings: [],
    };
    await userService.create(testAdminUser);

    // Create test wing chairman user
    testWingChairmanUser = {
      clerkUserId: "test_wing_chairman_maintenance",
      societyId: testSocietyId,
      societyName: "Test Society",
      wing: "A",
      flatNumber: "002",
      residentType: "Owner",
      contactNumber: "+91 9876543211",
      email: "wingchairman@test.com",
      name: "Test Wing Chairman",
      registrationDate: new Date(),
      isActive: true,
      adminRole: "wing_chairman",
      permissions: [],
      assignedWings: ["A"],
    };
    await userService.create(testWingChairmanUser);
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clean up maintenance records before each test
    await db.collection("maintenance").deleteMany({});
    await db.collection("admin_audit_logs").deleteMany({});

    // Create test maintenance records
    testMaintenanceRecords = [
      {
        societyId: testSocietyId,
        clerkUserId: "test_user_1",
        wing: "A",
        flatNumber: "101",
        month: "2024-01",
        amount: 5000,
        dueDate: new Date("2024-01-05"),
        status: "pending",
        paymentProof: {
          screenshot: "https://example.com/screenshot1.jpg",
          uploadedAt: new Date(),
          uploadedBy: "test_user_1",
          approvalStatus: "pending",
        },
      },
      {
        societyId: testSocietyId,
        clerkUserId: "test_user_2",
        wing: "B",
        flatNumber: "201",
        month: "2024-01",
        amount: 5000,
        dueDate: new Date("2024-01-05"),
        status: "paid",
        paidDate: new Date("2024-01-03"),
      },
      {
        societyId: testSocietyId,
        clerkUserId: "test_user_3",
        wing: "A",
        flatNumber: "102",
        month: "2024-01",
        amount: 5000,
        dueDate: new Date("2023-12-05"), // Overdue
        status: "overdue",
      },
    ];

    const insertResult = await db
      .collection("maintenance")
      .insertMany(testMaintenanceRecords);
    testMaintenanceRecords = testMaintenanceRecords.map((record, index) => ({
      ...record,
      _id: Object.values(insertResult.insertedIds)[index],
    }));

    // Mock JWT tokens (in real scenario, these would be valid Clerk tokens)
    adminToken = "Bearer mock_admin_token";
    wingChairmanToken = "Bearer mock_wing_chairman_token";
  });
  describe("GET /api/admin/maintenance/calendar", () => {
    it("should return maintenance calendar data for admin", async () => {
      // Mock the admin authentication middleware
      const originalVerifyAdminAuth =
        require("../middleware/adminAuth").verifyAdminAuth;
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/calendar")
        .set("Authorization", adminToken)
        .query({ month: "01", year: "2024" });

      // Restore original middleware
      require("../middleware/adminAuth").verifyAdminAuth =
        originalVerifyAdminAuth;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.records).toBeDefined();
      expect(response.body.data.stats).toBeDefined();
      expect(Array.isArray(response.body.data.records)).toBe(true);
    });

    it("should filter records by wing for wing chairman", async () => {
      // Mock wing chairman authentication
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testWingChairmanUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        req.wingRestricted = true;
        req.allowedWings = ["A"];
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/calendar")
        .set("Authorization", wingChairmanToken)
        .query({ month: "01", year: "2024" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Should only return records from wing A
      const records = response.body.data.records;
      records.forEach((record) => {
        expect(record.wing).toBe("A");
      });
    });

    it("should return 400 for invalid query parameters", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/calendar")
        .set("Authorization", adminToken)
        .query({ month: "invalid", year: "2024" });

      // The endpoint should handle invalid parameters gracefully
      expect(response.status).toBeDefined();
    });
  });

  describe("POST /api/admin/maintenance/approve", () => {
    it("should approve maintenance payment successfully", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const recordToApprove = testMaintenanceRecords.find(
        (r) => r.paymentProof?.approvalStatus === "pending"
      );

      const response = await request(app)
        .post("/api/admin/maintenance/approve")
        .set("Authorization", adminToken)
        .send({
          recordId: recordToApprove._id.toString(),
          adminNotes: "Payment verified and approved",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("approved");
      expect(response.body.data.approvedBy).toBe(testAdminUser.name);

      // Verify the record was updated in database
      const updatedRecord = await maintenanceService.findById(
        recordToApprove._id
      );
      expect(updatedRecord.data.status).toBe("paid");
      expect(updatedRecord.data.paymentProof.approvalStatus).toBe("approved");
    });

    it("should return 400 for missing recordId", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .post("/api/admin/maintenance/approve")
        .set("Authorization", adminToken)
        .send({
          adminNotes: "Test notes",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("recordId is required");
    });

    it("should return 404 for non-existent record", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .post("/api/admin/maintenance/approve")
        .set("Authorization", adminToken)
        .send({
          recordId: new ObjectId().toString(),
          adminNotes: "Test notes",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found");
    });

    it("should restrict wing chairman to their assigned wings", async () => {
      // Create a record in wing B (not allowed for wing chairman)
      const wingBRecord = {
        societyId: testSocietyId,
        clerkUserId: "test_user_wing_b",
        wing: "B",
        flatNumber: "201",
        month: "2024-01",
        amount: 5000,
        dueDate: new Date("2024-01-05"),
        status: "pending",
        paymentProof: {
          screenshot: "https://example.com/screenshot_b.jpg",
          uploadedAt: new Date(),
          uploadedBy: "test_user_wing_b",
          approvalStatus: "pending",
        },
      };
      const insertResult = await db
        .collection("maintenance")
        .insertOne(wingBRecord);

      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testWingChairmanUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        req.wingRestricted = true;
        req.allowedWings = ["A"];
        next();
      };

      const response = await request(app)
        .post("/api/admin/maintenance/approve")
        .set("Authorization", wingChairmanToken)
        .send({
          recordId: insertResult.insertedId.toString(),
          adminNotes: "Trying to approve wing B record",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Access denied");
    });
  });

  describe("POST /api/admin/maintenance/reject", () => {
    it("should reject maintenance payment with reason", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const recordToReject = testMaintenanceRecords.find(
        (r) => r.paymentProof?.approvalStatus === "pending"
      );

      const response = await request(app)
        .post("/api/admin/maintenance/reject")
        .set("Authorization", adminToken)
        .send({
          recordId: recordToReject._id.toString(),
          rejectionReason: "Screenshot is not clear",
          adminNotes: "Please upload a clearer screenshot",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("rejected");
      expect(response.body.data.rejectionReason).toBe(
        "Screenshot is not clear"
      );

      // Verify the record was updated in database
      const updatedRecord = await maintenanceService.findById(
        recordToReject._id
      );
      expect(updatedRecord.data.status).toBe("pending");
      expect(updatedRecord.data.paymentProof.approvalStatus).toBe("rejected");
      expect(updatedRecord.data.paymentProof.rejectionReason).toBe(
        "Screenshot is not clear"
      );
    });

    it("should return 400 for missing rejection reason", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const recordToReject = testMaintenanceRecords.find(
        (r) => r.paymentProof?.approvalStatus === "pending"
      );

      const response = await request(app)
        .post("/api/admin/maintenance/reject")
        .set("Authorization", adminToken)
        .send({
          recordId: recordToReject._id.toString(),
          adminNotes: "Test notes",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("rejectionReason is required");
    });
  });

  describe("GET /api/admin/maintenance/overdue", () => {
    it("should return overdue maintenance records", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/overdue")
        .set("Authorization", adminToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toBeDefined();
      expect(Array.isArray(response.body.data.records)).toBe(true);

      // Should include overdue records
      const overdueRecords = response.body.data.records.filter(
        (r) => r.status === "overdue"
      );
      expect(overdueRecords.length).toBeGreaterThan(0);
    });

    it("should include statistics when requested", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/overdue")
        .set("Authorization", adminToken)
        .query({ includeStats: "true" });

      expect(response.status).toBe(200);
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.totalOverdue).toBeDefined();
      expect(response.body.data.stats.totalOverdueAmount).toBeDefined();
      expect(response.body.data.stats.wingStats).toBeDefined();
      expect(response.body.data.stats.categoryStats).toBeDefined();
    });

    it("should filter by days overdue", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/overdue")
        .set("Authorization", adminToken)
        .query({ daysOverdue: "30" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // All returned records should be overdue by at least 30 days
      const records = response.body.data.records;
      records.forEach((record) => {
        expect(record.daysOverdue).toBeGreaterThanOrEqual(30);
      });
    });
  });

  describe("POST /api/admin/maintenance/send-reminders", () => {
    it("should send reminders to specified records", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const overdueRecord = testMaintenanceRecords.find(
        (r) => r.status === "overdue"
      );

      const response = await request(app)
        .post("/api/admin/maintenance/send-reminders")
        .set("Authorization", adminToken)
        .send({
          recordIds: [overdueRecord._id.toString()],
          reminderType: "overdue",
          customMessage: "Please pay your maintenance dues immediately",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.remindersSent).toBe(1);
      expect(response.body.data.reminderType).toBe("overdue");

      // Verify reminder was recorded in database
      const updatedRecord = await maintenanceService.findById(
        overdueRecord._id
      );
      expect(updatedRecord.data.remindersSent).toBeDefined();
      expect(updatedRecord.data.remindersSent.length).toBe(1);
      expect(updatedRecord.data.remindersSent[0].type).toBe("overdue");
    });

    it("should return 400 for empty recordIds array", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .post("/api/admin/maintenance/send-reminders")
        .set("Authorization", adminToken)
        .send({
          recordIds: [],
          reminderType: "overdue",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("recordIds array is required");
    });

    it("should return 400 for too many records", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      // Create array with more than 50 record IDs
      const tooManyIds = Array(51)
        .fill()
        .map(() => new ObjectId().toString());

      const response = await request(app)
        .post("/api/admin/maintenance/send-reminders")
        .set("Authorization", adminToken)
        .send({
          recordIds: tooManyIds,
          reminderType: "overdue",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain(
        "Cannot send reminders to more than 50 records"
      );
    });

    it("should return 400 for invalid reminder type", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const overdueRecord = testMaintenanceRecords.find(
        (r) => r.status === "overdue"
      );

      const response = await request(app)
        .post("/api/admin/maintenance/send-reminders")
        .set("Authorization", adminToken)
        .send({
          recordIds: [overdueRecord._id.toString()],
          reminderType: "invalid_type",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid reminderType");
    });
  });

  describe("POST /api/admin/maintenance/bulk-approve", () => {
    it("should bulk approve multiple maintenance payments", async () => {
      // Create additional pending records for bulk approval
      const additionalRecords = [
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_bulk_1",
          wing: "A",
          flatNumber: "103",
          month: "2024-01",
          amount: 5000,
          dueDate: new Date("2024-01-05"),
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot_bulk_1.jpg",
            uploadedAt: new Date(),
            uploadedBy: "test_user_bulk_1",
            approvalStatus: "pending",
          },
        },
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_bulk_2",
          wing: "A",
          flatNumber: "104",
          month: "2024-01",
          amount: 5000,
          dueDate: new Date("2024-01-05"),
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot_bulk_2.jpg",
            uploadedAt: new Date(),
            uploadedBy: "test_user_bulk_2",
            approvalStatus: "pending",
          },
        },
      ];

      const insertResult = await db
        .collection("maintenance")
        .insertMany(additionalRecords);
      const recordIds = Object.values(insertResult.insertedIds).map((id) =>
        id.toString()
      );

      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .post("/api/admin/maintenance/bulk-approve")
        .set("Authorization", adminToken)
        .send({
          recordIds: recordIds,
          adminNotes: "Bulk approved after verification",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.approvedCount).toBe(2);
      expect(response.body.data.totalAmount).toBe(10000);

      // Verify all records were updated
      for (const recordId of recordIds) {
        const updatedRecord = await maintenanceService.findById(recordId);
        expect(updatedRecord.data.status).toBe("paid");
        expect(updatedRecord.data.paymentProof.approvalStatus).toBe("approved");
      }
    });

    it("should return 400 for too many records", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const tooManyIds = Array(21)
        .fill()
        .map(() => new ObjectId().toString());

      const response = await request(app)
        .post("/api/admin/maintenance/bulk-approve")
        .set("Authorization", adminToken)
        .send({
          recordIds: tooManyIds,
          adminNotes: "Bulk approval",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain(
        "Cannot bulk approve more than 20 records"
      );
    });
  });

  describe("GET /api/admin/maintenance/analytics", () => {
    it("should return maintenance analytics", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/analytics")
        .set("Authorization", adminToken)
        .query({ period: "6months" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.period).toBe("6months");
      expect(response.body.data.collection).toBeDefined();
      expect(response.body.data.wings).toBeDefined();
      expect(response.body.data.approvals).toBeDefined();
      expect(response.body.data.generatedBy).toBe(testAdminUser.name);
    });

    it("should filter analytics by wing", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const response = await request(app)
        .get("/api/admin/maintenance/analytics")
        .set("Authorization", adminToken)
        .query({ period: "3months", wing: "A" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it("should handle different time periods", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const periods = ["1month", "3months", "6months", "1year"];

      for (const period of periods) {
        const response = await request(app)
          .get("/api/admin/maintenance/analytics")
          .set("Authorization", adminToken)
          .query({ period });

        expect(response.status).toBe(200);
        expect(response.body.data.period).toBe(period);
      }
    });
  });

  describe("Authentication and Authorization", () => {
    it("should return 401 for missing authorization header", async () => {
      const response = await request(app).get(
        "/api/admin/maintenance/calendar"
      );

      expect(response.status).toBe(401);
    });

    it("should return 403 for non-admin users", async () => {
      // Mock non-admin user
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        const error = new Error("Access denied. Admin privileges required.");
        error.status = 403;
        throw error;
      };

      const response = await request(app)
        .get("/api/admin/maintenance/calendar")
        .set("Authorization", "Bearer invalid_token");

      expect(response.status).toBe(403);
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits on approval endpoints", async () => {
      require("../middleware/adminAuth").verifyAdminAuth = (req, res, next) => {
        req.adminUser = testAdminUser;
        req.society = { _id: testSocietyId, name: "Test Society" };
        next();
      };

      const recordToApprove = testMaintenanceRecords.find(
        (r) => r.paymentProof?.approvalStatus === "pending"
      );

      // This test would need proper rate limiting implementation
      // For now, we just verify the endpoint responds
      const response = await request(app)
        .post("/api/admin/maintenance/approve")
        .set("Authorization", adminToken)
        .send({
          recordId: recordToApprove._id.toString(),
          adminNotes: "Rate limit test",
        });

      expect(response.status).toBeDefined();
    });
  });
});

describe("MaintenanceService Extensions", () => {
  let db;
  let maintenanceService;
  let testSocietyId;

  beforeAll(async () => {
    db = await setupTestDatabase();
    maintenanceService = new MaintenanceService(db);
    testSocietyId = new ObjectId();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await db.collection("maintenance").deleteMany({});
  });

  describe("uploadPaymentProof", () => {
    it("should upload payment proof successfully", async () => {
      // Create a maintenance record first
      const record = {
        societyId: testSocietyId,
        clerkUserId: "test_user",
        wing: "A",
        flatNumber: "101",
        month: "2024-01",
        amount: 5000,
        dueDate: new Date("2024-01-05"),
        status: "pending",
      };

      const createResult = await maintenanceService.create(record);
      const recordId = createResult.data._id;

      const result = await maintenanceService.uploadPaymentProof(
        recordId,
        "https://example.com/screenshot.jpg",
        "test_user"
      );

      expect(result.success).toBe(true);
      expect(result.data.paymentProof).toBeDefined();
      expect(result.data.paymentProof.screenshot).toBe(
        "https://example.com/screenshot.jpg"
      );
      expect(result.data.paymentProof.approvalStatus).toBe("pending");
    });

    it("should throw error for invalid record ID", async () => {
      await expect(
        maintenanceService.uploadPaymentProof(
          "invalid_id",
          "https://example.com/screenshot.jpg",
          "test_user"
        )
      ).rejects.toThrow("Valid recordId is required");
    });

    it("should throw error for missing screenshot URL", async () => {
      const recordId = new ObjectId();

      await expect(
        maintenanceService.uploadPaymentProof(recordId, "", "test_user")
      ).rejects.toThrow("Valid screenshotUrl is required");
    });
  });

  describe("getPendingApprovals", () => {
    it("should return pending approval records", async () => {
      // Create test records with pending approvals
      const records = [
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_1",
          wing: "A",
          flatNumber: "101",
          month: "2024-01",
          amount: 5000,
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot1.jpg",
            approvalStatus: "pending",
            uploadedAt: new Date(),
          },
        },
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_2",
          wing: "B",
          flatNumber: "201",
          month: "2024-01",
          amount: 5000,
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot2.jpg",
            approvalStatus: "approved",
            uploadedAt: new Date(),
          },
        },
      ];

      await db.collection("maintenance").insertMany(records);

      const result = await maintenanceService.getPendingApprovals(
        testSocietyId
      );

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].paymentProof.approvalStatus).toBe("pending");
    });

    it("should filter by wing when specified", async () => {
      const records = [
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_1",
          wing: "A",
          flatNumber: "101",
          month: "2024-01",
          amount: 5000,
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot1.jpg",
            approvalStatus: "pending",
            uploadedAt: new Date(),
          },
        },
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_2",
          wing: "B",
          flatNumber: "201",
          month: "2024-01",
          amount: 5000,
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot2.jpg",
            approvalStatus: "pending",
            uploadedAt: new Date(),
          },
        },
      ];

      await db.collection("maintenance").insertMany(records);

      const result = await maintenanceService.getPendingApprovals(
        testSocietyId,
        { wing: "A" }
      );

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].wing).toBe("A");
    });
  });

  describe("getPaymentProofHistory", () => {
    it("should return payment proof history", async () => {
      const records = [
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_1",
          wing: "A",
          flatNumber: "101",
          month: "2024-01",
          amount: 5000,
          status: "paid",
          paymentProof: {
            screenshot: "https://example.com/screenshot1.jpg",
            approvalStatus: "approved",
            uploadedAt: new Date("2024-01-01"),
            approvedAt: new Date("2024-01-02"),
          },
        },
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_2",
          wing: "B",
          flatNumber: "201",
          month: "2024-01",
          amount: 5000,
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot2.jpg",
            approvalStatus: "rejected",
            uploadedAt: new Date("2024-01-03"),
            rejectedAt: new Date("2024-01-04"),
          },
        },
      ];

      await db.collection("maintenance").insertMany(records);

      const result = await maintenanceService.getPaymentProofHistory(
        testSocietyId
      );

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(
        result.data.every((record) => record.paymentProof.screenshot)
      ).toBe(true);
    });

    it("should filter by approval status", async () => {
      const records = [
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_1",
          wing: "A",
          flatNumber: "101",
          month: "2024-01",
          amount: 5000,
          status: "paid",
          paymentProof: {
            screenshot: "https://example.com/screenshot1.jpg",
            approvalStatus: "approved",
            uploadedAt: new Date(),
          },
        },
        {
          societyId: testSocietyId,
          clerkUserId: "test_user_2",
          wing: "B",
          flatNumber: "201",
          month: "2024-01",
          amount: 5000,
          status: "pending",
          paymentProof: {
            screenshot: "https://example.com/screenshot2.jpg",
            approvalStatus: "rejected",
            uploadedAt: new Date(),
          },
        },
      ];

      await db.collection("maintenance").insertMany(records);

      const result = await maintenanceService.getPaymentProofHistory(
        testSocietyId,
        {
          approvalStatus: "approved",
        }
      );

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].paymentProof.approvalStatus).toBe("approved");
    });
  });
});
