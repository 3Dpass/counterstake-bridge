const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');
const desktopApp = require('ocore/desktop_app.js');

// Import contract ABIs and bytecodes from Truffle build artifacts
const CounterstakeFactory = require('../../counterstake-bridge/evm/build/contracts/CounterstakeFactory.json');
const AssistantFactory = require('../../counterstake-bridge/evm/build/contracts/AssistantFactory.json');
const Oracle = require('../../counterstake-bridge/evm/build/contracts/Oracle.json');
const Export = require('../../counterstake-bridge/evm/build/contracts/Export.json');
const Import = require('../../counterstake-bridge/evm/build/contracts/Import.json');
const ExportAssistant = require('../../counterstake-bridge/evm/build/contracts/ExportAssistant.json');
const ImportAssistant = require('../../counterstake-bridge/evm/build/contracts/ImportAssistant.json');
const Governance = require('../../counterstake-bridge/evm/build/contracts/Governance.json');
const GovernanceFactory = require('../../counterstake-bridge/evm/build/contracts/GovernanceFactory.json');
const VotedValueUint = require('../../counterstake-bridge/evm/build/contracts/VotedValueUint.json');
const VotedValueUintArray = require('../../counterstake-bridge/evm/build/contracts/VotedValueUintArray.json');
const VotedValueAddress = require('../../counterstake-bridge/evm/build/contracts/VotedValueAddress.json');
const VotedValueFactory = require('../../counterstake-bridge/evm/build/contracts/VotedValueFactory.json');
const CounterstakeLibrary = require('../../counterstake-bridge/evm/build/contracts/CounterstakeLibrary.json');

// Load test configuration
const testConfig = require(path.join(__dirname, '..', 'bridge-test-config.json'));

const RPC_URL = process.env.RPC_URL || 'http://localhost:9978';
const confPath = path.join(__dirname, '..', '..', 'counterstake-bridge', 'conf.js');

// P3D precompile address constant
const P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802';

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
    console.log(`${color}%s${colors.reset}`, message);
}

// Validate P3D precompile address
function validateP3DPrecompileAddress(address) {
    if (address !== P3D_PRECOMPILE_ADDRESS) {
        throw new Error(`Invalid P3D precompile address. Expected: ${P3D_PRECOMPILE_ADDRESS}, Got: ${address}`);
    }
    log(`✓ P3D precompile address validation passed: ${address}`, colors.green);
}

// Validate token address for 3DPass deployment
function validateTokenAddressFor3DPass(address, context) {
    if (address === ethers.constants.AddressZero) {
        log(`⚠️  Warning: Using AddressZero (${address}) for ${context} - this may not work correctly on 3DPass`, colors.yellow);
        return false;
    }
    if (address === P3D_PRECOMPILE_ADDRESS) {
        log(`✓ Using P3D precompile address (${address}) for ${context}`, colors.green);
        return true;
    }
    log(`✓ Using ERC20 token address (${address}) for ${context}`, colors.cyan);
    return true;
}

async function deployContract(contractJson, signer, ...args) {
    // Validate P3D precompile address if it's used in constructor arguments
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === 'string' && args[i].toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
            validateP3DPrecompileAddress(args[i]);
        }
    }
    
    const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, signer);
    log(`Deploying ${contractJson.contractName}...`);
    const contract = await factory.deploy(...args);
    await contract.deployed();
    log(`  ${colors.green}✓ Deployed ${contractJson.contractName} to: ${contract.address}${colors.reset}`);
    return contract;
}

function link(contractJson, libName, libAddress) {
    const symbol = "__" + libName + "_".repeat(40 - libName.length - 2);
    const re = new RegExp(symbol, 'g');
    libAddress = libAddress.toLowerCase().replace(/^0x/, '');
    contractJson.bytecode = contractJson.bytecode.replace(re, libAddress);
    contractJson.deployedBytecode = contractJson.deployedBytecode.replace(re, libAddress);
}

