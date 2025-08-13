const { ethers } = require('ethers');

// Load configuration
const config = require('./bridge-test-config.json');

// Function to get bridge addresses from config
function getBridgeAddresses() {
    const mainnetContracts = config.mainnet.contracts;
    
    if (!mainnetContracts.usdtImportWrapperAssistant?.["3dpassEVMcontract"]) {
        throw new Error('usdtImportWrapperAssistant address not found in config');
    }
    
    return {
        usdtImportWrapperAssistant: mainnetContracts.usdtImportWrapperAssistant["3dpassEVMcontract"]
    };
}

// Function to get token addresses from config
function getTokenAddresses() {
    const developmentAssets = config.development.assets;
    
    return {
        p3dPrecompile: config.development.contracts.nativeTokenPrecompile,
        wUsdtPrecompile: developmentAssets.Asset1.evmContract
    };
}

// Configuration
const RPC_URL = config.development.network.rpcUrl;
const BRIDGE_ADDRESSES = getBridgeAddresses();
const TOKEN_ADDRESSES = getTokenAddresses();

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function testRedeemSharesFromAssistant() {
    log('=== Testing Redeem Shares from ImportWrapperAssistant ===');
    
    try {
        // Setup provider and signer (Account2)
        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const privateKey = config.development.accounts.account2.privateKey;
        const signer = new ethers.Wallet(privateKey, provider);
        const signerAddress = await signer.getAddress();
        
        log(`Using signer: ${signerAddress} (Account2)`);
        
        // Get token contracts
        const p3dToken = new ethers.Contract(TOKEN_ADDRESSES.p3dPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, signer);
        const wUsdtToken = new ethers.Contract(TOKEN_ADDRESSES.wUsdtPrecompile, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, signer);
        const assistant = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, require('../counterstake-bridge/evm/build/contracts/ImportWrapperAssistant.json').abi, signer);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 1: INITIAL BALANCES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check initial balances
        const initialP3dBalance = await p3dToken.balanceOf(signerAddress);
        const initialWUsdtBalance = await wUsdtToken.balanceOf(signerAddress);
        
        // Check initial share balance
        const initialShareBalance = await assistant.balanceOf(signerAddress);
        const totalSupplyBefore = await assistant.totalSupply();
        
        log(`💰 Account2 Balances BEFORE Redeem Shares:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(initialP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(initialWUsdtBalance, 6)} wUSDT`);
        log(`   Share Balance: ${ethers.utils.formatUnits(initialShareBalance, 18)} USDTIA`);
        log(`   Total Supply:  ${ethers.utils.formatUnits(totalSupplyBefore, 18)} USDTIA`);
        log(`   Account:       ${signerAddress}`);
        
        // Check if user has any shares to redeem
        if (initialShareBalance.eq(0)) {
            log(`❌ No shares to redeem! Account2 has 0 USDTIA shares.`);
            log(`   Please run test-buy-shares-assistant.js first to acquire shares.`);
            return;
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('⚙️ STEP 2: ASSISTANT CONFIGURATION & FEES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Get assistant configuration
        const bridgeAddress = await assistant.bridgeAddress();
        const tokenAddress = await assistant.tokenAddress();
        const precompileAddress = await assistant.precompileAddress();
        const managerAddress = await assistant.managerAddress();
        const exponent = await assistant.exponent();
        
        log(`🔧 Assistant Configuration:`);
        log(`   Bridge Address:     ${bridgeAddress}`);
        log(`   Token Address:      ${tokenAddress}`);
        log(`   Precompile Address: ${precompileAddress}`);
        log(`   Manager Address:    ${managerAddress}`);
        log(`   Exponent:           ${exponent.toString()}`);
        
        // Get fee information
        try {
            const swapFee = await assistant.swap_fee10000();
            const exitFee = await assistant.exit_fee10000();
            
            log(`💰 Redemption Fees:`);
            log(`   Swap Fee:  ${swapFee.toString()} basis points (${(swapFee.toNumber() / 100).toFixed(2)}%)`);
            log(`   Exit Fee:  ${exitFee.toString()} basis points (${(exitFee.toNumber() / 100).toFixed(2)}%)`);
            log(`   Total Fee: ${swapFee.add(exitFee).toString()} basis points (${((swapFee.add(exitFee)).toNumber() / 100).toFixed(2)}%)`);
        } catch (err) {
            log(`⚠️ Could not fetch fee information: ${err.message}`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 3: ASSISTANT POOL STATE');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check assistant's token balances
        const assistantP3dBalance = await p3dToken.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        const assistantWUsdtBalance = await wUsdtToken.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        
        log(`🏦 Assistant Pool Balances:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(assistantP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(assistantWUsdtBalance, 6)} wUSDT`);
        
        // Try to get balance in work information
        try {
            const balanceInWork = await assistant.balance_in_work();
            log(`🔒 Balance In Work (locked in claims):`);
            log(`   P3D in Work:  ${ethers.utils.formatUnits(balanceInWork.stake, 12)} P3D`);
            log(`   wUSDT in Work: ${ethers.utils.formatUnits(balanceInWork.image, 6)} wUSDT`);
            
            // Calculate available balance for redemption
            const availableP3d = assistantP3dBalance.sub(balanceInWork.stake);
            const availableWUsdt = assistantWUsdtBalance.sub(balanceInWork.image);
            
            log(`💰 Available for Redemption:`);
            log(`   Available P3D:  ${ethers.utils.formatUnits(availableP3d, 12)} P3D`);
            log(`   Available wUSDT: ${ethers.utils.formatUnits(availableWUsdt, 6)} wUSDT`);
        } catch (err) {
            log(`⚠️ Could not fetch balance in work: ${err.message}`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📋 STEP 4: CALCULATE REDEMPTION AMOUNT');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Calculate redemption amount (redeem 50% of shares for testing)
        const redeemPercentage = 50; // 50%
        const sharesToRedeem = initialShareBalance.mul(redeemPercentage).div(100);
        
        // Ensure we don't redeem more than we have
        const actualSharesToRedeem = sharesToRedeem.gt(initialShareBalance) ? initialShareBalance : sharesToRedeem;
        
        log(`📋 Redemption Parameters:`);
        log(`   Current Share Balance: ${ethers.utils.formatUnits(initialShareBalance, 18)} USDTIA`);
        log(`   Redemption Percentage: ${redeemPercentage}%`);
        log(`   Shares to Redeem:      ${ethers.utils.formatUnits(actualSharesToRedeem, 18)} USDTIA`);
        log(`   Remaining Shares:      ${ethers.utils.formatUnits(initialShareBalance.sub(actualSharesToRedeem), 18)} USDTIA`);
        
        // Calculate pool ownership percentage before redemption
        const poolOwnershipBefore = totalSupplyBefore.gt(0) ? initialShareBalance.mul(10000).div(totalSupplyBefore).toNumber() / 100 : 0;
        const poolOwnershipAfter = totalSupplyBefore.gt(0) ? initialShareBalance.sub(actualSharesToRedeem).mul(10000).div(totalSupplyBefore.sub(actualSharesToRedeem)).toNumber() / 100 : 0;
        
        log(`📊 Pool Ownership:`);
        log(`   Before Redemption: ${poolOwnershipBefore.toFixed(4)}%`);
        log(`   After Redemption:  ${poolOwnershipAfter.toFixed(4)}%`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('🔄 STEP 5: CALL REDEEM SHARES FUNCTION');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        try {
            log(`🔄 Executing redeemShares with:`);
            log(`   - Shares Amount: ${ethers.utils.formatUnits(actualSharesToRedeem, 18)} USDTIA`);
            
            const redeemSharesTx = await assistant.redeemShares(
                actualSharesToRedeem,
                { 
                    gasLimit: 9000000,
                    value: 0 // No ETH value needed
                }
            );
            await redeemSharesTx.wait();
            log(`✅ Redeem shares successful: ${redeemSharesTx.hash}`);
            
            // Parse transaction logs to find Transfer events
            const receipt = await signer.provider.getTransactionReceipt(redeemSharesTx.hash);
            log(`📋 Transaction Receipt Analysis:`);
            log(`   Block Number: ${receipt.blockNumber}`);
            log(`   Gas Used: ${receipt.gasUsed.toString()}`);
            log(`   Number of Logs: ${receipt.logs.length}`);
            
            let sharesBurned = ethers.BigNumber.from(0);
            let p3dReceived = ethers.BigNumber.from(0);
            let wUsdtReceived = ethers.BigNumber.from(0);
            
            // Parse all logs to find relevant transfers
            for (let i = 0; i < receipt.logs.length; i++) {
                const logEntry = receipt.logs[i];
                
                try {
                    // Try to decode as ERC20 Transfer event
                    const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
                    if (logEntry.topics[0] === transferTopic) {
                        const from = ethers.utils.getAddress('0x' + logEntry.topics[1].slice(26));
                        const to = ethers.utils.getAddress('0x' + logEntry.topics[2].slice(26));
                        const value = ethers.BigNumber.from(logEntry.data);
                        
                        // Check if this is from the assistant contract (share burning)
                        if (logEntry.address.toLowerCase() === assistant.address.toLowerCase()) {
                            if (to === '0x0000000000000000000000000000000000000000') {
                                sharesBurned = value;
                                log(`   🔥 SHARES BURNED:`);
                                log(`     From: ${from}`);
                                log(`     To: ${to} (burn)`);
                                log(`     Amount: ${ethers.utils.formatUnits(value, 18)} USDTIA`);
                            }
                        } else if (logEntry.address === '0x0000000000000000000000000000000000000802') {
                            // P3D transfer - check if it's TO the user
                            if (to.toLowerCase() === signerAddress.toLowerCase()) {
                                p3dReceived = p3dReceived.add(value);
                                log(`   💰 P3D RECEIVED:`);
                                log(`     From: ${from}`);
                                log(`     To: ${to}`);
                                log(`     Amount: ${ethers.utils.formatUnits(value, 12)} P3D`);
                            }
                        } else if (logEntry.address === '0xfBFBfbFA000000000000000000000000000000de') {
                            // wUSDT transfer - check if it's TO the user
                            if (to.toLowerCase() === signerAddress.toLowerCase()) {
                                wUsdtReceived = wUsdtReceived.add(value);
                                log(`   💰 wUSDT RECEIVED:`);
                                log(`     From: ${from}`);
                                log(`     To: ${to}`);
                                log(`     Amount: ${ethers.utils.formatUnits(value, 6)} wUSDT`);
                            }
                        }
                    }
                } catch (e) {
                    // Couldn't decode this log, that's okay
                }
            }
            
        } catch (err) {
            log(`❌ Redeem shares failed: ${err.message}`);
            
            // Provide specific error guidance
            if (err.message.includes("negative net balance")) {
                log(`   ℹ️ Assistant has negative net balance - not enough assets in pool`);
            } else if (err.message.includes("net balance too small")) {
                log(`   ℹ️ Net balance too small after accounting for unavailable profit`);
            } else if (err.message.includes("negative risk-free net balance")) {
                log(`   ℹ️ Not enough risk-free balance (assets locked in active claims)`);
            } else if (err.message.includes("ERC20: burn amount exceeds balance")) {
                log(`   ℹ️ Trying to redeem more shares than owned`);
            }
            return;
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 6: CHECK FINAL BALANCES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check final balances
        const finalP3dBalance = await p3dToken.balanceOf(signerAddress);
        const finalWUsdtBalance = await wUsdtToken.balanceOf(signerAddress);
        const finalShareBalance = await assistant.balanceOf(signerAddress);
        const totalSupplyAfter = await assistant.totalSupply();
        
        log(`💰 Account2 Balances AFTER Redeem Shares:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(finalP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(finalWUsdtBalance, 6)} wUSDT`);
        log(`   Share Balance: ${ethers.utils.formatUnits(finalShareBalance, 18)} USDTIA`);
        log(`   Total Supply:  ${ethers.utils.formatUnits(totalSupplyAfter, 18)} USDTIA`);
        
        // Calculate changes
        const p3dChange = finalP3dBalance.sub(initialP3dBalance);
        const wUsdtChange = finalWUsdtBalance.sub(initialWUsdtBalance);
        const shareChange = finalShareBalance.sub(initialShareBalance);
        const supplyChange = totalSupplyAfter.sub(totalSupplyBefore);
        
        log(`📈 Balance Changes:`);
        log(`   P3D Change:   ${p3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(p3dChange, 12)} P3D`);
        log(`   wUSDT Change: ${wUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(wUsdtChange, 6)} wUSDT`);
        log(`   Share Change: ${shareChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(shareChange, 18)} USDTIA`);
        log(`   Supply Change: ${supplyChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(supplyChange, 18)} USDTIA`);
        
        // Calculate final pool ownership percentage
        const finalPoolOwnership = totalSupplyAfter.gt(0) ? finalShareBalance.mul(10000).div(totalSupplyAfter).toNumber() / 100 : 0;
        log(`   Pool Ownership: ${finalPoolOwnership.toFixed(4)}%`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 7: REDEMPTION ANALYSIS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Calculate redemption efficiency (how much was actually received vs proportional share)
        const sharesBurnedActual = shareChange.abs();
        const sharePercentageRedeemed = totalSupplyBefore.gt(0) ? sharesBurnedActual.mul(10000).div(totalSupplyBefore).toNumber() / 100 : 0;
        
        log(`📊 Redemption Analysis:`);
        log(`   Shares Redeemed: ${ethers.utils.formatUnits(sharesBurnedActual, 18)} USDTIA (${sharePercentageRedeemed.toFixed(4)}% of total supply)`);
        log(`   P3D Received:    ${ethers.utils.formatUnits(p3dChange, 12)} P3D`);
        log(`   wUSDT Received:  ${ethers.utils.formatUnits(wUsdtChange, 6)} wUSDT`);
        
        // Calculate what the proportional share would be without fees
        try {
            const assistantP3dBalanceAfter = await p3dToken.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
            const assistantWUsdtBalanceAfter = await wUsdtToken.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
            
            log(`🏦 Assistant Pool Balances After Redemption:`);
            log(`   P3D Balance:  ${ethers.utils.formatUnits(assistantP3dBalanceAfter, 12)} P3D`);
            log(`   wUSDT Balance: ${ethers.utils.formatUnits(assistantWUsdtBalanceAfter, 6)} wUSDT`);
            
            // Pool changes
            const poolP3dChange = assistantP3dBalanceAfter.sub(assistantP3dBalance);
            const poolWUsdtChange = assistantWUsdtBalanceAfter.sub(assistantWUsdtBalance);
            
            log(`📉 Pool Balance Changes:`);
            log(`   P3D Change:   ${poolP3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(poolP3dChange, 12)} P3D`);
            log(`   wUSDT Change: ${poolWUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(poolWUsdtChange, 6)} wUSDT`);
        } catch (err) {
            log(`⚠️ Could not fetch final assistant balances: ${err.message}`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📋 STEP 8: SUMMARY');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        log(`✅ Redeem shares test completed successfully!`);
        log(`📊 Summary:`);
        log(`   - Shares redeemed: ${ethers.utils.formatUnits(actualSharesToRedeem, 18)} USDTIA`);
        log(`   - Shares burned: ${ethers.utils.formatUnits(shareChange.abs(), 18)} USDTIA`);
        log(`   - P3D received: ${ethers.utils.formatUnits(p3dChange, 12)} P3D`);
        log(`   - wUSDT received: ${ethers.utils.formatUnits(wUsdtChange, 6)} wUSDT`);
        log(`   - Final pool ownership: ${finalPoolOwnership.toFixed(4)}%`);
        log(`   - Redemption included swap + exit fees`);
        
        // Fee impact analysis
        if (sharePercentageRedeemed > 0) {
            log(`💡 Fee Impact Analysis:`);
            log(`   - Redeemed ${sharePercentageRedeemed.toFixed(4)}% of pool shares`);
            log(`   - Fees reduce the amount received (swap fee + exit fee)`);
            log(`   - This prevents arbitrage opportunities through buy-redeem cycles`);
        }
        
    } catch (err) {
        log(`❌ Test failed: ${err.message}`);
        throw err;
    }
}

testRedeemSharesFromAssistant();
