const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { verifyClerkToken, getUserDetails } = require('../middleware/auth');
const { ensureUserDocument } = require('../middleware/userDocumentMiddleware');
const dbConnection = require('../config/database');
const { ObjectId } = require('mongodb');

/**
 * @route   GET /api/join-requests/societies
 * @desc    Get list of available societies for joining
 * @access  Public (authenticated users)
 */
router.get('/societies', verifyClerkToken, getUserDetails, ensureUserDocument, asyncHandler(async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const societiesCollection = db.collection('societies');

    // Get all active societies
    const societies = await societiesCollection.find({
      isActive: { $ne: false } // Include societies where isActive is not explicitly false
    }).toArray();

    const societyList = societies.map(society => ({
      id: society._id.toString(),
      name: society.name,
      address: society.address,
      totalWings: society.totalWings,
      totalFlats: society.totalFlats,
      description: society.description || `${society.name} - ${society.address}`,
      wings: Array.isArray(society.wings)
        ? society.wings.map(wing => ({
            id: wing._id ? wing._id.toString() : undefined,
            name: wing.name,
            floors: wing.floors,
            flatsPerFloor: wing.flatsPerFloor
          }))
        : []
    }));

    res.json({
      success: true,
      data: societyList
    });
  } catch (error) {
    console.error('Error fetching societies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch societies'
    });
  }
}));

/**
 * @route   POST /api/join-requests
 * @desc    Submit a join request for a society
 * @access  Authenticated users
 */
router.post('/', verifyClerkToken, getUserDetails, ensureUserDocument, asyncHandler(async (req, res) => {
  try {
    const { societyId, wing, flatNumber, residentType, contactNumber, emergencyContact } = req.body;
    const clerkUserId = req.userId;
    const user = req.userDocument;

    // Validation
    if (!societyId || !wing || !residentType) {
      return res.status(400).json({
        success: false,
        message: 'Society ID, wing, and resident type are required'
      });
    }

    // Check if user already has a society (only if user document exists)
    if (user && user.societyId) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of a society'
      });
    }

    // Check if user already has a pending request
    const db = dbConnection.getDb();
    const joinRequestsCollection = db.collection('joinRequests');
    
    const existingRequest = await joinRequestsCollection.findOne({
      clerkUserId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'User already has a pending join request'
      });
    }

    // Verify society exists
    const societiesCollection = db.collection('societies');
    const society = await societiesCollection.findOne({ _id: new ObjectId(societyId) });

    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Society not found'
      });
    }

    // Create or upsert minimal user document if missing (no approval yet)
    const usersCollection = db.collection('users');

    if (!user) {
      // Pull minimal details from Clerk for convenience (best-effort)
      let clerkEmail = '';
      let clerkPhone = null;
      try {
        const clerkResp = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
          headers: {
            Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (clerkResp.ok) {
          const clerkData = await clerkResp.json();
          clerkEmail = clerkData.email_addresses?.[0]?.email_address || '';
          clerkPhone = clerkData.phone_numbers?.[0]?.phone_number || null;
        }
      } catch (_) {}

      const now = new Date();
      await usersCollection.updateOne(
        { clerkUserId },
        {
          $setOnInsert: {
            clerkUserId,
            societyId: null,
            societyName: null,
            wing: null,
            flatNumber: null,
            residentType: null,
            contactNumber: contactNumber || clerkPhone,
            email: clerkEmail,
            isActive: true,
            isApproved: false,
            createdAt: now,
          },
          $set: { updatedAt: now }
        },
        { upsert: true }
      );
    }

    // Create join request object
    const joinRequest = {
      requestId: new ObjectId(),
      clerkUserId,
      requestedData: {
        wing,
        flatNumber: flatNumber || null,
        residentType,
        contactNumber: contactNumber || (user ? user.contactNumber : null),
        emergencyContact: emergencyContact || null
      },
      documents: [], // Will be populated when user uploads documents
      status: 'pending',
      submittedAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add request to society's requests array
    await societiesCollection.updateOne(
      { _id: new ObjectId(societyId) },
      { 
        $push: { 
          requests: joinRequest
        },
        $set: { 
          updatedAt: new Date()
        }
      }
    );

    // Update user document with join request reference and request data
    await usersCollection.updateOne(
      { clerkUserId },
      { 
        $set: { 
          joinRequestId: joinRequest.requestId,
          wing: wing,
          flatNumber: flatNumber || null,
          residentType: residentType,
          contactNumber: contactNumber || (user ? user.contactNumber : null),
          updatedAt: new Date()
        } 
      },
      { upsert: true }
    );

    // Notify admins via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`society_${societyId}`).emit('join_request_submitted', {
        requestId: joinRequest.requestId.toString(),
        userName: user ? user.name : 'New User',
        wing,
        flatNumber,
        residentType,
        societyName: society.name,
        submittedAt: joinRequest.submittedAt
      });
    }

    res.status(201).json({
      success: true,
      message: 'Join request submitted successfully',
      data: {
        requestId: joinRequest.requestId.toString(),
        status: 'pending',
        societyName: society.name
      }
    });
  } catch (error) {
    console.error('Error submitting join request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit join request'
    });
  }
}));