async function updateConfJs(newConfig) {
    let confContent = '';
    try {
        confContent = await fs.readFile(confPath, 'utf8');
        log(`Loaded existing conf.js from ${confPath}`);
    } catch (e) {
        log(`No existing conf.js found at ${confPath}, creating a new one.`);
        confContent = `/*jslint node: true */
"use strict";

exports.bServeAsHub = false;
exports.bLight = true;
exports.storage = 'sqlite';
exports.hub = 'localhost:6611';
exports.deviceName = '3DPass bridge watchdog';
exports.permanent_pairing_secret = '*';
exports.control_addresses = ['DEVICE ALLOWED TO CHAT'];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';
exports.bSingleAddress = true;
exports.bWantNewPeers = true;
exports.KEYS_FILENAME = 'keys.json';
exports.bNoPassphrase = true;
exports.explicitStart = true;
exports.MAX_UNSPENT_OUTPUTS = 10;
exports.CONSOLIDATION_INTERVAL = 12 * 3600 * 1000;
exports.max_ts_error = 60;
exports.version = 'v1.0';
exports.evm_min_transfer_age = 0.5 * 60;
exports.evm_count_blocks_for_finality = 1;
exports.evm_required_gas = 420e3 + 70e3;
exports.evm_required_gas_with_pooled_assistant = 440e3 + 70e3;
exports.max_exposure = 0.5;
exports.recheck_timeout = 15 * 60 * 1000;
exports.bWatchdog = true;
exports.bClaimForOthers = true;
exports.bUseOwnFunds = true;
exports.bAttack = true;
exports.min_reward_ratio = 0.005;
exports.webPort = 7001;

console.log('finished watchdog conf');
`;
    }

    // Add 3DPass configuration section
    const threedpassConfig = `
// 3DPass Network Configuration
exports.threedpass_factory_contract_addresses = {
    'v1.0': '${newConfig.counterstakeFactory}'
};
exports.threedpass_assistant_factory_contract_addresses = {
    'v1.0': '${newConfig.assistantFactory}'
};
exports.threedpass_oracle_addresses = {
    '3DPass': '${newConfig.oracle}'
};
`;

    // Add P3D precompile address to conf.js
    if (!confContent.includes('p3d_precompile_address')) {
        confContent += `\n// 3DPass specific: P3D precompile address\nexports.p3d_precompile_address = '${P3D_PRECOMPILE_ADDRESS}';\n`;
        log(`Added P3D precompile address to conf.js: ${P3D_PRECOMPILE_ADDRESS}`, colors.cyan);
    }

    // Insert the 3DPass config before the console.log line
    const updatedContent = confContent.replace(
        'console.log(\'finished watchdog conf\');',
        threedpassConfig + '\nconsole.log(\'finished watchdog conf\');'
    );

    await fs.writeFile(confPath, updatedContent);
    log(`${colors.green}✓ Successfully updated ${confPath}${colors.reset}`);
}

