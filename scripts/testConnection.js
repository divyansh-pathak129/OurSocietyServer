/**
 * Test MongoDB connection and check for existing data
 */

const dbConnection = require('../config/database');

async function testConnection() {
  try {
    console.log('Testing MongoDB connection...');
    
    // Connect to database
    const db = await dbConnection.connect();
    console.log('✅ Successfully connected to MongoDB');
    
    // Test basic operations
    console.log('\n📊 Checking collections...');
    
    // Check users collection
    const usersCollection = db.collection('users');
    const userCount = await usersCollection.countDocuments();
    console.log(`Users collection: ${userCount} documents`);
    
    if (userCount > 0) {
      const sampleUsers = await usersCollection.find({}).limit(3).toArray();
      console.log('Sample users:');
      sampleUsers.forEach(user => {
        console.log(`  - ${user.name} (${user.wing}-${user.flatNumber}) - ${user.residentType}`);
      });
    }
    
    // Check societies collection
    const societiesCollection = db.collection('societies');
    const societyCount = await societiesCollection.countDocuments();
    console.log(`Societies collection: ${societyCount} documents`);
    
    if (societyCount > 0) {
      const societies = await societiesCollection.find({}).toArray();
      console.log('Available societies:');
      societies.forEach(society => {
        console.log(`  - ${society.name} (${society.totalWings} wings, ${society.totalFlats} flats)`);
      });
    } else {
      console.log('No societies found. Creating sample society...');
      
      const sampleSociety = {
        name: "Green Valley Apartments",
        address: "123 Green Valley Road, Mumbai",
        totalWings: 4,
        totalFlats: 120,
        adminUsers: [],
        settings: {
          maintenanceAmount: 2500,
          maintenanceDueDate: 5,
          allowTenantForumAccess: true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await societiesCollection.insertOne(sampleSociety);
      console.log(`✅ Created sample society with ID: ${result.insertedId}`);
    }
    
    console.log('\n✅ Database connection test completed successfully');
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('1. Check your MongoDB Atlas cluster status');
      console.error('2. Verify the connection string in .env file');
      console.error('3. Ensure your IP address is whitelisted in MongoDB Atlas');
      console.error('4. Check if the cluster is paused or deleted');
    }
  } finally {
    await dbConnection.disconnect();
    process.exit(0);
  }
}

testConnection();