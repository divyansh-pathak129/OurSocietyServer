const axios = require('axios');
const { ObjectId } = require('mongodb');

/**
 * Comprehensive test suite for Forum API endpoints
 * Tests all forum functionality including CRUD operations, replies, and admin features
 */

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// Test configuration
const TEST_CONFIG = {
  // These would normally come from your test environment
  // For now, using placeholder values - replace with actual test tokens
  userToken: 'test_user_token_here', // Replace with actual Clerk token
  adminToken: 'test_admin_token_here', // Replace with actual admin Clerk token
  societyId: new ObjectId().toString(), // Replace with actual test society ID
  testTimeout: 10000
};

// Test data
const testForumPost = {
  title: 'Test Forum Post',
  content: 'This is a test forum post content for testing purposes.',
  category: 'general'
};

const testReply = {
  content: 'This is a test reply to the forum post.'
};

const updatedPostData = {
  title: 'Updated Test Forum Post',
  content: 'This is updated content for the test forum post.',
  category: 'maintenance'
};

// Helper function to make authenticated requests
const makeRequest = async (method, endpoint, data = null, token = TEST_CONFIG.userToken) => {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
    }

    const response = await axios(config);
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 500,
      data: error.response?.data || { message: error.message }
    };
  }
};

// Test functions
const testGetForumPosts = async () => {
  console.log('\n🧪 Testing GET /api/forum - Get forum posts');
  
  const response = await makeRequest('GET', '/forum');
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully retrieved forum posts');
    console.log(`   Found ${response.data.data?.length || 0} posts`);
    return response.data.data;
  } else {
    console.log('❌ Failed to retrieve forum posts');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return null;
  }
};

const testGetForumPostsWithFilters = async () => {
  console.log('\n🧪 Testing GET /api/forum with filters');
  
  // Test category filter
  console.log('  Testing category filter...');
  const categoryResponse = await makeRequest('GET', '/forum?category=general');
  
  if (categoryResponse.success) {
    console.log('✅ Category filter works');
  } else {
    console.log('❌ Category filter failed');
  }

  // Test announcements filter
  console.log('  Testing announcements filter...');
  const announcementResponse = await makeRequest('GET', '/forum?announcementsOnly=true');
  
  if (announcementResponse.success) {
    console.log('✅ Announcements filter works');
  } else {
    console.log('❌ Announcements filter failed');
  }

  // Test search
  console.log('  Testing search functionality...');
  const searchResponse = await makeRequest('GET', '/forum?search=test');
  
  if (searchResponse.success) {
    console.log('✅ Search functionality works');
  } else {
    console.log('❌ Search functionality failed');
  }

  // Test pagination
  console.log('  Testing pagination...');
  const paginationResponse = await makeRequest('GET', '/forum?page=1&limit=5');
  
  if (paginationResponse.success) {
    console.log('✅ Pagination works');
  } else {
    console.log('❌ Pagination failed');
  }
};

const testCreateForumPost = async () => {
  console.log('\n🧪 Testing POST /api/forum - Create forum post');
  
  const response = await makeRequest('POST', '/forum', testForumPost);
  
  if (response.success && response.status === 201) {
    console.log('✅ Successfully created forum post');
    console.log(`   Post ID: ${response.data.data._id}`);
    return response.data.data;
  } else {
    console.log('❌ Failed to create forum post');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return null;
  }
};

const testCreateForumPostValidation = async () => {
  console.log('\n🧪 Testing POST /api/forum validation');
  
  // Test missing title
  console.log('  Testing missing title...');
  const noTitleResponse = await makeRequest('POST', '/forum', { content: 'Test content' });
  
  if (noTitleResponse.status === 400) {
    console.log('✅ Validation correctly rejects missing title');
  } else {
    console.log('❌ Validation should reject missing title');
  }

  // Test missing content
  console.log('  Testing missing content...');
  const noContentResponse = await makeRequest('POST', '/forum', { title: 'Test title' });
  
  if (noContentResponse.status === 400) {
    console.log('✅ Validation correctly rejects missing content');
  } else {
    console.log('❌ Validation should reject missing content');
  }

  // Test invalid category
  console.log('  Testing invalid category...');
  const invalidCategoryResponse = await makeRequest('POST', '/forum', {
    title: 'Test title',
    content: 'Test content',
    category: 'invalid_category'
  });
  
  if (invalidCategoryResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid category');
  } else {
    console.log('❌ Validation should reject invalid category');
  }
};

