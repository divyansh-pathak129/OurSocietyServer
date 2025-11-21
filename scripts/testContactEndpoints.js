const axios = require('axios');
const { ObjectId } = require('mongodb');

/**
 * Comprehensive test suite for Contacts API endpoints
 * Tests all contact functionality including CRUD operations, emergency contacts, and admin features
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
const testContact = {
  name: 'Test Security Guard',
  role: 'Security',
  phoneNumber: '+1234567890',
  email: 'security@testsociety.com',
  isEmergency: false
};

const testEmergencyContact = {
  name: 'Emergency Services',
  role: 'Emergency',
  phoneNumber: '911',
  email: 'emergency@testsociety.com',
  isEmergency: true
};

const updatedContactData = {
  name: 'Updated Security Guard',
  role: 'Security',
  phoneNumber: '+1234567891',
  email: 'updated.security@testsociety.com',
  isEmergency: false
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
const testGetContacts = async () => {
  console.log('\n🧪 Testing GET /api/contacts - Get contacts');
  
  const response = await makeRequest('GET', '/contacts');
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully retrieved contacts');
    console.log(`   Found ${response.data.data?.length || 0} contacts`);
    return response.data.data;
  } else {
    console.log('❌ Failed to retrieve contacts');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return null;
  }
};

const testGetContactsWithFilters = async () => {
  console.log('\n🧪 Testing GET /api/contacts with filters');
  
  // Test role filter
  console.log('  Testing role filter...');
  const roleResponse = await makeRequest('GET', '/contacts?role=Security');
  
  if (roleResponse.success) {
    console.log('✅ Role filter works');
  } else {
    console.log('❌ Role filter failed');
  }

  // Test emergency filter
  console.log('  Testing emergency filter...');
  const emergencyResponse = await makeRequest('GET', '/contacts?emergencyOnly=true');
  
  if (emergencyResponse.success) {
    console.log('✅ Emergency filter works');
  } else {
    console.log('❌ Emergency filter failed');
  }

  // Test search
  console.log('  Testing search functionality...');
  const searchResponse = await makeRequest('GET', '/contacts?search=security');
  
  if (searchResponse.success) {
    console.log('✅ Search functionality works');
  } else {
    console.log('❌ Search functionality failed');
  }

  // Test pagination
  console.log('  Testing pagination...');
  const paginationResponse = await makeRequest('GET', '/contacts?page=1&limit=10');
  
  if (paginationResponse.success) {
    console.log('✅ Pagination works');
  } else {
    console.log('❌ Pagination failed');
  }
};

const testCreateContact = async () => {
  console.log('\n🧪 Testing POST /api/contacts - Create contact (admin only)');
  
  const response = await makeRequest('POST', '/contacts', testContact, TEST_CONFIG.adminToken);
  
  if (response.success && response.status === 201) {
    console.log('✅ Successfully created contact');
    console.log(`   Contact ID: ${response.data.data._id}`);
    return response.data.data;
  } else {
    console.log('❌ Failed to create contact');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return null;
  }
};

const testCreateContactValidation = async () => {
  console.log('\n🧪 Testing POST /api/contacts validation');
  
  // Test missing name
  console.log('  Testing missing name...');
  const noNameResponse = await makeRequest('POST', '/contacts', { 
    role: 'Security', 
    phoneNumber: '+1234567890' 
  }, TEST_CONFIG.adminToken);
  
  if (noNameResponse.status === 400) {
    console.log('✅ Validation correctly rejects missing name');
  } else {
    console.log('❌ Validation should reject missing name');
  }

  // Test missing role
  console.log('  Testing missing role...');
  const noRoleResponse = await makeRequest('POST', '/contacts', { 
    name: 'Test Contact', 
    phoneNumber: '+1234567890' 
  }, TEST_CONFIG.adminToken);
  
  if (noRoleResponse.status === 400) {
    console.log('✅ Validation correctly rejects missing role');
  } else {
    console.log('❌ Validation should reject missing role');
  }

  // Test missing phone number
  console.log('  Testing missing phone number...');
  const noPhoneResponse = await makeRequest('POST', '/contacts', { 
    name: 'Test Contact', 
    role: 'Security' 
  }, TEST_CONFIG.adminToken);
  
  if (noPhoneResponse.status === 400) {
    console.log('✅ Validation correctly rejects missing phone number');
  } else {
    console.log('❌ Validation should reject missing phone number');
  }

  // Test invalid role
  console.log('  Testing invalid role...');
  const invalidRoleResponse = await makeRequest('POST', '/contacts', {
    name: 'Test Contact',
    role: 'InvalidRole',
    phoneNumber: '+1234567890'
  }, TEST_CONFIG.adminToken);
  
  if (invalidRoleResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid role');
  } else {
    console.log('❌ Validation should reject invalid role');
  }

  // Test non-admin user trying to create contact
  console.log('  Testing non-admin user access...');
  const nonAdminResponse = await makeRequest('POST', '/contacts', testContact, TEST_CONFIG.userToken);
  
  if (nonAdminResponse.status === 403) {
    console.log('✅ Correctly prevents non-admin users from creating contacts');
  } else {
    console.log('❌ Should prevent non-admin users from creating contacts');
  }
};

const testCreateEmergencyContact = async () => {
  console.log('\n🧪 Testing POST /api/contacts - Create emergency contact');
  
  const response = await makeRequest('POST', '/contacts', testEmergencyContact, TEST_CONFIG.adminToken);
  
  if (response.success && response.status === 201) {
    console.log('✅ Successfully created emergency contact');
    console.log(`   Emergency Contact ID: ${response.data.data._id}`);
    return response.data.data;
  } else {
    console.log('❌ Failed to create emergency contact');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return null;
  }
};

const testUpdateContact = async (contactId) => {
  if (!contactId) {
    console.log('\n⏭️  Skipping update test - no contact ID available');
    return false;
  }

  console.log('\n🧪 Testing PUT /api/contacts/:id - Update contact (admin only)');
  
  const response = await makeRequest('PUT', `/contacts/${contactId}`, updatedContactData, TEST_CONFIG.adminToken);
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully updated contact');
    return true;
  } else {
    console.log('❌ Failed to update contact');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testUpdateContactValidation = async () => {
  console.log('\n🧪 Testing PUT /api/contacts/:id validation');
  
  // Test invalid contact ID
  console.log('  Testing invalid contact ID...');
  const invalidIdResponse = await makeRequest('PUT', '/contacts/invalid_id', updatedContactData, TEST_CONFIG.adminToken);
  
  if (invalidIdResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid contact ID');
  } else {
    console.log('❌ Validation should reject invalid contact ID');
  }

  // Test non-existent contact
  console.log('  Testing non-existent contact...');
  const nonExistentResponse = await makeRequest('PUT', `/contacts/${new ObjectId()}`, updatedContactData, TEST_CONFIG.adminToken);
  
  if (nonExistentResponse.status === 404) {
    console.log('✅ Correctly handles non-existent contact');
  } else {
    console.log('❌ Should return 404 for non-existent contact');
  }

  // Test non-admin user trying to update contact
  console.log('  Testing non-admin user access...');
  const nonAdminResponse = await makeRequest('PUT', `/contacts/${new ObjectId()}`, updatedContactData, TEST_CONFIG.userToken);
  
  if (nonAdminResponse.status === 403) {
    console.log('✅ Correctly prevents non-admin users from updating contacts');
  } else {
    console.log('❌ Should prevent non-admin users from updating contacts');
  }
};

const testGetEmergencyContacts = async () => {
  console.log('\n🧪 Testing GET /api/contacts/emergency - Get emergency contacts');
  
  const response = await makeRequest('GET', '/contacts/emergency');
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully retrieved emergency contacts');
    console.log(`   Found ${response.data.data?.length || 0} emergency contacts`);
    return true;
  } else {
    console.log('❌ Failed to retrieve emergency contacts');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testGetContactStats = async () => {
  console.log('\n🧪 Testing GET /api/contacts/stats - Get contact statistics');
  
  const response = await makeRequest('GET', '/contacts/stats');
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully retrieved contact statistics');
    console.log(`   Total contacts: ${response.data.data?.total || 0}`);
    console.log(`   Emergency contacts: ${response.data.data?.totalEmergency || 0}`);
    return true;
  } else {
    console.log('❌ Failed to retrieve contact statistics');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testToggleEmergencyStatus = async (contactId) => {
  if (!contactId) {
    console.log('\n⏭️  Skipping emergency toggle test - no contact ID available');
    return false;
  }

  console.log('\n🧪 Testing PUT /api/contacts/:id/emergency - Toggle emergency status');
  
  // Test marking as emergency
  console.log('  Testing mark as emergency...');
  const markEmergencyResponse = await makeRequest('PUT', `/contacts/${contactId}/emergency`, { isEmergency: true }, TEST_CONFIG.adminToken);
  
  if (markEmergencyResponse.success) {
    console.log('✅ Successfully marked contact as emergency');
    
    // Test unmarking as emergency
    console.log('  Testing unmark as emergency...');
    const unmarkEmergencyResponse = await makeRequest('PUT', `/contacts/${contactId}/emergency`, { isEmergency: false }, TEST_CONFIG.adminToken);
    
    if (unmarkEmergencyResponse.success) {
      console.log('✅ Successfully unmarked contact as emergency');
      return true;
    } else {
      console.log('❌ Failed to unmark contact as emergency');
    }
  } else {
    console.log('❌ Failed to mark contact as emergency');
    console.log(`   Status: ${markEmergencyResponse.status}`);
    console.log(`   Error: ${markEmergencyResponse.data.message || 'Unknown error'}`);
  }
  
  return false;
};

const testToggleEmergencyValidation = async () => {
  console.log('\n🧪 Testing PUT /api/contacts/:id/emergency validation');
  
  // Test invalid contact ID
  console.log('  Testing invalid contact ID...');
  const invalidIdResponse = await makeRequest('PUT', '/contacts/invalid_id/emergency', { isEmergency: true }, TEST_CONFIG.adminToken);
  
  if (invalidIdResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid contact ID');
  } else {
    console.log('❌ Validation should reject invalid contact ID');
  }

  // Test invalid isEmergency value
  console.log('  Testing invalid isEmergency value...');
  const invalidValueResponse = await makeRequest('PUT', `/contacts/${new ObjectId()}/emergency`, { isEmergency: 'invalid' }, TEST_CONFIG.adminToken);
  
  if (invalidValueResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid isEmergency value');
  } else {
    console.log('❌ Validation should reject invalid isEmergency value');
  }

  // Test non-admin user trying to toggle emergency status
  console.log('  Testing non-admin user access...');
  const nonAdminResponse = await makeRequest('PUT', `/contacts/${new ObjectId()}/emergency`, { isEmergency: true }, TEST_CONFIG.userToken);
  
  if (nonAdminResponse.status === 403) {
    console.log('✅ Correctly prevents non-admin users from toggling emergency status');
  } else {
    console.log('❌ Should prevent non-admin users from toggling emergency status');
  }
};

const testDeleteContact = async (contactId) => {
  if (!contactId) {
    console.log('\n⏭️  Skipping delete test - no contact ID available');
    return false;
  }

  console.log('\n🧪 Testing DELETE /api/contacts/:id - Delete contact (admin only)');
  
  const response = await makeRequest('DELETE', `/contacts/${contactId}`, null, TEST_CONFIG.adminToken);
  
  if (response.success && response.status === 200) {
    console.log('✅ Successfully deleted contact');
    return true;
  } else {
    console.log('❌ Failed to delete contact');
    console.log(`   Status: ${response.status}`);
    console.log(`   Error: ${response.data.message || 'Unknown error'}`);
    return false;
  }
};

const testDeleteValidation = async () => {
  console.log('\n🧪 Testing DELETE /api/contacts/:id validation');
  
  // Test invalid contact ID
  console.log('  Testing invalid contact ID...');
  const invalidIdResponse = await makeRequest('DELETE', '/contacts/invalid_id', null, TEST_CONFIG.adminToken);
  
  if (invalidIdResponse.status === 400) {
    console.log('✅ Validation correctly rejects invalid contact ID');
  } else {
    console.log('❌ Validation should reject invalid contact ID');
  }

  // Test non-existent contact
  console.log('  Testing non-existent contact...');
  const nonExistentResponse = await makeRequest('DELETE', `/contacts/${new ObjectId()}`, null, TEST_CONFIG.adminToken);
  
  if (nonExistentResponse.status === 404) {
    console.log('✅ Correctly handles non-existent contact');
  } else {
    console.log('❌ Should return 404 for non-existent contact');
  }

  // Test non-admin user trying to delete contact
  console.log('  Testing non-admin user access...');
  const nonAdminResponse = await makeRequest('DELETE', `/contacts/${new ObjectId()}`, null, TEST_CONFIG.userToken);
  
  if (nonAdminResponse.status === 403) {
    console.log('✅ Correctly prevents non-admin users from deleting contacts');
  } else {
    console.log('❌ Should prevent non-admin users from deleting contacts');
  }
};

// Main test runner
const runContactTests = async () => {
  console.log('🚀 Starting Contacts API Endpoint Tests');
  console.log('=======================================');
  
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

  let createdContactId = null;
  let createdEmergencyContactId = null;
  let testResults = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  // Run tests in sequence
  try {
    // Basic retrieval tests
    await testGetContacts();
    await testGetContactsWithFilters();
    
    // Create contact tests
    const createdContact = await testCreateContact();
    if (createdContact) {
      createdContactId = createdContact._id;
      testResults.passed++;
    } else {
      testResults.failed++;
    }

    await testCreateContactValidation();
    
    // Create emergency contact
    const createdEmergencyContact = await testCreateEmergencyContact();
    if (createdEmergencyContact) {
      createdEmergencyContactId = createdEmergencyContact._id;
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    // Update contact tests
    if (await testUpdateContact(createdContactId)) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    await testUpdateContactValidation();
    
    // Emergency contacts tests
    if (await testGetEmergencyContacts()) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    // Statistics tests
    if (await testGetContactStats()) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    // Emergency status toggle tests
    if (await testToggleEmergencyStatus(createdContactId)) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    await testToggleEmergencyValidation();
    
    // Validation tests
    await testDeleteValidation();
    
    // Clean up - delete the test contacts
    if (await testDeleteContact(createdContactId)) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
    
    if (await testDeleteContact(createdEmergencyContactId)) {
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
  runContactTests().catch(console.error);
}

module.exports = {
  runContactTests,
  testGetContacts,
  testCreateContact,
  testUpdateContact,
  testDeleteContact,
  testGetEmergencyContacts,
  testGetContactStats,
  testToggleEmergencyStatus
};