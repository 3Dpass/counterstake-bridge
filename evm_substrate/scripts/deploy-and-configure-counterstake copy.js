const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');
const desktopApp = require('ocore/desktop_app.js');

// Import contract ABIs and bytecodes from Truffle build artifacts
const CounterstakeFactory = require('../../counterstake-bridge/evm/build/contracts/CounterstakeFactory.json');
const AssistantFactory = require('../../counterstake-bridge/evm/build/contracts/AssistantFactory.json');
const BridgesRegistry = require('../../counterstake-bridge/evm/build/contracts/BridgesRegistry.json');
const Oracle = require('../../counterstake-bridge/evm/build/contracts/Oracle.json');
const Export = require('../../counterstake-bridge/evm/build/contracts/Export.json');
const ImportWrapper = require('../../counterstake-bridge/evm/build/contracts/ImportWrapper.json');
const ExportAssistant = require('../../counterstake-bridge/evm/build/contracts/ExportAssistant.json');
const ImportWrapperAssistant = require('../../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json');
const Governance = require('../../counterstake-bridge/evm/build/contracts/Governance.json');
const GovernanceFactory = require('../../counterstake-bridge/evm/build/contracts/GovernanceFactory.json');
const VotedValueUint = require('../../counterstake-bridge/evm/build/contracts/VotedValueUint.json');
const VotedValueUintArray = require('../../counterstake-bridge/evm/build/contracts/VotedValueUintArray.json');
const VotedValueAddress = require('../../counterstake-bridge/evm/build/contracts/VotedValueAddress.json');
const VotedValueFactory = require('../../counterstake-bridge/evm/build/contracts/VotedValueFactory.json');
const CounterstakeLibrary = require('../../counterstake-bridge/evm/build/contracts/CounterstakeLibrary.json');

// Load test configuration
const testConfig = require(path.join(__dirname, '..', 'bridge-test-config.json'));

const RPC_URL = process.env.RPC_URL || testConfig.development.network.rpcUrl;
const confPath = path.join(__dirname, '..', '..', 'counterstake-bridge', 'conf.js');

// P3D precompile address constant - from centralized config
const P3D_PRECOMPILE_ADDRESS = testConfig.development.contracts.nativeTokenPrecompile;

// 3DPass wrapped token addresses - from centralized config
const wUsdt3DPassAddress = testConfig.development.assets.Asset1.evmContract; // wUSDT on 3DPass

// Ethereum token addresses - from centralized config
const usdtEthAddress = testConfig.mainnet.contracts.usdt.ethereum; // USDT on Ethereum

