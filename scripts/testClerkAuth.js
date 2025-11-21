const { clerkClient, verifyToken } = require('@clerk/clerk-sdk-node');

/**
 * Test script to check Clerk SDK functionality
 */

async function testClerkSDK() {
  try {
    console.log('🧪 Testing Clerk SDK...');
    
    // Check if verifyToken function exists
    console.log('📋 Checking available Clerk SDK methods...');
    console.log(`   clerkClient available: ${!!clerkClient}`);
    console.log(`   verifyToken function available: ${typeof verifyToken}`);
    
    // Check environment variables
    console.log('\n🔑 Checking environment variables...');
    console.log(`   CLERK_SECRET_KEY: ${process.env.CLERK_SECRET_KEY ? 'Set' : 'Not set'}`);
    console.log(`   CLERK_PUBLISHABLE_KEY: ${process.env.CLERK_PUBLISHABLE_KEY ? 'Set' : 'Not set'}`);
    
    // Check clerkClient methods
    console.log('\n📚 Available clerkClient methods:');
    if (clerkClient) {
      console.log(`   users: ${!!clerkClient.users}`);
      console.log(`   sessions: ${!!clerkClient.sessions}`);
      
      if (clerkClient.sessions) {
        console.log(`   sessions.verifySession: ${typeof clerkClient.sessions.verifySession}`);
        console.log(`   sessions.getSession: ${typeof clerkClient.sessions.getSession}`);
      }
    }
    
    // Test a simple Clerk operation (get users count)
    console.log('\n👥 Testing basic Clerk operation...');
    try {
      // This is just to test if the Clerk client is working
      const users = await clerkClient.users.getUserList({ limit: 1 });
      console.log(`✅ Clerk client is working. Found ${users.length} users (showing first 1)`);
    } catch (error) {
      console.log(`❌ Clerk client test failed: ${error.message}`);
    }
    
    console.log('\n🎉 Clerk SDK test completed!');
    
    return {
      success: true,
      hasVerifyToken: typeof verifyToken === 'function',
      hasClerkClient: !!clerkClient,
      hasSecretKey: !!process.env.CLERK_SECRET_KEY
    };
    
  } catch (error) {
    console.error('❌ Clerk SDK test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testClerkSDK()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Clerk SDK test completed successfully');
        
        if (!result.hasVerifyToken) {
          console.log('\n⚠️  verifyToken function not available - will need alternative approach');
        }
        
        process.exit(0);
      } else {
        console.log('\n❌ Clerk SDK test failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testClerkSDK };