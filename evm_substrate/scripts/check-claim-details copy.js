const { ethers } = require('ethers');

// Load configuration
const config = require('./bridge-test-config.json');

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

async function checkClaimDetails() {
    log('=== Checking Claim Details ===');
    
    try {
        // Setup provider
        const RPC_URL = config.development.network.rpcUrl;
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        
        // Get current block and timestamp
        const currentBlock = await provider.getBlock('latest');
        const currentTimestamp = currentBlock.timestamp;
        log(`Current block: ${currentBlock.number}`);
        log(`Current timestamp: ${currentTimestamp} (${new Date(currentTimestamp * 1000).toISOString()})`);
        
        // Get bridge addresses
        const BRIDGE_ADDRESSES = getBridgeAddresses();
        log(`USDT Import Wrapper: ${BRIDGE_ADDRESSES.usdtImportWrapper}`);
        
        // Load contract ABI - use Counterstake ABI instead of ImportWrapper
        const counterstakeAbi = require('../counterstake-bridge/evm/build/contracts/Counterstake.json').abi;
        
        // Create contract instance (read-only)
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, counterstakeAbi, provider);
        
        // Get settings
        log('\n--- Settings ---');
        try {
            const settings = await usdtImportWrapper.settings();
            log(`Settings: ${JSON.stringify(settings)}`);
            
            // Parse challenging periods from settings
            if (settings && settings.length >= 5) {
                const challengingPeriods = settings[4]; // This should be the challenging_periods array
                log(`Challenging periods: ${challengingPeriods}`);
            }
        } catch (err) {
            log(`❌ Settings failed: ${err.message}`);
        }
        
        // Get last claim number
        log('\n--- Claim Information ---');
        try {
            const lastClaimNum = await usdtImportWrapper.last_claim_num();
            log(`Last claim number: ${lastClaimNum.toString()}`);
            
            // Check ongoing claims
            const ongoingClaimNums = await usdtImportWrapper.getOngoingClaimNums();
            log(`Ongoing claim numbers: ${ongoingClaimNums.map(n => n.toString()).join(', ')}`);
            
        } catch (err) {
            log(`❌ Claim info failed: ${err.message}`);
        }
        
        // Check individual claims using the correct function
        log('\n--- Checking Last 20 Claims ---');
        for (let claimNum = 1; claimNum <= 20; claimNum++) {
            try {
                // First check if the claim exists by checking stakes
                let claimExists = false;
                let accountYesStake = ethers.BigNumber.from(0);
                let accountNoStake = ethers.BigNumber.from(0);
                
                try {
                    // Check stakes for a specific account (account2)
                    const testAccount = "0x3bC6F415BbE667E0Fdaca81b7A78E8AE6469E688";
                    accountYesStake = await usdtImportWrapper.stakes(claimNum, 0, testAccount); // 0 = YES
                    accountNoStake = await usdtImportWrapper.stakes(claimNum, 1, testAccount);   // 1 = NO
                    
                    if (accountYesStake.gt(0) || accountNoStake.gt(0)) {
                        claimExists = true;
                        log(`\nClaim ${claimNum}:`);
                        log(`  - ✅ Claim ${claimNum} EXISTS`);
                        log(`  - Account ${testAccount} stakes:`);
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
                        const encodedData = usdtImportWrapper.interface.encodeFunctionData('getClaim(uint256)', [claimNum]);
                        const result = await provider.call({
                            to: BRIDGE_ADDRESSES.usdtImportWrapper,
                            data: encodedData
                        });
                        
                        // Decode the result
                        const decodedResult = usdtImportWrapper.interface.decodeFunctionResult('getClaim(uint256)', result);
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
        
        // Check challenging periods
        log('\n--- Challenging Periods ---');
        try {
            const period0 = await usdtImportWrapper.getChallengingPeriod(0, false);
            log(`Period 0 (small): ${period0.toString()} seconds (${period0 / 60} minutes)`);
            
            const period0Large = await usdtImportWrapper.getChallengingPeriod(0, true);
            log(`Period 0 (large): ${period0Large.toString()} seconds (${period0Large / 60} minutes)`);
            
        } catch (err) {
            log(`❌ Challenging periods failed: ${err.message}`);
        }
        
        log('\n=== Claim Details Check Complete ===');
        
    } catch (err) {
        log(`❌ Check failed: ${err.message}`);
        throw err;
    }
}

// Run the check
checkClaimDetails(); 