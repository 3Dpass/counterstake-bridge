"use strict";

/**
 * 3DPass Bridge Setup Script
 * 
 * This script dynamically discovers bridges and assistants from the 3DPass BridgesRegistry
 * contract and adds them to the watchdog bot's database. It uses an incremental approach
 * that only adds new bridges while preserving existing data (challenges, claims, transfers).
 * 
 * Features:
 * - Discovers bridges/assistants from registry contract
 * - Retrieves detailed bridge configuration from contracts
 * - Skips existing bridges to preserve historical data
 * - Supports both Import and Export bridge types
 * - Safe to run multiple times (idempotent)
 */

const fs = require("fs");
const { ethers } = require("ethers");
const conf = require('ocore/conf.js');
const desktopApp = require("ocore/desktop_app.js");
const db = require('ocore/db.js');
const db_import = require('./db_import.js');
const { getProvider } = require('./evm/provider.js');

// This will be populated dynamically from bridge contracts
let BRIDGE_INFO = {};

// Contract ABIs (using evm_substrate/build for 3DPass)
const BridgesRegistry = require('./evm_substrate/build/contracts/BridgesRegistry.json');
const ImportWrapperJson = require('./evm_substrate/build/contracts/ImportWrapper.json');
const ExportJson = require('./evm_substrate/build/contracts/Export.json');

async function init() {
    await db_import.initDB();
    console.log('Database initialized');
}

async function discoverBridgesFromRegistry() {
    console.log('Discovering bridges and assistants from registry...');
    
    const provider = getProvider('3DPass');
    const bridgesRegistryAddress = conf.threedpass_bridges_registry_addresses[conf.version];
    
    // Create registry contract instance
    const bridgesRegistry = new ethers.Contract(bridgesRegistryAddress, BridgesRegistry.abi, provider);
    
    // Get all bridges and assistants
    const allBridges = await bridgesRegistry.getAllBridges();
    const allAssistants = await bridgesRegistry.getAllAssistants();
    
    console.log(`Found ${allBridges.length} bridges in registry`);
    console.log(`Found ${allAssistants.length} assistants in registry`);
    
    const bridges = [];
    const assistants = [];
    
    // Discover all bridges
    for (let i = 0; i < allBridges.length; i++) {
        const bridgeAddress = allBridges[i];
        const bridgeInfo = await bridgesRegistry.getBridge(bridgeAddress);
        
        bridges.push({
            address: bridgeAddress,
            type: bridgeInfo.bridgeType === 0 ? 'Export' : 'Import',
            createdAt: new Date(bridgeInfo.createdAt * 1000)
        });
        
        console.log(`  Bridge ${i + 1}: ${bridgeAddress} (${bridgeInfo.bridgeType === 0 ? 'Export' : 'Import'})`);
    }
    
    // Discover all assistants
    for (let i = 0; i < allAssistants.length; i++) {
        const assistantAddress = allAssistants[i];
        const assistantInfo = await bridgesRegistry.getAssistant(assistantAddress);
        
        assistants.push({
            address: assistantAddress,
            type: assistantInfo.assistantType === 0 ? 'Import' : 'Export',
            createdAt: new Date(assistantInfo.createdAt * 1000)
        });
        
        console.log(`  Assistant ${i + 1}: ${assistantAddress} (${assistantInfo.assistantType === 0 ? 'Import' : 'Export'})`);
    }
    
    return { bridges, assistants };
}

