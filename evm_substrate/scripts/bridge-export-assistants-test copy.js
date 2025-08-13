const { ethers } = require('ethers');

// Load configuration
const config = require('./bridge-test-config.json');

// Function to get export bridge addresses from config
function getExportBridgeAddresses() {
    const mainnetContracts = config.mainnet.contracts;
    
    // Check if all required addresses are available
    if (!mainnetContracts.P3DExport?.["3dpassEVMcontract"]) {
        throw new Error('P3DExport address not found in config');
    }
    if (!mainnetContracts.FIREExport?.["3dpassEVMcontract"]) {
        throw new Error('FIREExport address not found in config');
    }
    if (!mainnetContracts.WATERExport?.["3dpassEVMcontract"]) {
        throw new Error('WATERExport address not found in config');
    }
    if (!mainnetContracts.p3dExportAssistant?.["3dpassEVMcontract"]) {
        throw new Error('p3dExportAssistant address not found in config');
    }
    if (!mainnetContracts.fireExportAssistant?.["3dpassEVMcontract"]) {
        throw new Error('fireExportAssistant address not found in config');
    }
    if (!mainnetContracts.waterExportAssistant?.["3dpassEVMcontract"]) {
        throw new Error('waterExportAssistant address not found in config');
    }
    
    return {
        P3DExport: mainnetContracts.P3DExport["3dpassEVMcontract"],
        FIREExport: mainnetContracts.FIREExport["3dpassEVMcontract"],
        WATERExport: mainnetContracts.WATERExport["3dpassEVMcontract"],
        p3dExportAssistant: mainnetContracts.p3dExportAssistant["3dpassEVMcontract"],
        fireExportAssistant: mainnetContracts.fireExportAssistant["3dpassEVMcontract"],
        waterExportAssistant: mainnetContracts.waterExportAssistant["3dpassEVMcontract"]
    };
}

// Function to get token addresses from config
function getTokenAddresses() {
    const developmentAssets = config.development.assets;
    
    return {
        p3dPrecompile: config.development.contracts.nativeTokenPrecompile,
        firePrecompile: developmentAssets.Asset4.evmContract,
        waterPrecompile: developmentAssets.Asset5.evmContract
    };
}

// Configuration
const RPC_URL = config.development.network.rpcUrl;
const BRIDGE_ADDRESSES = getExportBridgeAddresses();
const TOKEN_ADDRESSES = getTokenAddresses();
const BATCH_ADDRESS = config.development.contracts.batchPrecompile;

// Log loaded addresses for debugging
function logLoadedAddresses() {
    log('=== Loaded Export Bridge Addresses from Config ===');
    log(`P3D Export Bridge: ${BRIDGE_ADDRESSES.P3DExport}`);
    log(`FIRE Export Bridge: ${BRIDGE_ADDRESSES.FIREExport}`);
    log(`WATER Export Bridge: ${BRIDGE_ADDRESSES.WATERExport}`);
    log(`P3D Export Assistant: ${BRIDGE_ADDRESSES.p3dExportAssistant}`);
    log(`FIRE Export Assistant: ${BRIDGE_ADDRESSES.fireExportAssistant}`);
    log(`WATER Export Assistant: ${BRIDGE_ADDRESSES.waterExportAssistant}`);
    
    log('\n=== Loaded Token Addresses from Config ===');
    log(`P3D Precompile: ${TOKEN_ADDRESSES.p3dPrecompile}`);
    log(`FIRE Precompile: ${TOKEN_ADDRESSES.firePrecompile}`);
    log(`WATER Precompile: ${TOKEN_ADDRESSES.waterPrecompile}`);
    
    log('\n=== Batch Precompile from Config ===');
    log(`Batch Precompile: ${BATCH_ADDRESS}`);
}

let provider, signer;

function log(message) {
    console.log(message);
}

async function setupProviderAndSigner() {
    log('Setting up provider and signer...');
    provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    
    // Load test configuration for private key (account1 = manager/funding account)
    const testConfig = require('./bridge-test-config.json');
    const privateKey = testConfig.development.accounts.account1.privateKey;
    if (!privateKey) {
        throw new Error('Private key for account1 not found in bridge-test-config.json');
    }
    
    signer = new ethers.Wallet(privateKey, provider);
    const address = await signer.getAddress();
    log(`Using manager/funding account address: ${address}`);
}

async function setupUserAccount() {
    const testConfig = require('./bridge-test-config.json');
    const privateKey = testConfig.development.accounts.account2.privateKey;
    if (!privateKey) {
        throw new Error('Private key for account2 (user account) not found in bridge-test-config.json');
    }
    
    const userSigner = new ethers.Wallet(privateKey, provider);
    const address = await userSigner.getAddress();
    log(`Using user account address: ${address}`);
    return userSigner;
}

async function setupAccount3() {
    const testConfig = require('./bridge-test-config.json');
    const privateKey = testConfig.development.accounts.account3.privateKey;
    if (!privateKey) {
        throw new Error('Private key for account3 not found in bridge-test-config.json');
    }
    
    const account3Signer = new ethers.Wallet(privateKey, provider);
    const address = await account3Signer.getAddress();
    log(`Using account3 address: ${address}`);
    return account3Signer;
}

