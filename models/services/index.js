const UserService = require("./UserService");
const SocietyService = require("./SocietyService");
const MaintenanceService = require("./MaintenanceService");
const ForumService = require("./ForumService");
const ContactService = require("./ContactService");
const JoinRequestService = require("./JoinRequestService");
const EventService = require("./EventService");

/**
 * Service Factory
 * Creates and manages all database service instances
 */

class ServiceFactory {
  constructor(db) {
    this.db = db;
    this._services = {};
  }

  /**
   * Get User Service instance
   */
  getUserService() {
    if (!this._services.user) {
      this._services.user = new UserService(this.db);
    }
    return this._services.user;
  }

  /**
   * Get Society Service instance
   */
  getSocietyService() {
    if (!this._services.society) {
      this._services.society = new SocietyService(this.db);
    }
    return this._services.society;
  }

  /**
   * Get Maintenance Service instance
   */
  getMaintenanceService() {
    if (!this._services.maintenance) {
      this._services.maintenance = new MaintenanceService(this.db);
    }
    return this._services.maintenance;
  }

  /**
   * Get Forum Service instance
   */
  getForumService() {
    if (!this._services.forum) {
      this._services.forum = new ForumService(this.db);
    }
    return this._services.forum;
  }

  /**
   * Get Contact Service instance
   */
  getContactService() {
    if (!this._services.contact) {
      this._services.contact = new ContactService(this.db);
    }
    return this._services.contact;
  }

  /**
   * Get Join Request Service instance
   */
  getJoinRequestService() {
    if (!this._services.joinRequest) {
      this._services.joinRequest = new JoinRequestService(this.db);
    }
    return this._services.joinRequest;
  }

  /**
   * Get Event Service instance
   */
  getEventService() {
    if (!this._services.event) {
      this._services.event = new EventService(this.db);
    }
    return this._services.event;
  }

  /**
   * Get all services
   */
  getAllServices() {
    return {
      user: this.getUserService(),
      society: this.getSocietyService(),
      maintenance: this.getMaintenanceService(),
      forum: this.getForumService(),
      contact: this.getContactService(),
      joinRequest: this.getJoinRequestService(),
      event: this.getEventService(),
    };
  }

  /**
   * Clear service cache (useful for testing)
   */
  clearCache() {
    this._services = {};
  }
}

// Export individual services and factory
module.exports = {
  ServiceFactory,
  UserService,
  SocietyService,
  MaintenanceService,
  ForumService,
  ContactService,
  JoinRequestService,
  EventService,
};
