/**
 * Integration tests for database operations
 * Tests database connection, CRUD operations, and data integrity
 */

const {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
} = require("../setup");
const dbConnection = require("../../config/database");
const {
  UserService,
  SocietyService,
  ForumService,
  ContactService,
} = require("../../models/services");
const { ObjectId } = require("mongodb");

describe("Database Operations Integration Tests", () => {
  let db;

  beforeAll(async () => {
    db = await setupTestDatabase();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe("Database Connection", () => {
    it("should establish database connection", () => {
      expect(dbConnection.isHealthy()).toBe(true);
      expect(db).toBeDefined();
    });

    it("should return database instance", () => {
      const dbInstance = dbConnection.getDb();
      expect(dbInstance).toBeDefined();
      expect(dbInstance.databaseName).toBe("test_oursociety");
    });
  });

  describe("Society Service Database Operations", () => {
    let societyService;

    beforeEach(() => {
      societyService = new SocietyService(db);
    });

    it("should create and retrieve society", async () => {
      const societyData = {
        name: "Test Society DB",
        address: "123 DB Test Street",
        totalWings: 3,
        totalFlats: 75,
        adminUsers: ["admin_db_test"],
        settings: {
          maintenanceAmount: 4000,
          maintenanceDueDate: 7,
          allowTenantForumAccess: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create society
      const createResult = await societyService.createSociety(societyData);
      expect(createResult.success).toBe(true);
      expect(createResult.data._id).toBeDefined();

      // Retrieve society
      const retrieveResult = await societyService.findById(
        createResult.data._id
      );
      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data.name).toBe("Test Society DB");
      expect(retrieveResult.data.totalWings).toBe(3);
    });

    it("should get active societies", async () => {
      // Create multiple societies
      const societies = [
        {
          name: "Active Society 1",
          address: "123 Active Street",
          totalWings: 2,
          totalFlats: 50,
          adminUsers: [],
          settings: {
            maintenanceAmount: 3000,
            maintenanceDueDate: 5,
            allowTenantForumAccess: true,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: "Active Society 2",
          address: "456 Active Avenue",
          totalWings: 4,
          totalFlats: 100,
          adminUsers: [],
          settings: {
            maintenanceAmount: 5000,
            maintenanceDueDate: 10,
            allowTenantForumAccess: false,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const society of societies) {
        await societyService.createSociety(society);
      }

      const result = await societyService.getActiveSocieties();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data.map((s) => s.name)).toContain("Active Society 1");
      expect(result.data.map((s) => s.name)).toContain("Active Society 2");
    });
  });

  describe("User Service Database Operations", () => {
    let userService;
    let societyService;
    let societyId;

    beforeEach(async () => {
      userService = new UserService(db);
      societyService = new SocietyService(db);

      // Create a test society first
      const societyResult = await societyService.createSociety({
        name: "User Test Society",
        address: "123 User Test Street",
        totalWings: 2,
        totalFlats: 40,
        adminUsers: [],
        settings: {
          maintenanceAmount: 3500,
          maintenanceDueDate: 5,
          allowTenantForumAccess: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      societyId = societyResult.data._id;
    });

    it("should register and retrieve user", async () => {
      const userData = {
        clerkUserId: "db_test_user_1",
        societyId: societyId,
        societyName: "User Test Society",
        wing: "A",
        flatNumber: "101",
        residentType: "Owner",
        contactNumber: "9876543200",
        email: "dbtest@example.com",
        name: "DB Test User",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Register user
      const registerResult = await userService.registerUser(userData);
      expect(registerResult.success).toBe(true);
      expect(registerResult.data._id).toBeDefined();

      // Retrieve user
      const retrieveResult = await userService.findByClerkUserId(
        "db_test_user_1"
      );
      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data.name).toBe("DB Test User");
      expect(retrieveResult.data.wing).toBe("A");
      expect(retrieveResult.data.societyId.toString()).toBe(
        societyId.toString()
      );
    });

    it("should update user profile", async () => {
      // First register a user
      const userData = {
        clerkUserId: "db_test_user_2",
        societyId: societyId,
        societyName: "User Test Society",
        wing: "B",
        flatNumber: "201",
        residentType: "Tenant",
        contactNumber: "9876543201",
        email: "dbtest2@example.com",
        name: "DB Test User 2",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await userService.registerUser(userData);

      // Update profile
      const updateData = {
        contactNumber: "9999999999",
        flatNumber: "202",
        updatedAt: new Date(),
      };

      const updateResult = await userService.updateProfile(
        "db_test_user_2",
        updateData
      );
      expect(updateResult.success).toBe(true);

      // Verify update
      const retrieveResult = await userService.findByClerkUserId(
        "db_test_user_2"
      );
      expect(retrieveResult.data.contactNumber).toBe("9999999999");
      expect(retrieveResult.data.flatNumber).toBe("202");
    });

    it("should verify user society membership", async () => {
      // Register user
      const userData = {
        clerkUserId: "db_test_user_3",
        societyId: societyId,
        societyName: "User Test Society",
        wing: "C",
        flatNumber: "301",
        residentType: "Owner",
        contactNumber: "9876543202",
        email: "dbtest3@example.com",
        name: "DB Test User 3",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await userService.registerUser(userData);

      // Verify membership
      const verifyResult = await userService.verifyUserSociety(
        "db_test_user_3",
        societyId.toString()
      );
      expect(verifyResult.belongs).toBe(true);
      expect(verifyResult.user.societyName).toBe("User Test Society");

      // Verify non-membership
      const otherSocietyId = new ObjectId();
      const verifyOtherResult = await userService.verifyUserSociety(
        "db_test_user_3",
        otherSocietyId.toString()
      );
      expect(verifyOtherResult.belongs).toBe(false);
    });
  });

  describe("Forum Service Database Operations", () => {
    let forumService;
    let userService;
    let societyService;
    let societyId;
    let userId;

    beforeEach(async () => {
      forumService = new ForumService(db);
      userService = new UserService(db);
      societyService = new SocietyService(db);

      // Create test society and user
      const societyResult = await societyService.createSociety({
        name: "Forum Test Society",
        address: "123 Forum Test Street",
        totalWings: 2,
        totalFlats: 40,
        adminUsers: [],
        settings: {
          maintenanceAmount: 3500,
          maintenanceDueDate: 5,
          allowTenantForumAccess: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      societyId = societyResult.data._id;

      const userResult = await userService.registerUser({
        clerkUserId: "forum_test_user",
        societyId: societyId,
        societyName: "Forum Test Society",
        wing: "A",
        flatNumber: "101",
        residentType: "Owner",
        contactNumber: "9876543203",
        email: "forumtest@example.com",
        name: "Forum Test User",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userId = userResult.data._id;
    });

    it("should create and retrieve forum post", async () => {
      const postData = {
        societyId: societyId,
        authorId: "forum_test_user",
        authorName: "Forum Test User",
        authorWing: "A",
        title: "DB Test Forum Post",
        content: "This is a database test forum post",
        category: "general",
        isAnnouncement: false,
        isPinned: false,
        replies: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create post
      const createResult = await forumService.createForumPost(postData);
      expect(createResult.success).toBe(true);
      expect(createResult.data._id).toBeDefined();

      // Retrieve posts
      const retrieveResult = await forumService.getSocietyForumPosts(
        societyId,
        { page: 1, limit: 10 }
      );
      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data).toHaveLength(1);
      expect(retrieveResult.data[0].title).toBe("DB Test Forum Post");
    });

    it("should update forum post", async () => {
      // Create post first
      const postData = {
        societyId: societyId,
        authorId: "forum_test_user",
        authorName: "Forum Test User",
        authorWing: "A",
        title: "Original Title",
        content: "Original content",
        category: "general",
        isAnnouncement: false,
        isPinned: false,
        replies: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createResult = await forumService.createForumPost(postData);
      const postId = createResult.data._id.toString();

      // Update post
      const updateData = {
        title: "Updated Title",
        content: "Updated content",
        category: "maintenance",
        updatedAt: new Date(),
      };

      const updateResult = await forumService.updateForumPost(
        postId,
        updateData,
        "forum_test_user",
        false
      );
      expect(updateResult.success).toBe(true);
      expect(updateResult.data.title).toBe("Updated Title");
      expect(updateResult.data.category).toBe("maintenance");
    });

    it("should add reply to forum post", async () => {
      // Create post first
      const postData = {
        societyId: societyId,
        authorId: "forum_test_user",
        authorName: "Forum Test User",
        authorWing: "A",
        title: "Post for Reply Test",
        content: "This post will receive a reply",
        category: "general",
        isAnnouncement: false,
        isPinned: false,
        replies: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createResult = await forumService.createForumPost(postData);
      const postId = createResult.data._id.toString();

      // Add reply
      const replyData = {
        authorId: "forum_test_user",
        authorName: "Forum Test User",
        content: "This is a test reply",
      };

      const replyResult = await forumService.addReply(postId, replyData);
      expect(replyResult.success).toBe(true);
      expect(replyResult.data.content).toBe("This is a test reply");

      // Verify reply was added
      const postResult = await forumService.findById(postId);
      expect(postResult.data.replies).toHaveLength(1);
      expect(postResult.data.replies[0].content).toBe("This is a test reply");
    });

    it("should delete forum post", async () => {
      // Create post first
      const postData = {
        societyId: societyId,
        authorId: "forum_test_user",
        authorName: "Forum Test User",
        authorWing: "A",
        title: "Post to Delete",
        content: "This post will be deleted",
        category: "general",
        isAnnouncement: false,
        isPinned: false,
        replies: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createResult = await forumService.createForumPost(postData);
      const postId = createResult.data._id.toString();

      // Delete post
      const deleteResult = await forumService.deleteForumPost(
        postId,
        "forum_test_user",
        false
      );
      expect(deleteResult.success).toBe(true);

      // Verify post is deleted
      const retrieveResult = await forumService.findById(postId);
      expect(retrieveResult.data).toBeNull();
    });
  });

  describe("Contact Service Database Operations", () => {
    let contactService;
    let societyService;
    let societyId;

    beforeEach(async () => {
      contactService = new ContactService(db);
      societyService = new SocietyService(db);

      // Create test society
      const societyResult = await societyService.createSociety({
        name: "Contact Test Society",
        address: "123 Contact Test Street",
        totalWings: 2,
        totalFlats: 40,
        adminUsers: ["contact_admin"],
        settings: {
          maintenanceAmount: 3500,
          maintenanceDueDate: 5,
          allowTenantForumAccess: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      societyId = societyResult.data._id;
    });

    it("should create and retrieve contact", async () => {
      const contactData = {
        societyId: societyId,
        name: "DB Test Security",
        role: "Security",
        phoneNumber: "9876543204",
        email: "security@dbtest.com",
        isEmergency: true,
        isActive: true,
        addedBy: "contact_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create contact
      const createResult = await contactService.createContact(contactData);
      expect(createResult.success).toBe(true);
      expect(createResult.data._id).toBeDefined();

      // Retrieve contacts
      const retrieveResult = await contactService.getSocietyContacts(
        societyId,
        { page: 1, limit: 10 }
      );
      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.data).toHaveLength(1);
      expect(retrieveResult.data[0].name).toBe("DB Test Security");
      expect(retrieveResult.data[0].isEmergency).toBe(true);
    });

    it("should update contact", async () => {
      // Create contact first
      const contactData = {
        societyId: societyId,
        name: "Original Contact",
        role: "Maintenance",
        phoneNumber: "9876543205",
        email: "original@dbtest.com",
        isEmergency: false,
        isActive: true,
        addedBy: "contact_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createResult = await contactService.createContact(contactData);
      const contactId = createResult.data._id.toString();

      // Update contact
      const updateData = {
        name: "Updated Contact",
        phoneNumber: "9999999998",
        isEmergency: true,
        updatedAt: new Date(),
      };

      const updateResult = await contactService.updateContact(
        contactId,
        updateData,
        "contact_admin",
        true
      );
      expect(updateResult.success).toBe(true);
      expect(updateResult.data.name).toBe("Updated Contact");
      expect(updateResult.data.isEmergency).toBe(true);
    });

    it("should get emergency contacts", async () => {
      // Create multiple contacts
      const contacts = [
        {
          societyId: societyId,
          name: "Emergency Contact 1",
          role: "Security",
          phoneNumber: "9876543206",
          email: "emergency1@dbtest.com",
          isEmergency: true,
          isActive: true,
          addedBy: "contact_admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          societyId: societyId,
          name: "Regular Contact",
          role: "Maintenance",
          phoneNumber: "9876543207",
          email: "regular@dbtest.com",
          isEmergency: false,
          isActive: true,
          addedBy: "contact_admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const contact of contacts) {
        await contactService.createContact(contact);
      }

      // Get emergency contacts
      const emergencyResult = await contactService.getEmergencyContacts(
        societyId
      );
      expect(emergencyResult.success).toBe(true);
      expect(emergencyResult.data).toHaveLength(1);
      expect(emergencyResult.data[0].name).toBe("Emergency Contact 1");
      expect(emergencyResult.data[0].isEmergency).toBe(true);
    });

    it("should delete contact", async () => {
      // Create contact first
      const contactData = {
        societyId: societyId,
        name: "Contact to Delete",
        role: "Management",
        phoneNumber: "9876543208",
        email: "delete@dbtest.com",
        isEmergency: false,
        isActive: true,
        addedBy: "contact_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createResult = await contactService.createContact(contactData);
      const contactId = createResult.data._id.toString();

      // Delete contact
      const deleteResult = await contactService.deleteContact(
        contactId,
        "contact_admin",
        true
      );
      expect(deleteResult.success).toBe(true);

      // Verify contact is deleted
      const retrieveResult = await contactService.getSocietyContacts(
        societyId,
        { page: 1, limit: 10 }
      );
      expect(retrieveResult.data).toHaveLength(0);
    });
  });

  describe("Data Integrity and Constraints", () => {
    it("should maintain referential integrity between users and societies", async () => {
      const userService = new UserService(db);
      const societyService = new SocietyService(db);

      // Create society
      const societyResult = await societyService.createSociety({
        name: "Integrity Test Society",
        address: "123 Integrity Street",
        totalWings: 1,
        totalFlats: 10,
        adminUsers: [],
        settings: {
          maintenanceAmount: 2000,
          maintenanceDueDate: 1,
          allowTenantForumAccess: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create user with valid society reference
      const userData = {
        clerkUserId: "integrity_test_user",
        societyId: societyResult.data._id,
        societyName: "Integrity Test Society",
        wing: "A",
        flatNumber: "101",
        residentType: "Owner",
        contactNumber: "9876543209",
        email: "integrity@example.com",
        name: "Integrity Test User",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const userResult = await userService.registerUser(userData);
      expect(userResult.success).toBe(true);

      // Verify user can be retrieved and has correct society reference
      const retrieveResult = await userService.findByClerkUserId(
        "integrity_test_user"
      );
      expect(retrieveResult.data.societyId.toString()).toBe(
        societyResult.data._id.toString()
      );
      expect(retrieveResult.data.societyName).toBe("Integrity Test Society");
    });

    it("should handle duplicate user registration attempts", async () => {
      const userService = new UserService(db);
      const societyService = new SocietyService(db);

      // Create society
      const societyResult = await societyService.createSociety({
        name: "Duplicate Test Society",
        address: "123 Duplicate Street",
        totalWings: 1,
        totalFlats: 10,
        adminUsers: [],
        settings: {
          maintenanceAmount: 2000,
          maintenanceDueDate: 1,
          allowTenantForumAccess: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const userData = {
        clerkUserId: "duplicate_test_user",
        societyId: societyResult.data._id,
        societyName: "Duplicate Test Society",
        wing: "A",
        flatNumber: "101",
        residentType: "Owner",
        contactNumber: "9876543210",
        email: "duplicate@example.com",
        name: "Duplicate Test User",
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First registration should succeed
      const firstResult = await userService.registerUser(userData);
      expect(firstResult.success).toBe(true);

      // Second registration with same clerkUserId should fail
      const secondResult = await userService.registerUser(userData);
      expect(secondResult.success).toBe(false);
      expect(secondResult.errors).toBeDefined();
    });
  });
});
