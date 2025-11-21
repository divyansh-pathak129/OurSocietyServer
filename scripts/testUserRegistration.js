const dbConnection = require('../config/database');
const UserService = require('../models/services/UserService');
const SocietyService = require('../models/services/SocietyService');

/**
 * Test script for user registration
 * Creates a sample user registration to test the flow
 */

async function testUserRegistration() {
  try {
    console.log('🧪 Testing user registration...');
    
    // Connect to database
    const db = await dbConnection.connect();
    console.log('✅ Connected to database');
    
    const userService = new UserService(db);
    const societyService = new SocietyService(db);
    
    // Get a sample society
    const societies = await societyService.getActiveSocieties();
    if (!societies.data || societies.data.length === 0) {
      console.log('❌ No societies found. Please run seedSocieties.js first');
      return;
    }
    
    const sampleSociety = societies.data[0];
    console.log(`📋 Using society: ${sampleSociety.name} (ID: ${sampleSociety._id})`);
    
    // Test user data
    const testUserId = 'test_clerk_user_' + Date.now();
    const userData = {
      clerkUserId: testUserId,
      societyId: sampleSociety._id,
      societyName: sampleSociety.name,
      wing: 'Wing A',
      flatNumber: '101',
      residentType: 'Owner',
      contactNumber: '+91 9876543210',
      email: 'test@example.com',
      name: 'Test User',
      registrationDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('👤 Creating test user...');
    console.log(`   Clerk User ID: ${testUserId}`);
    console.log(`   Society: ${userData.societyName}`);
    console.log(`   Wing: ${userData.wing}, Flat: ${userData.flatNumber}`);
    console.log(`   Type: ${userData.residentType}`);
    
    // Test user registration
    const result = await userService.registerUser(userData);
    
    if (result.success) {
      console.log('✅ User registration successful!');
      console.log(`   User ID: ${result.data._id}`);
      console.log(`   Registration Date: ${result.data.registrationDate}`);
      
      // Test finding the user
      console.log('\n🔍 Testing user lookup...');
      const foundUser = await userService.findByClerkUserId(testUserId);
      
      if (foundUser.success && foundUser.data) {
        console.log('✅ User lookup successful!');
        console.log(`   Found user: ${foundUser.data.name}`);
        console.log(`   Society: ${foundUser.data.societyName}`);
        console.log(`   Wing: ${foundUser.data.wing}, Flat: ${foundUser.data.flatNumber}`);
        
        // Test registration status check (simulating API call)
        console.log('\n📊 Testing registration status check...');
        const isRegistered = !!foundUser.data;
        console.log(`✅ Registration status: ${isRegistered ? 'REGISTERED' : 'NOT REGISTERED'}`);
        
        if (isRegistered) {
          console.log('   Society Data:');
          console.log(`     - Society ID: ${foundUser.data.societyId}`);
          console.log(`     - Society Name: ${foundUser.data.societyName}`);
          console.log(`     - Wing: ${foundUser.data.wing}`);
          console.log(`     - Flat Number: ${foundUser.data.flatNumber}`);
          console.log(`     - Resident Type: ${foundUser.data.residentType}`);
        }
      } else {
        console.log('❌ User lookup failed');
      }
      
      // Clean up - remove test user
      console.log('\n🧹 Cleaning up test data...');
      const deleteResult = await userService.deleteById(result.data._id);
      if (deleteResult.success) {
        console.log('✅ Test user cleaned up successfully');
      }
      
    } else {
      console.log('❌ User registration failed:');
      console.log(`   Message: ${result.message}`);
      if (result.errors) {
        console.log('   Errors:', result.errors);
      }
    }
    
    console.log('\n🎉 User registration test completed!');
    
    return {
      success: result.success,
      societyId: sampleSociety._id,
      testUserId: testUserId
    };
    
  } catch (error) {
    console.error('❌ User registration test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close database connection
    await dbConnection.disconnect();
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testUserRegistration()
    .then(result => {
      if (result.success) {
        console.log('\n✅ User registration test script completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ User registration test script failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testUserRegistration };