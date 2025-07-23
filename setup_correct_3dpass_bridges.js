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

// 3DPass deployed contract addresses (from your deployment)
const DEPLOYED_CONTRACTS = {
    // Factory contracts
    CounterstakeFactory: '0x943e8fcbA7C432D0C1adf61dC43C33273111e168',
    AssistantFactory: '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0',
    Oracle: '0xAc647d0caB27e912C844F27716154f54EDD519cE',
    P3DPrecompile: '0x0000000000000000000000000000000000000802',
    
    // Bridge contracts (from your deployment)
    Export3DPass: '0x2CA310AF11b7923D1a65240B317551a264C8AA2C',
    
    // NEWLY CREATED Import bridges from bridge-setup-and-test copy.js
    ImportUsdt3DPass: '0xe8E8eAb629d7e324cB97381f70E2FcD869fb6DdE',
    ImportUsdc3DPass: '0xAB5EA2f8AaF0981AE8Dd73f08bb2b8CF7d29efB8',
    ImportBusd3DPass: '0xdf9A824C19D67D465a32f505eB1b2578AFd6f5BE'
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
        console.log(`Found ${existingBridges.length} existing 3DPass bridges. Removing them...`);
        await db.query("DELETE FROM bridges WHERE home_network='3DPass' OR foreign_network='3DPass'");
        console.log('  ✓ Existing 3DPass bridges removed');
    }
    
    console.log('Setting up bridges from bridge-setup-and-test copy.js...');
    
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
        TOKEN_ADDRESSES.usdtEthAddress, DEPLOYED_CONTRACTS.ImportUsdt3DPass, null
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
        TOKEN_ADDRESSES.usdcEthAddress, DEPLOYED_CONTRACTS.ImportUsdc3DPass, null
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
        TOKEN_ADDRESSES.busdBscAddress, DEPLOYED_CONTRACTS.ImportBusd3DPass, null
    ]);
    console.log('  ✓ BUSD on BSC -> wBUSD on 3DPass bridge added');
    
    // Verify bridges were added
    const bridges = await db.query("SELECT * FROM bridges WHERE home_network='3DPass' OR foreign_network='3DPass'");
    console.log(`\n✓ Successfully added ${bridges.length} bridges to database`);
    
    console.log('\n--- Bridge Configuration Summary ---');
    console.log('CounterstakeFactory:', DEPLOYED_CONTRACTS.CounterstakeFactory);
    console.log('AssistantFactory:', DEPLOYED_CONTRACTS.AssistantFactory);
    console.log('Oracle:', DEPLOYED_CONTRACTS.Oracle);
    console.log('P3D Precompile:', DEPLOYED_CONTRACTS.P3DPrecompile);
    console.log('Export3DPass:', DEPLOYED_CONTRACTS.Export3DPass);
    
    console.log('\n--- NEWLY CREATED Import Bridges ---');
    console.log('ImportUsdt3DPass:', DEPLOYED_CONTRACTS.ImportUsdt3DPass);
    console.log('ImportUsdc3DPass:', DEPLOYED_CONTRACTS.ImportUsdc3DPass);
    console.log('ImportBusd3DPass:', DEPLOYED_CONTRACTS.ImportBusd3DPass);
    
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
    
    console.log('\n✓ Correct 3DPass bridges setup completed! The bot can now monitor these bridges.');
}

// Run the setup
setupCorrect3DPassBridges().catch(console.error); 