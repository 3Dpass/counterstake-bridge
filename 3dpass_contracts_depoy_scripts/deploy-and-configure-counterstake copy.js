const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');
const desktopApp = require('ocore/desktop_app.js');

// Import contract ABIs and bytecodes from Truffle build artifacts
const CounterstakeFactory = require('../../counterstake-bridge/evm/build/contracts/CounterstakeFactory.json');
const AssistantFactory = require('../../counterstake-bridge/evm/build/contracts/AssistantFactory.json');
const Oracle = require('../../counterstake-bridge/evm/build/contracts/Oracle.json');
const Export3DPass = require('../../counterstake-bridge/evm/build/contracts/Export3DPass.json');
const Import3DPass = require('../../counterstake-bridge/evm/build/contracts/Import3DPass.json');
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

// 3DPass specific: P3D precompile address
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

// 3DPass specific: Validate P3D precompile address
function validateP3DPrecompileAddress(address) {
    if (address !== P3D_PRECOMPILE_ADDRESS) {
        throw new Error(`Invalid P3D precompile address. Expected: ${P3D_PRECOMPILE_ADDRESS}, Got: ${address}`);
    }
    log(`✓ P3D precompile address validation passed: ${address}`, colors.green);
}

// 3DPass specific: Validate token address for 3DPass deployment
function validateTokenAddressFor3DPass(address, context) {
    if (address === ethers.constants.AddressZero) {
        log(`⚠️  Warning: Using AddressZero (${address}) for ${context} - this may not work correctly on 3DPass`, colors.yellow);
        return false;
    }
    if (address === P3D_PRECOMPILE_ADDRESS) {
        log(`✓ Using P3D precompile address (${address}) for ${context}`, colors.green);
        return true;
    }
    // For other addresses, assume they are valid ERC20 contracts
    log(`✓ Using ERC20 token address (${address}) for ${context}`, colors.cyan);
    return true;
}

async function deployContract(contractJson, signer, ...args) {
    const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, signer);
    log(`Deploying ${contractJson.contractName}...`);
    
    // Validate P3D precompile address if it's used in constructor arguments
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === 'string' && args[i].toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
            validateP3DPrecompileAddress(args[i]);
        }
    }
    
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
exports.version = 'v1.1';
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

    // Add P3D precompile address to conf.js if not present
    if (!confContent.includes('p3d_precompile_address')) {
        confContent += `\n// 3DPass specific: P3D precompile address\nexports.p3d_precompile_address = '${P3D_PRECOMPILE_ADDRESS}';\n`;
        log(`Added P3D precompile address to conf.js: ${P3D_PRECOMPILE_ADDRESS}`, colors.cyan);
    }

    // Update 3DPass factory contract addresses
    const factoryRegex = /exports\.threedpass_factory_contract_addresses\s*=\s*\{[^}]*\};/;
    const factoryReplacement = `exports.threedpass_factory_contract_addresses = {
    'v1.1': '${newConfig.counterstakeFactory}'
};`;
    
    if (confContent.match(factoryRegex)) {
        confContent = confContent.replace(factoryRegex, factoryReplacement);
        log(`Updated threedpass_factory_contract_addresses with: ${newConfig.counterstakeFactory}`, colors.cyan);
    } else {
        // Add if not found
        confContent += `\n// 3DPass Network Configuration\nexports.threedpass_factory_contract_addresses = {\n    'v1.1': '${newConfig.counterstakeFactory}'\n};`;
        log(`Added threedpass_factory_contract_addresses: ${newConfig.counterstakeFactory}`, colors.cyan);
    }

    // Update 3DPass assistant factory contract addresses
    const assistantFactoryRegex = /exports\.threedpass_assistant_factory_contract_addresses\s*=\s*\{[^}]*\};/;
    const assistantFactoryReplacement = `exports.threedpass_assistant_factory_contract_addresses = {
    'v1.1': '${newConfig.assistantFactory}'
};`;
    
    if (confContent.match(assistantFactoryRegex)) {
        confContent = confContent.replace(assistantFactoryRegex, assistantFactoryReplacement);
        log(`Updated threedpass_assistant_factory_contract_addresses with: ${newConfig.assistantFactory}`, colors.cyan);
    } else {
        // Add if not found
        confContent += `\nexports.threedpass_assistant_factory_contract_addresses = {\n    'v1.1': '${newConfig.assistantFactory}'\n};`;
        log(`Added threedpass_assistant_factory_contract_addresses: ${newConfig.assistantFactory}`, colors.cyan);
    }

    // Update 3DPass oracle addresses
    const oracleRegex = /exports\.threedpass_oracle_addresses\s*=\s*\{[^}]*\};/;
    const oracleReplacement = `exports.threedpass_oracle_addresses = {
    '3DPass': '${newConfig.oracle}'
};`;
    
    if (confContent.match(oracleRegex)) {
        confContent = confContent.replace(oracleRegex, oracleReplacement);
        log(`Updated threedpass_oracle_addresses with: ${newConfig.oracle}`, colors.cyan);
    } else {
        // Add if not found
        confContent += `\nexports.threedpass_oracle_addresses = {\n    '3DPass': '${newConfig.oracle}'\n};`;
        log(`Added threedpass_oracle_addresses: ${newConfig.oracle}`, colors.cyan);
    }

    await fs.writeFile(confPath, confContent);
    log(`Updated conf.js with new 3DPass contract addresses`, colors.green);
}

