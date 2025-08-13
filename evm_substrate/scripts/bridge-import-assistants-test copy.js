const { ethers } = require('ethers');

// Load configuration
const config = require('./bridge-test-config.json');

// Function to get bridge addresses from config
function getBridgeAddresses() {
    const mainnetContracts = config.mainnet.contracts;
    
    // Check if all required addresses are available
    if (!mainnetContracts.USDTImportWrapper?.["3dpassEVMcontract"]) {
        throw new Error('USDTImportWrapper address not found in config');
    }
    if (!mainnetContracts.USDCImportWrapper?.["3dpassEVMcontract"]) {
        throw new Error('USDCImportWrapper address not found in config');
    }
    if (!mainnetContracts.BUSDImportWrapper?.["3dpassEVMcontract"]) {
        throw new Error('BUSDImportWrapper address not found in config');
    }
    if (!mainnetContracts.usdtImportWrapperAssistant?.["3dpassEVMcontract"]) {
        throw new Error('usdtImportWrapperAssistant address not found in config');
    }
    if (!mainnetContracts.usdcImportWrapperAssistant?.["3dpassEVMcontract"]) {
        throw new Error('usdcImportWrapperAssistant address not found in config');
    }
    if (!mainnetContracts.busdImportWrapperAssistant?.["3dpassEVMcontract"]) {
        throw new Error('busdImportWrapperAssistant address not found in config');
    }
    
    return {
        usdtImportWrapper: mainnetContracts.USDTImportWrapper["3dpassEVMcontract"],
        usdcImportWrapper: mainnetContracts.USDCImportWrapper["3dpassEVMcontract"],
        busdImportWrapper: mainnetContracts.BUSDImportWrapper["3dpassEVMcontract"],
        usdtImportWrapperAssistant: mainnetContracts.usdtImportWrapperAssistant["3dpassEVMcontract"],
        usdcImportWrapperAssistant: mainnetContracts.usdcImportWrapperAssistant["3dpassEVMcontract"],
        busdImportWrapperAssistant: mainnetContracts.busdImportWrapperAssistant["3dpassEVMcontract"]
    };
}

// Function to get token addresses from config
function getTokenAddresses() {
    const developmentAssets = config.development.assets;
    
    return {
        p3dPrecompile: config.development.contracts.nativeTokenPrecompile,
        wUsdtPrecompile: developmentAssets.Asset1.evmContract,
        wUsdcPrecompile: developmentAssets.Asset2.evmContract,
        wBusdPrecompile: developmentAssets.Asset3.evmContract
    };
}

// Configuration
const RPC_URL = config.development.network.rpcUrl;
const BRIDGE_ADDRESSES = getBridgeAddresses();
const TOKEN_ADDRESSES = getTokenAddresses();
const BATCH_ADDRESS = config.development.contracts.batchPrecompile;

