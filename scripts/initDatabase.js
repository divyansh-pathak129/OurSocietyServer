const dbConnection = require('../config/database');
const IndexManager = require('../models/indexManager');

/**
 * Database Initialization Script
 * Creates all required indexes and validates database setup
 */

async function initializeDatabase() {
  try {
    console.log('🚀 Starting database initialization...');
    
    // Connect to database
    const db = await dbConnection.connect();
    console.log('✅ Connected to database');
    
    // Create index manager
    const indexManager = new IndexManager(db);
    
    // Create all indexes
    await indexManager.createAllIndexes();
    
    // Validate indexes
    const validation = await indexManager.validateIndexes();
    
    if (validation.valid) {
      console.log('🎉 Database initialization completed successfully!');
      console.log(`✅ Created/verified indexes for ${validation.existing.length} index definitions`);
    } else {
      console.log('⚠️  Database initialization completed with warnings');
      console.log(`❌ Missing ${validation.missing.length} required indexes`);
    }
    
    // List all indexes for verification
    console.log('\n📋 Current database indexes:');
    const allIndexes = await indexManager.listAllIndexes();
    
    for (const [collectionName, indexes] of Object.entries(allIndexes)) {
      console.log(`\n${collectionName}:`);
      indexes.forEach(index => {
        const keyStr = JSON.stringify(index.key);
        const unique = index.unique ? ' (unique)' : '';
        console.log(`  - ${keyStr}${unique}`);
      });
    }
    
    return {
      success: true,
      validation,
      indexes: allIndexes
    };
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close database connection
    await dbConnection.disconnect();
  }
}

// Run initialization if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Database initialization script completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Database initialization script failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };