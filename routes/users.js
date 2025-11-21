const express = require('express');
const { verifyClerkToken, getUserDetails, clerkClient } = require('../middleware/auth');
const { UserService, SocietyService } = require('../models/services');
const dbConnection = require('../config/database');
const { ObjectId } = require('mongodb');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateUserRegistration, validateUserProfileUpdate, validateObjectId } = require('../middleware/validation');
const { ValidationError, NotFoundError, ConflictError, DatabaseError } = require('../middleware/errors');

const router = express.Router();

/**
 * POST /api/users/register-society
 * Register user with society information
 * Requires authentication
 */
router.post('/register-society', 
  verifyClerkToken, 
  getUserDetails, 
  validateUserRegistration,
  asyncHandler(async (req, res) => {
    const { societyId, wing, flatNumber, residentType, contactNumber } = req.body;

    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const societyService = new SocietyService(db);

    // Check if user is already registered
    const existingUser = await userService.findByClerkUserId(req.userId);
    if (existingUser.data) {
      throw new ConflictError('User has already completed society registration', {
        societyName: existingUser.data.societyName,
        wing: existingUser.data.wing,
        residentType: existingUser.data.residentType
      });
    }

    // Verify society exists
    const society = await societyService.findById(societyId);
    if (!society.data) {
      throw new NotFoundError('The specified society does not exist');
    }

    // Prepare user data
    const userData = {
      clerkUserId: req.userId,
      societyId: new ObjectId(societyId),
      societyName: society.data.name,
      wing: wing.trim(),
      flatNumber: flatNumber ? flatNumber.trim() : null,
      residentType,
      contactNumber: contactNumber ? contactNumber.trim() : null,
      email: req.user.email,
      name: req.user.fullName || req.user.firstName || 'Unknown',
      registrationDate: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Register the user
    const result = await userService.registerUser(userData);

    if (!result.success) {
      throw new DatabaseError('Failed to register user with society', result.errors);
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'User successfully registered with society',
      data: {
        userId: result.data._id,
        societyName: society.data.name,
        wing: userData.wing,
        flatNumber: userData.flatNumber,
        residentType: userData.residentType,
        registrationDate: userData.registrationDate
      }
    });
  })
);

/**
 * GET /api/users/status
 * Get comprehensive user status (society membership, pending requests, etc.)
 * Requires authentication
 */
router.get('/status', verifyClerkToken, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const userService = new UserService(db);

  // Get user profile
  const userResult = await userService.findByClerkUserId(req.userId);
  
  if (!userResult.data) {
    // User doesn't exist in our database
    return res.json({
      success: true,
      data: {
        userExists: false,
        hasSociety: false,
        hasPendingRequest: false,
        status: 'not_registered'
      }
    });
  }

  const user = userResult.data;

  // Check if user has a pending join request
  const societiesCollection = db.collection('societies');
  let hasPendingRequest = false;
  let pendingRequest = null;

  if (user.joinRequestId) {
    const society = await societiesCollection.findOne({
      'requests.requestId': new ObjectId(user.joinRequestId)
    });

    if (society) {
      const joinRequest = society.requests.find(req => 
        req.requestId.toString() === user.joinRequestId.toString()
      );
      
      if (joinRequest && joinRequest.status === 'pending') {
        hasPendingRequest = true;
        pendingRequest = {
          id: joinRequest.requestId.toString(),
          societyName: society.name,
          status: joinRequest.status,
          submittedAt: joinRequest.submittedAt,
          requestedData: joinRequest.requestedData
        };
      }
    }
  }

  // Check if user has a society
  const hasSociety = !!(user.societyId && user.isApproved);

  // Determine user status
  let status;
  if (hasSociety) {
    status = 'registered';
  } else if (hasPendingRequest) {
    status = 'pending_request';
  } else {
    status = 'not_registered';
  }

  // Get society details if user has one
  let societyData = null;
  if (hasSociety) {
    try {
      if (user.societyId && ObjectId.isValid(user.societyId)) {
        const societyService = new SocietyService(db);
        const societyResult = await societyService.findById(user.societyId);
        societyData = {
          id: user.societyId,
          name: user.societyName,
          address: societyResult.data?.address || null
        };
      }
    } catch (error) {
      console.error('Error finding society by ID:', error.message);
    }
  }

  res.json({
    success: true,
    data: {
      userExists: true,
      hasSociety,
      hasPendingRequest,
      status,
      pendingRequest,
      society: societyData,
      residence: hasSociety ? {
        wing: user.wing,
        flatNumber: user.flatNumber,
        residentType: user.residentType
      } : null,
      profile: {
        id: user._id,
        clerkUserId: user.clerkUserId,
        name: user.name,
        email: user.email,
        contactNumber: user.contactNumber,
        isActive: user.isActive
      }
    }
  });
}));

