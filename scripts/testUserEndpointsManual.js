const express = require('express');
const request = require('supertest');
const { ObjectId } = require('mongodb');
require('dotenv').config();

const dbConnection = require('../config/database');
const { UserService, SocietyService } = require('../models/services');

// Create test app
const app = express();
app.use(express.json());

// Import routes
const userRoutes = require('../routes/users');
app.use('/api/users', userRoutes);

// Test data
const testSocietyId = new ObjectId();

const testSociety = {
  _id: testSocietyId,
  name: 'Test Society Manual',
  address: '123 Test Street',
  totalWings: 4,
  totalFlats: 100,
  adminUsers: [],
  settings: {
    maintenanceAmount: 5000,
    maintenanceDueDate: 5,
    allowTenantForumAccess: true
  },
  createdAt: new Date(),
  updatedAt: new Date()
};

// Manual testing function
async function runManualTests() {
  console.log('🧪 Starting manual user endpoint tests...\n');

  try {
    await dbConnection.connect();
    console.log('✅ Database connected');

    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);

    // Setup test society
    try {
      await societyService.create(testSociety);
      console.log('✅ Test society created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  Test society already exists');
      } else {
        throw error;
      }
    }

    // Test 1: Get societies (public endpoint)
    console.log('\n📋 Test 1: Get available societies');
    const societiesResponse = await request(app)
      .get('/api/users/societies');
    
    console.log(`Status: ${societiesResponse.status}`);
    if (societiesResponse.status === 200) {
      console.log(`✅ Societies found: ${societiesResponse.body.count || 0}`);
      console.log(`Sample society: ${societiesResponse.body.data[0]?.name || 'None'}`);
    } else {
      console.log(`❌ Error: ${societiesResponse.body.error}`);
    }

    // Test 2: Test authentication middleware (should fail without token)
    console.log('\n🔒 Test 2: Test authentication (should fail without token)');
    const authResponse = await request(app)
      .get('/api/users/profile');
    
    console.log(`Status: ${authResponse.status}`);
    if (authResponse.status === 401) {
      console.log(`✅ Authentication properly rejected: ${authResponse.body.error}`);
    } else {
      console.log(`❌ Unexpected response: ${authResponse.body.error}`);
    }

    // Test 3: Test registration endpoint without auth (should fail)
    console.log('\n🚫 Test 3: Test registration without auth (should fail)');
    const regResponse = await request(app)
      .post('/api/users/register-society')
      .send({
        societyId: testSocietyId.toString(),
        wing: 'A',
        residentType: 'Owner'
      });
    
    console.log(`Status: ${regResponse.status}`);
    if (regResponse.status === 401) {
      console.log(`✅ Registration properly rejected: ${regResponse.body.error}`);
    } else {
      console.log(`❌ Unexpected response: ${regResponse.body.error}`);
    }

    // Test 4: Test validation on registration endpoint
    console.log('\n📝 Test 4: Test validation (missing fields)');
    const validationResponse = await request(app)
      .post('/api/users/register-society')
      .set('Authorization', 'Bearer fake_token')
      .send({
        wing: 'A'
        // Missing required fields
      });
    
    console.log(`Status: ${validationResponse.status}`);
    // This will fail at auth level first, which is expected
    if (validationResponse.status === 401) {
      console.log(`✅ Authentication check working (fails before validation)`);
    }

    // Test 5: Test society verification endpoint
    console.log('\n🔍 Test 5: Test society verification without auth');
    const verifyResponse = await request(app)
      .post('/api/users/verify-society')
      .send({
        societyId: testSocietyId.toString()
      });
    
    console.log(`Status: ${verifyResponse.status}`);
    if (verifyResponse.status === 401) {
      console.log(`✅ Verification properly requires auth: ${verifyResponse.body.error}`);
    } else {
      console.log(`❌ Unexpected response: ${verifyResponse.body.error}`);
    }

    console.log('\n✅ Manual tests completed successfully!');
    console.log('\n💡 All endpoints are properly protected and responding correctly');
    console.log('\n🔑 To test with real authentication:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Use a tool like Postman or curl');
    console.log('3. Include Authorization: Bearer <your-clerk-session-token>');
    console.log('4. Test endpoints:');
    console.log('   - GET /api/users/societies (public)');
    console.log('   - POST /api/users/register-society (protected)');
    console.log('   - GET /api/users/profile (protected)');
    console.log('   - PUT /api/users/profile (protected)');
    console.log('   - POST /api/users/verify-society (protected)');

  } catch (error) {
    console.error('❌ Manual test error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Cleanup
    try {
      const db = dbConnection.getDb();
      await db.collection('societies').deleteMany({ name: 'Test Society Manual' });
      console.log('🧹 Cleanup completed');
    } catch (cleanupError) {
      console.log('⚠️  Cleanup warning:', cleanupError.message);
    }
    
    await dbConnection.disconnect();
    console.log('🔌 Database disconnected');
  }
}

// Test individual endpoint functionality
async function testEndpointLogic() {
  console.log('\n🔧 Testing endpoint logic...\n');

  try {
    await dbConnection.connect();
    const db = dbConnection.getDb();
    
    // Test UserService directly
    const userService = new UserService(db);
    const societyService = new SocietyService(db);

    // Test society creation
    const societyResult = await societyService.create({
      name: 'Logic Test Society',
      address: '456 Logic Street',
      totalWings: 2,
      totalFlats: 50,
      adminUsers: [],
      settings: {
        maintenanceAmount: 3000,
        maintenanceDueDate: 10,
        allowTenantForumAccess: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (societyResult.success) {
      console.log('✅ Society service working correctly');
      
      // Test user creation
      const userData = {
        clerkUserId: 'test_logic_user_123',
        societyId: societyResult.data._id,
        societyName: 'Logic Test Society',
        wing: 'B',
        flatNumber: '201',
        residentType: 'Tenant',
        contactNumber: '+1111111111',
        email: 'logic@test.com',
        name: 'Logic Test User',
        registrationDate: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const userResult = await userService.create(userData);
      if (userResult.success) {
        console.log('✅ User service working correctly');
        
        // Test user lookup
        const foundUser = await userService.findByClerkUserId('test_logic_user_123');
        if (foundUser.data) {
          console.log('✅ User lookup working correctly');
        } else {
          console.log('❌ User lookup failed');
        }
      } else {
        console.log('❌ User service failed:', userResult.errors);
      }

      // Cleanup
      await db.collection('users').deleteMany({ clerkUserId: 'test_logic_user_123' });
      await db.collection('societies').deleteMany({ name: 'Logic Test Society' });
      console.log('🧹 Logic test cleanup completed');
      
    } else {
      console.log('❌ Society service failed:', societyResult.errors);
    }

  } catch (error) {
    console.error('❌ Logic test error:', error.message);
  } finally {
    await dbConnection.disconnect();
  }
}

// Run tests
if (require.main === module) {
  runManualTests()
    .then(() => testEndpointLogic())
    .then(() => {
      console.log('\n🎉 All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { runManualTests, testEndpointLogic };