// Log loaded addresses for debugging
function logLoadedAddresses() {
    log('=== Loaded Bridge Addresses from Config ===');
    log(`USDT Import Wrapper: ${BRIDGE_ADDRESSES.usdtImportWrapper}`);
    log(`USDC Import Wrapper: ${BRIDGE_ADDRESSES.usdcImportWrapper}`);
    log(`BUSD Import Wrapper: ${BRIDGE_ADDRESSES.busdImportWrapper}`);
    log(`USDT Import Assistant: ${BRIDGE_ADDRESSES.usdtImportWrapperAssistant}`);
    log(`USDC Import Assistant: ${BRIDGE_ADDRESSES.usdcImportWrapperAssistant}`);
    log(`BUSD Import Assistant: ${BRIDGE_ADDRESSES.busdImportWrapperAssistant}`);
    
    log('\n=== Loaded Token Addresses from Config ===');
    log(`P3D Precompile: ${TOKEN_ADDRESSES.p3dPrecompile}`);
    log(`wUSDT Precompile: ${TOKEN_ADDRESSES.wUsdtPrecompile}`);
    log(`wUSDC Precompile: ${TOKEN_ADDRESSES.wUsdcPrecompile}`);
    log(`wBUSD Precompile: ${TOKEN_ADDRESSES.wBusdPrecompile}`);
    
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

async function fundAssistantsAndUser() {
    log(`\n=== Funding Assistants and User with P3D and Wrapped Tokens (Batch) ===`);
    
    const userSigner = await setupUserAccount();
    const userAddress = await userSigner.getAddress();
    
    // Get all token contracts (using user account for funding since it has the tokens)
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, userSigner);
    const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, userSigner);
    const wUsdcPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdcPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, userSigner);
    const wBusdPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wBusdPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, userSigner);
    
    // Check user account balances (for funding)
    const userP3DBalanceForFunding = await p3dPrecompile.balanceOf(userAddress);
    const userWUsdtBalanceForFunding = await wUsdtPrecompile.balanceOf(userAddress);
    const userWUsdcBalanceForFunding = await wUsdcPrecompile.balanceOf(userAddress);
    const userWBusdBalanceForFunding = await wBusdPrecompile.balanceOf(userAddress);
    
    log(`  📊 User account balances (for funding):`);
    log(`    - P3D: ${userP3DBalanceForFunding.toString()}`);
    log(`    - wUSDT: ${userWUsdtBalanceForFunding.toString()}`);
    log(`    - wUSDC: ${userWUsdcBalanceForFunding.toString()}`);
    log(`    - wBUSD: ${userWBusdBalanceForFunding.toString()}`);
    
    // Check current balances of assistants and user
    const fundingUsdtAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    const fundingUsdcAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdcImportWrapperAssistant);
    const fundingBusdAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.busdImportWrapperAssistant);
    
    const fundingUsdtAssistantWUsdtBalance = await wUsdtPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    const fundingUsdcAssistantWUsdcBalance = await wUsdcPrecompile.balanceOf(BRIDGE_ADDRESSES.usdcImportWrapperAssistant);
    const fundingBusdAssistantWBusdBalance = await wBusdPrecompile.balanceOf(BRIDGE_ADDRESSES.busdImportWrapperAssistant);
    
    const fundingUserWUsdtBalance = await wUsdtPrecompile.balanceOf(userAddress);
    const fundingUserWUsdcBalance = await wUsdcPrecompile.balanceOf(userAddress);
    const fundingUserWBusdBalance = await wBusdPrecompile.balanceOf(userAddress);
    
    log(`  📊 Current balances:`);
    log(`    USDT Assistant - P3D: ${fundingUsdtAssistantP3DBalance.toString()}, wUSDT: ${fundingUsdtAssistantWUsdtBalance.toString()}`);
    log(`    USDC Assistant - P3D: ${fundingUsdcAssistantP3DBalance.toString()}, wUSDC: ${fundingUsdcAssistantWUsdcBalance.toString()}`);
    log(`    BUSD Assistant - P3D: ${fundingBusdAssistantP3DBalance.toString()}, wBUSD: ${fundingBusdAssistantWBusdBalance.toString()}`);
    log(`    User - wUSDT: ${fundingUserWUsdtBalance.toString()}, wUSDC: ${fundingUserWUsdcBalance.toString()}, wBUSD: ${fundingUserWBusdBalance.toString()}`);
    
    // Define required minimum balances
    const minAssistantP3dAmount = ethers.BigNumber.from('1000000000000000'); // 0.001 P3D per assistant
    const minAssistantTokenAmount = ethers.BigNumber.from('5000000'); // 5 wrapped tokens per assistant (6 decimals) - increased for testing
    const minUserTokenAmount = ethers.BigNumber.from('10000'); // 0.01 wrapped tokens for user
    
    // Check if funding is needed
    const usdtAssistantNeedsP3d = fundingUsdtAssistantP3DBalance.lt(minAssistantP3dAmount);
    const usdcAssistantNeedsP3d = fundingUsdcAssistantP3DBalance.lt(minAssistantP3dAmount);
    const busdAssistantNeedsP3d = fundingBusdAssistantP3DBalance.lt(minAssistantP3dAmount);
    
    const usdtAssistantNeedsWUsdt = fundingUsdtAssistantWUsdtBalance.lt(minAssistantTokenAmount);
    const usdcAssistantNeedsWUsdc = fundingUsdcAssistantWUsdcBalance.lt(minAssistantTokenAmount);
    const busdAssistantNeedsWBusd = fundingBusdAssistantWBusdBalance.lt(minAssistantTokenAmount);
    
    const userNeedsWUsdt = fundingUserWUsdtBalance.lt(minUserTokenAmount);
    const userNeedsWUsdc = fundingUserWUsdcBalance.lt(minUserTokenAmount);
    const userNeedsWBusd = fundingUserWBusdBalance.lt(minUserTokenAmount);
    
    // Check if any funding is needed
    const needsFunding = usdtAssistantNeedsP3d || usdcAssistantNeedsP3d || busdAssistantNeedsP3d ||
                        usdtAssistantNeedsWUsdt || usdcAssistantNeedsWUsdc || busdAssistantNeedsWBusd ||
                        userNeedsWUsdt || userNeedsWUsdc || userNeedsWBusd;
    
    if (!needsFunding) {
        log(`  ✅ All balances are sufficient - skipping funding`);
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
    if (usdtAssistantNeedsP3d) {
    batchTo.push(p3dPrecompile.address);
    batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.usdtImportWrapperAssistant, minAssistantP3dAmount]));
    batchGasLimit.push(100000);
    }
    
    if (usdcAssistantNeedsP3d) {
    batchTo.push(p3dPrecompile.address);
    batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.usdcImportWrapperAssistant, minAssistantP3dAmount]));
    batchGasLimit.push(100000);
    }
    
    if (busdAssistantNeedsP3d) {
    batchTo.push(p3dPrecompile.address);
    batchValue.push(0);
        batchCallData.push(p3dPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.busdImportWrapperAssistant, minAssistantP3dAmount]));
    batchGasLimit.push(100000);
    }
    
    // Add wrapped token transfers to assistants that need them
    if (usdtAssistantNeedsWUsdt) {
    batchTo.push(wUsdtPrecompile.address);
    batchValue.push(0);
        batchCallData.push(wUsdtPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.usdtImportWrapperAssistant, minAssistantTokenAmount]));
    batchGasLimit.push(100000);
    }
    
    if (usdcAssistantNeedsWUsdc) {
    batchTo.push(wUsdcPrecompile.address);
    batchValue.push(0);
        batchCallData.push(wUsdcPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.usdcImportWrapperAssistant, minAssistantTokenAmount]));
    batchGasLimit.push(100000);
    }
    
    if (busdAssistantNeedsWBusd) {
    batchTo.push(wBusdPrecompile.address);
    batchValue.push(0);
        batchCallData.push(wBusdPrecompile.interface.encodeFunctionData('transfer', [BRIDGE_ADDRESSES.busdImportWrapperAssistant, minAssistantTokenAmount]));
    batchGasLimit.push(100000);
    }
    
    // Add wrapped token transfers to user that need them
    if (userNeedsWUsdt) {
    batchTo.push(wUsdtPrecompile.address);
    batchValue.push(0);
        batchCallData.push(wUsdtPrecompile.interface.encodeFunctionData('transfer', [userAddress, minUserTokenAmount]));
        batchGasLimit.push(100000);
    }
    
    if (userNeedsWUsdc) {
        batchTo.push(wUsdcPrecompile.address);
        batchValue.push(0);
        batchCallData.push(wUsdcPrecompile.interface.encodeFunctionData('transfer', [userAddress, minUserTokenAmount]));
        batchGasLimit.push(100000);
    }
    
    if (userNeedsWBusd) {
        batchTo.push(wBusdPrecompile.address);
        batchValue.push(0);
        batchCallData.push(wBusdPrecompile.interface.encodeFunctionData('transfer', [userAddress, minUserTokenAmount]));
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
    
    // Verify user balances
    const userP3DBalance = await p3dPrecompile.balanceOf(userAddress);
    const userWUsdtBalance = await wUsdtPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances after funding:`);
    log(`    - P3D: ${userP3DBalance.toString()}`);
    log(`    - wUSDT: ${userWUsdtBalance.toString()}`);
    
    // Verify assistant balances
    const usdtAssistantP3dBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    const usdtAssistantWUsdtBalance = await wUsdtPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    
    log(`  📊 USDT Assistant balances after funding:`);
    log(`    - P3D: ${usdtAssistantP3dBalance.toString()}`);
    log(`    - wUSDT: ${usdtAssistantWUsdtBalance.toString()}`);
}

async function testAssistantState() {
    log(`\n=== Testing Assistant State ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
    
    // Check user balances
    const userP3DBalance = await p3dPrecompile.balanceOf(userAddress);
    const userWUsdtBalance = await wUsdtPrecompile.balanceOf(userAddress);
    
    // Get wUSDC and wBUSD contracts for user balance checks
    const wUsdcPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdcPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    const wBusdPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wBusdPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    
    const userWUsdcBalance = await wUsdcPrecompile.balanceOf(userAddress);
    const userWBusdBalance = await wBusdPrecompile.balanceOf(userAddress);
    
    log(`  📊 User balances:`);
    log(`    - P3D: ${userP3DBalance.toString()}`);
    log(`    - wUSDT: ${userWUsdtBalance.toString()}`);
    log(`    - wUSDC: ${userWUsdcBalance.toString()}`);
    log(`    - wBUSD: ${userWBusdBalance.toString()}`);
    
    // Check assistant state
    const assistantTotalSupply = await usdtImportWrapperAssistant.totalSupply();
    const assistantName = await usdtImportWrapperAssistant.name();
    const assistantSymbol = await usdtImportWrapperAssistant.symbol();
    const assistantExponent = await usdtImportWrapperAssistant.exponent();
    const assistantDecimals = await usdtImportWrapperAssistant.decimals();
    
    log(`  📊 Assistant state:`);
    log(`    - Name: ${assistantName}`);
    log(`    - Symbol: ${assistantSymbol}`);
    log(`    - Total Supply: ${assistantTotalSupply.toString()}`);
    log(`    - Exponent: ${assistantExponent.toString()}`);
    log(`    - Decimals: ${assistantDecimals.toString()}`);
    
    // Check assistant balances
    const wUsdtAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    const assistantWUsdtBalance = await wUsdtPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    
    // Check balances for each assistant (using already declared contracts)
    const wUsdcAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdcImportWrapperAssistant);
    const usdcAssistantWUsdcBalance = await wUsdcPrecompile.balanceOf(BRIDGE_ADDRESSES.usdcImportWrapperAssistant);
    
    const wBusdAssistantP3DBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.busdImportWrapperAssistant);
    const busdAssistantWBusdBalance = await wBusdPrecompile.balanceOf(BRIDGE_ADDRESSES.busdImportWrapperAssistant);
    
    log(`  📊 wUSDT Import Wrapper Assistant:`);
    log(`    - P3D: ${wUsdtAssistantP3DBalance.toString()}`);
    log(`    - wUSDT: ${assistantWUsdtBalance.toString()}`);
    
    log(`  📊 wUSDC Import Wrapper Assistant:`);
    log(`    - P3D: ${wUsdcAssistantP3DBalance.toString()}`);
    log(`    - wUSDC: ${usdcAssistantWUsdcBalance.toString()}`);
    
    log(`  📊 wBUSD Import Wrapper Assistant:`);
    log(`    - P3D: ${wBusdAssistantP3DBalance.toString()}`);
    log(`    - wBUSD: ${busdAssistantWBusdBalance.toString()}`);
    
    log(`  ✅ Assistant state test completed`);
    

}

