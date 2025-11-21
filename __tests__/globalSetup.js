/**
 * Jest global setup
 * Runs once before all tests
 */

require('dotenv').config();

module.exports = async () => {
  console.log('🧪 Setting up test environment...');
  
  // Ensure required environment variables are set
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required for testing');
  }
  
  // Set test-specific environment variables
  process.env.NODE_ENV = 'test';
  process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'test-secret-key';
  
  console.log('✅ Test environment setup complete');
};