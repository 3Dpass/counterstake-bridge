const { ethers } = require('ethers');

// Load configuration
const config = require('./bridge-test-config.json');

// Function to get bridge addresses from config
function getBridgeAddresses() {
    const mainnetContracts = config.mainnet.contracts;
    
    return {
        usdtImportWrapper: mainnetContracts.USDTImportWrapper["3dpassEVMcontract"],
        usdcImportWrapper: mainnetContracts.USDCImportWrapper["3dpassEVMcontract"], 
        busdImportWrapper: mainnetContracts.BUSDImportWrapper["3dpassEVMcontract"]
    };
}

function log(message) {
    console.log(message);
}

async function testWithdrawOnly() {
    log('=== Testing Withdraw Function Only ===');
    
    try {
        // Setup provider and signer
        log('Setting up provider and signer...');
        const RPC_URL = config.development.network.rpcUrl;
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        
        // Load test configuration for private key
        const testConfig = require('./bridge-test-config.json');
        const privateKey = testConfig.development.accounts.account2.privateKey;
        if (!privateKey) {
            throw new Error('Private key for account2 not found in bridge-test-config.json');
        }
        
        const signer = new ethers.Wallet(privateKey, provider);
        const signerAddress = signer.address;
        log(`Using signer address: ${signerAddress}`);
        
        // Get current block and timestamp
        const currentBlock = await provider.getBlock('latest');
        const currentTimestamp = currentBlock.timestamp;
        log(`Current block: ${currentBlock.number}`);
        log(`Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`);
        
        // Get bridge addresses
        const BRIDGE_ADDRESSES = getBridgeAddresses();
        log(`USDT Import Wrapper: ${BRIDGE_ADDRESSES.usdtImportWrapper}`);
        
        // Load contract ABI - use Counterstake ABI for reading claim details
        const counterstakeAbi = require('../counterstake-bridge/evm/build/contracts/Counterstake.json').abi;
        const importWrapperAbi = require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi;
        
        // Create contract instances
        const usdtImportWrapperRead = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, counterstakeAbi, provider);
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, importWrapperAbi, signer);
        
        // Token contracts for balance checking
        const developmentAssets = config.development.assets;
        const TOKEN_ADDRESSES = {
            p3dPrecompile: config.development.contracts.nativeTokenPrecompile,
            wUsdtPrecompile: developmentAssets.Asset1.evmContract,
            wUsdcPrecompile: developmentAssets.Asset2.evmContract,
            wBusdPrecompile: developmentAssets.Asset3.evmContract
        };
        const p3dPrecompile = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, provider);
        const wUsdtPrecompile = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, provider);
        
        // Get last claim number
        log('\n--- Claim Information ---');
        try {
            const lastClaimNum = await usdtImportWrapperRead.last_claim_num();
            log(`Last claim number: ${lastClaimNum.toString()}`);
            
            // Check ongoing claims
            const ongoingClaimNums = await usdtImportWrapperRead.getOngoingClaimNums();
            log(`Ongoing claim numbers: ${ongoingClaimNums.map(n => n.toString()).join(', ')}`);
            
        } catch (err) {
            log(`❌ Claim info failed: ${err.message}`);
        }
        
        // Check last 20 claims and find withdrawable ones
        log('\n--- Checking Last 20 Claims ---');
        const withdrawableClaims = [];
        
        for (let claimNum = 1; claimNum <= 20; claimNum++) {
            try {
                // First check if the claim exists by checking stakes
                let claimExists = false;
                let accountYesStake = ethers.BigNumber.from(0);
                let accountNoStake = ethers.BigNumber.from(0);
                
                try {
                    // Check stakes for the signer account
                    accountYesStake = await usdtImportWrapperRead.stakes(claimNum, 0, signerAddress); // 0 = YES
                    accountNoStake = await usdtImportWrapperRead.stakes(claimNum, 1, signerAddress);   // 1 = NO
                    
                    if (accountYesStake.gt(0) || accountNoStake.gt(0)) {
                        claimExists = true;
                        log(`\nClaim ${claimNum}:`);
                        log(`  - ✅ Claim ${claimNum} EXISTS`);
                        log(`  - Account ${signerAddress} stakes:`);
                        log(`    * YES threshold: ${ethers.utils.formatEther(accountYesStake)}`);
                        log(`    * NO threshold: ${ethers.utils.formatEther(accountNoStake)}`);
                    }
                    // Skip logging for non-existent claims to reduce noise
                } catch (stakeErr) {
                    log(`  - ❌ Stake check failed: ${stakeErr.message}`);
                }
                
                // If claim exists, try to get detailed claim information
                if (claimExists) {
                    try {
                        // Use the contract interface to call getClaim with the correct signature for uint256
                        const encodedData = usdtImportWrapperRead.interface.encodeFunctionData('getClaim(uint256)', [claimNum]);
                        const result = await provider.call({
                            to: BRIDGE_ADDRESSES.usdtImportWrapper,
                            data: encodedData
                        });
                        
                        // Decode the result
                        const decodedResult = usdtImportWrapperRead.interface.decodeFunctionResult('getClaim(uint256)', result);
                        log(`  - ✅ Claim data retrieved successfully`);
                        
                        // Parse the claim data - it's a struct, so we need to access properties
                        if (decodedResult && decodedResult.length > 0) {
                            const claimData = decodedResult[0];
                            
                            // Try to access the struct properties
                            if (claimData.amount) {
                                log(`  - Amount: ${ethers.utils.formatEther(claimData.amount)} ETH`);
                            }
                            if (claimData.recipient_address) {
                                log(`  - Recipient: ${claimData.recipient_address}`);
                            }
                            if (claimData.expiry_ts) {
                                log(`  - Expiry timestamp: ${claimData.expiry_ts} (${new Date(claimData.expiry_ts * 1000).toISOString()})`);
                                
                                // Calculate time remaining
                                const timeRemaining = claimData.expiry_ts - currentTimestamp;
                                if (timeRemaining > 0) {
                                    log(`  - Time remaining: ${timeRemaining} seconds (${Math.floor(timeRemaining / 60)} minutes)`);
                                } else {
                                    log(`  - ✅ EXPIRED! Expired ${Math.abs(timeRemaining)} seconds ago`);
                                }
                            }
                            if (claimData.current_outcome !== undefined) {
                                log(`  - Current outcome: ${claimData.current_outcome === 0 ? 'NO' : 'YES'}`);
                            }
                            
                            // Show TOTAL stakes (not account-specific)
                            if (claimData.yes_stake) {
                                log(`  - TOTAL YES stakes: ${ethers.utils.formatEther(claimData.yes_stake)}`);
                            }
                            if (claimData.no_stake) {
                                log(`  - TOTAL NO stakes: ${ethers.utils.formatEther(claimData.no_stake)}`);
                            }
                            
                            if (claimData.finished !== undefined) {
                                log(`  - Finished: ${claimData.finished}`);
                            }
                            if (claimData.withdrawn !== undefined) {
                                log(`  - Withdrawn: ${claimData.withdrawn}`);
                            }
                            
                            // Check if this claim is withdrawable by the signer
                            const isExpired = claimData.expiry_ts && (claimData.expiry_ts - currentTimestamp) <= 0;
                            const isNotWithdrawn = claimData.withdrawn !== undefined && !claimData.withdrawn;
                            const hasStakes = accountYesStake.gt(0) || accountNoStake.gt(0);
                            
                            if (isExpired && isNotWithdrawn && hasStakes) {
                                log(`  - 🎯 WITHDRAWABLE: Expired, not withdrawn, signer has stakes`);
                                withdrawableClaims.push({
                                    claimNum: claimNum,
                                    amount: claimData.amount,
                                    recipient: claimData.recipient_address,
                                    expiry: claimData.expiry_ts
                                });
                            } else {
                                if (!isExpired) log(`  - ⏳ Not expired yet`);
                                if (!isNotWithdrawn) log(`  - 💰 Already withdrawn`);
                                if (!hasStakes) log(`  - 👤 Signer has no stakes in this claim`);
                            }
                        }
                    } catch (claimErr) {
                        log(`  - ❌ getClaim failed: ${claimErr.message}`);
                    }
                }
                
        } catch (err) {
                if (!err.message.includes('no such claim') && !err.message.includes('claim does not exist')) {
                    log(`  - ❌ Error: ${err.message}`);
                }
            }
        }
        
        // Attempt to withdraw from withdrawable claims
        log('\n--- Attempting Withdrawals ---');
        if (withdrawableClaims.length === 0) {
            log('No withdrawable claims found.');
        } else {
            log(`Found ${withdrawableClaims.length} withdrawable claims:`);
            withdrawableClaims.forEach(claim => {
                log(`  - Claim ${claim.claimNum}: ${ethers.utils.formatEther(claim.amount)} wUSDT to ${claim.recipient}`);
            });
            
            for (const claim of withdrawableClaims) {
                try {
                    log(`\nAttempting to withdraw claim ${claim.claimNum}...`);
                    
                    // Check balances BEFORE withdrawal
                    const p3dBalanceBefore = await p3dPrecompile.balanceOf(signerAddress);
                    const wUsdtBalanceBefore = await wUsdtPrecompile.balanceOf(signerAddress);
                    
                    log(`  📊 Balances BEFORE withdrawal:`);
                    log(`    - P3D: ${ethers.utils.formatUnits(p3dBalanceBefore, 12)}`);
                    log(`    - wUSDT: ${ethers.utils.formatUnits(wUsdtBalanceBefore, 6)}`);
                    
                    // Perform withdrawal
                    const withdrawTx = await usdtImportWrapper.functions['withdraw(uint256)'](claim.claimNum);
                await withdrawTx.wait();
                    log(`  ✅ Withdraw for claim ${claim.claimNum} successful: ${withdrawTx.hash}`);
                    
                    // Check balances AFTER withdrawal
                    const p3dBalanceAfter = await p3dPrecompile.balanceOf(signerAddress);
                    const wUsdtBalanceAfter = await wUsdtPrecompile.balanceOf(signerAddress);
                    
                    log(`  📊 Balances AFTER withdrawal:`);
                    log(`    - P3D: ${ethers.utils.formatUnits(p3dBalanceAfter, 12)}`);
                    log(`    - wUSDT: ${ethers.utils.formatUnits(wUsdtBalanceAfter, 6)}`);
                    
                    // Calculate balance changes
                    const p3dChange = p3dBalanceAfter.sub(p3dBalanceBefore);
                    const wUsdtChange = wUsdtBalanceAfter.sub(wUsdtBalanceBefore);
                    
                    log(`  📈 Balance Changes:`);
                    log(`    - P3D change: ${p3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(p3dChange, 12)}`);
                    log(`    - wUSDT change: ${wUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(wUsdtChange, 6)}`);
                    
            } catch (err) {
                    log(`❌ Withdraw for claim ${claim.claimNum} failed: ${err.message}`);
                }
            }
        }
        
        log('\n=== Withdraw Test Complete ===');
        
    } catch (err) {
        log(`❌ Test failed: ${err.message}`);
        throw err;
    }
}

// Run the test
testWithdrawOnly(); 