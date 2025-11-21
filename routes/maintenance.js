const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { verifyClerkToken, clerkClient } = require('../middleware/auth');
const { UserService } = require('../models/services');
const MaintenanceService = require('../models/services/MaintenanceService');
const dbConnection = require('../config/database');
const { ObjectId } = require('mongodb');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError, DatabaseError } = require('../middleware/errors');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads', 'maintenance');
fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP are allowed'));
  }
});

let utapi = null;
try {
  const { UTApi } = require('uploadthing/server');
  if (process.env.UPLOADTHING_SECRET) {
    utapi = new UTApi({
      apiKey: process.env.UPLOADTHING_SECRET
    });
  }
} catch (error) {
  console.warn('UploadThing not configured or failed to initialize:', error.message);
}


/**
 * POST /api/maintenance/upload
 * Upload maintenance payment screenshot
 * Requires authentication
 */
router.post('/upload', verifyClerkToken, asyncHandler(async (req, res) => {
  try {
    const { screenshotUrl, month, year, amount, monthsCount, notes } = req.body;
    const clerkUserId = req.userId;

    // Validate required fields
    if (!screenshotUrl || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Screenshot URL, month, and year are required'
      });
    }

    // Fetch user from database
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const userResult = await userService.findByClerkUserId(clerkUserId);
    
    if (!userResult.success || !userResult.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'User profile not found. Please complete society registration first.' 
      });
    }

    const user = userResult.data;

    // Validate user has society
    if (!user.societyId) {
      return res.status(400).json({
        success: false,
        message: 'User must be a member of a society to upload maintenance payments'
      });
    }

    const maintenanceService = new MaintenanceService(db);
    const parsedAmount = amount !== undefined ? parseFloat(amount) : undefined;
    const normalizedAmount =
      parsedAmount !== undefined && !Number.isNaN(parsedAmount) ? parsedAmount : undefined;
    const parsedMonths = monthsCount !== undefined ? parseInt(monthsCount, 10) : undefined;
    const normalizedMonths =
      parsedMonths !== undefined && !Number.isNaN(parsedMonths) ? parsedMonths : undefined;

    // Check if payment already exists for this month/year
    const existingPayment = await maintenanceService.findByUserAndMonth(
      clerkUserId,
      month,
      year
    );

    if (existingPayment.success && existingPayment.data) {
      // Update existing payment
      const updateResult = await maintenanceService.updatePaymentScreenshot(
        existingPayment.data._id,
        screenshotUrl,
        {
          amount: normalizedAmount,
          monthsCount: normalizedMonths,
          notes,
        }
      );

      if (!updateResult.success) {
        throw new DatabaseError('Failed to update payment screenshot');
      }

      // Notify admins via WebSocket
      const io = req.app.get('io');
      if (io) {
        io.to(`society_${user.societyId}`).emit('maintenance_payment_updated', {
          userId: clerkUserId,
          userName: user.name || 'User',
          month,
          year,
          screenshotUrl,
          updatedAt: new Date()
        });
      }

      return res.json({
        success: true,
        message: 'Payment screenshot updated successfully',
        data: updateResult.data
      });
    } else {
      // Ensure societyId is ObjectId
      const societyObjectId = ObjectId.isValid(user.societyId) 
        ? (user.societyId instanceof ObjectId ? user.societyId : new ObjectId(user.societyId))
        : user.societyId;

      // Create new payment record
      const paymentData = {
        clerkUserId,
        societyId: societyObjectId,
        societyName: user.societyName,
        wing: user.wing,
        flatNumber: user.flatNumber,
        month: month.trim(),
        year: parseInt(year),
        amount: normalizedAmount ?? 0,
        monthsCount: normalizedMonths ?? 1,
        paymentProof: {
          screenshot: screenshotUrl,
          uploadedAt: new Date(),
          approvalStatus: 'pending'
        },
        status: 'request_sent',
        notes: notes || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const createResult = await maintenanceService.create(paymentData);

      if (!createResult.success) {
        throw new DatabaseError('Failed to create payment record');
      }

      // Notify admins via WebSocket
      const io = req.app.get('io');
      if (io) {
        io.to(`society_${user.societyId}`).emit('maintenance_payment_uploaded', {
          userId: clerkUserId,
          userName: user.name || 'User',
          month,
          year,
          screenshotUrl,
          paymentId: createResult.data._id,
          uploadedAt: new Date()
        });
      }

      return res.json({
        success: true,
        message: 'Payment screenshot uploaded successfully',
        data: createResult.data
      });
    }
  } catch (error) {
    console.error('Error uploading maintenance payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload payment screenshot'
    });
  }
}));

