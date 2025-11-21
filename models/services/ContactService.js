const BaseService = require('./BaseService');
const { validateContact } = require('../schemas');
const { ObjectId } = require('mongodb');

/**
 * Contact Service Class
 * Handles all contact-related database operations
 */

class ContactService extends BaseService {
  constructor(db) {
    super(db, 'contacts', validateContact);
  }

  /**
   * Get contacts for a society
   */
  async getSocietyContacts(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const query = { societyId: new ObjectId(societyId) };
      
      // Add active filter by default
      if (options.activeOnly !== false) {
        query.isActive = true;
      }

      // Add role filter if specified
      if (options.role) {
        query.role = options.role;
      }

      // Add emergency filter if specified
      if (options.emergencyOnly) {
        query.isEmergency = true;
      }

      return await this.find(query, {
        ...options,
        sort: { isEmergency: -1, role: 1, name: 1 }
      });
    } catch (error) {
      console.error('Error getting society contacts:', error.message);
      throw error;
    }
  }

  /**
   * Create a new contact
   */
  async createContact(contactData) {
    try {
      // Ensure societyId is ObjectId
      if (contactData.societyId && typeof contactData.societyId === 'string') {
        contactData.societyId = new ObjectId(contactData.societyId);
      }

      // Set default values
      if (contactData.isEmergency === undefined) {
        contactData.isEmergency = false;
      }
      if (contactData.isActive === undefined) {
        contactData.isActive = true;
      }

      return await this.create(contactData);
    } catch (error) {
      console.error('Error creating contact:', error.message);
      throw error;
    }
  }

  /**
   * Update contact (admin only)
   */
  async updateContact(contactId, updateData, userId, isAdmin = false) {
    try {
      if (!ObjectId.isValid(contactId)) {
        throw new Error('Valid contactId is required');
      }

      if (!isAdmin) {
        throw new Error('Only admins can update contacts');
      }

      const contact = await this.findById(contactId);
      if (!contact.data) {
        throw new Error('Contact not found');
      }

      // Prevent updating certain fields
      const restrictedFields = ['societyId', 'addedBy', 'createdAt'];
      restrictedFields.forEach(field => {
        if (updateData.hasOwnProperty(field)) {
          delete updateData[field];
        }
      });

      return await this.updateById(contactId, updateData);
    } catch (error) {
      console.error('Error updating contact:', error.message);
      throw error;
    }
  }

  /**
   * Delete contact (admin only)
   */
  async deleteContact(contactId, userId, isAdmin = false) {
    try {
      if (!ObjectId.isValid(contactId)) {
        throw new Error('Valid contactId is required');
      }

      if (!isAdmin) {
        throw new Error('Only admins can delete contacts');
      }

      const contact = await this.findById(contactId);
      if (!contact.data) {
        throw new Error('Contact not found');
      }

      return await this.deleteById(contactId);
    } catch (error) {
      console.error('Error deleting contact:', error.message);
      throw error;
    }
  }

  /**
   * Deactivate contact instead of deleting
   */
  async deactivateContact(contactId, userId, isAdmin = false) {
    try {
      if (!ObjectId.isValid(contactId)) {
        throw new Error('Valid contactId is required');
      }

      if (!isAdmin) {
        throw new Error('Only admins can deactivate contacts');
      }

      const contact = await this.findById(contactId);
      if (!contact.data) {
        throw new Error('Contact not found');
      }

      return await this.updateById(contactId, { isActive: false });
    } catch (error) {
      console.error('Error deactivating contact:', error.message);
      throw error;
    }
  }

  /**
   * Get emergency contacts for a society
   */
  async getEmergencyContacts(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      return await this.getSocietyContacts(societyId, {
        ...options,
        emergencyOnly: true
      });
    } catch (error) {
      console.error('Error getting emergency contacts:', error.message);
      throw error;
    }
  }

  /**
   * Get contacts by role
   */
  async getContactsByRole(societyId, role, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const validRoles = ['Security', 'Maintenance', 'Management', 'Emergency'];
      if (!validRoles.includes(role)) {
        throw new Error('Invalid role');
      }

      return await this.getSocietyContacts(societyId, {
        ...options,
        role
      });
    } catch (error) {
      console.error('Error getting contacts by role:', error.message);
      throw error;
    }
  }

  /**
   * Toggle emergency status of a contact
   */
  async toggleEmergencyStatus(contactId, isEmergency, userId, isAdmin = false) {
    try {
      if (!ObjectId.isValid(contactId)) {
        throw new Error('Valid contactId is required');
      }

      if (!isAdmin) {
        throw new Error('Only admins can change emergency status');
      }

      const contact = await this.findById(contactId);
      if (!contact.data) {
        throw new Error('Contact not found');
      }

      return await this.updateById(contactId, { isEmergency: Boolean(isEmergency) });
    } catch (error) {
      console.error('Error toggling emergency status:', error.message);
      throw error;
    }
  }

  /**
   * Get contact statistics for a society
   */
  async getSocietyContactStats(societyId) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }

      const pipeline = [
        { $match: { societyId: new ObjectId(societyId), isActive: true } },
        { $group: {
          _id: '$role',
          count: { $sum: 1 },
          emergency: { $sum: { $cond: ['$isEmergency', 1, 0] } }
        }},
        { $sort: { _id: 1 } }
      ];

      const stats = await this.aggregate(pipeline);
      
      // Format the results
      const formattedStats = {
        total: 0,
        totalEmergency: 0,
        byRole: {}
      };

      stats.data.forEach(item => {
        formattedStats.total += item.count;
        formattedStats.totalEmergency += item.emergency;
        formattedStats.byRole[item._id] = {
          count: item.count,
          emergency: item.emergency
        };
      });

      return {
        success: true,
        data: formattedStats
      };
    } catch (error) {
      console.error('Error getting society contact stats:', error.message);
      throw error;
    }
  }

  /**
   * Search contacts
   */
  async searchContacts(societyId, searchTerm, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }
      if (!searchTerm || typeof searchTerm !== 'string') {
        throw new Error('Valid search term is required');
      }

      const query = {
        societyId: new ObjectId(societyId),
        isActive: true,
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { role: { $regex: searchTerm, $options: 'i' } },
          { phoneNumber: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      // Add email search if provided
      if (searchTerm.includes('@')) {
        query.$or.push({ email: { $regex: searchTerm, $options: 'i' } });
      }

      return await this.find(query, {
        ...options,
        sort: { isEmergency: -1, role: 1, name: 1 }
      });
    } catch (error) {
      console.error('Error searching contacts:', error.message);
      throw error;
    }
  }

  /**
   * Get contacts added by a specific user
   */
  async getContactsAddedByUser(addedBy, options = {}) {
    try {
      if (!addedBy || typeof addedBy !== 'string') {
        throw new Error('Valid addedBy user ID is required');
      }

      const query = { addedBy };

      return await this.find(query, {
        ...options,
        sort: { createdAt: -1 }
      });
    } catch (error) {
      console.error('Error getting contacts added by user:', error.message);
      throw error;
    }
  }

  /**
   * Bulk create contacts for a society
   */
  async bulkCreateContacts(societyId, contactsData, addedBy) {
    try {
      if (!ObjectId.isValid(societyId)) {
        throw new Error('Valid societyId is required');
      }
      if (!Array.isArray(contactsData) || contactsData.length === 0) {
        throw new Error('Valid contacts data array is required');
      }

      const results = [];
      const errors = [];

      for (const contactData of contactsData) {
        try {
          const contact = {
            ...contactData,
            societyId: new ObjectId(societyId),
            addedBy: addedBy
          };

          const result = await this.createContact(contact);
          results.push(result.data);
        } catch (error) {
          errors.push({
            contact: contactData.name || 'Unknown',
            error: error.message
          });
        }
      }

      return {
        success: true,
        data: {
          created: results.length,
          errors: errors.length,
          contacts: results,
          errors
        }
      };
    } catch (error) {
      console.error('Error bulk creating contacts:', error.message);
      throw error;
    }
  }
}

module.exports = ContactService;