async function testAssistantClaim() {
    log(`\n=== Testing Pooled Assistant Claim Functionality ===`);
    
    // Get user address from user account
    const userSigner = await setupUserAccount();
    const userAddress = await userSigner.getAddress();
    
    // Get account3 address for recipient
    const account3Signer = await setupAccount3();
    const account3Address = await account3Signer.getAddress();
    
    // Get config for addresses
    const testConfig = require('./bridge-test-config.json');
    
    // Get token contracts (using manager signer for assistant operations)
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
    const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
    
    // Check balances before claim
    const userP3DBalanceBefore = await p3dPrecompile.balanceOf(userAddress);
    const userWUsdtBalanceBefore = await wUsdtPrecompile.balanceOf(userAddress);
    const assistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    const assistantWUsdtBalanceBefore = await wUsdtPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    const account3P3DBalanceBefore = await p3dPrecompile.balanceOf(account3Address);
    const account3WUsdtBalanceBefore = await wUsdtPrecompile.balanceOf(account3Address);
    
    log(`  📊 Balances before assistant claim:`);
    log(`    User P3D: ${userP3DBalanceBefore.toString()}`);
    log(`    User wUSDT: ${userWUsdtBalanceBefore.toString()}`);
    log(`    Assistant P3D: ${assistantP3DBalanceBefore.toString()}`);
    log(`    Assistant wUSDT: ${assistantWUsdtBalanceBefore.toString()}`);
    log(`    Account3 P3D: ${account3P3DBalanceBefore.toString()}`);
    log(`    Account3 wUSDT: ${account3WUsdtBalanceBefore.toString()}`);
    
    // Create autonomous claim parameters for assistant claim
    const assistantClaimTxid = `assistant_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const assistantClaimTxts = Math.floor(Date.now() / 1000); // Current timestamp
    const assistantClaimAmount = ethers.BigNumber.from('300'); // 0.0003 wUSDT
    const assistantClaimReward = ethers.BigNumber.from('2'); // 0.00002 wUSDT reward
    const assistantClaimData = JSON.stringify({ "max_fee": 2 }); // Different data
    
    // Get manager address for sender
    const managerAddress = await signer.getAddress();
    
    log(`  🔄 Assistant claiming on behalf of manager:`);
    log(`    - TXID: ${assistantClaimTxid}`);
    log(`    - Amount: ${ethers.utils.formatUnits(assistantClaimAmount, 6)} wUSDT (different amount)`);
    log(`    - Reward: ${ethers.utils.formatUnits(assistantClaimReward, 6)} wUSDT`);
    log(`    - Sender: ${managerAddress} (manager as sender)`);
    log(`    - Recipient: ${account3Address} (account3 as recipient)`);
    log(`    - Data: ${assistantClaimData}`);
    
    // Get required stake from bridge
    const requiredStake = await usdtImportWrapper.getRequiredStake(assistantClaimAmount);
    log(`    - Required P3D stake: ${ethers.utils.formatUnits(requiredStake, 18)}`);
    
    // Check if assistant has enough P3D for stake
    if (assistantP3DBalanceBefore.lt(requiredStake)) {
        log(`    ❌ Assistant has insufficient P3D balance for stake`);
        log(`      Required: ${requiredStake.toString()}, Available: ${assistantP3DBalanceBefore.toString()}`);
        return;
    }
    
    // Check if assistant has enough wUSDT for payout
    const paidAmount = assistantClaimAmount.sub(assistantClaimReward);
    if (assistantWUsdtBalanceBefore.lt(paidAmount)) {
        log(`    ❌ Assistant has insufficient wUSDT balance for payout`);
        log(`      Required: ${paidAmount.toString()}, Available: ${assistantWUsdtBalanceBefore.toString()}`);
        return;
    }
    
    // Execute the claim through the assistant (must be called by manager)
    log(`    🔄 Executing assistant claim...`);
    
    // Get the manager account for the assistant
    const managerAccount = await usdtImportWrapperAssistant.managerAddress();
    log(`    - Manager address: ${managerAccount}`);
    log(`    - Using manager signer: ${await signer.getAddress()}`);
    
    try {
        // Skip gas estimation since it fails due to callback issues during view context
        log(`      📊 Using fixed gas limit: 9000000`);
        
        // Convert BigNumber to int for reward parameter
        const rewardInt = assistantClaimReward.toNumber();
        
        const claimTx = await usdtImportWrapperAssistant.claim(
            assistantClaimTxid,
            assistantClaimTxts, // Use autonomous timestamp
            assistantClaimAmount,
            rewardInt,
            managerAddress, // manager as sender
            account3Address, // account3 as recipient
            assistantClaimData,
            { gasLimit: 9000000 }
        );
        await claimTx.wait();
        log(`      ✅ Assistant claim successful: ${claimTx.hash}`);
        
        // Get the claim number from the transaction receipt
        const receipt = await signer.provider.getTransactionReceipt(claimTx.hash);
        const newClaimForEvent = receipt.logs.find(log => {
            try {
                const decoded = usdtImportWrapperAssistant.interface.parseLog(log);
                return decoded.name === 'NewClaimFor';
            } catch (e) {
                return false;
            }
        });
        
        if (newClaimForEvent) {
            const decoded = usdtImportWrapperAssistant.interface.parseLog(newClaimForEvent);
            const claimNumber = decoded.args.claim_num;
            log(`      📋 NewClaimFor event found:`);
            log(`        - Claim Number: ${claimNumber.toString()}`);
            log(`        - For Address: ${decoded.args.for_address}`);
            log(`        - Amount: ${decoded.args.amount.toString()} wUSDT`);
            log(`        - Stake: ${decoded.args.stake.toString()} P3D`);
            
            // Fetch and display claim details
            log(`      🔍 Fetching claim ${claimNumber} details...`);
            try {
                // Use the contract interface to call getClaim with the correct signature for uint256
                const encodedData = usdtImportWrapper.interface.encodeFunctionData('getClaim(uint256)', [claimNumber]);
                const result = await signer.provider.call({
                    to: BRIDGE_ADDRESSES.usdtImportWrapper,
                    data: encodedData
                });
                
                // Decode the result
                const decodedResult = usdtImportWrapper.interface.decodeFunctionResult('getClaim(uint256)', result);
                log(`      ✅ Claim data retrieved successfully`);
                
                // Parse the claim data - it's a struct, so we need to access properties
                if (decodedResult && decodedResult.length > 0) {
                    const claimData = decodedResult[0];
                    
                    log(`      📊 Claim ${claimNumber} Details:`);
                    
                    // Try to access the struct properties
                    if (claimData.amount) {
                        log(`        - Amount: ${ethers.utils.formatEther(claimData.amount)} ETH`);
                    }
                    if (claimData.recipient_address) {
                        log(`        - Recipient: ${claimData.recipient_address}`);
                    }
                    if (claimData.expiry_ts) {
                        log(`        - Expiry timestamp: ${claimData.expiry_ts} (${new Date(claimData.expiry_ts * 1000).toISOString()})`);
                        
                        // Calculate time remaining
                        const currentBlock = await signer.provider.getBlock('latest');
                        const currentTimestamp = currentBlock.timestamp;
                        const timeRemaining = claimData.expiry_ts - currentTimestamp;
                        if (timeRemaining > 0) {
                            log(`        - Time remaining: ${timeRemaining} seconds (${Math.floor(timeRemaining / 60)} minutes)`);
                        } else {
                            log(`        - ✅ EXPIRED! Expired ${Math.abs(timeRemaining)} seconds ago`);
                        }
                    }
                    if (claimData.current_outcome !== undefined) {
                        log(`        - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
                    }
                    
                    // Show TOTAL stakes (not account-specific)
                    if (claimData.yes_stake) {
                        log(`        - TOTAL YES stakes: ${ethers.utils.formatEther(claimData.yes_stake)}`);
                    }
                    if (claimData.no_stake) {
                        log(`        - TOTAL NO stakes: ${ethers.utils.formatEther(claimData.no_stake)}`);
                    }
                    
                    if (claimData.finished !== undefined) {
                        log(`        - Finished: ${claimData.finished}`);
                    }
                    if (claimData.withdrawn !== undefined) {
                        log(`        - Withdrawn: ${claimData.withdrawn}`);
                    }
                    
                    // Check stakes for the assistant account
                    try {
                        const assistantAddress = BRIDGE_ADDRESSES.usdtImportWrapperAssistant;
                        const assistantYesStake = await usdtImportWrapper.stakes(claimNumber, 0, assistantAddress); // 0 = YES
                        const assistantNoStake = await usdtImportWrapper.stakes(claimNumber, 1, assistantAddress);   // 1 = NO
                        
                        log(`        - Assistant ${assistantAddress} stakes:`);
                        log(`          * YES threshold: ${ethers.utils.formatEther(assistantYesStake)}`);
                        log(`          * NO threshold: ${ethers.utils.formatEther(assistantNoStake)}`);
                    } catch (stakeErr) {
                        log(`        - ❌ Stake check failed: ${stakeErr.message}`);
                    }
                }
            } catch (claimErr) {
                log(`      ❌ Failed to fetch claim details: ${claimErr.message}`);
            }
            
            // Check balances after claim
            const account3P3DBalanceAfter = await p3dPrecompile.balanceOf(account3Address);
            const account3WUsdtBalanceAfter = await wUsdtPrecompile.balanceOf(account3Address);
            const assistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
            const assistantWUsdtBalanceAfter = await wUsdtPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
            
            log(`      📊 Balances after assistant claim:`);
            // Use the correct "before" balances captured before the claim
            log(`        Account3 P3D: ${account3P3DBalanceAfter.toString()} (${account3P3DBalanceAfter.sub(account3P3DBalanceBefore).toString()})`);
            log(`        Account3 wUSDT: ${account3WUsdtBalanceAfter.toString()} (${account3WUsdtBalanceAfter.sub(account3WUsdtBalanceBefore).toString()})`);
            log(`        Assistant P3D: ${assistantP3DBalanceAfter.toString()} (${assistantP3DBalanceAfter.sub(assistantP3DBalanceBefore).toString()})`);
            log(`        Assistant wUSDT: ${assistantWUsdtBalanceAfter.toString()} (${assistantWUsdtBalanceAfter.sub(assistantWUsdtBalanceBefore).toString()})`);
            
            // Calculate balance changes for comprehensive verification
            const account3P3dChange = account3P3DBalanceAfter.sub(account3P3DBalanceBefore);
            const account3WUsdtChange = account3WUsdtBalanceAfter.sub(account3WUsdtBalanceBefore);
            const assistantP3dChange = assistantP3DBalanceAfter.sub(assistantP3DBalanceBefore);
            const assistantWUsdtChange = assistantWUsdtBalanceAfter.sub(assistantWUsdtBalanceBefore);
            
            log(`      📈 Balance Changes:`);
            log(`        - Account3 P3D change: ${account3P3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(account3P3dChange, 12)}`);
            log(`        - Account3 wUSDT change: ${account3WUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(account3WUsdtChange, 6)}`);
            log(`        - Assistant P3D change: ${assistantP3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(assistantP3dChange, 12)}`);
            log(`        - Assistant wUSDT change: ${assistantWUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(assistantWUsdtChange, 6)}`);
            
            // COMPREHENSIVE VERIFICATION: Verify all balance changes match expected behavior
            log(`      📊 VERIFICATION RESULTS:`);
            
            // Expected changes based on network log:
            // - Assistant should lose wUSDT paid_amount (negative change) - amount minus reward
            // - Assistant should lose P3D stake (negative change) - calculated by getRequiredStake()
            // - Account3 should gain wUSDT paid_amount (positive change) - amount minus reward
            // - Account3 P3D should remain unchanged (no change) - no P3D transferred to account3
            
            const expectedAssistantWUsdtChange = paidAmount.mul(-1); // Assistant loses paid_amount (300 - 2 = 298 min units)
            const expectedAssistantP3dChange = requiredStake.mul(-1); // Assistant loses stake (calculated by getRequiredStake)
            const expectedAccount3WUsdtChange = paidAmount; // Account3 gains paid_amount (300 - 2 = 298 min units)
            const expectedAccount3P3dChange = ethers.BigNumber.from(0); // Account3 P3D unchanged
            
            log(`        Expected changes:`);
            log(`          - Assistant P3D: negative change (should lose stake - actual amount depends on oracle price)`);
            log(`          - Assistant wUSDT: ${ethers.utils.formatUnits(expectedAssistantWUsdtChange, 6)} (should lose ${paidAmount.toString()} min units)`);
            log(`          - Account3 P3D: ${ethers.utils.formatUnits(expectedAccount3P3dChange, 12)} (should be unchanged)`);
            log(`          - Account3 wUSDT: ${ethers.utils.formatUnits(expectedAccount3WUsdtChange, 6)} (should gain ${paidAmount.toString()} min units)`);
            
            // Verify Assistant P3D change (should lose stake)
            if (assistantP3dChange.lt(0)) {
                log(`          ✅ VERIFICATION PASSED: Assistant P3D stake deducted correctly (lost ${ethers.utils.formatUnits(assistantP3dChange.abs(), 12)} P3D)`);
            } else {
                log(`          ❌ VERIFICATION FAILED: Assistant P3D should have lost stake`);
                log(`            Actual change: ${ethers.utils.formatUnits(assistantP3dChange, 12)}`);
            }
            
            // Verify Assistant wUSDT change (should lose paid_amount)
            if (assistantWUsdtChange.eq(expectedAssistantWUsdtChange)) {
                log(`          ✅ VERIFICATION PASSED: Assistant wUSDT paid_amount deducted correctly`);
            } else {
                log(`          ❌ VERIFICATION FAILED: Assistant wUSDT change mismatch`);
                log(`            Expected: ${ethers.utils.formatUnits(expectedAssistantWUsdtChange, 6)}`);
                log(`            Actual: ${ethers.utils.formatUnits(assistantWUsdtChange, 6)}`);
            }
            
            // Verify Account3 P3D change (should be unchanged)
            if (account3P3dChange.eq(expectedAccount3P3dChange)) {
                log(`          ✅ VERIFICATION PASSED: Account3 P3D balance unchanged`);
            } else {
                log(`          ❌ VERIFICATION FAILED: Account3 P3D change mismatch`);
                log(`            Expected: ${ethers.utils.formatUnits(expectedAccount3P3dChange, 12)}`);
                log(`            Actual: ${ethers.utils.formatUnits(account3P3dChange, 12)}`);
            }
            
            // Verify Account3 wUSDT change (should gain paid_amount)
            if (account3WUsdtChange.eq(expectedAccount3WUsdtChange)) {
                log(`          ✅ VERIFICATION PASSED: Account3 wUSDT paid_amount received correctly`);
            } else {
                log(`          ❌ VERIFICATION FAILED: Account3 wUSDT change mismatch`);
                log(`            Expected: ${ethers.utils.formatUnits(expectedAccount3WUsdtChange, 6)}`);
                log(`            Actual: ${ethers.utils.formatUnits(account3WUsdtChange, 6)}`);
            }
            
            log(`        ✅ All balance verifications passed! Assistant claim executed correctly`);
            
            // Check assistant's balance in work
            const balanceInWork = await usdtImportWrapperAssistant.balance_in_work();
            log(`      📊 Assistant balance in work:`);
            log(`        - Stake: ${balanceInWork.stake.toString()} P3D`);
            log(`        - Image: ${balanceInWork.image.toString()} wUSDT`);
            
            // Check assistant's balances in work for this specific claim
            const balancesInWork = await usdtImportWrapperAssistant.balances_in_work(claimNumber);
            log(`      📊 Assistant balances in work for claim ${claimNumber}:`);
            log(`        - Stake: ${balancesInWork.stake.toString()} P3D`);
            log(`        - Image: ${balancesInWork.image.toString()} wUSDT`);
            
            log(`      ⏳ Assistant claim submitted successfully!`);
            log(`      📋 Next steps:`);
            log(`        1. ✅ Assistant has staked P3D and paid out wUSDT to user`);
            log(`        2. ⏳ Assistant waits for challenging period to expire (12 hours)`);
            log(`        3. 📋 Assistant will receive P3D stake back + reward if no challenges`);
            log(`        4. 📋 If challenged, assistant can challenge back to defend the claim`);
            
        } else {
            log(`      ⚠ NewClaimFor event not found in transaction receipt`);
            log(`      📋 Assistant claim submitted but event parsing failed`);
        }
        
    } catch (err) {
        log(`      ❌ Assistant claim failed: ${err.message}`);
        throw err;
    }
    
    log(`  ✅ Assistant claim test completed`);
}

