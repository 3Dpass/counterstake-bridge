const { ethers } = require('ethers');
const fs = require('fs');
const desktopApp = require('ocore/desktop_app.js');
const conf = require('../../conf.js');

function log(message) {
    console.log(message);
}

async function createImportWrapperAssistant() {
    log('--- Creating Import Wrapper Assistant for USDT Bridge ---');
    
    try {
        // 1. Setup provider and signer
        log('Setting up provider and signer...');
        
        // Connect to EVM network using provider from conf.js
        const { getProvider } = require('../../evm/provider.js');
        const provider = getProvider('3DPass');
        const rpcUrl = provider.connection.url;
        log(`Connecting to EVM network: ${rpcUrl}`);
        
        // Get wallet from keys.json (same pattern as other scripts in the project)
        const ethWallet = ethers.Wallet.fromMnemonic(JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase);
        
        // Create signer (same pattern as other scripts)
        const signer = process.env.devnet ? provider.getSigner(0) : ethWallet.connect(provider);
        const signerAddress = signer.address;
        log(`Using signer address: ${signerAddress}`);

        // 2. Load deployed contract addresses (hardcoded)
        log('Loading deployed contract addresses...');
        const assistantFactoryAddress = conf.threedpass_assistant_factory_contract_addresses[conf.version];
        const importWrapperUsdtAddress = '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C'; // Hardcoded USDT Import Wrapper address

        // Validate that we have the required addresses
        if (!assistantFactoryAddress) {
            throw new Error(`AssistantFactory address not found for version ${conf.version}. Available versions: ${Object.keys(conf.threedpass_assistant_factory_contract_addresses || {}).join(', ')}`);
        }

        log(`AssistantFactory: ${assistantFactoryAddress}`);
        log(`USDT Import Wrapper: ${importWrapperUsdtAddress}`);

        // 3. Load contract ABIs
        log('Loading contract ABIs...');
        const assistantFactoryJson = require('../../evm/build/contracts/AssistantFactory.json');

        // 4. Create contract instances
        log('Creating contract instances...');
        const assistantFactoryContract = new ethers.Contract(assistantFactoryAddress, assistantFactoryJson.abi, signer);

        // 5. Create Import Wrapper Assistant
        log('Creating Import Wrapper Assistant for USDT bridge...');
        let importWrapperUsdtAssistantAddress;
        try {
            const importWrapperUsdtAssistantTx = await assistantFactoryContract.createImportWrapperAssistant(
                importWrapperUsdtAddress, // bridge address
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 
                10, // swap_fee10000
                1, // exponent
                "USDT import assistant shares on 3dpass", // assistant shares token name 
                "USDTIA", // assistant shares token symbol 
                { gasLimit: 3000000, maxFeePerGas: 100, maxPriorityFeePerGas: 10 }
            );
            const importWrapperUsdtAssistantReceipt = await importWrapperUsdtAssistantTx.wait();
            
            // Find the NewImportWrapperAssistant event in the logs
            const newImportWrapperAssistantEvent = importWrapperUsdtAssistantReceipt.logs.find(log => {
                try {
                    const parsedLog = assistantFactoryContract.interface.parseLog(log);
                    return parsedLog.name === 'NewImportWrapperAssistant';
                } catch (e) {
                    return false;
                }
            });
            
            if (newImportWrapperAssistantEvent) {
                const parsedEvent = assistantFactoryContract.interface.parseLog(newImportWrapperAssistantEvent);
                importWrapperUsdtAssistantAddress = parsedEvent.args.contractAddress;
                log(`  ✓ USDT Import Wrapper Assistant created: ${importWrapperUsdtAssistantAddress}`);
            } else {
                throw new Error('NewImportWrapperAssistant event not found in transaction receipt');
            }
            
        } catch (err) {
            log(`  ✗ Failed to create USDT Import Wrapper Assistant: ${err.message}`);
            throw err;
        }

        // 6. Verify the assistant contract
        log('Verifying the assistant contract...');
        try {
            // Load ERC20 ABI for name/symbol calls
            const erc20Abi = [
                { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            
            const assistantContract = new ethers.Contract(importWrapperUsdtAssistantAddress, erc20Abi, signer);
            const assistantName = await assistantContract.name();
            const assistantSymbol = await assistantContract.symbol();
            const assistantDecimals = await assistantContract.decimals();
            const totalSupply = await assistantContract.totalSupply();
            
            log(`  ✓ Assistant contract verified:`);
            log(`    - Name: ${assistantName}`);
            log(`    - Symbol: ${assistantSymbol}`);
            log(`    - Decimals: ${assistantDecimals}`);
            log(`    - Total Supply: ${ethers.utils.formatUnits(totalSupply, assistantDecimals)}`);
            
        } catch (err) {
            log(`  ⚠ Could not verify assistant contract details: ${err.message}`);
        }

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('  🎉 IMPORT WRAPPER ASSISTANT CREATION SUMMARY');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        log('\n📋 CREATION RESULTS:');
        log(`  ✅ USDT Import Wrapper Assistant created successfully`);

        log('\n🤖 ASSISTANT CONTRACT DETAILS:');
        log(`  📥 USDT Import Wrapper Assistant:`);
        log(`     Address: ${importWrapperUsdtAssistantAddress}`);
        log(`     Bridge Address: ${importWrapperUsdtAddress}`);
        log(`     Manager: ${signerAddress}`);
        log(`     Management Fee: 1.00% (100/10000)`);
        log(`     Success Fee: 10.00% (1000/10000)`);
        log(`     Swap Fee: 0.10% (10/10000)`);
        log(`     Exponent: 1`);
        log(`     Token Name: "USDT import assistant shares on 3dpass"`);
        log(`     Token Symbol: "USDTIA"`);

        log('\n🏗️  INFRASTRUCTURE CONTRACTS:');
        log(`  🤖 AssistantFactory: ${assistantFactoryAddress}`);
        log(`  📥 USDT Import Wrapper: ${importWrapperUsdtAddress}`);

        log('\n🎯 ASSISTANT CAPABILITIES:');
        log(`  ✅ Automated processing of USDT import transactions`);
        log(`  ✅ Management fee collection (1.00%)`);
        log(`  ✅ Success fee collection (10.00%)`);
        log(`  ✅ Swap fee collection (0.10%)`);
        log(`  ✅ ERC20 share tokens for liquidity providers`);
        log(`  ✅ Governance through share token holders`);

        log('\n🚀 READY FOR OPERATION:');
        log(`  The USDT Import Wrapper Assistant is now fully operational and ready to`);
        log(`  provide automated processing services for the USDT import bridge.`);
        log(`  Users can now stake their tokens with the assistant to earn fees`); 
        log(`  from successful bridge transactions.`);

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('  🎉 IMPORT WRAPPER ASSISTANT CREATION COMPLETE');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (err) {
        log('\n--- Import Wrapper Assistant Creation Failed ---');
        log(err.message);
        log(err.stack);
        process.exit(1);
    }
}

// Run the script
createImportWrapperAssistant();
