const dbConnection = require('../config/database');
const MaintenanceService = require('../models/services/MaintenanceService');
const UserService = require('../models/services/UserService');
const SocietyService = require('../models/services/SocietyService');

/**
 * Test script for maintenance endpoints
 * Creates sample maintenance data for testing
 */

async function testMaintenanceEndpoints() {
  try {
    console.log('🧪 Testing maintenance endpoints...');
    
    // Connect to database
    const db = await dbConnection.connect();
    console.log('✅ Connected to database');
    
    const maintenanceService = new MaintenanceService(db);
    const userService = new UserService(db);
    const societyService = new SocietyService(db);
    
    // Get a sample society
    const societies = await societyService.getActiveSocieties();
    if (!societies.data || societies.data.length === 0) {
      console.log('❌ No societies found. Please run seedSocieties.js first');
      return;
    }
    
    const sampleSociety = societies.data[0];
    console.log(`📋 Using society: ${sampleSociety.name}`);
    
    // Check if there are any users in this society
    const users = await userService.findBySocietyId(sampleSociety._id);
    if (!users.data || users.data.length === 0) {
      console.log('ℹ️  No users found in society. Creating sample maintenance records manually...');
      
      // Create sample maintenance records for testing
      const sampleRecords = [
        {
          societyId: sampleSociety._id,
          clerkUserId: 'test_user_1',
          wing: 'Wing A',
          flatNumber: '101',
          month: '2024-01',
          amount: 2500,
          dueDate: new Date('2024-01-05'),
          status: 'paid',
          paidDate: new Date('2024-01-03'),
          paymentMethod: 'Online',
          transactionId: 'TXN123456'
        },
        {
          societyId: sampleSociety._id,
          clerkUserId: 'test_user_2',
          wing: 'Wing A',
          flatNumber: '102',
          month: '2024-01',
          amount: 2500,
          dueDate: new Date('2024-01-05'),
          status: 'pending'
        },
        {
          societyId: sampleSociety._id,
          clerkUserId: 'test_user_3',
          wing: 'Wing B',
          flatNumber: '201',
          month: '2024-01',
          amount: 2500,
          dueDate: new Date('2023-12-05'), // Overdue
          status: 'overdue'
        }
      ];
      
      for (const record of sampleRecords) {
        try {
          record.createdAt = new Date();
          record.updatedAt = new Date();
          
          const result = await maintenanceService.create(record);
          if (result.success) {
            console.log(`✅ Created maintenance record for ${record.clerkUserId}`);
          }
        } catch (error) {
          console.log(`⚠️  Could not create record for ${record.clerkUserId}: ${error.message}`);
        }
      }
    } else {
      console.log(`👥 Found ${users.data.length} users in society`);
      
      // Generate maintenance records for current month
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const dueDate = new Date();
      dueDate.setDate(5); // 5th of current month
      
      console.log(`📅 Generating maintenance records for ${currentMonth}...`);
      
      const generateResult = await maintenanceService.generateMonthlyRecords(
        sampleSociety._id,
        currentMonth,
        2500,
        dueDate
      );
      
      if (generateResult.success) {
        console.log(`✅ Generated ${generateResult.data.created} maintenance records`);
        if (generateResult.data.errors.length > 0) {
          console.log(`⚠️  ${generateResult.data.errors.length} errors occurred`);
        }
      }
    }
    
    // Test getting society maintenance records
    console.log('\n📊 Testing society maintenance records...');
    const societyRecords = await maintenanceService.getSocietyMaintenanceRecords(sampleSociety._id);
    if (societyRecords.success) {
      console.log(`✅ Found ${societyRecords.data.length} maintenance records for society`);
      
      // Show sample records
      societyRecords.data.slice(0, 3).forEach((record, index) => {
        console.log(`  ${index + 1}. ${record.wing} ${record.flatNumber} - ${record.month} - ${record.status} - ₹${record.amount}`);
      });
    }
    
    // Test getting maintenance statistics
    console.log('\n📈 Testing maintenance statistics...');
    const stats = await maintenanceService.getSocietyMaintenanceStats(sampleSociety._id);
    if (stats.success) {
      console.log('✅ Maintenance Statistics:');
      console.log(`  Total Records: ${stats.data.total}`);
      console.log(`  Pending: ${stats.data.pending} (₹${stats.data.pendingAmount})`);
      console.log(`  Paid: ${stats.data.paid} (₹${stats.data.paidAmount})`);
      console.log(`  Overdue: ${stats.data.overdue} (₹${stats.data.overdueAmount})`);
      console.log(`  Total Amount: ₹${stats.data.totalAmount}`);
    }
    
    // Test overdue records
    console.log('\n⏰ Testing overdue maintenance records...');
    const overdueRecords = await maintenanceService.getOverdueRecords(sampleSociety._id);
    if (overdueRecords.success) {
      console.log(`✅ Found ${overdueRecords.data.length} overdue records`);
      overdueRecords.data.slice(0, 3).forEach((record, index) => {
        console.log(`  ${index + 1}. ${record.wing} ${record.flatNumber} - Due: ${record.dueDate.toDateString()}`);
      });
    }
    
    console.log('\n🎉 Maintenance endpoints test completed successfully!');
    
    return {
      success: true,
      societyId: sampleSociety._id,
      recordsCount: societyRecords.data?.length || 0,
      stats: stats.data
    };
    
  } catch (error) {
    console.error('❌ Maintenance endpoints test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Close database connection
    await dbConnection.disconnect();
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testMaintenanceEndpoints()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Maintenance endpoints test script completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Maintenance endpoints test script failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testMaintenanceEndpoints };