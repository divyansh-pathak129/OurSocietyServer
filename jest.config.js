/**
 * Jest configuration for backend integration tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/jest.setup.js'],

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'config/**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/scripts/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Test timeout (increased for database operations)
  testTimeout: 30000,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Transform configuration
  transform: {},

  // Module file extensions
  moduleFileExtensions: ['js', 'json'],

  // Global setup and teardown
  globalSetup: '<rootDir>/__tests__/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/globalTeardown.js',

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Maximum worker processes
  maxWorkers: 1, // Use single worker for database tests to avoid conflicts
};