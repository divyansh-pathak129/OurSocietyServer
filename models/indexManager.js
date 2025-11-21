const { DatabaseIndexes } = require('./schemas');

/**
 * Database Index Manager
 * Handles creation and management of database indexes for optimal query performance
 */

class IndexManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Create all indexes for all collections
   */
  async createAllIndexes() {
    try {
      console.log('Creating database indexes...');
      
      const results = {};
      
      // Create indexes for each collection
      for (const [collectionName, indexes] of Object.entries(DatabaseIndexes)) {
        results[collectionName] = await this.createCollectionIndexes(collectionName, indexes);
      }
      
      console.log('✅ All database indexes created successfully');
      return results;
    } catch (error) {
      console.error('❌ Error creating database indexes:', error.message);
      throw error;
    }
  }

  /**
   * Create indexes for a specific collection
   */
  async createCollectionIndexes(collectionName, indexes) {
    try {
      const collection = this.db.collection(collectionName);
      const results = [];
      
      console.log(`Creating indexes for ${collectionName} collection...`);
      
      for (const indexSpec of indexes) {
        try {
          const result = await collection.createIndex(indexSpec.key, indexSpec.options);
          results.push({
            collection: collectionName,
            index: indexSpec.key,
            result: result,
            status: 'created'
          });
          console.log(`  ✓ Index created: ${JSON.stringify(indexSpec.key)}`);
        } catch (error) {
          // Index might already exist, which is fine
          if (error.code === 85 || error.message.includes('already exists')) {
            results.push({
              collection: collectionName,
              index: indexSpec.key,
              result: 'already exists',
              status: 'exists'
            });
            console.log(`  ✓ Index already exists: ${JSON.stringify(indexSpec.key)}`);
          } else {
            console.error(`  ❌ Failed to create index ${JSON.stringify(indexSpec.key)}:`, error.message);
            results.push({
              collection: collectionName,
              index: indexSpec.key,
              error: error.message,
              status: 'failed'
            });
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error(`Error creating indexes for ${collectionName}:`, error.message);
      throw error;
    }
  }

  /**
   * List all indexes for a collection
   */
  async listCollectionIndexes(collectionName) {
    try {
      const collection = this.db.collection(collectionName);
      const indexes = await collection.listIndexes().toArray();
      return indexes;
    } catch (error) {
      console.error(`Error listing indexes for ${collectionName}:`, error.message);
      throw error;
    }
  }

  /**
   * List all indexes for all collections
   */
  async listAllIndexes() {
    try {
      const results = {};
      
      for (const collectionName of Object.keys(DatabaseIndexes)) {
        results[collectionName] = await this.listCollectionIndexes(collectionName);
      }
      
      return results;
    } catch (error) {
      console.error('Error listing all indexes:', error.message);
      throw error;
    }
  }

  /**
   * Drop an index from a collection
   */
  async dropIndex(collectionName, indexName) {
    try {
      const collection = this.db.collection(collectionName);
      const result = await collection.dropIndex(indexName);
      console.log(`✓ Index ${indexName} dropped from ${collectionName}`);
      return result;
    } catch (error) {
      console.error(`Error dropping index ${indexName} from ${collectionName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get index statistics for performance monitoring
   */
  async getIndexStats(collectionName) {
    try {
      const collection = this.db.collection(collectionName);
      const stats = await collection.aggregate([
        { $indexStats: {} }
      ]).toArray();
      return stats;
    } catch (error) {
      console.error(`Error getting index stats for ${collectionName}:`, error.message);
      throw error;
    }
  }

  /**
   * Validate that all required indexes exist
   */
  async validateIndexes() {
    try {
      console.log('Validating database indexes...');
      
      const validation = {
        valid: true,
        missing: [],
        existing: []
      };
      
      for (const [collectionName, expectedIndexes] of Object.entries(DatabaseIndexes)) {
        const existingIndexes = await this.listCollectionIndexes(collectionName);
        const existingIndexKeys = existingIndexes.map(idx => JSON.stringify(idx.key));
        
        for (const expectedIndex of expectedIndexes) {
          const expectedKey = JSON.stringify(expectedIndex.key);
          
          if (existingIndexKeys.includes(expectedKey)) {
            validation.existing.push({
              collection: collectionName,
              index: expectedIndex.key
            });
          } else {
            validation.valid = false;
            validation.missing.push({
              collection: collectionName,
              index: expectedIndex.key
            });
          }
        }
      }
      
      if (validation.valid) {
        console.log('✅ All required indexes are present');
      } else {
        console.log('⚠️  Some required indexes are missing');
        validation.missing.forEach(missing => {
          console.log(`  Missing: ${missing.collection} - ${JSON.stringify(missing.index)}`);
        });
      }
      
      return validation;
    } catch (error) {
      console.error('Error validating indexes:', error.message);
      throw error;
    }
  }
}

module.exports = IndexManager;