const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../middleware/errorHandler');
const { verifyAdminAuth, requirePermission, logAdminAction } = require('../../middleware/adminAuth');
const dbConnection = require('../../config/database');
const { ObjectId } = require('mongodb');

/**
 * @route   GET /api/admin/join-requests
 * @desc    Get all pending join requests for admin's society
 * @access  Admin
 */
router.get('/', verifyAdminAuth, requirePermission('join_requests', 'read'), asyncHandler(async (req, res) => {
  try {
    const { adminUser } = req;
    const { page = 1, limit = 20, status = 'pending' } = req.query;

    const db = dbConnection.getDb();
    const societiesCollection = db.collection('societies');

    // For super admins, get all societies; for regular admins, validate societyId
    let society = null;
    let requests = [];

    if (adminUser.role === 'super_admin') {
      // Super admin can see all join requests from all societies
      const allSocieties = await societiesCollection.find({}).toArray();
      requests = allSocieties.flatMap(soc => (soc.requests || []).map(req => ({
        ...req,
        societyName: soc.name,
        societyId: soc._id
      })));
    } else {
      // Regular admin needs a specific society
      if (!adminUser.societyId) {
        return res.status(400).json({
          success: false,
          message: 'Admin user does not have a society assigned'
        });
      }

      // Validate ObjectId format
      let societyId;
      try {
        societyId = new ObjectId(adminUser.societyId);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid society ID format'
        });
      }

      // Get the society with its requests
      society = await societiesCollection.findOne({
        _id: societyId
      });

      if (!society) {
        return res.status(404).json({
          success: false,
          message: 'Society not found'
        });
      }

      requests = society.requests || [];
    }
    if (status !== 'all') {
      requests = requests.filter(req => req.status === status);
    }

    // Sort by submission date (newest first)
    requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    // Apply pagination
    const total = requests.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedRequests = requests.slice(skip, skip + parseInt(limit));

    // Enrich with user data from Clerk
    const enrichedRequests = await Promise.all(
      paginatedRequests.map(async (request) => {
        try {
          // Check if clerkUserId exists
          if (!request.clerkUserId) {
            throw new Error('No clerkUserId found for request');
          }

          const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${request.clerkUserId}`, {
            headers: {
              Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          let clerkData = {};
          if (clerkResponse.ok) {
            clerkData = await clerkResponse.json();
          } else {
            console.warn(`Clerk API error for user ${request.clerkUserId}: ${clerkResponse.status} - ${clerkResponse.statusText}`);
          }

          return {
            id: request._id?.toString() || request.requestId?.toString() || 'unknown',
            clerkUserId: request.clerkUserId,
            societyName: request.societyName,
            status: request.status,
            submittedAt: request.submittedAt,
            reviewedAt: request.reviewedAt,
            reviewedBy: request.reviewedBy,
            rejectionReason: request.rejectionReason,
            requestedData: request.requestedData,
            documents: request.documents || [],
            // Enriched user data
            user: {
              name: clerkData.first_name && clerkData.last_name 
                ? `${clerkData.first_name} ${clerkData.last_name}` 
                : clerkData.email_addresses?.[0]?.email_address || 'Unknown',
              email: clerkData.email_addresses?.[0]?.email_address || '',
              profileImageUrl: clerkData.profile_image_url,
              createdAt: clerkData.created_at
            }
          };
        } catch (error) {
          console.warn(`Failed to fetch Clerk data for user ${request.clerkUserId}:`, error);
          return {
            id: request._id?.toString() || request.requestId?.toString() || 'unknown',
            clerkUserId: request.clerkUserId,
            societyName: request.societyName,
            status: request.status,
            submittedAt: request.submittedAt,
            reviewedAt: request.reviewedAt,
            reviewedBy: request.reviewedBy,
            rejectionReason: request.rejectionReason,
            requestedData: request.requestedData,
            documents: request.documents || [],
            user: {
              name: 'Unknown User',
              email: '',
              profileImageUrl: null,
              createdAt: null
            }
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        requests: enrichedRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching join requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch join requests'
    });
  }
}));

/**
 * @route   GET /api/admin/join-requests/stats
 * @desc    Get join request statistics for dashboard
 * @access  Admin
 */
router.get('/stats', verifyAdminAuth, requirePermission('join_requests', 'read'), asyncHandler(async (req, res) => {
  try {
    const { adminUser } = req;
    const db = dbConnection.getDb();
    const societiesCollection = db.collection('societies');

    // For super admins, get all societies; for regular admins, validate societyId
    let requests = [];

    if (adminUser.role === 'super_admin') {
      // Super admin can see all join requests from all societies
      const allSocieties = await societiesCollection.find({}).toArray();
      requests = allSocieties.flatMap(soc => soc.requests || []);
    } else {
      // Regular admin needs a specific society
      if (!adminUser.societyId) {
        return res.status(400).json({
          success: false,
          message: 'Admin user does not have a society assigned'
        });
      }

      // Validate ObjectId format
      let societyId;
      try {
        societyId = new ObjectId(adminUser.societyId);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid society ID format'
        });
      }

      // Get the society with its requests
      const society = await societiesCollection.findOne({
        _id: societyId
      });

      if (!society) {
        return res.status(404).json({
          success: false,
          message: 'Society not found'
        });
      }

      requests = society.requests || [];
    }
    
    // Calculate statistics
    const total = requests.length;
    const pending = requests.filter(req => req.status === 'pending').length;
    const approved = requests.filter(req => req.status === 'approved').length;
    const rejected = requests.filter(req => req.status === 'rejected').length;
    
    // This month's requests
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const thisMonth = requests.filter(req => 
      new Date(req.submittedAt) >= thisMonthStart
    ).length;

    res.json({
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        thisMonth
      }
    });
  } catch (error) {
    console.error('Error fetching join request stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch join request statistics'
    });
  }
}));

/**
 * @route   POST /api/admin/join-requests/:id/approve
 * @desc    Approve a join request
 * @access  Admin
 */
router.post('/:id/approve', verifyAdminAuth, requirePermission('join_requests', 'write'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { adminUser } = req;
    const db = dbConnection.getDb();
    const societiesCollection = db.collection('societies');

    // Validate societyId
    if (!adminUser.societyId) {
      return res.status(400).json({
        success: false,
        message: 'Admin user does not have a society assigned'
      });
    }

    // Validate ObjectId format
    let societyId;
    try {
      societyId = new ObjectId(adminUser.societyId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid society ID format'
      });
    }

    // Get the society with its requests
    const society = await societiesCollection.findOne({
      _id: societyId
    });

    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Society not found'
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

    if (joinRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Join request is not pending'
      });
    }

    // Update join request status in society
    society.requests[requestIndex] = {
      ...joinRequest,
      status: 'approved',
      reviewedBy: adminUser.clerkUserId,
      reviewedAt: new Date(),
      updatedAt: new Date()
    };

    await societiesCollection.updateOne(
      { _id: new ObjectId(adminUser.societyId) },
      {
        $set: {
          requests: society.requests,
          updatedAt: new Date()
        }
      }
    );

    // Upsert user document with approved membership
    const usersCollection = db.collection('users');
    await usersCollection.updateOne(
      { clerkUserId: joinRequest.clerkUserId },
      {
        $setOnInsert: {
          clerkUserId: joinRequest.clerkUserId,
          isActive: true,
          createdAt: new Date(),
        },
        $set: {
          societyId: new ObjectId(adminUser.societyId),
          societyName: society.name,
          wing: joinRequest.requestedData.wing,
          flatNumber: joinRequest.requestedData.flatNumber,
          residentType: joinRequest.requestedData.residentType,
          contactNumber: joinRequest.requestedData.contactNumber,
          isApproved: true,
          approvedAt: new Date(),
          updatedAt: new Date(),
          joinRequestId: null,
        }
      },
      { upsert: true }
    );

    // Add user to society's residents array
    await societiesCollection.updateOne(
      { _id: new ObjectId(adminUser.societyId) },
      {
        $addToSet: { residents: joinRequest.clerkUserId },
        $set: { updatedAt: new Date() }
      }
    );

    // Log admin action
    await logAdminAction(adminUser, 'approve_join_request', 'join_requests', {
      requestId: id,
      userId: joinRequest.clerkUserId,
      userName: joinRequest.requestedData.wing + '/' + (joinRequest.requestedData.flatNumber || 'N/A'),
      societyName: joinRequest.societyName,
      ipAddress: req.ip
    });

    // Notify user via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${joinRequest.clerkUserId}`).emit('join_request_approved', {
        requestId: id,
        societyName: joinRequest.societyName,
        approvedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Join request approved successfully',
      data: {
        requestId: id,
        status: 'approved',
        approvedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error approving join request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve join request'
    });
  }
}));

/**
 * @route   POST /api/admin/join-requests/:id/reject
 * @desc    Reject a join request
 * @access  Admin
 */
router.post('/:id/reject', verifyAdminAuth, requirePermission('join_requests', 'write'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { adminUser } = req;
    const db = dbConnection.getDb();

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    // Validate societyId
    if (!adminUser.societyId) {
      return res.status(400).json({
        success: false,
        message: 'Admin user does not have a society assigned'
      });
    }

    // Validate ObjectId format
    let societyId;
    try {
      societyId = new ObjectId(adminUser.societyId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid society ID format'
      });
    }

    // Get join request
    const joinRequestsCollection = db.collection('joinRequests');
    const joinRequest = await joinRequestsCollection.findOne({
      _id: new ObjectId(id),
      societyId: societyId
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
        message: 'Join request is not pending'
      });
    }

    // Update join request status
    await joinRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'rejected',
          reviewedBy: adminUser.clerkUserId,
          reviewedAt: new Date(),
          rejectionReason: reason.trim(),
          updatedAt: new Date()
        }
      }
    );

    // Clear join request reference from user document
    const usersCollection = db.collection('users');
    await usersCollection.updateOne(
      { clerkUserId: joinRequest.clerkUserId },
      {
        $unset: { joinRequestId: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    // Log admin action
    await logAdminAction(adminUser, 'reject_join_request', 'join_requests', {
      requestId: id,
      userId: joinRequest.clerkUserId,
      userName: joinRequest.requestedData.wing + '/' + (joinRequest.requestedData.flatNumber || 'N/A'),
      societyName: joinRequest.societyName,
      reason: reason.trim(),
      ipAddress: req.ip
    });

    // Notify user via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${joinRequest.clerkUserId}`).emit('join_request_rejected', {
        requestId: id,
        societyName: joinRequest.societyName,
        reason: reason.trim(),
        rejectedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Join request rejected successfully',
      data: {
        requestId: id,
        status: 'rejected',
        rejectedAt: new Date(),
        reason: reason.trim()
      }
    });
  } catch (error) {
    console.error('Error rejecting join request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject join request'
    });
  }
}));

