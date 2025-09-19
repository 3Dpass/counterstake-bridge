"use strict";

/**
 * Print Current Bridges from Database
 * 
 * This script displays all bridges currently configured in the database
 * with detailed information about each bridge's components.
 */

const db_import = require('./db_import.js');
const db = require('ocore/db.js');

async function init() {
    await db_import.initDB();
    console.log('Database initialized');
}

async function printBridges() {
    console.log('🔍 Loading bridges from database...\n');
    
    await init();
    
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
            import_assistant_aa,
            export_assistant_aa,
            creation_date,
            e_v,
            i_v,
            ea_v,
            ia_v
        FROM bridges 
        ORDER BY bridge_id
    `);
    
    // Get all pooled assistants
    const assistants = await db.query(`
        SELECT 
            assistant_aa,
            bridge_id,
            bridge_aa,
            network,
            side,
            manager,
            shares_asset,
            shares_symbol,
            version
        FROM pooled_assistants 
        ORDER BY bridge_id, side
    `);
    
    if (bridges.length === 0) {
        console.log('❌ No bridges found in database');
        return;
    }
    
    console.log(`📊 Found ${bridges.length} bridge(s) in database:\n`);
    
    // Print each bridge
    bridges.forEach((bridge, index) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🌉 BRIDGE #${bridge.bridge_id} (${index + 1}/${bridges.length})`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        console.log(`📋 BASIC INFO:`);
        console.log(`   Bridge ID: ${bridge.bridge_id}`);
        console.log(`   Created: ${bridge.creation_date}`);
        console.log(`   Versions: Export=${bridge.e_v}, Import=${bridge.i_v}, ExportAssistant=${bridge.ea_v}, ImportAssistant=${bridge.ia_v}`);
        
        console.log(`\n🏠 HOME NETWORK (${bridge.home_network}):`);
        console.log(`   Asset: ${bridge.home_asset}`);
        console.log(`   Symbol: ${bridge.home_symbol}`);
        console.log(`   Decimals: ${bridge.home_asset_decimals}`);
        
        console.log(`\n🌍 FOREIGN NETWORK (${bridge.foreign_network}):`);
        console.log(`   Asset: ${bridge.foreign_asset}`);
        console.log(`   Symbol: ${bridge.foreign_symbol}`);
        console.log(`   Decimals: ${bridge.foreign_asset_decimals}`);
        
        console.log(`\n💰 STAKE ASSET:`);
        console.log(`   Address: ${bridge.stake_asset || 'Not set'}`);
        
        console.log(`\n📥 IMPORT BRIDGE (${bridge.home_network} → ${bridge.foreign_network}):`);
        if (bridge.import_aa) {
            console.log(`   ✅ Import AA: ${bridge.import_aa}`);
            console.log(`   ✅ Import Assistant: ${bridge.import_assistant_aa || 'Not set'}`);
        } else {
            console.log(`   ❌ Import AA: Not configured`);
            console.log(`   ❌ Import Assistant: Not configured`);
        }
        
        console.log(`\n📤 EXPORT BRIDGE (${bridge.foreign_network} → ${bridge.home_network}):`);
        if (bridge.export_aa) {
            console.log(`   ✅ Export AA: ${bridge.export_aa}`);
            console.log(`   ✅ Export Assistant: ${bridge.export_assistant_aa || 'Not set'}`);
        } else {
            console.log(`   ❌ Export AA: Not configured`);
            console.log(`   ❌ Export Assistant: Not configured`);
        }
        
        // Show pooled assistants for this bridge
        const bridgeAssistants = assistants.filter(a => a.bridge_id === bridge.bridge_id);
        if (bridgeAssistants.length > 0) {
            console.log(`\n🤖 POOLED ASSISTANTS (${bridgeAssistants.length}):`);
            bridgeAssistants.forEach(assistant => {
                const isActive = (assistant.side === 'import' && assistant.assistant_aa === bridge.import_assistant_aa) ||
                                (assistant.side === 'export' && assistant.assistant_aa === bridge.export_assistant_aa);
                const status = isActive ? '✅ ACTIVE' : '📋 POOLED';
                console.log(`   ${status} ${assistant.side.toUpperCase()} Assistant: ${assistant.assistant_aa}`);
                console.log(`      Manager: ${assistant.manager}`);
                console.log(`      Shares: ${assistant.shares_symbol} (${assistant.shares_asset})`);
                console.log(`      Version: ${assistant.version}`);
                console.log(`      Network: ${assistant.network}`);
            });
        } else {
            console.log(`\n🤖 POOLED ASSISTANTS: None`);
        }
        
        // Determine bridge status
        const hasImport = !!bridge.import_aa;
        const hasExport = !!bridge.export_aa;
        
        console.log(`\n🎯 BRIDGE STATUS:`);
        if (hasImport && hasExport) {
            console.log(`   ✅ FULLY OPERATIONAL - Bidirectional bridge`);
            console.log(`   🔄 ${bridge.home_network} ↔ ${bridge.foreign_network}`);
        } else if (hasImport) {
            console.log(`   ⚠️  IMPORT ONLY - ${bridge.home_network} → ${bridge.foreign_network}`);
        } else if (hasExport) {
            console.log(`   ⚠️  EXPORT ONLY - ${bridge.foreign_network} → ${bridge.home_network}`);
        } else {
            console.log(`   ❌ NOT CONFIGURED - No bridge components set up`);
        }
        
        console.log('');
    });
    
    // Summary
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 BRIDGE SUMMARY`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const fullyOperational = bridges.filter(b => b.import_aa && b.export_aa).length;
    const importOnly = bridges.filter(b => b.import_aa && !b.export_aa).length;
    const exportOnly = bridges.filter(b => !b.import_aa && b.export_aa).length;
    const notConfigured = bridges.filter(b => !b.import_aa && !b.export_aa).length;
    
    console.log(`Total Bridges: ${bridges.length}`);
    console.log(`✅ Fully Operational: ${fullyOperational}`);
    console.log(`⚠️  Import Only: ${importOnly}`);
    console.log(`⚠️  Export Only: ${exportOnly}`);
    console.log(`❌ Not Configured: ${notConfigured}`);
    
    // Network breakdown
    const networks = {};
    bridges.forEach(bridge => {
        networks[bridge.home_network] = (networks[bridge.home_network] || 0) + 1;
        networks[bridge.foreign_network] = (networks[bridge.foreign_network] || 0) + 1;
    });
    
    console.log(`\n🌐 Networks Involved:`);
    Object.entries(networks).forEach(([network, count]) => {
        console.log(`   ${network}: ${count} bridge(s)`);
    });
    
    // Pooled assistants summary
    console.log(`\n🤖 POOLED ASSISTANTS SUMMARY:`);
    console.log(`Total Assistants: ${assistants.length}`);
    
    if (assistants.length > 0) {
        const activeAssistants = assistants.filter(a => {
            const bridge = bridges.find(b => b.bridge_id === a.bridge_id);
            return (a.side === 'import' && a.assistant_aa === bridge?.import_assistant_aa) ||
                   (a.side === 'export' && a.assistant_aa === bridge?.export_assistant_aa);
        });
        const pooledAssistants = assistants.length - activeAssistants.length;
        
        console.log(`✅ Active Assistants: ${activeAssistants.length}`);
        console.log(`📋 Pooled Assistants: ${pooledAssistants.length}`);
        
        // Network breakdown for assistants
        const assistantNetworks = {};
        assistants.forEach(assistant => {
            assistantNetworks[assistant.network] = (assistantNetworks[assistant.network] || 0) + 1;
        });
        
        console.log(`\n🌐 Assistant Networks:`);
        Object.entries(assistantNetworks).forEach(([network, count]) => {
            console.log(`   ${network}: ${count} assistant(s)`);
        });
        
        // Side breakdown
        const importAssistants = assistants.filter(a => a.side === 'import').length;
        const exportAssistants = assistants.filter(a => a.side === 'export').length;
        console.log(`\n📊 Assistant Sides:`);
        console.log(`   Import: ${importAssistants}`);
        console.log(`   Export: ${exportAssistants}`);
    } else {
        console.log(`No assistants found in database`);
    }
    
    console.log(`\n🎉 Bridge database inspection complete!`);
}

printBridges().catch(console.error);
