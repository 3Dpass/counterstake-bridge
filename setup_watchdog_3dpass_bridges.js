"use strict";
const fs = require("fs");
const conf = require('ocore/conf.js');
const desktopApp = require("ocore/desktop_app.js");
const db = require('ocore/db.js');
const db_import = require('./db_import.js');

// Token addresses from bridge-setup-and-test copy.js
const TOKEN_ADDRESSES = {
    // Ethereum token addresses
    usdtEthAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT on Ethereum
    usdcEthAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum (mainnet)
    
    // BSC token addresses
    busdBscAddress: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD on BSC
    
    // 3DPass wrapped token addresses
    wUsdt3DPassAddress: "0xfBFBfbFA000000000000000000000000000000de", // wUSDT on 3DPass
    wUsdc3DPassAddress: "0xFbfbFBfA0000000000000000000000000000006f", // wUSDC on 3DPass
    wBusd3DPassAddress: "0xFbFBFBfA0000000000000000000000000000014D", // wBUSD on 3DPass
};

// 3DPass deployed contract addresses (from bridge-setup-test copy.log)
const DEPLOYED_CONTRACTS = {
    // Factory contracts
    CounterstakeFactory: '0x7C7AFc2871E65B031F7834c4b6198Bf978c49Cc5',
    AssistantFactory: '0x9B8D4F4a3cB8BCb8Cd4BEB0486D982F903Cb7761',
    Oracle: '0xAc647d0caB27e912C844F27716154f54EDD519cE',
    P3DPrecompile: '0x0000000000000000000000000000000000000802',
    
    // Import bridges (External -> 3DPass)
    ImportUsdt3DPass: '0xC6adD082A27eB0147497e128DbB0545430518656',
    ImportUsdc3DPass: '0xcA0919befAb1Eab41Ace96aaf128471ad3CBc1E5',
    ImportBusd3DPass: '0xA77a6A3E10551493d3A413f675b5CF8A51aD499d',
    
    // Export bridges (3DPass -> External)
    ExportWusdt3DPass: '0x1d7067acaC09C5fD08c5E1AA7443d845305dEf7e',
    ExportWusdc3DPass: '0x629bF26eA38C0FbA89559BBa0a53370Fa3D58ed0',
    ExportWbusd3DPass: '0xa5F10CE5Fe2520171A368bCd9F43AF017De7C177',
    
    // Assistant contracts
    AssistantUsdtImport: '0xeD90443311331A397dFa0C2C57Cf344003781DEA',
    AssistantUsdcImport: '0x748c69Ae51a6CFb9949E8F4E1400Ac9FF119B3AD',
    AssistantBusdImport: '0x47bA3127Cf700A5120F10166436a5DE61174632C',
    AssistantWusdtExport: '0x426D6672Fc2ec96113fB7bB520afc23bC9660D59',
    AssistantWusdcExport: '0x48fEF1bCbb9b962A9970Fe6FB5d908c96A428F26',
    AssistantWbusdExport: '0xA03aDFe015a163CCEca196d07a78248044607992'
};

async function init() {
    await db_import.initDB();
    console.log('Database initialized');
}

