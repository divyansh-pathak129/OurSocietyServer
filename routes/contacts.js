const express = require('express');
const { verifyClerkToken, getUserDetails } = require('../middleware/auth');
const { verifyAdminAuth } = require('../middleware/adminAuth');
const { ContactService, UserService, SocietyService } = require('../models/services/index');
const dbConnection = require('../config/database');
const { ObjectId } = require('mongodb');

const router = express.Router();

/**
 * GET /api/contacts
 * Get society-specific contacts
 * Requires authentication
 */
router.get('/', verifyClerkToken, async (req, res) => {
  try {
    const { role, emergencyOnly, search, page = 1, limit = 50 } = req.query;

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const contactService = new ContactService(db);

    // Get user profile to determine society
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;
    const societyId = user.societyId;

    // Check if user has a society
    if (!societyId) {
      return res.status(400).json({
        success: false,
        message: 'User is not yet a member of any society. Please wait for your join request to be approved.',
        code: 'NO_SOCIETY_MEMBERSHIP'
      });
    }

    // Prepare query options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    let result;

    if (search) {
      // Search contacts
      result = await contactService.searchContacts(societyId, search, options);
    } else if (emergencyOnly === 'true') {
      // Get emergency contacts only
      result = await contactService.getEmergencyContacts(societyId, options);
    } else if (role) {
      // Get contacts by role
      result = await contactService.getContactsByRole(societyId, role, options);
    } else {
      // Get all society contacts
      result = await contactService.getSocietyContacts(societyId, options);
    }

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Load Contacts',
        message: 'Unable to retrieve contacts'
      });
    }

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination || null,
      societyId: societyId.toString()
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving contacts'
    });
  }
});

/**
 * POST /api/contacts
 * Create new contact (admin only)
 * Requires authentication and admin privileges
 */
router.post('/', verifyClerkToken, verifyAdminAuth, async (req, res) => {
  try {
    const { name, role, phoneNumber, email, isEmergency = false } = req.body;

    // Validate required fields
    if (!name || !role || !phoneNumber) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Name, role, and phone number are required',
        details: {
          name: !name ? 'Name is required' : null,
          role: !role ? 'Role is required' : null,
          phoneNumber: !phoneNumber ? 'Phone number is required' : null
        }
      });
    }

    // Validate role
    const validRoles = ['Security', 'Maintenance', 'Management', 'Emergency'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    const db = dbConnection.getDb();
    const contactService = new ContactService(db);

    // Use adminUser from verifyAdminAuth middleware
    if (!req.adminUser || !req.adminUser.societyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can add contacts'
      });
    }

    // Prepare contact data
    const contactData = {
      societyId: req.adminUser.societyId,
      name: name.trim(),
      role,
      phoneNumber: phoneNumber.trim(),
      email: email ? email.trim() : null,
      isEmergency: Boolean(isEmergency),
      isActive: true,
      addedBy: req.adminUser.clerkUserId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create the contact
    const result = await contactService.createContact(contactData);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Create Contact',
        message: 'Unable to create contact',
        details: result.errors
      });
    }

    res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the contact'
    });
  }
});

/**
 * PUT /api/contacts/:id
 * Update contact (admin only)
 * Requires authentication and admin privileges
 */
router.put('/:id', verifyClerkToken, verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, phoneNumber, email, isEmergency } = req.body;

    // Validate contact ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid contact ID format'
      });
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['Security', 'Maintenance', 'Management', 'Emergency'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
        });
      }
    }

    const db = dbConnection.getDb();
    const contactService = new ContactService(db);

    // Use adminUser from verifyAdminAuth middleware
    if (!req.adminUser || !req.adminUser.societyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can update contacts'
      });
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (role) updateData.role = role;
    if (phoneNumber) updateData.phoneNumber = phoneNumber.trim();
    if (email !== undefined) updateData.email = email ? email.trim() : null;
    if (isEmergency !== undefined) updateData.isEmergency = Boolean(isEmergency);
    updateData.updatedAt = new Date();

    // Update the contact (isAdmin is always true when using verifyAdminAuth)
    const result = await contactService.updateContact(id, updateData, req.adminUser.clerkUserId, true);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Update Contact',
        message: 'Unable to update contact',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Update contact error:', error);
    
    if (error.message === 'Contact not found') {
      return res.status(404).json({
        error: 'Contact Not Found',
        message: 'The specified contact does not exist'
      });
    }
    
    if (error.message === 'Only admins can update contacts') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can update contacts'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the contact'
    });
  }
});

