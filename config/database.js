const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

class DatabaseConnection {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('Database already connected');
        return this.db;
      }

      const uri = process.env.MONGODB_URI;
      if (!uri || uri.trim() === '') {
        throw new Error('MONGODB_URI environment variable is not set or empty');
      }

      // Validate URI format
      if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
        throw new Error('Invalid MongoDB URI format. Must start with mongodb:// or mongodb+srv://');
      }

      console.log('Connecting to MongoDB Atlas...');
      
      this.client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      
      // Test the connection
      await this.client.db('maindb').command({ ping: 1 });
      
      this.db = this.client.db('maindb');
      this.isConnected = true;
      
      console.log('Successfully connected to MongoDB Atlas');
      return this.db;
    } catch (error) {
      console.error('Failed to connect to MongoDB Atlas:', error.message);
      
      // Provide helpful error messages
      if (error.message.includes('ENOTFOUND') || error.message.includes('querySrv')) {
        console.error('❌ Connection Error: The MongoDB cluster hostname appears to be incorrect.');
        console.error('💡 Please check your MongoDB Atlas cluster and update the MONGODB_URI in your .env file.');
        console.error('💡 The correct format should be: mongodb+srv://username:password@your-cluster-name.xxxxx.mongodb.net/database');
      } else if (error.message.includes('Authentication failed') || error.message.includes('bad auth')) {
        console.error('❌ Authentication Error: Invalid username or password.');
        console.error('💡 Please check your MongoDB Atlas credentials in the .env file.');
        console.error('💡 Make sure the user exists and has the correct permissions.');
        console.error('💡 If your password contains special characters, make sure they are URL-encoded.');
      }
      
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        await this.client.close();
        this.isConnected = false;
        console.log('Disconnected from MongoDB Atlas');
      }
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error.message);
    }
  }

  getDb() {
    if (!this.isConnected || !this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  isHealthy() {
    return this.isConnected && this.client && this.db;
  }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

module.exports = dbConnection;