/**
 * @route   GET /api/join-requests/my-request
 * @desc    Get user's current join request status
 * @access  Authenticated users
 */
router.get('/my-request', verifyClerkToken, getUserDetails, ensureUserDocument, asyncHandler(async (req, res) => {
  try {
    const clerkUserId = req.userId;
    const user = req.userDocument;
    
    // If user has no join request ID, return null
    if (!user || !user.joinRequestId) {
      return res.json({
        success: true,
        data: null
      });
    }

    const db = dbConnection.getDb();
    const societiesCollection = db.collection('societies');

    // Find the society that contains this user's request
    const society = await societiesCollection.findOne({
      'requests.requestId': new ObjectId(user.joinRequestId)
    });

    if (!society) {
      return res.json({
        success: true,
        data: null
      });
    }

    // Find the specific request
    const joinRequest = society.requests.find(req => 
      req.requestId.toString() === user.joinRequestId.toString()
    );

    if (!joinRequest) {
      return res.json({
        success: true,
        data: null
      });
    }

    res.json({
      success: true,
      data: {
        id: joinRequest.requestId.toString(),
        societyName: society.name,
        status: joinRequest.status,
        submittedAt: joinRequest.submittedAt,
        reviewedAt: joinRequest.reviewedAt,
        rejectionReason: joinRequest.rejectionReason,
        requestedData: joinRequest.requestedData
      }
    });
  } catch (error) {
    console.error('Error fetching join request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch join request'
    });
  }
}));

/**
 * @route   POST /api/join-requests/:id/documents
 * @desc    Upload documents for join request
 * @access  Authenticated users
 */
router.post('/:id/documents', verifyClerkToken, getUserDetails, ensureUserDocument, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, documentUrl } = req.body;
    const clerkUserId = req.userId;

    if (!documentType || !documentUrl) {
      return res.status(400).json({
        success: false,
        message: 'Document type and URL are required'
      });
    }

    const db = dbConnection.getDb();
    const joinRequestsCollection = db.collection('joinRequests');

    // Verify join request belongs to user
    const joinRequest = await joinRequestsCollection.findOne({
      _id: new ObjectId(id),
      clerkUserId
    });

    if (!joinRequest) {
      return res.status(404).json({
        success: false,
        message: 'Join request not found'
      });
    }

    if (joinRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot upload documents for non-pending requests'
      });
    }

    // Add document to join request
    const document = {
      type: documentType,
      url: documentUrl,
      uploadedAt: new Date()
    };

    await joinRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $push: { documents: document },
        $set: { updatedAt: new Date() }
      }
    );

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document'
    });
  }
}));

/**
 * @route   DELETE /api/join-requests/:id
 * @desc    Withdraw a join request
 * @access  Authenticated users
 */
router.delete('/:id', verifyClerkToken, getUserDetails, ensureUserDocument, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const clerkUserId = req.userId;
    const user = req.userDocument;

    // Verify the request belongs to the user
    if (!user || !user.joinRequestId || user.joinRequestId.toString() !== id) {
      return res.status(403).json({
        success: false,
        message: 'You can only withdraw your own join request'
      });
    }

    const db = dbConnection.getDb();
    const societiesCollection = db.collection('societies');

    // Find the society that contains this user's request
    const society = await societiesCollection.findOne({
      'requests.requestId': new ObjectId(id)
    });

    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Join request not found'
      });
    }

    // Find the specific request
    const requestIndex = society.requests.findIndex(req => 
      req.requestId.toString() === id
    );

    if (requestIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Join request not found'
      });
    }

    const joinRequest = society.requests[requestIndex];

    // Check if request is still pending
    if (joinRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot withdraw a request that has already been reviewed'
      });
    }

    // Remove the request from society's requests array
    society.requests.splice(requestIndex, 1);

    await societiesCollection.updateOne(
      { _id: society._id },
      {
        $set: {
          requests: society.requests,
          updatedAt: new Date()
        }
      }
    );

    // Clear join request reference from user document
    const usersCollection = db.collection('users');
    await usersCollection.updateOne(
      { clerkUserId },
      {
        $unset: { 
          joinRequestId: 1,
          wing: 1,
          flatNumber: 1,
          residentType: 1
        },
        $set: { updatedAt: new Date() }
      }
    );

    // Notify admins via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`society_${society._id}`).emit('join_request_withdrawn', {
        requestId: id,
        userName: user.name || 'User',
        wing: joinRequest.requestedData.wing,
        flatNumber: joinRequest.requestedData.flatNumber,
        societyName: society.name,
        withdrawnAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Join request withdrawn successfully',
      data: {
        requestId: id,
        societyName: society.name,
        withdrawnAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error withdrawing join request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to withdraw join request'
    });
  }
}));

module.exports = router;

