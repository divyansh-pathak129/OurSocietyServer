const Joi = require('joi');
const { ValidationError } = require('./errors');

/**
 * Request validation middleware using Joi
 * Validates request body, query parameters, and URL parameters
 */

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all validation errors
      allowUnknown: false, // Don't allow unknown fields
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      throw new ValidationError('Validation failed', errorDetails);
    }

    // Replace the original data with validated/sanitized data
    req[property] = value;
    next();
  };
};

/**
 * Common validation schemas
 */
const schemas = {
  // MongoDB ObjectId validation
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid ObjectId format'),

  // User registration validation
  userRegistration: Joi.object({
    societyId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
      .messages({
        'string.pattern.base': 'Invalid society ID format',
        'any.required': 'Society ID is required'
      }),
    societyName: Joi.string().min(2).max(100).required()
      .messages({
        'string.min': 'Society name must be at least 2 characters',
        'string.max': 'Society name cannot exceed 100 characters',
        'any.required': 'Society name is required'
      }),
    wing: Joi.string().min(1).max(10).required()
      .messages({
        'string.min': 'Wing is required',
        'string.max': 'Wing cannot exceed 10 characters',
        'any.required': 'Wing is required'
      }),
    flatNumber: Joi.string().min(1).max(10).optional()
      .messages({
        'string.min': 'Flat number cannot be empty',
        'string.max': 'Flat number cannot exceed 10 characters'
      }),
    residentType: Joi.string().valid('Owner', 'Tenant', 'Family Member', 'Caretaker').required()
      .messages({
        'any.only': 'Resident type must be one of: Owner, Tenant, Family Member, Caretaker',
        'any.required': 'Resident type is required'
      }),
    contactNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,15}$/).optional()
      .messages({
        'string.pattern.base': 'Invalid contact number format'
      })
  }),

  // User profile update validation
  userProfileUpdate: Joi.object({
    wing: Joi.string().min(1).max(10).optional(),
    flatNumber: Joi.string().min(1).max(10).optional(),
    residentType: Joi.string().valid('Owner', 'Tenant', 'Family Member', 'Caretaker').optional(),
    contactNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,15}$/).optional()
  }).min(1), // At least one field must be provided

  // Forum post validation
  forumPost: Joi.object({
    title: Joi.string().min(5).max(200).required()
      .messages({
        'string.min': 'Title must be at least 5 characters',
        'string.max': 'Title cannot exceed 200 characters',
        'any.required': 'Title is required'
      }),
    content: Joi.string().min(10).max(5000).required()
      .messages({
        'string.min': 'Content must be at least 10 characters',
        'string.max': 'Content cannot exceed 5000 characters',
        'any.required': 'Content is required'
      }),
    category: Joi.string().valid('general', 'maintenance', 'events', 'complaints', 'announcements').default('general')
      .messages({
        'any.only': 'Category must be one of: general, maintenance, events, complaints, announcements'
      }),
    isAnnouncement: Joi.boolean().default(false),
    isPinned: Joi.boolean().default(false)
  }),

  // Forum post update validation
  forumPostUpdate: Joi.object({
    title: Joi.string().min(5).max(200).optional(),
    content: Joi.string().min(10).max(5000).optional(),
    category: Joi.string().valid('general', 'maintenance', 'events', 'complaints', 'announcements').optional(),
    isAnnouncement: Joi.boolean().optional(),
    isPinned: Joi.boolean().optional()
  }).min(1),

  // Forum reply validation
  forumReply: Joi.object({
    content: Joi.string().min(5).max(2000).required()
      .messages({
        'string.min': 'Reply must be at least 5 characters',
        'string.max': 'Reply cannot exceed 2000 characters',
        'any.required': 'Reply content is required'
      })
  }),

  // Contact validation
  contact: Joi.object({
    name: Joi.string().min(2).max(100).required()
      .messages({
        'string.min': 'Name must be at least 2 characters',
        'string.max': 'Name cannot exceed 100 characters',
        'any.required': 'Name is required'
      }),
    role: Joi.string().min(2).max(50).required()
      .messages({
        'string.min': 'Role must be at least 2 characters',
        'string.max': 'Role cannot exceed 50 characters',
        'any.required': 'Role is required'
      }),
    phoneNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,15}$/).required()
      .messages({
        'string.pattern.base': 'Invalid phone number format',
        'any.required': 'Phone number is required'
      }),
    email: Joi.string().email().optional()
      .messages({
        'string.email': 'Invalid email format'
      }),
    isEmergency: Joi.boolean().default(false),
    isActive: Joi.boolean().default(true)
  }),

  // Contact update validation
  contactUpdate: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    role: Joi.string().min(2).max(50).optional(),
    phoneNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]{10,15}$/).optional(),
    email: Joi.string().email().optional(),
    isEmergency: Joi.boolean().optional(),
    isActive: Joi.boolean().optional()
  }).min(1),

  // Maintenance payment validation
  maintenancePayment: Joi.object({
    amount: Joi.number().positive().precision(2).required()
      .messages({
        'number.positive': 'Amount must be positive',
        'any.required': 'Amount is required'
      }),
    paymentMethod: Joi.string().valid('cash', 'cheque', 'online', 'upi', 'card').required()
      .messages({
        'any.only': 'Payment method must be one of: cash, cheque, online, upi, card',
        'any.required': 'Payment method is required'
      }),
    transactionId: Joi.string().min(1).max(100).optional()
      .messages({
        'string.min': 'Transaction ID cannot be empty',
        'string.max': 'Transaction ID cannot exceed 100 characters'
      }),
    notes: Joi.string().max(500).optional()
      .messages({
        'string.max': 'Notes cannot exceed 500 characters'
      })
  }),

  // Query parameter validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'name', '-name').default('-createdAt')
  }),

  // Search query validation
  search: Joi.object({
    q: Joi.string().min(1).max(100).optional(),
    category: Joi.string().optional(),
    status: Joi.string().optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).optional()
  }),

  // Event validation
  eventData: Joi.object({
    title: Joi.string().min(3).max(200).required()
      .messages({
        'string.min': 'Event title must be at least 3 characters',
        'string.max': 'Event title cannot exceed 200 characters',
        'any.required': 'Event title is required'
      }),
    description: Joi.string().min(10).max(2000).required()
      .messages({
        'string.min': 'Event description must be at least 10 characters',
        'string.max': 'Event description cannot exceed 2000 characters',
        'any.required': 'Event description is required'
      }),
    eventDate: Joi.date().iso().min('now').required()
      .messages({
        'date.min': 'Event date must be in the future',
        'any.required': 'Event date is required'
      }),
    eventTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional()
      .messages({
        'string.pattern.base': 'Event time must be in HH:MM format'
      }),
    location: Joi.string().min(2).max(200).optional()
      .messages({
        'string.min': 'Location must be at least 2 characters',
        'string.max': 'Location cannot exceed 200 characters'
      }),
    eventType: Joi.string().valid('meeting', 'celebration', 'maintenance', 'social', 'other').required()
      .messages({
        'any.only': 'Event type must be one of: meeting, celebration, maintenance, social, other',
        'any.required': 'Event type is required'
      }),
    isRecurring: Joi.boolean().default(false),
    recurringPattern: Joi.string().valid('weekly', 'monthly', 'yearly').optional()
      .messages({
        'any.only': 'Recurring pattern must be one of: weekly, monthly, yearly'
      })
  })
};

/**
 * Specific validation middleware functions
 */
const validateUserRegistration = validate(schemas.userRegistration, 'body');
const validateUserProfileUpdate = validate(schemas.userProfileUpdate, 'body');
const validateForumPost = validate(schemas.forumPost, 'body');
const validateForumPostUpdate = validate(schemas.forumPostUpdate, 'body');
const validateForumReply = validate(schemas.forumReply, 'body');
const validateContact = validate(schemas.contact, 'body');
const validateContactUpdate = validate(schemas.contactUpdate, 'body');
const validateMaintenancePayment = validate(schemas.maintenancePayment, 'body');
const validateObjectId = validate(Joi.object({ id: schemas.objectId }), 'params');
const validatePagination = validate(schemas.pagination, 'query');
const validateSearch = validate(schemas.search, 'query');
const validateEventData = validate(schemas.eventData, 'body');

module.exports = {
  validate,
  schemas,
  validateUserRegistration,
  validateUserProfileUpdate,
  validateForumPost,
  validateForumPostUpdate,
  validateForumReply,
  validateContact,
  validateContactUpdate,
  validateMaintenancePayment,
  validateObjectId,
  validatePagination,
  validateSearch,
  validateEventData
};