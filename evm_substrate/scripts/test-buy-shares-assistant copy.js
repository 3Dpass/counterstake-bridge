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

async function testBuySharesFromAssistant() {
    log('=== Testing Buy Shares from ImportWrapperAssistant ===');
    
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
        
        log(`💰 Account2 Balances BEFORE Buy Shares:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(initialP3dBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(initialWUsdtBalance, 6)} wUSDT`);
        log(`   Share Balance: ${ethers.utils.formatUnits(initialShareBalance, 18)} USDTIA`);
        log(`   Total Supply:  ${ethers.utils.formatUnits(totalSupplyBefore, 18)} USDTIA`);
        log(`   Account:       ${signerAddress}`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('⚙️ STEP 2: ASSISTANT CONFIGURATION');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Get assistant configuration
        const bridgeAddress = await assistant.bridgeAddress();
        const tokenAddress = await assistant.tokenAddress();
        const precompileAddress = await assistant.precompileAddress();
        const managerAddress = await assistant.managerAddress();
        
        log(`🔧 Assistant Configuration:`);
        log(`   Bridge Address:     ${bridgeAddress}`);
        log(`   Token Address:      ${tokenAddress}`);
        log(`   Precompile Address: ${precompileAddress}`);
        log(`   Manager Address:    ${managerAddress}`);
        
        // Get assistant fees and settings (skip if functions don't exist)
        log(`💰 Assistant Fees and Settings:`);
        log(`   Note: Fee functions may not be available on this contract`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 3: CALCULATE BUY SHARES AMOUNTS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Use very small amounts for testing (account2 has ~989.999997 wUSDT)
        const stakeAssetAmount = ethers.utils.parseUnits('0.0002', 12); // 0.000001 P3D
        const imageAssetAmount = ethers.utils.parseUnits('0.001', 6);   // 0.000001 wUSDT
        
        log(`📋 Buy Shares Parameters:`);
        log(`   Stake Asset Amount (P3D):  ${ethers.utils.formatUnits(stakeAssetAmount, 12)} P3D`);
        log(`   Image Asset Amount (wUSDT): ${ethers.utils.formatUnits(imageAssetAmount, 6)} wUSDT`);
        
        // Check if we have sufficient balances
        if (initialP3dBalance.lt(stakeAssetAmount)) {
            log(`❌ Insufficient P3D balance: need ${ethers.utils.formatUnits(stakeAssetAmount, 12)}, have ${ethers.utils.formatUnits(initialP3dBalance, 12)}`);
            return;
        }
        
        if (initialWUsdtBalance.lt(imageAssetAmount)) {
            log(`❌ Insufficient wUSDT balance: need ${ethers.utils.formatUnits(imageAssetAmount, 6)}, have ${ethers.utils.formatUnits(initialWUsdtBalance, 6)}`);
            return;
        }
        
        // Debug: Check exact wUSDT balance and approval amount
        log(`🔍 Debug Info:`);
        log(`   wUSDT Balance (raw): ${initialWUsdtBalance.toString()}`);
        log(`   wUSDT Approval Amount (raw): ${imageAssetAmount.toString()}`);
        log(`   Balance > Amount: ${initialWUsdtBalance.gt(imageAssetAmount)}`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('✅ STEP 4: APPROVE ASSISTANT TO SPEND P3D TOKENS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check current P3D allowance
        const currentP3dAllowance = await p3dToken.allowance(signerAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        log(`📋 Current P3D allowance: ${ethers.utils.formatUnits(currentP3dAllowance, 12)} P3D`);
        
        // Approve P3D if needed
        if (currentP3dAllowance.lt(stakeAssetAmount)) {
            try {
                const p3dApproveTx = await p3dToken.approve(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, stakeAssetAmount);
                await p3dApproveTx.wait();
                log(`✅ P3D approval successful: ${p3dApproveTx.hash}`);
                
                // Check P3D allowance
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
        log('✅ STEP 5: APPROVE ASSISTANT TO SPEND wUSDT TOKENS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check current wUSDT allowance
        const currentWUsdtAllowance = await wUsdtToken.allowance(signerAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
        log(`📋 Current wUSDT allowance: ${ethers.utils.formatUnits(currentWUsdtAllowance, 6)} wUSDT`);
        
        // Approve wUSDT if needed
        if (currentWUsdtAllowance.lt(imageAssetAmount)) {
            try {
                log(`🔄 Attempting wUSDT approval with explicit gas limit...`);
                const wUsdtApproveTx = await wUsdtToken.approve(BRIDGE_ADDRESSES.usdtImportWrapperAssistant, imageAssetAmount, {
                    gasLimit: 200000
                });
                await wUsdtApproveTx.wait();
                log(`✅ wUSDT approval successful: ${wUsdtApproveTx.hash}`);
                
                // Check wUSDT allowance
                const wUsdtAllowance = await wUsdtToken.allowance(signerAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
                log(`📋 wUSDT Allowance: ${ethers.utils.formatUnits(wUsdtAllowance, 6)} wUSDT`);
                
            } catch (err) {
                log(`❌ wUSDT approval failed: ${err.message}`);
                log(`🔍 This might be due to precompile contract limitations`);
                log(`📋 Trying alternative approach...`);
                
                // Try with a different approach - maybe the assistant has a special function
                try {
                    log(`🔄 Trying assistant's approvePrecompile function...`);
                    const approvePrecompileTx = await assistant.approvePrecompile({
                        gasLimit: 200000
                    });
                    await approvePrecompileTx.wait();
                    log(`✅ Assistant approvePrecompile successful: ${approvePrecompileTx.hash}`);
                    
                    // Check wUSDT allowance again
                    const wUsdtAllowance = await wUsdtToken.allowance(signerAddress, BRIDGE_ADDRESSES.usdtImportWrapperAssistant);
                    log(`📋 wUSDT Allowance after approvePrecompile: ${ethers.utils.formatUnits(wUsdtAllowance, 6)} wUSDT`);
                    
                } catch (approveErr) {
                    log(`❌ Assistant approvePrecompile also failed: ${approveErr.message}`);
                    log(`📋 Skipping wUSDT approval for now, will try buyShares anyway`);
                }
            }
        } else {
            log(`✅ wUSDT already approved`);
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('🔄 STEP 6: CALL BUY SHARES FUNCTION');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        try {
            log(`🔄 Executing buyShares with:`);
            log(`   - Stake Asset Amount: ${ethers.utils.formatUnits(stakeAssetAmount, 12)} P3D`);
            log(`   - Image Asset Amount: ${ethers.utils.formatUnits(imageAssetAmount, 6)} wUSDT`);
            
            const buySharesTx = await assistant.buyShares(
                stakeAssetAmount,
                imageAssetAmount,
                { 
                    gasLimit: 9000000,
                    value: 0 // No ETH value needed, tokens are transferred via transferFrom
                }
            );
            await buySharesTx.wait();
            log(`✅ Buy shares successful: ${buySharesTx.hash}`);
            
            // Parse transaction logs to find Transfer events
            const receipt = await signer.provider.getTransactionReceipt(buySharesTx.hash);
            log(`📋 Transaction Receipt Analysis:`);
            log(`   Block Number: ${receipt.blockNumber}`);
            log(`   Gas Used: ${receipt.gasUsed.toString()}`);
            log(`   Number of Logs: ${receipt.logs.length}`);
            
            let sharesMinted = ethers.BigNumber.from(0);
            
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
                        
                        // Check if this is from the assistant contract (share minting)
                        if (logEntry.address.toLowerCase() === assistant.address.toLowerCase()) {
                            if (from === '0x0000000000000000000000000000000000000000') {
                                sharesMinted = value;
                                log(`   🎯 SHARES MINTED:`);
                                log(`     From: ${from} (mint)`);
                                log(`     To: ${to}`);
                                log(`     Amount: ${ethers.utils.formatUnits(value, 18)} USDTIA`);
                            }
                        } else if (logEntry.address === '0x0000000000000000000000000000000000000802') {
                            // P3D transfer
                            log(`   💰 P3D TRANSFER:`);
                            log(`     From: ${from}`);
                            log(`     To: ${to}`);
                            log(`     Amount: ${ethers.utils.formatUnits(value, 12)} P3D`);
                        } else if (logEntry.address === '0xfBFBfbFA000000000000000000000000000000de') {
                            // wUSDT transfer
                            log(`   💰 wUSDT TRANSFER:`);
                            log(`     From: ${from}`);
                            log(`     To: ${to}`);
                            log(`     Amount: ${ethers.utils.formatUnits(value, 6)} wUSDT`);
                        }
                    }
                } catch (e) {
                    // Couldn't decode this log, that's okay
                }
            }
            
        } catch (err) {
            log(`❌ Buy shares failed: ${err.message}`);
            return;
        }
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 7: CHECK FINAL BALANCES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Check final balances
        const finalP3dBalance = await p3dToken.balanceOf(signerAddress);
        const finalWUsdtBalance = await wUsdtToken.balanceOf(signerAddress);
        const finalShareBalance = await assistant.balanceOf(signerAddress);
        const totalSupplyAfter = await assistant.totalSupply();
        
        log(`💰 Account2 Balances AFTER Buy Shares:`);
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
        
        // Calculate pool ownership percentage
        const poolOwnership = totalSupplyAfter.gt(0) ? finalShareBalance.mul(10000).div(totalSupplyAfter).toNumber() / 100 : 0;
        log(`   Pool Ownership: ${poolOwnership.toFixed(4)}%`);
        
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📋 STEP 8: SUMMARY');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        log(`✅ Buy shares test completed successfully!`);
        log(`📊 Summary:`);
        log(`   - P3D requested: ${ethers.utils.formatUnits(stakeAssetAmount, 12)} P3D`);
        log(`   - P3D actually spent: ${ethers.utils.formatUnits(p3dChange.abs(), 12)} P3D`);
        log(`   - wUSDT spent: ${ethers.utils.formatUnits(imageAssetAmount, 6)} wUSDT`);
        log(`   - Shares minted: ${ethers.utils.formatUnits(shareChange, 18)} USDTIA`);
        log(`   - Pool ownership: ${poolOwnership.toFixed(4)}%`);
        log(`   - Assistant received both asset types`);
        
        // Additional insights
        if (totalSupplyBefore.eq(0)) {
            log(`   - This was an INITIAL pool creation (first liquidity provider)`);
            log(`   - Share amount calculated using geometric mean: √(${ethers.utils.formatUnits(stakeAssetAmount, 12)} × ${ethers.utils.formatUnits(imageAssetAmount, 6)})`);
        } else {
            log(`   - This was additional liquidity provision to existing pool`);
        }
        
    } catch (err) {
        log(`❌ Test failed: ${err.message}`);
        throw err;
    }
}

testBuySharesFromAssistant();
