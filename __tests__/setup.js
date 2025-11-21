/**
 * Test setup and teardown utilities
 * Handles test database connection and cleanup
 */

const { MongoClient } = require('mongodb');
const dbConnection = require('../config/database');

// Test database configuration
const TEST_DB_NAME = 'test_oursociety';
let testClient = null;
let testDb = null;

/**
 * Setup test database connection
 */
async function setupTestDatabase() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is required for testing');
    }

    // Create a separate client for testing
    testClient = new MongoClient(uri);
    await testClient.connect();
    
    // Use a separate test database
    testDb = testClient.db(TEST_DB_NAME);
    
    // Override the main database connection for tests
    dbConnection.db = testDb;
    dbConnection.isConnected = true;
    
    console.log('Test database connected');
    return testDb;
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

/**
 * Clean up test database
 */
async function cleanupTestDatabase() {
  try {
    if (testDb) {
      // Drop all collections
      const collections = await testDb.listCollections().toArray();
      for (const collection of collections) {
        await testDb.collection(collection.name).drop();
      }
    }
  } catch (error) {
    console.error('Error cleaning up test database:', error);
  }
}

/**
 * Teardown test database connection
 */
async function teardownTestDatabase() {
  try {
    if (testClient) {
      await testClient.close();
      testClient = null;
      testDb = null;
    }
    console.log('Test database disconnected');
  } catch (error) {
    console.error('Error tearing down test database:', error);
  }
}

/**
 * Create test data for societies
 */
async function createTestSocieties() {
  const societies = [
    {
      name: 'Test Society 1',
      address: '123 Test Street, Test City',
      totalWings: 4,
      totalFlats: 100,
      adminUsers: ['test_admin_1'],
      settings: {
        maintenanceAmount: 5000,
        maintenanceDueDate: 5,
        allowTenantForumAccess: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Test Society 2',
      address: '456 Test Avenue, Test City',
      totalWings: 2,
      totalFlats: 50,
      adminUsers: ['test_admin_2'],
      settings: {
        maintenanceAmount: 3000,
        maintenanceDueDate: 10,
        allowTenantForumAccess: false
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await testDb.collection('societies').insertMany(societies);
  return result.insertedIds;
}

/**
 * Create test user data
 */
async function createTestUsers(societyIds) {
  const users = [
    {
      clerkUserId: 'test_user_1',
      societyId: societyIds[0],
      societyName: 'Test Society 1',
      wing: 'A',
      flatNumber: '101',
      residentType: 'Owner',
      contactNumber: '9876543210',
      email: 'test1@example.com',
      name: 'Test User 1',
      registrationDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      clerkUserId: 'test_user_2',
      societyId: societyIds[1],
      societyName: 'Test Society 2',
      wing: 'B',
      flatNumber: '201',
      residentType: 'Tenant',
      contactNumber: '9876543211',
      email: 'test2@example.com',
      name: 'Test User 2',
      registrationDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      clerkUserId: 'test_admin_1',
      societyId: societyIds[0],
      societyName: 'Test Society 1',
      wing: 'A',
      flatNumber: '001',
      residentType: 'Owner',
      contactNumber: '9876543212',
      email: 'admin1@example.com',
      name: 'Test Admin 1',
      registrationDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await testDb.collection('users').insertMany(users);
  return result.insertedIds;
}

/**
 * Create test forum posts
 */
async function createTestForumPosts(societyIds) {
  const posts = [
    {
      societyId: societyIds[0],
      authorId: 'test_user_1',
      authorName: 'Test User 1',
      authorWing: 'A',
      title: 'Test Forum Post 1',
      content: 'This is a test forum post content',
      category: 'general',
      isAnnouncement: false,
      isPinned: false,
      replies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      societyId: societyIds[0],
      authorId: 'test_admin_1',
      authorName: 'Test Admin 1',
      authorWing: 'A',
      title: 'Important Announcement',
      content: 'This is an important announcement',
      category: 'general',
      isAnnouncement: true,
      isPinned: true,
      replies: [
        {
          authorId: 'test_user_1',
          authorName: 'Test User 1',
          content: 'Thanks for the update!',
          createdAt: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await testDb.collection('forums').insertMany(posts);
  return result.insertedIds;
}

/**
 * Create test contacts
 */
async function createTestContacts(societyIds) {
  const contacts = [
    {
      societyId: societyIds[0],
      name: 'Security Guard',
      role: 'Security',
      phoneNumber: '9876543213',
      email: 'security@testsociety1.com',
      isEmergency: true,
      isActive: true,
      addedBy: 'test_admin_1',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      societyId: societyIds[0],
      name: 'Maintenance Team',
      role: 'Maintenance',
      phoneNumber: '9876543214',
      email: 'maintenance@testsociety1.com',
      isEmergency: false,
      isActive: true,
      addedBy: 'test_admin_1',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await testDb.collection('contacts').insertMany(contacts);
  return result.insertedIds;
}

/**
 * Create test maintenance records
 */
async function createTestMaintenanceRecords(societyIds) {
  const records = [
    {
      societyId: societyIds[0],
      clerkUserId: 'test_user_1',
      wing: 'A',
      flatNumber: '101',
      month: '2024-01',
      amount: 5000,
      dueDate: new Date('2024-01-05'),
      paidDate: new Date('2024-01-03'),
      status: 'paid',
      paymentMethod: 'online',
      transactionId: 'TXN123456',
      notes: 'Paid on time',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      societyId: societyIds[0],
      clerkUserId: 'test_user_1',
      wing: 'A',
      flatNumber: '101',
      month: '2024-02',
      amount: 5000,
      dueDate: new Date('2024-02-05'),
      paidDate: null,
      status: 'pending',
      paymentMethod: null,
      transactionId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await testDb.collection('maintenance').insertMany(records);
  return result.insertedIds;
}

/**
 * Setup complete test data
 */
async function setupTestData() {
  const societyIds = await createTestSocieties();
  const userIds = await createTestUsers(Object.values(societyIds));
  const forumIds = await createTestForumPosts(Object.values(societyIds));
  const contactIds = await createTestContacts(Object.values(societyIds));
  const maintenanceIds = await createTestMaintenanceRecords(Object.values(societyIds));

  return {
    societyIds: Object.values(societyIds),
    userIds: Object.values(userIds),
    forumIds: Object.values(forumIds),
    contactIds: Object.values(contactIds),
    maintenanceIds: Object.values(maintenanceIds)
  };
}

module.exports = {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
  setupTestData,
  createTestSocieties,
  createTestUsers,
  createTestForumPosts,
  createTestContacts,
  createTestMaintenanceRecords
};