#!/usr/bin/env node

/**
 * Database State Check Script
 * 
 * This script checks the current state of the database without making any changes.
 * It shows counts of all bridge-related tables and their relationships.
 * 
 * Usage: node check_database_state.js
 */

const db = require('ocore/db.js');
const conf = require('ocore/conf.js');
const db_import = require('./db_import.js');

async function checkDatabaseState() {
    console.log('🔍 Checking database state...');
    
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

        // Show detailed bridge information
        if (bridgesCount[0].count > 0) {
            console.log('\n🌉 Bridge Details:');
            const bridges = await db.query(`
                SELECT 
                    bridge_id,
                    home_network,
                    home_asset,
                    home_symbol,
                    foreign_network,
                    foreign_asset,
                    foreign_symbol,
                    import_aa,
                    export_aa,
                    import_assistant_aa,
                    export_assistant_aa,
                    creation_date
                FROM bridges 
                ORDER BY bridge_id
            `);
            
            for (const bridge of bridges) {
                console.log(`\n  Bridge ${bridge.bridge_id}:`);
                console.log(`    Home: ${bridge.home_network} ${bridge.home_symbol} (${bridge.home_asset})`);
                console.log(`    Foreign: ${bridge.foreign_network} ${bridge.foreign_symbol} (${bridge.foreign_asset})`);
                console.log(`    Import AA: ${bridge.import_aa || 'None'}`);
                console.log(`    Export AA: ${bridge.export_aa || 'None'}`);
                console.log(`    Import Assistant: ${bridge.import_assistant_aa || 'None'}`);
                console.log(`    Export Assistant: ${bridge.export_assistant_aa || 'None'}`);
                console.log(`    Created: ${bridge.creation_date}`);
                
                // Determine bridge type
                if (bridge.import_aa && bridge.export_aa) {
                    console.log(`    Type: Complete (Import + Export)`);
                } else if (bridge.import_aa) {
                    console.log(`    Type: Import only`);
                } else if (bridge.export_aa) {
                    console.log(`    Type: Export only`);
                } else {
                    console.log(`    Type: Unknown`);
                }
            }
        }

        // Show summary
        const totalRecords = challengesCount[0].count + claimsCount[0].count + 
                           transfersCount[0].count + assistantsCount[0].count + 
                           bridgesCount[0].count;
        
        console.log(`\n📈 Summary:`);
        console.log(`  Total bridge-related records: ${totalRecords}`);
        
        if (totalRecords === 0) {
            console.log(`  Status: Database is clean`);
        } else {
            console.log(`  Status: Database contains bridge data`);
        }

    } catch (error) {
        console.error('\n❌ Error checking database state:', error.message);
        console.error('Stack trace:', error.stack);
        throw error;
    } finally {
        // Close database connection
        db.close();
        console.log('\n🔒 Database connection closed');
    }
}

// Run the check if this script is executed directly
if (require.main === module) {
    checkDatabaseState()
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
module.exports = { checkDatabaseState };