async function setupCorrect3DPassBridges() {
    console.log('Setting up correct 3DPass bridges in database...');
    
    await init();
    
    // Check if bridges already exist
    const existingBridges = await db.query("SELECT * FROM bridges WHERE home_network='3DPass' OR foreign_network='3DPass'");
    
    if (existingBridges.length > 0) {
        console.log(`Found ${existingBridges.length} existing 3DPass bridges. Removing them and related data...`);
        
        // Get bridge IDs to delete
        const bridgeIds = existingBridges.map(bridge => bridge.bridge_id);
        console.log('Bridge IDs to remove:', bridgeIds);
        
        // Delete related records first (in order of foreign key dependencies)
        console.log('  Removing related records...');
        
        // Delete challenges first (references claims)
        await db.query("DELETE FROM challenges WHERE bridge_id IN (?)", [bridgeIds]);
        console.log('    ✓ Challenges removed');
        
        // Delete claims (references transfers and bridges)
        await db.query("DELETE FROM claims WHERE bridge_id IN (?)", [bridgeIds]);
        console.log('    ✓ Claims removed');
        
        // Delete transfers (references bridges)
        await db.query("DELETE FROM transfers WHERE bridge_id IN (?)", [bridgeIds]);
        console.log('    ✓ Transfers removed');
        
        // Delete pooled assistants (references bridges)
        await db.query("DELETE FROM pooled_assistants WHERE bridge_id IN (?)", [bridgeIds]);
        console.log('    ✓ Pooled assistants removed');
        
        // Finally delete the bridges
        await db.query("DELETE FROM bridges WHERE bridge_id IN (?)", [bridgeIds]);
        console.log('    ✓ Bridges removed');
        
        console.log('  ✓ All existing 3DPass bridges and related data removed');
    }
    
    console.log('Setting up bridges from bridge-setup-test copy.log...');
    
    // Import Bridges (External -> 3DPass)
    
    // Bridge 1: USDT on Ethereum -> wUSDT on 3DPass
    console.log('Setting up USDT on Ethereum -> wUSDT on 3DPass bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        'Ethereum', TOKEN_ADDRESSES.usdtEthAddress, 6, 'USDT',
        null, null, // Export AA will be created later
        '3DPass', TOKEN_ADDRESSES.wUsdt3DPassAddress, 6, 'wUSDT',
        DEPLOYED_CONTRACTS.P3DPrecompile, DEPLOYED_CONTRACTS.ImportUsdt3DPass, DEPLOYED_CONTRACTS.AssistantUsdtImport
    ]);
    console.log('  ✓ USDT on Ethereum -> wUSDT on 3DPass bridge added');
    
    // Bridge 2: USDC on Ethereum -> wUSDC on 3DPass
    console.log('Setting up USDC on Ethereum -> wUSDC on 3DPass bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        'Ethereum', TOKEN_ADDRESSES.usdcEthAddress, 6, 'USDC',
        null, null, // Export AA will be created later
        '3DPass', TOKEN_ADDRESSES.wUsdc3DPassAddress, 6, 'wUSDC',
        DEPLOYED_CONTRACTS.P3DPrecompile, DEPLOYED_CONTRACTS.ImportUsdc3DPass, DEPLOYED_CONTRACTS.AssistantUsdcImport
    ]);
    console.log('  ✓ USDC on Ethereum -> wUSDC on 3DPass bridge added');
    
    // Bridge 3: BUSD on BSC -> wBUSD on 3DPass
    console.log('Setting up BUSD on BSC -> wBUSD on 3DPass bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        'BSC', TOKEN_ADDRESSES.busdBscAddress, 18, 'BUSD',
        null, null, // Export AA will be created later
        '3DPass', TOKEN_ADDRESSES.wBusd3DPassAddress, 18, 'wBUSD',
        DEPLOYED_CONTRACTS.P3DPrecompile, DEPLOYED_CONTRACTS.ImportBusd3DPass, DEPLOYED_CONTRACTS.AssistantBusdImport
    ]);
    console.log('  ✓ BUSD on BSC -> wBUSD on 3DPass bridge added');
    
    // Export Bridges (3DPass -> External)
    
    // Bridge 4: wUSDT on 3DPass -> USDT on Ethereum
    console.log('Setting up wUSDT on 3DPass -> USDT on Ethereum bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        '3DPass', TOKEN_ADDRESSES.wUsdt3DPassAddress, 6, 'wUSDT',
        DEPLOYED_CONTRACTS.ExportWusdt3DPass, DEPLOYED_CONTRACTS.AssistantWusdtExport,
        'Ethereum', TOKEN_ADDRESSES.usdtEthAddress, 6, 'USDT',
        DEPLOYED_CONTRACTS.P3DPrecompile, null, null
    ]);
    console.log('  ✓ wUSDT on 3DPass -> USDT on Ethereum bridge added');
    
    // Bridge 5: wUSDC on 3DPass -> USDC on Ethereum
    console.log('Setting up wUSDC on 3DPass -> USDC on Ethereum bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        '3DPass', TOKEN_ADDRESSES.wUsdc3DPassAddress, 6, 'wUSDC',
        DEPLOYED_CONTRACTS.ExportWusdc3DPass, DEPLOYED_CONTRACTS.AssistantWusdcExport,
        'Ethereum', TOKEN_ADDRESSES.usdcEthAddress, 6, 'USDC',
        DEPLOYED_CONTRACTS.P3DPrecompile, null, null
    ]);
    console.log('  ✓ wUSDC on 3DPass -> USDC on Ethereum bridge added');
    
    // Bridge 6: wBUSD on 3DPass -> BUSD on BSC
    console.log('Setting up wBUSD on 3DPass -> BUSD on BSC bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        '3DPass', TOKEN_ADDRESSES.wBusd3DPassAddress, 18, 'wBUSD',
        DEPLOYED_CONTRACTS.ExportWbusd3DPass, DEPLOYED_CONTRACTS.AssistantWbusdExport,
        'BSC', TOKEN_ADDRESSES.busdBscAddress, 18, 'BUSD',
        DEPLOYED_CONTRACTS.P3DPrecompile, null, null
    ]);
    console.log('  ✓ wBUSD on 3DPass -> BUSD on BSC bridge added');
    
    // Verify bridges were added
    const bridges = await db.query("SELECT * FROM bridges WHERE home_network='3DPass' OR foreign_network='3DPass'");
    console.log(`\n✓ Successfully added ${bridges.length} bridges to database`);
    
    console.log('\n--- Bridge Configuration Summary ---');
    console.log('CounterstakeFactory:', DEPLOYED_CONTRACTS.CounterstakeFactory);
    console.log('AssistantFactory:', DEPLOYED_CONTRACTS.AssistantFactory);
    console.log('Oracle:', DEPLOYED_CONTRACTS.Oracle);
    console.log('P3D Precompile:', DEPLOYED_CONTRACTS.P3DPrecompile);
    
    console.log('\n--- Import Bridges (External -> 3DPass) ---');
    console.log('ImportUsdt3DPass:', DEPLOYED_CONTRACTS.ImportUsdt3DPass);
    console.log('ImportUsdc3DPass:', DEPLOYED_CONTRACTS.ImportUsdc3DPass);
    console.log('ImportBusd3DPass:', DEPLOYED_CONTRACTS.ImportBusd3DPass);
    
    console.log('\n--- Export Bridges (3DPass -> External) ---');
    console.log('ExportWusdt3DPass:', DEPLOYED_CONTRACTS.ExportWusdt3DPass);
    console.log('ExportWusdc3DPass:', DEPLOYED_CONTRACTS.ExportWusdc3DPass);
    console.log('ExportWbusd3DPass:', DEPLOYED_CONTRACTS.ExportWbusd3DPass);
    
    console.log('\n--- Import Assistants ---');
    console.log('AssistantUsdtImport:', DEPLOYED_CONTRACTS.AssistantUsdtImport);
    console.log('AssistantUsdcImport:', DEPLOYED_CONTRACTS.AssistantUsdcImport);
    console.log('AssistantBusdImport:', DEPLOYED_CONTRACTS.AssistantBusdImport);
    
    console.log('\n--- Export Assistants ---');
    console.log('AssistantWusdtExport:', DEPLOYED_CONTRACTS.AssistantWusdtExport);
    console.log('AssistantWusdcExport:', DEPLOYED_CONTRACTS.AssistantWusdcExport);
    console.log('AssistantWbusdExport:', DEPLOYED_CONTRACTS.AssistantWbusdExport);
    
    console.log('\n--- Token Addresses ---');
    console.log('USDT (Ethereum):', TOKEN_ADDRESSES.usdtEthAddress);
    console.log('USDC (Ethereum):', TOKEN_ADDRESSES.usdcEthAddress);
    console.log('BUSD (BSC):', TOKEN_ADDRESSES.busdBscAddress);
    console.log('wUSDT (3DPass):', TOKEN_ADDRESSES.wUsdt3DPassAddress);
    console.log('wUSDC (3DPass):', TOKEN_ADDRESSES.wUsdc3DPassAddress);
    console.log('wBUSD (3DPass):', TOKEN_ADDRESSES.wBusd3DPassAddress);
    
    console.log('\n--- Database Bridges ---');
    for (let bridge of bridges) {
        console.log(`Bridge ${bridge.bridge_id}: ${bridge.home_network} ${bridge.home_symbol} -> ${bridge.foreign_network} ${bridge.foreign_symbol}`);
    }
    
    console.log('\n✓ 3DPass bridges setup completed! The bot can now monitor these bridges.');
}

// Run the setup
setupCorrect3DPassBridges().catch(console.error); 