/**
 * @route   GET /api/admin/join-requests/:id
 * @desc    Get detailed join request information
 * @access  Admin
 */
router.get('/:id', verifyAdminAuth, requirePermission('join_requests', 'read'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { adminUser } = req;
    const db = dbConnection.getDb();
    const joinRequestsCollection = db.collection('joinRequests');

    const joinRequest = await joinRequestsCollection.findOne({
      _id: new ObjectId(id),
      societyId: new ObjectId(adminUser.societyId)
    });

    if (!joinRequest) {
      return res.status(404).json({
        success: false,
        message: 'Join request not found'
      });
    }

    // Get user data from Clerk
    let clerkData = {};
    try {
      const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${joinRequest.clerkUserId}`, {
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (clerkResponse.ok) {
        clerkData = await clerkResponse.json();
      }
    } catch (error) {
      console.warn(`Failed to fetch Clerk data for user ${joinRequest.clerkUserId}:`, error);
    }

    const enrichedRequest = {
      id: joinRequest._id.toString(),
      clerkUserId: joinRequest.clerkUserId,
      societyName: joinRequest.societyName,
      status: joinRequest.status,
      submittedAt: joinRequest.submittedAt,
      reviewedAt: joinRequest.reviewedAt,
      reviewedBy: joinRequest.reviewedBy,
      rejectionReason: joinRequest.rejectionReason,
      requestedData: joinRequest.requestedData,
      documents: joinRequest.documents || [],
      user: {
        name: clerkData.first_name && clerkData.last_name 
          ? `${clerkData.first_name} ${clerkData.last_name}` 
          : clerkData.email_addresses?.[0]?.email_address || 'Unknown',
        email: clerkData.email_addresses?.[0]?.email_address || '',
        profileImageUrl: clerkData.profile_image_url,
        createdAt: clerkData.created_at,
        phoneNumbers: clerkData.phone_numbers
      }
    };

    res.json({
      success: true,
      data: enrichedRequest
    });
  } catch (error) {
    console.error('Error fetching join request details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch join request details'
    });
  }
}));

module.exports = router;