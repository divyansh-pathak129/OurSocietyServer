const { 
  validateUser, 
  validateSociety, 
  validateMaintenance, 
  validateForum, 
  validateContact 
} = require('../models/schemas');
const { ObjectId } = require('mongodb');

/**
 * Schema Validation Test Script
 * Tests all validation functions with valid and invalid data
 */

function testUserValidation() {
  console.log('🧪 Testing User Validation...');
  
  // Valid user data
  const validUser = {
    clerkUserId: 'clerk_user_123',
    societyId: new ObjectId(),
    societyName: 'Green Valley Society',
    wing: 'A',
    flatNumber: '101',
    residentType: 'Owner',
    contactNumber: '+919876543210',
    email: 'user@example.com',
    name: 'John Doe',
    registrationDate: new Date(),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const validResult = validateUser(validUser);
  console.log('  ✓ Valid user:', validResult.isValid ? 'PASS' : 'FAIL');
  if (!validResult.isValid) {
    console.log('    Errors:', validResult.errors);
  }
  
  // Invalid user data
  const invalidUser = {
    clerkUserId: '', // Invalid: empty string
    societyId: 'invalid_id', // Invalid: not ObjectId
    residentType: 'InvalidType', // Invalid: not in enum
    email: 'invalid-email' // Invalid: not valid email
  };
  
  const invalidResult = validateUser(invalidUser);
  console.log('  ✓ Invalid user:', !invalidResult.isValid ? 'PASS' : 'FAIL');
  console.log('    Expected errors found:', invalidResult.errors.length, 'errors');
}

function testSocietyValidation() {
  console.log('🧪 Testing Society Validation...');
  
  // Valid society data
  const validSociety = {
    name: 'Green Valley Society',
    address: '123 Main Street, City',
    totalWings: 4,
    totalFlats: 120,
    adminUsers: ['clerk_admin_1', 'clerk_admin_2'],
    settings: {
      maintenanceAmount: 2500,
      maintenanceDueDate: 5,
      allowTenantForumAccess: true
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const validResult = validateSociety(validSociety);
  console.log('  ✓ Valid society:', validResult.isValid ? 'PASS' : 'FAIL');
  
  // Invalid society data
  const invalidSociety = {
    name: '', // Invalid: empty
    totalWings: -1, // Invalid: negative
    totalFlats: 0, // Invalid: zero
    adminUsers: 'not_array', // Invalid: not array
    settings: {
      maintenanceAmount: -100, // Invalid: negative
      maintenanceDueDate: 35 // Invalid: > 31
    }
  };
  
  const invalidResult = validateSociety(invalidSociety);
  console.log('  ✓ Invalid society:', !invalidResult.isValid ? 'PASS' : 'FAIL');
  console.log('    Expected errors found:', invalidResult.errors.length, 'errors');
}

function testMaintenanceValidation() {
  console.log('🧪 Testing Maintenance Validation...');
  
  // Valid maintenance data
  const validMaintenance = {
    societyId: new ObjectId(),
    clerkUserId: 'clerk_user_123',
    wing: 'A',
    flatNumber: '101',
    month: '2024-01',
    amount: 2500,
    dueDate: new Date(),
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const validResult = validateMaintenance(validMaintenance);
  console.log('  ✓ Valid maintenance:', validResult.isValid ? 'PASS' : 'FAIL');
  
  // Invalid maintenance data
  const invalidMaintenance = {
    societyId: 'invalid_id', // Invalid: not ObjectId
    month: '2024-13', // Invalid: month > 12
    amount: -100, // Invalid: negative
    status: 'invalid_status' // Invalid: not in enum
  };
  
  const invalidResult = validateMaintenance(invalidMaintenance);
  console.log('  ✓ Invalid maintenance:', !invalidResult.isValid ? 'PASS' : 'FAIL');
  console.log('    Expected errors found:', invalidResult.errors.length, 'errors');
}

function testForumValidation() {
  console.log('🧪 Testing Forum Validation...');
  
  // Valid forum data
  const validForum = {
    societyId: new ObjectId(),
    authorId: 'clerk_user_123',
    authorName: 'John Doe',
    authorWing: 'A',
    title: 'Community Meeting',
    content: 'We will have a community meeting next week.',
    category: 'general',
    isAnnouncement: false,
    isPinned: false,
    replies: [
      {
        authorId: 'clerk_user_456',
        authorName: 'Jane Smith',
        content: 'Thanks for the update!',
        createdAt: new Date()
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const validResult = validateForum(validForum);
  console.log('  ✓ Valid forum:', validResult.isValid ? 'PASS' : 'FAIL');
  
  // Invalid forum data
  const invalidForum = {
    societyId: 'invalid_id', // Invalid: not ObjectId
    category: 'invalid_category', // Invalid: not in enum
    replies: [
      {
        authorId: '', // Invalid: empty
        content: '' // Invalid: empty
      }
    ]
  };
  
  const invalidResult = validateForum(invalidForum);
  console.log('  ✓ Invalid forum:', !invalidResult.isValid ? 'PASS' : 'FAIL');
  console.log('    Expected errors found:', invalidResult.errors.length, 'errors');
}

function testContactValidation() {
  console.log('🧪 Testing Contact Validation...');
  
  // Valid contact data
  const validContact = {
    societyId: new ObjectId(),
    name: 'Security Guard',
    role: 'Security',
    phoneNumber: '+919876543210',
    email: 'security@society.com',
    isEmergency: true,
    isActive: true,
    addedBy: 'clerk_admin_123',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const validResult = validateContact(validContact);
  console.log('  ✓ Valid contact:', validResult.isValid ? 'PASS' : 'FAIL');
  
  // Invalid contact data
  const invalidContact = {
    societyId: 'invalid_id', // Invalid: not ObjectId
    role: 'InvalidRole', // Invalid: not in enum
    phoneNumber: 'invalid_phone', // Invalid: not valid phone
    email: 'invalid-email' // Invalid: not valid email
  };
  
  const invalidResult = validateContact(invalidContact);
  console.log('  ✓ Invalid contact:', !invalidResult.isValid ? 'PASS' : 'FAIL');
  console.log('    Expected errors found:', invalidResult.errors.length, 'errors');
}

function runAllTests() {
  console.log('🚀 Starting Schema Validation Tests...\n');
  
  testUserValidation();
  console.log();
  testSocietyValidation();
  console.log();
  testMaintenanceValidation();
  console.log();
  testForumValidation();
  console.log();
  testContactValidation();
  
  console.log('\n✅ All schema validation tests completed!');
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };