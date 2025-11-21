const BaseService = require('./BaseService');
const { ObjectId } = require('mongodb');

class MaintenanceService extends BaseService {
  constructor(db) {
    super(db, 'maintenance');
  }

  /**
   * Find maintenance records by user
   * @param {string} clerkUserId - Clerk user ID
   * @param {object} options - Query options
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async findByUser(clerkUserId, options = {}) {
    try {
      const query = { clerkUserId };
      const records = await this.collection.find(query).sort(options.sort || { year: -1, month: -1 }).toArray();
      
      return {
        success: true,
        data: records
      };
    } catch (error) {
      console.error('Error finding maintenance records by user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find maintenance record by user and month/year
   * @param {string} clerkUserId - Clerk user ID
   * @param {string} month - Month name
   * @param {number} year - Year
   * @returns {Promise<{success: boolean, data: Object|null}>}
   */
  async findByUserAndMonth(clerkUserId, month, year) {
    try {
      const record = await this.collection.findOne({
        clerkUserId,
        month: month.trim(),
        year: parseInt(year)
      });
      
      return {
        success: true,
        data: record
      };
    } catch (error) {
      console.error('Error finding maintenance record by user and month:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update payment screenshot
   * @param {string} recordId - Record ID
   * @param {string} screenshotUrl - New screenshot URL
   * @returns {Promise<{success: boolean, data: Object|null}>}
   */
  async updatePaymentScreenshot(recordId, screenshotUrl, extra = {}) {
    try {
      const updatePayload = {
        'paymentProof.screenshot': screenshotUrl,
        'paymentProof.uploadedAt': new Date(),
        'paymentProof.approvalStatus': 'pending',
        updatedAt: new Date(),
        status: 'request_sent',
      };

      if (typeof extra.amount === 'number' && !Number.isNaN(extra.amount)) {
        updatePayload.amount = extra.amount;
      }

      if (typeof extra.monthsCount === 'number' && !Number.isNaN(extra.monthsCount)) {
        updatePayload.monthsCount = extra.monthsCount;
      }

      if (typeof extra.notes === 'string') {
        updatePayload.notes = extra.notes;
      }

      const result = await this.collection.updateOne(
        { _id: new ObjectId(recordId) },
        {
          $set: updatePayload
        }
      );

      if (result.modifiedCount === 0) {
        return {
          success: false,
          error: 'No record found or no changes made'
        };
      }

      const updatedRecord = await this.collection.findOne({ _id: new ObjectId(recordId) });
      
      return {
        success: true,
        data: updatedRecord
      };
    } catch (error) {
      console.error('Error updating payment screenshot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Approve maintenance payment
   * @param {string} recordId - Record ID
   * @param {string} approvedBy - Admin user ID who approved
   * @param {number} amount - Payment amount
   * @param {string} approvedForMonths - Months this payment covers
   * @returns {Promise<{success: boolean, data: Object|null}>}
   */
  async approvePayment(recordId, approvedBy, amount, approvedForMonths = 1) {
    try {
      const result = await this.collection.updateOne(
        { _id: new ObjectId(recordId) },
        {
          $set: {
            amount: amount,
            'paymentProof.approvalStatus': 'approved',
            'paymentProof.approvedAt': new Date(),
            'paymentProof.approvedBy': approvedBy,
            'paymentProof.approvedForMonths': approvedForMonths,
            status: 'approved',
            updatedAt: new Date()
          }
        }
      );

      if (result.modifiedCount === 0) {
        return {
          success: false,
          error: 'No record found or no changes made'
        };
      }

      const updatedRecord = await this.collection.findOne({ _id: new ObjectId(recordId) });
      
      return {
        success: true,
        data: updatedRecord
      };
    } catch (error) {
      console.error('Error approving maintenance payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reject maintenance payment
   * @param {string} recordId - Record ID
   * @param {string} rejectedBy - Admin user ID who rejected
   * @param {string} rejectionReason - Reason for rejection
   * @returns {Promise<{success: boolean, data: Object|null}>}
   */
  async rejectPayment(recordId, rejectedBy, rejectionReason) {
    try {
      const result = await this.collection.updateOne(
        { _id: new ObjectId(recordId) },
        {
          $set: {
            'paymentProof.approvalStatus': 'rejected',
            'paymentProof.rejectedAt': new Date(),
            'paymentProof.rejectedBy': rejectedBy,
            'paymentProof.rejectionReason': rejectionReason,
            status: 'rejected',
            updatedAt: new Date()
          }
        }
      );

      if (result.modifiedCount === 0) {
        return {
          success: false,
          error: 'No record found or no changes made'
        };
      }

      const updatedRecord = await this.collection.findOne({ _id: new ObjectId(recordId) });
      
      return {
        success: true,
        data: updatedRecord
      };
    } catch (error) {
      console.error('Error rejecting maintenance payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get maintenance records for society (admin view)
   * @param {string} societyId - Society ID
   * @param {object} filters - Filter options
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async getSocietyMaintenance(societyId, filters = {}) {
    try {
      const query = { societyId: new ObjectId(societyId) };
      
      // Apply filters
      if (filters.status) {
        query['paymentProof.approvalStatus'] = filters.status;
      }
      if (filters.month) {
        query.month = filters.month;
      }
      if (filters.year) {
        query.year = parseInt(filters.year);
      }
      if (filters.wing) {
        query.wing = filters.wing;
      }

      const records = await this.collection
        .find(query)
        .sort({ year: -1, month: -1, createdAt: -1 })
        .limit(filters.limit || 100)
        .toArray();
      
      return {
        success: true,
        data: records
      };
    } catch (error) {
      console.error('Error getting society maintenance records:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get maintenance statistics for society
   * @param {string} societyId - Society ID
   * @returns {Promise<{success: boolean, data: Object}>}
   */
  async getSocietyStats(societyId) {
    try {
      const pipeline = [
        { $match: { societyId: new ObjectId(societyId) } },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            approvedCount: {
              $sum: {
                $cond: [{ $eq: ['$paymentProof.approvalStatus', 'approved'] }, 1, 0]
              }
            },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ['$paymentProof.approvalStatus', 'pending'] }, 1, 0]
              }
            },
            rejectedCount: {
              $sum: {
                $cond: [{ $eq: ['$paymentProof.approvalStatus', 'rejected'] }, 1, 0]
              }
            },
            approvedAmount: {
              $sum: {
                $cond: [{ $eq: ['$paymentProof.approvalStatus', 'approved'] }, '$amount', 0]
              }
            }
          }
        }
      ];

      const result = await this.collection.aggregate(pipeline).toArray();
      const stats = result[0] || {
        totalRecords: 0,
        totalAmount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        approvedAmount: 0
      };
      
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('Error getting society maintenance stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get recent maintenance activities for a society
   * @param {string} societyId - Society ID
   * @param {number} limit - Max number of records
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async getRecentActivities(societyId, limit = 10) {
    try {
      const records = await this.collection
        .find({ societyId: new ObjectId(societyId) })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .toArray();

      return {
        success: true,
        data: records,
      };
    } catch (error) {
      console.error('Error getting recent maintenance activities:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get payment trends aggregated by month between dates
   * @param {string} societyId
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async getPaymentTrends(societyId, startDate, endDate) {
    try {
      const matchStage = {
        societyId: new ObjectId(societyId),
      };

      // If createdAt timestamps exist, filter by them; otherwise fallback to year/month window
      if (startDate && endDate) {
        matchStage.createdAt = { $gte: startDate, $lte: endDate };
      }

      const pipeline = [
        { $match: matchStage },
        {
          $addFields: {
            monthKey: {
              $concat: [
                { $toString: "$year" },
                "-",
                {
                  $cond: [
                    { $gte: [{ $strLenCP: "$month" }, 2] },
                    "$month",
                    { $concat: ["0", "$month"] },
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$monthKey",
            collected: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentProof.approvalStatus", "approved"] },
                  "$amount",
                  0,
                ],
              },
            },
            pending: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentProof.approvalStatus", "pending"] },
                  1,
                  0,
                ],
              },
            },
            overdue: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "overdue"] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const result = await this.collection.aggregate(pipeline).toArray();

      // Map to UI-friendly format
      const trends = result.map((r) => ({
        month: r._id?.slice(5, 7) || "",
        collected: r.collected || 0,
        pending: r.pending || 0,
        overdue: r.overdue || 0,
      }));

      return { success: true, data: trends };
    } catch (error) {
      console.error('Error getting payment trends:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send payment reminder to user
   * @param {string} clerkUserId - User's Clerk ID
   * @param {string} month - Month to remind about
   * @param {number} year - Year to remind about
   * @returns {Promise<{success: boolean}>}
   */
  async sendPaymentReminder(clerkUserId, month, year) {
    try {
      // This would integrate with notification service
      // For now, we'll just log the reminder
      console.log(`Payment reminder sent to user ${clerkUserId} for ${month} ${year}`);
      
      return {
        success: true
      };
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find maintenance records by month and society
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {string} societyId - Society ID
   * @returns {Promise<{success: boolean, data: Array}>}
   */
  async findByMonthAndSociety(year, month, societyId) {
    try {
      // Convert month number (1-12) to month name, or use month name if already provided
      let monthQuery;
      const monthNum = parseInt(month);
      
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        // Month is a number (1-12), convert to month name
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        monthQuery = monthNames[monthNum - 1];
      } else {
        // Month is already a name like "January" or "March"
        monthQuery = month;
      }

      // Ensure societyId is ObjectId
      const societyObjectId = ObjectId.isValid(societyId) ? new ObjectId(societyId) : societyId;

      const records = await this.collection.find({
        year: parseInt(year),
        month: monthQuery,
        societyId: societyObjectId
      }).toArray();
      
      return {
        success: true,
        data: records
      };
    } catch (error) {
      console.error('Error finding maintenance records by month and society:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update maintenance record
   * @param {string} recordId - Record ID
   * @param {object} updateData - Data to update
   * @returns {Promise<{success: boolean, data: Object|null}>}
   */
  async updateRecord(recordId, updateData) {
    try {
      const result = await this.collection.updateOne(
        { _id: new ObjectId(recordId) },
        { $set: updateData }
      );

      if (result.modifiedCount === 0) {
        return {
          success: false,
          error: 'No record found or no changes made'
        };
      }

      const updatedRecord = await this.collection.findOne({ _id: new ObjectId(recordId) });
      
      return {
        success: true,
        data: updatedRecord
      };
    } catch (error) {
      console.error('Error updating maintenance record:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = MaintenanceService;