const { ObjectId } = require("mongodb");

/**
 * Database Schema Definitions and Validation Functions
 * Based on the design document specifications
 */

// Validation helper functions
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhoneNumber = (phone) => {
  // Allow international format with +, spaces, hyphens, parentheses, and digits
  // Examples: +91 9876543210, (555) 123-4567, +1-555-123-4567, 9876543210
  const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,20}$/;
  return phoneRegex.test(phone);
};

const validateObjectId = (id) => {
  return ObjectId.isValid(id);
};

const validateDate = (date) => {
  return date instanceof Date && !isNaN(date);
};

// User Schema and Validation
const UserSchema = {
  clerkUserId: { type: "string", required: true, unique: true },
  societyId: { type: "ObjectId", required: true },
  societyName: { type: "string", required: true },
  wing: { type: "string", required: true },
  flatNumber: { type: "string", required: false },
  residentType: {
    type: "string",
    required: true,
    enum: ["Owner", "Tenant", "Family Member", "Caretaker"],
  },
  contactNumber: { type: "string", required: false },
  email: { type: "string", required: true },
  name: { type: "string", required: true },
  registrationDate: { type: "Date", required: true },
  isActive: { type: "boolean", required: true, default: true },
  // Admin-specific fields
  adminRole: {
    type: "string",
    required: false,
    enum: ["super_admin", "admin", "wing_chairman", "moderator"],
    default: null,
  },
  permissions: {
    type: "array",
    required: false,
    items: {
      resource: { type: "string", required: true },
      actions: { type: "array", items: "string", required: true },
    },
    default: [],
  },
  assignedWings: {
    type: "array",
    items: "string",
    required: false,
    default: [],
  },
  lastAdminLogin: { type: "Date", required: false },
  adminSettings: {
    type: "object",
    required: false,
    properties: {
      emailNotifications: { type: "boolean", default: true },
      pushNotifications: { type: "boolean", default: true },
      dashboardLayout: { type: "string", default: "default" },
    },
  },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateUser = (userData) => {
  const errors = [];

  // Required field validation
  if (!userData.clerkUserId || typeof userData.clerkUserId !== "string") {
    errors.push("clerkUserId is required and must be a string");
  }

  if (!userData.societyId || !validateObjectId(userData.societyId)) {
    errors.push("societyId is required and must be a valid ObjectId");
  }

  if (!userData.societyName || typeof userData.societyName !== "string") {
    errors.push("societyName is required and must be a string");
  }

  if (!userData.wing || typeof userData.wing !== "string") {
    errors.push("wing is required and must be a string");
  }

  if (
    !userData.residentType ||
    !["Owner", "Tenant", "Family Member", "Caretaker"].includes(
      userData.residentType
    )
  ) {
    errors.push(
      "residentType is required and must be one of: Owner, Tenant, Family Member, Caretaker"
    );
  }

  if (!userData.email || !validateEmail(userData.email)) {
    errors.push("email is required and must be a valid email address");
  }

  if (!userData.name || typeof userData.name !== "string") {
    errors.push("name is required and must be a string");
  }

  // Optional field validation
  if (userData.contactNumber && !validatePhoneNumber(userData.contactNumber)) {
    errors.push("contactNumber must be a valid phone number");
  }

  if (userData.flatNumber && typeof userData.flatNumber !== "string") {
    errors.push("flatNumber must be a string");
  }

  // Admin role validation
  if (
    userData.adminRole &&
    !["super_admin", "admin", "wing_chairman", "moderator"].includes(
      userData.adminRole
    )
  ) {
    errors.push(
      "adminRole must be one of: super_admin, admin, wing_chairman, moderator"
    );
  }

  // Permissions validation
  if (userData.permissions && Array.isArray(userData.permissions)) {
    userData.permissions.forEach((permission, index) => {
      if (!permission.resource || typeof permission.resource !== "string") {
        errors.push(
          `permissions[${index}].resource is required and must be a string`
        );
      }
      if (!Array.isArray(permission.actions)) {
        errors.push(
          `permissions[${index}].actions is required and must be an array`
        );
      }
    });
  }

  // Assigned wings validation
  if (userData.assignedWings && !Array.isArray(userData.assignedWings)) {
    errors.push("assignedWings must be an array");
  }

  // Date validation
  if (userData.registrationDate && !validateDate(userData.registrationDate)) {
    errors.push("registrationDate must be a valid Date");
  }

  if (userData.lastAdminLogin && !validateDate(userData.lastAdminLogin)) {
    errors.push("lastAdminLogin must be a valid Date");
  }

  if (userData.createdAt && !validateDate(userData.createdAt)) {
    errors.push("createdAt must be a valid Date");
  }

  if (userData.updatedAt && !validateDate(userData.updatedAt)) {
    errors.push("updatedAt must be a valid Date");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Society Schema and Validation
const SocietySchema = {
  name: { type: "string", required: true },
  address: { type: "string", required: true },
  totalWings: { type: "number", required: true },
  totalFlats: { type: "number", required: true },
  adminUsers: { type: "array", required: true, items: "string" },
  settings: {
    maintenanceAmount: { type: "number", required: true },
    maintenanceDueDate: { type: "number", required: true },
    allowTenantForumAccess: { type: "boolean", required: true, default: true },
  },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateSociety = (societyData) => {
  const errors = [];

  if (!societyData.name || typeof societyData.name !== "string") {
    errors.push("name is required and must be a string");
  }

  if (!societyData.address || typeof societyData.address !== "string") {
    errors.push("address is required and must be a string");
  }

  if (
    !societyData.totalWings ||
    typeof societyData.totalWings !== "number" ||
    societyData.totalWings <= 0
  ) {
    errors.push("totalWings is required and must be a positive number");
  }

  if (
    !societyData.totalFlats ||
    typeof societyData.totalFlats !== "number" ||
    societyData.totalFlats <= 0
  ) {
    errors.push("totalFlats is required and must be a positive number");
  }

  if (!Array.isArray(societyData.adminUsers)) {
    errors.push("adminUsers is required and must be an array");
  }

  if (societyData.settings) {
    if (
      typeof societyData.settings.maintenanceAmount !== "number" ||
      societyData.settings.maintenanceAmount < 0
    ) {
      errors.push("settings.maintenanceAmount must be a non-negative number");
    }

    if (
      typeof societyData.settings.maintenanceDueDate !== "number" ||
      societyData.settings.maintenanceDueDate < 1 ||
      societyData.settings.maintenanceDueDate > 31
    ) {
      errors.push(
        "settings.maintenanceDueDate must be a number between 1 and 31"
      );
    }

    if (typeof societyData.settings.allowTenantForumAccess !== "boolean") {
      errors.push("settings.allowTenantForumAccess must be a boolean");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Maintenance Schema and Validation
const MaintenanceSchema = {
  societyId: { type: "ObjectId", required: true },
  clerkUserId: { type: "string", required: true },
  wing: { type: "string", required: true },
  flatNumber: { type: "string", required: true },
  month: { type: "string", required: true }, // 'YYYY-MM' format
  amount: { type: "number", required: true },
  dueDate: { type: "Date", required: true },
  paidDate: { type: "Date", required: false },
  status: {
    type: "string",
    required: true,
    enum: ["pending", "paid", "overdue"],
  },
  paymentMethod: { type: "string", required: false },
  transactionId: { type: "string", required: false },
  notes: { type: "string", required: false },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateMaintenance = (maintenanceData) => {
  const errors = [];

  if (
    !maintenanceData.societyId ||
    !validateObjectId(maintenanceData.societyId)
  ) {
    errors.push("societyId is required and must be a valid ObjectId");
  }

  if (
    !maintenanceData.clerkUserId ||
    typeof maintenanceData.clerkUserId !== "string"
  ) {
    errors.push("clerkUserId is required and must be a string");
  }

  if (!maintenanceData.wing || typeof maintenanceData.wing !== "string") {
    errors.push("wing is required and must be a string");
  }

  if (
    !maintenanceData.flatNumber ||
    typeof maintenanceData.flatNumber !== "string"
  ) {
    errors.push("flatNumber is required and must be a string");
  }

  // Validate month format (YYYY-MM)
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!maintenanceData.month || !monthRegex.test(maintenanceData.month)) {
    errors.push("month is required and must be in YYYY-MM format");
  }

  if (
    typeof maintenanceData.amount !== "number" ||
    maintenanceData.amount < 0
  ) {
    errors.push("amount is required and must be a non-negative number");
  }

  if (!maintenanceData.dueDate || !validateDate(maintenanceData.dueDate)) {
    errors.push("dueDate is required and must be a valid Date");
  }

  if (!["pending", "paid", "overdue"].includes(maintenanceData.status)) {
    errors.push(
      "status is required and must be one of: pending, paid, overdue"
    );
  }

  // Optional field validation
  if (maintenanceData.paidDate && !validateDate(maintenanceData.paidDate)) {
    errors.push("paidDate must be a valid Date");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Forum Schema and Validation
const ForumSchema = {
  societyId: { type: "ObjectId", required: true },
  authorId: { type: "string", required: true },
  authorName: { type: "string", required: true },
  authorWing: { type: "string", required: true },
  title: { type: "string", required: true },
  content: { type: "string", required: true },
  category: {
    type: "string",
    required: true,
    enum: ["general", "maintenance", "events", "complaints"],
  },
  isAnnouncement: { type: "boolean", required: true, default: false },
  isPinned: { type: "boolean", required: true, default: false },
  replies: {
    type: "array",
    items: {
      authorId: { type: "string", required: true },
      authorName: { type: "string", required: true },
      content: { type: "string", required: true },
      createdAt: { type: "Date", required: true },
    },
  },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateForum = (forumData) => {
  const errors = [];

  if (!forumData.societyId || !validateObjectId(forumData.societyId)) {
    errors.push("societyId is required and must be a valid ObjectId");
  }

  if (!forumData.authorId || typeof forumData.authorId !== "string") {
    errors.push("authorId is required and must be a string");
  }

  if (!forumData.authorName || typeof forumData.authorName !== "string") {
    errors.push("authorName is required and must be a string");
  }

  if (!forumData.authorWing || typeof forumData.authorWing !== "string") {
    errors.push("authorWing is required and must be a string");
  }

  if (!forumData.title || typeof forumData.title !== "string") {
    errors.push("title is required and must be a string");
  }

  if (!forumData.content || typeof forumData.content !== "string") {
    errors.push("content is required and must be a string");
  }

  if (
    !["general", "maintenance", "events", "complaints"].includes(
      forumData.category
    )
  ) {
    errors.push(
      "category is required and must be one of: general, maintenance, events, complaints"
    );
  }

  // Validate replies array if present
  if (forumData.replies && Array.isArray(forumData.replies)) {
    forumData.replies.forEach((reply, index) => {
      if (!reply.authorId || typeof reply.authorId !== "string") {
        errors.push(
          `replies[${index}].authorId is required and must be a string`
        );
      }
      if (!reply.authorName || typeof reply.authorName !== "string") {
        errors.push(
          `replies[${index}].authorName is required and must be a string`
        );
      }
      if (!reply.content || typeof reply.content !== "string") {
        errors.push(
          `replies[${index}].content is required and must be a string`
        );
      }
      if (!reply.createdAt || !validateDate(reply.createdAt)) {
        errors.push(
          `replies[${index}].createdAt is required and must be a valid Date`
        );
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Contact Schema and Validation
const ContactSchema = {
  societyId: { type: "ObjectId", required: true },
  name: { type: "string", required: true },
  role: {
    type: "string",
    required: true,
    enum: ["Security", "Maintenance", "Management", "Emergency"],
  },
  phoneNumber: { type: "string", required: true },
  email: { type: "string", required: false },
  isEmergency: { type: "boolean", required: true, default: false },
  isActive: { type: "boolean", required: true, default: true },
  addedBy: { type: "string", required: true },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateContact = (contactData) => {
  const errors = [];

  if (!contactData.societyId || !validateObjectId(contactData.societyId)) {
    errors.push("societyId is required and must be a valid ObjectId");
  }

  if (!contactData.name || typeof contactData.name !== "string") {
    errors.push("name is required and must be a string");
  }

  if (
    !["Security", "Maintenance", "Management", "Emergency"].includes(
      contactData.role
    )
  ) {
    errors.push(
      "role is required and must be one of: Security, Maintenance, Management, Emergency"
    );
  }

  if (
    !contactData.phoneNumber ||
    !validatePhoneNumber(contactData.phoneNumber)
  ) {
    errors.push("phoneNumber is required and must be a valid phone number");
  }

  if (!contactData.addedBy || typeof contactData.addedBy !== "string") {
    errors.push("addedBy is required and must be a string");
  }

  // Optional field validation
  if (contactData.email && !validateEmail(contactData.email)) {
    errors.push("email must be a valid email address");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Join Request Schema and Validation
const JoinRequestSchema = {
  clerkUserId: { type: "string", required: true },
  societyId: { type: "ObjectId", required: true },
  requestedData: {
    wing: { type: "string", required: true },
    flatNumber: { type: "string", required: false },
    residentType: {
      type: "string",
      required: true,
      enum: ["Owner", "Tenant", "Family Member", "Caretaker"],
    },
    contactNumber: { type: "string", required: false },
    emergencyContact: { type: "string", required: false },
  },
  documents: {
    type: "array",
    items: {
      type: {
        type: "string",
        required: true,
        enum: ["ownership_proof", "id_proof", "address_proof"],
      },
      url: { type: "string", required: true },
      uploadedAt: { type: "Date", required: true },
    },
    default: [],
  },
  status: {
    type: "string",
    required: true,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  reviewedBy: { type: "string", required: false },
  reviewedAt: { type: "Date", required: false },
  rejectionReason: { type: "string", required: false },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateJoinRequest = (requestData) => {
  const errors = [];

  if (!requestData.clerkUserId || typeof requestData.clerkUserId !== "string") {
    errors.push("clerkUserId is required and must be a string");
  }

  if (!requestData.societyId || !validateObjectId(requestData.societyId)) {
    errors.push("societyId is required and must be a valid ObjectId");
  }

  if (!requestData.requestedData) {
    errors.push("requestedData is required");
  } else {
    const { wing, residentType, contactNumber, emergencyContact } =
      requestData.requestedData;

    if (!wing || typeof wing !== "string") {
      errors.push("requestedData.wing is required and must be a string");
    }

    if (
      !residentType ||
      !["Owner", "Tenant", "Family Member", "Caretaker"].includes(residentType)
    ) {
      errors.push(
        "requestedData.residentType is required and must be one of: Owner, Tenant, Family Member, Caretaker"
      );
    }

    if (contactNumber && !validatePhoneNumber(contactNumber)) {
      errors.push("requestedData.contactNumber must be a valid phone number");
    }

    if (emergencyContact && !validatePhoneNumber(emergencyContact)) {
      errors.push(
        "requestedData.emergencyContact must be a valid phone number"
      );
    }
  }

  if (!["pending", "approved", "rejected"].includes(requestData.status)) {
    errors.push("status must be one of: pending, approved, rejected");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Announcement Schema and Validation
const AnnouncementSchema = {
  societyId: { type: "ObjectId", required: true },
  authorId: { type: "string", required: true },
  title: { type: "string", required: true },
  content: { type: "string", required: true },
  type: {
    type: "string",
    required: true,
    enum: ["announcement", "urgent", "event", "maintenance"],
  },
  targetAudience: {
    wings: { type: "array", items: "string", default: [] },
    residentTypes: { type: "array", items: "string", default: [] },
    specificUsers: { type: "array", items: "string", default: [] },
  },
  publishedAt: { type: "Date", required: true },
  expiresAt: { type: "Date", required: false },
  isPinned: { type: "boolean", required: true, default: false },
  attachments: {
    type: "array",
    items: {
      name: { type: "string", required: true },
      url: { type: "string", required: true },
      type: { type: "string", required: true },
    },
    default: [],
  },
  deliveryStats: {
    totalTargeted: { type: "number", default: 0 },
    delivered: { type: "number", default: 0 },
    read: { type: "number", default: 0 },
    failed: { type: "number", default: 0 },
  },
  createdAt: { type: "Date", required: true },
  updatedAt: { type: "Date", required: true },
};

const validateAnnouncement = (announcementData) => {
  const errors = [];

  if (
    !announcementData.societyId ||
    !validateObjectId(announcementData.societyId)
  ) {
    errors.push("societyId is required and must be a valid ObjectId");
  }

  if (
    !announcementData.authorId ||
    typeof announcementData.authorId !== "string"
  ) {
    errors.push("authorId is required and must be a string");
  }

  if (!announcementData.title || typeof announcementData.title !== "string") {
    errors.push("title is required and must be a string");
  }

  if (
    !announcementData.content ||
    typeof announcementData.content !== "string"
  ) {
    errors.push("content is required and must be a string");
  }

  if (
    !["announcement", "urgent", "event", "maintenance"].includes(
      announcementData.type
    )
  ) {
    errors.push(
      "type is required and must be one of: announcement, urgent, event, maintenance"
    );
  }

  if (
    !announcementData.publishedAt ||
    !validateDate(announcementData.publishedAt)
  ) {
    errors.push("publishedAt is required and must be a valid Date");
  }

  if (announcementData.expiresAt && !validateDate(announcementData.expiresAt)) {
    errors.push("expiresAt must be a valid Date");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Admin Audit Log Schema
const AdminAuditLogSchema = {
  adminId: { type: "string", required: true },
  adminName: { type: "string", required: true },
  adminRole: { type: "string", required: true },
  societyId: { type: "ObjectId", required: true },
  action: { type: "string", required: true },
  resource: { type: "string", required: true },
  details: { type: "object", required: false },
  timestamp: { type: "Date", required: true },
  ipAddress: { type: "string", required: false },
  userAgent: { type: "string", required: false },
};

// Database indexes configuration
const DatabaseIndexes = {
  users: [
    { key: { clerkUserId: 1 }, options: { unique: true } },
    { key: { societyId: 1 }, options: {} },
    { key: { societyId: 1, wing: 1 }, options: {} },
  ],
  societies: [{ key: { name: 1 }, options: { unique: true } }],
  maintenance: [
    { key: { societyId: 1, month: 1 }, options: {} },
    { key: { clerkUserId: 1, month: 1 }, options: {} },
    { key: { societyId: 1, status: 1 }, options: {} },
    { key: { dueDate: 1 }, options: {} },
  ],
  forums: [
    { key: { societyId: 1, createdAt: -1 }, options: {} },
    { key: { societyId: 1, category: 1 }, options: {} },
    { key: { societyId: 1, isPinned: -1, createdAt: -1 }, options: {} },
  ],
  contacts: [
    { key: { societyId: 1, isActive: 1 }, options: {} },
    { key: { societyId: 1, role: 1 }, options: {} },
    { key: { societyId: 1, isEmergency: -1 }, options: {} },
  ],
};

module.exports = {
  // Schemas
  UserSchema,
  SocietySchema,
  MaintenanceSchema,
  ForumSchema,
  ContactSchema,

  // Validation functions
  validateUser,
  validateSociety,
  validateMaintenance,
  validateForum,
  validateContact,

  // Helper functions
  validateEmail,
  validatePhoneNumber,
  validateObjectId,
  validateDate,

  // Database indexes
  DatabaseIndexes,
};
