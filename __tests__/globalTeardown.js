/**
 * Jest global teardown
 * Runs once after all tests
 */

module.exports = async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Small delay to ensure all connections are closed
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ Test environment cleanup complete');
};