// Centralized challenging periods configuration
const CHALLENGING_PERIODS_CONFIG = {
    // Small claims challenging periods (in seconds)
    // First period is 3 minutes for testing, others are longer for production
    challenging_periods: [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // [14h, 3d, 7d, 30d] - original challenging_periods
    // challenging_periods: [3*60, 3*60, 3*60, 60*24*3600], // [3min, 3min, 3min, 60days] - testing challenging_periods
    
    // Large claims challenging periods (in seconds)
    large_challenging_periods: [1*7*24*3600, 30*24*3600, 60*24*3600] // [1week, 30days, 60days]
};

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
    // Check if the last argument is an options object with gasLimit
    let gasLimit = null;
    let constructorArgs = args;
    
    if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1].gasLimit) {
        gasLimit = args[args.length - 1].gasLimit;
        constructorArgs = args.slice(0, -1);
    }
    
    // Validate P3D precompile address if it's used in constructor arguments
    for (let i = 0; i < constructorArgs.length; i++) {
        if (typeof constructorArgs[i] === 'string' && constructorArgs[i].toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
            validateP3DPrecompileAddress(constructorArgs[i]);
        }
    }
    
    const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, signer);
    log(`Deploying ${contractJson.contractName}...`);
    
    let contract;
    if (gasLimit) {
        contract = await factory.deploy(...constructorArgs, { gasLimit });
    } else {
        contract = await factory.deploy(...constructorArgs);
    }
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

    // Remove any existing 3DPass configuration sections
    let cleanedContent = confContent;
    
    // Remove existing threedpass_factory_contract_addresses sections
    cleanedContent = cleanedContent.replace(/exports\.threedpass_factory_contract_addresses\s*=\s*\{[^}]*\};?\s*/g, '');
    
    // Remove existing threedpass_assistant_factory_contract_addresses sections
    cleanedContent = cleanedContent.replace(/exports\.threedpass_assistant_factory_contract_addresses\s*=\s*\{[^}]*\};?\s*/g, '');
    
    // Remove existing threedpass_oracle_addresses sections
    cleanedContent = cleanedContent.replace(/exports\.threedpass_oracle_addresses\s*=\s*\{[^}]*\};?\s*/g, '');
    
    // Remove existing threedpass_bridges_registry_addresses sections
    cleanedContent = cleanedContent.replace(/exports\.threedpass_bridges_registry_addresses\s*=\s*\{[^}]*\};?\s*/g, '');
    
    // Remove any "3DPass Network Configuration" comment blocks
    cleanedContent = cleanedContent.replace(/\/\/ 3DPass Network Configuration\s*/g, '');

    // Add 3DPass configuration section
    const threedpassConfig = `
// 3DPass Network Configuration
exports.threedpass_factory_contract_addresses = {
    'v1.1': '${newConfig.counterstakeFactory}'
};
exports.threedpass_assistant_factory_contract_addresses = {
    'v1.1': '${newConfig.assistantFactory}'
};
exports.threedpass_bridges_registry_addresses = {
    'v1.1': '${newConfig.bridgesRegistry}'
};
exports.threedpass_oracle_addresses = {
    '3DPass': '${newConfig.oracle}'
};
`;

    // Add P3D precompile address to conf.js
    if (!cleanedContent.includes('p3d_precompile_address')) {
        cleanedContent += `\n// 3DPass specific: P3D precompile address\nexports.p3d_precompile_address = '${P3D_PRECOMPILE_ADDRESS}';\n`;
        log(`Added P3D precompile address to conf.js: ${P3D_PRECOMPILE_ADDRESS}`, colors.cyan);
    }

    // Insert the 3DPass config before the console.log line
    const updatedContent = cleanedContent.replace(
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

        // 2. Link CounterstakeLibrary into Export, ImportWrapper, ExportAssistant
        link(Export, 'CounterstakeLibrary', csLib.address);
        link(ImportWrapper, 'CounterstakeLibrary', csLib.address);
        link(ExportAssistant, 'CounterstakeLibrary', csLib.address);

        // 3. Deploy Oracle first (needed for Import)
        log('Deploying Oracle...');
        const oracle = await deployContract(Oracle, signer);

        // Set a price in the Oracle for wUSDT (3DPass) vs _NATIVE_
        log('Setting price to the Oracle for (wUSDT, _NATIVE_)...');
        try {
            const tx2 = await oracle.connect(signer).setPrice("wUSDT", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
            await tx2.wait();
            log('  ✓ Price set to the Oracle for wUSDT');
        } catch (err) {
            log('  ✗ Failed to set price to the Oracle for wUSDT', err);
            throw err;
        }

        // Set a price in the Oracle for _NATIVE_ (3DPass) vs wUSDT
        log('Setting price to the Oracle for (_NATIVE_, wUSDT)...');
        try {
            const tx2 = await oracle.connect(signer).setPrice("_NATIVE_", "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
            await tx2.wait();
            log('  ✓ Price set to the Oracle for _NATIVE_');
        } catch (err) {
            log('  ✗ Failed to set price to the Oracle for _NATIVE_', err);
            throw err;
        }

         // Set a price to the Oracle for P3D (3DPass) vs _NATIVE_
         // because of P3D not being a regular native token on EVM, 
         // but representing an ERC20 token instead.
         log('Setting price to the Oracle for (P3D, _NATIVE_)...');
         try {
             const tx2 = await oracle.connect(signer).setPrice("P3D", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
             await tx2.wait();
             log('  ✓ Price set to the Oracle for P3D');
         } catch (err) {
             log('  ✗ Failed to set price to the Oracle for P3D', err);
             throw err;
         }

         // Set a price to the Oracle for _NATIVE vs P3D
         // because of P3D not being a regular native token on EVM, 
         // but representing an ERC20 token instead.
         log('Setting price to the Oracle for (_NATIVE, P3D)...');
         try {
             const tx2 = await oracle.connect(signer).setPrice("_NATIVE", "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
             await tx2.wait();
             log('  ✓ Price set to the Oracle for _NATIVE');
         } catch (err) {
             log('  ✗ Failed to set price to the Oracle for _NATIVE', err);
             throw err;
         }

         // Set a price in the Oracle for ETH vs P3D
        log('Setting price to the Oracle for (ETH, P3D)...');
        try {
            const tx2 = await oracle.connect(signer).setPrice(usdtEthAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
            await tx2.wait();
            log('  ✓ Price set to the Oracle for ETH');
        } catch (err) {
            log('  ✗ Failed to set price to the Oracle for ETH', err);
            throw err;
        }

         // Set a price in the Oracle for ETH vs _NATIVE_ (required for ImportWrapper validation)
         log('Setting price to the Oracle for (ETH, _NATIVE_)...');
         try {
             const tx2 = await oracle.connect(signer).setPrice(usdtEthAddress, "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
             await tx2.wait();
             log('  ✓ Price set to the Oracle for ETH vs _NATIVE_');
         } catch (err) {
             log('  ✗ Failed to set price to the Oracle for ETH vs _NATIVE_', err);
             throw err;
         }

         // Set a price in the Oracle for ETH vs wUSDT
         log('Setting price to the Oracle for (ETH, wUSDT)...');
         try {
             const tx2 = await oracle.connect(signer).setPrice(usdtEthAddress, "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
             await tx2.wait();
             log('  ✓ Price set to the Oracle for ETH vs wUSDT');
         } catch (err) {
             log('  ✗ Failed to set price to the Oracle for ETH vs wUSDT', err);
             throw err;
         }

          // Set a price in the Oracle for wUSDT vs ETH
          log('Setting price to the Oracle for (wUSDT, ETH)...');
          try {
              const tx2 = await oracle.connect(signer).setPrice("wUSDT", usdtEthAddress, ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
              await tx2.wait();
              log('  ✓ Price set to the Oracle for wUSDT vs ETH');
          } catch (err) {
              log('  ✗ Failed to set price to the Oracle for wUSDT vs ETH', err);
              throw err;
          }

        // Debug: Test all required oracle price combinations
        log('Debug: Testing all required oracle price combinations...');
        const testCases = [
            { asset: "P3D", stake: "_NATIVE_", desc: "P3D vs _NATIVE_" },
            { asset: "_NATIVE_", stake: "P3D", desc: "_NATIVE_ vs P3D" },
            { asset: "wUSDT", stake: "_NATIVE_", desc: "wUSDT vs _NATIVE_" },
            { asset: "_NATIVE_", stake: "wUSDT", desc: "_NATIVE_ vs wUSDT" },
            { asset: usdtEthAddress, stake: "P3D", desc: "ETH vs P3D" },
            { asset: usdtEthAddress, stake: "wUSDT", desc: "ETH vs wUSDT" },
            { asset: usdtEthAddress, stake: "_NATIVE_", desc: "ETH vs _NATIVE_" },
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
        // Use P3D precompile address for voting token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Governance voting token");
        const governance = await deployContract(Governance, signer, csLib.address, P3D_PRECOMPILE_ADDRESS);
        const governanceFactory = await deployContract(GovernanceFactory, signer, governance.address);

        // 6. Deploy Export with constructor arguments matching official procedure
        log('Deploying Export...');
        // Use P3D precompile address for stake token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Export stake token");
        const exportMaster = await deployContract(Export, signer,
            "3DPass", // foreign_network (foreign for USDT)
            wUsdt3DPassAddress, // foreign_asset (wUSDT precompile address from Import bridge)
            P3D_PRECOMPILE_ADDRESS, // tokenAddr (stake token is P3D)
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('10000'), // large_threshold (matching bridge-setup-and-test.js)
            CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
            CHALLENGING_PERIODS_CONFIG.large_challenging_periods // large_challenging_periods
        );

        // 7. Deploy ImportWrapper with constructor arguments matching official procedure
        log('Deploying ImportWrapper...');
        // Use P3D precompile address for stake token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "ImportWrapper stake token");
        const importWrapperMaster = await deployContract(ImportWrapper, signer,
            "Ethereum", // home_network
            usdtEthAddress, // home_asset address
            wUsdt3DPassAddress, // precompileAddress (existing wUSDT precompile)
            P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (stake token is P3D)
            oracle.address, // oracleAddr
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('10000'), // large_threshold (matching bridge-setup-and-test.js)
            CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
            CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
            { gasLimit: 9000000 } // High gas limit for complex constructor
        );

        // 8. Deploy BridgesRegistry first (needed by factories)
        log('Deploying BridgesRegistry...');
        log(`BridgesRegistry contract: ${BridgesRegistry ? 'loaded' : 'NOT LOADED'}`);
        log(`BridgesRegistry contractName: ${BridgesRegistry?.contractName || 'undefined'}`);
        const bridgesRegistry = await deployContract(BridgesRegistry, signer);

        // 9. Deploy CounterstakeFactory with required constructor arguments including registry
        log('Deploying CounterstakeFactory...');
        log(`bridgesRegistry.address: ${bridgesRegistry.address}`);
        const counterstakeFactory = await deployContract(
            CounterstakeFactory,
            signer,
            exportMaster.address,
            importWrapperMaster.address,
            governanceFactory.address,
            votedValueFactory.address,
            bridgesRegistry.address
        );

        // 9. Deploy Assistant contracts (following official procedure)
        log('Deploying Assistant contracts...');
        
        // Test ImportWrapper responsiveness before deploying ImportWrapperAssistant
        log('Testing ImportWrapper responsiveness...');
        try {
            const settings = await importWrapperMaster.settings();
            log(`  ✓ ImportWrapper settings test passed: tokenAddr=${settings[0]}`);
            
            const precompileAddr = await importWrapperMaster.precompileAddress();
            log(`  ✓ ImportWrapper precompileAddress test passed: ${precompileAddr}`);
            
            const homeNetwork = await importWrapperMaster.home_network();
            log(`  ✓ ImportWrapper home_network test passed: ${homeNetwork}`);
            
            const homeAsset = await importWrapperMaster.home_asset();
            log(`  ✓ ImportWrapper home_asset test passed: ${homeAsset}`);
            
        } catch (error) {
            log(`  ✗ ImportWrapper responsiveness test failed: ${error.message}`, colors.red);
            throw new Error(`ImportWrapper is not responding properly: ${error.message}`);
        }
        
        const exportAssistant = await deployContract(ExportAssistant, signer,
            exportMaster.address, // bridgeAddr
            ethers.constants.AddressZero, // managerAddr
            100, // _management_fee10000
            2500, // _success_fee10000 (matching bridge-setup-and-test.js: 25%)
            oracle.address, // oracleAddr
            1, // _exponent
            "EXPS export assistant temp", // name
            "EXPS", // symbol
            { gasLimit: 90000000 } // Higher gas limit for assistant deployment
        );

        const importWrapperAssistant = await deployContract(ImportWrapperAssistant, signer,
            importWrapperMaster.address, // bridgeAddr
            ethers.constants.AddressZero, // managerAddr
            100, // _management_fee10000
            2000, // _success_fee10000 (matching bridge-setup-and-test.js: 20%)
            10, // _swap_fee10000
            1, // _exponent
            "IMPS import assistant temp", // name
            "IMPS", // symbol
            { gasLimit: 119990000 } // Gas limit for assistant deployment
        );

        // 11. Deploy AssistantFactory with required constructor arguments including registry
        log('Deploying AssistantFactory...');
        const assistantFactory = await deployContract(AssistantFactory, signer,
            exportAssistant.address,
            importWrapperAssistant.address,
            governanceFactory.address,
            votedValueFactory.address,
            bridgesRegistry.address
        );

        // 12. Set factory addresses in the registry
        log('Setting factory addresses in BridgesRegistry...');
        try {
            const tx = await bridgesRegistry.setFactories(counterstakeFactory.address, assistantFactory.address);
            await tx.wait();
            log('  ✓ Factory addresses set in BridgesRegistry');
        } catch (err) {
            log('  ✗ Failed to set factory addresses in BridgesRegistry', err);
            throw err;
        }

        const deployedAddresses = {
            counterstakeFactory: counterstakeFactory.address,
            assistantFactory: assistantFactory.address,
            bridgesRegistry: bridgesRegistry.address,
            oracle: oracle.address
        };

        log('\n--- Deployment Summary ---', colors.cyan);
        log(`BridgesRegistry:     ${deployedAddresses.bridgesRegistry}`);
        log(`CounterstakeFactory: ${deployedAddresses.counterstakeFactory}`);
        log(`AssistantFactory:    ${deployedAddresses.assistantFactory}`);
        log(`Oracle:              ${deployedAddresses.oracle}`);
        log(`P3D Precompile:      ${P3D_PRECOMPILE_ADDRESS}`);
        
        // Prepare the configuration to be written to conf.json
        // We assume a '1.0' version for this test deployment
        const newConfig = {
            counterstakeFactory: deployedAddresses.counterstakeFactory,
            assistantFactory: deployedAddresses.assistantFactory,
            bridgesRegistry: deployedAddresses.bridgesRegistry,
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