async function main() {
    log('--- Starting Counterstake Core Infrastructure Deployment (Modified P3D Contracts) ---', colors.cyan);

    try {
        // Validate P3D precompile address at the start
        log('Validating P3D precompile address...', colors.cyan);
        validateP3DPrecompileAddress(P3D_PRECOMPILE_ADDRESS);
        
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const privateKey = testConfig.development.accounts.account1.privateKey;
        if (!privateKey) {
            throw new Error('Private key for account1 not found in bridge-test-config.json');
        }
        let signer;
        signer = new ethers.Wallet(privateKey, provider);
        log(`Deploying using account: ${signer.address}`);

        // 1. Deploy CounterstakeLibrary
        log('Deploying CounterstakeLibrary...');
        const csLib = await deployContract(CounterstakeLibrary, signer);

        // 2. Link CounterstakeLibrary into Export3DPass, Import3DPass, ExportAssistant
        link(Export3DPass, 'CounterstakeLibrary', csLib.address);
        link(Import3DPass, 'CounterstakeLibrary', csLib.address);
        link(ExportAssistant, 'CounterstakeLibrary', csLib.address);

        // 3. Deploy Oracle first (needed for Import3DPass)
        log('Deploying Oracle...');
        const oracle = await deployContract(Oracle, signer);

        // Set a test price in the Oracle for USDT (Ethereum) vs P3D
        const usdtEthAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        log(`Setting test price in Oracle for (USDT: ${usdtEthAddress}, P3D)...`);
        try {
            const tx = await oracle.connect(signer).setPrice(usdtEthAddress, "P3D", 1, 1);
            await tx.wait();
            log('  ✓ Test price set in Oracle for USDT vs P3D');
        } catch (err) {
            log('  ✗ Failed to set test price in Oracle for USDT vs P3D', err);
            throw err;
        }

        // Set a test price in the Oracle for wUSDT (3DPass) vs P3D
        log('Setting test price in Oracle for (wUSDT, P3D)...');
        try {
            const tx2 = await oracle.connect(signer).setPrice("wUSDT", "P3D", 1, 1);
            await tx2.wait();
            log('  ✓ Test price set in Oracle for wUSDT vs P3D');
        } catch (err) {
            log('  ✗ Failed to set test price in Oracle for wUSDT vs P3D', err);
            throw err;
        }

        // Set a test price in the Oracle for P3D vs _NATIVE_ (required by Import3DPass validation)
        log('Setting test price in Oracle for (P3D, _NATIVE_)...');
        try {
            const tx3 = await oracle.connect(signer).setPrice("P3D", "_NATIVE_", 1, 1);
            await tx3.wait();
            log('  ✓ Test price set in Oracle for P3D vs _NATIVE_');
        } catch (err) {
            log('  ✗ Failed to set test price in Oracle for P3D vs _NATIVE_', err);
            throw err;
        }

        // Set a test price in the Oracle for (Ethereum, P3D) - required by Import3DPass validation
        log('Setting test price in Oracle for (Ethereum, P3D)...');
        try {
            const tx4 = await oracle.connect(signer).setPrice("Ethereum", "P3D", 1, 1);
            await tx4.wait();
            log('  ✓ Test price set in Oracle for Ethereum vs P3D');
        } catch (err) {
            log('  ✗ Failed to set test price in Oracle for Ethereum vs P3D', err);
            throw err;
        }

        // Debug: Test oracle price lookup before deploying Import3DPass
        log('Debug: Testing oracle price lookup...');
        try {
            // Test the exact price lookup that Import3DPass will do
            const usdtEthAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
            const price = await oracle.connect(signer).getPrice(usdtEthAddress, "P3D");
            log(`  ✓ Oracle price lookup test passed: (${usdtEthAddress}, P3D) = (${price[0]}, ${price[1]})`);
        } catch (err) {
            log('  ✗ Oracle price lookup test failed:', err);
            throw err;
        }

        // Debug: Test all possible oracle price combinations
        log('Debug: Testing all oracle price combinations...');
        const testCases = [
            { asset: usdtEthAddress, stake: "P3D", desc: "USDT vs P3D" },
            { asset: "wUSDT", stake: "P3D", desc: "wUSDT vs P3D" },
            { asset: "P3D", stake: "_NATIVE_", desc: "P3D vs _NATIVE_" },
            { asset: "Ethereum", stake: "P3D", desc: "Ethereum vs P3D" }
        ];

        for (const testCase of testCases) {
            try {
                const price = await oracle.connect(signer).getPrice(testCase.asset, testCase.stake);
                log(`  ✓ ${testCase.desc}: (${price[0]}, ${price[1]})`);
            } catch (err) {
                log(`  ✗ ${testCase.desc}: ${err.message}`);
            }
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
        // Validate P3D precompile address before governance deployment
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Governance voting token");
        const governance = await deployContract(Governance, signer, csLib.address, P3D_PRECOMPILE_ADDRESS);
        const governanceFactory = await deployContract(GovernanceFactory, signer, governance.address);

        // 6. Deploy Export3DPass with constructor arguments using P3D precompile
        log('Deploying Export3DPass (Modified P3D contract)...');
        // Validate P3D precompile address before export deployment
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Export3DPass stake token");
        const exportMaster = await deployContract(Export3DPass, signer,
            "3DPass", // home_network (FIXED: matches original)
            "wUSDT", // home_asset (FIXED: matches original)
            P3D_PRECOMPILE_ADDRESS, // tokenAddr = P3D precompile (not AddressZero!)
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('100'), // large_threshold
            [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
            [4*24*3600, 7*24*3600, 30*24*3600] // large_challenging_periods
        );

        // 7. Deploy Import3DPass with constructor arguments using P3D precompile
        log('Deploying Import3DPass (Modified P3D contract)...');
        // Validate P3D precompile address before import deployment
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Import3DPass stake token");
        const importMaster = await deployContract(Import3DPass, signer,
            "Ethereum", // foreign_network (FIXED: matches original)
            usdtEthAddress, // foreign_asset (FIXED: matches original)
            "Imported USDT", // name
            "USDT", // symbol
            P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr = P3D precompile (not AddressZero!)
            oracle.address, // oracleAddr
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('100'), // large_threshold
            [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
            [4*24*3600, 7*24*3600, 30*24*3600] // large_challenging_periods
        );

        // Setup governance for Import3DPass
        log('Setting up governance for Import3DPass...');
        try {
            const tx = await importMaster.connect(signer).setupGovernance(governanceFactory.address, votedValueFactory.address);
            await tx.wait();
            log('  ✓ Governance setup completed for Import3DPass');
        } catch (err) {
            log('  ✗ Governance setup failed for Import3DPass:', err);
            throw err;
        }

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
        // Validate P3D precompile address before assistant deployments
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "ExportAssistant stake token");
        const exportAssistant = await deployContract(ExportAssistant, signer,
            exportMaster.address,
            ethers.constants.AddressZero, // managerAddr (following original pattern)
            100,
            2000,
            oracle.address, // oracleAddr (needed for P3D token validation)
            1,
            "Export assistant template",
            "EXAS"
        );

        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "ImportAssistant stake token");
        const importAssistant = await deployContract(ImportAssistant, signer,
            importMaster.address,
            ethers.constants.AddressZero, // managerAddr (following original pattern)
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

        log('\n--- Deployment Summary (Modified P3D Contracts) ---', colors.cyan);
        log(`CounterstakeFactory: ${deployedAddresses.counterstakeFactory}`);
        log(`AssistantFactory:    ${deployedAddresses.assistantFactory}`);
        log(`Oracle:              ${deployedAddresses.oracle}`);
        log(`P3D Precompile:      ${P3D_PRECOMPILE_ADDRESS}`);
        log(`Export3DPass:        ${exportMaster.address}`);
        log(`Import3DPass:        ${importMaster.address}`);
        
        // Final validation check
        log('\n--- Final Validation Check ---', colors.cyan);
        validateP3DPrecompileAddress(P3D_PRECOMPILE_ADDRESS);
        log('✓ All P3D precompile address validations passed', colors.green);
        
        // Prepare the configuration to be written to conf.json
        const newConfig = {
            counterstakeFactory: deployedAddresses.counterstakeFactory,
            assistantFactory: deployedAddresses.assistantFactory,
            oracle: deployedAddresses.oracle
        };

        log('\n--- Updating conf.js ---', colors.cyan);
        await updateConfJs(newConfig);

        log('\n--- Deployment and Configuration Complete (Modified P3D Contracts) ---', colors.green);

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