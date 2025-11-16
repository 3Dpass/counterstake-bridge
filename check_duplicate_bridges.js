"use strict";

/**
 * Check for Duplicate Bridges by Foreign Address
 * 
 * This script identifies duplicate bridges by comparing foreign addresses
 * (case-insensitive for EVM addresses).
 */

const db_import = require('./db_import.js');
const db = require('ocore/db.js');
const { ethers } = require("ethers");
const { normalizeAddressCaseInsensitive } = require('./address_normalizer.js');

async function init() {
    await db_import.initDB();
    console.log('Database initialized');
}

function normalizeAddress(address) {
    return normalizeAddressCaseInsensitive(address);
}

async function checkDuplicateBridges() {
    console.log('🔍 Checking for duplicate bridges by foreign address...\n');
    
    await init();
    
    try {
        // Get all bridges
        const bridges = await db.query(`
            SELECT 
                bridge_id,
                home_network,
                home_asset,
                home_asset_decimals,
                home_symbol,
                foreign_network,
                foreign_asset,
                foreign_asset_decimals,
                foreign_symbol,
                stake_asset,
                import_aa,
                export_aa,
                creation_date
            FROM bridges 
            ORDER BY bridge_id
        `);
        
        if (bridges.length === 0) {
            console.log('❌ No bridges found in database');
            return;
        }
        
        console.log(`📊 Analyzing ${bridges.length} bridge(s) for duplicates...\n`);
        
        // Group bridges by normalized foreign address
        const foreignAddressMap = new Map();
        
        bridges.forEach(bridge => {
            const normalizedForeign = normalizeAddress(bridge.foreign_asset);
            const key = `${bridge.foreign_network}:${normalizedForeign}`;
            
            if (!foreignAddressMap.has(key)) {
                foreignAddressMap.set(key, []);
            }
            foreignAddressMap.get(key).push(bridge);
        });
        
        // Find duplicates
        const duplicates = [];
        foreignAddressMap.forEach((bridgeList, key) => {
            if (bridgeList.length > 1) {
                duplicates.push({
                    foreignKey: key,
                    bridges: bridgeList
                });
            }
        });
        
        if (duplicates.length === 0) {
            console.log('✅ No duplicate bridges found!');
            return;
        }
        
        console.log(`⚠️  Found ${duplicates.length} duplicate group(s):\n`);
        
        duplicates.forEach((dup, index) => {
            const [network, address] = dup.foreignKey.split(':');
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🔴 DUPLICATE GROUP #${index + 1}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Foreign Network: ${network}`);
            console.log(`Foreign Address (normalized): ${address}`);
            console.log(`Number of Duplicates: ${dup.bridges.length}`);
            console.log(`\n🔍 Duplicated Foreign Assets (raw values from DB):`);
            dup.bridges.forEach((b, idx) => {
                console.log(`   ${idx + 1}. Bridge #${b.bridge_id}: ${b.foreign_asset} ${b.foreign_asset.toLowerCase() === address.toLowerCase() ? '✅' : '❌'}`);
            });
            console.log('');
            
            dup.bridges.forEach((bridge, idx) => {
                console.log(`   Bridge #${bridge.bridge_id} (${idx + 1}/${dup.bridges.length}):`);
                console.log(`      Home Network: ${bridge.home_network}`);
                console.log(`      Home Asset: ${bridge.home_asset}`);
                console.log(`      Home Symbol: ${bridge.home_symbol}`);
                console.log(`      Home Decimals: ${bridge.home_asset_decimals}`);
                console.log(`      Foreign Symbol: ${bridge.foreign_symbol}`);
                console.log(`      Foreign Decimals: ${bridge.foreign_asset_decimals}`);
                console.log(`      Import AA: ${bridge.import_aa || 'Not set'}`);
                console.log(`      Export AA: ${bridge.export_aa || 'Not set'}`);
                console.log(`      Created: ${bridge.creation_date}`);
                console.log('');
            });
        });
        
        // Summary
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📊 DUPLICATE SUMMARY`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Total Duplicate Groups: ${duplicates.length}`);
        const totalDuplicateBridges = duplicates.reduce((sum, dup) => sum + dup.bridges.length, 0);
        const uniqueBridges = totalDuplicateBridges - duplicates.length; // One bridge per group is "original"
        console.log(`Total Bridges in Duplicate Groups: ${totalDuplicateBridges}`);
        console.log(`Bridges to Remove (keeping one per group): ${uniqueBridges}`);
        
        // Show which bridges should be kept vs removed/merged
        console.log(`\n💡 RECOMMENDATION:`);
        duplicates.forEach((dup, index) => {
            // Check if bridges are complementary (one has import, other has export)
            const hasImport = dup.bridges.filter(b => b.import_aa).length;
            const hasExport = dup.bridges.filter(b => b.export_aa).length;
            const hasBoth = dup.bridges.filter(b => b.import_aa && b.export_aa).length;
            
            // Find the bridge with the most complete configuration
            const sorted = [...dup.bridges].sort((a, b) => {
                const aComplete = (a.import_aa ? 1 : 0) + (a.export_aa ? 1 : 0);
                const bComplete = (b.import_aa ? 1 : 0) + (b.export_aa ? 1 : 0);
                if (aComplete !== bComplete) return bComplete - aComplete;
                // Prefer bridge with non-null decimals
                if (a.home_asset_decimals !== null && b.home_asset_decimals === null) return -1;
                if (a.home_asset_decimals === null && b.home_asset_decimals !== null) return 1;
                return new Date(a.creation_date) - new Date(b.creation_date);
            });
            
            const keep = sorted[0];
            const others = sorted.slice(1);
            
            console.log(`\n   Group #${index + 1}:`);
            
            // If bridges are complementary (one has import, other has export), suggest merging
            if (hasImport > 0 && hasExport > 0 && hasBoth === 0 && dup.bridges.length === 2) {
                const importBridge = dup.bridges.find(b => b.import_aa);
                const exportBridge = dup.bridges.find(b => b.export_aa);
                
                console.log(`   🔄 MERGE: These bridges are complementary (one has Import, other has Export)`);
                console.log(`   ✅ KEEP: Bridge #${keep.bridge_id} (will merge data from others)`);
                others.forEach(b => {
                    console.log(`   📋 MERGE INTO #${keep.bridge_id}: Bridge #${b.bridge_id}`);
                    if (b.import_aa && !keep.import_aa) {
                        console.log(`      → Add Import AA: ${b.import_aa}`);
                    }
                    if (b.export_aa && !keep.export_aa) {
                        console.log(`      → Add Export AA: ${b.export_aa}`);
                    }
                    if (b.home_asset_decimals !== null && keep.home_asset_decimals === null) {
                        console.log(`      → Update Home Decimals: ${b.home_asset_decimals}`);
                    }
                });
                console.log(`   ❌ REMOVE: Bridge #${others[0].bridge_id} (after merging)`);
            } else {
                // Otherwise, just keep the most complete one
                console.log(`   ✅ KEEP: Bridge #${keep.bridge_id} (most complete, oldest)`);
                others.forEach(b => {
                    console.log(`   ❌ REMOVE: Bridge #${b.bridge_id}`);
                });
            }
        });
        
        console.log(`\n🎉 Duplicate check complete!`);
        
    } catch (error) {
        console.error('❌ Error checking for duplicates:', error);
        throw error;
    } finally {
        console.log('🔒 Script completed, exiting...');
        process.exit(0);
    }
}

checkDuplicateBridges().catch(console.error);

