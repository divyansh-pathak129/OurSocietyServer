const { asyncHandler } = require('./errorHandler');
const dbConnection = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * Middleware to attach user document to request if it exists.
 * Does NOT auto-create user documents on login anymore.
 */
const ensureUserDocument = asyncHandler(async (req, res, next) => {
  try {
    // Skip if no user in request (not authenticated)
    if (!req.userId) {
      return next();
    }

    const clerkUserId = req.userId;
    const db = dbConnection.getDb();
    const usersCollection = db.collection('users');

    // Check if user document already exists
    const existingUser = await usersCollection.findOne({ clerkUserId });

    if (!existingUser) {
      // Do not create here; proceed without user document
      req.userDocument = null;
    } else {
      // Best-effort update last login time
      await usersCollection.updateOne(
        { clerkUserId },
        { $set: { updatedAt: new Date(), lastLoginAt: new Date() } }
      );
      req.userDocument = existingUser;
    }

    next();
  } catch (error) {
    console.error('Error in ensureUserDocument middleware:', error);
    // Don't block the request if user document creation fails
    next();
  }
});

/**
 * Middleware to check if user is approved for society access
 */
const requireSocietyApproval = asyncHandler(async (req, res, next) => {
  try {
    if (!req.userDocument) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const user = req.userDocument;

    // Check if user has a society and is approved
    if (!user.societyId || !user.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'User not approved for society access',
        requiresApproval: true,
        hasSociety: !!user.societyId,
        isApproved: user.isApproved,
        joinRequestId: user.joinRequestId
      });
    }

    next();
  } catch (error) {
    console.error('Error in requireSocietyApproval middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = {
  ensureUserDocument,
  requireSocietyApproval
};