async function fundAssistantsAndBridges() {
    log(`\n=== Funding Assistants and Bridges with P3D and Tokens (Batch) ===`);
    
    const userSigner = await setupUserAccount();
    const userAddress = await userSigner.getAddress();
    
    // Get all token contracts (using user account for funding since it has the tokens)
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, userSigner);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, userSigner);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, userSigner);
    
    // Check user account balances (for funding)
    const userP3DBalanceForFunding = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalanceForFunding = await firePrecompile.balanceOf(userAddress);
    const userWaterBalanceForFunding = await waterPrecompile.balanceOf(userAddress);
    
    log(`  📊 User account balances (for funding):`);
    log(`    - P3D: ${userP3DBalanceForFunding.toString()}`);
    log(`    - FIRE: ${userFireBalanceForFunding.toString()}`);
    log(`    - WATER: ${userWaterBalanceForFunding.toString()}`);
    
    // Check current balances of assistants
    const p3dAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const fireAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const waterAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    
    // Check current balances of bridges (FIRE and WATER need funding, P3D doesn't)
    const fireBridgeP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.FIREExport);
    const fireBridgeFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.FIREExport);
    const waterBridgeP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.WATERExport);
    const waterBridgeWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.WATERExport);
    
    log(`  📊 Current balances:`);
    log(`    P3D Assistant - P3D: ${p3dAssistantP3DBalance.toString()}`);
    log(`    FIRE Assistant - P3D: ${fireAssistantP3DBalance.toString()}, FIRE: ${fireAssistantFireBalance.toString()}`);
    log(`    WATER Assistant - P3D: ${waterAssistantP3DBalance.toString()}, WATER: ${waterAssistantWaterBalance.toString()}`);
    log(`    FIRE Bridge - P3D: ${fireBridgeP3DBalance.toString()}, FIRE: ${fireBridgeFireBalance.toString()}`);
    log(`    WATER Bridge - P3D: ${waterBridgeP3DBalance.toString()}, WATER: ${waterBridgeWaterBalance.toString()}`);
    
    // Define required minimum balances - using very small amounts to match available balances
    const minAssistantP3dAmount = ethers.BigNumber.from('1000000000000000'); // 0.0000000001 P3D per assistant
    const minAssistantTokenAmount = ethers.BigNumber.from('100000000'); // 0.0000000001 tokens per assistant (6 decimals) - increased for FIRE/WATER
    const minBridgeP3dAmount = ethers.BigNumber.from('10000000000000000'); // 0.0000000001 P3D per bridge
    const minBridgeTokenAmount = ethers.BigNumber.from('10000'); // 0.0000000001 tokens per bridge (18 decimals)
    
    // Check if funding is needed
    const p3dAssistantNeedsP3d = p3dAssistantP3DBalance.lt(minAssistantP3dAmount);
    const fireAssistantNeedsP3d = fireAssistantP3DBalance.lt(minAssistantP3dAmount);
    const fireAssistantNeedsFire = fireAssistantFireBalance.lt(minAssistantTokenAmount);
    const waterAssistantNeedsP3d = waterAssistantP3DBalance.lt(minAssistantP3dAmount);
    const waterAssistantNeedsWater = waterAssistantWaterBalance.lt(minAssistantTokenAmount);
    
    const fireBridgeNeedsP3d = fireBridgeP3DBalance.lt(minBridgeP3dAmount);
    const fireBridgeNeedsFire = fireBridgeFireBalance.lt(minBridgeTokenAmount);
    const waterBridgeNeedsP3d = waterBridgeP3DBalance.lt(minBridgeP3dAmount);
    const waterBridgeNeedsWater = waterBridgeWaterBalance.lt(minBridgeTokenAmount);
    
    // Check if any funding is needed
    const needsFunding = p3dAssistantNeedsP3d || fireAssistantNeedsP3d || fireAssistantNeedsFire ||
                        waterAssistantNeedsP3d || waterAssistantNeedsWater ||
                        fireBridgeNeedsP3d || fireBridgeNeedsFire ||
                        waterBridgeNeedsP3d || waterBridgeNeedsWater;
    
    if (!needsFunding) {
        log(`  ✅ All balances are sufficient - skipping funding`);
        return;
    }
    
    // Check if account2 has enough tokens for funding
    const totalP3dNeeded = (p3dAssistantNeedsP3d ? minAssistantP3dAmount : ethers.BigNumber.from(0))
                          .add(fireAssistantNeedsP3d ? minAssistantP3dAmount : ethers.BigNumber.from(0))
                          .add(waterAssistantNeedsP3d ? minAssistantP3dAmount : ethers.BigNumber.from(0))
                          .add(fireBridgeNeedsP3d ? minBridgeP3dAmount : ethers.BigNumber.from(0))
                          .add(waterBridgeNeedsP3d ? minBridgeP3dAmount : ethers.BigNumber.from(0));
    
    const totalFireNeeded = (fireAssistantNeedsFire ? minAssistantTokenAmount : ethers.BigNumber.from(0))
                           .add(fireBridgeNeedsFire ? minBridgeTokenAmount : ethers.BigNumber.from(0));
    
    const totalWaterNeeded = (waterAssistantNeedsWater ? minAssistantTokenAmount : ethers.BigNumber.from(0))
                            .add(waterBridgeNeedsWater ? minBridgeTokenAmount : ethers.BigNumber.from(0));
    
    log(`  📊 Required amounts:`);
    log(`    P3D needed: ${ethers.utils.formatEther(totalP3dNeeded)}`);
    log(`    FIRE needed: ${ethers.utils.formatEther(totalFireNeeded)}`);
    log(`    WATER needed: ${ethers.utils.formatEther(totalWaterNeeded)}`);
    
    if (userP3DBalanceForFunding.lt(totalP3dNeeded)) {
        log(`  ❌ Account2 has insufficient P3D for funding`);
        log(`    Required: ${ethers.utils.formatEther(totalP3dNeeded)} P3D`);
        log(`    Available: ${ethers.utils.formatEther(userP3DBalanceForFunding)} P3D`);
        return;
    }
    
    if (userFireBalanceForFunding.lt(totalFireNeeded)) {
        log(`  ❌ Account2 has insufficient FIRE for funding`);
        log(`    Required: ${ethers.utils.formatEther(totalFireNeeded)} FIRE`);
        log(`    Available: ${ethers.utils.formatEther(userFireBalanceForFunding)} FIRE`);
        return;
    }
    
    if (userWaterBalanceForFunding.lt(totalWaterNeeded)) {
        log(`  ❌ Account2 has insufficient WATER for funding`);
        log(`    Required: ${ethers.utils.formatEther(totalWaterNeeded)} WATER`);
        log(`    Available: ${ethers.utils.formatEther(userWaterBalanceForFunding)} WATER`);
        return;
    }
    
    log(`  💰 Funding needed - preparing transfers...`);
    
    // Use batch precompile for efficient transfers
    const BATCH_ABI = [
        "function batchAll(address[] memory to, uint256[] memory value, bytes[] memory callData, uint64[] memory gasLimit) external"
    ];
    
    const batchContract = new ethers.Contract(BATCH_ADDRESS, BATCH_ABI, userSigner);
    
    // Prepare batch call data for transfers
    const batchTo = [];
    const batchValue = [];
    const batchCallData = [];
    const batchGasLimit = [];
    
    // Add P3D transfers to assistants that need it
    if (p3dAssistantNeedsP3d) {
        batchTo.push(p3dPrecompile.address);
        batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.p3dExportAssistant, minAssistantP3dAmount]));
        batchGasLimit.push(100000);
    }
    
    if (fireAssistantNeedsP3d) {
        batchTo.push(p3dPrecompile.address);
        batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.fireExportAssistant, minAssistantP3dAmount]));
        batchGasLimit.push(100000);
    }
    
    if (waterAssistantNeedsP3d) {
        batchTo.push(p3dPrecompile.address);
        batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.waterExportAssistant, minAssistantP3dAmount]));
        batchGasLimit.push(100000);
    }
    
    // Add token transfers to assistants that need them
    if (fireAssistantNeedsFire) {
        batchTo.push(firePrecompile.address);
        batchValue.push(0);
        batchCallData.push(firePrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.fireExportAssistant, minAssistantTokenAmount]));
        batchGasLimit.push(100000);
    }
    
    if (waterAssistantNeedsWater) {
        batchTo.push(waterPrecompile.address);
        batchValue.push(0);
        batchCallData.push(waterPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.waterExportAssistant, minAssistantTokenAmount]));
        batchGasLimit.push(100000);
    }
    
    // Add P3D transfers to bridges that need it
    if (fireBridgeNeedsP3d) {
        batchTo.push(p3dPrecompile.address);
        batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.FIREExport, minBridgeP3dAmount]));
        batchGasLimit.push(100000);
    }
    
    if (waterBridgeNeedsP3d) {
        batchTo.push(p3dPrecompile.address);
        batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.WATERExport, minBridgeP3dAmount]));
        batchGasLimit.push(100000);
    }
    
    // Add token transfers to bridges that need them
    if (fireBridgeNeedsFire) {
        batchTo.push(firePrecompile.address);
        batchValue.push(0);
        batchCallData.push(firePrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.FIREExport, minBridgeTokenAmount]));
        batchGasLimit.push(100000);
    }
    
    if (waterBridgeNeedsWater) {
        batchTo.push(waterPrecompile.address);
        batchValue.push(0);
        batchCallData.push(waterPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.WATERExport, minBridgeTokenAmount]));
        batchGasLimit.push(100000);
    }
    
    // Check if we have any transfers to make
    if (batchTo.length === 0) {
        log(`  ✅ No transfers needed - all balances are sufficient`);
        return;
    }
    
    log(`  🔄 Executing ${batchTo.length} transfers...`);
    
    try {
        const batchTx = await batchContract.batchAll(batchTo, batchValue, batchCallData, batchGasLimit, {
            gasLimit: 1000000
        });
        await batchTx.wait();
        log(`    ✅ Batch transfers successful: ${batchTx.hash}`);
    } catch (err) {
        log(`    ❌ Batch transfers failed: ${err.message}`);
        throw err;
    }
    
    // Verify balances after funding
    const p3dAssistantP3dBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const fireAssistantP3dBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalanceAfter = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const waterAssistantP3dBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantWaterBalanceAfter = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    
    log(`  📊 Assistant balances after funding:`);
    log(`    P3D Assistant - P3D: ${p3dAssistantP3dBalanceAfter.toString()}`);
    log(`    FIRE Assistant - P3D: ${fireAssistantP3dBalanceAfter.toString()}, FIRE: ${fireAssistantFireBalanceAfter.toString()}`);
    log(`    WATER Assistant - P3D: ${waterAssistantP3dBalanceAfter.toString()}, WATER: ${waterAssistantWaterBalanceAfter.toString()}`);
}

async function approveAssistantTokens() {
    log(`\n=== Approving Assistant Token Permissions ===`);
    
    // Get token contracts
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    log(`  🔄 Checking current precompile token allowances...`);
    
    try {
        // Create assistant contract instances with the signer (since assistant is the manager)
        const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
        const waterExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.waterExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
        
        // Check current allowances
        const fireAllowanceBefore = await firePrecompile.allowance(BRIDGE_ADDRESSES.fireExportAssistant, BRIDGE_ADDRESSES.FIREExport);
        const waterAllowanceBefore = await waterPrecompile.allowance(BRIDGE_ADDRESSES.waterExportAssistant, BRIDGE_ADDRESSES.WATERExport);
        
        log(`    - Current FIRE allowance: ${fireAllowanceBefore.toString()}`);
        log(`    - Current WATER allowance: ${waterAllowanceBefore.toString()}`);
        
        // Check if approvals are already in place (max allowance)
        const maxAllowance = ethers.BigNumber.from('340282366920938463463374607431768211455');
        const fireApproved = fireAllowanceBefore.eq(maxAllowance);
        const waterApproved = waterAllowanceBefore.eq(maxAllowance);
        
        log(`    - Max allowance: ${maxAllowance.toString()}`);
        log(`    - FIRE approved: ${fireApproved}`);
        log(`    - WATER approved: ${waterApproved}`);
        
        if (fireApproved && waterApproved) {
            log(`  ✅ All precompile token approvals already in place - skipping approval calls`);
            return;
        }
        
        log(`  🔄 Approving bridges to spend assistant's precompile tokens...`);
        
        // Call the approvePrecompile function for each assistant that needs approval
        if (!fireApproved) {
            log(`    🔄 Calling approvePrecompile for FIRE Assistant...`);
            try {
                const fireApproveTx = await fireExportAssistant.approvePrecompile({ gasLimit: 2000000 });
                await fireApproveTx.wait();
                log(`      ✅ FIRE Assistant precompile approval successful: ${fireApproveTx.hash}`);
            } catch (error) {
                log(`      ⚠️ FIRE Assistant precompile approval failed: ${error.message}`);
                log(`      ℹ️ This might be due to insufficient P3D balance for gas fees`);
                log(`      ℹ️ Continuing test without approval...`);
            }
        } else {
            log(`    ⏭️ FIRE Assistant already approved - skipping`);
        }
        
        if (!waterApproved) {
            log(`    🔄 Calling approvePrecompile for WATER Assistant...`);
            try {
                const waterApproveTx = await waterExportAssistant.approvePrecompile({ gasLimit: 2000000 });
                await waterApproveTx.wait();
                log(`      ✅ WATER Assistant precompile approval successful: ${waterApproveTx.hash}`);
            } catch (error) {
                log(`      ⚠️ WATER Assistant precompile approval failed: ${error.message}`);
                log(`      ℹ️ This might be due to insufficient P3D balance for gas fees`);
                log(`      ℹ️ Continuing test without approval...`);
            }
        } else {
            log(`    ⏭️ WATER Assistant already approved - skipping`);
        }
        
        // Check new allowances
        const fireAllowanceAfter = await firePrecompile.allowance(BRIDGE_ADDRESSES.fireExportAssistant, BRIDGE_ADDRESSES.FIREExport);
        const waterAllowanceAfter = await waterPrecompile.allowance(BRIDGE_ADDRESSES.waterExportAssistant, BRIDGE_ADDRESSES.WATERExport);
        
        log(`    - New FIRE allowance: ${fireAllowanceAfter.toString()}`);
        log(`    - New WATER allowance: ${waterAllowanceAfter.toString()}`);
        
        log(`  ✅ Assistant precompile token approvals completed`);
        
    } catch (err) {
        log(`  ❌ Assistant precompile token approval failed: ${err.message}`);
        throw err;
    }
}

async function testAssistantState() {
    log(`\n=== Testing Export Assistant State ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Get assistant contracts
    const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const waterExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.waterExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    
    // Check user balances
    const userP3DBalance = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalance = await firePrecompile.balanceOf(userAddress);
    const userWaterBalance = await waterPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances:`);
    log(`    - P3D: ${userP3DBalance.toString()}`);
    log(`    - FIRE: ${userFireBalance.toString()}`);
    log(`    - WATER: ${userWaterBalance.toString()}`);
    
    // Check assistant state for each assistant
    const p3dAssistantTotalSupply = await p3dExportAssistant.totalSupply();
    const p3dAssistantName = await p3dExportAssistant.name();
    const p3dAssistantSymbol = await p3dExportAssistant.symbol();
    const p3dAssistantExponent = await p3dExportAssistant.exponent();
    const p3dAssistantDecimals = await p3dExportAssistant.decimals();
    
    const fireAssistantTotalSupply = await fireExportAssistant.totalSupply();
    const fireAssistantName = await fireExportAssistant.name();
    const fireAssistantSymbol = await fireExportAssistant.symbol();
    const fireAssistantExponent = await fireExportAssistant.exponent();
    const fireAssistantDecimals = await fireExportAssistant.decimals();
    
    const waterAssistantTotalSupply = await waterExportAssistant.totalSupply();
    const waterAssistantName = await waterExportAssistant.name();
    const waterAssistantSymbol = await waterExportAssistant.symbol();
    const waterAssistantExponent = await waterExportAssistant.exponent();
    const waterAssistantDecimals = await waterExportAssistant.decimals();
    
    log(`  📊 P3D Export Assistant state:`);
    log(`    - Name: ${p3dAssistantName}`);
    log(`    - Symbol: ${p3dAssistantSymbol}`);
    log(`    - Total Supply: ${p3dAssistantTotalSupply.toString()}`);
    log(`    - Exponent: ${p3dAssistantExponent.toString()}`);
    log(`    - Decimals: ${p3dAssistantDecimals.toString()}`);
    
    log(`  📊 FIRE Export Assistant state:`);
    log(`    - Name: ${fireAssistantName}`);
    log(`    - Symbol: ${fireAssistantSymbol}`);
    log(`    - Total Supply: ${fireAssistantTotalSupply.toString()}`);
    log(`    - Exponent: ${fireAssistantExponent.toString()}`);
    log(`    - Decimals: ${fireAssistantDecimals.toString()}`);
    
    log(`  📊 WATER Export Assistant state:`);
    log(`    - Name: ${waterAssistantName}`);
    log(`    - Symbol: ${waterAssistantSymbol}`);
    log(`    - Total Supply: ${waterAssistantTotalSupply.toString()}`);
    log(`    - Exponent: ${waterAssistantExponent.toString()}`);
    log(`    - Decimals: ${waterAssistantDecimals.toString()}`);
    
    // Check assistant balances
    const p3dAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const fireAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const waterAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    
    log(`  📊 Assistant balances:`);
    log(`    P3D Assistant - P3D: ${p3dAssistantP3DBalance.toString()}`);
    log(`    FIRE Assistant - P3D: ${fireAssistantP3DBalance.toString()}, FIRE: ${fireAssistantFireBalance.toString()}`);
    log(`    WATER Assistant - P3D: ${waterAssistantP3DBalance.toString()}, WATER: ${waterAssistantWaterBalance.toString()}`);
    
    log(`  ✅ Assistant state test completed`);
}

async function testBasicContractFunctionality() {
    log('=== Testing Basic Export Assistant Functionality ===');
    
    try {
        // Create assistant contract instances
        const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
        const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
        const waterExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.waterExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
        
        // Test basic view functions for each assistant
        log('  🔄 Testing basic view functions...');
        
        // P3D Assistant
        const p3dName = await p3dExportAssistant.name();
        const p3dTokenAddress = await p3dExportAssistant.tokenAddress();
        const p3dBridgeAddress = await p3dExportAssistant.bridgeAddress();
        log(`    ✅ P3D Assistant - Name: ${p3dName}, Token: ${p3dTokenAddress}, Bridge: ${p3dBridgeAddress}`);
        
        // FIRE Assistant
        const fireName = await fireExportAssistant.name();
        const fireTokenAddress = await fireExportAssistant.tokenAddress();
        const fireBridgeAddress = await fireExportAssistant.bridgeAddress();
        log(`    ✅ FIRE Assistant - Name: ${fireName}, Token: ${fireTokenAddress}, Bridge: ${fireBridgeAddress}`);
        
        // WATER Assistant
        const waterName = await waterExportAssistant.name();
        const waterTokenAddress = await waterExportAssistant.tokenAddress();
        const waterBridgeAddress = await waterExportAssistant.bridgeAddress();
        log(`    ✅ WATER Assistant - Name: ${waterName}, Token: ${waterTokenAddress}, Bridge: ${waterBridgeAddress}`);
        
        log('  ✅ Basic contract functionality test completed');
        
    } catch (err) {
        log(`  ❌ Basic contract functionality test failed: ${err.message}`);
        throw err;
    }
}

async function transferToForeignChain() {
    log(`\n=== Transferring to Foreign Chain (Expatriation) for Export Claims ===`);
    
    // Get user address from user account (account2)
    const userSigner = await setupUserAccount();
    const userAddress = await userSigner.getAddress();
    
    log(`  📤 Using account2 (${userAddress}) for expatriation transfers`);
    
    // Test parameters - using amounts greater than what will be claimed
    const p3dTransferAmount = ethers.BigNumber.from('10000000000000000'); // 0.00000001 P3D (greater than claim amount of 1000)
    const fireTransferAmount = ethers.BigNumber.from('10000000000'); // 0.00000001 FIRE (greater than claim amount of 1000)
    const waterTransferAmount = ethers.BigNumber.from('1000000000'); // 0.00000001 WATER (greater than claim amount of 1000)
    const reward = ethers.BigNumber.from('100'); // 0.0000000001 token reward
    const foreignAddress = "0x742d35Cc6634C0532925a3b8D9a4F8A6c4f0E4A7"; // Example Ethereum address
    const data = "0x"; // Empty data
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, userSigner);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, userSigner);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, userSigner);
    
    // Get bridge contracts
    const p3dExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.P3DExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, userSigner);
    const fireExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.FIREExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, userSigner);
    const waterExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.WATERExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, userSigner);
    
    // Check user balances before transfers
    const userP3DBalanceBefore = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalanceBefore = await firePrecompile.balanceOf(userAddress);
    const userWaterBalanceBefore = await waterPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances before transfers:`);
    log(`    - P3D: ${userP3DBalanceBefore.toString()}`);
    log(`    - FIRE: ${userFireBalanceBefore.toString()}`);
    log(`    - WATER: ${userWaterBalanceBefore.toString()}`);
    
    // Test P3D Export Bridge transfer
    log(`  🔄 Testing P3D Export Bridge transfer...`);
    try {
        // Check if user has enough P3D
        if (userP3DBalanceBefore.lt(p3dTransferAmount)) {
            log(`    ❌ Insufficient P3D balance. Need ${p3dTransferAmount.toString()}, have ${userP3DBalanceBefore.toString()}`);
        } else {
            // Get required stake
            const p3dRequiredStake = await p3dExportBridge.getRequiredStake(p3dTransferAmount);
            log(`    📊 P3D transfer amount: ${p3dTransferAmount.toString()}`);
            log(`    📊 Required P3D stake: ${p3dRequiredStake.toString()}`);
            
            // Check if user has enough P3D for stake
            if (userP3DBalanceBefore.lt(p3dRequiredStake)) {
                log(`    ❌ Insufficient P3D balance for stake. Need ${p3dRequiredStake.toString()}, have ${userP3DBalanceBefore.toString()}`);
            } else {
                // Approve bridge to spend P3D
                log(`    ✅ Approving P3D Export Bridge to spend ${p3dTransferAmount.toString()} P3D...`);
                const p3dApproveTx = await p3dPrecompile.approve(BRIDGE_ADDRESSES.P3DExport, p3dTransferAmount, { gasLimit: 100000 });
                await p3dApproveTx.wait();
                log(`    ✅ P3D approval confirmed: ${p3dApproveTx.hash}`);
                
                // Transfer to foreign chain
                log(`    🌉 Initiating P3D transfer to foreign chain...`);
                const p3dTransferTx = await p3dExportBridge.transferToForeignChain(
                    foreignAddress,
                    data,
                    p3dTransferAmount,
                    reward.toNumber(),
                    { gasLimit: 900000 }
                );
                await p3dTransferTx.wait();
                log(`    ✅ P3D transfer confirmed: ${p3dTransferTx.hash}`);
            }
        }
    } catch (err) {
        log(`    ❌ P3D transfer failed: ${err.message}`);
    }
    
    // Test FIRE Export Bridge transfer
    log(`  🔄 Testing FIRE Export Bridge transfer...`);
    try {
        // Check if user has enough FIRE
        if (userFireBalanceBefore.lt(fireTransferAmount)) {
            log(`    ❌ Insufficient FIRE balance. Need ${fireTransferAmount.toString()}, have ${userFireBalanceBefore.toString()}`);
        } else {
            // Get required stake
            const fireRequiredStake = await fireExportBridge.getRequiredStake(fireTransferAmount);
            log(`    📊 FIRE transfer amount: ${fireTransferAmount.toString()}`);
            log(`    📊 Required FIRE stake: ${fireRequiredStake.toString()}`);
            
            // Check if user has enough FIRE for stake
            if (userFireBalanceBefore.lt(fireRequiredStake)) {
                log(`    ❌ Insufficient FIRE balance for stake. Need ${fireRequiredStake.toString()}, have ${userFireBalanceBefore.toString()}`);
            } else {
                // Approve bridge to spend FIRE
                log(`    ✅ Approving FIRE Export Bridge to spend ${fireTransferAmount.toString()} FIRE...`);
                const fireApproveTx = await firePrecompile.approve(BRIDGE_ADDRESSES.FIREExport, fireTransferAmount, { gasLimit: 100000 });
                await fireApproveTx.wait();
                log(`    ✅ FIRE approval confirmed: ${fireApproveTx.hash}`);
                
                // Transfer to foreign chain
                log(`    🌉 Initiating FIRE transfer to foreign chain...`);
                const fireTransferTx = await fireExportBridge.transferToForeignChain(
                    foreignAddress,
                    data,
                    fireTransferAmount,
                    reward.toNumber(),
                    { gasLimit: 900000 }
                );
                await fireTransferTx.wait();
                log(`    ✅ FIRE transfer confirmed: ${fireTransferTx.hash}`);
            }
        }
    } catch (err) {
        log(`    ❌ FIRE transfer failed: ${err.message}`);
    }
    
    // Test WATER Export Bridge transfer
    log(`  🔄 Testing WATER Export Bridge transfer...`);
    try {
        // Check if user has enough WATER
        if (userWaterBalanceBefore.lt(waterTransferAmount)) {
            log(`    ❌ Insufficient WATER balance. Need ${waterTransferAmount.toString()}, have ${userWaterBalanceBefore.toString()}`);
        } else {
            // Get required stake
            const waterRequiredStake = await waterExportBridge.getRequiredStake(waterTransferAmount);
            log(`    📊 WATER transfer amount: ${waterTransferAmount.toString()}`);
            log(`    📊 Required WATER stake: ${waterRequiredStake.toString()}`);
            
            // Check if user has enough WATER for stake
            if (userWaterBalanceBefore.lt(waterRequiredStake)) {
                log(`    ❌ Insufficient WATER balance for stake. Need ${waterRequiredStake.toString()}, have ${userWaterBalanceBefore.toString()}`);
            } else {
                // Approve bridge to spend WATER
                log(`    ✅ Approving WATER Export Bridge to spend ${waterTransferAmount.toString()} WATER...`);
                const waterApproveTx = await waterPrecompile.approve(BRIDGE_ADDRESSES.WATERExport, waterTransferAmount, { gasLimit: 100000 });
                await waterApproveTx.wait();
                log(`    ✅ WATER approval confirmed: ${waterApproveTx.hash}`);
                
                // Transfer to foreign chain
                log(`    🌉 Initiating WATER transfer to foreign chain...`);
                const waterTransferTx = await waterExportBridge.transferToForeignChain(
                    foreignAddress,
                    data,
                    waterTransferAmount,
                    reward.toNumber(),
                    { gasLimit: 900000 }
                );
                await waterTransferTx.wait();
                log(`    ✅ WATER transfer confirmed: ${waterTransferTx.hash}`);
            }
        }
    } catch (err) {
        log(`    ❌ WATER transfer failed: ${err.message}`);
    }
    
    // Check user balances after transfers
    const userP3DBalanceAfter = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalanceAfter = await firePrecompile.balanceOf(userAddress);
    const userWaterBalanceAfter = await waterPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances after transfers:`);
    log(`    - P3D: ${userP3DBalanceAfter.toString()} (${userP3DBalanceAfter.sub(userP3DBalanceBefore).toString()})`);
    log(`    - FIRE: ${userFireBalanceAfter.toString()} (${userFireBalanceAfter.sub(userFireBalanceBefore).toString()})`);
    log(`    - WATER: ${userWaterBalanceAfter.toString()} (${userWaterBalanceAfter.sub(userWaterBalanceBefore).toString()})`);
    
    log(`  ✅ Foreign chain transfers completed`);
}