/**
 * DELETE /api/contacts/:id
 * Delete contact (admin only)
 * Requires authentication and admin privileges
 */
router.delete('/:id', verifyClerkToken, verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate contact ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid contact ID format'
      });
    }

    const db = dbConnection.getDb();
    const contactService = new ContactService(db);

    // Use adminUser from verifyAdminAuth middleware
    if (!req.adminUser || !req.adminUser.societyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can delete contacts'
      });
    }

    // Delete the contact (isAdmin is always true when using verifyAdminAuth)
    const result = await contactService.deleteContact(id, req.adminUser.clerkUserId, true);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Delete Contact',
        message: 'Unable to delete contact',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });

  } catch (error) {
    console.error('Delete contact error:', error);
    
    if (error.message === 'Contact not found') {
      return res.status(404).json({
        error: 'Contact Not Found',
        message: 'The specified contact does not exist'
      });
    }
    
    if (error.message === 'Only admins can delete contacts') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can delete contacts'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the contact'
    });
  }
});

/**
 * GET /api/contacts/emergency
 * Get emergency contacts for the society
 * Requires authentication
 */
router.get('/emergency', verifyClerkToken, async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const contactService = new ContactService(db);

    // Get user profile to determine society
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;
    const societyId = user.societyId;

    // Get emergency contacts
    const result = await contactService.getEmergencyContacts(societyId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Load Emergency Contacts',
        message: 'Unable to retrieve emergency contacts'
      });
    }

    res.json({
      success: true,
      data: result.data,
      societyId: societyId.toString()
    });

  } catch (error) {
    console.error('Get emergency contacts error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving emergency contacts'
    });
  }
});

/**
 * GET /api/contacts/stats
 * Get contact statistics for the user's society
 * Requires authentication
 */
router.get('/stats', verifyClerkToken, async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const contactService = new ContactService(db);

    // Get user profile to determine society
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User profile not found. Please complete society registration first.',
        requiresRegistration: true
      });
    }

    const user = userResult.data;
    const societyId = user.societyId;

    // Get contact statistics
    const result = await contactService.getSocietyContactStats(societyId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Load Contact Statistics',
        message: 'Unable to retrieve contact statistics'
      });
    }

    res.json({
      success: true,
      data: result.data,
      societyId: societyId.toString()
    });

  } catch (error) {
    console.error('Get contact stats error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while retrieving contact statistics'
    });
  }
});

/**
 * PUT /api/contacts/:id/emergency
 * Toggle emergency status of a contact (admin only)
 * Requires authentication and admin privileges
 */
router.put('/:id/emergency', verifyClerkToken, verifyAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { isEmergency } = req.body;

    // Validate contact ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid contact ID format'
      });
    }

    // Validate isEmergency
    if (typeof isEmergency !== 'boolean') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'isEmergency must be a boolean value'
      });
    }

    const db = dbConnection.getDb();
    const contactService = new ContactService(db);

    // Use adminUser from verifyAdminAuth middleware
    if (!req.adminUser || !req.adminUser.societyId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can change emergency status'
      });
    }

    // Toggle emergency status (isAdmin is always true when using verifyAdminAuth)
    const result = await contactService.toggleEmergencyStatus(id, isEmergency, req.adminUser.clerkUserId, true);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to Update Emergency Status',
        message: 'Unable to update contact emergency status',
        details: result.errors
      });
    }

    res.json({
      success: true,
      message: `Contact ${isEmergency ? 'marked as emergency' : 'unmarked as emergency'} successfully`,
      data: result.data
    });

  } catch (error) {
    console.error('Toggle emergency status error:', error);
    
    if (error.message === 'Contact not found') {
      return res.status(404).json({
        error: 'Contact Not Found',
        message: 'The specified contact does not exist'
      });
    }
    
    if (error.message === 'Only admins can change emergency status') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only society administrators can change emergency status'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating emergency status'
    });
  }
});

module.exports = router;