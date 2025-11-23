const BaseService = require('./BaseService');
const { validateSociety } = require('../schemas');
const { ObjectId } = require('mongodb');

/**
 * Society Service Class
 * Handles all society-related database operations
 */

class SocietyService extends BaseService {
  constructor(db) {
    super(db, 'societies', validateSociety);
  }

  /**
   * Find society by name
   */
  async findByName(name) {
    try {
      if (!name || typeof name !== 'string') {
        throw new Error('Valid society name is required');
      }

      return await this.findOne({ name: name.trim() });
    } catch (error) {
      console.error('Error finding society by name:', error.message);
      throw error;
    }
  }

  /**
   * Get all active societies for selection
   */
  async getActiveSocieties(options = {}) {
    try {
      const projection = {
        name: 1,
        address: 1,
        totalWings: 1,
        totalFlats: 1,
        wings: 1
      };

      return await this.find({}, { 
        ...options, 
        projection,
        sort: { name: 1 }
      });
    } catch (error) {
      console.error('Error getting active societies:', error.message);
      throw error;
    }
  }

  /**
   * Create a new society
   */
  async createSociety(societyData) {
    try {
      // Check if society with same name already exists
      const existing = await this.findByName(societyData.name);
      if (existing.data) {
        throw new Error('Society with this name already exists');
      }

      // Set default settings if not provided
      if (!societyData.settings) {
        societyData.settings = {
          maintenanceAmount: 0,
          maintenanceDueDate: 5,
          allowTenantForumAccess: true
        };
      }

      // Ensure adminUsers is an array
      if (!societyData.adminUsers) {
        societyData.adminUsers = [];
      }

      return await this.create(societyData);
    } catch (error) {
      console.error('Error creating society:', error.message);
      throw error;
    }
  }

  /**
   * Update society settings
   */
  async updateSettings(societyId, settings) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const society = await this.findById(societyId);
      if (!society.data) {
        throw new Error('Society not found');
      }

      // Deep merge settings, especially for nested objects like maintenance
      const existingSettings = society.data.settings || {};
      const updatedSettings = {
        ...existingSettings,
        ...settings
      };

      // Deep merge maintenance settings if both exist
      if (settings.maintenance && existingSettings.maintenance) {
        updatedSettings.maintenance = {
          ...existingSettings.maintenance,
          ...settings.maintenance
        };
        // Ensure rates array is properly included (don't merge, replace)
        if (settings.maintenance.rates !== undefined) {
          updatedSettings.maintenance.rates = settings.maintenance.rates;
        }
      } else if (settings.maintenance) {
        // If only new maintenance settings exist, use them directly
        updatedSettings.maintenance = settings.maintenance;
      }

      // Deep merge other nested settings objects if needed
      if (settings.notifications && existingSettings.notifications) {
        updatedSettings.notifications = {
          ...existingSettings.notifications,
          ...settings.notifications
        };
      }

      if (settings.userManagement && existingSettings.userManagement) {
        updatedSettings.userManagement = {
          ...existingSettings.userManagement,
          ...settings.userManagement
        };
      }

      if (settings.forum && existingSettings.forum) {
        updatedSettings.forum = {
          ...existingSettings.forum,
          ...settings.forum
        };
      }

      // Log what we're about to save
      console.log('Updated settings to save:', JSON.stringify(updatedSettings, null, 2));
      console.log('Maintenance rates being saved:', JSON.stringify(updatedSettings.maintenance?.rates, null, 2));

      // Use updateOne directly to avoid validation issues with partial updates
      const societyObjectId = ObjectId.isValid(societyId) ? new ObjectId(societyId) : societyId;
      
      console.log('SocietyService: About to update MongoDB with:', {
        societyId: societyObjectId.toString(),
        settingsKeys: Object.keys(updatedSettings),
        maintenanceRates: updatedSettings.maintenance?.rates?.length || 0,
        maintenanceRatesData: JSON.stringify(updatedSettings.maintenance?.rates, null, 2)
      });
      
      const result = await this.collection.updateOne(
        { _id: societyObjectId },
        { 
          $set: { 
            settings: updatedSettings,
            updatedAt: new Date()
          } 
        }
      );

      console.log('SocietyService: MongoDB update result:', {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        acknowledged: result.acknowledged,
        upsertedId: result.upsertedId
      });