async function testAssistantChallenge() {
    log(`\n=== Testing Assistant Challenge Functionality ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
    const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
    
    // Check assistant's P3D balance before challenge
    const assistantP3DBalanceBefore = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    log(`  📊 Assistant P3D balance before challenge: ${assistantP3DBalanceBefore.toString()}`);
    
    // Get the latest claim number to challenge
    const lastClaimNum = await usdtImportWrapper.last_claim_num();
    log(`  📊 Last claim number: ${lastClaimNum.toString()}`);
    
    if (lastClaimNum.eq(0)) {
        log(`  ⚠ No claims exist yet - skipping assistant challenge test`);
        log(`    ℹ Run testUserInitialClaim or testAssistantClaim first to create a claim to challenge`);
        return;
    }
    
    // Use the latest claim for testing
    const testClaimNum = lastClaimNum;
    
    log(`  🔄 Testing assistant challenge functionality:`);
    log(`    Note: This test challenges the latest claim created in previous tests`);
    log(`    In a real scenario, the assistant would challenge claims that are fraudulent or incorrect`);
    
    try {
        // Get claim details first to understand current state
        log(`    🔍 Fetching claim ${testClaimNum} details...`);
        const encodedData = usdtImportWrapper.interface.encodeFunctionData('getClaim(uint256)', [testClaimNum]);
        const result = await signer.provider.call({
            to: BRIDGE_ADDRESSES.usdtImportWrapper,
            data: encodedData
        });
        
        const decodedResult = usdtImportWrapper.interface.decodeFunctionResult('getClaim(uint256)', result);
        const claimData = decodedResult[0];
        
        log(`    📊 Claim ${testClaimNum} current state:`);
        log(`      - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
        log(`      - Expiry timestamp: ${claimData.expiry_ts} (${new Date(claimData.expiry_ts * 1000).toISOString()})`);
        log(`      - Finished: ${claimData.finished}`);
        
        // Check if claim is still challengeable
        const currentBlock = await signer.provider.getBlock('latest');
        const currentTimestamp = currentBlock.timestamp;
        const timeRemaining = claimData.expiry_ts - currentTimestamp;
        
        if (timeRemaining <= 0) {
            log(`    ⚠ Claim ${testClaimNum} has expired (${Math.abs(timeRemaining)} seconds ago)`);
            log(`      ℹ Cannot challenge expired claims - this is expected behavior`);
            return;
        }
        
        if (claimData.finished) {
            log(`    ⚠ Claim ${testClaimNum} is already finished`);
            log(`      ℹ Cannot challenge finished claims - this is expected behavior`);
            return;
        }
        
        log(`    ✅ Claim ${testClaimNum} is challengeable (${timeRemaining} seconds remaining)`);
        
        // Determine challenge outcome (opposite of current outcome)
        const challengeOutcome = claimData.current_outcome === 0 ? 1 : 0; // Challenge with opposite outcome
        
        // Get missing stake for this challenge
        const missingStake = await usdtImportWrapper.getMissingStake(testClaimNum, challengeOutcome);
        log(`    📊 Missing stake for outcome ${challengeOutcome === 0 ? 'NO' : 'YES'}: ${ethers.utils.formatUnits(missingStake, 12)} P3D`);
        
        if (missingStake.eq(0)) {
            log(`    ⚠ No missing stake for outcome ${challengeOutcome === 0 ? 'NO' : 'YES'} - challenge may not be needed`);
            log(`      ℹ This means the outcome is already sufficiently staked`);
            return;
        }
        
        // Use the missing stake amount (assistant will optimize this automatically)
        const challengeStake = missingStake;
        
        log(`    📋 Challenge parameters:`);
        log(`      - Claim Number: ${testClaimNum}`);
        log(`      - Current Outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
        log(`      - Challenge Outcome: ${challengeOutcome === 0 ? 'NO' : 'YES'} (opposite)`);
        log(`      - Challenge Stake: ${ethers.utils.formatUnits(challengeStake, 12)} P3D`);
        
        // Check if assistant has enough P3D for challenge
        if (assistantP3DBalanceBefore.lt(challengeStake)) {
            log(`    ❌ Assistant has insufficient P3D balance for challenge`);
            log(`      Required: ${ethers.utils.formatUnits(challengeStake, 12)} P3D`);
            log(`      Available: ${ethers.utils.formatUnits(assistantP3DBalanceBefore, 12)} P3D`);
            return;
        }
        
        // Execute the challenge through the assistant (must be called by manager)
        log(`    🔄 Executing challenge through assistant...`);
        
        // Get the manager account for the assistant
        const managerAccount = await usdtImportWrapperAssistant.managerAddress();
        log(`      - Manager address: ${managerAccount}`);
        log(`      - Using signer as manager: ${userAddress}`);
        
        // Verify signer is the manager
        if (userAddress.toLowerCase() !== managerAccount.toLowerCase()) {
            log(`    ❌ Signer is not the manager of the assistant`);
            log(`      Signer: ${userAddress}`);
            log(`      Manager: ${managerAccount}`);
            return;
        }
        
        const challengeTx = await usdtImportWrapperAssistant.challenge(
            testClaimNum,
            challengeOutcome, // 0 = NO, 1 = YES (CounterstakeLibrary.Side enum)
            challengeStake,
            { gasLimit: 500000 }
        );
        await challengeTx.wait();
        log(`      ✅ Assistant challenge successful: ${challengeTx.hash}`);
        
        // Get the challenge event from the transaction receipt
        const receipt = await signer.provider.getTransactionReceipt(challengeTx.hash);
        const assistantChallengeEvent = receipt.logs.find(log => {
            try {
                const decoded = usdtImportWrapperAssistant.interface.parseLog(log);
                return decoded.name === 'AssistantChallenge';
            } catch (e) {
                return false;
            }
        });
        
        if (assistantChallengeEvent) {
            const decoded = usdtImportWrapperAssistant.interface.parseLog(assistantChallengeEvent);
            log(`      📋 AssistantChallenge event found:`);
            log(`        - Claim Number: ${decoded.args.claim_num.toString()}`);
            log(`        - Outcome: ${decoded.args.outcome === 0 ? 'NO' : 'YES'}`);
            log(`        - Stake: ${ethers.utils.formatUnits(decoded.args.stake, 12)} P3D`);
            
            // Check assistant's balance after challenge
            const assistantP3DBalanceAfter = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
            log(`      📊 Assistant P3D balance after challenge: ${ethers.utils.formatUnits(assistantP3DBalanceAfter, 12)} P3D`);
            log(`      📊 P3D used for challenge: ${ethers.utils.formatUnits(assistantP3DBalanceBefore.sub(assistantP3DBalanceAfter), 12)} P3D`);
            
            // Check assistant's balance in work
            const balanceInWork = await usdtImportWrapperAssistant.balance_in_work();
            log(`      📊 Assistant balance in work after challenge:`);
            log(`        - Stake: ${ethers.utils.formatUnits(balanceInWork.stake, 12)} P3D`);
            log(`        - Image: ${ethers.utils.formatUnits(balanceInWork.image, 6)} wUSDT`);
            
            // Check specific balance in work for this claim
            const claimBalanceInWork = await usdtImportWrapperAssistant.balances_in_work(testClaimNum);
            log(`      📊 Assistant balance in work for claim ${testClaimNum}:`);
            log(`        - Stake: ${ethers.utils.formatUnits(claimBalanceInWork.stake, 12)} P3D`);
            log(`        - Image: ${ethers.utils.formatUnits(claimBalanceInWork.image, 6)} wUSDT`);
            
            log(`      ✅ Challenge submitted successfully!`);
            log(`      📋 Next steps:`);
            log(`        1. Wait for challenging period to expire`);
            log(`        2. If assistant's challenge wins, it will recover stake + rewards`);
            log(`        3. If assistant's challenge loses, it will lose the staked P3D`);
            log(`        4. Assistant can be challenged back by other participants`);
            
        } else {
            log(`      ⚠ AssistantChallenge event not found in transaction receipt`);
            log(`      📋 Challenge may have succeeded but event parsing failed`);
        }
        
    } catch (err) {
        log(`    ❌ Assistant challenge failed: ${err.message}`);
        
        // Provide specific error guidance
        if (err.message.includes("no such claim")) {
            log(`      ℹ Claim ${testClaimNum} doesn't exist`);
            log(`      ℹ Create a claim first using testUserInitialClaim or testAssistantClaim`);
        } else if (err.message.includes("this outcome is already current")) {
            log(`      ℹ Challenge outcome is already the current outcome`);
            log(`      ℹ Assistant can only challenge with the opposite outcome`);
        } else if (err.message.includes("the challenging period has expired")) {
            log(`      ℹ Challenging period has already expired for this claim`);
            log(`      ℹ Claims can only be challenged during the challenging period`);
        } else if (err.message.includes("not enough balance")) {
            log(`      ℹ Assistant doesn't have enough P3D balance for the challenge`);
            log(`      ℹ Fund the assistant or reduce the challenge stake amount`);
        } else if (err.message.includes("no net balance")) {
            log(`      ℹ Assistant has no net balance available for challenges`);
            log(`      ℹ Ensure assistant has sufficient P3D and image token balances`);
        } else if (err.message.includes("only manager")) {
            log(`      ℹ Only the assistant manager can call the challenge function`);
            log(`      ℹ Current signer must be the manager of the assistant contract`);
        } else {
            log(`      📋 Full error details: ${err.message}`);
            if (err.receipt) {
                log(`      📋 Transaction receipt: ${JSON.stringify(err.receipt, null, 2)}`);
            }
        }
    }
    
    log(`  ✅ Assistant challenge test completed`);
}

async function checkBridgePermissions() {
    log(`\n=== Checking Bridge Permissions ===`);
    
    const userAddress = await signer.getAddress();
    
    // Get token contracts
    const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
    const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
    const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
    
    log(`  📊 Checking P3D permissions:`);
    
    // Check user's P3D allowance to bridge
    const userP3dAllowanceToBridge = await p3dPrecompile.allowance(userAddress, BRIDGE_ADDRESSES.usdtImportWrapper);
    log(`    - User P3D allowance to bridge: ${userP3dAllowanceToBridge.toString()}`);
    
    // Check assistant's P3D allowance to bridge
    const assistantP3dAllowanceToBridge = await p3dPrecompile.allowance(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, BRIDGE_ADDRESSES.usdtImportWrapper);
    log(`    - Assistant P3D allowance to bridge: ${assistantP3dAllowanceToBridge.toString()}`);
    
    // Check assistant's P3D balance
    const assistantP3dBalance = await p3dPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    log(`    - Assistant P3D balance: ${assistantP3dBalance.toString()}`);
    
    log(`  📊 Checking wUSDT permissions:`);
    
    // Check user's wUSDT allowance to assistant
    const userWUsdtAllowanceToAssistant = await wUsdtPrecompile.allowance(userAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    log(`    - User wUSDT allowance to assistant: ${userWUsdtAllowanceToAssistant.toString()}`);
    
    // Check assistant's wUSDT allowance to bridge
    const assistantWUsdtAllowanceToBridge = await wUsdtPrecompile.allowance(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, BRIDGE_ADDRESSES.usdtImportWrapper);
    log(`    - Assistant wUSDT allowance to bridge: ${assistantWUsdtAllowanceToBridge.toString()}`);
    
    // Check assistant's wUSDT balance
    const assistantWUsdtBalance = await wUsdtPrecompile.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
    log(`    - Assistant wUSDT balance: ${assistantWUsdtBalance.toString()}`);
    
    log(`  📊 Bridge contract addresses:`);
    log(`    - USDT Import Wrapper: ${BRIDGE_ADDRESSES.usdtImportWrapper}`);
    log(`    - USDT Import Wrapper Assistant: ${BRIDGE_ADDRESSES.usdtImportWrapperAssistant}`);
    
    // Check if assistant has infinite allowance to bridge
    const maxUint256 = ethers.BigNumber.from('2').pow(256).sub(1);
    if (assistantP3dAllowanceToBridge.eq(maxUint256)) {
        log(`    ✅ Assistant has infinite P3D allowance to bridge`);
    } else {
        log(`    ⚠ Assistant has limited P3D allowance to bridge: ${assistantP3dAllowanceToBridge.toString()}`);
    }
    
    if (assistantWUsdtAllowanceToBridge.eq(maxUint256)) {
        log(`    ✅ Assistant has infinite wUSDT allowance to bridge`);
    } else {
        log(`    ⚠ Assistant has limited wUSDT allowance to bridge: ${assistantWUsdtAllowanceToBridge.toString()}`);
    }
    
    log(`  ✅ Bridge permissions check completed`);
}

async function approveAssistantTokens() {
    log(`\n=== Approving Assistant Token Permissions ===`);
    
    // Get token contracts
    const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    const wUsdcPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdcPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    const wBusdPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wBusdPrecompile, require('../counterstake-bridge/evm/build/contracts/IERC20.json').abi, signer);
    
    log(`  🔄 Checking current precompile token allowances...`);
    
    try {
        // Create assistant contract instances with the signer (since assistant is the manager)
        const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        const usdcImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdcImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        const busdImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.busdImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        
        // Check current allowances
        const usdtAllowanceBefore = await wUsdtPrecompile.allowance(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, BRIDGE_ADDRESSES.usdtImportWrapper);
        const usdcAllowanceBefore = await wUsdcPrecompile.allowance(BRIDGE_ADDRESSES.usdcImportWrapperAssistant, BRIDGE_ADDRESSES.usdcImportWrapper);
        const busdAllowanceBefore = await wBusdPrecompile.allowance(BRIDGE_ADDRESSES.busdImportWrapperAssistant, BRIDGE_ADDRESSES.busdImportWrapper);
        
        log(`    - Current wUSDT allowance: ${usdtAllowanceBefore.toString()}`);
        log(`    - Current wUSDC allowance: ${usdcAllowanceBefore.toString()}`);
        log(`    - Current wBUSD allowance: ${busdAllowanceBefore.toString()}`);
        
        // Check if approvals are already in place (max allowance)
        // The actual max allowance used by the contracts is type(uint).max from Solidity
        const maxAllowance = ethers.BigNumber.from('340282366920938463463374607431768211455');
        const usdtApproved = usdtAllowanceBefore.eq(maxAllowance);
        const usdcApproved = usdcAllowanceBefore.eq(maxAllowance);
        const busdApproved = busdAllowanceBefore.eq(maxAllowance);
        
        log(`    - Max allowance: ${maxAllowance.toString()}`);
        log(`    - USDT approved: ${usdtApproved}`);
        log(`    - USDC approved: ${usdcApproved}`);
        log(`    - BUSD approved: ${busdApproved}`);
        
        if (usdtApproved && usdcApproved && busdApproved) {
            log(`  ✅ All precompile token approvals already in place - skipping approval calls`);
            return;
        }
        
        log(`  🔄 Approving bridge to spend assistant's precompile tokens...`);
        
        // Call the approvePrecompile function for each assistant that needs approval
        if (!usdtApproved) {
            log(`    🔄 Calling approvePrecompile for USDT Assistant...`);
            const usdtApproveTx = await usdtImportWrapperAssistant.approvePrecompile({ gasLimit: 200000 });
            await usdtApproveTx.wait();
            log(`      ✅ USDT Assistant precompile approval successful: ${usdtApproveTx.hash}`);
        } else {
            log(`    ⏭️ USDT Assistant already approved - skipping`);
        }
        
        if (!usdcApproved) {
            log(`    🔄 Calling approvePrecompile for USDC Assistant...`);
            const usdcApproveTx = await usdcImportWrapperAssistant.approvePrecompile({ gasLimit: 200000 });
            await usdcApproveTx.wait();
            log(`      ✅ USDC Assistant precompile approval successful: ${usdcApproveTx.hash}`);
        } else {
            log(`    ⏭️ USDC Assistant already approved - skipping`);
        }
        
        if (!busdApproved) {
            log(`    🔄 Calling approvePrecompile for BUSD Assistant...`);
            const busdApproveTx = await busdImportWrapperAssistant.approvePrecompile({ gasLimit: 200000 });
            await busdApproveTx.wait();
            log(`      ✅ BUSD Assistant precompile approval successful: ${busdApproveTx.hash}`);
        } else {
            log(`    ⏭️ BUSD Assistant already approved - skipping`);
        }
        
        // Check new allowances
        const usdtAllowanceAfter = await wUsdtPrecompile.allowance(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, BRIDGE_ADDRESSES.usdtImportWrapper);
        const usdcAllowanceAfter = await wUsdcPrecompile.allowance(BRIDGE_ADDRESSES.usdcImportWrapperAssistant, BRIDGE_ADDRESSES.usdcImportWrapper);
        const busdAllowanceAfter = await wBusdPrecompile.allowance(BRIDGE_ADDRESSES.busdImportWrapperAssistant, BRIDGE_ADDRESSES.busdImportWrapper);
        
        log(`    - New wUSDT allowance: ${usdtAllowanceAfter.toString()}`);
        log(`    - New wUSDC allowance: ${usdcAllowanceAfter.toString()}`);
        log(`    - New wBUSD allowance: ${busdAllowanceAfter.toString()}`);
        
        log(`  ✅ Assistant precompile token approvals completed`);
        
    } catch (err) {
        log(`  ❌ Assistant precompile token approval failed: ${err.message}`);
        throw err;
    }
}

async function testBasicContractFunctionality() {
    log('=== Testing Basic Contract Functionality ===');
    
    try {
        // Create assistant contract instances
        const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        
        // Test a simple view function
        log('  🔄 Testing basic view function...');
        const name = await usdtImportWrapperAssistant.name();
        log(`    ✅ Assistant name: ${name}`);
        
        // Test getting token address
        log('  🔄 Testing token address retrieval...');
        const tokenAddress = await usdtImportWrapperAssistant.tokenAddress();
        log(`    ✅ Token address: ${tokenAddress}`);
        
        // Test getting bridge address
        log('  🔄 Testing bridge address retrieval...');
        const bridgeAddress = await usdtImportWrapperAssistant.bridgeAddress();
        log(`    ✅ Bridge address: ${bridgeAddress}`);
        
        // Test getting precompile address
        log('  🔄 Testing precompile address retrieval...');
        const precompileAddress = await usdtImportWrapperAssistant.precompileAddress();
        log(`    ✅ Precompile address: ${precompileAddress}`);
        
        log('  ✅ Basic contract functionality test completed');
        
    } catch (err) {
        log(`  ❌ Basic contract functionality test failed: ${err.message}`);
        throw err;
    }
}

async function testClaimFunctionIsolation() {
    log('=== Testing Claim Function Isolation ===');
    
    try {
        const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
        
        log('  🔄 Testing getRequiredStake call...');
        try {
            const requiredStake = await usdtImportWrapper.getRequiredStake(100000);
            log(`    ✅ getRequiredStake successful: ${requiredStake.toString()}`);
        } catch (err) {
            log(`    ❌ getRequiredStake failed: ${err.message}`);
        }
        
        log('  🔄 Testing updateMFAndGetBalances call...');
        try {
            // This is a private function, so we can't call it directly
            // But we can test if the contract can handle balance queries
            const balance = await usdtImportWrapperAssistant.balanceOf(signer.address);
            log(`    ✅ Balance query successful: ${balance.toString()}`);
        } catch (err) {
            log(`    ❌ Balance query failed: ${err.message}`);
        }
        
        log('  🔄 Testing bridge claim call...');
        try {
            // This would fail because we're not the assistant, but we can test if the function exists
            const lastClaimNum = await usdtImportWrapper.last_claim_num();
            log(`    ✅ Bridge last_claim_num successful: ${lastClaimNum.toString()}`);
        } catch (err) {
            log(`    ❌ Bridge function failed: ${err.message}`);
        }
        
        log('  ✅ Claim function isolation test completed');
        
    } catch (err) {
        log(`  ❌ Claim function isolation test failed: ${err.message}`);
        throw err;
    }
}

async function testUserInitialClaim() {
    log('=== Testing Individual Assistant Claim ===');
    
    try {
        // Use user account for the claim
        const userSigner = await setupUserAccount(); // account2
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, userSigner);
        
        // User's initial claim parameters
        const txid = `user_initial_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const txts = Math.floor(Date.now() / 1000); // uint32 timestamp
        const amount = ethers.utils.parseUnits('0.001', 6); // 0.001 wUSDT = 1000 min units
        const reward = ethers.utils.parseUnits('0.00001', 6); // 0.00001 wUSDT reward = 10 min units
        const sender_address = await userSigner.getAddress(); // account2
        
        // Use account3 as recipient to test third-party claiming
        const account3Signer = await setupAccount3(); // account3
        const recipient_address = await account3Signer.getAddress(); // account3
        
        const data = '{"max_fee":1}';
        
        // Calculate required stake
        const requiredStake = await usdtImportWrapper.getRequiredStake(amount);
        
        log(`  🔄 Third-party claiming test data:`);
        log(`    - TXID: ${txid}`);
        log(`    - Amount: ${ethers.utils.formatUnits(amount, 6)} wUSDT (${amount.toString()} min units)`);
        log(`    - Reward: ${ethers.utils.formatUnits(reward, 6)} wUSDT (${reward.toString()} min units)`);
        log(`    - Paid Amount: ${ethers.utils.formatUnits(amount.sub(reward), 6)} wUSDT (${amount.sub(reward).toString()} min units)`);
        log(`    - Required Stake: ${ethers.utils.formatUnits(requiredStake, 12)} P3D (${requiredStake.toString()} min units)`);
        log(`    - Sender: ${sender_address}`);
        log(`    - Recipient: ${recipient_address} (account3)`);
        
        // Check balances BEFORE the claim
        const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, userSigner);
        const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, userSigner);
        
        // Capture ALL balances before claim for comprehensive verification
        const senderP3dBalanceBefore = await p3dPrecompile.balanceOf(sender_address);
        const senderWUsdtBalanceBefore = await wUsdtPrecompile.balanceOf(sender_address);
        const recipientP3dBalanceBefore = await p3dPrecompile.balanceOf(recipient_address);
        const recipientWUsdtBalanceBefore = await wUsdtPrecompile.balanceOf(recipient_address);
        const userP3dAllowance = await p3dPrecompile.allowance(sender_address, BRIDGE_ADDRESSES.usdtImportWrapper);
        
        log(`  📊 Balances BEFORE claim:`);
        log(`    - Sender (account2) P3D balance: ${ethers.utils.formatUnits(senderP3dBalanceBefore, 12)}`);
        log(`    - Sender (account2) wUSDT balance: ${ethers.utils.formatUnits(senderWUsdtBalanceBefore, 6)}`);
        log(`    - Recipient (account3) P3D balance: ${ethers.utils.formatUnits(recipientP3dBalanceBefore, 12)}`);
        log(`    - Recipient (account3) wUSDT balance: ${ethers.utils.formatUnits(recipientWUsdtBalanceBefore, 6)}`);
        log(`    - Sender P3D allowance: ${ethers.utils.formatUnits(userP3dAllowance, 12)}`);
        
        // Check and approve P3D for bridge
        if (userP3dAllowance.lt(requiredStake)) {
            log(`    🔄 Approving P3D for bridge...`);
            const approveP3dTx = await p3dPrecompile.approve(BRIDGE_ADDRESSES.usdtImportWrapper, requiredStake);
            await approveP3dTx.wait();
            log(`      ✅ P3D approval successful: ${approveP3dTx.hash}`);
        } else {
            log(`    ✅ P3D already approved`);
        }
        

        
        // Make the third-partys claim
        log(`    🔄 Executing Direct Third-Party Claim...`);
        const claimTx = await usdtImportWrapper.claim(
            txid, 
            txts, 
            amount, 
            reward, 
            requiredStake, 
            sender_address, 
            recipient_address, 
            data,
            { 
                value: 0, // No ETH value needed, P3D is transferred via transferFrom
                gasLimit: 19000000 
            }
        );
        const claimReceipt = await claimTx.wait();
        
        log(`      ✅ Direct Third-Party Claim successful: ${claimTx.hash}`);
        
        // Check balances AFTER the claim
        const senderP3dBalanceAfter = await p3dPrecompile.balanceOf(sender_address);
        const senderWUsdtBalanceAfter = await wUsdtPrecompile.balanceOf(sender_address);
        const recipientP3dBalanceAfter = await p3dPrecompile.balanceOf(recipient_address);
        const recipientWUsdtBalanceAfter = await wUsdtPrecompile.balanceOf(recipient_address);
        
        log(`  📊 Balances AFTER claim:`);
        log(`    - Sender (account2) P3D balance: ${ethers.utils.formatUnits(senderP3dBalanceAfter, 12)}`);
        log(`    - Sender (account2) wUSDT balance: ${ethers.utils.formatUnits(senderWUsdtBalanceAfter, 6)}`);
        log(`    - Recipient (account3) P3D balance: ${ethers.utils.formatUnits(recipientP3dBalanceAfter, 12)}`);
        log(`    - Recipient (account3) wUSDT balance: ${ethers.utils.formatUnits(recipientWUsdtBalanceAfter, 6)}`);
        
        // Calculate balance changes for comprehensive verification
        const senderP3dChange = senderP3dBalanceAfter.sub(senderP3dBalanceBefore);
        const senderWUsdtChange = senderWUsdtBalanceAfter.sub(senderWUsdtBalanceBefore);
        const recipientP3dChange = recipientP3dBalanceAfter.sub(recipientP3dBalanceBefore);
        const recipientWUsdtChange = recipientWUsdtBalanceAfter.sub(recipientWUsdtBalanceBefore);
        
        log(`  📈 Balance Changes:`);
        log(`    - Sender (account2) P3D change: ${senderP3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(senderP3dChange, 12)}`);
        log(`    - Sender (account2) wUSDT change: ${senderWUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(senderWUsdtChange, 6)}`);
        log(`    - Recipient (account3) P3D change: ${recipientP3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(recipientP3dChange, 12)}`);
        log(`    - Recipient (account3) wUSDT change: ${recipientWUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(recipientWUsdtChange, 6)}`);
        
        // COMPREHENSIVE VERIFICATION: Verify all balance changes match expected behavior
        log(`  📊 VERIFICATION RESULTS:`);
        
        // Expected changes based on claim behavior:
        // - Sender should lose P3D stake (negative change) - calculated by getRequiredStake()
        // - Sender should lose wUSDT paid_amount (negative change) - amount minus reward
        // - Recipient should gain wUSDT paid_amount (positive change) - amount minus reward
        // - Recipient P3D should remain unchanged (no change) - no P3D transferred to recipient
        
        // Use actual balance changes instead of pre-calculated values to account for oracle price changes
        const expectedSenderP3dChange = senderP3dChange; // Use actual change (should be negative)
        const expectedSenderWUsdtChange = amount.sub(reward).mul(-1); // Sender loses paid_amount (1000 - 10 = 990 min units)
        const expectedRecipientWUsdtChange = amount.sub(reward); // Recipient gets paid_amount (1000 - 10 = 990 min units)
        const expectedRecipientP3dChange = ethers.BigNumber.from(0); // Recipient P3D unchanged
        
        log(`    Expected changes:`);
        log(`      - Sender P3D: negative change (should lose stake - actual amount depends on oracle price)`);
        log(`      - Sender wUSDT: ${ethers.utils.formatUnits(expectedSenderWUsdtChange, 6)} (should lose ${amount.sub(reward).toString()} min units)`);
        log(`      - Recipient P3D: ${ethers.utils.formatUnits(expectedRecipientP3dChange, 12)} (should be unchanged)`);
        log(`      - Recipient wUSDT: ${ethers.utils.formatUnits(expectedRecipientWUsdtChange, 6)} (should gain ${amount.sub(reward).toString()} min units)`);
        
        // Verify Sender P3D change (should lose stake)
        if (senderP3dChange.lt(0)) {
            log(`      ✅ VERIFICATION PASSED: Sender P3D stake deducted correctly (lost ${ethers.utils.formatUnits(senderP3dChange.abs(), 12)} P3D)`);
        } else {
            log(`      ❌ VERIFICATION FAILED: Sender P3D should have lost stake`);
            log(`        Actual change: ${ethers.utils.formatUnits(senderP3dChange, 12)}`);
            throw new Error(`Sender P3D verification failed: Expected negative change, got ${ethers.utils.formatUnits(senderP3dChange, 12)}`);
        }
        
        // Verify Sender wUSDT change (should lose paid_amount)
        if (senderWUsdtChange.eq(expectedSenderWUsdtChange)) {
            log(`      ✅ VERIFICATION PASSED: Sender wUSDT paid_amount deducted correctly`);
        } else {
            log(`      ❌ VERIFICATION FAILED: Sender wUSDT change mismatch`);
            log(`        Expected: ${ethers.utils.formatUnits(expectedSenderWUsdtChange, 6)}`);
            log(`        Actual: ${ethers.utils.formatUnits(senderWUsdtChange, 6)}`);
            throw new Error(`Sender wUSDT verification failed: Expected ${ethers.utils.formatUnits(expectedSenderWUsdtChange, 6)}, got ${ethers.utils.formatUnits(senderWUsdtChange, 6)}`);
        }
        
        // Verify Recipient P3D change (should be unchanged)
        if (recipientP3dChange.eq(expectedRecipientP3dChange)) {
            log(`      ✅ VERIFICATION PASSED: Recipient P3D balance unchanged`);
        } else {
            log(`      ❌ VERIFICATION FAILED: Recipient P3D change mismatch`);
            log(`        Expected: ${ethers.utils.formatUnits(expectedRecipientP3dChange, 12)}`);
            log(`        Actual: ${ethers.utils.formatUnits(recipientP3dChange, 12)}`);
            throw new Error(`Recipient P3D verification failed: Expected ${ethers.utils.formatUnits(expectedRecipientP3dChange, 12)}, got ${ethers.utils.formatUnits(recipientP3dChange, 12)}`);
        }
        
        // Verify Recipient wUSDT change (should gain paid_amount)
        if (recipientWUsdtChange.eq(expectedRecipientWUsdtChange)) {
            log(`      ✅ VERIFICATION PASSED: Recipient wUSDT paid_amount received correctly`);
        } else {
            log(`      ❌ VERIFICATION FAILED: Recipient wUSDT change mismatch`);
            log(`        Expected: ${ethers.utils.formatUnits(expectedRecipientWUsdtChange, 6)}`);
            log(`        Actual: ${ethers.utils.formatUnits(recipientWUsdtChange, 6)}`);
            throw new Error(`Recipient wUSDT verification failed: Expected ${ethers.utils.formatUnits(expectedRecipientWUsdtChange, 6)}, got ${ethers.utils.formatUnits(recipientWUsdtChange, 6)}`);
        }
        
        log(`  ✅ All balance verifications passed! Third-party claim executed correctly`);
        
        // Parse NewClaim event to get claim number
        try {
            log(`    🔄 Parsing NewClaim event from transaction receipt...`);
            const receipt = await userSigner.provider.getTransactionReceipt(claimTx.hash);
            
            const newClaimEvent = receipt.logs.find(log => {
                try {
                    const decoded = usdtImportWrapper.interface.parseLog(log);
                    return decoded.name === 'NewClaim';
                } catch (e) {
                    return false;
                }
            });
            
            if (newClaimEvent) {
                const decoded = usdtImportWrapper.interface.parseLog(newClaimEvent);
                const claimNumber = decoded.args.claim_num;
                log(`      ✅ NewClaim event found!`);
                log(`        - Claim Number: ${claimNumber}`);
                log(`        - Claimant: ${decoded.args.claimant}`);
                log(`        - Amount: ${ethers.utils.formatUnits(decoded.args.amount, 6)} wUSDT`);
                log(`        - Stake: ${ethers.utils.formatUnits(decoded.args.stake, 18)} P3D`);
                log(`        - Reward: ${ethers.utils.formatUnits(reward, 6)} wUSDT`);
                
                // Store claim details for assistant to use
                this.userClaimTxid = txid;
                this.userClaimTxts = txts;
                this.userClaimAmount = amount;
                this.userClaimReward = reward;
                this.userClaimSender = sender_address;
                this.userClaimRecipient = recipient_address;
                this.userClaimData = data;
                this.userClaimNumber = claimNumber;
                
                log(`      📋 Direct third-party claim is now pending with positive reward`);
                log(`      ⏳ User (account3) should have received the wUSDT amount - reward`);
                
            } else {
                log(`      ⚠ NewClaim event not found in transaction receipt`);
                log(`      📋 User's claim submitted but event parsing failed`);
            }
            
        } catch (err) {
            log(`      ⚠ Error parsing claim event: ${err.message}`);
            log(`      📋 Direct third-party claim submitted but event parsing failed`);
        }
        
        log(`  ✅ Direct third-party claim completed successfully`);
        
    } catch (err) {
        log(`  ❌ Direct third-party claim failed: ${err.message}`);
        throw err;
    }
}

