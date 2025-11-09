#!/usr/bin/env node

/**
 * Remove Duplicate Bridges Script
 * 
 * This script identifies and removes duplicate bridges that were created due to
 * case-sensitive foreign_asset comparison. It keeps the older/more complete bridge
 * and removes the newer duplicate.
 * 
 * Usage: node remove_duplicate_bridges.js [--dry-run]
 */

const db = require('ocore/db.js');
const { ethers: { utils } } = require("ethers");

async function findDuplicateBridges() {
    console.log('🔍 Searching for duplicate bridges...\n');
    
    // Get all bridges
    const allBridges = await db.query("SELECT * FROM bridges ORDER BY bridge_id");
    
    // Group bridges by case-insensitive foreign_asset
    const bridgesByForeignAsset = {};
    
    for (const bridge of allBridges) {
        if (!bridge.foreign_asset) continue;
        
        // Normalize foreign_asset to lowercase for grouping
        const normalized = bridge.foreign_asset.toLowerCase();
        
        if (!bridgesByForeignAsset[normalized]) {
            bridgesByForeignAsset[normalized] = [];
        }
        bridgesByForeignAsset[normalized].push(bridge);
    }
    
    // Find groups with duplicates
    const duplicates = [];
    for (const [normalizedAsset, bridges] of Object.entries(bridgesByForeignAsset)) {
        if (bridges.length > 1) {
            // Check if they're actually duplicates (same home_network, foreign_network, home_asset)
            const groupedByKey = {};
            for (const bridge of bridges) {
                const key = `${bridge.home_network}-${bridge.foreign_network}-${bridge.home_asset}`;
                if (!groupedByKey[key]) {
                    groupedByKey[key] = [];
                }
                groupedByKey[key].push(bridge);
            }
            
            // Add groups that have multiple bridges with the same key
            for (const [key, group] of Object.entries(groupedByKey)) {
                if (group.length > 1) {
                    duplicates.push({
                        normalizedForeignAsset: normalizedAsset,
                        bridges: group,
                        key: key
                    });
                }
            }
        }
    }
    
    return duplicates;
}

function chooseBridgeToKeep(bridges) {
    // Prefer bridges that are more complete (have both import and export)
    const completeBridges = bridges.filter(b => b.import_aa && b.export_aa);
    if (completeBridges.length > 0) {
        // Among complete bridges, prefer the older one
        return completeBridges.sort((a, b) => a.bridge_id - b.bridge_id)[0];
    }
    
    // If no complete bridges, prefer the older one
    return bridges.sort((a, b) => a.bridge_id - b.bridge_id)[0];
}