      if (result.matchedCount === 0) {
        throw new Error('Society not found');
      }

      // Verify what was actually saved
      const verify = await this.findById(societyId);
      const savedRates = verify.data?.settings?.maintenance?.rates || [];
      console.log('SocietyService: Settings after save verification:', {
        hasSettings: !!verify.data?.settings,
        hasMaintenance: !!verify.data?.settings?.maintenance,
        hasRates: !!verify.data?.settings?.maintenance?.rates,
        ratesCount: savedRates.length,
        ratesData: JSON.stringify(savedRates, null, 2)
      });
      
      return {
        success: true,
        data: verify.data,
        modified: result.modifiedCount > 0
      };
    } catch (error) {
      console.error('Error updating society settings:', error.message);
      throw error;
    }
  }

  /**
   * Update society core details like name and address
   */
  async updateDetails(societyId, details) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      // Get existing society to preserve required fields
      const existing = await this.findById(societyId);
      if (!existing.success || !existing.data) {
        throw new Error('Society not found');
      }

      const updates = {};
      if (typeof details?.name === 'string' && details.name.trim()) {
        updates.name = details.name.trim();
      }
      // Allow empty address to be set
      if (details?.address !== undefined) {
        updates.address = typeof details.address === 'string' ? details.address.trim() : details.address;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true, data: existing.data };
      }

      // Use direct MongoDB update to avoid validation issues with partial updates
      const updateDoc = {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      };

      console.log('Updating society:', societyId, 'with:', updateDoc);

      const result = await this.collection.updateOne(
        { _id: new ObjectId(societyId) },
        updateDoc
      );

      console.log('Update result:', {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        acknowledged: result.acknowledged
      });

      if (result.matchedCount === 0) {
        throw new Error('Society not found');
      }

      if (!result.acknowledged) {
        throw new Error('Update operation was not acknowledged by MongoDB');
      }

      // If society name was updated, also update all users' societyName field
      if (updates.name) {
        try {
          const UserService = require('./UserService');
          const userService = new UserService(this.db);
          const societyObjectId = new ObjectId(societyId);
          
          // Update all users belonging to this society
          const userUpdateResult = await userService.collection.updateMany(
            { societyId: societyObjectId },
            { 
              $set: { 
                societyName: updates.name, 
                updatedAt: new Date() 
              } 
            }
          );
          
          console.log(`✅ Updated societyName for ${userUpdateResult.modifiedCount} users to: "${updates.name}"`);
        } catch (userUpdateError) {
          console.error('❌ Error updating users societyName:', userUpdateError.message);
          // Don't fail the entire operation if user update fails, but log it
        }
      }

      // Return updated document
      const updatedDocument = await this.collection.findOne({ _id: new ObjectId(societyId) });
      console.log('Updated document:', updatedDocument?.name, updatedDocument?.address);

      return {
        success: true,
        data: updatedDocument,
        modified: result.modifiedCount > 0
      };
    } catch (error) {
      console.error('Error updating society details:', error.message);
      throw error;
    }
  }

  // -------- Wings management ---------
  async getWings(societyId) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      const res = await this.findById(societyId);
      return { success: true, data: res.data?.wings || [] };
    } catch (error) {
      console.error('Error getting wings:', error.message);
      throw error;
    }
  }

  async addWing(societyId, wing) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      if (!wing?.name) throw new Error('Wing name is required');

      const payload = {
        _id: new ObjectId(),
        name: String(wing.name).trim(),
        floors: typeof wing.floors === 'number' ? wing.floors : undefined,
        flatsPerFloor: typeof wing.flatsPerFloor === 'number' ? wing.flatsPerFloor : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.collection.updateOne(
        { _id: new ObjectId(societyId) },
        { $push: { wings: payload }, $set: { updatedAt: new Date() } }
      );

      return { success: true, data: payload, result };
    } catch (error) {
      console.error('Error adding wing:', error.message);
      throw error;
    }
  }

  async updateWing(societyId, wingId, updates) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      if (!ObjectId.isValid(wingId)) throw new Error('Valid wingId is required');

      const updateDoc = {};
      if (typeof updates?.name === 'string') updateDoc['wings.$.name'] = updates.name.trim();
      if (typeof updates?.floors === 'number') updateDoc['wings.$.floors'] = updates.floors;
      if (typeof updates?.flatsPerFloor === 'number') updateDoc['wings.$.flatsPerFloor'] = updates.flatsPerFloor;
      updateDoc['wings.$.updatedAt'] = new Date();

      const result = await this.collection.updateOne(
        { _id: new ObjectId(societyId), 'wings._id': new ObjectId(wingId) },
        { $set: updateDoc }
      );

      return { success: true, result };
    } catch (error) {
      console.error('Error updating wing:', error.message);
      throw error;
    }
  }

  async deleteWing(societyId, wingId) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      if (!ObjectId.isValid(wingId)) throw new Error('Valid wingId is required');

      const result = await this.collection.updateOne(
        { _id: new ObjectId(societyId) },
        { $pull: { wings: { _id: new ObjectId(wingId) } }, $set: { updatedAt: new Date() } }
      );

      return { success: true, result };
    } catch (error) {
      console.error('Error deleting wing:', error.message);
      throw error;
    }
  }
  /**
   * Add admin user to society
   */
  async addAdmin(societyId, clerkUserId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }
      if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Valid clerkUserId is required');
      }

      const society = await this.findById(societyId);
      if (!society.data) {
        throw new Error('Society not found');
      }

      // Check if user is already an admin
      if (society.data.adminUsers.includes(clerkUserId)) {
        return {
          success: true,
          message: 'User is already an admin',
          data: society.data
        };
      }

      const updatedAdmins = [...society.data.adminUsers, clerkUserId];
      return await this.updateById(societyId, { adminUsers: updatedAdmins });
    } catch (error) {
      console.error('Error adding admin to society:', error.message);
      throw error;
    }
  }

  /**
   * Remove admin user from society
   */
  async removeAdmin(societyId, clerkUserId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }
      if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Valid clerkUserId is required');
      }

      const society = await this.findById(societyId);
      if (!society.data) {
        throw new Error('Society not found');
      }

      const updatedAdmins = society.data.adminUsers.filter(admin => admin !== clerkUserId);
      
      // Ensure at least one admin remains
      if (updatedAdmins.length === 0) {
        throw new Error('Cannot remove the last admin from society');
      }

      return await this.updateById(societyId, { adminUsers: updatedAdmins });
    } catch (error) {
      console.error('Error removing admin from society:', error.message);
      throw error;
    }
  }

  /**
   * Check if user is admin of society
   */
  async isAdmin(societyId, clerkUserId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }
      if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Valid clerkUserId is required');
      }

      const society = await this.findById(societyId);
      if (!society.data) {
        return { success: true, isAdmin: false, reason: 'Society not found' };
      }

      const isAdmin = society.data.adminUsers.includes(clerkUserId);
      
      return {
        success: true,
        isAdmin,
        society: society.data
      };
    } catch (error) {
      console.error('Error checking admin status:', error.message);
      throw error;
    }
  }

  /**
   * Get society statistics
   */
  async getSocietyStats(societyId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const society = await this.findById(societyId);
      if (!society.data) {
        throw new Error('Society not found');
      }

      // Get member count from users collection
      const userService = new (require('./UserService'))(this.db);
      const memberStats = await userService.getSocietyMemberStats(societyId);

      // Get maintenance stats (if maintenance service is available)
      let maintenanceStats = { pending: 0, paid: 0, overdue: 0 };
      try {
        const maintenanceService = new (require('./MaintenanceService'))(this.db);
        const maintenanceResult = await maintenanceService.getSocietyMaintenanceStats(societyId);
        if (maintenanceResult.success) {
          maintenanceStats = maintenanceResult.data;
        }
      } catch (error) {
        // Maintenance service might not be available yet
        console.log('Maintenance stats not available:', error.message);
      }

      return {
        success: true,
        data: {
          society: society.data,
          members: memberStats.data,
          maintenance: maintenanceStats,
          totalCapacity: society.data.totalFlats,
          occupancyRate: society.data.totalFlats > 0 
            ? Math.round((memberStats.data.total / society.data.totalFlats) * 100) 
            : 0
        }
      };
    } catch (error) {
      console.error('Error getting society stats:', error.message);
      throw error;
    }
  }
}

module.exports = SocietyService;