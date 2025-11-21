const dbConnection = require('../config/database');
const { ServiceFactory } = require('../models/services');
const { ObjectId } = require('mongodb');

/**
 * Database Service Testing Script
 * Tests all CRUD operations and service methods
 */

let db;
let services;
let testSocietyId;
let testUserId;

async function setupTestData() {
  console.log('🔧 Setting up test data...');
  
  try {
    // Create a test society
    const societyData = {
      name: 'Test Society ' + Date.now(),
      address: '123 Test Street, Test City',
      totalWings: 2,
      totalFlats: 20,
      adminUsers: ['test_admin_123'],
      settings: {
        maintenanceAmount: 2000,
        maintenanceDueDate: 5,
        allowTenantForumAccess: true
      }
    };

    const society = await services.society.createSociety(societyData);
    testSocietyId = society.data._id;
    console.log('  ✓ Test society created:', testSocietyId);

    // Create a test user
    const userData = {
      clerkUserId: 'test_user_' + Date.now(),
      societyId: testSocietyId,
      societyName: societyData.name,
      wing: 'A',
      flatNumber: '101',
      residentType: 'Owner',
      contactNumber: '+919876543210',
      email: 'test@example.com',
      name: 'Test User'
    };

    const user = await services.user.registerUser(userData);
    testUserId = user.data.clerkUserId;
    console.log('  ✓ Test user created:', testUserId);

    return { societyId: testSocietyId, userId: testUserId };
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  }
}

async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...');
  
  try {
    // Delete test data
    await services.user.deleteMany({ clerkUserId: { $regex: '^test_user_' } });
    await services.society.deleteMany({ name: { $regex: '^Test Society' } });
    await services.maintenance.deleteMany({ clerkUserId: { $regex: '^test_user_' } });
    await services.forum.deleteMany({ authorId: { $regex: '^test_user_' } });
    await services.contact.deleteMany({ addedBy: { $regex: '^test_' } });
    
    console.log('  ✓ Test data cleaned up');
  } catch (error) {
    console.error('❌ Error cleaning up test data:', error.message);
  }
}

async function testUserService() {
  console.log('🧪 Testing User Service...');
  
  try {
    // Test finding user by Clerk ID
    const user = await services.user.findByClerkUserId(testUserId);
    console.log('  ✓ Find user by Clerk ID:', user.success && user.data ? 'PASS' : 'FAIL');

    // Test finding users by society
    const societyUsers = await services.user.findBySocietyId(testSocietyId);
    console.log('  ✓ Find users by society:', societyUsers.success && societyUsers.data.length > 0 ? 'PASS' : 'FAIL');

    // Test updating user profile
    const updateResult = await services.user.updateProfile(testUserId, { contactNumber: '+919876543211' });
    console.log('  ✓ Update user profile:', updateResult.success && updateResult.modified ? 'PASS' : 'FAIL');

    // Test user society verification
    const verification = await services.user.verifyUserSociety(testUserId, testSocietyId);
    console.log('  ✓ Verify user society:', verification.success && verification.belongs ? 'PASS' : 'FAIL');

    // Test member stats
    const stats = await services.user.getSocietyMemberStats(testSocietyId);
    console.log('  ✓ Get member stats:', stats.success && stats.data.total > 0 ? 'PASS' : 'FAIL');

  } catch (error) {
    console.error('  ❌ User service test failed:', error.message);
  }
}

async function testSocietyService() {
  console.log('🧪 Testing Society Service...');
  
  try {
    // Test finding society by ID
    const society = await services.society.findById(testSocietyId);
    console.log('  ✓ Find society by ID:', society.success && society.data ? 'PASS' : 'FAIL');

    // Test getting active societies
    const societies = await services.society.getActiveSocieties();
    console.log('  ✓ Get active societies:', societies.success && societies.data.length > 0 ? 'PASS' : 'FAIL');

    // Test updating society settings
    const settingsUpdate = await services.society.updateSettings(testSocietyId, { maintenanceAmount: 2500 });
    console.log('  ✓ Update society settings:', settingsUpdate.success ? 'PASS' : 'FAIL');

    // Test admin management
    const addAdmin = await services.society.addAdmin(testSocietyId, 'test_admin_456');
    console.log('  ✓ Add admin:', addAdmin.success ? 'PASS' : 'FAIL');

    const isAdmin = await services.society.isAdmin(testSocietyId, 'test_admin_456');
    console.log('  ✓ Check admin status:', isAdmin.success && isAdmin.isAdmin ? 'PASS' : 'FAIL');

  } catch (error) {
    console.error('  ❌ Society service test failed:', error.message);
  }
}