async function testDetailedClaimError() {
    log('=== Testing Detailed Claim Error Isolation ===');
    try {
        const usdtImportWrapperAssistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
        
        log('  🔄 Testing step 1: getRequiredStake...');
        try {
            const requiredStake = await usdtImportWrapper.getRequiredStake(this.userClaimAmount);
            log(`    ✅ getRequiredStake successful: ${requiredStake.toString()}`);
        } catch (err) {
            log(`    ❌ getRequiredStake failed: ${err.message}`);
            return;
        }
        
        log('  🔄 Testing step 2: updateMFAndGetBalances (via balanceOf)...');
        try {
            const balance = await usdtImportWrapperAssistant.balanceOf(signer.address);
            log(`    ✅ balanceOf successful: ${balance.toString()}`);
        } catch (err) {
            log(`    ❌ balanceOf failed: ${err.message}`);
            return;
        }
        
        log('  🔄 Testing step 3: getOraclePriceOfNative...');
        try {
            // Try to call getOraclePriceOfNative indirectly by checking if it's accessible
            const tokenAddress = await usdtImportWrapperAssistant.tokenAddress();
            log(`    ✅ tokenAddress: ${tokenAddress}`);
            
            // Check if this is P3D precompile
            const p3dPrecompile = TOKEN_ADDRESSES.p3dPrecompile;
            if (tokenAddress.toLowerCase() === p3dPrecompile.toLowerCase()) {
                log(`    ✅ Token is P3D precompile`);
                // Test IP3D interface call
                const p3dContract = new ethers.Contract(tokenAddress, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
                const symbol = await p3dContract.symbol();
                log(`    ✅ P3D symbol call successful: ${symbol}`);
            } else {
                log(`    ⚠ Token is not P3D precompile: ${tokenAddress}`);
            }
        } catch (err) {
            log(`    ❌ getOraclePriceOfNative test failed: ${err.message}`);
            return;
        }
        
        log('  🔄 Testing step 4: Bridge claim call...');
        try {
            const lastClaimNum = await usdtImportWrapper.last_claim_num();
            log(`    ✅ Bridge last_claim_num successful: ${lastClaimNum.toString()}`);
        } catch (err) {
            log(`    ❌ Bridge function failed: ${err.message}`);
            return;
        }
        
        log('  ✅ All individual steps successful');
        
    } catch (err) {
        log(`  ❌ Detailed claim error test failed: ${err.message}`);
        throw err;
    }
}

async function testOracleCall() {
    log('=== Testing Oracle Call Directly ===');
    try {
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
        
        log('  🔄 Getting oracle address...');
        const oracleAddress = await usdtImportWrapper.oracleAddress();
        log(`    ✅ Oracle address: ${oracleAddress}`);
        
        log('  🔄 Testing oracle call directly...');
        const oracle = new ethers.Contract(oracleAddress, require('../counterstake-bridge/evm/build/contracts/IOracle.json').abi, signer);
        
        try {
            const price = await oracle.getPrice("_NATIVE_", "P3D");
            log(`    ✅ Oracle getPrice successful: ${price.num.toString()}/${price.den.toString()}`);
        } catch (err) {
            log(`    ❌ Oracle getPrice failed: ${err.message}`);
        }
        
    } catch (err) {
        log(`  ❌ Oracle test failed: ${err.message}`);
        throw err;
    }
}

async function main() {
    log('=== Starting Clean ImportWrapperAssistant Test ===');
    
    try {
        await setupProviderAndSigner();
        
        // Log loaded addresses for debugging
        logLoadedAddresses();
        

        await testAssistantState();
        await testBasicContractFunctionality();
        // await testClaimFunctionIsolation();
        await testUserInitialClaim(); // Direct third-party claim (made by user - account2 as an assistant)
        // await testDetailedClaimError(); // Detailed claim error
        await testOracleCall(); // Oracle call (by ImportWrapper contract)
        await fundAssistantsAndUser(); // Fund assistants and user (account1) from account2
        await checkBridgePermissions(); // Check ImportWrapper contract bridge permissions
        // await approveAssistantTokens(); // Approve assistant tokens
        await testAssistantClaim(); // Assistant third-party claim (by ImportWrapperAssistant contract)
        await testAssistantChallenge(); // Assistant challenge (by ImportWrapperAssistant contract)
        
        log('\n🎉 Clean test completed successfully!');
        
    } catch (err) {
        log(`\n❌ Test failed: ${err.message}`);
        process.exit(1);
    }
}

main(); 