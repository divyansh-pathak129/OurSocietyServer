const express = require('express');
const { verifyClerkToken, getUserDetails, clerkClient } = require('../../middleware/auth');
const { verifyAdminAuth } = require('../../middleware/adminAuth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ObjectId } = require('mongodb');
const dbConnection = require('../../config/database');
const UserService = require('../../models/services/UserService');
const MaintenanceService = require('../../models/services/MaintenanceService');
const SocietyService = require('../../models/services/SocietyService');

const router = express.Router();

// Get maintenance records for a specific month
router.get('/records', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const { month } = req.query;
  
  if (!month) {
    return res.status(400).json({
      success: false,
      message: 'Month parameter is required (format: YYYY-MM)'
    });
  }

    const db = dbConnection.getDb();
  const userService = new UserService(db);
    const maintenanceService = new MaintenanceService(db);
    const societyService = new SocietyService(db);

  try {
    // Get all users in the society
    const societyId = req.adminUser.societyId;
    if (!societyId) {
      return res.status(400).json({
        success: false,
        message: 'Society ID is required'
      });
    }

    // Fetch society name from MongoDB (not from user data)
    let societyName = 'Unknown Society';
    try {
      const societyResult = await societyService.findById(societyId);
      if (societyResult.success && societyResult.data?.name) {
        societyName = societyResult.data.name;
      }
    } catch (societyError) {
      console.warn('Failed to fetch society name:', societyError.message);
    }

    // Convert societyId to ObjectId if it's a string
    const societyObjectId = ObjectId.isValid(societyId) ? new ObjectId(societyId) : societyId;
    
    const usersResult = await userService.find({ societyId: societyObjectId });
    if (!usersResult.success) {
      throw new Error('Failed to fetch society users');
    }

    const users = usersResult.data || [];
    const [year, monthNum] = month.split('-');

    // Get maintenance records for the month
    const recordsResult = await maintenanceService.findByMonthAndSociety(
      parseInt(year),
      parseInt(monthNum),
      req.adminUser.societyId
    );

    const records = recordsResult.data || [];

    // Create a map of existing records by clerkUserId
    const recordsMap = new Map();
    records.forEach(record => {
      recordsMap.set(record.clerkUserId, record);
    });

    // Create records for all users, including those without maintenance records
    const allRecords = await Promise.all(users.map(async (user) => {
      const existingRecord = recordsMap.get(user.clerkUserId);
      
      // Fetch user name from Clerk
      let userName = 'Unknown';
      try {
        const clerkUser = await clerkClient.users.getUser(user.clerkUserId);
        userName = clerkUser.fullName || clerkUser.firstName || 'Unknown';
      } catch (error) {
        console.warn(`Failed to fetch name from Clerk for user ${user.clerkUserId}:`, error.message);
      }
      
      if (existingRecord) {
        // Get screenshot URL from paymentProof.screenshot (primary) or paymentScreenshot (legacy)
        const screenshotRecord =
          existingRecord.paymentProof?.screenshot || 
          existingRecord.paymentScreenshot || 
          null;
        
        let screenshotSource = null;
        let screenshotUrl = null;
        
        if (screenshotRecord) {
          console.log('Processing screenshot record:', {
            type: typeof screenshotRecord,
            value: screenshotRecord?.substring(0, 100), // Log first 100 chars
            hasPaymentProof: !!existingRecord.paymentProof,
            hasPaymentScreenshot: !!existingRecord.paymentScreenshot
          });
          
          // Check if it's a URL (http, https, or UploadThing CDN)
          const isUrl = typeof screenshotRecord === 'string' && (
            /^https?:\/\//.test(screenshotRecord) ||
            screenshotRecord.startsWith('https://utfs.io/') ||
            screenshotRecord.startsWith('https://uploadthing.com/') ||
            screenshotRecord.includes('uploadthing')
          );
          
          if (isUrl) {
            // It's a URL (UploadThing or other CDN), use it directly
            console.log('Screenshot is a URL, using directly:', screenshotRecord);
            screenshotSource = screenshotRecord;
            screenshotUrl = screenshotRecord;
          } else {
            // It's a local filename, try to read and convert to base64
            try {
              const fs = require('fs');
              const path = require('path');
              const screenshotPath = path.join(
                __dirname,
                '..',
                '..',
                'uploads',
                'maintenance',
                screenshotRecord
              );
              if (fs.existsSync(screenshotPath)) {
                console.log('Found local screenshot file, converting to base64');
                const imageBuffer = fs.readFileSync(screenshotPath);
                screenshotSource = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                // For local files, also provide the public URL
                const host = req.get('host') || 'localhost:5000';
                const protocol = req.protocol || 'http';
                screenshotUrl = `${protocol}://${host}/uploads/maintenance/${screenshotRecord}`;
                console.log('Generated screenshot URL:', screenshotUrl);
              } else {
                console.warn(`Screenshot file not found: ${screenshotPath}`);
              }
            } catch (error) {
              console.warn('Failed to convert screenshot to base64:', error.message);
            }
          }
        }

        const recordData = {
          _id: existingRecord._id,
          userId: user._id,
          userName: userName,
          userWing: user.wing || 'N/A',
          userFlat: user.flatNumber || 'N/A',
          userPhone: user.contactNumber || 'N/A',
          residentType: user.residentType || 'Owner', // Include resident type
          societyId: societyId.toString(),
          societyName: societyName, // From MongoDB, not user data
          month: month,
          year: parseInt(year),
          amount: existingRecord.amount || 0,
          monthsCount: existingRecord.monthsCount || 1,
          status: existingRecord.status || 'pending',
          paymentScreenshot: screenshotSource, // base64 for local files, URL for remote
          paymentScreenshotUrl: screenshotUrl, // Always the URL (UploadThing or local public URL)
          notes: existingRecord.notes,
          createdAt: existingRecord.createdAt,
          updatedAt: existingRecord.updatedAt,
          // Also include paymentProof structure for compatibility
          paymentProof: {
            screenshot: screenshotUrl || screenshotSource,
            uploadedAt: existingRecord.paymentProof?.uploadedAt || existingRecord.createdAt,
            approvalStatus: existingRecord.paymentProof?.approvalStatus || 'pending',
            ...(existingRecord.paymentProof?.approvedAt && { approvedAt: existingRecord.paymentProof.approvedAt }),
            ...(existingRecord.paymentProof?.approvedBy && { approvedBy: existingRecord.paymentProof.approvedBy }),
            ...(existingRecord.paymentProof?.rejectionReason && { rejectionReason: existingRecord.paymentProof.rejectionReason }),
          }
        };
        
        console.log('Returning record with screenshot:', {
          hasScreenshot: !!recordData.paymentScreenshot,
          hasScreenshotUrl: !!recordData.paymentScreenshotUrl,
          screenshotType: recordData.paymentScreenshot?.substring(0, 20) || 'null',
          screenshotUrlType: recordData.paymentScreenshotUrl?.substring(0, 50) || 'null'
        });
        
        return recordData;
      } else {
        // Create a default record for users without maintenance records
        return {
          _id: `temp_${user._id}_${month}_${year}`,
          userId: user._id,
          userName: userName,
          userWing: user.wing || 'N/A',
          userFlat: user.flatNumber || 'N/A',
          userPhone: user.contactNumber || 'N/A',
          residentType: user.residentType || 'Owner', // Include resident type
          societyId: societyId.toString(),
          societyName: societyName, // From MongoDB, not user data
          month: month,
          year: parseInt(year),
          amount: 0,
          monthsCount: 1,
          status: 'pending',
          paymentScreenshot: null,
          paymentScreenshotUrl: null,
          notes: null,
          createdAt: null,
          updatedAt: null
        };
      }
    }));

    // Calculate stats
    const stats = {
      totalUsers: allRecords.length,
      paidUsers: allRecords.filter(r => r.status === 'paid' || r.status === 'approved').length,
      pendingUsers: allRecords.filter(r => r.status === 'pending').length,
      requestSentUsers: allRecords.filter(r => r.status === 'request_sent').length,
      totalAmount: allRecords.reduce((sum, r) => sum + (r.amount || 0), 0),
      collectedAmount: allRecords
        .filter(r => r.status === 'paid' || r.status === 'approved')
        .reduce((sum, r) => sum + (r.amount || 0), 0)
    };

    res.json({
      success: true,
      records: allRecords,
      stats: stats
    });

  } catch (error) {
    console.error('Error fetching maintenance records:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance records'
    });
  }
}));

