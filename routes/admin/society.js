const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const dbConnection = require('../../config/database');
const SocietyService = require('../../models/services/SocietyService');
const { asyncHandler } = require('../../middleware/errorHandler');
const { verifyClerkToken } = require('../../middleware/auth');
const { verifyAdminAuth } = require('../../middleware/adminAuth');

// Get society details (for current admin's society)
router.get('/', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  const result = await societyService.findById(req.adminUser.societyId);
  return res.json({ success: true, data: result.data });
}));

// Update society core details
router.put('/', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  
  console.log('PUT /admin/society - Request body:', req.body);
  console.log('Society ID:', req.adminUser.societyId);
  
  const update = await societyService.updateDetails(req.adminUser.societyId, req.body || {});
  
  console.log('Update result:', {
    success: update.success,
    hasData: !!update.data,
    name: update.data?.name,
    address: update.data?.address
  });
  
  return res.json({ 
    success: true, 
    data: update.data || null,
    message: update.modified ? 'Society details updated successfully' : 'No changes made'
  });
}));

// Update society settings (maintenance etc.)
router.put('/settings', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  const update = await societyService.updateSettings(req.adminUser.societyId, req.body || {});
  return res.json({ success: true, data: update.data || null });
}));

// Wings CRUD
router.get('/wings', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  const wings = await societyService.getWings(req.adminUser.societyId);
  return res.json({ success: true, data: wings.data });
}));

router.post('/wings', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  const created = await societyService.addWing(req.adminUser.societyId, req.body || {});
  return res.json({ success: true, data: created.data });
}));

router.put('/wings/:wingId', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const { wingId } = req.params;
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  const updated = await societyService.updateWing(req.adminUser.societyId, wingId, req.body || {});
  return res.json({ success: true });
}));

router.delete('/wings/:wingId', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  const { wingId } = req.params;
  const db = dbConnection.getDb();
  const societyService = new SocietyService(db);
  const deleted = await societyService.deleteWing(req.adminUser.societyId, wingId);
  return res.json({ success: true });
}));

module.exports = router;