const testUpdateForumPost = async (postId) => {
  if (!postId) {
    console.log('\n⏭️  Skipping update test - no post ID available');
    return false;
  }

  console.log('\n🧪 Testing PUT /api/forum/:id - Update forum post');
  
  const response = await makeRequest('PUT', `/forum/${postId}`, updatedPostData);
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully updated forum post');
    return true;
  } else {
    console.log('❌ Failed to update forum post');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testUpdateForumPostValidation = async () => {
  console.log('\n🧪 Testing PUT /api/forum/:id validation');
  
  // Test invalid post ID
  console.log('  Testing invalid post ID...');
  const invalidIdResponse = await makeRequest('PUT', '/forum/invalid_id', updatedPostData);
  
  if (invalidIdResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid post ID');
  } else {
    console.log('❌ Validation should reject invalid post ID');
  }

  // Test non-existent post
  console.log('  Testing non-existent post...');
  const nonExistentResponse = await makeRequest('PUT', `/forum/${new ObjectId()}`, updatedPostData);
  
  if (nonExistentResponse.status === 404) {
    console.log('✅ Correctly handles non-existent post');
  } else {
    console.log('❌ Should return 404 for non-existent post');
  }
};

const testAddReply = async (postId) => {
  if (!postId) {
    console.log('\n⏭️  Skipping reply test - no post ID available');
    return false;
  }

  console.log('\n🧪 Testing POST /api/forum/:id/reply - Add reply');
  
  const response = await makeRequest('POST', `/forum/${postId}/reply`, testReply);
  
  if (response.success && response.status === 201) {
    console.log('✅ Successfully added reply to forum post');
    return true;
  } else {
    console.log('❌ Failed to add reply to forum post');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testAddReplyValidation = async (postId) => {
  if (!postId) {
    console.log('\n⏭️  Skipping reply validation test - no post ID available');
    return;
  }

  console.log('\n🧪 Testing POST /api/forum/:id/reply validation');
  
  // Test missing content
  console.log('  Testing missing reply content...');
  const noContentResponse = await makeRequest('POST', `/forum/${postId}/reply`, {});
  
  if (noContentResponse.status === 400) {
    console.log('✅ Validation correctly rejects missing reply content');
  } else {
    console.log('❌ Validation should reject missing reply content');
  }

  // Test empty content
  console.log('  Testing empty reply content...');
  const emptyContentResponse = await makeRequest('POST', `/forum/${postId}/reply`, { content: '' });
  
  if (emptyContentResponse.status === 400) {
    console.log('✅ Validation correctly rejects empty reply content');
  } else {
    console.log('❌ Validation should reject empty reply content');
  }
};

const testAdminFunctions = async (postId) => {
  if (!postId) {
    console.log('\n⏭️  Skipping admin tests - no post ID available');
    return;
  }

  console.log('\n🧪 Testing admin functions');
  
  // Test pin/unpin (requires admin token)
  console.log('  Testing pin functionality...');
  const pinResponse = await makeRequest('PUT', `/forum/${postId}/pin`, { isPinned: true }, TEST_CONFIG.adminToken);
  
  if (pinResponse.success) {
    console.log('✅ Pin functionality works');
    
    // Test unpin
    const unpinResponse = await makeRequest('PUT', `/forum/${postId}/pin`, { isPinned: false }, TEST_CONFIG.adminToken);
    if (unpinResponse.success) {
      console.log('✅ Unpin functionality works');
    }
  } else {
    console.log('❌ Pin functionality failed (may need valid admin token)');
  }

  // Test announcement toggle (requires admin token)
  console.log('  Testing announcement functionality...');
  const announcementResponse = await makeRequest('PUT', `/forum/${postId}/announcement`, { isAnnouncement: true }, TEST_CONFIG.adminToken);
  
  if (announcementResponse.success) {
    console.log('✅ Announcement functionality works');
  } else {
    console.log('❌ Announcement functionality failed (may need valid admin token)');
  }
};

const testGetForumStats = async () => {
  console.log('\n🧪 Testing GET /api/forum/stats - Get forum statistics');
  
  const response = await makeRequest('GET', '/forum/stats');
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully retrieved forum statistics');
    console.log(`   Total posts: ${response.data.data?.totalPosts || 0}`);
    console.log(`   Total replies: ${response.data.data?.totalReplies || 0}`);
    return true;
  } else {
    console.log('❌ Failed to retrieve forum statistics');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testGetUserPosts = async () => {
  console.log('\n🧪 Testing GET /api/forum/my-posts - Get user posts');
  
  const response = await makeRequest('GET', '/forum/my-posts');
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully retrieved user posts');
    console.log(`   Found ${response.data.data?.length || 0} user posts`);
    return true;
  } else {
    console.log('❌ Failed to retrieve user posts');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testDeleteForumPost = async (postId) => {
  if (!postId) {
    console.log('\n⏭️  Skipping delete test - no post ID available');
    return false;
  }

  console.log('\n🧪 Testing DELETE /api/forum/:id - Delete forum post');
  
  const response = await makeRequest('DELETE', `/forum/${postId}`);
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully deleted forum post');
    return true;
  } else {
    console.log('❌ Failed to delete forum post');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testDeleteValidation = async () => {
  console.log('\n🧪 Testing DELETE /api/forum/:id validation');
  
  // Test invalid post ID
  console.log('  Testing invalid post ID...');
  const invalidIdResponse = await makeRequest('DELETE', '/forum/invalid_id');
  
  if (invalidIdResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid post ID');
  } else {
    console.log('❌ Validation should reject invalid post ID');
  }

  // Test non-existent post
  console.log('  Testing non-existent post...');
  const nonExistentResponse = await makeRequest('DELETE', `/forum/${new ObjectId()}`);
  
  if (nonExistentResponse.status === 404) {
    console.log('✅ Correctly handles non-existent post');
  } else {
    console.log('❌ Should return 404 for non-existent post');
  }
};

// Main test runner
const runForumTests = async () => {
  console.log('🚀 Starting Forum API Endpoint Tests');
  console.log('=====================================');
  
  // Check if server is running
  try {
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    if (healthResponse.status !== 200) {
      throw new Error('Server health check failed');
    }
    console.log('✅ Server is running and healthy');
  } catch (error) {
    console.log('❌ Server is not running or not healthy');
    console.log('   Please start the server with: npm run dev');
    return;
  }

  // Warning about test tokens
  if (TEST_CONFIG.userToken === 'test_user_token_here') {
    console.log('\n⚠️  WARNING: Using placeholder test tokens');
    console.log('   Replace TEST_CONFIG tokens with actual Clerk tokens for full testing');
    console.log('   Some tests may fail due to authentication requirements\n');
  }

  let createdPostId = null;
  let testResults = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  // Run tests in sequence
  try {
    // Basic CRUD tests
    await testGetForumPosts();
    await testGetForumPostsWithFilters();
    
    const createdPost = await testCreateForumPost();
    if (createdPost) {
      createdPostId = createdPost._id;
      testResults.passed++;
    } else {
      testResults.failed++;
    }

    await testCreateForumPostValidation();
    
    if (await testUpdateForumPost(createdPostId)) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    await testUpdateForumPostValidation();
    
    if (await testAddReply(createdPostId)) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    await testAddReplyValidation(createdPostId);
    
    // Admin function tests
    await testAdminFunctions(createdPostId);
    
    // Statistics and user posts
    if (await testGetForumStats()) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    if (await testGetUserPosts()) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    // Validation tests
    await testDeleteValidation();
    
    // Clean up - delete the test post
    if (await testDeleteForumPost(createdPostId)) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }

  } catch (error) {
    console.log(`\n❌ Test execution error: ${error.message}`);
    testResults.failed++;
  }

  // Test summary
  console.log('\n📊 Test Results Summary');
  console.log('======================');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`📈 Total: ${testResults.passed + testResults.failed + testResults.skipped}`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All tests completed successfully!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
};

// Run tests if this file is executed directly
if (require.main === module) {
  runForumTests().catch(console.error);
}

module.exports = {
  runForumTests,
  testGetForumPosts,
  testCreateForumPost,
  testUpdateForumPost,
  testAddReply,
  testDeleteForumPost,
  testGetForumStats,
  testGetUserPosts
};