async function removeDuplicateBridge(bridgeToRemove, bridgeToKeep) {
    console.log(`\n🗑️  Removing duplicate bridge ${bridgeToRemove.bridge_id}...`);
    
    // Check for related data
    const [transfersCount] = await db.query("SELECT COUNT(*) as count FROM transfers WHERE bridge_id=?", [bridgeToRemove.bridge_id]);
    const [claimsCount] = await db.query("SELECT COUNT(*) as count FROM claims WHERE bridge_id=?", [bridgeToRemove.bridge_id]);
    const [challengesCount] = await db.query("SELECT COUNT(*) as count FROM challenges WHERE bridge_id=?", [bridgeToRemove.bridge_id]);
    const [assistantsCount] = await db.query("SELECT COUNT(*) as count FROM pooled_assistants WHERE bridge_id=?", [bridgeToRemove.bridge_id]);
    
    if (transfersCount.count > 0 || claimsCount.count > 0 || challengesCount.count > 0) {
        console.log(`   ⚠️  Warning: Bridge ${bridgeToRemove.bridge_id} has related data:`);
        console.log(`      - Transfers: ${transfersCount.count}`);
        console.log(`      - Claims: ${claimsCount.count}`);
        console.log(`      - Challenges: ${challengesCount.count}`);
        console.log(`      - Pooled Assistants: ${assistantsCount.count}`);
        console.log(`   This bridge will NOT be removed automatically.`);
        console.log(`   Please review manually and migrate data if needed.`);
        return false;
    }
    
    // Remove pooled assistants first (if any)
    if (assistantsCount.count > 0) {
        await db.query("DELETE FROM pooled_assistants WHERE bridge_id=?", [bridgeToRemove.bridge_id]);
        console.log(`   ✅ Removed ${assistantsCount.count} pooled assistant(s)`);
    }
    
    // Remove the bridge
    await db.query("DELETE FROM bridges WHERE bridge_id=?", [bridgeToRemove.bridge_id]);
    console.log(`   ✅ Removed bridge ${bridgeToRemove.bridge_id}`);
    
    return true;
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    
    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }
    
    try {
        // Find duplicates
        const duplicates = await findDuplicateBridges();
        
        if (duplicates.length === 0) {
            console.log('✅ No duplicate bridges found!');
            return;
        }
        
        console.log(`\n📊 Found ${duplicates.length} duplicate bridge group(s):\n`);
        
        let totalRemoved = 0;
        let totalSkipped = 0;
        
        for (const duplicate of duplicates) {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🔍 Duplicate Group: foreign_asset (normalized) = ${duplicate.normalizedForeignAsset}`);
            console.log(`   Key: ${duplicate.key}`);
            console.log(`   Bridges: ${duplicate.bridges.map(b => b.bridge_id).join(', ')}\n`);
            
            // Display each bridge
            for (const bridge of duplicate.bridges) {
                const completeness = (bridge.import_aa && bridge.export_aa) ? '✅ Complete' : 
                                   bridge.import_aa ? '📥 Import only' : 
                                   bridge.export_aa ? '📤 Export only' : '❌ Empty';
                console.log(`   Bridge #${bridge.bridge_id}:`);
                console.log(`      Created: ${bridge.creation_date}`);
                console.log(`      Status: ${completeness}`);
                console.log(`      Foreign Asset: ${bridge.foreign_asset}`);
                console.log(`      Import AA: ${bridge.import_aa || 'None'}`);
                console.log(`      Export AA: ${bridge.export_aa || 'None'}`);
            }
            
            // Choose which bridge to keep
            const bridgeToKeep = chooseBridgeToKeep(duplicate.bridges);
            const bridgesToRemove = duplicate.bridges.filter(b => b.bridge_id !== bridgeToKeep.bridge_id);
            
            console.log(`\n   ✅ Keeping: Bridge #${bridgeToKeep.bridge_id} (${bridgeToKeep.import_aa && bridgeToKeep.export_aa ? 'complete' : 'older'})`);
            console.log(`   🗑️  To remove: ${bridgesToRemove.map(b => `Bridge #${b.bridge_id}`).join(', ')}`);
            
            if (!dryRun) {
                // Remove duplicates
                for (const bridgeToRemove of bridgesToRemove) {
                    const removed = await removeDuplicateBridge(bridgeToRemove, bridgeToKeep);
                    if (removed) {
                        totalRemoved++;
                    } else {
                        totalSkipped++;
                    }
                }
            } else {
                console.log(`   (DRY RUN - would remove ${bridgesToRemove.length} bridge(s))`);
                totalRemoved += bridgesToRemove.length;
            }
        }
        
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        if (dryRun) {
            console.log(`\n📊 DRY RUN SUMMARY:`);
            console.log(`   Would remove: ${totalRemoved} duplicate bridge(s)`);
            console.log(`   Run without --dry-run to actually remove them.`);
        } else {
            console.log(`\n📊 SUMMARY:`);
            console.log(`   ✅ Removed: ${totalRemoved} duplicate bridge(s)`);
            if (totalSkipped > 0) {
                console.log(`   ⚠️  Skipped: ${totalSkipped} bridge(s) (had related data)`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { findDuplicateBridges, removeDuplicateBridge };

