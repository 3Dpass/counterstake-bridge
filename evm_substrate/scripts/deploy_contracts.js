const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');
const desktopApp = require('ocore/desktop_app.js');

// Import contract ABIs and bytecodes from Truffle build artifacts
const CounterstakeFactory = require('../build/contracts/CounterstakeFactory.json');
const AssistantFactory = require('../build/contracts/AssistantFactory.json');
const BridgesRegistry = require('../build/contracts/BridgesRegistry.json');
const Oracle = require('../build/contracts/Oracle.json');
const Export = require('../build/contracts/Export.json');
const ImportWrapper = require('../build/contracts/ImportWrapper.json');
const ExportAssistant = require('../build/contracts/ExportAssistant.json');
const ImportWrapperAssistant = require('../build/contracts/ImportWrapperAssistant.json');
const Governance = require('../build/contracts/Governance.json');
const GovernanceFactory = require('../build/contracts/GovernanceFactory.json');
const VotedValueUint = require('../build/contracts/VotedValueUint.json');
const VotedValueUintArray = require('../build/contracts/VotedValueUintArray.json');
const VotedValueAddress = require('../build/contracts/VotedValueAddress.json');
const VotedValueFactory = require('../build/contracts/VotedValueFactory.json');
const CounterstakeLibrary = require('../build/contracts/CounterstakeLibrary.json');
const IP3D = require('../build/contracts/IP3D.json');


// Use provider from provider.js instead of test config
const { getProvider } = require('../../evm/provider.js');

// P3D precompile address constant - from centralized config
const conf = require('../../conf.js');
const P3D_PRECOMPILE_ADDRESS = conf.p3d_precompile_address;

// 3DPass wrapped token addresses - hardcoded
const wUsdt3DPassAddress = '0xfBFBfbFA000000000000000000000000000000de'; // wUSDT precompile on 3DPass

// Ethereum token addresses - hardcoded
const usdtEthAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT on Ethereum

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

// Function to check P3D balance using IP3D interface
async function checkP3DBalance(signer, address = null) {
    try {
        const p3dContract = new ethers.Contract(P3D_PRECOMPILE_ADDRESS, IP3D.abi, signer);
        const balanceAddress = address || signer.address;
        const balance = await p3dContract.balanceOf(balanceAddress);
        const balanceFormatted = ethers.utils.formatEther(balance);
        log(`P3D balance of ${balanceAddress}: ${balanceFormatted} P3D`, colors.cyan);
        return { balance, balanceFormatted };
    } catch (error) {
        log(`Failed to fetch P3D balance for ${address || signer.address}: ${error.message}`, colors.red);
        return { balance: ethers.BigNumber.from(0), balanceFormatted: '0.0' };
    }
}