async function main() {
    log('--- Starting Counterstake Core Infrastructure Deployment with P3D Support ---', colors.cyan);
    
    // Validate P3D precompile address at the start
    validateP3DPrecompileAddress(P3D_PRECOMPILE_ADDRESS);

    try {
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        // Use the correct path for the private key
        const privateKey = testConfig.development.accounts.account1.privateKey;
        if (!privateKey) {
            throw new Error('Private key for account1 not found in bridge-test-config.json');
        }
        let signer; // Make signer accessible in catch block
        signer = new ethers.Wallet(privateKey, provider);
        log(`Deploying using account: ${signer.address}`);

        // 1. Deploy CounterstakeLibrary
        log('Deploying CounterstakeLibrary...');
        const csLib = await deployContract(CounterstakeLibrary, signer);

        // 2. Link CounterstakeLibrary into Export, Import, ExportAssistant
        link(Export, 'CounterstakeLibrary', csLib.address);
        link(Import, 'CounterstakeLibrary', csLib.address);
        link(ExportAssistant, 'CounterstakeLibrary', csLib.address);

        // 3. Deploy Oracle first (needed for Import)
        log('Deploying Oracle...');
        const oracle = await deployContract(Oracle, signer);

        // Set a test price in the Oracle for USDT (Ethereum) vs _NATIVE_
        const usdtEthAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        log(`Setting test price in Oracle for (USDT: ${usdtEthAddress}, _NATIVE_)...`);
        try {
            const tx = await oracle.connect(signer).setPrice(usdtEthAddress, "_NATIVE_", 1, 1);
            await tx.wait();
            log('  ✓ Test price set in Oracle for USDT');
        } catch (err) {
            log('  ✗ Failed to set test price in Oracle for USDT', err);
            throw err;
        }

        // Set a test price in the Oracle for wUSDT (3DPass) vs _NATIVE_
        log('Setting test price in Oracle for (wUSDT, _NATIVE_)...');
        try {
            const tx2 = await oracle.connect(signer).setPrice("wUSDT", "_NATIVE_", 1, 1);
            await tx2.wait();
            log('  ✓ Test price set in Oracle for wUSDT');
        } catch (err) {
            log('  ✗ Failed to set test price in Oracle for wUSDT', err);
            throw err;
        }

        // Set P3D prices in oracle
        log('Setting P3D prices in Oracle...');
        try {
            await oracle.connect(signer).setPrice(usdtEthAddress, "P3D", 1, 1); // USDT vs P3D
            await oracle.connect(signer).setPrice("wUSDT", "P3D", 1, 1);       // wUSDT vs P3D
            log('  ✓ P3D prices set in Oracle');
        } catch (err) {
            log('  ✗ Failed to set P3D prices in Oracle', err);
            throw err;
        }

        // 4. Deploy VotedValue contracts (following official procedure)
        log('Deploying VotedValue contracts...');
        const votedValueUint = await deployContract(VotedValueUint, signer);
        const votedValueUintArray = await deployContract(VotedValueUintArray, signer);
        const votedValueAddress = await deployContract(VotedValueAddress, signer);
        const votedValueFactory = await deployContract(VotedValueFactory, signer, 
            votedValueUint.address, 
            votedValueUintArray.address, 
            votedValueAddress.address
        );

        // 5. Deploy Governance contracts (following official procedure)
        log('Deploying Governance contracts...');
        // Use P3D precompile address for voting token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Governance voting token");
        const governance = await deployContract(Governance, signer, csLib.address, P3D_PRECOMPILE_ADDRESS);
        const governanceFactory = await deployContract(GovernanceFactory, signer, governance.address);

        // 6. Deploy Export with constructor arguments matching official procedure
        log('Deploying Export...');
        // Use P3D precompile address for stake token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Export stake token");
        const exportMaster = await deployContract(Export, signer,
            "3DPass", // home_network
            "wUSDT", // home_asset
            P3D_PRECOMPILE_ADDRESS, // tokenAddr (P3D precompile for 3DPass)
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('100'), // large_threshold (following official pattern)
            [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
            [4*24*3600, 7*24*3600, 30*24*3600] // large_challenging_periods
        );

        // 7. Deploy Import with constructor arguments matching official procedure
        log('Deploying Import...');
        // Use P3D precompile address for stake token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Import stake token");
        const importMaster = await deployContract(Import, signer,
            "Ethereum", // foreign_network
            usdtEthAddress, // foreign_asset
            "Imported USDT", // name
            "USDT", // symbol
            P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile for 3DPass)
            oracle.address, // oracleAddr
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('100'), // large_threshold (following official pattern)
            [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
            [4*24*3600, 7*24*3600, 30*24*3600] // large_challenging_periods
        );

        // 8. Deploy CounterstakeFactory with required constructor arguments
        log('Deploying CounterstakeFactory...');
        const counterstakeFactory = await deployContract(
            CounterstakeFactory,
            signer,
            exportMaster.address,
            importMaster.address,
            governanceFactory.address,
            votedValueFactory.address
        );

        // 9. Deploy Assistant contracts (following official procedure)
        log('Deploying Assistant contracts...');
        const exportAssistant = await deployContract(ExportAssistant, signer,
            exportMaster.address,
            ethers.constants.AddressZero,
            100,
            2000,
            oracle.address, // oracle address for P3D price feeds
            1,
            "Export assistant template",
            "EXAS"
        );

        const importAssistant = await deployContract(ImportAssistant, signer,
            importMaster.address,
            ethers.constants.AddressZero,
            100,
            2000,
            10,
            1,
            "Import assistant template",
            "IMAS"
        );

        // 10. Deploy AssistantFactory with required constructor arguments
        log('Deploying AssistantFactory...');
        const assistantFactory = await deployContract(AssistantFactory, signer,
            exportAssistant.address,
            importAssistant.address,
            governanceFactory.address,
            votedValueFactory.address
        );

        const deployedAddresses = {
            counterstakeFactory: counterstakeFactory.address,
            assistantFactory: assistantFactory.address,
            oracle: oracle.address
        };

        log('\n--- Deployment Summary ---', colors.cyan);
        log(`CounterstakeFactory: ${deployedAddresses.counterstakeFactory}`);
        log(`AssistantFactory:    ${deployedAddresses.assistantFactory}`);
        log(`Oracle:              ${deployedAddresses.oracle}`);
        log(`P3D Precompile:      ${P3D_PRECOMPILE_ADDRESS}`);
        
        // Prepare the configuration to be written to conf.json
        // We assume a '1.0' version for this test deployment
        const newConfig = {
            counterstakeFactory: deployedAddresses.counterstakeFactory,
            assistantFactory: deployedAddresses.assistantFactory,
            oracle: deployedAddresses.oracle
        };

        log('\n--- Updating conf.js ---', colors.cyan);
        await updateConfJs(newConfig);

        log('\n--- Deployment and Configuration Complete ---', colors.green);
        log('✓ All contracts deployed with P3D precompile support', colors.green);

    } catch (err) {
        log('\n--- Deployment Failed ---');
        log(err);
        // Print the balance of the deployment account for diagnostics
        try {
            if (signer) {
                const balance = await signer.getBalance();
                log(`P3D balance of deployment account (${signer.address}): ${ethers.utils.formatEther(balance)} P3D`);
            } else {
                log('Signer is not defined, cannot fetch balance.');
            }
        } catch (balanceErr) {
            log('Failed to fetch deployment account balance:', balanceErr);
        }
        process.exit(1);
    }
}

main(); 