#!/usr/bin/env node

/**
 * Complete Import Wrapper Assistant Information Reader
 * Fetches all available information about the USDT Import Wrapper Assistant
 */

const { ethers } = require('ethers');
const path = require('path');

// Import contract ABIs
const ImportWrapperAssistant = require('../build/contracts/ImportWrapperAssistant.json');
const ImportWrapper = require('../build/contracts/ImportWrapper.json');
const Oracle = require('../build/contracts/Oracle.json');

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

async function readImportWrapperAssistant() {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
    log('  🤖 IMPORT WRAPPER ASSISTANT INFORMATION READER', colors.cyan);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
    
    try {
        // Setup provider (no signer needed for read-only operations)
        const provider = getProvider('3DPass');
        log(`Using 3DPass provider from evm/provider.js`, colors.blue);

        // Assistant address from deployment log
        const assistantAddress = '0x2Dce9B2dc9983f9b435da02a69C6F0e8A31Bf3E8';
        
        log(`\n🤖 Assistant Address: ${assistantAddress}`, colors.blue);

        // Create assistant contract instance
        const assistant = new ethers.Contract(assistantAddress, ImportWrapperAssistant.abi, provider);

        log('\n📋 Retrieving Complete Assistant Information...', colors.blue);

        // Get basic assistant configuration
        const bridgeAddress = await assistant.bridgeAddress();
        const tokenAddress = await assistant.tokenAddress();
        const precompileAddress = await assistant.precompileAddress();
        const managerAddress = await assistant.managerAddress();

        log('\n🏗️  Basic Assistant Configuration:');
        log(`  Bridge Address: ${bridgeAddress}`);
        log(`  Token Address: ${tokenAddress}`);
        log(`  Precompile Address: ${precompileAddress}`);
        log(`  Manager Address: ${managerAddress}`);

        // Get fee configuration
        const managementFee = await assistant.management_fee10000();
        const successFee = await assistant.success_fee10000();
        const swapFee = await assistant.swap_fee10000();
        const exitFee = await assistant.exit_fee10000();
        const exponent = await assistant.exponent();

        log('\n💰 Fee Configuration:');
        log(`  Management Fee: ${formatFee(managementFee)} (${managementFee}/10000)`);
        log(`  Success Fee: ${formatFee(successFee)} (${successFee}/10000)`);
        log(`  Swap Fee: ${formatFee(swapFee)} (${swapFee}/10000)`);
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
        log(`  Current Profit (Stake): ${ethers.utils.formatEther(profit.stake)}`);
        log(`  Current Profit (Image): ${ethers.utils.formatEther(profit.image)}`);
        log(`  Management Fee (Stake): ${ethers.utils.formatEther(mf.stake)}`);
        log(`  Management Fee (Image): ${ethers.utils.formatEther(mf.image)}`);
        log(`  Balance in Work (Stake): ${ethers.utils.formatEther(balanceInWork.stake)}`);
        log(`  Balance in Work (Image): ${ethers.utils.formatEther(balanceInWork.image)}`);
        log(`  Recent Profit (Stake): ${ethers.utils.formatEther(recentProfit.stake)}`);
        log(`  Recent Profit (Image): ${ethers.utils.formatEther(recentProfit.image)}`);
        log(`  Recent Profit Timestamp: ${new Date(recentProfitTs * 1000).toISOString()}`);
        log(`  Network Fee Compensation: ${ethers.utils.formatEther(networkFeeCompensation)}`);

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

        // Get unavailable profit information
        log('\n📊 Unavailable Profit Information:');
        try {
            const unavailableProfit = await assistant.getUnavailableProfit();
            log(`  Unavailable Profit (Stake): ${ethers.utils.formatEther(unavailableProfit.stake)}`);
            log(`  Unavailable Profit (Image): ${ethers.utils.formatEther(unavailableProfit.image)}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve unavailable profit: ${err.message}`, colors.yellow);
        }

        // Get bridge information for context
        log('\n🌉 Associated Bridge Information:');
        try {
            const bridge = new ethers.Contract(bridgeAddress, ImportWrapper.abi, provider);
            const homeNetwork = await bridge.home_network();
            const homeAsset = await bridge.home_asset();
            const oracleAddr = await bridge.oracleAddress();
            
            log(`  Home Network: ${homeNetwork}`);
            log(`  Home Asset: ${homeAsset}`);
            log(`  Oracle Address: ${oracleAddr}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve bridge info: ${err.message}`, colors.yellow);
        }

        // Get token information for stake and precompile tokens
        log('\n🪙 Token Details:');
        try {
            // ERC20 ABI for token info
            const erc20Abi = [
                { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            
            // Stake token (P3D)
            const stakeTokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const stakeTokenName = await stakeTokenContract.name();
            const stakeTokenSymbol = await stakeTokenContract.symbol();
            const stakeTokenDecimals = await stakeTokenContract.decimals();
            const stakeTokenSupply = await stakeTokenContract.totalSupply();
            
            log(`  🪙 Stake Token (P3D):`);
            log(`    Name: ${stakeTokenName}`);
            log(`    Symbol: ${stakeTokenSymbol}`);
            log(`    Decimals: ${stakeTokenDecimals}`);
            log(`    Total Supply: ${ethers.utils.formatUnits(stakeTokenSupply, stakeTokenDecimals)} ${stakeTokenSymbol}`);
            
            // Precompile token (wUSDT)
            const precompileTokenContract = new ethers.Contract(precompileAddress, erc20Abi, provider);
            const precompileTokenName = await precompileTokenContract.name();
            const precompileTokenSymbol = await precompileTokenContract.symbol();
            const precompileTokenDecimals = await precompileTokenContract.decimals();
            const precompileTokenSupply = await precompileTokenContract.totalSupply();
            
            log(`  📦 Precompile Token (wUSDT):`);
            log(`    Name: ${precompileTokenName}`);
            log(`    Symbol: ${precompileTokenSymbol}`);
            log(`    Decimals: ${precompileTokenDecimals}`);
            log(`    Total Supply: ${ethers.utils.formatUnits(precompileTokenSupply, precompileTokenDecimals)} ${precompileTokenSymbol}`);
            
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
            
            // P3D balance (stake token)
            const p3dContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const p3dBalance = await p3dContract.balanceOf(assistantAddress);
            const p3dBalanceFormatted = ethers.utils.formatEther(p3dBalance);
            
            log(`  🪙 P3D Balance: ${p3dBalanceFormatted} P3D`);
            
            // wUSDT balance (precompile token)
            const wUsdtContract = new ethers.Contract(precompileAddress, erc20Abi, provider);
            const wUsdtBalance = await wUsdtContract.balanceOf(assistantAddress);
            const wUsdtBalanceFormatted = ethers.utils.formatUnits(wUsdtBalance, 6); // wUSDT has 6 decimals
            
            log(`  📦 wUSDT Balance: ${wUsdtBalanceFormatted} wUSDT`);
            
            // Calculate USD equivalent if both balances exist
            if (p3dBalance.gt(0) || wUsdtBalance.gt(0)) {
                log(`  💵 Balance Summary:`);
                if (p3dBalance.gt(0)) {
                    log(`    - P3D: ${p3dBalanceFormatted} P3D`);
                }
                if (wUsdtBalance.gt(0)) {
                    log(`    - wUSDT: ${wUsdtBalanceFormatted} wUSDT`);
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
            const bridge = new ethers.Contract(bridgeAddress, ImportWrapper.abi, provider);
            const homeAsset = await bridge.home_asset();
            const oracleAddr = await bridge.oracleAddress();
            const oracle = new ethers.Contract(oracleAddr, Oracle.abi, provider);
            
            const usdtP3DPrice = await oracle.getPrice(homeAsset, "P3D");
            log(`  💰 USDT vs P3D Price: (${usdtP3DPrice[0].toString()}, ${usdtP3DPrice[1].toString()})`);
            log(`  💰 USDT vs P3D Ratio: ${ethers.utils.formatEther(usdtP3DPrice[0])} / ${ethers.utils.formatEther(usdtP3DPrice[1])}`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve Oracle prices: ${err.message}`, colors.yellow);
        }

        // Summary
        log('\n📋 Complete Assistant Information Summary:', colors.cyan);
        log(`  ✅ Assistant Type: Import Wrapper Assistant`);
        log(`  ✅ Bridge Address: ${bridgeAddress}`);
        log(`  ✅ Manager: ${managerAddress}`);
        log(`  ✅ Management Fee: ${formatFee(managementFee)}`);
        log(`  ✅ Success Fee: ${formatFee(successFee)}`);
        log(`  ✅ Swap Fee: ${formatFee(swapFee)}`);
        log(`  ✅ Exit Fee: ${formatFee(exitFee)}`);
        log(`  ✅ Exponent: ${exponent}`);
        log(`  ✅ Profit Diffusion Period: ${formatTime(Number(profitDiffusionPeriod))}`);
        log(`  ✅ Total Share Supply: ${ethers.utils.formatUnits(await assistant.totalSupply(), await assistant.decimals())} ${await assistant.symbol()}`);
        
        // Add balance summary to the final summary
        try {
            const erc20Abi = [
                { "constant": true, "inputs": [{ "name": "who", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
            ];
            const p3dContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            const wUsdtContract = new ethers.Contract(precompileAddress, erc20Abi, provider);
            const p3dBalance = await p3dContract.balanceOf(assistantAddress);
            const wUsdtBalance = await wUsdtContract.balanceOf(assistantAddress);
            
            log(`  💰 P3D Balance: ${ethers.utils.formatEther(p3dBalance)} P3D`);
            log(`  💰 wUSDT Balance: ${ethers.utils.formatUnits(wUsdtBalance, 6)} wUSDT`);
        } catch (err) {
            log(`  ⚠️  Could not retrieve balances for summary: ${err.message}`, colors.yellow);
        }

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);
        log('  ✅ IMPORT WRAPPER ASSISTANT INFORMATION READ COMPLETE', colors.green);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);

    } catch (err) {
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red);
        log('  ❌ IMPORT WRAPPER ASSISTANT READ FAILED', colors.red);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red);
        log(`\n❌ Error: ${err.message}`, colors.red);
        console.error(err);
        process.exit(1);
    }
}

// Command line execution
if (require.main === module) {
    readImportWrapperAssistant()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Read failed:', error);
            process.exit(1);
        });
}

module.exports = readImportWrapperAssistant;
