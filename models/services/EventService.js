const { ObjectId } = require('mongodb');

class EventService {
  constructor(db) {
    this.collection = db.collection('events');
  }

  // Create a new event
  async create(eventData) {
    try {
      const event = {
        ...eventData,
        societyId: new ObjectId(eventData.societyId),
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      
      const result = await this.collection.insertOne(event);
      return { success: true, data: { ...event, _id: result.insertedId } };
    } catch (error) {
      console.error('Error creating event:', error.message);
      throw error;
    }
  }

  // Get all events for a society
  async getBySociety(societyId, options = {}) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      
      const query = { 
        societyId: new ObjectId(societyId),
        isActive: true 
      };
      
      if (options.eventType) {
        query.eventType = options.eventType;
      }
      
      if (options.upcoming) {
        query.eventDate = { $gte: new Date() };
      }
      
      const sort = { eventDate: 1 };
      const limit = options.limit || 50;
      
      const events = await this.collection
        .find(query)
        .sort(sort)
        .limit(limit)
        .toArray();
      
      return { success: true, data: events };
    } catch (error) {
      console.error('Error getting events by society:', error.message);
      throw error;
    }
  }

  // Get upcoming events for dashboard
  async getUpcomingEvents(societyId, limit = 5) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      
      const events = await this.collection
        .find({
          societyId: new ObjectId(societyId),
          isActive: true,
          eventDate: { $gte: new Date() }
        })
        .sort({ eventDate: 1 })
        .limit(limit)
        .toArray();
      
      return { success: true, data: events };
    } catch (error) {
      console.error('Error getting upcoming events:', error.message);
      throw error;
    }
  }

  // Get event by ID
  async getById(eventId) {
    try {
      if (!ObjectId.isValid(eventId)) throw new Error('Valid eventId is required');
      
      const event = await this.collection.findOne({ 
        _id: new ObjectId(eventId),
        isActive: true 
      });
      
      if (!event) {
        throw new Error('Event not found');
      }
      
      return { success: true, data: event };
    } catch (error) {
      console.error('Error getting event by ID:', error.message);
      throw error;
    }
  }

  // Update event
  async update(eventId, updateData) {
    try {
      if (!ObjectId.isValid(eventId)) throw new Error('Valid eventId is required');
      
      const update = {
        ...updateData,
        updatedAt: new Date()
      };
      
      const result = await this.collection.updateOne(
        { _id: new ObjectId(eventId) },
        { $set: update }
      );
      
      if (result.matchedCount === 0) {
        throw new Error('Event not found');
      }
      
      return { success: true, data: { _id: eventId, ...update } };
    } catch (error) {
      console.error('Error updating event:', error.message);
      throw error;
    }
  }

  // Delete event (soft delete)
  async delete(eventId) {
    try {
      if (!ObjectId.isValid(eventId)) throw new Error('Valid eventId is required');
      
      const result = await this.collection.updateOne(
        { _id: new ObjectId(eventId) },
        { 
          $set: { 
            isActive: false,
            updatedAt: new Date()
          }
        }
      );
      
      if (result.matchedCount === 0) {
        throw new Error('Event not found');
      }
      
      return { success: true, data: { _id: eventId } };
    } catch (error) {
      console.error('Error deleting event:', error.message);
      throw error;
    }
  }

  // Get events by date range
  async getByDateRange(societyId, startDate, endDate) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      
      const events = await this.collection
        .find({
          societyId: new ObjectId(societyId),
          isActive: true,
          eventDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        })
        .sort({ eventDate: 1 })
        .toArray();
      
      return { success: true, data: events };
    } catch (error) {
      console.error('Error getting events by date range:', error.message);
      throw error;
    }
  }

  // Get event statistics
  async getEventStats(societyId) {
    try {
      if (!ObjectId.isValid(societyId)) throw new Error('Valid societyId is required');
      
      const pipeline = [
        { $match: { societyId: new ObjectId(societyId), isActive: true } },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            upcomingEvents: {
              $sum: { $cond: [{ $gte: ["$eventDate", new Date()] }, 1, 0] }
            },
            meetings: {
              $sum: { $cond: [{ $eq: ["$eventType", "meeting"] }, 1, 0] }
            },
            celebrations: {
              $sum: { $cond: [{ $eq: ["$eventType", "celebration"] }, 1, 0] }
            }
          }
        }
      ];
      
      const result = await this.collection.aggregate(pipeline).toArray();
      return { success: true, data: result[0] || {} };
    } catch (error) {
      console.error('Error getting event stats:', error.message);
      throw error;
    }
  }
}

module.exports = EventService;
