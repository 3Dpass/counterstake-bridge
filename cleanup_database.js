#!/usr/bin/env node

/**
 * Database Cleanup Script
 * 
 * This script safely removes all bridge-related data from the database
 * while respecting foreign key constraints. It removes data in the correct
 * order to avoid constraint violations.
 * 
 * Usage: node cleanup_database.js
 */

const db = require('ocore/db.js');
const conf = require('ocore/conf.js');
const db_import = require('./db_import.js');

async function cleanupDatabase() {
    console.log('🧹 Starting database cleanup...');
    
    try {
        // Initialize database connection
        await db_import.initDB();
        console.log('✅ Database initialized');

        // Get current data counts
        console.log('\n📊 Current database state:');
        
        const challengesCount = await db.query("SELECT COUNT(*) as count FROM challenges");
        const claimsCount = await db.query("SELECT COUNT(*) as count FROM claims");
        const transfersCount = await db.query("SELECT COUNT(*) as count FROM transfers");
        const assistantsCount = await db.query("SELECT COUNT(*) as count FROM pooled_assistants");
        const bridgesCount = await db.query("SELECT COUNT(*) as count FROM bridges");
        
        console.log(`  Challenges: ${challengesCount[0].count}`);
        console.log(`  Claims: ${claimsCount[0].count}`);
        console.log(`  Transfers: ${transfersCount[0].count}`);
        console.log(`  Pooled Assistants: ${assistantsCount[0].count}`);
        console.log(`  Bridges: ${bridgesCount[0].count}`);

        if (bridgesCount[0].count === 0) {
            console.log('\n✅ Database is already clean - no bridges to remove');
            return;
        }

        console.log('\n🗑️  Removing data in correct order to respect foreign key constraints...');
        
        // Remove in order: challenges -> claims -> transfers -> pooled_assistants -> bridges
        // This order respects the foreign key dependencies
        
        console.log('1. Removing challenges...');
        const challengesResult = await db.query("DELETE FROM challenges");
        console.log(`   ✅ Removed ${challengesResult.changes || 0} challenges`);
        
        console.log('2. Removing claims...');
        const claimsResult = await db.query("DELETE FROM claims");
        console.log(`   ✅ Removed ${claimsResult.changes || 0} claims`);
        
        console.log('3. Removing transfers...');
        const transfersResult = await db.query("DELETE FROM transfers");
        console.log(`   ✅ Removed ${transfersResult.changes || 0} transfers`);
        
        console.log('4. Removing pooled assistants...');
        const assistantsResult = await db.query("DELETE FROM pooled_assistants");
        console.log(`   ✅ Removed ${assistantsResult.changes || 0} pooled assistants`);
        
        console.log('5. Removing bridges...');
        const bridgesResult = await db.query("DELETE FROM bridges");
        console.log(`   ✅ Removed ${bridgesResult.changes || 0} bridges`);
        
        console.log('6. Resetting bridge ID sequence...');
        await db.query("DELETE FROM sqlite_sequence WHERE name='bridges'");
        console.log(`   ✅ Bridge ID sequence reset to start from 1`);

        // Verify final state
        console.log('\n📊 Final database state:');
        
        const finalChallengesCount = await db.query("SELECT COUNT(*) as count FROM challenges");
        const finalClaimsCount = await db.query("SELECT COUNT(*) as count FROM claims");
        const finalTransfersCount = await db.query("SELECT COUNT(*) as count FROM transfers");
        const finalAssistantsCount = await db.query("SELECT COUNT(*) as count FROM pooled_assistants");
        const finalBridgesCount = await db.query("SELECT COUNT(*) as count FROM bridges");
        
        console.log(`  Challenges: ${finalChallengesCount[0].count}`);
        console.log(`  Claims: ${finalClaimsCount[0].count}`);
        console.log(`  Transfers: ${finalTransfersCount[0].count}`);
        console.log(`  Pooled Assistants: ${finalAssistantsCount[0].count}`);
        console.log(`  Bridges: ${finalBridgesCount[0].count}`);

        // Check if cleanup was successful
        const totalRemaining = finalChallengesCount[0].count + finalClaimsCount[0].count + 
                              finalTransfersCount[0].count + finalAssistantsCount[0].count + 
                              finalBridgesCount[0].count;

        if (totalRemaining === 0) {
            console.log('\n🎉 Database cleanup completed successfully!');
            console.log('   All bridge-related data has been removed.');
        } else {
            console.log('\n⚠️  Warning: Some data may still remain in the database.');
            console.log(`   Total remaining records: ${totalRemaining}`);
        }

    } catch (error) {
        console.error('\n❌ Error during database cleanup:', error.message);
        console.error('Stack trace:', error.stack);
        throw error;
    } finally {
        // Close database connection
        db.close();
        console.log('\n🔒 Database connection closed');
    }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
    cleanupDatabase()
        .then(() => {
            console.log('\n✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script failed:', error.message);
            process.exit(1);
        });
}

// Export the function for use by other modules
module.exports = { cleanupDatabase };
