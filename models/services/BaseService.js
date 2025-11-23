const { ObjectId } = require('mongodb');

/**
 * Base Database Service Class
 * Provides common CRUD operations and error handling for all collections
 */

class BaseService {
  constructor(db, collectionName, validator) {
    this.db = db;
    this.collectionName = collectionName;
    this.collection = db.collection(collectionName);
    this.validator = validator;
  }

  /**
   * Create a new document
   */
  async create(data) {
    try {
      // Add timestamps
      const now = new Date();
      const documentData = {
        ...data,
        createdAt: now,
        updatedAt: now
      };

      // Validate data if validator is provided
      if (this.validator) {
        const validation = this.validator(documentData);
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
      }

      const result = await this.collection.insertOne(documentData);
      
      if (!result.acknowledged) {
        throw new Error('Failed to create document');
      }

      return {
        success: true,
        data: {
          _id: result.insertedId,
          ...documentData
        }
      };
    } catch (error) {
      console.error(`Error creating document in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to create ${this.collectionName.slice(0, -1)}: ${error.message}`);
    }
  }

  /**
   * Find a document by ID
   */
  async findById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw new Error('Invalid document ID');
      }

      const document = await this.collection.findOne({ _id: new ObjectId(id) });
      
      return {
        success: true,
        data: document
      };
    } catch (error) {
      console.error(`Error finding document by ID in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to find ${this.collectionName.slice(0, -1)}: ${error.message}`);
    }
  }

  /**
   * Find documents by query
   */
  async find(query = {}, options = {}) {
    try {
      const {
        limit = 100,
        skip = 0,
        sort = { createdAt: -1 },
        projection = {}
      } = options;

      const cursor = this.collection
        .find(query, { projection })
        .sort(sort)
        .skip(skip)
        .limit(limit);

      const documents = await cursor.toArray();
      const total = await this.collection.countDocuments(query);

      return {
        success: true,
        data: documents,
        pagination: {
          total,
          limit,
          skip,
          hasMore: skip + documents.length < total
        }
      };
    } catch (error) {
      console.error(`Error finding documents in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to find ${this.collectionName}: ${error.message}`);
    }
  }

  /**
   * Find one document by query
   */
  async findOne(query) {
    try {
      const document = await this.collection.findOne(query);
      
      return {
        success: true,
        data: document
      };
    } catch (error) {
      console.error(`Error finding document in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to find ${this.collectionName.slice(0, -1)}: ${error.message}`);
    }
  }

  /**
   * Update a document by ID
   */
  async updateById(id, updateData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw new Error('Invalid document ID');
      }

      // Add updated timestamp
      const updateDoc = {
        ...updateData,
        updatedAt: new Date()
      };

      // Log what we're updating (for debugging)
      if (updateData.settings) {
        console.log('BaseService: Updating with settings:', JSON.stringify(updateData.settings.maintenance?.rates || 'no rates', null, 2));
      }

      // Validate update data if validator is provided
      // For partial updates (like settings), we skip full document validation
      // Only validate if we're updating the entire document structure
      if (this.validator && updateData) {
        // Get existing document for validation
        const existing = await this.collection.findOne({ _id: new ObjectId(id) });
        if (!existing) {
          throw new Error('Document not found');
        }

        // Only validate if we're updating core fields, not just nested settings
        // Skip validation for partial updates like settings, which don't require all fields
        const isPartialUpdate = Object.keys(updateData).length === 1 && 
                                (updateData.settings !== undefined || 
                                 updateData.updatedAt !== undefined);
        
        if (!isPartialUpdate) {
          const mergedData = { ...existing, ...updateDoc };
          const validation = this.validator(mergedData);
          if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }
        }
      }

      // Log the actual MongoDB update operation
      console.log('BaseService: MongoDB update operation:', {
        filter: { _id: new ObjectId(id) },
        update: { $set: updateDoc },
        hasSettings: !!updateDoc.settings,
        hasMaintenance: !!updateDoc.settings?.maintenance,
        hasRates: !!updateDoc.settings?.maintenance?.rates,
        ratesLength: updateDoc.settings?.maintenance?.rates?.length || 0
      });

      const result = await this.collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateDoc }
      );

      console.log('BaseService: MongoDB update result:', {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        acknowledged: result.acknowledged
      });

      if (result.matchedCount === 0) {
        throw new Error('Document not found');
      }

      // Return updated document
      const updatedDocument = await this.collection.findOne({ _id: new ObjectId(id) });

      return {
        success: true,
        data: updatedDocument,
        modified: result.modifiedCount > 0
      };
    } catch (error) {
      console.error(`Error updating document in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to update ${this.collectionName.slice(0, -1)}: ${error.message}`);
    }
  }

  /**
   * Update documents by query
   */
  async updateMany(query, updateData) {
    try {
      const updateDoc = {
        ...updateData,
        updatedAt: new Date()
      };

      const result = await this.collection.updateMany(
        query,
        { $set: updateDoc }
      );

      return {
        success: true,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      console.error(`Error updating documents in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to update ${this.collectionName}: ${error.message}`);
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw new Error('Invalid document ID');
      }

      const result = await this.collection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        throw new Error('Document not found');
      }

      return {
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      console.error(`Error deleting document in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to delete ${this.collectionName.slice(0, -1)}: ${error.message}`);
    }
  }

  /**
   * Delete documents by query
   */
  async deleteMany(query) {
    try {
      const result = await this.collection.deleteMany(query);

      return {
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      console.error(`Error deleting documents in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to delete ${this.collectionName}: ${error.message}`);
    }
  }

  /**
   * Count documents by query
   */
  async count(query = {}) {
    try {
      const count = await this.collection.countDocuments(query);
      
      return {
        success: true,
        count
      };
    } catch (error) {
      console.error(`Error counting documents in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to count ${this.collectionName}: ${error.message}`);
    }
  }

  /**
   * Check if document exists
   */
  async exists(query) {
    try {
      const count = await this.collection.countDocuments(query, { limit: 1 });
      
      return {
        success: true,
        exists: count > 0
      };
    } catch (error) {
      console.error(`Error checking existence in ${this.collectionName}:`, error.message);
      throw new Error(`Failed to check existence in ${this.collectionName}: ${error.message}`);
    }
  }

  /**
   * Aggregate query
   */
  async aggregate(pipeline) {
    try {
      const result = await this.collection.aggregate(pipeline).toArray();
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error(`Error in aggregation for ${this.collectionName}:`, error.message);
      throw new Error(`Failed to aggregate ${this.collectionName}: ${error.message}`);
    }
  }
}

module.exports = BaseService;