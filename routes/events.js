const express = require('express');
const router = express.Router();
const { verifyClerkToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ServiceFactory } = require('../models/services');
const { UserService } = require('../models/services');
const dbConnection = require('../config/database');

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

// Middleware to fetch user from database and populate req.user
const fetchUserFromDb = asyncHandler(async (req, res, next) => {
  const db = dbConnection.getDb();
  const userService = new UserService(db);
  
  const userResult = await userService.findByClerkUserId(req.userId);
  if (!userResult.data) {
    return res.status(404).json({
      success: false,
      error: 'User Not Found',
      message: 'User profile not found. Please complete society registration first.',
      requiresRegistration: true
    });
  }

  const user = userResult.data;
  
  // Populate req.user with database user data
  req.user = {
    id: user._id,
    clerkUserId: user.clerkUserId,
    societyId: user.societyId,
    name: user.name,
    email: user.email,
    wing: user.wing,
    flatNumber: user.flatNumber,
    residentType: user.residentType
  };

  if (!req.user.societyId) {
    return res.status(400).json({
      success: false,
      message: 'User is not yet a member of any society. Please wait for your join request to be approved.',
      code: 'NO_SOCIETY_MEMBERSHIP'
    });
  }

  next();
});

// Get events for a society (user endpoint)
router.get('/', verifyClerkToken, fetchUserFromDb, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.user;
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

// Get upcoming events for dashboard
router.get('/upcoming', verifyClerkToken, fetchUserFromDb, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.user;
  const { limit } = req.query;

  const result = await eventService.getUpcomingEvents(societyId, limit ? parseInt(limit) : 5);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Upcoming events retrieved successfully'
  });
}));

// Get event by ID
router.get('/:id', verifyClerkToken, fetchUserFromDb, initializeServices, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await eventService.getById(id);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Event retrieved successfully'
  });
}));

// Get events by date range
router.get('/range/:startDate/:endDate', verifyClerkToken, fetchUserFromDb, initializeServices, asyncHandler(async (req, res) => {
  const { societyId } = req.user;
  const { startDate, endDate } = req.params;

  const result = await eventService.getByDateRange(societyId, startDate, endDate);
  
  res.json({
    success: true,
    data: result.data,
    message: 'Events retrieved successfully'
  });
}));

module.exports = router;
