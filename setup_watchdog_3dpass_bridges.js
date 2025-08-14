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

// 3DPass deployed contract addresses (from bridge-setup-test.log)
const DEPLOYED_CONTRACTS = {
    // Factory contracts
    CounterstakeFactory: '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0',
    AssistantFactory: '0x5b74685B32cdaA74a030DA14F15F56CcfB5cA1Bc',
    Oracle: '0xAc647d0caB27e912C844F27716154f54EDD519cE',
    P3DPrecompile: '0x0000000000000000000000000000000000000802',
    
    // Import bridges (External -> 3DPass)
    ImportUsdt3DPass: '0x6359F737F32BFd1862FfAfd9C2F888DfAdC8B7CF',
    ImportUsdc3DPass: '0x14982dc69e62508b3e4848129a55d6B1960b4Db0',
    ImportBusd3DPass: '0xAd913348E7B63f44185D5f6BACBD18d7189B2F1B',
    
    // Export bridges (3DPass -> External)
    ExportP3d3DPass: '0x626D4E8c191c36B5937fD73A2A1B774C2361EA80',
    ExportFire3DPass: '0xFaF7C72bE647BC86106993E861C48b6c24a3cAd6',
    ExportWater3DPass: '0xeaeF21F2C0bcE1487Eaf9622b91600155B181a4b',
    
    // Assistant contracts
    AssistantUsdtImport: '0x0FAF9b7Cf0e62c6889486cE906d05A7a813a7cc5',
    AssistantUsdcImport: '0xdf8D6962ADC7f29b6F9272376fE51D55B76B0fc5',
    AssistantBusdImport: '0xA32ea7688b2937eeaf3f74804fbAFB70D0fc4FE3',
    AssistantP3dExport: '0x747B60493839a26E20d191F6dC960C8C79C159AE',
    AssistantFireExport: '0x8893d06fDfBd4B5696407413840bC2F333b33ca8',
    AssistantWaterExport: '0x18d62db034579BCAcfB1e527647658f1AbAD0536'
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
    
    console.log('Setting up bridges from bridge-setup-test.log...');
    
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
    
    // Bridge 4: P3D on 3DPass -> wP3D on Ethereum
    console.log('Setting up P3D on 3DPass -> wP3D on Ethereum bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        '3DPass', DEPLOYED_CONTRACTS.P3DPrecompile, 18, 'P3D',
        DEPLOYED_CONTRACTS.ExportP3d3DPass, DEPLOYED_CONTRACTS.AssistantP3dExport,
        'Ethereum', '0x742d35Cc6634C0532925a3b8D9a4F8A6c4f0E4A7', 18, 'wP3D',
        DEPLOYED_CONTRACTS.P3DPrecompile, null, null
    ]);
    console.log('  ✓ P3D on 3DPass -> wP3D on Ethereum bridge added');
    
    // Bridge 5: FIRE on 3DPass -> wFIRE on Ethereum
    console.log('Setting up FIRE on 3DPass -> wFIRE on Ethereum bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        '3DPass', '0xFbfBFBfA000000000000000000000000000001bC', 18, 'FIRE',
        DEPLOYED_CONTRACTS.ExportFire3DPass, DEPLOYED_CONTRACTS.AssistantFireExport,
        'Ethereum', '0x8F9B2e7D4A3C1F5E6B8A9D2C4E7F1A3B5C8D9E0F', 18, 'wFIRE',
        '0xFbfBFBfA000000000000000000000000000001bC', null, null
    ]);
    console.log('  ✓ FIRE on 3DPass -> wFIRE on Ethereum bridge added');
    
    // Bridge 6: WATER on 3DPass -> wWATER on Ethereum
    console.log('Setting up WATER on 3DPass -> wWATER on Ethereum bridge...');
    await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        '3DPass', '0xfBFBFBfa0000000000000000000000000000022b', 18, 'WATER',
        DEPLOYED_CONTRACTS.ExportWater3DPass, DEPLOYED_CONTRACTS.AssistantWaterExport,
        'Ethereum', '0x1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B', 18, 'wWATER',
        '0xfBFBFBfa0000000000000000000000000000022b', null, null
    ]);
    console.log('  ✓ WATER on 3DPass -> wWATER on Ethereum bridge added');
    
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
    console.log('ExportP3d3DPass:', DEPLOYED_CONTRACTS.ExportP3d3DPass);
    console.log('ExportFire3DPass:', DEPLOYED_CONTRACTS.ExportFire3DPass);
    console.log('ExportWater3DPass:', DEPLOYED_CONTRACTS.ExportWater3DPass);
    
    console.log('\n--- Import Assistants ---');
    console.log('AssistantUsdtImport:', DEPLOYED_CONTRACTS.AssistantUsdtImport);
    console.log('AssistantUsdcImport:', DEPLOYED_CONTRACTS.AssistantUsdcImport);
    console.log('AssistantBusdImport:', DEPLOYED_CONTRACTS.AssistantBusdImport);
    
    console.log('\n--- Export Assistants ---');
    console.log('AssistantP3dExport:', DEPLOYED_CONTRACTS.AssistantP3dExport);
    console.log('AssistantFireExport:', DEPLOYED_CONTRACTS.AssistantFireExport);
    console.log('AssistantWaterExport:', DEPLOYED_CONTRACTS.AssistantWaterExport);
    
    console.log('\n--- Token Addresses ---');
    console.log('USDT (Ethereum):', TOKEN_ADDRESSES.usdtEthAddress);
    console.log('USDC (Ethereum):', TOKEN_ADDRESSES.usdcEthAddress);
    console.log('BUSD (BSC):', TOKEN_ADDRESSES.busdBscAddress);
    console.log('wUSDT (3DPass):', TOKEN_ADDRESSES.wUsdt3DPassAddress);
    console.log('wUSDC (3DPass):', TOKEN_ADDRESSES.wUsdc3DPassAddress);
    console.log('wBUSD (3DPass):', TOKEN_ADDRESSES.wBusd3DPassAddress);
    console.log('P3D (3DPass):', DEPLOYED_CONTRACTS.P3DPrecompile);
    console.log('FIRE (3DPass):', '0xFbfBFBfA000000000000000000000000000001bC');
    console.log('WATER (3DPass):', '0xfBFBFBfa0000000000000000000000000000022b');
    
    console.log('\n--- Database Bridges ---');
    for (let bridge of bridges) {
        console.log(`Bridge ${bridge.bridge_id}: ${bridge.home_network} ${bridge.home_symbol} -> ${bridge.foreign_network} ${bridge.foreign_symbol}`);
    }
    
    console.log('\n✓ 3DPass bridges setup completed! The bot can now monitor these bridges.');
}

// Run the setup
setupCorrect3DPassBridges().catch(console.error); 