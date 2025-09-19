#!/usr/bin/env node

/**
 * Complete Export Assistant Information Reader
 * Fetches all available information about the USDT Export Assistant on Ethereum
 */

const { ethers } = require('ethers');
const path = require('path');

// Import contract ABIs
const ExportAssistant = require('../../evm/build/contracts/ExportAssistant.json');
const Export = require('../../evm/build/contracts/Export.json');
const Oracle = require('../../evm/build/contracts/Oracle.json');

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

function formatFee(fee10000) {
    return `${(fee10000 / 100).toFixed(2)}%`;
}

async function readExportAssistant() {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
    log('  🤖 EXPORT ASSISTANT INFORMATION READER (ETHEREUM)', colors.cyan);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
    
    try {
        // Setup provider (no signer needed for read-only operations)
        const provider = getProvider('Ethereum');
        log(`Using Ethereum provider from evm/provider.js`, colors.blue);

        // Assistant address from deployment log
        const assistantAddress = '0xA07a7a1514F391E1e636F2d5eB71c53ee80fC6DB';
        
        log(`\n🤖 Assistant Address: ${assistantAddress}`, colors.blue);

        // Create assistant contract instance
        const assistant = new ethers.Contract(assistantAddress, ExportAssistant.abi, provider);

        log('\n📋 Retrieving Complete Assistant Information...', colors.blue);

        // Get basic assistant configuration
        const bridgeAddress = await assistant.bridgeAddress();
        const tokenAddress = await assistant.tokenAddress();
        const managerAddress = await assistant.managerAddress();
        const oracleAddress = await assistant.oracleAddress();

        log('\n🏗️  Basic Assistant Configuration:');
        log(`  Bridge Address: ${bridgeAddress}`);
        log(`  Token Address: ${tokenAddress}`);
        log(`  Manager Address: ${managerAddress}`);
        log(`  Oracle Address: ${oracleAddress}`);

        // Get fee configuration
        const managementFee = await assistant.management_fee10000();
        const successFee = await assistant.success_fee10000();
        const exitFee = await assistant.exit_fee10000();
        const exponent = await assistant.exponent();

        log('\n💰 Fee Configuration:');
        log(`  Management Fee: ${formatFee(managementFee)} (${managementFee}/10000)`);
        log(`  Success Fee: ${formatFee(successFee)} (${successFee}/10000)`);
        log(`  Exit Fee: ${formatFee(exitFee)} (${exitFee}/10000)`);
        log(`  Exponent: ${exponent}`);

        // Get timing configuration
        const profitDiffusionPeriod = await assistant.profit_diffusion_period();
        const ts = await assistant.ts();

        log('\n⏰ Timing Configuration:');
        log(`  Profit Diffusion Period: ${formatTime(Number(profitDiffusionPeriod))}`);
        log(`  Last Update Timestamp: ${new Date(ts * 1000).toISOString()}`);

        // Get balance and profit information
        const profit = await assistant.profit();
        const mf = await assistant.mf();
        const balanceInWork = await assistant.balance_in_work();
        const recentProfit = await assistant.recent_profit();
        const recentProfitTs = await assistant.recent_profit_ts();
        const networkFeeCompensation = await assistant.network_fee_compensation();

        log('\n💼 Balance and Profit Information:');
        log(`  Current Profit: ${ethers.utils.formatEther(profit)} ETH`);
        log(`  Management Fee: ${ethers.utils.formatEther(mf)} ETH`);
        log(`  Balance in Work: ${ethers.utils.formatEther(balanceInWork)} ETH`);
        log(`  Recent Profit: ${ethers.utils.formatEther(recentProfit)} ETH`);
        log(`  Recent Profit Timestamp: ${new Date(recentProfitTs * 1000).toISOString()}`);
        log(`  Network Fee Compensation: ${ethers.utils.formatEther(networkFeeCompensation)} ETH`);

        // Get ERC20 token information
        log('\n🪙 Assistant Share Token Information:');
        try {
            const tokenName = await assistant.name();
            const tokenSymbol = await assistant.symbol();
            const tokenDecimals = await assistant.decimals();
            const totalSupply = await assistant.totalSupply();
            
            log(`  Name: ${tokenName}`);
            log(`  Symbol: ${tokenSymbol}`);
            log(`  Decimals: ${tokenDecimals}`);
            log(`  Total Supply: ${ethers.utils.formatUnits(totalSupply, tokenDecimals)} ${tokenSymbol}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve token info: ${err.message}`, colors.yellow);
        }

        // Get governance information
        log('\n🏛️  Governance Information:');
        try {
            const governance = await assistant.governance();
            log(`  Governance Address: ${governance}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve governance info: ${err.message}`, colors.yellow);
        }

        // Get bridge information for context
        log('\n🌉 Associated Bridge Information:');
        try {
            const bridge = new ethers.Contract(bridgeAddress, Export.abi, provider);
            const foreignNetwork = await bridge.foreign_network();
            const foreignAsset = await bridge.foreign_asset();
            
            log(`  Foreign Network: ${foreignNetwork}`);
            log(`  Foreign Asset: ${foreignAsset}`);
            log(`  Home Network: Ethereum (implicit)`);
            log(`  Home Asset: ETH (native token)`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve bridge info: ${err.message}`, colors.yellow);
        }

        // Get token information for ETH and USDT
        log('\n🪙 Token Details:');
        try {
            // ERC20 ABI for token info
            const erc20Abi = [
                { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            
            // ETH (native token)
            log(`  🪙 Native Token (ETH):`);
            log(`    Name: Ethereum`);
            log(`    Symbol: ETH`);
            log(`    Decimals: 18`);
            log(`    Type: Native cryptocurrency`);
            
            // USDT token
            const usdtContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const usdtName = await usdtContract.name();
            const usdtSymbol = await usdtContract.symbol();
            const usdtDecimals = await usdtContract.decimals();
            const usdtSupply = await usdtContract.totalSupply();
            
            log(`  💰 USDT Token:`);
            log(`    Name: ${usdtName}`);
            log(`    Symbol: ${usdtSymbol}`);
            log(`    Decimals: ${usdtDecimals}`);
            log(`    Total Supply: ${ethers.utils.formatUnits(usdtSupply, usdtDecimals)} ${usdtSymbol}`);
            
        } catch (err) {
            log(`  ⚠️  Could not retrieve token details: ${err.message}`, colors.yellow);
        }

        // Get assistant's token balances
        log('\n💰 Assistant Token Balances:');
        try {
            // ERC20 ABI for balance calls
            const erc20Abi = [
                { "constant": true, "inputs": [{ "name": "who", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            
            // ETH balance (native token)
            const ethBalance = await provider.getBalance(assistantAddress);
            const ethBalanceFormatted = ethers.utils.formatEther(ethBalance);
            
            log(`  🪙 ETH Balance: ${ethBalanceFormatted} ETH`);
            
            // USDT balance
            const usdtContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const usdtBalance = await usdtContract.balanceOf(assistantAddress);
            const usdtBalanceFormatted = ethers.utils.formatUnits(usdtBalance, 6); // USDT has 6 decimals
            
            log(`  💰 USDT Balance: ${usdtBalanceFormatted} USDT`);
            
            // Calculate USD equivalent if both balances exist
            if (ethBalance.gt(0) || usdtBalance.gt(0)) {
                log(`  💵 Balance Summary:`);
                if (ethBalance.gt(0)) {
                    log(`    - ETH: ${ethBalanceFormatted} ETH`);
                }
                if (usdtBalance.gt(0)) {
                    log(`    - USDT: ${usdtBalanceFormatted} USDT`);
                }
            } else {
                log(`  📭 No token balances found (assistant has no tokens)`);
            }
            
        } catch (err) {
            log(`  ⚠️  Could not retrieve assistant balances: ${err.message}`, colors.yellow);
        }

        // Test Oracle price retrieval
        log('\n🔮 Oracle Price Information:');
        try {
            const oracle = new ethers.Contract(oracleAddress, Oracle.abi, provider);
            
            const nativeUsdtPrice = await oracle.getPrice("_NATIVE_", "USDT");
            log(`  💰 _NATIVE_ vs USDT Price: (${nativeUsdtPrice[0].toString()}, ${nativeUsdtPrice[1].toString()})`);
            log(`  💰 _NATIVE_ vs USDT Ratio: ${ethers.utils.formatEther(nativeUsdtPrice[0])} / ${ethers.utils.formatUnits(nativeUsdtPrice[1], 6)}`);
            
            // Also try reverse price
            const usdtNativePrice = await oracle.getPrice("USDT", "_NATIVE_");
            log(`  💰 USDT vs _NATIVE_ Price: (${usdtNativePrice[0].toString()}, ${usdtNativePrice[1].toString()})`);
            log(`  💰 USDT vs _NATIVE_ Ratio: ${ethers.utils.formatUnits(usdtNativePrice[0], 6)} / ${ethers.utils.formatEther(usdtNativePrice[1])}`);
            
        } catch (err) {
            log(`  ⚠️  Could not retrieve Oracle prices: ${err.message}`, colors.yellow);
        }

        // Summary
        log('\n📋 Complete Assistant Information Summary:', colors.cyan);
        log(`  ✅ Assistant Type: Export Assistant`);
        log(`  ✅ Bridge Address: ${bridgeAddress}`);
        log(`  ✅ Manager: ${managerAddress}`);
        log(`  ✅ Management Fee: ${formatFee(managementFee)}`);
        log(`  ✅ Success Fee: ${formatFee(successFee)}`);
        log(`  ✅ Exit Fee: ${formatFee(exitFee)}`);
        log(`  ✅ Exponent: ${exponent}`);
        log(`  ✅ Profit Diffusion Period: ${formatTime(Number(profitDiffusionPeriod))}`);
        log(`  ✅ Total Share Supply: ${ethers.utils.formatUnits(await assistant.totalSupply(), await assistant.decimals())} ${await assistant.symbol()}`);
        
        // Add balance summary to the final summary
        try {
            const erc20Abi = [
                { "constant": true, "inputs": [{ "name": "who", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            const ethBalance = await provider.getBalance(assistantAddress);
            const usdtContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const usdtBalance = await usdtContract.balanceOf(assistantAddress);
            
            log(`  💰 ETH Balance: ${ethers.utils.formatEther(ethBalance)} ETH`);
            log(`  💰 USDT Balance: ${ethers.utils.formatUnits(usdtBalance, 6)} USDT`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve balances for summary: ${err.message}`, colors.yellow);
        }

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);
        log('  ✅ EXPORT ASSISTANT INFORMATION READ COMPLETE', colors.green);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);

    } catch (err) {
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red);
        log('  ❌ EXPORT ASSISTANT READ FAILED', colors.red);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red);
        log(`\n❌ Error: ${err.message}`, colors.red);
        console.error(err);
        process.exit(1);
    }
}

// Command line execution
if (require.main === module) {
    readExportAssistant()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Read failed:', error);
            process.exit(1);
        });
}

module.exports = readExportAssistant;