async function testMaintenanceService() {
  console.log('🧪 Testing Maintenance Service...');
  
  try {
    // Test creating maintenance record
    const maintenanceData = {
      societyId: testSocietyId,
      clerkUserId: testUserId,
      wing: 'A',
      flatNumber: '101',
      month: '2024-01',
      amount: 2000,
      dueDate: new Date('2024-01-05'),
      status: 'pending'
    };

    const maintenance = await services.maintenance.createMaintenanceRecord(maintenanceData);
    console.log('  ✓ Create maintenance record:', maintenance.success ? 'PASS' : 'FAIL');

    // Test getting user maintenance records
    const userRecords = await services.maintenance.getUserMaintenanceRecords(testUserId);
    console.log('  ✓ Get user maintenance records:', userRecords.success && userRecords.data.length > 0 ? 'PASS' : 'FAIL');

    // Test recording payment
    if (maintenance.success) {
      const payment = await services.maintenance.recordPayment(maintenance.data._id, {
        paymentMethod: 'Online',
        transactionId: 'TXN123456'
      });
      console.log('  ✓ Record payment:', payment.success ? 'PASS' : 'FAIL');
    }

    // Test maintenance stats
    const stats = await services.maintenance.getSocietyMaintenanceStats(testSocietyId);
    console.log('  ✓ Get maintenance stats:', stats.success ? 'PASS' : 'FAIL');

  } catch (error) {
    console.error('  ❌ Maintenance service test failed:', error.message);
  }
}

async function testForumService() {
  console.log('🧪 Testing Forum Service...');
  
  try {
    // Test creating forum post
    const postData = {
      societyId: testSocietyId,
      authorId: testUserId,
      authorName: 'Test User',
      authorWing: 'A',
      title: 'Test Forum Post',
      content: 'This is a test forum post content.',
      category: 'general'
    };

    const post = await services.forum.createForumPost(postData);
    console.log('  ✓ Create forum post:', post.success ? 'PASS' : 'FAIL');

    // Test getting society forum posts
    const posts = await services.forum.getSocietyForumPosts(testSocietyId);
    console.log('  ✓ Get society forum posts:', posts.success && posts.data.length > 0 ? 'PASS' : 'FAIL');

    // Test adding reply
    if (post.success) {
      const reply = await services.forum.addReply(post.data._id, {
        authorId: 'test_user_reply',
        authorName: 'Reply User',
        content: 'This is a test reply.'
      });
      console.log('  ✓ Add reply to post:', reply.success ? 'PASS' : 'FAIL');
    }

    // Test forum stats
    const stats = await services.forum.getSocietyForumStats(testSocietyId);
    console.log('  ✓ Get forum stats:', stats.success ? 'PASS' : 'FAIL');

  } catch (error) {
    console.error('  ❌ Forum service test failed:', error.message);
  }
}

async function testContactService() {
  console.log('🧪 Testing Contact Service...');
  
  try {
    // Test creating contact
    const contactData = {
      societyId: testSocietyId,
      name: 'Test Security Guard',
      role: 'Security',
      phoneNumber: '+919876543210',
      email: 'security@test.com',
      isEmergency: true,
      addedBy: testUserId
    };

    const contact = await services.contact.createContact(contactData);
    console.log('  ✓ Create contact:', contact.success ? 'PASS' : 'FAIL');

    // Test getting society contacts
    const contacts = await services.contact.getSocietyContacts(testSocietyId);
    console.log('  ✓ Get society contacts:', contacts.success && contacts.data.length > 0 ? 'PASS' : 'FAIL');

    // Test getting emergency contacts
    const emergencyContacts = await services.contact.getEmergencyContacts(testSocietyId);
    console.log('  ✓ Get emergency contacts:', emergencyContacts.success ? 'PASS' : 'FAIL');

    // Test contact stats
    const stats = await services.contact.getSocietyContactStats(testSocietyId);
    console.log('  ✓ Get contact stats:', stats.success ? 'PASS' : 'FAIL');

  } catch (error) {
    console.error('  ❌ Contact service test failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Database Service Tests...\n');
  
  try {
    // Connect to database
    db = await dbConnection.connect();
    console.log('✅ Connected to database\n');
    
    // Initialize services
    services = new ServiceFactory(db).getAllServices();
    console.log('✅ Services initialized\n');
    
    // Setup test data
    await setupTestData();
    console.log();
    
    // Run all tests
    await testUserService();
    console.log();
    await testSocietyService();
    console.log();
    await testMaintenanceService();
    console.log();
    await testForumService();
    console.log();
    await testContactService();
    console.log();
    
    // Cleanup
    await cleanupTestData();
    
    console.log('✅ All database service tests completed!');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Disconnect from database
    await dbConnection.disconnect();
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\n✅ Database service test script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Database service test script failed:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };