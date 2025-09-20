#!/usr/bin/env node

const { ethers } = require('ethers');

async function checkImportWrapperBridges() {
    console.log('🔍 Checking ImportWrapper Bridge Prerequisites...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
        // No account needed for read-only operations
        
        // Get ImportWrapper contracts (hardcoded addresses)
        const importWrappers = [
            {
                name: 'USDTImportWrapper',
                address: '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C',
                precompileAddress: '0xfBFBfbFA000000000000000000000000000000de' // wUSDT precompile
            }
        ];
        
        console.log(`\n🔗 Found ${importWrappers.length} ImportWrapper contracts to check:`);
        importWrappers.forEach(wrapper => {
            console.log(`   ${wrapper.name}: ${wrapper.address}`);
            console.log(`   Precompile: ${wrapper.precompileAddress}`);
        });
        
        // Connect to EVM network using provider from conf.js
        const { getProvider } = require('../../evm/provider.js');
        const provider = getProvider('3DPass');
        const rpcUrl = provider.connection.url;
        console.log(`\n🌐 Connecting to EVM network: ${rpcUrl}`);
        
        // Check connection
        const chainId = await provider.getNetwork().then(network => network.chainId);
        console.log(`✅ Connected to chain ID: ${chainId}`);
        
        // No account balance check needed for read-only operations
        
        // ABI for LocalAsset interface (ILocalAsset.sol)
        const localAssetABI = [
            {
                "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
                "name": "isOwner",
                "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
                "name": "isIssuer",
                "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
                "name": "isAdmin",
                "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
                "name": "isFreezer",
                "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "status",
                "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "minBalance",
                "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        // ABI for IPrecompileERC20 interface
        const precompileERC20ABI = [
            {
                "inputs": [{"internalType": "address", "name": "who", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "name",
                "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "symbol",
                "outputs": [{"internalType": "string", "name": "", "type": "string"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "decimals",
                "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        // ABI for ImportWrapper contract
        const importWrapperABI = [
            {
                "inputs": [],
                "name": "enacted",
                "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "precompileAddress",
                "outputs": [{"internalType": "address", "name": "", "type": "address"}],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        
        // Check each ImportWrapper
        const results = [];
        
        for (const wrapper of importWrappers) {
            console.log(`\n🔧 Checking ${wrapper.name}...`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            const checkResult = {
                name: wrapper.name,
                bridgeAddress: wrapper.address,
                precompileAddress: wrapper.precompileAddress,
                checks: {}
            };
            
            try {
                // Create contract instances
                const bridgeContract = new ethers.Contract(wrapper.address, importWrapperABI, provider);
                const precompileContract = new ethers.Contract(wrapper.precompileAddress, localAssetABI, provider);
                const erc20Contract = new ethers.Contract(wrapper.precompileAddress, precompileERC20ABI, provider);
                
                // Check 0: Bridge enactment status
                console.log('📋 Check 0: Bridge Enactment Status');
                const isEnacted = await bridgeContract.enacted();
                console.log(`   Current status: ${isEnacted ? '✅ ENACTED' : '❌ NOT ENACTED'}`);
                checkResult.checks.enacted = isEnacted;
                
                if (isEnacted) {
                    console.log(`   ℹ️  ${wrapper.name} is already enacted - no further checks needed`);
                    results.push(checkResult);
                    continue;
                }
                
                // Check 1: Contract must be the owner of the asset
                console.log('\n📋 Check 1: Bridge is Owner of Asset');
                const isOwner = await precompileContract.isOwner(wrapper.address);
                console.log(`   Bridge ${wrapper.address} is owner: ${isOwner ? '✅ YES' : '❌ NO'}`);
                checkResult.checks.isOwner = isOwner;
                
                // Check 2: Contract must be the issuer of the asset
                console.log('\n📋 Check 2: Bridge is Issuer of Asset');
                const isIssuer = await precompileContract.isIssuer(wrapper.address);
                console.log(`   Bridge ${wrapper.address} is issuer: ${isIssuer ? '✅ YES' : '❌ NO'}`);
                checkResult.checks.isIssuer = isIssuer;
                
                // Check 3: Contract must be the admin of the asset
                console.log('\n📋 Check 3: Bridge is Admin of Asset');
                const isAdmin = await precompileContract.isAdmin(wrapper.address);
                console.log(`   Bridge ${wrapper.address} is admin: ${isAdmin ? '✅ YES' : '❌ NO'}`);
                checkResult.checks.isAdmin = isAdmin;
                
                // Check 4: Contract must be the freezer of the asset
                console.log('\n📋 Check 4: Bridge is Freezer of Asset');
                const isFreezer = await precompileContract.isFreezer(wrapper.address);
                console.log(`   Bridge ${wrapper.address} is freezer: ${isFreezer ? '✅ YES' : '❌ NO'}`);
                checkResult.checks.isFreezer = isFreezer;
                
                // Check 5: Asset status must be "Live"
                console.log('\n📋 Check 5: Asset Status is Live');
                const assetStatus = await precompileContract.status();
                const isLive = assetStatus === 'Live';
                console.log(`   Asset status: "${assetStatus}" ${isLive ? '✅ LIVE' : '❌ NOT LIVE'}`);
                checkResult.checks.isLive = isLive;
                checkResult.checks.assetStatus = assetStatus;
                
                // Check 6: Bridge balance must equal minBalance
                console.log('\n📋 Check 6: Bridge Balance Equals MinBalance');
                const minBalance = await precompileContract.minBalance();
                const bridgeBalance = await erc20Contract.balanceOf(wrapper.address);
                const balanceMatches = bridgeBalance.toString() === minBalance.toString();
                console.log(`   Min balance required: ${minBalance}`);
                console.log(`   Bridge balance: ${bridgeBalance}`);
                console.log(`   Balance matches: ${balanceMatches ? '✅ YES' : '❌ NO'}`);
                checkResult.checks.balanceMatches = balanceMatches;
                checkResult.checks.minBalance = minBalance.toString();
                checkResult.checks.bridgeBalance = bridgeBalance.toString();
                
                // Additional info: Asset details
                console.log('\n📋 Asset Information:');
                try {
                    const assetName = await erc20Contract.name();
                    const assetSymbol = await erc20Contract.symbol();
                    const assetDecimals = await erc20Contract.decimals();
                    console.log(`   Name: ${assetName}`);
                    console.log(`   Symbol: ${assetSymbol}`);
                    console.log(`   Decimals: ${assetDecimals}`);
                    checkResult.checks.assetInfo = { name: assetName, symbol: assetSymbol, decimals: assetDecimals.toString() };
                } catch (error) {
                    console.log(`   ⚠️  Could not fetch asset info: ${error.message}`);
                }
                
                // Summary for this bridge
                const allChecksPass = isOwner && isIssuer && isAdmin && isFreezer && isLive && balanceMatches;
                console.log(`\n📊 ${wrapper.name} Summary:`);
                console.log(`   Overall status: ${allChecksPass ? '✅ READY TO ENACT' : '❌ NOT READY'}`);
                
                if (!allChecksPass) {
                    console.log('\n🔧 Required Actions:');
                    if (!isOwner) console.log('   • Set bridge as owner of the asset');
                    if (!isIssuer) console.log('   • Set bridge as issuer of the asset');
                    if (!isAdmin) console.log('   • Set bridge as admin of the asset');
                    if (!isFreezer) console.log('   • Set bridge as freezer of the asset');
                    if (!isLive) console.log(`   • Set asset status to "Live" (currently: "${assetStatus}")`);
                    if (!balanceMatches) console.log(`   • Transfer ${minBalance} tokens to bridge (currently has ${bridgeBalance})`);
                    
                    console.log('\n💡 Suggested Commands:');
                    console.log(`   # Set bridge as owner, issuer, admin, and freezer:`);
                    console.log(`   # Call setTeam(${wrapper.address}, ${wrapper.address}, ${wrapper.address}) on precompile ${wrapper.precompileAddress}`);
                    console.log(`   # Transfer minBalance tokens to bridge:`);
                    console.log(`   # Call transfer(${wrapper.address}, ${minBalance}) on precompile ${wrapper.precompileAddress}`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error checking ${wrapper.name}: ${error.message}`);
                checkResult.error = error.message;
            }
            
            results.push(checkResult);
        }
        
        // Overall summary
        console.log('\n\n📊 OVERALL SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const readyBridges = results.filter(r => r.checks && r.checks.enacted !== true && 
            r.checks.isOwner && r.checks.isIssuer && r.checks.isAdmin && 
            r.checks.isFreezer && r.checks.isLive && r.checks.balanceMatches);
        
        const enactedBridges = results.filter(r => r.checks && r.checks.enacted === true);
        
        const notReadyBridges = results.filter(r => r.checks && r.checks.enacted !== true && 
            (!r.checks.isOwner || !r.checks.isIssuer || !r.checks.isAdmin || 
             !r.checks.isFreezer || !r.checks.isLive || !r.checks.balanceMatches));
        
        console.log(`✅ Already enacted: ${enactedBridges.length}`);
        console.log(`🟢 Ready to enact: ${readyBridges.length}`);
        console.log(`🔴 Not ready: ${notReadyBridges.length}`);
        
        if (readyBridges.length > 0) {
            console.log('\n🎉 Ready to enact:');
            readyBridges.forEach(bridge => {
                console.log(`   • ${bridge.name}`);
            });
            console.log('\n💡 Run: node scripts/enact-import-wrapper-bridges.js');
        }
        
        if (notReadyBridges.length > 0) {
            console.log('\n⚠️  Not ready to enact:');
            notReadyBridges.forEach(bridge => {
                console.log(`   • ${bridge.name}`);
            });
            console.log('\n💡 Run asset setup scripts first to configure ownership and balances');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error checking ImportWrapper bridges:', error.message);
        return false;
    }
}

// Run the script
if (require.main === module) {
    checkImportWrapperBridges()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}

module.exports = { checkImportWrapperBridges };
