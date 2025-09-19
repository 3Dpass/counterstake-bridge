#!/usr/bin/env node

/**
 * Check Obyte Database Sync Status
 * 
 * This script checks if the local Obyte database is up to date with the network
 * by comparing local MCI (Main Chain Index) with network data.
 */

const db = require('ocore/db.js');
const conf = require('ocore/conf.js');
const network = require('ocore/network.js');
const desktopApp = require('ocore/desktop_app.js');

async function checkSyncStatus() {
    console.log('🔍 Checking Obyte Database Sync Status\n');
    
    try {
        // Database is already initialized by the conf loading
        
        // Get local database stats
        console.log('📊 Local Database Status:');
        
        const maxStableMCI = await db.query('SELECT MAX(main_chain_index) as max_mci FROM units WHERE is_stable=1');
        const maxUnstableMCI = await db.query('SELECT MAX(main_chain_index) as max_unstable_mci FROM units WHERE is_stable=0');
        const totalStableUnits = await db.query('SELECT COUNT(*) as count FROM units WHERE is_stable=1');
        const totalUnstableUnits = await db.query('SELECT COUNT(*) as count FROM units WHERE is_stable=0');
        
        console.log(`   Max Stable MCI: ${maxStableMCI[0]?.max_mci || 'N/A'}`);
        console.log(`   Max Unstable MCI: ${maxUnstableMCI[0]?.max_unstable_mci || 'N/A'}`);
        console.log(`   Total Stable Units: ${totalStableUnits[0]?.count || 0}`);
        console.log(`   Total Unstable Units: ${totalUnstableUnits[0]?.count || 0}`);
        
        // Check if we're behind
        const stableMCI = maxStableMCI[0]?.max_mci || 0;
        const unstableMCI = maxUnstableMCI[0]?.max_unstable_mci || 0;
        const behind = unstableMCI - stableMCI;
        
        console.log(`   Units Behind: ${behind}`);
        
        if (behind > 0) {
            console.log(`   ⚠️  Database is ${behind} units behind (catching up...)`);
        } else {
            console.log(`   ✅ Database appears to be up to date`);
        }
        
        // Get latest timestamp
        const latestTimestamp = await db.query('SELECT MAX(timestamp) as latest_timestamp FROM units WHERE is_stable=1 AND timestamp > 0');
        if (latestTimestamp[0]?.latest_timestamp) {
            const date = new Date(latestTimestamp[0].latest_timestamp * 1000);
            console.log(`   Latest Stable Unit: ${date.toISOString()}`);
            
            const now = new Date();
            const diffMinutes = Math.floor((now - date) / (1000 * 60));
            console.log(`   Age: ${diffMinutes} minutes ago`);
            
            if (diffMinutes > 10) {
                console.log(`   ⚠️  Database might be stale (${diffMinutes} minutes old)`);
            } else {
                console.log(`   ✅ Database is recent`);
            }
        }
        
        // Check network connection status
        console.log('\n🌐 Network Status:');
        console.log(`   Hub: ${conf.hub}`);
        console.log(`   Light Mode: ${conf.bLight ? 'Yes' : 'No'}`);
        console.log(`   Storage: ${conf.storage}`);
        
        // Check if we can get network info
        try {
            const networkInfo = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
                
                // Try to get network info
                network.requestFromHub('hub/get_network_info', {}, (ws, request, response) => {
                    clearTimeout(timeout);
                    if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('   ✅ Network connection active');
            if (networkInfo.last_stable_mci) {
                console.log(`   Network Last Stable MCI: ${networkInfo.last_stable_mci}`);
                const networkBehind = networkInfo.last_stable_mci - stableMCI;
                if (networkBehind > 0) {
                    console.log(`   ⚠️  Local DB is ${networkBehind} units behind network`);
                } else {
                    console.log(`   ✅ Local DB is up to date with network`);
                }
            }
        } catch (err) {
            console.log(`   ❌ Cannot connect to network: ${err.message}`);
        }
        
        // Summary
        console.log('\n📋 Summary:');
        if (behind === 0 && (latestTimestamp[0]?.latest_timestamp && (Date.now() - latestTimestamp[0].latest_timestamp * 1000) < 10 * 60 * 1000)) {
            console.log('   ✅ Database is up to date and recent');
        } else if (behind > 0) {
            console.log('   ⚠️  Database is catching up (this is normal during sync)');
        } else {
            console.log('   ⚠️  Database might be stale or disconnected');
        }
        
    } catch (err) {
        console.error('❌ Error checking sync status:', err.message);
    }
    
    process.exit(0);
}

// Run the check
checkSyncStatus();