async function getBridgeDetails(bridgeAddress, bridgeType) {
    console.log(`Retrieving detailed information for ${bridgeType} bridge: ${bridgeAddress}`);
    
    const provider = getProvider('3DPass');
    
    // Choose the correct ABI based on bridge type
    const bridgeAbi = bridgeType === 'Import' ? ImportWrapperJson.abi : ExportJson.abi;
    const bridge = new ethers.Contract(bridgeAddress, bridgeAbi, provider);
    
    let bridgeDetails = {
        address: bridgeAddress,
        type: bridgeType
    };
    
    try {
        if (bridgeType === 'Import') {
            // Import bridge specific calls
            const homeNetwork = await bridge.home_network();
            const homeAsset = await bridge.home_asset();
            const precompileAddress = await bridge.precompileAddress();
            const oracleAddr = await bridge.oracleAddress();
            const governanceAddr = await bridge.governance();
            
            // Get bridge settings
            const rawSettings = await bridge.settings();
            console.log(`  🔍 Raw settings from ImportWrapper contract:`, rawSettings);
            const settings = {};
            for (let key in rawSettings) {
                if (!key.match(/^\d+$/)) {
                    settings[key] = rawSettings[key];
                }
            }
            console.log(`  🔍 Processed settings:`, settings);
            console.log(`  🔍 settings.tokenAddress:`, settings.tokenAddress);
            
            bridgeDetails = {
                ...bridgeDetails,
                homeNetwork,
                homeAsset,
                foreignAsset: precompileAddress,
                stakeAsset: settings.tokenAddress,
                oracle: oracleAddr,
                governance: governanceAddr,
                ratio: settings.ratio100,
                counterstakeCoef: settings.counterstake_coef100,
                largeThreshold: settings.large_threshold,
                minStake: settings.min_stake
            };
            
            // Get token information for the precompile (foreign asset)
            let foreignTokenInfo = {};
            try {
                const erc20Abi = [
                    { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" }
                ];
                
                const precompileContract = new ethers.Contract(precompileAddress, erc20Abi, provider);
                foreignTokenInfo = {
                    name: await precompileContract.name(),
                    symbol: await precompileContract.symbol(),
                    decimals: await precompileContract.decimals()
                };
            } catch (err) {
                console.log(`  ⚠️  Could not retrieve precompile token info: ${err.message}`);
            }
            
            // Get stake token information (P3D)
            let stakeTokenInfo = {};
            try {
                const P3D_ABI = [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)", 
                    "function decimals() view returns (uint8)"
                ];
                
                const stakeTokenContract = new ethers.Contract(settings.tokenAddress, P3D_ABI, provider);
                stakeTokenInfo = {
                    name: await stakeTokenContract.name(),
                    symbol: await stakeTokenContract.symbol(),
                    decimals: await stakeTokenContract.decimals()
                };
            } catch (err) {
                console.log(`  ⚠️  Could not retrieve stake token info: ${err.message}`);
            }
            
            bridgeDetails.foreignToken = foreignTokenInfo;
            bridgeDetails.stakeToken = stakeTokenInfo;
            
            console.log(`  ✓ Import bridge details retrieved:`);
            console.log(`    Home Network: ${homeNetwork}`);
            console.log(`    Home Asset: ${homeAsset}`);
            console.log(`    Foreign Asset: ${precompileAddress} (${foreignTokenInfo.symbol || 'Unknown'})`);
            console.log(`    Stake Asset: ${settings.tokenAddress} (${stakeTokenInfo.symbol || 'Unknown'})`);
            
        } else if (bridgeType === 'Export') {
            // Export bridge specific calls
            const foreignNetwork = await bridge.foreign_network();
            const foreignAsset = await bridge.foreign_asset();
            const governanceAddr = await bridge.governance();
            
            // Get bridge settings
            const rawSettings = await bridge.settings();
            const settings = {};
            for (let key in rawSettings) {
                if (!key.match(/^\d+$/)) {
                    settings[key] = rawSettings[key];
                }
            }
            
            // For Export bridges, the home token is the tokenAddress from settings
            const homeToken = settings.tokenAddress;
            
            bridgeDetails = {
                ...bridgeDetails,
                homeNetwork: '3DPass',
                foreignNetwork,
                homeAsset: homeToken,
                foreignAsset,
                stakeAsset: settings.tokenAddress,
                governance: governanceAddr,
                ratio: settings.ratio100,
                counterstakeCoef: settings.counterstake_coef100,
                largeThreshold: settings.large_threshold,
                minStake: settings.min_stake
            };
            
            // Get token information for the home token (3DPass asset)
            let homeTokenInfo = {};
            try {
                const erc20Abi = [
                    { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" }
                ];
                
                const homeTokenContract = new ethers.Contract(homeToken, erc20Abi, provider);
                homeTokenInfo = {
                    name: await homeTokenContract.name(),
                    symbol: await homeTokenContract.symbol(),
                    decimals: await homeTokenContract.decimals()
                };
            } catch (err) {
                console.log(`  ⚠️  Could not retrieve home token info: ${err.message}`);
            }
            
            // Get stake token information (P3D)
            let stakeTokenInfo = {};
            try {
                const P3D_ABI = [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)", 
                    "function decimals() view returns (uint8)"
                ];
                
                const stakeTokenContract = new ethers.Contract(settings.tokenAddress, P3D_ABI, provider);
                stakeTokenInfo = {
                    name: await stakeTokenContract.name(),
                    symbol: await stakeTokenContract.symbol(),
                    decimals: await stakeTokenContract.decimals()
                };
            } catch (err) {
                console.log(`  ⚠️  Could not retrieve stake token info: ${err.message}`);
            }
            
            bridgeDetails.homeToken = homeTokenInfo;
            bridgeDetails.stakeToken = stakeTokenInfo;
            
            console.log(`  ✓ Export bridge details retrieved:`);
            console.log(`    Home Network: 3DPass`);
            console.log(`    Home Asset: ${homeToken} (${homeTokenInfo.symbol || 'Unknown'})`);
            console.log(`    Foreign Network: ${foreignNetwork}`);
            console.log(`    Foreign Asset: ${foreignAsset}`);
            console.log(`    Stake Asset: ${settings.tokenAddress} (${stakeTokenInfo.symbol || 'Unknown'})`);
        }
        
    } catch (err) {
        console.log(`  ❌ Error retrieving bridge details: ${err.message}`);
        throw err;
    }
    
    return bridgeDetails;
}

