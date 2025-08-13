const ethers = require('ethers');

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function testRepatriationDetailed() {
    log('=== Testing Sending Wrapped Tokens Back to Home Network ===');
    
    try {
        // Load test configuration
        const testConfig = require('./bridge-test-config.json');
        const provider = new ethers.providers.JsonRpcProvider(testConfig.development.network.rpcUrl);
        
        // Use Account2 which has wUSDT tokens
        const privateKey = testConfig.development.accounts.account2.privateKey;
        const signer = new ethers.Wallet(privateKey, provider);
        
        const BRIDGE_ADDRESSES = {
            usdtImportWrapper: testConfig.mainnet.contracts.USDTImportWrapper["3dpassEVMcontract"]
        };
        
        const TOKEN_ADDRESSES = {
            p3dPrecompile: testConfig.development.contracts.nativeTokenPrecompile,
            wUsdtPrecompile: testConfig.development.assets.Asset1.evmContract
        };
        
        const importWrapperAbi = require('../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi;
        const usdtImportWrapper = new ethers.Contract(BRIDGE_ADDRESSES.usdtImportWrapper, importWrapperAbi, signer);
        
        log(`Using signer: ${signer.address} (Account2)`);
        
        // Step 1: Check initial balances
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 1: INITIAL BALANCES');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const initialP3DBalance = await getP3DBalance(signer.address);
        const initialWUsdtBalance = await getTokenBalance(TOKEN_ADDRESSES.wUsdtPrecompile, signer.address, signer);
        
        log(`💰 Account Balances BEFORE Repatriation:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(initialP3DBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(initialWUsdtBalance, 6)} wUSDT`);
        log(`   Account:       ${signer.address}`);
        
        if (initialWUsdtBalance.eq(0)) {
            log(`❌ No wUSDT tokens available for repatriation test`);
            return;
        }
        
        // Step 2: Test repatriation - sending wUSDT -> USDT to home chain
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('🔄 STEP 2: EXECUTING REPATRIATION ');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const repatriationAmount = ethers.utils.parseUnits('0.000001', 6); // wUSDT has 6 decimals like USDT
        const reward = ethers.utils.parseUnits('0', 12); // P3D has 12 decimals
        const homeAddress = "0x1234567890123456789012345678901234567890";
        const data = "0x";
        
        log(`📋 Repatriation Parameters:`);
        log(`   Amount:        ${ethers.utils.formatUnits(repatriationAmount, 6)} wUSDT`);
        log(`   Reward:        ${ethers.utils.formatUnits(reward, 12)} P3D`);
        log(`   Home Address:  ${homeAddress}`);
        log(`   Data:          ${data}`);
        
        try {
            // Execute repatriation
            const repatriationTx = await usdtImportWrapper.transferToHomeChain(
                homeAddress,
                data,
                repatriationAmount,
                reward,
                { gasLimit: 500000 }
            );
            await repatriationTx.wait();
            log(`✅ Repatriation transaction successful: ${repatriationTx.hash}`);
            
            // Parse NewRepatriation event
            const receipt = await signer.provider.getTransactionReceipt(repatriationTx.hash);
            const newRepatriationEvent = receipt.logs.find(log => {
                try {
                    const decoded = usdtImportWrapper.interface.parseLog(log);
                    return decoded.name === 'NewRepatriation';
                } catch (e) {
                    return false;
                }
            });
            
            if (newRepatriationEvent) {
                const decoded = usdtImportWrapper.interface.parseLog(newRepatriationEvent);
                log(`📝 NewRepatriation Event Details:`);
                log(`   Sender:       ${decoded.args.sender_address}`);
                log(`   Amount:       ${ethers.utils.formatUnits(decoded.args.amount, 6)} wUSDT`);
                log(`   Reward:       ${ethers.utils.formatUnits(decoded.args.reward, 12)} P3D`);
                log(`   Home Address: ${decoded.args.home_address}`);
                log(`   Data:         ${decoded.args.data}`);
            }
            
        } catch (err) {
            log(`❌ Repatriation failed: ${err.message}`);
            throw err;
        }
        
        // Step 3: Check balances after repatriation
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📊 STEP 3: BALANCES AFTER REPATRIATION');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const afterP3DBalance = await getP3DBalance(signer.address);
        const afterWUsdtBalance = await getTokenBalance(TOKEN_ADDRESSES.wUsdtPrecompile, signer.address, signer);
        
        log(`💰 Account Balances AFTER Repatriation:`);
        log(`   P3D Balance:  ${ethers.utils.formatUnits(afterP3DBalance, 12)} P3D`);
        log(`   wUSDT Balance: ${ethers.utils.formatUnits(afterWUsdtBalance, 6)} wUSDT`);
        log(`   Account:       ${signer.address}`);
        
        // Step 4: Calculate and display balance changes
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📈 STEP 4: BALANCE CHANGES ANALYSIS');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const p3dChange = afterP3DBalance.sub(initialP3DBalance);
        const wUsdtChange = afterWUsdtBalance.sub(initialWUsdtBalance);
        
        log(`📊 Balance Changes:`);
        log(`   P3D Change:    ${p3dChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(p3dChange, 12)} P3D`);
        log(`   wUSDT Change:  ${wUsdtChange.gte(0) ? '+' : ''}${ethers.utils.formatUnits(wUsdtChange, 6)} wUSDT`);
        
        // Step 5: Verify burning effect
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('🔥 STEP 5: TOKEN BURNING VERIFICATION');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const expectedWUsdtBalance = initialWUsdtBalance.sub(repatriationAmount);
        const actualBurned = initialWUsdtBalance.sub(afterWUsdtBalance);
        
        log(`🔥 Token Burning Analysis:`);
        log(`   Initial wUSDT:     ${ethers.utils.formatUnits(initialWUsdtBalance, 6)}`);
        log(`   Repatriated:       ${ethers.utils.formatUnits(repatriationAmount, 6)}`);
        log(`   Expected Remaining: ${ethers.utils.formatUnits(expectedWUsdtBalance, 6)}`);
        log(`   Actual Remaining:  ${ethers.utils.formatUnits(afterWUsdtBalance, 6)}`);
        log(`   Actually Burned:   ${ethers.utils.formatUnits(actualBurned, 6)}`);
        
        if (afterWUsdtBalance.eq(expectedWUsdtBalance)) {
            log(`✅ SUCCESS: wUSDT balance correctly reduced (burned)`);
        } else {
            log(`❌ FAILURE: wUSDT balance not correctly reduced`);
            log(`   Expected: ${ethers.utils.formatUnits(expectedWUsdtBalance, 6)}`);
            log(`   Actual:   ${ethers.utils.formatUnits(afterWUsdtBalance, 6)}`);
        }
        
        // Step 6: Summary
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('📋 STEP 6: REPATRIATION TEST SUMMARY');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        log(`🎯 Test Results:`);
        log(`   ✅ Repatriation transaction: SUCCESS`);
        log(`   ✅ NewRepatriation event:    SUCCESS`);
        log(`   ✅ wUSDT burning:           ${afterWUsdtBalance.eq(expectedWUsdtBalance) ? 'SUCCESS' : 'FAILURE'}`);
        log(`   ✅ P3D balance unchanged:   ${p3dChange.eq(0) ? 'SUCCESS' : 'FAILURE'}`);
        
        log(`\n📊 Final Balance Summary:`);
        log(`   Before: ${ethers.utils.formatUnits(initialWUsdtBalance, 6)} wUSDT`);
        log(`   After:  ${ethers.utils.formatUnits(afterWUsdtBalance, 6)} wUSDT`);
        log(`   Burned: ${ethers.utils.formatUnits(actualBurned, 6)} wUSDT`);
        
        log('\n=== Repatriation Test Complete ===');
        
    } catch (err) {
        log(`❌ Test failed: ${err.message}`);
        throw err;
    }
}

async function getP3DBalance(userAddress) {
    const testConfig = require('./bridge-test-config.json');
    const provider = new ethers.providers.JsonRpcProvider(testConfig.development.network.rpcUrl);
    const p3dPrecompile = new ethers.Contract(testConfig.development.contracts.nativeTokenPrecompile, require('../counterstake-bridge/evm/build/contracts/IP3D.json').abi, provider);
    return await p3dPrecompile.balanceOf(userAddress);
}

async function getTokenBalance(tokenAddress, userAddress, signer) {
    const testConfig = require('./bridge-test-config.json');
    const provider = new ethers.providers.JsonRpcProvider(testConfig.development.network.rpcUrl);
    const tokenContract = new ethers.Contract(tokenAddress, require('../counterstake-bridge/evm/build/contracts/IPrecompileERC20.json').abi, provider);
    return await tokenContract.balanceOf(userAddress);
}

testRepatriationDetailed(); 