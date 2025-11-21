const dbConnection = require('../config/database');
const SocietyService = require('../models/services/SocietyService');

/**
 * Seed sample societies into the database
 */

const sampleSocieties = [
  {
    name: "Green Valley Apartments",
    address: "123 Green Valley Road, Mumbai",
    totalWings: 4,
    totalFlats: 120,
    adminUsers: [],
    settings: {
      maintenanceAmount: 2500,
      maintenanceDueDate: 5,
      allowTenantForumAccess: true
    }
  },
  {
    name: "Sunrise Heights",
    address: "456 Sunrise Avenue, Mumbai",
    totalWings: 3,
    totalFlats: 90,
    adminUsers: [],
    settings: {
      maintenanceAmount: 3000,
      maintenanceDueDate: 10,
      allowTenantForumAccess: true
    }
  },
  {
    name: "Ocean View Society",
    address: "789 Ocean Drive, Mumbai",
    totalWings: 5,
    totalFlats: 200,
    adminUsers: [],
    settings: {
      maintenanceAmount: 2000,
      maintenanceDueDate: 1,
      allowTenantForumAccess: false
    }
  }
];

async function seedSocieties() {
  try {
    console.log('🌱 Starting society seeding...');
    
    // Connect to database
    const db = await dbConnection.connect();
    console.log('✅ Connected to database');
    
    const societyService = new SocietyService(db);
    
    // Check if societies already exist
    const existingSocieties = await societyService.getActiveSocieties();
    
    if (existingSocieties.data && existingSocieties.data.length > 0) {
      console.log(`ℹ️  Found ${existingSocieties.data.length} existing societies:`);
      existingSocieties.data.forEach(society => {
        console.log(`  - ${society.name}`);
      });
      console.log('✅ Societies already exist, skipping seeding');
      return {
        success: true,
        message: 'Societies already exist',
        existing: existingSocieties.data
      };
    }
    
    console.log('📝 Creating sample societies...');
    const createdSocieties = [];
    
    for (const societyData of sampleSocieties) {
      try {
        // Add timestamps
        societyData.createdAt = new Date();
        societyData.updatedAt = new Date();
        
        const result = await societyService.createSociety(societyData);
        
        if (result.success) {
          console.log(`✅ Created society: ${societyData.name}`);
          createdSocieties.push(result.data);
        } else {
          console.log(`❌ Failed to create society: ${societyData.name} - ${result.message}`);
        }
      } catch (error) {
        console.log(`❌ Error creating society ${societyData.name}:`, error.message);
      }
    }
    
    console.log(`🎉 Successfully created ${createdSocieties.length} societies!`);
    
    return {
      success: true,
      created: createdSocieties
    };
    
  } catch (error) {
    console.error('❌ Society seeding failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close database connection
    await dbConnection.disconnect();
  }
}

// Run seeding if this script is executed directly
if (require.main === module) {
  seedSocieties()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Society seeding completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Society seeding failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { seedSocieties };