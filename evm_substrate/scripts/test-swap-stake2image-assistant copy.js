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

async function testSwapStake2ImageFromAssistant() {
    log('=== Testing Swap Stake to Image (P3D → wUSDT) from ImportWrapperAssistant ===');
    
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
        
        log(`💰 Account2 Balances BEFORE Swap (Stake → Image):`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(initialP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(initialWUsdtBalance, 6)} wUSDT`);
        log(`   Account:       ${signerAddress}`);
        
        // Check if user has P3D to swap
        if (initialP3dBalance.eq(0)) {
            log(`❌ No P3D to swap! Account2 has 0 P3D.`);
            log(`   Please acquire P3D tokens first or run funding scripts.`);
            return;
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('⚙️ STEP 2: ASSISTANT CONFIGURATION & SWAP FEES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Get assistant configuration
        const bridgeAddress = await assistant.bridgeAddress();
        const tokenAddress = await assistant.tokenAddress();
        const precompileAddress = await assistant.precompileAddress();
        const managerAddress = await assistant.managerAddress();
        
        log(`🔧 Assistant Configuration:`);
        log(`   Bridge Address:     ${bridgeAddress}`);
        log(`   Token Address (P3D): ${tokenAddress}`);
        log(`   Precompile Address (wUSDT): ${precompileAddress}`);
        log(`   Manager Address:    ${managerAddress}`);
        
        // Get swap fee information
        try {
            const swapFee = await assistant.swap_fee10000();
            
            log(`💰 Swap Fee:`);
            log(`   Swap Fee: ${swapFee.toString()} basis points (${(swapFee.toNumber() / 100).toFixed(2)}%)`);
        } catch (err) {
            log(`⚠️ Could not fetch swap fee information: ${err.message}`);
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
            
            // Calculate available balance for swaps
            const availableP3d = assistantP3dBalance.sub(balanceInWork.stake);
            const availableWUsdt = assistantWUsdtBalance.sub(balanceInWork.image);
            
            log(`💰 Available for Swaps:`);
            log(`   Available P3D:  ${ethers.utils.formatUnits(availableP3d, 12)} P3D`);
            log(`   Available wUSDT: ${ethers.utils.formatUnits(availableWUsdt, 6)} wUSDT`);
            
            // Check if there's enough wUSDT for the swap
            if (availableWUsdt.lte(0)) {
                log(`❌ Insufficient available wUSDT in pool for swaps!`);
                log(`   Available wUSDT: ${ethers.utils.formatUnits(availableWUsdt, 6)} wUSDT`);
                log(`   The assistant needs wUSDT liquidity to perform P3D → wUSDT swaps`);
                return;
            }
        } catch (err) {
            log(`⚠️ Could not fetch balance in work: ${err.message}`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📋 STEP 4: CALCULATE SWAP PARAMETERS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Use a larger amount for testing to get meaningful output after fees
        const maxSwapAmount = ethers.utils.parseUnits('1', 12); // 1 P3D (increased from 0.001)
        const userSwapAmount = initialP3dBalance.div(1000); // 0.1% of user's balance (safer)
        const stakeAssetAmount = userSwapAmount.lt(maxSwapAmount) ? userSwapAmount : maxSwapAmount;
        
        // Set minimum amount out (much smaller to account for fees and AMM slippage)
        const minAmountOut = ethers.utils.parseUnits('0.0001', 6); // 0.0001 wUSDT minimum (reduced from 0.001)
        
        log(`📋 Swap Parameters:`);
        log(`   Input (P3D):       ${ethers.utils.formatUnits(stakeAssetAmount, 12)} P3D`);
        log(`   Min Output (wUSDT): ${ethers.utils.formatUnits(minAmountOut, 6)} wUSDT`);
        log(`   User P3D Balance:   ${ethers.utils.formatUnits(initialP3dBalance, 12)} P3D`);
        
        // Validate swap amount
        if (stakeAssetAmount.gt(initialP3dBalance)) {
            log(`❌ Swap amount exceeds user balance!`);
            return;
        }
        
        if (stakeAssetAmount.eq(0)) {
            log(`❌ Swap amount is zero!`);
            return;
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('✅ STEP 5: APPROVE ASSISTANT TO SPEND P3D');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check current P3D allowance
        const currentP3dAllowance = await p3dToken.allowance(signerAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        log(`📋 Current P3D allowance: ${ethers.utils.formatUnits(currentP3dAllowance, 12)} P3D`);
        
        // Approve P3D if needed
        if (currentP3dAllowance.lt(stakeAssetAmount)) {
            try {
                log(`🔄 Approving P3D for swap...`);
                const p3dApproveTx = await p3dToken.approve(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, stakeAssetAmount, {
                    gasLimit: 200000
                });
                await p3dApproveTx.wait();
                log(`✅ P3D approval successful: ${p3dApproveTx.hash}`);
                
                // Verify allowance
                const p3dAllowance = await p3dToken.allowance(signerAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
                log(`📋 P3D Allowance: ${ethers.utils.formatUnits(p3dAllowance, 12)} P3D`);
                
            } catch (err) {
                log(`❌ P3D approval failed: ${err.message}`);
                return;
            }
        } else {
            log(`✅ P3D already approved`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('🔄 STEP 6: EXECUTE SWAP STAKE → IMAGE');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        try {
            log(`🔄 Executing swapStake2Image with:`);
            log(`   - Input Amount (P3D):    ${ethers.utils.formatUnits(stakeAssetAmount, 12)} P3D`);
            log(`   - Min Amount Out (wUSDT): ${ethers.utils.formatUnits(minAmountOut, 6)} wUSDT`);
            
            const swapTx = await assistant.swapStake2Image(
                stakeAssetAmount,
                minAmountOut,
                { 
                    gasLimit: 9000000,
                    value: 0 // No ETH value needed, P3D transferred via transferFrom
                }
            );
            await swapTx.wait();
            log(`✅ Swap Stake2Image successful: ${swapTx.hash}`);
            
            // Parse transaction logs to find Transfer events
            const receipt = await signer.provider.getTransactionReceipt(swapTx.hash);
            log(`📋 Transaction Receipt Analysis:`);
            log(`   Block Number: ${receipt.blockNumber}`);
            log(`   Gas Used: ${receipt.gasUsed.toString()}`);
            log(`   Number of Logs: ${receipt.logs.length}`);
            
            let p3dSpent = ethers.BigNumber.from(0);
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
                        
                        if (logEntry.address === '0x0000000000000000000000000000000000000802') {
                            // P3D transfer - check if it's FROM the user
                            if (from.toLowerCase() === signerAddress.toLowerCase()) {
                                p3dSpent = p3dSpent.add(value);
                                log(`   💸 P3D SPENT:`);
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
            log(`❌ Swap Stake2Image failed: ${err.message}`);
            
            // Provide specific error guidance
            if (err.message.includes("negative net balance")) {
                log(`   ℹ️ Assistant has negative net balance - insufficient liquidity`);
            } else if (err.message.includes("negative risk-free net balance")) {
                log(`   ℹ️ Not enough risk-free wUSDT balance (assets locked in claims)`);
            } else if (err.message.includes("would be less than min")) {
                log(`   ℹ️ Swap output would be less than minimum specified`);
                log(`   💡 Try reducing min_amount_out or increasing input amount`);
            } else if (err.message.includes("P3D transferFrom failed")) {
                log(`   ℹ️ Failed to transfer P3D from user to assistant`);
                log(`   💡 Check P3D balance and approval`);
            } else if (err.message.includes("3DPass ERC20 transferFrom failed")) {
                log(`   ℹ️ Failed to transfer stake token from user to assistant`);
                log(`   💡 Check token balance and approval`);
            } else if (err.message.includes("unsupported token type")) {
                log(`   ℹ️ The stake token type is not supported`);
                log(`   💡 Only P3D and 3DPass ERC20 precompiles are supported`);
            }
            return;
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 7: CHECK FINAL BALANCES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check final balances
        const finalP3dBalance = await p3dToken.balanceOf(signerAddress);
        const finalWUsdtBalance = await wUsdtToken.balanceOf(signerAddress);
        
        log(`💰 Account2 Balances AFTER Swap:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(finalP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(finalWUsdtBalance, 6)} wUSDT`);
        
        // Calculate changes
        const p3dChange = finalP3dBalance.sub(initialP3dBalance);
        const wUsdtChange = finalWUsdtBalance.sub(initialWUsdtBalance);
        
        log(`📈 Balance Changes:`);
        log(`   P3D Change:   ${p3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(p3dChange, 12)} P3D`);
        log(`   wUSDT Change: ${wUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(wUsdtChange, 6)} wUSDT`);
        
        // Check assistant pool balances after swap
        const finalAssistantP3dBalance = await p3dToken.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        const finalAssistantWUsdtBalance = await wUsdtToken.balanceOf(BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        
        log(`🏦 Assistant Pool Balances After Swap:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(finalAssistantP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(finalAssistantWUsdtBalance, 6)} wUSDT`);
        
        // Pool changes
        const poolP3dChange = finalAssistantP3dBalance.sub(assistantP3dBalance);
        const poolWUsdtChange = finalAssistantWUsdtBalance.sub(assistantWUsdtBalance);
        
        log(`📉 Pool Balance Changes:`);
        log(`   P3D Change:   ${poolP3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(poolP3dChange, 12)} P3D`);
        log(`   wUSDT Change: ${poolWUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(poolWUsdtChange, 6)} wUSDT`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 8: SWAP ANALYSIS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Calculate swap efficiency
        const actualP3dSpent = p3dChange.abs();
        const actualWUsdtReceived = wUsdtChange;
        
        log(`📊 Swap Results:`);
        log(`   P3D Input:    ${ethers.utils.formatUnits(actualP3dSpent, 12)} P3D`);
        log(`   wUSDT Output: ${ethers.utils.formatUnits(actualWUsdtReceived, 6)} wUSDT`);
        
        // Calculate effective exchange rate
        if (actualP3dSpent.gt(0) && actualWUsdtReceived.gt(0)) {
            // Rate: how much wUSDT per P3D
            const exchangeRate = actualWUsdtReceived.mul(ethers.utils.parseUnits('1', 12)).div(actualP3dSpent);
            log(`   Exchange Rate: ${ethers.utils.formatUnits(exchangeRate, 6)} wUSDT per P3D`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📋 STEP 9: SUMMARY');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        log(`✅ Swap Stake2Image test completed successfully!`);
        log(`📊 Summary:`);
        log(`   - Swapped P3D → wUSDT through assistant pool`);
        log(`   - P3D spent: ${ethers.utils.formatUnits(actualP3dSpent, 12)} P3D`);
        log(`   - wUSDT received: ${ethers.utils.formatUnits(actualWUsdtReceived, 6)} wUSDT`);
        log(`   - Swap fee was deducted from output`);
        log(`   - Pool balances adjusted accordingly`);
        
        // Insights
        log(`💡 Swap Insights:`);
        log(`   - This swap increases P3D liquidity in the pool`);
        log(`   - This swap decreases wUSDT liquidity in the pool`);
        log(`   - Swap fees benefit the pool and share holders`);
        log(`   - AMM-style pricing based on pool ratios`);
        log(`   - Opposite direction of Image2Stake swap`);
        
    } catch (err) {
        log(`❌ Test failed: ${err.message}`);
        throw err;
    }
}

testSwapStake2ImageFromAssistant();