/**
 * POST /api/maintenance/upload-file
 * Upload maintenance screenshot file (server-side storage)
 * multipart/form-data: file, month, year
 */
router.post('/upload-file', verifyClerkToken, upload.single('file'), asyncHandler(async (req, res) => {
  try {
    const { month, year } = req.body;
    const clerkUserId = req.userId;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    // Fetch user from database
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const userResult = await userService.findByClerkUserId(clerkUserId);
    
    if (!userResult.success || !userResult.data) {
      return res.status(404).json({ 
        success: false, 
        message: 'User profile not found. Please complete society registration first.' 
      });
    }

    const user = userResult.data;

    if (!user.societyId) {
      return res.status(400).json({ success: false, message: 'User must be a member of a society' });
    }

    const filePath = path.join(uploadsDir, req.file.filename);
    const publicUrl = `${req.protocol}://${req.get('host')}/uploads/maintenance/${req.file.filename}`;

    let uploadthingUrl = null;
    if (utapi) {
      try {
        const fileBuffer = await fs.promises.readFile(filePath);
        const fileName = req.file.originalname || `maintenance_${Date.now()}.png`;
        const uploadResponse = await utapi.uploadFiles([
          new File([fileBuffer], fileName, {
            type: req.file.mimetype || 'image/png',
          }),
        ]);

        const uploadedFile = Array.isArray(uploadResponse)
          ? uploadResponse[0]
          : uploadResponse;

        const remoteUrl =
          uploadedFile?.data?.url ||
          uploadedFile?.url ||
          uploadedFile?.data?.[0]?.url;

        if (remoteUrl) {
          uploadthingUrl = remoteUrl;
          // remove local file copy once uploaded successfully
          fs.unlink(filePath, (err) => {
            if (err) {
              console.warn('Failed to remove local maintenance upload file:', err.message);
            }
          });
        }
      } catch (error) {
        console.error('UploadThing upload failed:', error.message);
      }
    }

    const screenshotUrl = uploadthingUrl || publicUrl;

    const maintenanceService = new MaintenanceService(db);
    const amountValue = req.body.amount;
    const monthsValue = req.body.monthsCount;
    const parsedAmount = amountValue !== undefined ? parseFloat(amountValue) : undefined;
    const normalizedAmount =
      parsedAmount !== undefined && !Number.isNaN(parsedAmount) ? parsedAmount : undefined;
    const parsedMonths = monthsValue !== undefined ? parseInt(monthsValue, 10) : undefined;
    const normalizedMonths =
      parsedMonths !== undefined && !Number.isNaN(parsedMonths) ? parsedMonths : undefined;
    const notes = req.body.notes;

    const existing = await maintenanceService.findByUserAndMonth(clerkUserId, month, parseInt(year));

    if (existing.success && existing.data) {
      const updateResult = await maintenanceService.updatePaymentScreenshot(
        existing.data._id,
        screenshotUrl,
        {
          amount: normalizedAmount,
          monthsCount: normalizedMonths,
          notes,
        }
      );
      if (!updateResult.success) throw new DatabaseError('Failed to update payment screenshot');
      return res.json({ success: true, message: 'Payment screenshot updated', data: updateResult.data });
    }

    // Ensure societyId is ObjectId
    const societyObjectId = ObjectId.isValid(user.societyId) 
      ? (user.societyId instanceof ObjectId ? user.societyId : new ObjectId(user.societyId))
      : user.societyId;

    const paymentData = {
      clerkUserId,
      societyId: societyObjectId,
      societyName: user.societyName,
      wing: user.wing,
      flatNumber: user.flatNumber,
      month: month.trim(),
      year: parseInt(year),
      amount: normalizedAmount ?? 0,
      monthsCount: normalizedMonths ?? 1,
      paymentProof: {
        screenshot: screenshotUrl,
        uploadedAt: new Date(),
        approvalStatus: 'pending'
      },
      status: 'request_sent',
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const createResult = await maintenanceService.create(paymentData);
    if (!createResult.success) throw new DatabaseError('Failed to create payment record');

    res.json({ success: true, message: 'Payment screenshot uploaded', data: createResult.data });
  } catch (error) {
    console.error('Error in upload-file:', error);
    res.status(500).json({ success: false, message: 'Failed to upload payment screenshot' });
  }
}));

/**
 * GET /api/maintenance/calendar
 * Get maintenance calendar data for current user
 * Requires authentication
 */
router.get('/calendar', verifyClerkToken, asyncHandler(async (req, res) => {
  try {
    const clerkUserId = req.userId;
    
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const maintenanceService = new MaintenanceService(db);

    // Get user details from database
    const userResult = await userService.findByClerkUserId(clerkUserId);
    if (!userResult.success || !userResult.data) {
      return res.json({
        success: true,
        data: {
          totalPaid: 0,
          pendingAmount: 0,
          overdueAmount: 0,
          lastPaymentDate: null,
          nextDueDate: null,
          paymentHistory: []
        }
      });
    }

    const result = await maintenanceService.findByUser(clerkUserId);

    if (!result.success) {
      throw new DatabaseError('Failed to retrieve maintenance records');
    }

    // Format the response for calendar view
    const calendarData = result.data.map(record => ({
      _id: record._id,
      month: record.month,
      year: record.year,
      amount: record.amount || 0,
      monthsCount: record.monthsCount || 1,
      paymentProof: {
        screenshot: record.paymentProof?.screenshot || null,
        uploadedAt: record.paymentProof?.uploadedAt || null,
        approvalStatus: record.paymentProof?.approvalStatus || 'pending',
        approvedAt: record.paymentProof?.approvedAt || null,
        approvedBy: record.paymentProof?.approvedBy || null,
        rejectionReason: record.paymentProof?.rejectionReason || null
      },
      status: record.status || 'pending',
      notes: record.notes || '',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }));

    res.json({
      success: true,
      data: calendarData
    });
  } catch (error) {
    console.error('Error fetching maintenance calendar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance calendar'
    });
  }
}));