/**
 * GET /api/users/profile
 * Get user profile information
 * Requires authentication
 */
router.get('/profile', verifyClerkToken, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const userService = new UserService(db);

  // Get user profile
  const userResult = await userService.findByClerkUserId(req.userId);
  
  if (!userResult.data) {
    throw new NotFoundError('User profile not found. Please complete society registration first.', {
      requiresRegistration: true
    });
  }

  const user = userResult.data;

  // Get society details (with error handling for invalid ObjectId)
  let societyResult = { data: null };
  try {
    if (user.societyId && ObjectId.isValid(user.societyId)) {
      const societyService = new SocietyService(db);
      societyResult = await societyService.findById(user.societyId);
    }
  } catch (error) {
    console.error('Error finding society by ID:', error.message);
    // Continue with null society data
  }

  // Prepare response data
  const profileData = {
    id: user._id,
    clerkUserId: user.clerkUserId,
    name: user.name,
    email: user.email,
    contactNumber: user.contactNumber,
    society: {
      id: user.societyId,
      name: user.societyName,
      address: societyResult.data?.address || null
    },
    residence: {
      wing: user.wing,
      flatNumber: user.flatNumber,
      residentType: user.residentType
    },
    registrationDate: user.registrationDate,
    isActive: user.isActive,
    isAdmin: societyResult.data?.adminUsers?.includes(user.clerkUserId) || false
  };

  res.json({
    success: true,
    data: profileData
  });
}));

/**
 * PUT /api/users/profile
 * Update user profile information
 * Requires authentication
 */
router.put('/profile', 
  verifyClerkToken, 
  validateUserProfileUpdate,
  asyncHandler(async (req, res) => {
    const { contactNumber, flatNumber } = req.body;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    // Check if user exists
    const userResult = await userService.findByClerkUserId(req.userId);
    if (!userResult.data) {
      throw new NotFoundError('User profile not found. Please complete society registration first.', {
        requiresRegistration: true
      });
    }

    // Prepare update data (only allow certain fields to be updated)
    const updateData = {};
    
    if (contactNumber !== undefined) {
      updateData.contactNumber = contactNumber ? contactNumber.trim() : null;
    }
    
    if (flatNumber !== undefined) {
      updateData.flatNumber = flatNumber ? flatNumber.trim() : null;
    }

    // Add updated timestamp
    updateData.updatedAt = new Date();

    // Perform update
    const result = await userService.updateProfile(req.userId, updateData);

    if (!result.success) {
      throw new DatabaseError('Failed to update user profile', result.errors);
    }

    // Get updated profile
    const updatedUserResult = await userService.findByClerkUserId(req.userId);
    const updatedUser = updatedUserResult.data;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        contactNumber: updatedUser.contactNumber,
        flatNumber: updatedUser.flatNumber,
        updatedAt: updatedUser.updatedAt
      }
    });
  })
);

/**
 * GET /api/users/societies
 * Get list of available societies for registration
 * Public endpoint (no authentication required)
 */
router.get('/societies', asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);

  const result = await societyService.getActiveSocieties();

  if (!result.success) {
    throw new DatabaseError('Unable to retrieve available societies');
  }

  res.json({
    success: true,
    data: result.data,
    count: result.data.length
  });
}));

/**
 * POST /api/users/verify-society
 * Verify if user belongs to a specific society
 * Requires authentication
 */
