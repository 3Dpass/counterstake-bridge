#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs');
const desktopApp = require('ocore/desktop_app.js');

async function enactImportWrapperBridges() {
    console.log('🌉 Enacting ImportWrapper bridges...');
    
    try {
        // Get wallet from keys.json (same pattern as other scripts in the project)
        const ethWallet = ethers.Wallet.fromMnemonic(JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase);
        console.log(`📋 Using account: ${ethWallet.address}`);
        
        // Get ImportWrapper contracts to enact
        const importWrappers = [
            {
                name: 'USDTImportWrapper',
                address: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C'
            }
        ];
        
        console.log(`\n🔗 Found ${importWrappers.length} ImportWrapper contracts to enact:`);
        importWrappers.forEach(wrapper => {
            console.log(`   ${wrapper.name}: ${wrapper.address}`);
        });
        
        // Connect to EVM network using provider from conf.js
        const { getProvider } = require('../../evm/provider.js');
        const provider = getProvider('3DPass');
        const rpcUrl = provider.connection.url;
        console.log(`\n🌐 Connecting to EVM network: ${rpcUrl}`);
        
        // Create signer (same pattern as other scripts)
        const signer = process.env.devnet ? provider.getSigner(0) : ethWallet.connect(provider);
        
        // Check connection
        const network = await provider.getNetwork();
        console.log(`✅ Connected to chain ID: ${network.chainId}`);
        
        // Check account balance
        const balance = await provider.getBalance(ethWallet.address);
        const balanceEth = ethers.utils.formatEther(balance);
        console.log(`💰 Account balance: ${balanceEth} P3D`);
        
        if (balance.isZero()) {
            console.log('⚠️  Account has no balance - make sure the account is funded');
            return false;
        }
        
        // ImportWrapper ABI (minimal - just the enactImportWrapper function)
        const importWrapperABI = [
            {
                "inputs": [],
                "name": "enactImportWrapper",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "enacted",
                "outputs": [
                    {
                        "internalType": "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        // Enact each ImportWrapper
        const results = [];
        
        for (const wrapper of importWrappers) {
            console.log(`\n🔧 Enacting ${wrapper.name}...`);
            
            try {
                // Create contract instance
                const contract = new ethers.Contract(wrapper.address, importWrapperABI, signer);
                
                // Check if already enacted
                const isEnacted = await contract.enacted();
                if (isEnacted) {
                    console.log(`   ✅ ${wrapper.name} is already enacted`);
                    results.push({ name: wrapper.name, status: 'already_enacted', txHash: null });
                    continue;
                }
                
                // Use a reasonable gas limit instead of estimating (estimation seems to be incorrect)
                const gasLimit = 1000000; // 1M gas should be more than enough for this function
                
                console.log(`   ⛽ Using gas limit: ${gasLimit}`);
                
                // Get gas price
                const gasPrice = await provider.getGasPrice();
                console.log(`   💰 Gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`);
                
                console.log(`   📤 Sending enactImportWrapper transaction...`);
                
                // Send transaction
                const tx = await contract.enactImportWrapper({
                    gasLimit: gasLimit,
                    gasPrice: gasPrice
                });
                
                console.log(`   ⏳ Waiting for transaction confirmation...`);
                const receipt = await tx.wait();
                
                console.log(`   ✅ ${wrapper.name} enacted successfully!`);
                console.log(`   📋 Transaction hash: ${receipt.transactionHash}`);
                console.log(`   📦 Block number: ${receipt.blockNumber}`);
                console.log(`   ⛽ Gas used: ${receipt.gasUsed}`);
                
                results.push({ 
                    name: wrapper.name, 
                    status: 'enacted', 
                    txHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString()
                });
                
            } catch (error) {
                console.log(`   ❌ Failed to enact ${wrapper.name}: ${error.message}`);
                results.push({ name: wrapper.name, status: 'failed', error: error.message });
            }
        }
        
        // Summary
        console.log('\n📊 Enactment Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const enacted = results.filter(r => r.status === 'enacted').length;
        const alreadyEnacted = results.filter(r => r.status === 'already_enacted').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        console.log(`✅ Successfully enacted: ${enacted}`);
        console.log(`ℹ️  Already enacted: ${alreadyEnacted}`);
        console.log(`❌ Failed: ${failed}`);
        
        console.log('\n📋 Detailed Results:');
        results.forEach(result => {
            console.log(`\n${result.name}:`);
            if (result.status === 'enacted') {
                console.log(`   ✅ Status: Enacted`);
                console.log(`   📋 TX: ${result.txHash}`);
                console.log(`   📦 Block: ${result.blockNumber}`);
                console.log(`   ⛽ Gas: ${result.gasUsed}`);
            } else if (result.status === 'already_enacted') {
                console.log(`   ℹ️  Status: Already enacted`);
            } else {
                console.log(`   ❌ Status: Failed`);
                console.log(`   🔍 Error: ${result.error}`);
            }
        });
        
        if (enacted > 0 || alreadyEnacted > 0) {
            console.log('\n🎉 ImportWrapper bridges are ready for use!');
            console.log('   The bridges can now perform mint/burn operations.');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error enacting ImportWrapper bridges:', error.message);
        return false;
    }
}

// Run the script
if (require.main === module) {
    enactImportWrapperBridges()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}

module.exports = { enactImportWrapperBridges };