async function setupCorrect3DPassBridges(networkApi) {
    console.log('Setting up correct 3DPass bridges in database...');
    
    await init();
    
    // Helper function to get provider, preferring networkApi if available
    const getProviderSafe = (network) => {
        if (networkApi && networkApi[network]) {
            try {
                const provider = networkApi[network].getProvider();
                if (provider) {
                    console.log(`  ✓ Using existing provider from networkApi for ${network}`);
                    return provider;
                }
            } catch (e) {
                console.log(`  ⚠️  Could not get provider from networkApi for ${network}, using getProvider: ${e.message}`);
            }
        }
        return getProvider(network);
    };
    
    // Discover bridges and assistants from registry
    const { bridges, assistants } = await discoverBridgesFromRegistry();
    
    // Check existing bridges in database (include both '3DPass' and '3dpass' for compatibility)
    const existingBridges = await db.query("SELECT * FROM bridges WHERE home_network='3DPass' OR foreign_network='3DPass' OR home_network='3dpass' OR foreign_network='3dpass'");
    console.log(`Found ${existingBridges.length} existing 3DPass bridges in database`);
    
    // Create a map of existing bridge addresses for quick lookup
    const existingBridgeAddresses = new Set();
    for (const bridge of existingBridges) {
        if (bridge.import_aa) existingBridgeAddresses.add(bridge.import_aa);
        if (bridge.export_aa) existingBridgeAddresses.add(bridge.export_aa);
    }
    
    console.log('Existing bridge addresses:', Array.from(existingBridgeAddresses));
    
    console.log('Setting up bridges discovered from registry...');
    
    // Process discovered bridges
    let newBridgesAdded = 0;
    let existingBridgesSkipped = 0;
    
    for (const bridge of bridges) {
        // Check if this bridge already exists in the database by address
        if (existingBridgeAddresses.has(bridge.address)) {
            console.log(`🔄 Updating existing ${bridge.type} bridge (by address): ${bridge.address}`);
        } else {
            console.log(`Setting up new ${bridge.type} bridge: ${bridge.address}`);
        }
        
        // Get detailed bridge information from the contract
        const bridgeDetails = await getBridgeDetails(bridge.address, bridge.type);
        
        // Check if this bridge already exists in the database by address
        let existingBridgeByAddress = null;
        if (existingBridgeAddresses.has(bridge.address)) {
            existingBridgeByAddress = existingBridges.find(existing => 
                existing.import_aa === bridge.address || existing.export_aa === bridge.address
            );
        }
        
        // Check if a bridge with the same foreign_asset already exists (for both Import and Export)
        let existingBridgeByAssets = null;
        if (bridge.type === 'Import') {
            // For Import bridges: check if any bridge with the same foreign_asset already exists
            existingBridgeByAssets = existingBridges.find(existing => 
                existing.foreign_asset === bridgeDetails.foreignAsset
            );
        } else if (bridge.type === 'Export') {
            // For Export bridges: check if any bridge with the same foreign_asset already exists
            // This ensures we match the bridge that already has the correct foreign_asset
            // (e.g., bridge 21 which was created from the Import side)
            existingBridgeByAssets = existingBridges.find(existing => 
                existing.foreign_asset === bridgeDetails.foreignAsset
            );
        }
        
        // Find all assistants of the corresponding type
        const matchingAssistants = assistants.filter(a => a.type === bridge.type);
        
        // Check if the bot is the manager of any of the assistants
        let assistantAddress = null;
        let selectedAssistant = null;
        
        // Store assistants that belong to this bridge but don't have a bridge record yet
        const assistantsForNewBridge = [];
        
        for (const assistant of matchingAssistants) {
                try {
                    // Get the assistant's manager address directly from the assistant contract
                    const provider = getProviderSafe('3DPass');
                    
                    // Use the correct ABI based on assistant type
                    const AssistantAbi = assistant.type === 'Import' 
                        ? require('./evm_substrate/build/contracts/ImportWrapperAssistant.json').abi
                        : require('./evm_substrate/build/contracts/ExportAssistant.json').abi;
                    
                    const assistantContract = new ethers.Contract(assistant.address, AssistantAbi, provider);
                    
                    // Get the bridge address this assistant belongs to - this is the key matching criterion
                    const assistantBridgeAddress = await assistantContract.bridgeAddress();
                    const managerAddress = await assistantContract.managerAddress();
                    const assistantSymbol = await assistantContract.symbol();
                    
                    console.log(`  📋 Assistant found: ${assistant.address}`);
                    console.log(`    Bridge Address (from assistant): ${assistantBridgeAddress}`);
                    console.log(`    Current Bridge Address: ${bridge.address}`);
                    console.log(`    Manager: ${managerAddress}`);
                    console.log(`    Symbol: ${assistantSymbol}`);
                    
                    // Only attach this assistant if it belongs to the current bridge
                    if (assistantBridgeAddress.toLowerCase() !== bridge.address.toLowerCase()) {
                        console.log(`    ⏭️  Skipping assistant ${assistant.address} - belongs to bridge ${assistantBridgeAddress}, not ${bridge.address}`);
                        continue;
                    }
                    
                    // Find the correct bridge record to attach this assistant to
                    // First try by exact bridge address match, then by foreign_asset match
                    let bridgeToUpdate = existingBridgeByAddress;
                    if (!bridgeToUpdate) {
                        // For Export assistants: find bridge where export_aa matches
                        // For Import assistants: find bridge where import_aa matches
                        if (bridge.type === 'Export') {
                            bridgeToUpdate = existingBridges.find(existing => 
                                existing.export_aa && existing.export_aa.toLowerCase() === bridge.address.toLowerCase()
                            );
                        } else {
                            bridgeToUpdate = existingBridges.find(existing => 
                                existing.import_aa && existing.import_aa.toLowerCase() === bridge.address.toLowerCase()
                            );
                        }
                    }
                    
                    // If still not found, try matching by foreign_asset (for cases where bridge exists but not yet in DB)
                    if (!bridgeToUpdate) {
                        bridgeToUpdate = existingBridgeByAssets;
                    }
                    
                    // The logic here ensures assistants to match the correct bridge each by checking:
                    // assistant.bridgeAddress() === bridge.address
                    //
                    // There are TWO separate table updates here:
                    // 1. pooled_assistants table: ALL assistants are added here for monitoring purposes,
                    //    regardless of who the manager is. This is the primary fix.
                    // 2. bridges table: Only updated if the bot is the manager of the assistant.
                    //    This sets the primary assistant for the bridge (import_assistant_aa/export_assistant_aa).
                    
                    // Add assistant to pooled_assistants table for monitoring (regardless of manager)
                    try {
                        if (bridgeToUpdate) {
                            const bridgeId = bridgeToUpdate.bridge_id;
                            const bridgeAa = bridge.address;
                            const network = '3DPass';
                            const side = bridge.type.toLowerCase(); // 'import' or 'export'
                            const sharesAsset = assistant.address; // For 3DPass, shares_asset is the assistant address itself
                            const sharesSymbol = assistantSymbol; // Use the actual symbol from the assistant contract
                            const version = conf.version;
                            
                            console.log(`    📝 Adding/updating assistant in pooled_assistants table: ${assistant.address}`);
                            await db.query(`INSERT OR REPLACE INTO pooled_assistants (assistant_aa, bridge_id, bridge_aa, network, side, manager, shares_asset, shares_symbol, \`version\`) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                                [assistant.address, bridgeId, bridgeAa, network, side, managerAddress, sharesAsset, sharesSymbol, version]);
                            console.log(`    ✅ Assistant added/updated in pooled_assistants table`);
                        
                        // Separately: Update bridges table ONLY if bot is the manager (sets primary assistant)
                        // This is a different concern from pooled_assistants - it's about which assistant
                        // the bot manages for this bridge.
                        try {
                            // Get bot's address from the same mnemonic used by the EVM chains
                            const fs = require("fs");
                            const desktopApp = require("ocore/desktop_app.js");
                            const { ethers } = require("ethers");
                            const botWallet = ethers.Wallet.fromMnemonic(JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase);
                            const botAddress = botWallet.address;
                            
                            if (botAddress && managerAddress.toLowerCase() === botAddress.toLowerCase()) {
                                console.log(`    🤖 Bot is the manager of assistant ${assistant.address}, updating bridges table`);
                                
                                // Set the assistantAddress for the bridge update later
                                assistantAddress = assistant.address;
                                selectedAssistant = assistant;
                                
                                // Update the bridges table with the assistant address
                                if (side === 'import') {
                                    const updateResult = await db.query(`UPDATE bridges SET import_assistant_aa = ?, ia_v = ? WHERE bridge_id = ?`, 
                                        [assistant.address, version, bridgeId]);
                                    console.log(`    ✅ Updated bridges table: import_assistant_aa = ${assistant.address}`);
                                    console.log(`    📊 Update result:`, updateResult);
                                    
                                    // Verify the update worked
                                    const verifyResult = await db.query(`SELECT import_assistant_aa FROM bridges WHERE bridge_id = ?`, [bridgeId]);
                                    console.log(`    🔍 Verification: import_assistant_aa = ${verifyResult[0].import_assistant_aa}`);
                                } else if (side === 'export') {
                                    const updateResult = await db.query(`UPDATE bridges SET export_assistant_aa = ?, ea_v = ? WHERE bridge_id = ?`, 
                                        [assistant.address, version, bridgeId]);
                                    console.log(`    ✅ Updated bridges table: export_assistant_aa = ${assistant.address}`);
                                    console.log(`    📊 Update result:`, updateResult);
                                    
                                    // Verify the update worked
                                    const verifyResult = await db.query(`SELECT export_assistant_aa FROM bridges WHERE bridge_id = ?`, [bridgeId]);
                                    console.log(`    🔍 Verification: export_assistant_aa = ${verifyResult[0].export_assistant_aa}`);
                                }
                            } else {
                                console.log(`    ℹ️  Bot is not the manager of assistant ${assistant.address} (manager: ${managerAddress}, bot: ${botAddress})`);
                            }
                        } catch (bridgeUpdateErr) {
                            console.log(`    ⚠️  Could not update bridges table: ${bridgeUpdateErr.message}`);
                        }
                        } else {
                            // Bridge doesn't exist yet - store assistant info to add after bridge creation
                            console.log(`    📦 Storing assistant ${assistant.address} to add after bridge creation`);
                            assistantsForNewBridge.push({
                                address: assistant.address,
                                managerAddress: managerAddress,
                                symbol: assistantSymbol
                            });
                        }
                    } catch (pooledErr) {
                        console.log(`    ⚠️  Could not add assistant to pooled_assistants table: ${pooledErr.message}`);
                    }
                
            } catch (err) {
                console.log(`  ⚠️  Could not process assistant: ${err.message}`);
            }
        }
        
        // Use existingBridgeByAddress if bridge exists by address, otherwise use existingBridgeByAssets
        const bridgeToUpdate = existingBridgeByAddress || existingBridgeByAssets;
        
        if (bridgeToUpdate) {
            console.log(`🔄 Updating existing ${bridge.type} bridge: ${bridge.address}`);
            console.log(`    Existing bridge: ${bridgeToUpdate.bridge_id} (${bridgeToUpdate.home_network} ${bridgeToUpdate.home_symbol} -> ${bridgeToUpdate.foreign_network} ${bridgeToUpdate.foreign_symbol})`);
            
            // Update the existing bridge with the registry information
            if (bridge.type === 'Import') {
                // Fetch the actual symbol for the external asset (e.g., USDT on Ethereum)
                let homeSymbol = 'Unknown';
                try {
                    console.log(`  🔍 Fetching symbol for ${bridgeDetails.homeAsset} on ${bridgeDetails.homeNetwork}`);
                    const externalProvider = getProviderSafe(bridgeDetails.homeNetwork);
                    console.log(`  🔍 Provider obtained for ${bridgeDetails.homeNetwork}`);
                    const { ethers } = require("ethers");
                    const erc20Abi = [
                        { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
                    ];
                    const externalTokenContract = new ethers.Contract(bridgeDetails.homeAsset, erc20Abi, externalProvider);
                    homeSymbol = await externalTokenContract.symbol();
                    console.log(`  ✓ Fetched external token symbol: ${homeSymbol}`);
                } catch (err) {
                    console.log(`  ⚠️  Could not fetch external token symbol: ${err.message}`);
                    console.log(`  🔍 Error details:`, err);
                }
                
                // Validate that foreign token decimals are available
                if (bridgeDetails.foreignToken.decimals === null || bridgeDetails.foreignToken.decimals === undefined) {
                    throw new Error(`Cannot update bridge ${bridgeToUpdate.bridge_id}: foreign token decimals not available for ${bridgeDetails.foreignAsset}. Please ensure the token contract is accessible and returns decimals.`);
                }
                
                await db.query(`
                    UPDATE bridges SET 
                        import_aa = ?, 
                        import_assistant_aa = ?,
                        home_network = ?,
                        home_asset = ?,
                        home_asset_decimals = ?,
                        home_symbol = ?,
                        foreign_network = ?,
                        foreign_asset = ?,
                        foreign_asset_decimals = ?,
                        foreign_symbol = ?,
                        stake_asset = ?
                    WHERE bridge_id = ?
                `, [
                    bridge.address,
                    assistantAddress,
                    bridgeDetails.homeNetwork,
                    bridgeDetails.homeAsset,
                    6, // Default decimals for external assets
                    homeSymbol, // Correct external token symbol
                    '3DPass',
                    bridgeDetails.foreignAsset,
                    bridgeDetails.foreignToken.decimals,
                    bridgeDetails.foreignToken.symbol || 'Unknown',
                    bridgeDetails.stakeAsset,
                    bridgeToUpdate.bridge_id
                ]);
            } else if (bridge.type === 'Export') {
                // Fetch the actual symbol for the external asset (e.g., USDT on Ethereum)
                let foreignSymbol = 'Unknown';
                try {
                    console.log(`  🔍 Fetching symbol for ${bridgeDetails.foreignAsset} on ${bridgeDetails.foreignNetwork}`);
                    const externalProvider = getProviderSafe(bridgeDetails.foreignNetwork);
                    console.log(`  🔍 Provider obtained for ${bridgeDetails.foreignNetwork}`);
                    const { ethers } = require("ethers");
                    const erc20Abi = [
                        { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
                    ];
                    const externalTokenContract = new ethers.Contract(bridgeDetails.foreignAsset, erc20Abi, externalProvider);
                    foreignSymbol = await externalTokenContract.symbol();
                    console.log(`  ✓ Fetched external token symbol: ${foreignSymbol}`);
                } catch (err) {
                    console.log(`  ⚠️  Could not fetch external token symbol: ${err.message}`);
                    console.log(`  🔍 Error details:`, err);
                }
                
                // Fetch foreign token decimals from contract
                let foreignTokenDecimals = null;
                try {
                    console.log(`  🔍 Fetching decimals for ${bridgeDetails.foreignAsset} on ${bridgeDetails.foreignNetwork}`);
                    const externalProvider = getProviderSafe(bridgeDetails.foreignNetwork);
                    const { ethers } = require("ethers");
                    const erc20Abi = [
                        { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" }
                    ];
                    const foreignTokenContract = new ethers.Contract(bridgeDetails.foreignAsset, erc20Abi, externalProvider);
                    foreignTokenDecimals = await foreignTokenContract.decimals();
                    console.log(`  ✓ Fetched foreign token decimals: ${foreignTokenDecimals}`);
                } catch (err) {
                    console.log(`  ⚠️  Could not fetch foreign token decimals: ${err.message}`);
                }
                
                // Validate that foreign token decimals are available
                if (foreignTokenDecimals === null || foreignTokenDecimals === undefined) {
                    throw new Error(`Cannot update bridge ${bridgeToUpdate.bridge_id}: foreign token decimals not available for ${bridgeDetails.foreignAsset}. Please ensure the token contract is accessible and returns decimals.`);
                }
                
                await db.query(`
                    UPDATE bridges SET 
                        export_aa = ?, 
                        export_assistant_aa = ?,
                        home_network = ?,
                        home_asset = ?,
                        home_asset_decimals = ?,
                        home_symbol = ?,
                        foreign_network = ?,
                        foreign_asset = ?,
                        foreign_asset_decimals = ?,
                        foreign_symbol = ?,
                        stake_asset = ?
                    WHERE bridge_id = ?
                `, [
                    bridge.address,
                    assistantAddress,
                    '3DPass',
                    bridgeDetails.homeAsset,
                    bridgeDetails.homeToken.decimals || 18,
                    bridgeDetails.homeToken.symbol || 'Unknown',
                    bridgeDetails.foreignNetwork,
                    bridgeDetails.foreignAsset,
                    foreignTokenDecimals,
                    foreignSymbol, // Correct external token symbol
                    bridgeDetails.stakeAsset,
                    bridgeToUpdate.bridge_id
                ]);
            }
            
            console.log(`  ✅ Updated existing bridge ${bridgeToUpdate.bridge_id} with registry information`);
            
            // Register contracts for updated bridge
            try {
                if (bridgeToUpdate.import_aa && networkApi[bridgeToUpdate.foreign_network]) {
                    console.log(`  📝 Registering import_aa ${bridgeToUpdate.import_aa} on ${bridgeToUpdate.foreign_network}`);
                    networkApi[bridgeToUpdate.foreign_network].startWatchingImportAA(bridgeToUpdate.import_aa);
                }
                if (bridgeToUpdate.export_aa && networkApi[bridgeToUpdate.home_network]) {
                    console.log(`  📝 Registering export_aa ${bridgeToUpdate.export_aa} on ${bridgeToUpdate.home_network}`);
                    networkApi[bridgeToUpdate.home_network].startWatchingExportAA(bridgeToUpdate.export_aa);
                }
            } catch (err) {
                console.log(`  ⚠️  Error registering contracts for updated bridge ${bridgeToUpdate.bridge_id}: ${err.message}`);
            }
            
            existingBridgesSkipped++;
            continue;
        }
        
        // Store bridge info for later use
        BRIDGE_INFO[bridge.address] = bridgeDetails;
        
        if (bridge.type === 'Import') {
            // Import bridge: External -> 3DPass
            // For Import bridges: home_network is external (Ethereum), foreign_network is 3DPass
            // We need to fetch the actual symbol for the external asset (home_asset)
            let homeSymbol = 'Unknown';
            try {
                // Fetch the actual symbol for the external asset (e.g., USDT on Ethereum)
                console.log(`  🔍 Fetching symbol for ${bridgeDetails.homeAsset} on ${bridgeDetails.homeNetwork}`);
                const externalProvider = getProviderSafe(bridgeDetails.homeNetwork);
                console.log(`  🔍 Provider obtained for ${bridgeDetails.homeNetwork}`);
                const { ethers } = require("ethers");
                const erc20Abi = [
                    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
                ];
                const externalTokenContract = new ethers.Contract(bridgeDetails.homeAsset, erc20Abi, externalProvider);
                homeSymbol = await externalTokenContract.symbol();
                console.log(`  ✓ Fetched external token symbol: ${homeSymbol}`);
            } catch (err) {
                console.log(`  ⚠️  Could not fetch external token symbol: ${err.message}`);
                console.log(`  🔍 Error details:`, err);
            }
            
            // Validate that foreign token decimals are available
            if (bridgeDetails.foreignToken.decimals === null || bridgeDetails.foreignToken.decimals === undefined) {
                throw new Error(`Cannot create bridge: foreign token decimals not available for ${bridgeDetails.foreignAsset}. Please ensure the token contract is accessible and returns decimals.`);
            }
            
    const insertResult = await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
                bridgeDetails.homeNetwork, 
                bridgeDetails.homeAsset, 
                6, // Default decimals for external assets
                homeSymbol, // Correct external token symbol
        null, null, // Export AA will be created later
                '3DPass', 
                bridgeDetails.foreignAsset, 
                bridgeDetails.foreignToken.decimals, 
                bridgeDetails.foreignToken.symbol || 'Unknown', // 3DPass precompile symbol
                bridgeDetails.stakeAsset, 
                bridge.address, 
                assistantAddress
            ]);
            
            // Get the bridge_id of the newly created bridge
            const newBridgeRecord = await db.query(`SELECT bridge_id FROM bridges WHERE import_aa = ?`, [bridge.address]);
            const newBridgeId = newBridgeRecord[0].bridge_id;
            
            // Add all assistants that belong to this bridge to pooled_assistants
            for (const assistantInfo of assistantsForNewBridge) {
                try {
                    const network = '3DPass';
                    const side = bridge.type.toLowerCase(); // 'import' or 'export'
                    const sharesAsset = assistantInfo.address; // For 3DPass, shares_asset is the assistant address itself
                    const sharesSymbol = assistantInfo.symbol;
                    const version = conf.version;
                    
                    console.log(`    📝 Adding assistant ${assistantInfo.address} to pooled_assistants for new bridge ${newBridgeId}`);
                    await db.query(`INSERT OR REPLACE INTO pooled_assistants (assistant_aa, bridge_id, bridge_aa, network, side, manager, shares_asset, shares_symbol, \`version\`) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                        [assistantInfo.address, newBridgeId, bridge.address, network, side, assistantInfo.managerAddress, sharesAsset, sharesSymbol, version]);
                    console.log(`    ✅ Assistant added to pooled_assistants table`);
                } catch (err) {
                    console.log(`    ⚠️  Could not add assistant ${assistantInfo.address} to pooled_assistants: ${err.message}`);
                }
            }
            
            console.log(`  ✓ New Import bridge ${bridge.address} added with dynamic configuration`);
            
            // Register contracts for new Import bridge
            // Import bridge: home_network is external (e.g., BSC), foreign_network is 3DPass
            // import_aa is on 3DPass (foreign_network)
            try {
                if (bridge.address && networkApi['3DPass']) {
                    console.log(`  📝 Registering import_aa ${bridge.address} on 3DPass`);
                    networkApi['3DPass'].startWatchingImportAA(bridge.address);
                }
                // Also check if there's an export_aa on the home_network (external network)
                // This would be set when the bridge is completed from the other side
                const updatedBridge = await db.query(`SELECT * FROM bridges WHERE bridge_id = ?`, [newBridgeId]);
                if (updatedBridge[0] && updatedBridge[0].export_aa && networkApi[bridgeDetails.homeNetwork]) {
                    console.log(`  📝 Registering export_aa ${updatedBridge[0].export_aa} on ${bridgeDetails.homeNetwork}`);
                    networkApi[bridgeDetails.homeNetwork].startWatchingExportAA(updatedBridge[0].export_aa);
                }
            } catch (err) {
                console.log(`  ⚠️  Error registering contracts for new Import bridge: ${err.message}`);
            }
            
            newBridgesAdded++;
            
        } else if (bridge.type === 'Export') {
            // Export bridge: 3DPass -> External
            // For Export bridges: home_network is 3DPass, foreign_network is external (Ethereum)
            // We need to fetch the actual symbol for the external asset (foreign_asset)
            let foreignSymbol = 'Unknown';
            try {
                // Fetch the actual symbol for the external asset (e.g., USDT on Ethereum)
                const externalProvider = getProviderSafe(bridgeDetails.foreignNetwork);
                const { ethers } = require("ethers");
                const erc20Abi = [
                    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
                ];
                const externalTokenContract = new ethers.Contract(bridgeDetails.foreignAsset, erc20Abi, externalProvider);
                foreignSymbol = await externalTokenContract.symbol();
                console.log(`  ✓ Fetched external token symbol: ${foreignSymbol}`);
            } catch (err) {
                console.log(`  ⚠️  Could not fetch external token symbol: ${err.message}`);
            }
            
    const insertResult = await db.query(`
        INSERT INTO bridges (
            home_network, home_asset, home_asset_decimals, home_symbol,
            export_aa, export_assistant_aa,
            foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
            stake_asset, import_aa, import_assistant_aa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
                '3DPass', 
                bridgeDetails.homeAsset, 
                bridgeDetails.homeToken.decimals || 18, 
                bridgeDetails.homeToken.symbol || 'Unknown', // 3DPass token symbol
                bridge.address, 
                assistantAddress,
                bridgeDetails.foreignNetwork, 
                bridgeDetails.foreignAsset, 
                6, // USDT decimals
                foreignSymbol, // Correct external token symbol
                bridgeDetails.stakeAsset, 
                null, null // Import AA will be created later
            ]);
            
            // Get the bridge_id of the newly created bridge
            const newBridgeRecord = await db.query(`SELECT bridge_id FROM bridges WHERE export_aa = ?`, [bridge.address]);
            const newBridgeId = newBridgeRecord[0].bridge_id;
            
            // Add all assistants that belong to this bridge to pooled_assistants
            for (const assistantInfo of assistantsForNewBridge) {
                try {
                    const network = '3DPass';
                    const side = bridge.type.toLowerCase(); // 'import' or 'export'
                    const sharesAsset = assistantInfo.address; // For 3DPass, shares_asset is the assistant address itself
                    const sharesSymbol = assistantInfo.symbol;
                    const version = conf.version;
                    
                    console.log(`    📝 Adding assistant ${assistantInfo.address} to pooled_assistants for new bridge ${newBridgeId}`);
                    await db.query(`INSERT OR REPLACE INTO pooled_assistants (assistant_aa, bridge_id, bridge_aa, network, side, manager, shares_asset, shares_symbol, \`version\`) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                        [assistantInfo.address, newBridgeId, bridge.address, network, side, assistantInfo.managerAddress, sharesAsset, sharesSymbol, version]);
                    console.log(`    ✅ Assistant added to pooled_assistants table`);
                } catch (err) {
                    console.log(`    ⚠️  Could not add assistant ${assistantInfo.address} to pooled_assistants: ${err.message}`);
                }
            }
            
            console.log(`  ✓ New Export bridge ${bridge.address} added with dynamic configuration`);
            
            // Register contracts for new Export bridge
            // Export bridge: home_network is 3DPass, foreign_network is external (e.g., BSC)
            // export_aa is on 3DPass (home_network)
            try {
                if (bridge.address && networkApi['3DPass']) {
                    console.log(`  📝 Registering export_aa ${bridge.address} on 3DPass`);
                    networkApi['3DPass'].startWatchingExportAA(bridge.address);
                }
                // Also check if there's an import_aa on the foreign_network (external network)
                // This would be set when the bridge is completed from the other side
                const updatedBridge = await db.query(`SELECT * FROM bridges WHERE bridge_id = ?`, [newBridgeId]);
                if (updatedBridge[0] && updatedBridge[0].import_aa && networkApi[bridgeDetails.foreignNetwork]) {
                    console.log(`  📝 Registering import_aa ${updatedBridge[0].import_aa} on ${bridgeDetails.foreignNetwork}`);
                    networkApi[bridgeDetails.foreignNetwork].startWatchingImportAA(updatedBridge[0].import_aa);
                }
            } catch (err) {
                console.log(`  ⚠️  Error registering contracts for new Export bridge: ${err.message}`);
            }
            
            newBridgesAdded++;
        }
    }
    
    console.log(`\n📊 Bridge Processing Summary:`);
    console.log(`  ✓ New bridges added: ${newBridgesAdded}`);
    console.log(`  ⏭️  Existing bridges skipped: ${existingBridgesSkipped}`);
    console.log(`  📋 Total bridges discovered: ${bridges.length}`);
    
    // Verify final state
    const dbBridges = await db.query("SELECT * FROM bridges WHERE home_network='3DPass' OR foreign_network='3DPass'");
    console.log(`\n✓ Total 3DPass bridges in database: ${dbBridges.length}`);
    
    console.log('\n--- Bridge Configuration Summary ---');
    console.log('CounterstakeFactory:', conf.threedpass_factory_contract_addresses[conf.version]);
    console.log('AssistantFactory:', conf.threedpass_assistant_factory_contract_addresses[conf.version]);
    console.log('Oracle:', conf.threedpass_oracle_addresses['3DPass']);
    
    console.log('\n--- Discovered Bridges from Registry ---');
    for (const bridge of bridges) {
        console.log(`${bridge.type} Bridge: ${bridge.address} (Created: ${bridge.createdAt.toISOString()})`);
    }
    
    console.log('\n--- Discovered Assistants from Registry ---');
    for (const assistant of assistants) {
        console.log(`${assistant.type} Assistant: ${assistant.address} (Created: ${assistant.createdAt.toISOString()})`);
    }
    
    console.log('\n--- Dynamic Bridge Information ---');
    for (const [bridgeAddress, bridgeInfo] of Object.entries(BRIDGE_INFO)) {
        console.log(`\nBridge: ${bridgeAddress}`);
        console.log(`  Home Network: ${bridgeInfo.homeNetwork}`);
        console.log(`  Home Asset: ${bridgeInfo.homeAsset}`);
        console.log(`  Foreign Asset: ${bridgeInfo.foreignAsset} (${bridgeInfo.foreignToken.symbol})`);
        console.log(`  Stake Asset: ${bridgeInfo.stakeAsset} (${bridgeInfo.stakeToken.symbol})`);
        console.log(`  Oracle: ${bridgeInfo.oracle}`);
        console.log(`  Governance: ${bridgeInfo.governance}`);
        console.log(`  Ratio: ${bridgeInfo.ratio}/100`);
        console.log(`  Counterstake Coef: ${bridgeInfo.counterstakeCoef}/100`);
        console.log(`  Large Threshold: ${ethers.utils.formatEther(bridgeInfo.largeThreshold)} tokens`);
    }
    
    console.log('\n--- Database Bridges ---');
    for (let bridge of dbBridges) {
        console.log(`Bridge ${bridge.bridge_id}: ${bridge.home_network} ${bridge.home_symbol} -> ${bridge.foreign_network} ${bridge.foreign_symbol}`);
    }
    
    // Final pass: Register all contracts for all 3DPass bridges to ensure nothing is missed
    // This handles cases where bridges were updated or where both sides exist
    console.log('\n📝 Final pass: Registering all contracts for 3DPass bridges...');
    for (let bridge of dbBridges) {
        try {
            // Register import_aa on foreign_network if it exists
            if (bridge.import_aa && networkApi[bridge.foreign_network]) {
                console.log(`  📝 Registering import_aa ${bridge.import_aa} on ${bridge.foreign_network} for bridge ${bridge.bridge_id}`);
                networkApi[bridge.foreign_network].startWatchingImportAA(bridge.import_aa);
            }
            // Register export_aa on home_network if it exists
            if (bridge.export_aa && networkApi[bridge.home_network]) {
                console.log(`  📝 Registering export_aa ${bridge.export_aa} on ${bridge.home_network} for bridge ${bridge.bridge_id}`);
                networkApi[bridge.home_network].startWatchingExportAA(bridge.export_aa);
            }
        } catch (err) {
            console.log(`  ⚠️  Error registering contracts for bridge ${bridge.bridge_id}: ${err.message}`);
        }
    }
    
    console.log('\n✓ 3DPass bridges setup completed! The bot can now monitor the discovered bridges.');
}

/**
 * Validate and fix decimals for all existing bridges in the database
 * This ensures that stored decimals match the actual token contract values
 */
async function validateAndFixBridgeDecimals(networkApi) {
    console.log('\n🔍 Validating and fixing bridge decimals...');
    
    await init();
    
    // Helper function to get provider, preferring networkApi if available
    const getProviderSafe = (network) => {
        if (networkApi && networkApi[network]) {
            try {
                const provider = networkApi[network].getProvider();
                if (provider) {
                    return provider;
                }
            } catch (e) {
                // Fall back to getProvider
            }
        }
        return getProvider(network);
    };
    
    // Get all bridges from database
    const allBridges = await db.query("SELECT * FROM bridges WHERE import_aa IS NOT NULL AND export_aa IS NOT NULL");
    console.log(`Found ${allBridges.length} complete bridges to validate`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const bridge of allBridges) {
        try {
            const { bridge_id, home_network, home_asset, foreign_network, foreign_asset, 
                    home_asset_decimals, foreign_asset_decimals } = bridge;
            
            let needsUpdate = false;
            const updates = {};
            
            // Validate home asset decimals
            if (home_asset && home_asset !== '0x0000000000000000000000000000000000000000' && networkApi[home_network]) {
                try {
                    const actualDecimals = await networkApi[home_network].getDecimals(home_asset);
                    if (actualDecimals !== null && actualDecimals !== undefined) {
                        if (home_asset_decimals !== actualDecimals) {
                            console.log(`  ⚠️  Bridge ${bridge_id}: home_asset_decimals mismatch (DB: ${home_asset_decimals}, Contract: ${actualDecimals})`);
                            updates.home_asset_decimals = actualDecimals;
                            needsUpdate = true;
                        }
                    }
                } catch (e) {
                    console.log(`  ⚠️  Bridge ${bridge_id}: Could not fetch home asset decimals: ${e.message}`);
                }
            }
            
            // Validate foreign asset decimals
            if (foreign_asset && foreign_asset !== '0x0000000000000000000000000000000000000000' && networkApi[foreign_network]) {
                try {
                    const actualDecimals = await networkApi[foreign_network].getDecimals(foreign_asset);
                    if (actualDecimals !== null && actualDecimals !== undefined) {
                        if (foreign_asset_decimals !== actualDecimals) {
                            console.log(`  ⚠️  Bridge ${bridge_id}: foreign_asset_decimals mismatch (DB: ${foreign_asset_decimals}, Contract: ${actualDecimals})`);
                            updates.foreign_asset_decimals = actualDecimals;
                            needsUpdate = true;
                        }
                    }
                } catch (e) {
                    console.log(`  ⚠️  Bridge ${bridge_id}: Could not fetch foreign asset decimals: ${e.message}`);
                }
            }
            
            // Update database if needed
            if (needsUpdate) {
                const setClauses = [];
                const values = [];
                
                if (updates.home_asset_decimals !== undefined) {
                    setClauses.push('home_asset_decimals = ?');
                    values.push(updates.home_asset_decimals);
                }
                
                if (updates.foreign_asset_decimals !== undefined) {
                    setClauses.push('foreign_asset_decimals = ?');
                    values.push(updates.foreign_asset_decimals);
                }
                
                values.push(bridge_id);
                
                await db.query(
                    `UPDATE bridges SET ${setClauses.join(', ')} WHERE bridge_id = ?`,
                    values
                );
                
                console.log(`  ✅ Fixed bridge ${bridge_id} decimals`);
                fixedCount++;
            }
        } catch (err) {
            console.error(`  ❌ Error validating bridge ${bridge.bridge_id}: ${err.message}`);
            errorCount++;
        }
    }
    
    console.log(`\n✓ Decimals validation completed: ${fixedCount} bridges fixed, ${errorCount} errors`);
    return { fixedCount, errorCount };
}

// Export functions for use by other modules
module.exports = {
	discoverBridgesFromRegistry,
	getBridgeDetails,
	setupCorrect3DPassBridges,
	validateAndFixBridgeDecimals
};

// Run the setup only if this script is executed directly
if (require.main === module) {
	setupCorrect3DPassBridges().catch(console.error);
} 