router.post('/verify-society', 
  verifyClerkToken, 
  validateObjectId,
  asyncHandler(async (req, res) => {
    const { societyId } = req.body;

    const db = dbConnection.getDb();
    const userService = new UserService(db);

    const result = await userService.verifyUserSociety(req.userId, societyId);

    res.json({
      success: true,
      belongs: result.belongs,
      reason: result.reason,
      user: result.user ? {
        societyId: result.user.societyId,
        societyName: result.user.societyName,
        wing: result.user.wing,
        residentType: result.user.residentType
      } : null
    });
  })
);

/**
 * GET /api/users/society/members
 * Get society members for the authenticated user's society
 * Requires authentication
 */
router.get('/society/members', verifyClerkToken, asyncHandler(async (req, res) => {
  const { wing, residentType, search } = req.query;

  const db = dbConnection.getDb();
  const userService = new UserService(db);

  // First get the current user to determine their society
  const userResult = await userService.findByClerkUserId(req.userId);
  
  if (!userResult.data) {
    throw new NotFoundError('User profile not found. Please complete society registration first.', {
      requiresRegistration: true
    });
  }

  const currentUser = userResult.data;

  // Check if user has a society (not just a pending request)
  if (!currentUser.societyId) {
    return res.status(400).json({
      success: false,
      message: 'User is not yet a member of any society. Please wait for your join request to be approved.',
      code: 'NO_SOCIETY_MEMBERSHIP'
    });
  }

  // Get all members of the same society
  const result = await userService.getSocietyMembers(currentUser.societyId, {
    wing,
    residentType,
    search
  });

  if (!result.success) {
    throw new DatabaseError('Unable to retrieve society members');
  }

  // Format the response data - fetch names from Clerk since name field doesn't exist in DB
  const members = await Promise.all(result.data.map(async (member) => {
    let memberName = 'Unknown';
    let memberEmail = member.email || 'N/A';
    let memberAvatar = null;
    
    console.log(`🔍 Processing member: ${member.clerkUserId}`);
    
    // Fetch name from Clerk since it's not stored in the database
    try {
      console.log(`📞 Fetching Clerk data for user: ${member.clerkUserId}`);
      const clerkUser = await clerkClient.users.getUser(member.clerkUserId);
      // Get name from Clerk - try fullName first, then firstName+lastName, then email
      memberName = clerkUser.fullName 
        ? clerkUser.fullName.trim()
        : (clerkUser.firstName && clerkUser.lastName 
          ? `${clerkUser.firstName} ${clerkUser.lastName}`.trim()
          : clerkUser.firstName 
            ? clerkUser.firstName.trim()
            : clerkUser.emailAddresses?.[0]?.emailAddress || 'Unknown');
      // Get email from Clerk if not in DB
      if (!memberEmail || memberEmail === 'N/A') {
        memberEmail = clerkUser.emailAddresses?.[0]?.emailAddress || 'N/A';
      }
      // Get avatar from Clerk
      memberAvatar = clerkUser.imageUrl || null;
      console.log(`✅ Clerk name resolved: "${memberName}"`);
    } catch (clerkError) {
      console.warn(`❌ Failed to fetch Clerk data for user ${member.clerkUserId}:`, clerkError.message);
      memberName = 'Unknown';
    }

    return {
      id: member._id.toString(),
      name: memberName,
      wing: member.wing || 'N/A',
      flatNumber: member.flatNumber || 'N/A',
      phone: member.contactNumber || 'N/A',
      residentType: member.residentType || 'Unknown',
      isOnline: false, // TODO: Implement actual online status tracking
      email: memberEmail,
      joinedDate: member.registrationDate 
        ? (member.registrationDate instanceof Date 
          ? member.registrationDate.toISOString() 
          : new Date(member.registrationDate).toISOString())
        : new Date().toISOString(),
      avatar: memberAvatar,
      clerkUserId: member.clerkUserId // Include for reference
    };
  }));

  res.json({
    success: true,
    data: members,
    total: members.length,
    societyName: currentUser.societyName
  });
}));


module.exports = router;