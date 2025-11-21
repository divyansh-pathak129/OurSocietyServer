const express = require('express');
const router = express.Router();
const { verifyAdminAuth } = require('../../middleware/adminAuth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ServiceFactory } = require('../../models/services');
const { validateEventData } = require('../../middleware/validation');
const dbConnection = require('../../config/database');

// Initialize services
let eventService;

const initializeServices = (req, res, next) => {
  const db = dbConnection.getDb();
  if (!eventService) {
    const serviceFactory = new ServiceFactory(db);
    eventService = serviceFactory.getEventService();
  }
  req.db = db; // Set req.db for consistency
  next();
};

// Get all events (admin)
router.get('/', verifyAdminAuth, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.adminUser;
  const { upcoming, eventType, limit } = req.query;

  const options = {
    upcoming: upcoming === 'true',
    eventType: eventType,
    limit: limit ? parseInt(limit) : undefined
  };

  const result = await eventService.getBySociety(societyId, options);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Events retrieved successfully'
  });
}));

// Get upcoming events for admin dashboard
router.get('/upcoming', verifyAdminAuth, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.adminUser;
  const { limit } = req.query;

  const result = await eventService.getUpcomingEvents(societyId, limit ? parseInt(limit) : 5);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Upcoming events retrieved successfully'
  });
}));

// Create new event
router.post('/', verifyAdminAuth, initializeServices, validateEventData, asyncHandler(async (req, res) => {
  const { societyId } = req.adminUser;
  const { clerkUserId } = req.adminUser;
  const { adminRole } = req.adminUser;

  const eventData = {
    ...req.body,
    societyId,
    createdBy: clerkUserId,
    createdByRole: adminRole
  };

  const result = await eventService.create(eventData);
  
  res.status(201).json({
    success: true,
    data: result.data,
    message: 'Event created successfully'
  });
}));

// Get event by ID
router.get('/:id', verifyAdminAuth, initializeServices, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await eventService.getById(id);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Event retrieved successfully'
  });
}));

// Update event
router.put('/:id', verifyAdminAuth, initializeServices, validateEventData, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await eventService.update(id, req.body);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Event updated successfully'
  });
}));

// Delete event
router.delete('/:id', verifyAdminAuth, initializeServices, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await eventService.delete(id);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Event deleted successfully'
  });
}));

// Get event statistics
router.get('/stats/overview', verifyAdminAuth, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.adminUser;

  const result = await eventService.getEventStats(societyId);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Event statistics retrieved successfully'
  });
}));

// Get events by date range
router.get('/range/:startDate/:endDate', verifyAdminAuth, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.adminUser;
  const { startDate, endDate } = req.params;

  const result = await eventService.getByDateRange(societyId, startDate, endDate);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Events retrieved successfully'
  });
}));

module.exports = router;