/**
 * GET /api/maintenance/history
 * Get maintenance payment history for current user
 * Requires authentication
 */
router.get('/history', verifyClerkToken, asyncHandler(async (req, res) => {
  try {
    const clerkUserId = req.userId;
    
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const maintenanceService = new MaintenanceService(db);

    // Get user details from database
    const userResult = await userService.findByClerkUserId(clerkUserId);
    if (!userResult.success || !userResult.data) {
      const nextDueDate = new Date();
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      nextDueDate.setDate(1);
      return res.json({
        success: true,
        data: {
          totalPaid: 0,
          pendingAmount: 0,
          overdueAmount: 0,
          lastPaymentDate: null,
          nextDueDate: nextDueDate.toISOString(),
          paymentHistory: []
        }
      });
    }

    const result = await maintenanceService.findByUser(clerkUserId, {
      sort: { year: -1, month: -1 }
    });

    if (!result.success) {
      throw new DatabaseError('Failed to retrieve maintenance history');
    }

    // Format the response for consistent structure
    // Ensure all records have proper formatting
    const formattedRecords = result.data.map(record => ({
      _id: record._id,
      month: record.month,
      year: record.year,
      amount: record.amount || 0,
      monthsCount: record.monthsCount || 1,
      paymentProof: {
        screenshot: record.paymentProof?.screenshot || null,
        uploadedAt: record.paymentProof?.uploadedAt || null,
        approvalStatus: record.paymentProof?.approvalStatus || 'pending',
        approvedAt: record.paymentProof?.approvedAt || null,
        approvedBy: record.paymentProof?.approvedBy || null,
        rejectionReason: record.paymentProof?.rejectionReason || null
      },
      status: record.status || 'pending',
      notes: record.notes || '',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }));
    
    const formattedData = {
      totalPaid: formattedRecords.filter(r => r.status === 'paid' || r.status === 'approved').length,
      pendingAmount: formattedRecords.filter(r => r.status === 'pending' || r.status === 'request_sent').length,
      overdueAmount: formattedRecords.filter(r => r.status === 'overdue').length,
      lastPaymentDate: formattedRecords.find(r => r.status === 'paid' || r.status === 'approved')?.updatedAt || null,
      nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      paymentHistory: formattedRecords
    };

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Error fetching maintenance history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance history'
    });
  }
}));

/**
 * GET /api/maintenance/summary
 * Get maintenance payment summary for current user
 * Requires authentication
 */