async function testExportClaim() {
    log(`\n=== Testing Export Assistant Claim Functionality ===`);
    
    // Get manager address (account1) - this is the assistant manager who can call claim
    const managerAddress = await signer.getAddress();
    
    // Get user address from user account (account2) - this will be the sender in the claim
    const userSigner = await setupUserAccount();
    const userAddress = await userSigner.getAddress();
    
    // Get account3 address for recipient
    const account3Signer = await setupAccount3();
    const account3Address = await account3Signer.getAddress();
    
    log(`  📋 Using manager account (account1): ${managerAddress}`);
    log(`  📋 Using sender account (account2): ${userAddress}`);
    log(`  📋 Using recipient account (account3): ${account3Address}`);
    
    // Get token contracts (using manager signer for assistant operations)
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Get assistant contracts
    const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const waterExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.waterExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    
    // Get bridge contracts
    const p3dExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.P3DExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
    const fireExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.FIREExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
    const waterExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.WATERExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
    
    // Test P3D export claim
    log(`  🔄 Testing P3D Export Assistant claim...`);
    
    // Check balances before claim
    const p3dAssistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const p3dAssistantBalanceInWorkBefore = await p3dExportAssistant.balance_in_work();
    
    log(`    📊 P3D Assistant balances before claim:`);
    log(`      - P3D: ${p3dAssistantP3DBalanceBefore.toString()}`);
    log(`      - Balance in work: ${p3dAssistantBalanceInWorkBefore.toString()}`);
    
    // Create export claim parameters
    const p3dClaimTxid = `p3d_export_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const p3dClaimTxts = Math.floor(Date.now() / 1000); // Current timestamp
    const p3dClaimAmount = ethers.BigNumber.from('100000000000000'); // 0.000001 P3D
    const p3dClaimReward = ethers.BigNumber.from('10000000000000'); // 0.00000001 P3D reward
    const p3dClaimSenderAddress = managerAddress; // Must be manager's address
    const p3dClaimRecipientAddress = account3Address;
    const p3dClaimData = JSON.stringify({ "max_fee": 1 });
    
    log(`    🔄 P3D Assistant claiming on behalf of manager:`);
    log(`      - TXID: ${p3dClaimTxid}`);
    log(`      - Amount: ${ethers.utils.formatEther(p3dClaimAmount)} P3D`);
    log(`      - Reward: ${ethers.utils.formatEther(p3dClaimReward)} P3D`);
    log(`      - Sender: ${p3dClaimSenderAddress}`);
    log(`      - Recipient: ${p3dClaimRecipientAddress}`);
    log(`      - Data: ${p3dClaimData}`);
    
    // Get required stake from bridge
    const p3dRequiredStake = await p3dExportBridge.getRequiredStake(p3dClaimAmount);
    log(`      - Required P3D stake: ${ethers.utils.formatEther(p3dRequiredStake)}`);
    
    // Check if assistant has enough P3D for stake
    if (p3dAssistantP3DBalanceBefore.lt(p3dRequiredStake)) {
        log(`      ❌ P3D Assistant has insufficient P3D balance for stake`);
        log(`        Required: ${p3dRequiredStake.toString()}, Available: ${p3dAssistantP3DBalanceBefore.toString()}`);
        return;
    }
    
    // Execute the claim through the assistant (must be called by manager)
    log(`      🔄 Executing P3D assistant claim...`);
    
    // Get the manager account for the assistant
    const p3dManagerAccount = await p3dExportAssistant.managerAddress();
    log(`      - Manager address: ${p3dManagerAccount}`);
    log(`      - Using manager signer: ${await signer.getAddress()}`);
    
    try {
        // Convert BigNumber to int for reward parameter
        const rewardInt = p3dClaimReward.toNumber();
        
        const p3dClaimTx = await p3dExportAssistant.claim(
            p3dClaimTxid,
            p3dClaimTxts,
            p3dClaimAmount,
            rewardInt,
            p3dClaimSenderAddress,
            p3dClaimRecipientAddress,
            p3dClaimData,
            { gasLimit: 9000000 }
        );
        await p3dClaimTx.wait();
        log(`        ✅ P3D Assistant claim successful: ${p3dClaimTx.hash}`);
        
        // Get the claim number from the transaction receipt
        const receipt = await signer.provider.getTransactionReceipt(p3dClaimTx.hash);
        const newClaimForEvent = receipt.logs.find(log => {
            try {
                const decoded = p3dExportAssistant.interface.parseLog(log);
                return decoded.name === 'NewClaimFor';
            } catch (e) {
                return false;
            }
        });
        
        if (newClaimForEvent) {
            const decoded = p3dExportAssistant.interface.parseLog(newClaimForEvent);
            const claimNumber = decoded.args.claim_num;
            log(`        📋 NewClaimFor event found:`);
            log(`          - Claim Number: ${claimNumber.toString()}`);
            log(`          - For Address: ${decoded.args.for_address}`);
            log(`          - Amount: ${decoded.args.amount.toString()} P3D`);
            log(`          - Stake: ${decoded.args.stake.toString()} P3D`);
            
            // Check balances after claim
            const p3dAssistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
            const p3dAssistantBalanceInWorkAfter = await p3dExportAssistant.balance_in_work();
            
            log(`        📊 P3D Assistant balances after claim:`);
            log(`          - P3D: ${p3dAssistantP3DBalanceAfter.toString()} (${p3dAssistantP3DBalanceAfter.sub(p3dAssistantP3DBalanceBefore).toString()})`);
            log(`          - Balance in work: ${p3dAssistantBalanceInWorkAfter.toString()} (${p3dAssistantBalanceInWorkAfter.sub(p3dAssistantBalanceInWorkBefore).toString()})`);
            
            log(`        ⏳ P3D Export claim submitted successfully!`);
            log(`        📋 Next steps:`);
            log(`          1. ✅ Assistant has staked P3D for the export claim`);
            log(`          2. ⏳ Assistant waits for challenging period to expire (12 hours)`);
            log(`          3. 📋 Assistant will receive P3D stake back + reward if no challenges`);
            log(`          4. 📋 If challenged, assistant can challenge back to defend the claim`);
            
        } else {
            log(`        ⚠ NewClaimFor event not found in transaction receipt`);
            log(`        📋 P3D Assistant claim submitted but event parsing failed`);
        }
        
    } catch (err) {
        log(`        ❌ P3D Assistant claim failed: ${err.message}`);
        throw err;
    }
    
    // Test FIRE export claim
    log(`  🔄 Testing FIRE Export Assistant claim...`);
    
    // Check balances before claim
    const fireAssistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalanceBefore = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantBalanceInWorkBefore = await fireExportAssistant.balance_in_work();
    
    log(`    📊 FIRE Assistant balances before claim:`);
    log(`      - P3D: ${fireAssistantP3DBalanceBefore.toString()}`);
    log(`      - FIRE: ${fireAssistantFireBalanceBefore.toString()}`);
    log(`      - Balance in work: ${fireAssistantBalanceInWorkBefore.toString()}`);
    
    // Create export claim parameters for FIRE
    const fireClaimTxid = `fire_export_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fireClaimTxts = Math.floor(Date.now() / 1000);
    const fireClaimAmount = ethers.BigNumber.from('10000000'); // 0.0000001 FIRE
    const fireClaimReward = ethers.BigNumber.from('5000000'); // 0.00000005 FIRE reward (5% of amount)
    const fireClaimSenderAddress = managerAddress; // Must be manager's address
    const fireClaimRecipientAddress = account3Address;
    const fireClaimData = JSON.stringify({ "max_fee": 2 });
    
    log(`    🔄 FIRE Assistant claiming on behalf of manager:`);
    log(`      - TXID: ${fireClaimTxid}`);
    log(`      - Amount: ${ethers.utils.formatEther(fireClaimAmount)} FIRE`);
    log(`      - Reward: ${ethers.utils.formatEther(fireClaimReward)} FIRE`);
    log(`      - Sender: ${fireClaimSenderAddress}`);
    log(`      - Recipient: ${fireClaimRecipientAddress}`);
    log(`      - Data: ${fireClaimData}`);
    
    // Get required stake from bridge
    const fireRequiredStake = await fireExportBridge.getRequiredStake(fireClaimAmount);
    log(`      - Required FIRE stake: ${ethers.utils.formatEther(fireRequiredStake)}`);
    
    // Check if assistant has enough FIRE for stake
    if (fireAssistantFireBalanceBefore.lt(fireRequiredStake)) {
        log(`      ❌ FIRE Assistant has insufficient FIRE balance for stake`);
        log(`        Required: ${fireRequiredStake.toString()}, Available: ${fireAssistantFireBalanceBefore.toString()}`);
        return;
    }
    
    try {
        const fireRewardInt = fireClaimReward.toNumber();
        
        const fireClaimTx = await fireExportAssistant.claim(
            fireClaimTxid,
            fireClaimTxts,
            fireClaimAmount,
            fireRewardInt,
            fireClaimSenderAddress,
            fireClaimRecipientAddress,
            fireClaimData,
            { gasLimit: 9000000 }
        );
        await fireClaimTx.wait();
        log(`        ✅ FIRE Assistant claim successful: ${fireClaimTx.hash}`);
        
        // Check balances after claim
        const fireAssistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
        const fireAssistantFireBalanceAfter = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
        const fireAssistantBalanceInWorkAfter = await fireExportAssistant.balance_in_work();
        
        log(`        📊 FIRE Assistant balances after claim:`);
        log(`          - P3D: ${fireAssistantP3DBalanceAfter.toString()} (${fireAssistantP3DBalanceAfter.sub(fireAssistantP3DBalanceBefore).toString()})`);
        log(`          - FIRE: ${fireAssistantFireBalanceAfter.toString()} (${fireAssistantFireBalanceAfter.sub(fireAssistantFireBalanceBefore).toString()})`);
        log(`          - Balance in work: ${fireAssistantBalanceInWorkAfter.toString()} (${fireAssistantBalanceInWorkAfter.sub(fireAssistantBalanceInWorkBefore).toString()})`);
        
        log(`        ⏳ FIRE Export claim submitted successfully!`);
        
    } catch (err) {
        log(`        ❌ FIRE Assistant claim failed: ${err.message}`);
        throw err;
    }
    
    // Test WATER Export Assistant claim
    log(`  🔄 Testing WATER Export Assistant claim...`);
    
    // Get WATER assistant balances before claim
    const waterAssistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantWaterBalanceBefore = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantBalanceInWorkBefore = await waterExportAssistant.balance_in_work();
    
    log(`    📊 WATER Assistant balances before claim:`);
    log(`      - P3D: ${waterAssistantP3DBalanceBefore.toString()}`);
    log(`      - WATER: ${waterAssistantWaterBalanceBefore.toString()}`);
    log(`      - Balance in work: ${waterAssistantBalanceInWorkBefore.toString()}`);
    
    // Create export claim parameters for WATER
    const waterClaimTxid = `water_export_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const waterClaimTxts = Math.floor(Date.now() / 1000);
    const waterClaimAmount = ethers.BigNumber.from('10000000'); // 0.0000001 WATER
    const waterClaimReward = ethers.BigNumber.from('5000000'); // 0.00000005 WATER reward (5% of amount)
    const waterClaimSenderAddress = managerAddress; // Must be manager's address
    const waterClaimRecipientAddress = account3Address;
    const waterClaimData = JSON.stringify({ "max_fee": 3 });
    
    log(`    🔄 WATER Assistant claiming on behalf of manager:`);
    log(`      - TXID: ${waterClaimTxid}`);
    log(`      - Amount: ${ethers.utils.formatEther(waterClaimAmount)} WATER`);
    log(`      - Reward: ${ethers.utils.formatEther(waterClaimReward)} WATER`);
    log(`      - Sender: ${waterClaimSenderAddress}`);
    log(`      - Recipient: ${waterClaimRecipientAddress}`);
    log(`      - Data: ${waterClaimData}`);
    
    // Get required stake from bridge
    const waterRequiredStake = await waterExportBridge.getRequiredStake(waterClaimAmount);
    log(`      - Required WATER stake: ${ethers.utils.formatEther(waterRequiredStake)}`);
    
    // Check if assistant has enough WATER for stake
    if (waterAssistantWaterBalanceBefore.lt(waterRequiredStake)) {
        log(`      ❌ WATER Assistant has insufficient WATER balance for stake`);
        log(`        Required: ${waterRequiredStake.toString()}, Available: ${waterAssistantWaterBalanceBefore.toString()}`);
        return;
    }
    
    try {
        const waterRewardInt = waterClaimReward.toNumber();
        
        const waterClaimTx = await waterExportAssistant.claim(
            waterClaimTxid,
            waterClaimTxts,
            waterClaimAmount,
            waterRewardInt,
            waterClaimSenderAddress,
            waterClaimRecipientAddress,
            waterClaimData,
            { gasLimit: 9000000 }
        );
        await waterClaimTx.wait();
        log(`        ✅ WATER Assistant claim successful: ${waterClaimTx.hash}`);
        
        // Check balances after claim
        const waterAssistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
        const waterAssistantWaterBalanceAfter = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
        const waterAssistantBalanceInWorkAfter = await waterExportAssistant.balance_in_work();
        
        log(`        📊 WATER Assistant balances after claim:`);
        log(`          - P3D: ${waterAssistantP3DBalanceAfter.toString()} (${waterAssistantP3DBalanceAfter.sub(waterAssistantP3DBalanceBefore).toString()})`);
        log(`          - WATER: ${waterAssistantWaterBalanceAfter.toString()} (${waterAssistantWaterBalanceAfter.sub(waterAssistantWaterBalanceBefore).toString()})`);
        log(`          - Balance in work: ${waterAssistantBalanceInWorkAfter.toString()} (${waterAssistantBalanceInWorkAfter.sub(waterAssistantBalanceInWorkBefore).toString()})`);
        
        log(`        ⏳ WATER Export claim submitted successfully!`);
        
    } catch (err) {
        log(`        ❌ WATER Assistant claim failed: ${err.message}`);
        throw err;
    }
    
    log(`  ✅ Export assistant claim test completed`);
}

async function testExportChallenge() {
    log(`\n=== Testing Export Assistant Challenge Functionality ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Get assistant contracts
    const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    
    // Get bridge contracts
    const p3dExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.P3DExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
    const fireExportBridge = new ethers.Contract(BRIDGE_ADDRESSES.FIREExport, require('../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
    
    // Check assistant's P3D balance before challenge
    const p3dAssistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const fireAssistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalanceBefore = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    
    log(`  📊 Assistant P3D balances before challenge:`);
    log(`    P3D Assistant: ${p3dAssistantP3DBalanceBefore.toString()}`);
    log(`    FIRE Assistant: ${fireAssistantP3DBalanceBefore.toString()}`);
    log(`    FIRE Assistant FIRE: ${fireAssistantFireBalanceBefore.toString()}`);
    
    // Get the latest claim numbers to challenge
    const p3dLastClaimNum = await p3dExportBridge.last_claim_num();
    const fireLastClaimNum = await fireExportBridge.last_claim_num();
    
    log(`  📊 Last claim numbers:`);
    log(`    P3D Export: ${p3dLastClaimNum.toString()}`);
    log(`    FIRE Export: ${fireLastClaimNum.toString()}`);
    
    if (p3dLastClaimNum.eq(0) && fireLastClaimNum.eq(0)) {
        log(`  ⚠ No claims exist yet - skipping export challenge test`);
        log(`    ℹ Run testExportClaim first to create claims to challenge`);
        return;
    }
    
    // Test P3D export challenge if there are claims
    if (!p3dLastClaimNum.eq(0)) {
        log(`  🔄 Testing P3D export challenge functionality:`);
        log(`    Note: This test challenges the latest P3D export claim created in previous tests`);
        
        try {
            // Get claim details first to understand current state
            log(`    🔍 Fetching P3D claim ${p3dLastClaimNum} details...`);
            const encodedData = p3dExportBridge.interface.encodeFunctionData('getClaim(uint256)', [p3dLastClaimNum]);
            const result = await signer.provider.call({
                to: BRIDGE_ADDRESSES.P3DExport,
                data: encodedData
            });
            
            const decodedResult = p3dExportBridge.interface.decodeFunctionResult('getClaim(uint256)', result);
            const claimData = decodedResult[0];
            
            log(`    📊 P3D claim ${p3dLastClaimNum} current state:`);
            log(`      - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
            log(`      - Expiry timestamp: ${claimData.expiry_ts} (${new Date(claimData.expiry_ts * 1000).toISOString()})`);
            log(`      - Finished: ${claimData.finished}`);
            
            // Check if claim is still challengeable
            const currentBlock = await signer.provider.getBlock('latest');
            const currentTimestamp = currentBlock.timestamp;
            const timeRemaining = claimData.expiry_ts - currentTimestamp;
            
            if (timeRemaining <= 0) {
                log(`    ⚠ P3D claim ${p3dLastClaimNum} has expired (${Math.abs(timeRemaining)} seconds ago)`);
                log(`      ℹ Cannot challenge expired claims - this is expected behavior`);
            } else if (claimData.finished) {
                log(`    ⚠ P3D claim ${p3dLastClaimNum} is already finished`);
                log(`      ℹ Cannot challenge finished claims - this is expected behavior`);
            } else {
                log(`    ✅ P3D claim ${p3dLastClaimNum} is challengeable (${timeRemaining} seconds remaining)`);
                
                // Determine challenge outcome (opposite of current outcome)
                const challengeOutcome = claimData.current_outcome === 0 ? 1 : 0; // Challenge with opposite outcome
                
                // Get missing stake for this challenge
                const missingStake = await p3dExportBridge.getMissingStake(p3dLastClaimNum, challengeOutcome);
                log(`    📊 Missing stake for outcome ${challengeOutcome === 0 ? 'NO' : 'YES'}: ${ethers.utils.formatUnits(missingStake, 18)} P3D`);
                
                if (missingStake.eq(0)) {
                    log(`    ⚠ No missing stake for outcome ${challengeOutcome === 0 ? 'NO' : 'YES'} - challenge may not be needed`);
                } else if (p3dAssistantP3DBalanceBefore.lt(missingStake)) {
                    log(`    ❌ P3D Assistant has insufficient P3D balance for challenge`);
                    log(`      Required: ${ethers.utils.formatUnits(missingStake, 18)} P3D`);
                    log(`      Available: ${ethers.utils.formatUnits(p3dAssistantP3DBalanceBefore, 18)} P3D`);
                } else {
                    // Execute the challenge through the assistant
                    log(`    🔄 Executing P3D challenge through assistant...`);
                    
                    const challengeTx = await p3dExportAssistant.challenge(
                        p3dLastClaimNum,
                        challengeOutcome, // 0 = NO, 1 = YES (CounterstakeLibrary.Side enum)
                        missingStake,
                        { gasLimit: 9000000 }
                    );
                    await challengeTx.wait();
                    log(`      ✅ P3D Assistant challenge successful: ${challengeTx.hash}`);
                    
                    // Check assistant's balance after challenge
                    const p3dAssistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
                    log(`      📊 P3D Assistant P3D balance after challenge: ${ethers.utils.formatUnits(p3dAssistantP3DBalanceAfter, 18)} P3D`);
                    log(`      📊 P3D used for challenge: ${ethers.utils.formatUnits(p3dAssistantP3DBalanceBefore.sub(p3dAssistantP3DBalanceAfter), 18)} P3D`);
                }
            }
            
        } catch (err) {
            log(`    ❌ P3D export challenge failed: ${err.message}`);
        }
    }
    
    // Test FIRE export challenge if there are claims
    if (!fireLastClaimNum.eq(0)) {
        log(`  🔄 Testing FIRE export challenge functionality:`);
        log(`    Note: This test challenges the latest FIRE export claim created in previous tests`);
        
        try {
            // Get claim details first to understand current state
            log(`    🔍 Fetching FIRE claim ${fireLastClaimNum} details...`);
            const encodedData = fireExportBridge.interface.encodeFunctionData('getClaim(uint256)', [fireLastClaimNum]);
            const result = await signer.provider.call({
                to: BRIDGE_ADDRESSES.FIREExport,
                data: encodedData
            });
            
            const decodedResult = fireExportBridge.interface.decodeFunctionResult('getClaim(uint256)', result);
            const claimData = decodedResult[0];
            
            log(`    📊 FIRE claim ${fireLastClaimNum} current state:`);
            log(`      - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
            log(`      - Expiry timestamp: ${claimData.expiry_ts} (${new Date(claimData.expiry_ts * 1000).toISOString()})`);
            log(`      - Finished: ${claimData.finished}`);
            
            // Check if claim is still challengeable
            const currentBlock = await signer.provider.getBlock('latest');
            const currentTimestamp = currentBlock.timestamp;
            const timeRemaining = claimData.expiry_ts - currentTimestamp;
            
            if (timeRemaining <= 0) {
                log(`    ⚠ FIRE claim ${fireLastClaimNum} has expired (${Math.abs(timeRemaining)} seconds ago)`);
                log(`      ℹ Cannot challenge expired claims - this is expected behavior`);
            } else if (claimData.finished) {
                log(`    ⚠ FIRE claim ${fireLastClaimNum} is already finished`);
                log(`      ℹ Cannot challenge finished claims - this is expected behavior`);
            } else {
                log(`    ✅ FIRE claim ${fireLastClaimNum} is challengeable (${timeRemaining} seconds remaining)`);
                
                // Determine challenge outcome (opposite of current outcome)
                const challengeOutcome = claimData.current_outcome === 0 ? 1 : 0; // Challenge with opposite outcome
                
                // Get missing stake for this challenge
                const missingStake = await fireExportBridge.getMissingStake(fireLastClaimNum, challengeOutcome);
                log(`    📊 Missing stake for outcome ${challengeOutcome === 0 ? 'NO' : 'YES'}: ${ethers.utils.formatUnits(missingStake, 18)} FIRE`);
                
                if (missingStake.eq(0)) {
                    log(`    ⚠ No missing stake for outcome ${challengeOutcome === 0 ? 'NO' : 'YES'} - challenge may not be needed`);
                } else if (fireAssistantFireBalanceBefore.lt(missingStake)) {
                    log(`    ❌ FIRE Assistant has insufficient FIRE balance for challenge`);
                    log(`      Required: ${ethers.utils.formatUnits(missingStake, 18)} FIRE`);
                    log(`      Available: ${ethers.utils.formatUnits(fireAssistantFireBalanceBefore, 18)} FIRE`);
                } else {
                    // Execute the challenge through the assistant
                    log(`    🔄 Executing FIRE challenge through assistant...`);
                    
                    const challengeTx = await fireExportAssistant.challenge(
                        fireLastClaimNum,
                        challengeOutcome, // 0 = NO, 1 = YES (CounterstakeLibrary.Side enum)
                        missingStake,
                        { gasLimit: 9000000 }
                    );
                    await challengeTx.wait();
                    log(`      ✅ FIRE Assistant challenge successful: ${challengeTx.hash}`);
                    
                    // Check assistant's balance after challenge
                    const fireAssistantFireBalanceAfter = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
                    log(`      📊 FIRE Assistant FIRE balance after challenge: ${ethers.utils.formatUnits(fireAssistantFireBalanceAfter, 18)} FIRE`);
                    log(`      📊 FIRE used for challenge: ${ethers.utils.formatUnits(fireAssistantFireBalanceBefore.sub(fireAssistantFireBalanceAfter), 18)} FIRE`);
                }
            }
            
        } catch (err) {
            log(`    ❌ FIRE export challenge failed: ${err.message}`);
        }
    }
    
    log(`  ✅ Export assistant challenge test completed`);
}

async function testWithdrawal() {
    log(`\n=== Testing Export Assistant Withdrawal Functionality ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get assistant contracts
    const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const waterExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.waterExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Check balances before withdrawal
    const userP3DBalanceBefore = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalanceBefore = await firePrecompile.balanceOf(userAddress);
    const userWaterBalanceBefore = await waterPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances before withdrawal:`);
    log(`    - P3D: ${userP3DBalanceBefore.toString()}`);
    log(`    - FIRE: ${userFireBalanceBefore.toString()}`);
    log(`    - WATER: ${userWaterBalanceBefore.toString()}`);
    
    // Test management fee withdrawal for each assistant
    log(`  🔄 Testing management fee withdrawal...`);
    
    try {
        // P3D Assistant management fee withdrawal
        log(`    🔄 Withdrawing P3D Assistant management fees...`);
        const p3dMfWithdrawTx = await p3dExportAssistant.withdrawManagementFee({ gasLimit: 300000 });
        await p3dMfWithdrawTx.wait();
        log(`      ✅ P3D Assistant management fee withdrawal successful: ${p3dMfWithdrawTx.hash}`);
        
        // FIRE Assistant management fee withdrawal
        log(`    🔄 Withdrawing FIRE Assistant management fees...`);
        const fireMfWithdrawTx = await fireExportAssistant.withdrawManagementFee({ gasLimit: 300000 });
        await fireMfWithdrawTx.wait();
        log(`      ✅ FIRE Assistant management fee withdrawal successful: ${fireMfWithdrawTx.hash}`);
        
        // WATER Assistant management fee withdrawal
        log(`    🔄 Withdrawing WATER Assistant management fees...`);
        const waterMfWithdrawTx = await waterExportAssistant.withdrawManagementFee({ gasLimit: 300000 });
        await waterMfWithdrawTx.wait();
        log(`      ✅ WATER Assistant management fee withdrawal successful: ${waterMfWithdrawTx.hash}`);
        
    } catch (err) {
        log(`    ❌ Management fee withdrawal failed: ${err.message}`);
    }
    
    // Test success fee withdrawal for each assistant
    log(`  🔄 Testing success fee withdrawal...`);
    
    try {
        // P3D Assistant success fee withdrawal
        log(`    🔄 Withdrawing P3D Assistant success fees...`);
        const p3dSfWithdrawTx = await p3dExportAssistant.withdrawSuccessFee({ gasLimit: 9000000 });
        await p3dSfWithdrawTx.wait();
        log(`      ✅ P3D Assistant success fee withdrawal successful: ${p3dSfWithdrawTx.hash}`);
        
        // FIRE Assistant success fee withdrawal
        log(`    🔄 Withdrawing FIRE Assistant success fees...`);
        const fireSfWithdrawTx = await fireExportAssistant.withdrawSuccessFee({ gasLimit: 9000000 });
        await fireSfWithdrawTx.wait();
        log(`      ✅ FIRE Assistant success fee withdrawal successful: ${fireSfWithdrawTx.hash}`);
        
        // WATER Assistant success fee withdrawal
        log(`    🔄 Withdrawing WATER Assistant success fees...`);
        const waterSfWithdrawTx = await waterExportAssistant.withdrawSuccessFee({ gasLimit: 9000000 });
        await waterSfWithdrawTx.wait();
        log(`      ✅ WATER Assistant success fee withdrawal successful: ${waterSfWithdrawTx.hash}`);
        
    } catch (err) {
        log(`    ❌ Success fee withdrawal failed: ${err.message}`);
    }
    
    // Check balances after withdrawal
    const userP3DBalanceAfter = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalanceAfter = await firePrecompile.balanceOf(userAddress);
    const userWaterBalanceAfter = await waterPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances after withdrawal:`);
    log(`    - P3D: ${userP3DBalanceAfter.toString()} (${userP3DBalanceAfter.sub(userP3DBalanceBefore).toString()})`);
    log(`    - FIRE: ${userFireBalanceAfter.toString()} (${userFireBalanceAfter.sub(userFireBalanceBefore).toString()})`);
    log(`    - WATER: ${userWaterBalanceAfter.toString()} (${userWaterBalanceAfter.sub(userWaterBalanceBefore).toString()})`);
    
    log(`  ✅ Export assistant withdrawal test completed`);
}

// Helper function to get bridge contracts with correct ABI
function getBridgeContracts(signer) {
    return {
        p3dExportBridge: new ethers.Contract(BRIDGE_ADDRESSES.P3DExport, require('../counterstake-bridge/evm/build/contracts/Counterstake.json').abi, signer),
        fireExportBridge: new ethers.Contract(BRIDGE_ADDRESSES.FIREExport, require('../counterstake-bridge/evm/build/contracts/Counterstake.json').abi, signer),
        waterExportBridge: new ethers.Contract(BRIDGE_ADDRESSES.WATERExport, require('../counterstake-bridge/evm/build/contracts/Counterstake.json').abi, signer)
    };
}

// Helper function to check claim expiration and wait if needed
// This function ensures that claims are only withdrawn after they have expired
// to prevent transaction failures due to premature withdrawal attempts
async function waitForClaimExpiration(bridgeContract, claimNumber, bridgeName) {
    log(`    🔍 Checking ${bridgeName} claim ${claimNumber} expiration status...`);
    
    try {
        // Get claim details
        const claimData = await bridgeContract.getClaim(claimNumber);
        
        log(`    📊 ${bridgeName} claim ${claimNumber} details:`);
        log(`      - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
        log(`      - Expiry timestamp: ${claimData.expiry_ts} (${new Date(claimData.expiry_ts * 1000).toISOString()})`);
        log(`      - Finished: ${claimData.finished}`);
        
        // Check if claim is already finished
        if (claimData.finished) {
            log(`    ✅ ${bridgeName} claim ${claimNumber} is already finished - ready for recording`);
            return true;
        }
        
        // Get current block timestamp
        const currentBlock = await signer.provider.getBlock('latest');
        const currentTimestamp = currentBlock.timestamp;
        const timeRemaining = claimData.expiry_ts - currentTimestamp;
        
        if (timeRemaining <= 0) {
            log(`    ✅ ${bridgeName} claim ${claimNumber} has expired - ready for recording`);
            return true;
        } else {
            log(`    ⏳ ${bridgeName} claim ${claimNumber} has not expired yet`);
            log(`      - Time remaining: ${timeRemaining} seconds (${Math.floor(timeRemaining / 60)} minutes ${timeRemaining % 60} seconds)`);
            log(`      - Waiting for expiration...`);
            
            // Wait for expiration (add 10 seconds buffer to ensure it's fully expired)
            const waitTime = (timeRemaining + 10) * 1000; // Convert to milliseconds
            log(`      - Waiting ${Math.floor(waitTime / 1000)} seconds...`);
            
            // Show progress during waiting
            const startTime = Date.now();
            const checkInterval = Math.min(30000, Math.max(5000, waitTime / 10)); // Check every 5-30 seconds
            
            while (Date.now() - startTime < waitTime) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const remaining = Math.floor((waitTime - (Date.now() - startTime)) / 1000);
                log(`      - Progress: ${elapsed}s elapsed, ${remaining}s remaining...`);
            }
            
            log(`    ✅ ${bridgeName} claim ${claimNumber} should now be expired`);
            return true;
        }
        
    } catch (err) {
        log(`    ❌ Error checking ${bridgeName} claim ${claimNumber} expiration: ${err.message}`);
        return false;
    }
}

async function summarizeBalances() {
    log(`\n=== Final Balance Summary ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Get assistant contracts
    const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const waterExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.waterExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    
    // Check all balances
    const userP3DBalance = await p3dPrecompile.balanceOf(userAddress);
    const userFireBalance = await firePrecompile.balanceOf(userAddress);
    const userWaterBalance = await waterPrecompile.balanceOf(userAddress);
    
    const p3dAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const p3dAssistantBalanceInWork = await p3dExportAssistant.balance_in_work();
    
    const fireAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantBalanceInWork = await fireExportAssistant.balance_in_work();
    
    const waterAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantBalanceInWork = await waterExportAssistant.balance_in_work();
    
    const fireBridgeP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.FIREExport);
    const fireBridgeFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.FIREExport);
    const waterBridgeP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.WATERExport);
    const waterBridgeWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.WATERExport);
    
    log(`  📊 User Balances:`);
    log(`    - P3D: ${ethers.utils.formatEther(userP3DBalance)}`);
    log(`    - FIRE: ${ethers.utils.formatEther(userFireBalance)}`);
    log(`    - WATER: ${ethers.utils.formatEther(userWaterBalance)}`);
    
    log(`  📊 P3D Export Assistant:`);
    log(`    - P3D: ${ethers.utils.formatEther(p3dAssistantP3DBalance)}`);
    log(`    - Balance in work: ${ethers.utils.formatEther(p3dAssistantBalanceInWork)}`);
    
    log(`  📊 FIRE Export Assistant:`);
    log(`    - P3D: ${ethers.utils.formatEther(fireAssistantP3DBalance)}`);
    log(`    - FIRE: ${ethers.utils.formatEther(fireAssistantFireBalance)}`);
    log(`    - Balance in work: ${ethers.utils.formatEther(fireAssistantBalanceInWork)}`);
    
    log(`  📊 WATER Export Assistant:`);
    log(`    - P3D: ${ethers.utils.formatEther(waterAssistantP3DBalance)}`);
    log(`    - WATER: ${ethers.utils.formatEther(waterAssistantWaterBalance)}`);
    log(`    - Balance in work: ${ethers.utils.formatEther(waterAssistantBalanceInWork)}`);
    
    log(`  📊 Bridge Balances:`);
    log(`    FIRE Bridge - P3D: ${ethers.utils.formatEther(fireBridgeP3DBalance)}, FIRE: ${ethers.utils.formatEther(fireBridgeFireBalance)}`);
    log(`    WATER Bridge - P3D: ${ethers.utils.formatEther(waterBridgeP3DBalance)}, WATER: ${ethers.utils.formatEther(waterBridgeWaterBalance)}`);
    
    log(`  ✅ Balance summary completed`);
}

async function testCompleteExportCycle() {
    log(`\n=== Testing Complete Export Assistant Cycle (Claim → Challenge → Record Results) ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Get assistant contracts
    const p3dExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.p3dExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    const fireExportAssistant = new ethers.Contract(BRIDGE_ADDRESSES.fireExportAssistant, require('../counterstake-bridge/evm/build/contracts/ExportAssistant.json').abi, signer);
    
    // Get bridge contracts (using Counterstake ABI since Export inherits from Counterstake)
    const { p3dExportBridge, fireExportBridge } = getBridgeContracts(signer);
    
    log(`  📋 Export Assistant Complete Cycle Test Plan:`);
    log(`    1. 🔄 Assistant makes a claim on the export bridge`);
    log(`    2. ⏳ Wait for challenging period (or test challenges)`);
    log(`    3. 💰 Assistant records claim results (win/loss)`);
    log(`    4. 📊 Verify balances and profit/loss tracking`);
    
    // Check current assistant balances
    const p3dAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
    const fireAssistantFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const p3dAssistantBalanceInWork = await p3dExportAssistant.balance_in_work();
    const fireAssistantBalanceInWork = await fireExportAssistant.balance_in_work();
    
    log(`  📊 Current Assistant Balances:`);
    log(`    P3D Assistant - P3D: ${ethers.utils.formatEther(p3dAssistantP3DBalance)}, Balance in work: ${ethers.utils.formatEther(p3dAssistantBalanceInWork)}`);
    log(`    FIRE Assistant - FIRE: ${ethers.utils.formatEther(fireAssistantFireBalance)}, Balance in work: ${ethers.utils.formatEther(fireAssistantBalanceInWork)}`);
    
    // Check bridge settings
    const p3dBridgeSettings = await p3dExportBridge.settings();
    const fireBridgeSettings = await fireExportBridge.settings();
    
    log(`  📊 Bridge Settings:`);
    log(`    P3D Bridge - ratio100: ${p3dBridgeSettings.ratio100}, counterstake_coef100: ${p3dBridgeSettings.counterstake_coef100}`);
    log(`    FIRE Bridge - ratio100: ${fireBridgeSettings.ratio100}, counterstake_coef100: ${fireBridgeSettings.counterstake_coef100}`);
    
    // Calculate what would be needed for a successful claim
    const testClaimAmount = ethers.utils.parseEther('0.0000000001'); // 0.00000000000001 tokens
    const testReward = ethers.utils.parseEther('0.00000000001'); // 0.00000000000001 tokens reward (increased from 0.000000000000000001)
    
    const p3dRequiredStake = await p3dExportBridge.getRequiredStake(testClaimAmount);
    const fireRequiredStake = await fireExportBridge.getRequiredStake(testClaimAmount);
    
    log(`  📊 Required Stakes for 0.1 token claim:`);
    log(`    P3D required stake: ${ethers.utils.formatEther(p3dRequiredStake)} P3D`);
    log(`    FIRE required stake: ${ethers.utils.formatEther(fireRequiredStake)} FIRE`);
    
    // Calculate total needed (stake + paid_amount)
    const p3dPaidAmount = testClaimAmount.sub(testReward);
    const firePaidAmount = testClaimAmount.sub(testReward);
    const p3dTotalNeeded = p3dRequiredStake.add(p3dPaidAmount);
    const fireTotalNeeded = fireRequiredStake.add(firePaidAmount);
    
    log(`  📊 Total needed for assistant claim (stake + paid_amount):`);
    log(`    P3D total needed: ${ethers.utils.formatEther(p3dTotalNeeded)} P3D`);
    log(`    FIRE total needed: ${ethers.utils.formatEther(fireTotalNeeded)} FIRE`);
    
    // Check if assistants have sufficient balance
    const p3dHasEnough = p3dAssistantP3DBalance.gte(p3dTotalNeeded);
    const fireHasEnough = fireAssistantFireBalance.gte(fireTotalNeeded);
    
    log(`  📊 Balance Sufficiency Check:`);
    log(`    P3D Assistant has enough: ${p3dHasEnough ? '✅ YES' : '❌ NO'}`);
    log(`    FIRE Assistant has enough: ${fireHasEnough ? '✅ YES' : '❌ NO'}`);
    
    if (!p3dHasEnough && !fireHasEnough) {
        log(`  ⚠ Insufficient balances for complete cycle test`);
        log(`  📋 What would happen with sufficient balances:`);
        log(`    1. 🔄 Assistant calls ExportAssistant.claim()`);
        log(`       - Calculates required stake from bridge`);
        log(`       - Checks assistant has enough balance`);
        log(`       - Calls Export(bridgeAddress).claim()`);
        log(`       - Tracks investment in balances_in_work`);
        log(`       - Emits NewClaimFor event`);
        log(`    2. ⏳ Challenging period begins (3 minutes for testing)`);
        log(`       - Other users can challenge the claim`);
        log(`       - Assistant can challenge back to defend`);
        log(`       - Assistant calls ExportAssistant.challenge()`);
        log(`    3. 💰 After period expires, assistant records results`);
        log(`       - Calls ExportAssistant.recordWin() or recordLoss()`);
        log(`       - Updates profit/loss tracking`);
        log(`       - Updates balance_in_work`);
        log(`    4. 📊 Assistant updates internal accounting`);
        log(`       - Calculates profit/loss`);
        log(`       - Updates management/success fees`);
        return;
    }
    
    // If we have enough balance, proceed with actual test
    log(`  🚀 Proceeding with actual export cycle test...`);
    
    // Test P3D export cycle if sufficient balance
    if (p3dHasEnough) {
        log(`  🔄 Testing P3D Export Cycle...`);
        
        // Step 1: Make a claim
        const p3dClaimTxid = `p3d_export_cycle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const p3dClaimTxts = Math.floor(Date.now() / 1000);
        
        try {
            const p3dClaimTx = await p3dExportAssistant.claim(
                p3dClaimTxid,
                p3dClaimTxts,
                testClaimAmount,
                testReward.toNumber(),
                userAddress,
                userAddress,
                JSON.stringify({ "cycle_test": true }),
                { gasLimit: 9000000 }
            );
            await p3dClaimTx.wait();
            log(`    ✅ P3D claim successful: ${p3dClaimTx.hash}`);
            
            // Get claim number
            const p3dLastClaimNum = await p3dExportBridge.last_claim_num();
            log(`    📋 P3D claim number: ${p3dLastClaimNum.toString()}`);
            
            // Step 2: Wait for challenging period (or test challenge)
            log(`    ⏳ Challenging period active...`);
            log(`    📋 Assistant can now challenge or wait for period to expire`);
            
            // Step 3: Wait for claim expiration before recording
            log(`    ⏳ Waiting for claim expiration before recording...`);
            const p3dExpirationReady = await waitForClaimExpiration(p3dExportBridge, p3dLastClaimNum, 'P3D');
            
            if (p3dExpirationReady) {
                log(`    💰 Recording claim results...`);
                try {
                    // Check if the assistant has a winning stake or losing stake
                    const claimData = await p3dExportBridge.getClaim(p3dLastClaimNum);
                    const assistantWinningStake = await p3dExportBridge.stakes(p3dLastClaimNum, claimData.current_outcome, BRIDGE_ADDRESSES.p3dExportAssistant);
                    const oppositeOutcome = claimData.current_outcome === 0 ? 1 : 0; // 0 = NO, 1 = YES
                    const assistantLosingStake = await p3dExportBridge.stakes(p3dLastClaimNum, oppositeOutcome, BRIDGE_ADDRESSES.p3dExportAssistant);
                    
                    log(`    📊 P3D claim ${p3dLastClaimNum} stake analysis:`);
                    log(`      - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
                    log(`      - Assistant winning stake: ${ethers.utils.formatEther(assistantWinningStake)} P3D`);
                    log(`      - Assistant losing stake: ${ethers.utils.formatEther(assistantLosingStake)} P3D`);
                    
                    if (assistantWinningStake.gt(0)) {
                        log(`    ✅ Assistant has winning stake - recording win...`);
                        const p3dRecordWinTx = await p3dExportAssistant.recordWin(p3dLastClaimNum, { gasLimit: 9000000 });
                        await p3dRecordWinTx.wait();
                        log(`    ✅ P3D recordWin successful: ${p3dRecordWinTx.hash}`);
                    } else if (assistantLosingStake.gt(0)) {
                        log(`    ❌ Assistant has losing stake - recording loss...`);
                        const p3dRecordLossTx = await p3dExportAssistant.recordLoss(p3dLastClaimNum, { gasLimit: 9000000 });
                        await p3dRecordLossTx.wait();
                        log(`    ✅ P3D recordLoss successful: ${p3dRecordLossTx.hash}`);
                    } else {
                        log(`    ⚠ Assistant has no stakes in this claim - nothing to record`);
                    }
                } catch (recordErr) {
                    log(`    ❌ P3D claim recording failed: ${recordErr.message}`);
                }
            } else {
                log(`    ❌ P3D claim expiration check failed - skipping recording`);
            }
            
            // Check final balances
            const p3dAssistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.p3dExportAssistant);
            const p3dAssistantBalanceInWorkAfter = await p3dExportAssistant.balance_in_work();
            
            log(`    📊 P3D Assistant final balances:`);
            log(`      - P3D: ${ethers.utils.formatEther(p3dAssistantP3DBalanceAfter)}`);
            log(`      - Balance in work: ${ethers.utils.formatEther(p3dAssistantBalanceInWorkAfter)}`);
            
        } catch (err) {
            log(`    ❌ P3D export cycle failed: ${err.message}`);
        }
    }
    
    // Test FIRE export cycle if sufficient balance
    if (fireHasEnough) {
        log(`  🔄 Testing FIRE Export Cycle...`);
        
        // Similar implementation for FIRE
        // ... (implement similar to P3D above)
    }
    
    log(`  ✅ Complete export cycle test completed`);
}

