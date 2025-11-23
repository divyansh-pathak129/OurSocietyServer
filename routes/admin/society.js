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

// Get society settings (maintenance etc.)
router.get('/settings', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);
    const result = await societyService.findById(req.adminUser.societyId);
    
    if (!result.success || !result.data) {
      return res.status(404).json({ success: false, message: 'Society not found' });
    }

    return res.json({ 
      success: true, 
      settings: result.data.settings || {},
      data: result.data 
    });
  } catch (error) {
    console.error('Error fetching society settings:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch settings' });
  }
}));

// Update society settings (maintenance etc.)
router.put('/settings', verifyClerkToken, verifyAdminAuth, asyncHandler(async (req, res) => {
  try {
    const db = dbConnection.getDb();
    const societyService = new SocietyService(db);
    console.log('PUT /settings - Request body:', JSON.stringify(req.body, null, 2));
    console.log('PUT /settings - Maintenance rates:', JSON.stringify(req.body.maintenance?.rates, null, 2));
    
    const update = await societyService.updateSettings(req.adminUser.societyId, req.body || {});
    
    console.log('PUT /settings - Update result:', {
      success: update.success,
      hasData: !!update.data,
      hasSettings: !!update.data?.settings,
      hasMaintenance: !!update.data?.settings?.maintenance,
      hasRates: !!update.data?.settings?.maintenance?.rates,
      ratesCount: update.data?.settings?.maintenance?.rates?.length || 0
    });
    
    return res.json({ 
      success: true, 
      data: update.data || null,
      settings: update.data?.settings || null
    });
  } catch (error) {
    console.error('Error updating society settings:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update settings',
      error: error.toString()
    });
  }
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







