/**
 * Jest setup file
 * Runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'test-secret-key';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to generate random test data
  generateRandomString: (length = 8) => {
    return Math.random().toString(36).substring(2, length + 2);
  },
  
  // Helper to create test dates
  createTestDate: (daysFromNow = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date;
  }
};

// Console log suppression for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});