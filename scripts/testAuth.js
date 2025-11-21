const express = require('express');
const { verifyClerkToken, optionalAuth, getUserDetails } = require('../middleware/auth');
require('dotenv').config();

// Create a test Express app
const app = express();
app.use(express.json());

// Test route for protected endpoint
app.get('/test/protected', verifyClerkToken, (req, res) => {
  res.json({
    message: 'Protected route accessed successfully',
    userId: req.userId,
    sessionId: req.session?.id
  });
});

// Test route for protected endpoint with user details
app.get('/test/user-details', verifyClerkToken, getUserDetails, (req, res) => {
  res.json({
    message: 'User details retrieved successfully',
    user: req.user
  });
});

// Test route for optional auth
app.get('/test/optional', optionalAuth, (req, res) => {
  res.json({
    message: 'Optional auth route accessed',
    authenticated: !!req.userId,
    userId: req.userId || 'anonymous'
  });
});

// Test route for public access
app.get('/test/public', (req, res) => {
  res.json({
    message: 'Public route accessed successfully',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Test server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start test server
const PORT = 3001; // Use different port to avoid conflicts
const server = app.listen(PORT, () => {
  console.log(`🧪 Auth middleware test server running on http://localhost:${PORT}`);
  console.log('\nTest endpoints:');
  console.log(`📍 GET http://localhost:${PORT}/test/public - Public access`);
  console.log(`🔒 GET http://localhost:${PORT}/test/protected - Requires auth header`);
  console.log(`👤 GET http://localhost:${PORT}/test/user-details - Requires auth + user details`);
  console.log(`🔓 GET http://localhost:${PORT}/test/optional - Optional auth`);
  console.log('\nTo test protected routes, include header:');
  console.log('Authorization: Bearer <your-clerk-session-token>');
  console.log('\nPress Ctrl+C to stop the test server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test server...');
  server.close(() => {
    console.log('✅ Test server stopped');
    process.exit(0);
  });
});

// Test the middleware functions directly
async function runDirectTests() {
  console.log('\n🔍 Running direct middleware tests...\n');
  
  // Test 1: Missing authorization header
  console.log('Test 1: Missing authorization header');
  const mockReq1 = { headers: {} };
  const mockRes1 = {
    status: (code) => ({
      json: (data) => console.log(`  Status: ${code}, Response:`, data)
    })
  };
  
  await verifyClerkToken(mockReq1, mockRes1, () => {
    console.log('  ❌ Should not reach next() with missing header');
  });
  
  // Test 2: Invalid authorization header format
  console.log('\nTest 2: Invalid authorization header format');
  const mockReq2 = { headers: { authorization: 'InvalidFormat token123' } };
  const mockRes2 = {
    status: (code) => ({
      json: (data) => console.log(`  Status: ${code}, Response:`, data)
    })
  };
  
  await verifyClerkToken(mockReq2, mockRes2, () => {
    console.log('  ❌ Should not reach next() with invalid header format');
  });
  
  // Test 3: Empty token
  console.log('\nTest 3: Empty Bearer token');
  const mockReq3 = { headers: { authorization: 'Bearer ' } };
  const mockRes3 = {
    status: (code) => ({
      json: (data) => console.log(`  Status: ${code}, Response:`, data)
    })
  };
  
  await verifyClerkToken(mockReq3, mockRes3, () => {
    console.log('  ❌ Should not reach next() with empty token');
  });
  
  console.log('\n✅ Direct middleware tests completed');
  console.log('\n💡 To test with real Clerk tokens, use the test server endpoints above');
}

// Run direct tests
runDirectTests();