// Send notification to user
router.post('/notify/:recordId', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const { recordId } = req.params;

    if (!ObjectId.isValid(recordId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid record ID'
    });
    }

    const db = dbConnection.getDb();
    const maintenanceService = new MaintenanceService(db);

  try {
    // Update record status to request_sent
    const updateResult = await maintenanceService.updateRecord(recordId, {
      status: 'request_sent',
      updatedAt: new Date()
    });

    if (!updateResult.success) {
      throw new Error('Failed to update record status');
    }

    // TODO: Send actual notification (email, SMS, push notification)
    console.log(`Notification sent for record ${recordId}`);

    res.json({
      success: true,
      message: 'Notification sent successfully'
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification'
    });
  }
}));

// Approve payment
router.post('/approve/:recordId', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const { recordId } = req.params;
  const { amount, approvedForMonths } = req.body;

    if (!ObjectId.isValid(recordId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid record ID'
    });
    }

    const db = dbConnection.getDb();
    const maintenanceService = new MaintenanceService(db);

  try {
    // Get the record to get the amount if not provided
    const recordResult = await maintenanceService.findById(recordId);
    if (!recordResult.success || !recordResult.data) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    const record = recordResult.data;
    const approvalAmount = amount ? parseFloat(amount) : (record.amount || 0);
    const approvalMonths = approvedForMonths ? parseInt(approvedForMonths) : (record.monthsCount || 1);

    // Use the approvePayment method which updates both status and approvalStatus
    const updateResult = await maintenanceService.approvePayment(
      recordId,
      req.adminUser.clerkUserId,
      approvalAmount,
      approvalMonths
    );

    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to approve payment');
    }

    res.json({
      success: true,
      message: 'Payment approved successfully',
      data: updateResult.data
    });

  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve payment'
    });
  }
}));


// Reject payment
router.post('/reject/:recordId', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const { recordId } = req.params;
  const { reason } = req.body;
  
  if (!ObjectId.isValid(recordId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid record ID'
    });
    }

    const db = dbConnection.getDb();
    const maintenanceService = new MaintenanceService(db);

  try {
    // Use the rejectPayment method which updates both status and approvalStatus
    const updateResult = await maintenanceService.rejectPayment(
      recordId,
      req.adminUser.clerkUserId,
      reason || 'Payment rejected by admin'
    );

    if (!updateResult.success) {
      throw new Error(updateResult.error || 'Failed to reject payment');
    }

    res.json({
      success: true,
      message: 'Payment rejected successfully',
      data: updateResult.data
    });

  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject payment'
    });
  }
}));

module.exports = router;