// Function to estimate total deployment costs
async function estimateTotalDeploymentCost(signer) {
    log('🔍 Estimating total deployment costs...', colors.cyan);
    
    const gasPrice = await signer.getGasPrice();
    const currentBalance = await signer.getBalance();
    
    // Define contracts to deploy with their estimated gas limits
    const contractsToDeploy = [
        { name: 'CounterstakeLibrary', gasLimit: 5000000 },
        { name: 'Oracle', gasLimit: 2000000 },
        { name: 'VotedValueUint', gasLimit: 1500000 },
        { name: 'VotedValueUintArray', gasLimit: 1500000 },
        { name: 'VotedValueAddress', gasLimit: 1500000 },
        { name: 'VotedValueFactory', gasLimit: 2000000 },
        { name: 'Governance', gasLimit: 3000000 },
        { name: 'GovernanceFactory', gasLimit: 2000000 },
        { name: 'Export', gasLimit: 4000000 },
        { name: 'ImportWrapper', gasLimit: 9000000 },
        { name: 'BridgesRegistry', gasLimit: 2000000 },
        { name: 'CounterstakeFactory', gasLimit: 3000000 },
        { name: 'ExportAssistant', gasLimit: 90000000 },
        { name: 'ImportWrapperAssistant', gasLimit: 119990000 },
        { name: 'AssistantFactory', gasLimit: 3000000 }
    ];
    
    // Oracle setPrice operations (estimated)
    const oracleOperations = 7; // Number of setPrice calls
    const oracleOperationGas = 100000; // Estimated gas per setPrice call
    
    // Registry setFactories operation
    const registryOperationGas = 200000;
    
    let totalEstimatedGas = ethers.BigNumber.from(0);
    let totalEstimatedCost = ethers.BigNumber.from(0);
    
    log('Contract deployment estimates:', colors.yellow);
    contractsToDeploy.forEach(contract => {
        const contractCost = ethers.BigNumber.from(contract.gasLimit).mul(gasPrice);
        totalEstimatedGas = totalEstimatedGas.add(contract.gasLimit);
        totalEstimatedCost = totalEstimatedCost.add(contractCost);
        
        log(`  ${contract.name.padEnd(25)} | ${contract.gasLimit.toLocaleString().padStart(10)} gas | ${ethers.utils.formatEther(contractCost).padStart(15)} P3D`);
    });
    
    // Add oracle operations
    const oracleTotalGas = oracleOperations * oracleOperationGas;
    const oracleTotalCost = ethers.BigNumber.from(oracleTotalGas).mul(gasPrice);
    totalEstimatedGas = totalEstimatedGas.add(oracleTotalGas);
    totalEstimatedCost = totalEstimatedCost.add(oracleTotalCost);
    
    log(`  ${'Oracle Operations'.padEnd(25)} | ${oracleTotalGas.toLocaleString().padStart(10)} gas | ${ethers.utils.formatEther(oracleTotalCost).padStart(15)} P3D`);
    
    // Add registry operation
    const registryCost = ethers.BigNumber.from(registryOperationGas).mul(gasPrice);
    totalEstimatedGas = totalEstimatedGas.add(registryOperationGas);
    totalEstimatedCost = totalEstimatedCost.add(registryCost);
    
    log(`  ${'Registry Operations'.padEnd(25)} | ${registryOperationGas.toLocaleString().padStart(10)} gas | ${ethers.utils.formatEther(registryCost).padStart(15)} P3D`);
    
    const totalEstimatedCostEth = ethers.utils.formatEther(totalEstimatedCost);
    const totalEstimatedCostWei = totalEstimatedCost.toString();
    
    log('\n' + '='.repeat(70), colors.cyan);
    log(`TOTAL ESTIMATED GAS: ${totalEstimatedGas.toString()}`, colors.yellow);
    log(`TOTAL ESTIMATED COST: ${totalEstimatedCostEth} P3D`, colors.yellow);
    log(`TOTAL ESTIMATED COST: ${totalEstimatedCostWei} wei (min units)`, colors.yellow);
    log(`CURRENT BALANCE: ${ethers.utils.formatEther(currentBalance)} P3D`, colors.yellow);
    
    if (currentBalance.gte(totalEstimatedCost)) {
        const remaining = currentBalance.sub(totalEstimatedCost);
        log(`REMAINING AFTER DEPLOYMENT: ${ethers.utils.formatEther(remaining)} P3D`, colors.green);
        log('✓ Sufficient balance for deployment', colors.green);
    } else {
        const shortfall = totalEstimatedCost.sub(currentBalance);
        log(`INSUFFICIENT BALANCE: Need ${ethers.utils.formatEther(shortfall)} P3D more`, colors.red);
        log('❌ Insufficient balance for deployment', colors.red);
    }
    log('='.repeat(70), colors.cyan);
    
    return {
        totalEstimatedGas,
        totalEstimatedCost,
        totalEstimatedCostEth,
        totalEstimatedCostWei,
        currentBalance,
        sufficientBalance: currentBalance.gte(totalEstimatedCost)
    };
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
    // Check if the last argument is an options object with gasLimit or maxFeePerGas
    let gasLimit = null;
    let maxFeePerGas = null;
    let constructorArgs = args;
    
    if (args.length > 0 && typeof args[args.length - 1] === 'object' && (args[args.length - 1].gasLimit || args[args.length - 1].maxFeePerGas)) {
        const options = args[args.length - 1];
        gasLimit = options.gasLimit;
        maxFeePerGas = options.maxFeePerGas;
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
    
    // Get gas price for cost calculation
    const gasPrice = await signer.getGasPrice();
    log(`  Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (${gasPrice.toString()} wei)`, colors.cyan);
    
    // Estimate gas cost before deployment
    let estimatedGasCost = null;
    let estimatedGasCostWei = null;
    let estimatedGasCostEth = null;
    
    try {
        // Get deployment transaction to estimate gas
        const deploymentTx = gasLimit 
            ? await factory.getDeployTransaction(...constructorArgs, { gasLimit })
            : await factory.getDeployTransaction(...constructorArgs);
        
        // Estimate gas usage
        const estimatedGas = await signer.estimateGas(deploymentTx);
        estimatedGasCost = estimatedGas.mul(gasPrice);
        estimatedGasCostWei = estimatedGasCost.toString();
        estimatedGasCostEth = ethers.utils.formatEther(estimatedGasCost);
        
        log(`  ${colors.yellow}📊 Gas estimation: ${estimatedGas.toString()} gas | Cost: ${estimatedGasCostEth} P3D | ${estimatedGasCostWei} wei${colors.reset}`);
        
        // Check if account has enough balance
        const currentBalance = await signer.getBalance();
        if (currentBalance.lt(estimatedGasCost)) {
            log(`  ${colors.red}⚠️  WARNING: Insufficient balance! Current: ${ethers.utils.formatEther(currentBalance)} P3D, Required: ${estimatedGasCostEth} P3D${colors.reset}`);
        } else {
            log(`  ${colors.green}✓ Balance check passed: ${ethers.utils.formatEther(currentBalance)} P3D available${colors.reset}`);
        }
        
        // Additional check: Compare with gas limit cost
        const gasLimitCost = ethers.BigNumber.from(gasLimit || 0).mul(gasPrice);
        const gasLimitCostEth = ethers.utils.formatEther(gasLimitCost);
        log(`  Gas limit cost (${gasLimit || 'auto'} gas): ${gasLimitCostEth} P3D`, colors.cyan);
        
        if (gasLimit && currentBalance.lt(gasLimitCost)) {
            log(`  ${colors.red}⚠️  CRITICAL: Gas limit cost exceeds balance! Gas limit: ${gasLimit}, Cost: ${gasLimitCostEth} P3D${colors.reset}`);
        }
        
    } catch (estimationError) {
        log(`  ${colors.yellow}⚠️  Gas estimation failed: ${estimationError.message}${colors.reset}`);
        log(`  ${colors.yellow}  Proceeding with deployment anyway...${colors.reset}`);
    }
    
    let contract;
    let deploymentTx;
    
    // Build deployment options
    const deploymentOptions = {};
    if (gasLimit) deploymentOptions.gasLimit = gasLimit;
    if (maxFeePerGas) {
        deploymentOptions.maxFeePerGas = maxFeePerGas;
        // Set maxPriorityFeePerGas to a small value to ensure it's less than maxFeePerGas
        deploymentOptions.maxPriorityFeePerGas = Math.min(maxFeePerGas, 10); // Use 10 wei or maxFeePerGas, whichever is smaller
    }
    
    if (Object.keys(deploymentOptions).length > 0) {
        deploymentTx = await factory.getDeployTransaction(...constructorArgs, deploymentOptions);
        log(`  Deployment transaction gas limit: ${gasLimit || 'auto'}`, colors.cyan);
        if (maxFeePerGas) {
            log(`  Deployment transaction maxFeePerGas: ${maxFeePerGas} wei`, colors.cyan);
            log(`  Deployment transaction maxPriorityFeePerGas: ${deploymentOptions.maxPriorityFeePerGas} wei`, colors.cyan);
        }
        log(`  Estimated transaction cost: ${ethers.utils.formatEther(ethers.BigNumber.from(gasLimit || 0).mul(maxFeePerGas || gasPrice))} P3D`, colors.cyan);
        contract = await factory.deploy(...constructorArgs, deploymentOptions);
    } else {
        deploymentTx = await factory.getDeployTransaction(...constructorArgs);
        log(`  Deployment transaction gas limit: ${deploymentTx.gasLimit?.toString() || 'auto'}`, colors.cyan);
        log(`  Estimated transaction cost: ${ethers.utils.formatEther((deploymentTx.gasLimit || ethers.BigNumber.from(0)).mul(gasPrice))} P3D`, colors.cyan);
        contract = await factory.deploy(...constructorArgs);
    }
    
    const receipt = await contract.deployTransaction.wait();
    const gasUsed = receipt.gasUsed;
    // Use the actual effective gas price from the receipt, or fall back to our maxFeePerGas or gasPrice
    const effectiveGasPrice = receipt.effectiveGasPrice || maxFeePerGas || gasPrice;
    const gasCost = gasUsed.mul(effectiveGasPrice);
    const gasCostEth = ethers.utils.formatEther(gasCost);
    const gasCostWei = gasCost.toString();
    
    log(`  ${colors.green}✓ Deployed ${contractJson.contractName} to: ${contract.address}${colors.reset}`);
    log(`  ${colors.cyan}  Gas used: ${gasUsed.toString()} | Cost: ${gasCostEth} P3D | ${gasCostWei} wei${colors.reset}`);
    
    // Compare estimation vs actual
    if (estimatedGasCost) {
        const difference = gasCost.sub(estimatedGasCost);
        const differencePercent = estimatedGasCost.gt(0) ? difference.mul(100).div(estimatedGasCost).toString() : '0';
        if (difference.gt(0)) {
            log(`  ${colors.yellow}  Estimation vs Actual: +${ethers.utils.formatEther(difference)} P3D (+${differencePercent}%)${colors.reset}`);
        } else if (difference.lt(0)) {
            log(`  ${colors.green}  Estimation vs Actual: ${ethers.utils.formatEther(difference)} P3D (${differencePercent}%)${colors.reset}`);
        } else {
            log(`  ${colors.green}  Estimation vs Actual: Perfect match!${colors.reset}`);
        }
    }
    
    return { contract, gasUsed, gasCost, gasCostEth, gasCostWei, estimatedGasCost, estimatedGasCostWei, estimatedGasCostEth };
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
    
    // Track total deployment costs
    let totalGasUsed = ethers.BigNumber.from(0);
    let totalGasCost = ethers.BigNumber.from(0);
    const deploymentCosts = [];

    let signer; // Make signer accessible in catch block
    try {
        const provider = getProvider('3DPass');
        // Load mnemonic from keys.json
        const mnemonic = JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase;
        if (!mnemonic) {
            throw new Error('Mnemonic phrase not found in keys.json');
        }
        signer = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);
        log(`Deploying using account: ${signer.address}`);
        
        // Check P3D balance before starting deployment
        log('Checking P3D balance before deployment...', colors.cyan);
        const balanceInfo = await checkP3DBalance(signer);
        if (balanceInfo.balance.isZero()) {
            log('⚠️  Warning: P3D balance is 0. Deployment may fail due to insufficient funds.', colors.yellow);
        } else {
            log(`✓ P3D balance check passed: ${balanceInfo.balanceFormatted} P3D available`, colors.green);
        }
        
        // Estimate total deployment costs
        const costEstimate = await estimateTotalDeploymentCost(signer);
        
        // Ask for confirmation if insufficient balance
        if (!costEstimate.sufficientBalance) {
            log('\n❌ Deployment cannot proceed due to insufficient balance!', colors.red);
            log('Please fund the account with more P3D tokens before running deployment.', colors.red);
            process.exit(1);
        }
        
        log('\n🚀 Proceeding with deployment...', colors.green);

        // Check for existing deployments and continue from current point
        let csLib, oracle;
        
        // 1. Check for existing CounterstakeLibrary deployment
        const existingCsLibAddress = "0xe0BaE9D4390921daa1D53B273FB7680879a81976";
        try {
            const code = await signer.provider.getCode(existingCsLibAddress);
            if (code && code !== "0x") {
                log(`✓ Found existing CounterstakeLibrary at: ${existingCsLibAddress}`, colors.green);
                csLib = new ethers.Contract(existingCsLibAddress, CounterstakeLibrary.abi, signer);
                log('  Using existing CounterstakeLibrary deployment', colors.cyan);
            } else {
                throw new Error("No existing deployment found");
            }
        } catch (error) {
            log('Deploying CounterstakeLibrary...');
            const csLibResult = await deployContract(CounterstakeLibrary, signer, { 
                gasLimit: 5000000,
                maxFeePerGas: 100  // Set to 100 wei (current base fee is 8 wei)
            });
            csLib = csLibResult.contract;
            totalGasUsed = totalGasUsed.add(csLibResult.gasUsed);
            totalGasCost = totalGasCost.add(csLibResult.gasCost);
            deploymentCosts.push({ name: 'CounterstakeLibrary', gasUsed: csLibResult.gasUsed, cost: csLibResult.gasCostEth });
        }

        // 2. Link CounterstakeLibrary into Export, ImportWrapper, ExportAssistant
        link(Export, 'CounterstakeLibrary', csLib.address);
        link(ImportWrapper, 'CounterstakeLibrary', csLib.address);
        link(ExportAssistant, 'CounterstakeLibrary', csLib.address);

        // 3. Check for existing Oracle deployment
        const existingOracleAddress = "0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB";
        try {
            const code = await signer.provider.getCode(existingOracleAddress);
            if (code && code !== "0x") {
                log(`✓ Found existing Oracle at: ${existingOracleAddress}`, colors.green);
                oracle = new ethers.Contract(existingOracleAddress, Oracle.abi, signer);
                log('  Using existing Oracle deployment', colors.cyan);
            } else {
                throw new Error("No existing deployment found");
            }
        } catch (error) {
            log('Deploying Oracle...');
            const oracleResult = await deployContract(Oracle, signer, { maxFeePerGas: 100 });
            oracle = oracleResult.contract;
            totalGasUsed = totalGasUsed.add(oracleResult.gasUsed);
            totalGasCost = totalGasCost.add(oracleResult.gasCost);
            deploymentCosts.push({ name: 'Oracle', gasUsed: oracleResult.gasUsed, cost: oracleResult.gasCostEth });
        }

        // Helper function to set Oracle price if not already set
        async function setOraclePriceIfNeeded(tokenA, tokenB, priceA, priceB, description) {
            try {
                // Check if price is already set by trying to get it
                const [existingPriceA, existingPriceB] = await oracle.getPrice(tokenA, tokenB);
                if (existingPriceA && existingPriceA.gt(0) && existingPriceB && existingPriceB.gt(0)) {
                    log(`  ✓ Price already set for ${description}`, colors.green);
                    return;
                }
            } catch (error) {
                // Price not set, proceed to set it
            }
            
            log(`Setting price to the Oracle for ${description}...`);
            try {
                // Use explicit gas limit and fee parameters to avoid estimation issues
                const tx = await oracle.connect(signer).setPrice(tokenA, tokenB, priceA, priceB, {
                    gasLimit: 100000,  // Set explicit gas limit
                    maxFeePerGas: 100,
                    maxPriorityFeePerGas: 10
                });
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed;
                const gasCost = gasUsed.mul(await signer.getGasPrice());
                totalGasUsed = totalGasUsed.add(gasUsed);
                totalGasCost = totalGasCost.add(gasCost);
                log(`  ✓ Price set to the Oracle for ${description}`);
                log(`  ${colors.cyan}  Oracle setPrice gas: ${gasUsed.toString()} | Cost: ${ethers.utils.formatEther(gasCost)} P3D${colors.reset}`);
            } catch (err) {
                log(`  ✗ Failed to set price to the Oracle for ${description}`, err);
                throw err;
            }
        }

        // Set Oracle prices (skip if already set)
        await setOraclePriceIfNeeded("wUSDT", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'), "wUSDT");

        await setOraclePriceIfNeeded("_NATIVE_", "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'), "_NATIVE_");
        await setOraclePriceIfNeeded("P3D", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), "P3D");

        await setOraclePriceIfNeeded("_NATIVE", "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), "_NATIVE vs P3D");
        await setOraclePriceIfNeeded(usdtEthAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'), "ETH vs P3D");
        await setOraclePriceIfNeeded(usdtEthAddress, "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'), "ETH vs _NATIVE_");

        await setOraclePriceIfNeeded(usdtEthAddress, "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'), "ETH vs wUSDT");
        await setOraclePriceIfNeeded("wUSDT", usdtEthAddress, ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'), "wUSDT vs ETH");

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


        // 4. Deploy VotedValue contracts
        log('Deploying VotedValue contracts...');
        const votedValueUintResult = await deployContract(VotedValueUint, signer, { maxFeePerGas: 100 });
        const votedValueUint = votedValueUintResult.contract;
        totalGasUsed = totalGasUsed.add(votedValueUintResult.gasUsed);
        totalGasCost = totalGasCost.add(votedValueUintResult.gasCost);
        deploymentCosts.push({ name: 'VotedValueUint', gasUsed: votedValueUintResult.gasUsed, cost: votedValueUintResult.gasCostEth });

        const votedValueUintArrayResult = await deployContract(VotedValueUintArray, signer, { maxFeePerGas: 100 });
        const votedValueUintArray = votedValueUintArrayResult.contract;
        totalGasUsed = totalGasUsed.add(votedValueUintArrayResult.gasUsed);
        totalGasCost = totalGasCost.add(votedValueUintArrayResult.gasCost);
        deploymentCosts.push({ name: 'VotedValueUintArray', gasUsed: votedValueUintArrayResult.gasUsed, cost: votedValueUintArrayResult.gasCostEth });

        const votedValueAddressResult = await deployContract(VotedValueAddress, signer, { maxFeePerGas: 100 });
        const votedValueAddress = votedValueAddressResult.contract;
        totalGasUsed = totalGasUsed.add(votedValueAddressResult.gasUsed);
        totalGasCost = totalGasCost.add(votedValueAddressResult.gasCost);
        deploymentCosts.push({ name: 'VotedValueAddress', gasUsed: votedValueAddressResult.gasUsed, cost: votedValueAddressResult.gasCostEth });

        const votedValueFactoryResult = await deployContract(VotedValueFactory, signer, 
            votedValueUint.address,
            votedValueUintArray.address,
            votedValueAddress.address,
            { maxFeePerGas: 100 }
        );
        const votedValueFactory = votedValueFactoryResult.contract;
        totalGasUsed = totalGasUsed.add(votedValueFactoryResult.gasUsed);
        totalGasCost = totalGasCost.add(votedValueFactoryResult.gasCost);
        deploymentCosts.push({ name: 'VotedValueFactory', gasUsed: votedValueFactoryResult.gasUsed, cost: votedValueFactoryResult.gasCostEth });

        // 5. Deploy Governance contracts
        log('Deploying Governance contracts...');
        // Use P3D precompile address for voting token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Governance voting token");
        const governanceResult = await deployContract(Governance, signer, csLib.address, P3D_PRECOMPILE_ADDRESS, { maxFeePerGas: 100 });
        const governance = governanceResult.contract;
        totalGasUsed = totalGasUsed.add(governanceResult.gasUsed);
        totalGasCost = totalGasCost.add(governanceResult.gasCost);
        deploymentCosts.push({ name: 'Governance', gasUsed: governanceResult.gasUsed, cost: governanceResult.gasCostEth });
        
        const governanceFactoryResult = await deployContract(GovernanceFactory, signer, governance.address, { maxFeePerGas: 100 });
        const governanceFactory = governanceFactoryResult.contract;
        totalGasUsed = totalGasUsed.add(governanceFactoryResult.gasUsed);
        totalGasCost = totalGasCost.add(governanceFactoryResult.gasCost);
        deploymentCosts.push({ name: 'GovernanceFactory', gasUsed: governanceFactoryResult.gasUsed, cost: governanceFactoryResult.gasCostEth });

        // 6. Deploy Export contract
        log('Deploying Export...');
        // Use P3D precompile address for stake token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "Export stake token");
        const exportMasterResult = await deployContract(Export, signer,
            "3DPass", // foreign_network (foreign for USDT)
            wUsdt3DPassAddress, // foreign_asset (wUSDT precompile address from Import bridge)
            P3D_PRECOMPILE_ADDRESS, // tokenAddr (stake token is P3D)
            160, // counterstake_coef100
            110, // ratio100
            ethers.utils.parseEther('10000'), // large_threshold (matching bridge-setup-and-test.js)
            CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
            CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
            { maxFeePerGas: 100 }
        );
        const exportMaster = exportMasterResult.contract;
        totalGasUsed = totalGasUsed.add(exportMasterResult.gasUsed);
        totalGasCost = totalGasCost.add(exportMasterResult.gasCost);
        deploymentCosts.push({ name: 'Export', gasUsed: exportMasterResult.gasUsed, cost: exportMasterResult.gasCostEth });

        // 7-9. Deploy remaining contracts
        log('Deploying remaining contracts...');
        
        // Deploy ImportWrapper
        log('Deploying ImportWrapper...');
        // Use P3D precompile address for stake token on 3DPass
        validateTokenAddressFor3DPass(P3D_PRECOMPILE_ADDRESS, "ImportWrapper stake token");
        const importWrapperMasterResult = await deployContract(ImportWrapper, signer,
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
            { gasLimit: 9000000, maxFeePerGas: 100 } // High gas limit for complex constructor
        );
        const importWrapperMaster = importWrapperMasterResult.contract;
        totalGasUsed = totalGasUsed.add(importWrapperMasterResult.gasUsed);
        totalGasCost = totalGasCost.add(importWrapperMasterResult.gasCost);
        deploymentCosts.push({ name: 'ImportWrapper', gasUsed: importWrapperMasterResult.gasUsed, cost: importWrapperMasterResult.gasCostEth });

        // Deploy BridgesRegistry
        log('Deploying BridgesRegistry...');
        log(`BridgesRegistry contract: ${BridgesRegistry ? 'loaded' : 'NOT LOADED'}`);
        log(`BridgesRegistry contractName: ${BridgesRegistry?.contractName || 'undefined'}`);
        const bridgesRegistryResult = await deployContract(BridgesRegistry, signer, { maxFeePerGas: 100 });
        const bridgesRegistry = bridgesRegistryResult.contract;
        totalGasUsed = totalGasUsed.add(bridgesRegistryResult.gasUsed);
        totalGasCost = totalGasCost.add(bridgesRegistryResult.gasCost);
        deploymentCosts.push({ name: 'BridgesRegistry', gasUsed: bridgesRegistryResult.gasUsed, cost: bridgesRegistryResult.gasCostEth });

        // Deploy CounterstakeFactory
        log('Deploying CounterstakeFactory...');
        log(`bridgesRegistry.address: ${bridgesRegistry.address}`);
        const counterstakeFactoryResult = await deployContract(
            CounterstakeFactory,
            signer,
            exportMaster.address,
            importWrapperMaster.address,
            governanceFactory.address,
            votedValueFactory.address,
            bridgesRegistry.address,
            { maxFeePerGas: 100 }
        );
        const counterstakeFactory = counterstakeFactoryResult.contract;
        totalGasUsed = totalGasUsed.add(counterstakeFactoryResult.gasUsed);
        totalGasCost = totalGasCost.add(counterstakeFactoryResult.gasCost);
        deploymentCosts.push({ name: 'CounterstakeFactory', gasUsed: counterstakeFactoryResult.gasUsed, cost: counterstakeFactoryResult.gasCostEth });

        // 10. Deploy Assistant contracts
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
        
        // Deploy ExportAssistant
        const exportAssistantResult = await deployContract(ExportAssistant, signer,
            exportMaster.address, // bridgeAddr
            ethers.constants.AddressZero, // managerAddr
            100, // _management_fee10000
            2500, // _success_fee10000 (matching bridge-setup-and-test.js: 25%)
            oracle.address, // oracleAddr
            1, // _exponent
            "EXPS export assistant temp", // name
            "EXPS", // symbol
            { gasLimit: 90000000, maxFeePerGas: 100 } // Higher gas limit for assistant deployment
        );
        const exportAssistant = exportAssistantResult.contract;
        totalGasUsed = totalGasUsed.add(exportAssistantResult.gasUsed);
        totalGasCost = totalGasCost.add(exportAssistantResult.gasCost);
        deploymentCosts.push({ name: 'ExportAssistant', gasUsed: exportAssistantResult.gasUsed, cost: exportAssistantResult.gasCostEth });

        // Deploy ImportWrapperAssistant
        const importWrapperAssistantResult = await deployContract(ImportWrapperAssistant, signer,
            importWrapperMaster.address, // bridgeAddr
            ethers.constants.AddressZero, // managerAddr
            100, // _management_fee10000
            2000, // _success_fee10000 (matching bridge-setup-and-test.js: 20%)
            10, // _swap_fee10000
            1, // _exponent
            "IMPS import assistant temp", // name
            "IMPS", // symbol
            { gasLimit: 119990000, maxFeePerGas: 100 } // Gas limit for assistant deployment
        );
        const importWrapperAssistant = importWrapperAssistantResult.contract;
        totalGasUsed = totalGasUsed.add(importWrapperAssistantResult.gasUsed);
        totalGasCost = totalGasCost.add(importWrapperAssistantResult.gasCost);
        deploymentCosts.push({ name: 'ImportWrapperAssistant', gasUsed: importWrapperAssistantResult.gasUsed, cost: importWrapperAssistantResult.gasCostEth });

        // 11. Deploy AssistantFactory
        log('Deploying AssistantFactory...');
        const assistantFactoryResult = await deployContract(AssistantFactory, signer,
            exportAssistant.address,
            importWrapperAssistant.address,
            governanceFactory.address,
            votedValueFactory.address,
            bridgesRegistry.address,
            { maxFeePerGas: 100 }
        );
        const assistantFactory = assistantFactoryResult.contract;
        totalGasUsed = totalGasUsed.add(assistantFactoryResult.gasUsed);
        totalGasCost = totalGasCost.add(assistantFactoryResult.gasCost);
        deploymentCosts.push({ name: 'AssistantFactory', gasUsed: assistantFactoryResult.gasUsed, cost: assistantFactoryResult.gasCostEth });

        // Helper function to set registry factories if not already set
        async function setRegistryFactoriesIfNeeded() {
            try {
                // Check if factories are already set by trying to get them
                const existingCounterstakeFactory = await bridgesRegistry.counterstakeFactory();
                const existingAssistantFactory = await bridgesRegistry.assistantFactory();
                
                if (existingCounterstakeFactory !== ethers.constants.AddressZero && 
                    existingAssistantFactory !== ethers.constants.AddressZero) {
                    log('  ✓ Factory addresses already set in BridgesRegistry', colors.green);
                    return;
                }
            } catch (error) {
                // Factories not set, proceed to set them
            }
            
            log('Setting factory addresses in BridgesRegistry...');
            try {
                // Use explicit gas limit and fee parameters to avoid estimation issues
                const tx = await bridgesRegistry.setFactories(counterstakeFactory.address, assistantFactory.address, {
                    gasLimit: 200000,  // Set explicit gas limit
                    maxFeePerGas: 100,
                    maxPriorityFeePerGas: 10
                });
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed;
                const gasCost = gasUsed.mul(await signer.getGasPrice());
                totalGasUsed = totalGasUsed.add(gasUsed);
                totalGasCost = totalGasCost.add(gasCost);
                log('  ✓ Factory addresses set in BridgesRegistry');
                log(`  ${colors.cyan}  Registry setFactories gas: ${gasUsed.toString()} | Cost: ${ethers.utils.formatEther(gasCost)} P3D${colors.reset}`);
            } catch (err) {
                log('  ✗ Failed to set factory addresses in BridgesRegistry', err);
                throw err;
            }
        }

        // 12. Set factory addresses in the registry (skip if already set)
        await setRegistryFactoriesIfNeeded();

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
        
        // Gas cost summary
        log('\n--- Gas Cost Summary ---', colors.cyan);
        log('Contract Deployment Costs:', colors.yellow);
        deploymentCosts.forEach(cost => {
            log(`  ${cost.name.padEnd(25)} | Gas: ${cost.gasUsed.toString().padStart(10)} | Cost: ${cost.cost.padStart(15)} P3D`);
        });
        
        const totalGasCostEth = ethers.utils.formatEther(totalGasCost);
        log('\n' + '='.repeat(70), colors.cyan);
        log(`TOTAL GAS USED: ${totalGasUsed.toString()}`, colors.yellow);
        log(`TOTAL COST:     ${totalGasCostEth} P3D`, colors.yellow);
        log(`TOTAL COST:     ${ethers.utils.formatUnits(totalGasCost, 'wei')} wei (min units)`, colors.yellow);
        log('='.repeat(70), colors.cyan);
        
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
        log('\n--- Deployment Failed ---', colors.red);
        log(err, colors.red);
        
        // Print the P3D balance of the deployment account for diagnostics
        try {
            if (signer) {
                log('Fetching P3D balance for diagnostics...', colors.yellow);
                const balanceInfo = await checkP3DBalance(signer);
                log(`Current P3D balance: ${balanceInfo.balanceFormatted} P3D`, colors.yellow);
                
                // Also check ETH balance for comparison
                const ethBalance = await signer.getBalance();
                log(`ETH balance: ${ethers.utils.formatEther(ethBalance)} ETH`, colors.yellow);
                
                if (balanceInfo.balance.isZero()) {
                    log('❌ P3D balance is 0 - this is likely the cause of deployment failure', colors.red);
                    log('Please fund the account with P3D tokens before running deployment', colors.red);
                }
            } else {
                log('Signer is not defined, cannot fetch balance.', colors.red);
            }
        } catch (balanceErr) {
            log('Failed to fetch deployment account balance:', balanceErr, colors.red);
        }
        process.exit(1);
    }
}

main(); 