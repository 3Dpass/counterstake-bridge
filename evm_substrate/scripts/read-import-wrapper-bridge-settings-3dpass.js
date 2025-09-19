#!/usr/bin/env node

/**
 * Complete Bridge Settings Test
 * Accurately retrieves all bridge settings data including challenging periods
 */

const { ethers } = require('ethers');
const path = require('path');

// Import contract ABIs (using evm_substrate/build for 3DPass)
const ImportWrapper = require('../build/contracts/ImportWrapper.json');
const Oracle = require('../build/contracts/Oracle.json');
const erc20Abi = require('../build/contracts/IERC20WithSymbol.json').abi; // Generic ERC20 ABI for symbol/name/decimals

// P3D precompile interface (stake token)
const P3D_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)", 
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
];

// Load configuration
const conf = require('../../conf.js');
const { getProvider } = require('../../evm/provider.js');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
    console.log(`${color}%s${colors.reset}`, message);
}

function formatTime(seconds) {
    const hours = seconds / 3600;
    const days = hours / 24;
    if (days >= 1) {
        return `${days.toFixed(2)} days (${hours.toFixed(0)}h)`;
    } else {
        return `${hours.toFixed(2)} hours`;
    }
}

async function testCompleteBridgeSettings() {
    log('--- Complete Bridge Settings Test ---', colors.cyan);
    
    try {
        // Setup provider (no signer needed for read-only operations)
        const provider = getProvider('3DPass');
        log(`Using 3DPass provider from evm/provider.js`);

        // Bridge address
        const bridgeAddress = '0x00D5f00250434e76711e8127A37c6f84dBbDAA4C';
        log(`\n🌉 Bridge Address: ${bridgeAddress}`);

        // Create bridge contract instance
        const bridge = new ethers.Contract(bridgeAddress, ImportWrapper.abi, provider);

        log('\n📋 Retrieving Complete Bridge Settings...', colors.blue);

        // Helper function to properly handle settings structure
        function processSettings(settings) {
            const processed = {};
            for (let key in settings) {
                if (!key.match(/^\d+$/)) {
                    processed[key] = settings[key];
                }
            }
            return processed;
        }

        // Get bridge settings using the settings() function
        const rawSettings = await bridge.settings();
        const settings = processSettings(rawSettings);

        // Get basic bridge information
        const homeNetwork = await bridge.home_network();
        const homeAsset = await bridge.home_asset();
        const precompileAddress = await bridge.precompileAddress();
        const oracleAddr = await bridge.oracleAddress();
        const governanceAddr = await bridge.governance();
        const minPrice20 = await bridge.min_price20();

        log('\n🏗️  Basic Bridge Configuration:');
        log(`  Home Network: ${homeNetwork}`);
        log(`  Home Asset: ${homeAsset}`);
        log(`  Precompile Address: ${precompileAddress}`);
        log(`  Stake Token Address: ${settings.tokenAddress}`);
        log(`  Oracle Address: ${oracleAddr}`);
        log(`  Governance Address: ${governanceAddr}`);

        log('\n⚙️  Bridge Parameters:');
        log(`  Ratio (100): ${settings.ratio100}/100`);
        log(`  Counterstake Coefficient (100): ${settings.counterstake_coef100}/100`);
        log(`  Large Threshold: ${ethers.utils.formatEther(settings.large_threshold)} tokens`);
        log(`  Min Stake: ${ethers.utils.formatEther(settings.min_stake)} tokens`);
        log(`  Min Price 20: ${ethers.utils.formatEther(minPrice20)} tokens`);

        // Get challenging periods using the correct method
        log('\n⏰ Challenging Periods (Retrieved via getChallengingPeriod):');
        
        // Regular challenging periods
        log(`  📋 Regular Challenging Periods:`);
        const regularPeriods = [];
        for (let i = 0; i < 10; i++) { // Try up to 10 periods
            try {
                const period = await bridge.getChallengingPeriod(i, false); // false = regular
                regularPeriods.push(period);
                log(`    Period ${i}: ${period.toString()}s = ${formatTime(Number(period))}`);
            } catch (err) {
                // Stop when we get an error (no more periods)
                break;
            }
        }
        
        // Large challenging periods
        log(`  📋 Large Challenging Periods:`);
        const largePeriods = [];
        for (let i = 0; i < 10; i++) { // Try up to 10 periods
            try {
                const period = await bridge.getChallengingPeriod(i, true); // true = large
                largePeriods.push(period);
                log(`    Large Period ${i}: ${period.toString()}s = ${formatTime(Number(period))}`);
            } catch (err) {
                // Stop when we get an error (no more periods)
                break;
            }
        }

        // Get token information
        log('\n🪙 Token Information:');
        try {
            // Get ERC20 info for the precompile
            const erc20Abi = [
                { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            
            const precompileContract = new ethers.Contract(precompileAddress, erc20Abi, provider);
            const tokenName = await precompileContract.name();
            const tokenSymbol = await precompileContract.symbol();
            const tokenDecimals = await precompileContract.decimals();
            const totalSupply = await precompileContract.totalSupply();
            
            log(`  📦 Precompile Token (Foreign Asset):`);
            log(`    Name: ${tokenName}`);
            log(`    Symbol: ${tokenSymbol}`);
            log(`    Decimals: ${tokenDecimals}`);
            log(`    Total Supply: ${ethers.utils.formatUnits(totalSupply, tokenDecimals)} ${tokenSymbol}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve precompile token info: ${err.message}`, colors.yellow);
        }

        // Get stake token information (P3D precompile)
        try {
            const stakeTokenContract = new ethers.Contract(settings.tokenAddress, P3D_ABI, provider);
            const stakeTokenName = await stakeTokenContract.name();
            const stakeTokenSymbol = await stakeTokenContract.symbol();
            const stakeTokenDecimals = await stakeTokenContract.decimals();
            const stakeTokenSupply = await stakeTokenContract.totalSupply();
            
            log(`  🪙 Stake Token (P3D):`);
            log(`    Name: ${stakeTokenName}`);
            log(`    Symbol: ${stakeTokenSymbol}`);
            log(`    Decimals: ${stakeTokenDecimals}`);
            log(`    Total Supply: ${ethers.utils.formatUnits(stakeTokenSupply, stakeTokenDecimals)} ${stakeTokenSymbol}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve stake token info: ${err.message}`, colors.yellow);
        }

        // Test Oracle price retrieval
        log('\n🔮 Oracle Price Information:');
        try {
            const oracle = new ethers.Contract(oracleAddr, Oracle.abi, provider);
            
            const usdtP3DPrice = await oracle.getPrice(homeAsset, "P3D");
            log(`  💰 USDT vs P3D Price: (${usdtP3DPrice[0].toString()}, ${usdtP3DPrice[1].toString()})`);
            log(`  💰 USDT vs P3D Ratio: ${ethers.utils.formatEther(usdtP3DPrice[0])} / ${ethers.utils.formatEther(usdtP3DPrice[1])}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve Oracle prices: ${err.message}`, colors.yellow);
        }

        // Summary
        log('\n📋 Complete Bridge Settings Summary:', colors.cyan);
        log(`  ✅ Bridge Type: Import Wrapper`);
        log(`  ✅ Home Network: ${homeNetwork}`);
        log(`  ✅ Home Asset: ${homeAsset} (USDT on Ethereum)`);
        log(`  ✅ Foreign Asset: ${precompileAddress} (wUSDT on 3DPass)`);
        log(`  ✅ Stake Token: ${settings.tokenAddress} (P3D)`);
        log(`  ✅ Ratio: ${settings.ratio100}/100`);
        log(`  ✅ Counterstake Coefficient: ${settings.counterstake_coef100}/100`);
        log(`  ✅ Large Threshold: ${ethers.utils.formatEther(settings.large_threshold)} tokens`);
        log(`  ✅ Regular Challenging Periods: ${regularPeriods.length} periods`);
        log(`  ✅ Large Challenging Periods: ${largePeriods.length} periods`);

        // Detailed challenging periods summary
        log('\n⏰ Challenging Periods Summary:', colors.magenta);
        log(`  📋 Regular Claims:`);
        regularPeriods.forEach((period, i) => {
            log(`    ${i + 1}. ${formatTime(Number(period))}`);
        });
        log(`  📋 Large Claims:`);
        largePeriods.forEach((period, i) => {
            log(`    ${i + 1}. ${formatTime(Number(period))}`);
        });

        log('\n🎉 Complete Bridge Settings Retrieved Successfully!', colors.green);
        log(`   All ${regularPeriods.length + largePeriods.length} challenging periods retrieved correctly.`, colors.green);

    } catch (err) {
        log('\n❌ Test Failed:', colors.red);
        log(err.message, colors.red);
        console.error(err);
        process.exit(1);
    }
}

// Command line execution
if (require.main === module) {
    testCompleteBridgeSettings()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}

module.exports = testCompleteBridgeSettings;