router.get('/summary', verifyClerkToken, asyncHandler(async (req, res) => {
  try {
    const clerkUserId = req.userId;
    
    const db = dbConnection.getDb();
    const userService = new UserService(db);
    const maintenanceService = new MaintenanceService(db);

    // Get user details from database
    const userResult = await userService.findByClerkUserId(clerkUserId);
    if (!userResult.success || !userResult.data) {
      const nextDueDate = new Date();
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      nextDueDate.setDate(1);
      return res.json({
        success: true,
        data: {
          total: 0,
          totalAmount: 0,
          paid: 0,
          pending: 0,
          overdue: 0,
          paidAmount: 0,
          pendingAmount: 0,
          overdueAmount: 0,
          recentRecords: [],
          totalPaid: 0,
          lastPaymentDate: null,
          nextDueDate: nextDueDate.toISOString(),
          paymentHistory: []
        }
      });
    }

    // Get all user's maintenance records
    const result = await maintenanceService.findByUser(clerkUserId);
    
    if (!result.success) {
      throw new DatabaseError('Failed to retrieve maintenance summary');
    }

    const records = result.data || [];
    
    // If no records, return empty summary
    if (!records || records.length === 0) {
      const nextDueDate = new Date();
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      nextDueDate.setDate(1);
      return res.json({
        success: true,
        data: {
          total: 0,
          totalAmount: 0,
          paid: 0,
          pending: 0,
          overdue: 0,
          paidAmount: 0,
          pendingAmount: 0,
          overdueAmount: 0,
          recentRecords: [],
          totalPaid: 0,
          lastPaymentDate: null,
          nextDueDate: nextDueDate.toISOString(),
          paymentHistory: []
        }
      });
    }
    
    // Calculate summary statistics
    const total = records.length;
    
    // Count records by status - check both status and paymentProof.approvalStatus
    const paid = records.filter(r => {
      const status = r.status || '';
      const approvalStatus = r.paymentProof?.approvalStatus || '';
      return status === 'paid' || 
             status === 'approved' || 
             approvalStatus === 'approved';
    }).length;
    
    const pending = records.filter(r => {
      const status = r.status || '';
      const approvalStatus = r.paymentProof?.approvalStatus || '';
      return (status === 'pending' || 
              status === 'request_sent' || 
              approvalStatus === 'pending') &&
             approvalStatus !== 'approved';
    }).length;
    
    const overdue = records.filter(r => (r.status || '') === 'overdue').length;
    
    // Calculate amounts - sum all amounts regardless of status
    const totalAmount = records.reduce((sum, r) => {
      const amount = parseFloat(r.amount) || 0;
      return sum + amount;
    }, 0);
    
    // Calculate paid amount - only from approved/paid records
    const paidAmount = records
      .filter(r => {
        const status = r.status || '';
        const approvalStatus = r.paymentProof?.approvalStatus || '';
        return status === 'paid' || 
               status === 'approved' || 
               approvalStatus === 'approved';
      })
      .reduce((sum, r) => {
        const amount = parseFloat(r.amount) || 0;
        return sum + amount;
      }, 0);
    
    // Calculate pending amount
    const pendingAmount = records
      .filter(r => {
        const status = r.status || '';
        const approvalStatus = r.paymentProof?.approvalStatus || '';
        return (status === 'pending' || 
                status === 'request_sent' || 
                approvalStatus === 'pending') &&
               approvalStatus !== 'approved';
      })
      .reduce((sum, r) => {
        const amount = parseFloat(r.amount) || 0;
        return sum + amount;
      }, 0);
    
    // Calculate overdue amount
    const overdueAmount = records
      .filter(r => (r.status || '') === 'overdue')
      .reduce((sum, r) => {
        const amount = parseFloat(r.amount) || 0;
        return sum + amount;
      }, 0);
    
    // Debug logging
    console.log('Maintenance Summary Calculation:', {
      totalRecords: total,
      paidCount: paid,
      pendingCount: pending,
      overdueCount: overdue,
      totalAmount,
      paidAmount,
      pendingAmount,
      overdueAmount,
      sampleRecord: records[0] || null
    });

    const lastPayment = records
      .filter(r => r.status === 'paid' || r.status === 'approved' || r.paymentProof?.approvalStatus === 'approved')
      .sort((a, b) => {
        const dateA = a.paymentProof?.approvedAt || a.updatedAt || a.createdAt;
        const dateB = b.paymentProof?.approvedAt || b.updatedAt || b.createdAt;
        return new Date(dateB) - new Date(dateA);
      })[0];

    const nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    nextDueDate.setDate(1); // First day of next month

    const summary = {
      // Frontend expected fields
      total,
      totalAmount,
      paid,
      pending,
      overdue,
      paidAmount,
      pendingAmount,
      overdueAmount,
      recentRecords: records.slice(0, 12), // Last 12 months
      // Legacy fields for backward compatibility
      totalPaid: paidAmount,
      lastPaymentDate: lastPayment?.paymentProof?.approvedAt || lastPayment?.updatedAt || lastPayment?.createdAt || null,
      nextDueDate: nextDueDate.toISOString(),
      paymentHistory: records.slice(0, 12) // Last 12 months
    };

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching maintenance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maintenance summary'
    });
  }
}));

module.exports = router;