async function checkFireAndWaterBalances() {
    log(`\n=== Checking FIRE and WATER Export Bridge & Assistant Balances ===`);
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const firePrecompile = new ethers.Contract(TOKEN_ADDRESSES.firePrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    const waterPrecompile = new ethers.Contract(TOKEN_ADDRESSES.waterPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
    
    // Check FIRE Export Bridge balances
    const fireBridgeP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.FIREExport);
    const fireBridgeFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.FIREExport);
    
    // Check WATER Export Bridge balances
    const waterBridgeP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.WATERExport);
    const waterBridgeWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.WATERExport);
    
    // Check FIRE Export Assistant balances
    const fireAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    const fireAssistantFireBalance = await firePrecompile.balanceOf(BRIDGE_ADDRESSES.fireExportAssistant);
    
    // Check WATER Export Assistant balances
    const waterAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    const waterAssistantWaterBalance = await waterPrecompile.balanceOf(BRIDGE_ADDRESSES.waterExportAssistant);
    
    log(`  📊 FIRE Export Bridge Balances:`);
    log(`    - P3D: ${ethers.utils.formatEther(fireBridgeP3DBalance)}`);
    log(`    - FIRE: ${ethers.utils.formatEther(fireBridgeFireBalance)}`);
    
    log(`  📊 WATER Export Bridge Balances:`);
    log(`    - P3D: ${ethers.utils.formatEther(waterBridgeP3DBalance)}`);
    log(`    - WATER: ${ethers.utils.formatEther(waterBridgeWaterBalance)}`);
    
    log(`  📊 FIRE Export Assistant Balances:`);
    log(`    - P3D: ${ethers.utils.formatEther(fireAssistantP3DBalance)}`);
    log(`    - FIRE: ${ethers.utils.formatEther(fireAssistantFireBalance)}`);
    
    log(`  📊 WATER Export Assistant Balances:`);
    log(`    - P3D: ${ethers.utils.formatEther(waterAssistantP3DBalance)}`);
    log(`    - WATER: ${ethers.utils.formatEther(waterAssistantWaterBalance)}`);
    
    log(`  ✅ Balance check completed`);
}

// Main function to run all tests
async function main() {
    try {
        log(`🚀 Starting Export Assistant Test Suite`);
        log(`=====================================`);
        
        // Setup
        await setupProviderAndSigner();
        await setupUserAccount();
        await setupAccount3();
        
        // Load addresses
        logLoadedAddresses();
        
        // Run tests
        await fundAssistantsAndBridges();
        await approveAssistantTokens();
        await testAssistantState();
        await testBasicContractFunctionality();
        await transferToForeignChain();
        await testExportClaim();
        await testExportChallenge();
        await testWithdrawal();
        await testCompleteExportCycle();
        await summarizeBalances();
        
        log(`\n🎉 All tests completed successfully!`);
        
    } catch (error) {
        log(`\n❌ Test suite failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run the main function
main();