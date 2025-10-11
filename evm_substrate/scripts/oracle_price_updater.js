#!/usr/bin/env node

/**
 * 3DPass Oracle Price Updater
 * Fetches P3D/USD price from CoinGecko and updates the 3DPass oracle contract
 * 
 * Required keys.json structure:
 * {
 *   "oracle_manager_evm_address": "0x...",
 *   "oracle_manager_evm_private_key": "0x..."
 * }
 */

const fs = require("fs");
const { ethers } = require("ethers");
const desktopApp = require('ocore/desktop_app.js');
const { getProvider } = require('../../evm/provider.js');
const { wait } = require('../../utils.js');
const { fetchCoingeckoExchangeRateCached } = require('../../prices.js');

// Import 3DPass Oracle ABI
const oracleJson = require('../build/contracts/Oracle.json');

// P3D precompile interface
const P3D_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

// Batch precompile interface
const BATCH_ABI = [
    "function batchAll(address[] memory to, uint256[] memory value, bytes[] memory callData, uint64[] memory gasLimit) external"
];

// 3DPass Oracle address
const ORACLE_ADDRESS = '0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB';

// P3D precompile address
const P3D_ADDRESS = '0x0000000000000000000000000000000000000802';

// Batch precompile address
const BATCH_ADDRESS = '0x0000000000000000000000000000000000000808';

// EVM decimals multiplier for price adjustments
const EVMdecimalsMultiplier = 1000000;

// Token addresses and configurations
const TOKEN_CONFIGS = {
    P3D: {
        symbol: 'P3D',
        coingeckoId: '3dpass',
        decimals: 18
    },
    wUSDT: {
        symbol: 'wUSDT',
        address: '0xfBFBfbFA000000000000000000000000000000de', // wUSDT precompile on 3DPass
        decimals: 6,
        usdPrice: 1.0 // wUSDT is pegged to USD
    },
    USDT: {
        symbol: 'USDT',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
        decimals: 6,
        usdPrice: 1.0 // USDT is pegged to USD
    }
};

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
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

class Oracle3DPassUpdater {
    constructor() {
        this.oracle = null;
        this.signer = null;
        this.p3dUsdPrice = null;
    }

    async initialize() {
        log('🚀 Initializing 3DPass Oracle Price Updater...', colors.cyan);
        
        try {
            // Setup provider and signer
            const provider = getProvider('3DPass');
            log(`✅ Connected to 3DPass network`, colors.green);
            
            // Load oracle signer keys
            const keysPath = desktopApp.getAppDataDir() + '/keys.json';
            const keys = JSON.parse(fs.readFileSync(keysPath));
            
            if (!keys.oracle_manager_evm_private_key) {
                throw new Error('Oracle manager EVM private key not found in keys.json');
            }
            
            const oracleWallet = new ethers.Wallet(keys.oracle_manager_evm_private_key);
            this.signer = oracleWallet.connect(provider);
            
            log(`✅ Oracle signer address: ${this.signer.address}`, colors.green);
            
            // Verify signer address matches expected oracle manager address
            if (keys.oracle_manager_evm_address && keys.oracle_manager_evm_address.toLowerCase() !== this.signer.address.toLowerCase()) {
                log(`⚠️  Warning: Signer address ${this.signer.address} does not match expected oracle manager address ${keys.oracle_manager_evm_address}`, colors.yellow);
            } else if (keys.oracle_manager_evm_address) {
                log(`✅ Signer address matches expected oracle manager address`, colors.green);
            }
            
            // Initialize oracle contract
            this.oracle = new ethers.Contract(ORACLE_ADDRESS, oracleJson.abi, this.signer);
            log(`✅ Oracle contract initialized: ${ORACLE_ADDRESS}`, colors.green);
            
            // Check if signer is oracle owner
            try {
                const owner = await this.oracle.owner();
                if (owner.toLowerCase() !== this.signer.address.toLowerCase()) {
                    log(`⚠️  Warning: Signer ${this.signer.address} is not the oracle owner (${owner})`, colors.yellow);
                } else {
                    log(`✅ Signer is confirmed as oracle owner`, colors.green);
                }
            } catch (error) {
                log(`⚠️  Could not verify oracle ownership: ${error.message}`, colors.yellow);
            }
            
        } catch (error) {
            log(`❌ Failed to initialize: ${error.message}`, colors.red);
            throw error;
        }
    }

    async checkP3DBalance() {
        try {
            log('💰 Checking P3D balance for signer...', colors.blue);
            
            // Create P3D contract instance
            const p3dContract = new ethers.Contract(P3D_ADDRESS, P3D_ABI, this.signer);
            
            // Get balance
            const balance = await p3dContract.balanceOf(this.signer.address);
            const balanceFormatted = ethers.utils.formatEther(balance);
            
            log(`   P3D Balance: ${balanceFormatted} P3D`, colors.blue);
            
            // Calculate required balance for batch transaction (8 price updates)
            // Using the same gas strategy as bridge-setup-and-test.js
            const gasLimit = ethers.BigNumber.from(4000000); // Higher gas limit for 8 price updates
            const maxFeePerGas = ethers.BigNumber.from(100); // 100 wei (not gwei!)
            const totalRequired = gasLimit.mul(maxFeePerGas); // Total cost for single batch transaction
            const totalRequiredFormatted = ethers.utils.formatEther(totalRequired);
            
            log(`   Required for batch transaction: ${totalRequiredFormatted} P3D`, colors.blue);
            
            if (balance.lt(totalRequired)) {
                const shortfall = totalRequired.sub(balance);
                const shortfallFormatted = ethers.utils.formatEther(shortfall);
                throw new Error(`Insufficient P3D balance. Need ${totalRequiredFormatted} P3D, have ${balanceFormatted} P3D. Shortfall: ${shortfallFormatted} P3D`);
            }
            
            log(`✅ Sufficient P3D balance for all transactions`, colors.green);
            return balance;
            
        } catch (error) {
            log(`❌ Failed to check P3D balance: ${error.message}`, colors.red);
            throw error;
        }
    }

    async fetchP3DPrice() {
        try {
            log('📊 Fetching P3D price from CoinGecko...', colors.blue);
            const rawP3dUsdPrice = await fetchCoingeckoExchangeRateCached('P3D', 'USD', true);
            
            // Apply EVM decimals multiplier adjustment
            this.p3dUsdPrice = rawP3dUsdPrice / EVMdecimalsMultiplier;
            
            log(`✅ Raw P3D/USD Price: $${rawP3dUsdPrice}`, colors.blue);
            log(`✅ Adjusted P3D/USD Price to map 12 -> 18 decimals on EVM: $${this.p3dUsdPrice} (divided by ${EVMdecimalsMultiplier})`, colors.green);
            return this.p3dUsdPrice;
        } catch (error) {
            log(`❌ Failed to fetch P3D price: ${error.message}`, colors.red);
            throw error;
        }
    }

    async fetchCurrentOraclePrices() {
        try {
            log('📊 Fetching current oracle prices...', colors.blue);
            
            const prices = {};
            
            // Fetch P3D vs wUSDT
            try {
                const p3dWusdtPrice = await this.oracle.getPrice('P3D', TOKEN_CONFIGS.wUSDT.address);
                prices['P3D_vs_wUSDT'] = {
                    numerator: ethers.utils.formatEther(p3dWusdtPrice[0]),
                    denominator: ethers.utils.formatEther(p3dWusdtPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(p3dWusdtPrice[0])) / parseFloat(ethers.utils.formatEther(p3dWusdtPrice[1]))
                };
            } catch (err) {
                prices['P3D_vs_wUSDT'] = { error: err.message };
            }
            
            // Fetch P3D vs USDT
            try {
                const p3dUsdtPrice = await this.oracle.getPrice('P3D', TOKEN_CONFIGS.USDT.address);
                prices['P3D_vs_USDT'] = {
                    numerator: ethers.utils.formatEther(p3dUsdtPrice[0]),
                    denominator: ethers.utils.formatEther(p3dUsdtPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(p3dUsdtPrice[0])) / parseFloat(ethers.utils.formatEther(p3dUsdtPrice[1]))
                };
            } catch (err) {
                prices['P3D_vs_USDT'] = { error: err.message };
            }
            
            // Fetch wUSDT vs P3D
            try {
                const wusdtP3dPrice = await this.oracle.getPrice(TOKEN_CONFIGS.wUSDT.address, 'P3D');
                prices['wUSDT_vs_P3D'] = {
                    numerator: ethers.utils.formatEther(wusdtP3dPrice[0]),
                    denominator: ethers.utils.formatEther(wusdtP3dPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(wusdtP3dPrice[0])) / parseFloat(ethers.utils.formatEther(wusdtP3dPrice[1]))
                };
            } catch (err) {
                prices['wUSDT_vs_P3D'] = { error: err.message };
            }
            
            // Fetch USDT vs P3D
            try {
                const usdtP3dPrice = await this.oracle.getPrice(TOKEN_CONFIGS.USDT.address, 'P3D');
                prices['USDT_vs_P3D'] = {
                    numerator: ethers.utils.formatEther(usdtP3dPrice[0]),
                    denominator: ethers.utils.formatEther(usdtP3dPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(usdtP3dPrice[0])) / parseFloat(ethers.utils.formatEther(usdtP3dPrice[1]))
                };
            } catch (err) {
                prices['USDT_vs_P3D'] = { error: err.message };
            }
            
            // Fetch _NATIVE_ vs wUSDT
            try {
                const nativeWusdtPrice = await this.oracle.getPrice('_NATIVE_', TOKEN_CONFIGS.wUSDT.address);
                prices['_NATIVE__vs_wUSDT'] = {
                    numerator: ethers.utils.formatEther(nativeWusdtPrice[0]),
                    denominator: ethers.utils.formatEther(nativeWusdtPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(nativeWusdtPrice[0])) / parseFloat(ethers.utils.formatEther(nativeWusdtPrice[1]))
                };
            } catch (err) {
                prices['_NATIVE__vs_wUSDT'] = { error: err.message };
            }
            
            // Fetch wUSDT vs _NATIVE_
            try {
                const wusdtNativePrice = await this.oracle.getPrice(TOKEN_CONFIGS.wUSDT.address, '_NATIVE_');
                prices['wUSDT_vs__NATIVE_'] = {
                    numerator: ethers.utils.formatEther(wusdtNativePrice[0]),
                    denominator: ethers.utils.formatEther(wusdtNativePrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(wusdtNativePrice[0])) / parseFloat(ethers.utils.formatEther(wusdtNativePrice[1]))
                };
            } catch (err) {
                prices['wUSDT_vs__NATIVE_'] = { error: err.message };
            }
            
            // Fetch _NATIVE_ vs USDT
            try {
                const nativeUsdtPrice = await this.oracle.getPrice('_NATIVE_', TOKEN_CONFIGS.USDT.address);
                prices['_NATIVE__vs_USDT'] = {
                    numerator: ethers.utils.formatEther(nativeUsdtPrice[0]),
                    denominator: ethers.utils.formatEther(nativeUsdtPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(nativeUsdtPrice[0])) / parseFloat(ethers.utils.formatEther(nativeUsdtPrice[1]))
                };
            } catch (err) {
                prices['_NATIVE__vs_USDT'] = { error: err.message };
            }
            
            // Fetch USDT vs _NATIVE_
            try {
                const usdtNativePrice = await this.oracle.getPrice(TOKEN_CONFIGS.USDT.address, '_NATIVE_');
                prices['USDT_vs__NATIVE_'] = {
                    numerator: ethers.utils.formatEther(usdtNativePrice[0]),
                    denominator: ethers.utils.formatEther(usdtNativePrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(usdtNativePrice[0])) / parseFloat(ethers.utils.formatEther(usdtNativePrice[1]))
                };
            } catch (err) {
                prices['USDT_vs__NATIVE_'] = { error: err.message };
            }
            
            return prices;
        } catch (error) {
            log(`❌ Failed to fetch oracle prices: ${error.message}`, colors.red);
            throw error;
        }
    }

    async displayOraclePrices(prices, title) {
        log(`📊 ${title}:`, colors.cyan);
        
        for (const [pair, data] of Object.entries(prices)) {
            if (data.error) {
                log(`   ${pair}: ❌ Error - ${data.error}`, colors.red);
            } else {
                log(`   ${pair}: (${data.numerator}, ${data.denominator}) = ${data.ratio.toFixed(6)}`, colors.blue);
            }
        }
    }

    async updateOraclePrice(baseAsset, quoteAsset, basePrice, quotePrice, description) {
        try {
            log(`🔄 Updating oracle: ${description}`, colors.blue);
            log(`   ${baseAsset}/${quoteAsset} = ${basePrice}/${quotePrice}`, colors.blue);
            
            // Convert prices to proper format (numerator/denominator)
            const numerator = ethers.utils.parseUnits(basePrice.toFixed(18), 18);
            const denominator = ethers.utils.parseEther(quotePrice.toString());
            
            // Set gas parameters (matching bridge-setup-and-test.js)
            const gasParams = {
                gasLimit: 500000,
                maxFeePerGas: 100, // 100 wei (not gwei!)
                maxPriorityFeePerGas: 10 // 10 wei (not gwei!)
            };
            
            log(`   Gas parameters: gasLimit=${gasParams.gasLimit}, maxFeePerGas=${gasParams.maxFeePerGas} wei, maxPriorityFeePerGas=${gasParams.maxPriorityFeePerGas} wei`, colors.blue);
            
            // Set price with fixed gas parameters
            const tx = await this.oracle.setPrice(baseAsset, quoteAsset, numerator, denominator, gasParams);
            
            log(`   Transaction sent: ${tx.hash}`, colors.blue);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            log(`✅ ${description} updated successfully (gas used: ${receipt.gasUsed})`, colors.green);
            
            return receipt;
        } catch (error) {
            log(`❌ Failed to update ${description}: ${error.message}`, colors.red);
            throw error;
        }
    }

    async updateAllPricesBatch() {
        try {
            log('🔄 Updating all oracle prices using Batch precompile...', colors.cyan);
            
            // Prepare batch call data for all 4 price updates
            const to = [];
            const values = [];
            const callData = [];
            const gasLimits = [];
            
            // 1. P3D vs wUSDT
            const p3dToWusdt = this.p3dUsdPrice / TOKEN_CONFIGS.wUSDT.usdPrice;
            const p3dWusdtCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                'P3D',
                TOKEN_CONFIGS.wUSDT.address,
                ethers.utils.parseUnits(p3dToWusdt.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(p3dWusdtCallData);
            gasLimits.push(500000);
            
            // 2. P3D vs USDT
            const p3dToUsdt = this.p3dUsdPrice / TOKEN_CONFIGS.USDT.usdPrice;
            const p3dUsdtCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                'P3D',
                TOKEN_CONFIGS.USDT.address,
                ethers.utils.parseUnits(p3dToUsdt.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(p3dUsdtCallData);
            gasLimits.push(500000);
            
            // 3. wUSDT vs P3D
            const wusdtToP3d = TOKEN_CONFIGS.wUSDT.usdPrice / this.p3dUsdPrice;
            const wusdtP3dCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                TOKEN_CONFIGS.wUSDT.address,
                'P3D',
                ethers.utils.parseUnits(wusdtToP3d.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(wusdtP3dCallData);
            gasLimits.push(500000);
            
            // 4. USDT vs P3D
            const usdtToP3d = TOKEN_CONFIGS.USDT.usdPrice / this.p3dUsdPrice;
            const usdtP3dCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                TOKEN_CONFIGS.USDT.address,
                'P3D',
                ethers.utils.parseUnits(usdtToP3d.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(usdtP3dCallData);
            gasLimits.push(500000);
            
            // 5. _NATIVE_ vs wUSDT (same as P3D vs wUSDT)
            const nativeWusdtCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                '_NATIVE_',
                TOKEN_CONFIGS.wUSDT.address,
                ethers.utils.parseUnits(p3dToWusdt.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(nativeWusdtCallData);
            gasLimits.push(500000);
            
            // 6. wUSDT vs _NATIVE_ (same as wUSDT vs P3D)
            const wusdtNativeCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                TOKEN_CONFIGS.wUSDT.address,
                '_NATIVE_',
                ethers.utils.parseUnits(wusdtToP3d.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(wusdtNativeCallData);
            gasLimits.push(500000);
            
            // 7. _NATIVE_ vs USDT (same as P3D vs USDT)
            const nativeUsdtCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                '_NATIVE_',
                TOKEN_CONFIGS.USDT.address,
                ethers.utils.parseUnits(p3dToUsdt.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(nativeUsdtCallData);
            gasLimits.push(500000);
            
            // 8. USDT vs _NATIVE_ (same as USDT vs P3D)
            const usdtNativeCallData = this.oracle.interface.encodeFunctionData('setPrice', [
                TOKEN_CONFIGS.USDT.address,
                '_NATIVE_',
                ethers.utils.parseUnits(usdtToP3d.toFixed(18), 18),
                ethers.utils.parseEther('1')
            ]);
            to.push(ORACLE_ADDRESS);
            values.push(0);
            callData.push(usdtNativeCallData);
            gasLimits.push(500000);
            
            log(`📊 Batch Update Summary (using adjusted P3D price):`, colors.magenta);
            log(`   P3D/wUSDT: ${p3dToWusdt}`, colors.magenta);
            log(`   P3D/USDT: ${p3dToUsdt}`, colors.magenta);
            log(`   wUSDT/P3D: ${wusdtToP3d}`, colors.magenta);
            log(`   USDT/P3D: ${usdtToP3d}`, colors.magenta);
            log(`   _NATIVE_/wUSDT: ${p3dToWusdt}`, colors.magenta);
            log(`   wUSDT/_NATIVE_: ${wusdtToP3d}`, colors.magenta);
            log(`   _NATIVE_/USDT: ${p3dToUsdt}`, colors.magenta);
            log(`   USDT/_NATIVE_: ${usdtToP3d}`, colors.magenta);
            
            // Create batch contract instance
            const batchContract = new ethers.Contract(BATCH_ADDRESS, BATCH_ABI, this.signer);
            
            // Set gas parameters for the batch transaction
            const gasParams = {
                gasLimit: 4000000, // Higher gas limit for 8 price updates
                maxFeePerGas: 100, // 100 wei (not gwei!)
                maxPriorityFeePerGas: 10 // 10 wei (not gwei!)
            };
            
            log(`   Gas parameters: gasLimit=${gasParams.gasLimit}, maxFeePerGas=${gasParams.maxFeePerGas} wei, maxPriorityFeePerGas=${gasParams.maxPriorityFeePerGas} wei`, colors.blue);
            
            // Execute batch transaction
            const tx = await batchContract.batchAll(to, values, callData, gasLimits, gasParams);
            
            log(`   Batch transaction sent: ${tx.hash}`, colors.blue);
            await tx.wait();
            log(`   ✅ Batch transaction confirmed: ${tx.hash}`, colors.green);
            
            return tx;
            
        } catch (error) {
            log(`❌ Failed to update prices via batch: ${error.message}`, colors.red);
            throw error;
        }
    }

    async updateAllPrices() {
        try {
            log('🔄 Starting oracle price updates...', colors.cyan);
            
            // Check P3D balance first
            await this.checkP3DBalance();
            
            // Fetch current oracle prices BEFORE updates
            const pricesBefore = await this.fetchCurrentOraclePrices();
            await this.displayOraclePrices(pricesBefore, 'Current Oracle Prices (BEFORE)');
            
            // Fetch current P3D price
            await this.fetchP3DPrice();
            
            if (!this.p3dUsdPrice) {
                throw new Error('P3D price not available');
            }
            
            log(`📊 Price Summary:`, colors.magenta);
            log(`   P3D/USD (adjusted): $${this.p3dUsdPrice} (raw price divided by ${EVMdecimalsMultiplier})`, colors.magenta);
            log(`   wUSDT/USD: $${TOKEN_CONFIGS.wUSDT.usdPrice}`, colors.magenta);
            log(`   USDT/USD: $${TOKEN_CONFIGS.USDT.usdPrice}`, colors.magenta);
            
            // Calculate price ratios
            const p3dToWusdt = this.p3dUsdPrice / TOKEN_CONFIGS.wUSDT.usdPrice;
            const p3dToUsdt = this.p3dUsdPrice / TOKEN_CONFIGS.USDT.usdPrice;
            const wusdtToP3d = TOKEN_CONFIGS.wUSDT.usdPrice / this.p3dUsdPrice;
            const usdtToP3d = TOKEN_CONFIGS.USDT.usdPrice / this.p3dUsdPrice;
            
            log(`📊 Calculated Ratios (using adjusted P3D price):`, colors.magenta);
            log(`   P3D/wUSDT: ${p3dToWusdt}`, colors.magenta);
            log(`   P3D/USDT: ${p3dToUsdt}`, colors.magenta);
            log(`   wUSDT/P3D: ${wusdtToP3d}`, colors.magenta);
            log(`   USDT/P3D: ${usdtToP3d}`, colors.magenta);
            
            // Update all oracle prices using Batch precompile (single transaction)
            await this.updateAllPricesBatch();
            
            log('🎉 All oracle price updates completed successfully!', colors.green);
            
            // Fetch current oracle prices AFTER updates
            log('⏳ Waiting 5 seconds for transactions to be mined...', colors.yellow);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const pricesAfter = await this.fetchCurrentOraclePrices();
            await this.displayOraclePrices(pricesAfter, 'Updated Oracle Prices (AFTER)');
            
            // Compare before and after
            log('📊 Price Update Comparison:', colors.cyan);
            for (const [pair, beforeData] of Object.entries(pricesBefore)) {
                const afterData = pricesAfter[pair];
                if (beforeData.error || afterData.error) {
                    log(`   ${pair}: ❌ Error in comparison`, colors.red);
                } else {
                    const beforeRatio = beforeData.ratio;
                    const afterRatio = afterData.ratio;
                    const change = afterRatio - beforeRatio;
                    const changePercent = beforeRatio !== 0 ? (change / beforeRatio) * 100 : 0;
                    
                    log(`   ${pair}:`, colors.blue);
                    log(`     Before: ${beforeRatio.toFixed(6)}`, colors.blue);
                    log(`     After:  ${afterRatio.toFixed(6)}`, colors.blue);
                    log(`     Change: ${change > 0 ? '+' : ''}${change.toFixed(6)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`, 
                        change > 0 ? colors.green : change < 0 ? colors.red : colors.blue);
                }
            }
            
        } catch (error) {
            log(`❌ Failed to update oracle prices: ${error.message}`, colors.red);
            throw error;
        }
    }

    async verifyPrices() {
        try {
            log('🔍 Verifying updated prices...', colors.blue);
            
            // Check P3D vs wUSDT
            const p3dWusdtPrice = await this.oracle.getPrice('P3D', TOKEN_CONFIGS.wUSDT.address);
            log(`   P3D/wUSDT: ${ethers.utils.formatEther(p3dWusdtPrice[0])}/${ethers.utils.formatEther(p3dWusdtPrice[1])}`, colors.blue);
            
            // Check P3D vs USDT
            const p3dUsdtPrice = await this.oracle.getPrice('P3D', TOKEN_CONFIGS.USDT.address);
            log(`   P3D/USDT: ${ethers.utils.formatEther(p3dUsdtPrice[0])}/${ethers.utils.formatEther(p3dUsdtPrice[1])}`, colors.blue);
            
            // Check wUSDT vs P3D
            const wusdtP3dPrice = await this.oracle.getPrice(TOKEN_CONFIGS.wUSDT.address, 'P3D');
            log(`   wUSDT/P3D: ${ethers.utils.formatEther(wusdtP3dPrice[0])}/${ethers.utils.formatEther(wusdtP3dPrice[1])}`, colors.blue);
            
            // Check USDT vs P3D
            const usdtP3dPrice = await this.oracle.getPrice(TOKEN_CONFIGS.USDT.address, 'P3D');
            log(`   USDT/P3D: ${ethers.utils.formatEther(usdtP3dPrice[0])}/${ethers.utils.formatEther(usdtP3dPrice[1])}`, colors.blue);
            
            // Check _NATIVE_ vs wUSDT
            const nativeWusdtPrice = await this.oracle.getPrice('_NATIVE_', TOKEN_CONFIGS.wUSDT.address);
            log(`   _NATIVE_/wUSDT: ${ethers.utils.formatEther(nativeWusdtPrice[0])}/${ethers.utils.formatEther(nativeWusdtPrice[1])}`, colors.blue);
            
            // Check wUSDT vs _NATIVE_
            const wusdtNativePrice = await this.oracle.getPrice(TOKEN_CONFIGS.wUSDT.address, '_NATIVE_');
            log(`   wUSDT/_NATIVE_: ${ethers.utils.formatEther(wusdtNativePrice[0])}/${ethers.utils.formatEther(wusdtNativePrice[1])}`, colors.blue);
            
            // Check _NATIVE_ vs USDT
            const nativeUsdtPrice = await this.oracle.getPrice('_NATIVE_', TOKEN_CONFIGS.USDT.address);
            log(`   _NATIVE_/USDT: ${ethers.utils.formatEther(nativeUsdtPrice[0])}/${ethers.utils.formatEther(nativeUsdtPrice[1])}`, colors.blue);
            
            // Check USDT vs _NATIVE_
            const usdtNativePrice = await this.oracle.getPrice(TOKEN_CONFIGS.USDT.address, '_NATIVE_');
            log(`   USDT/_NATIVE_: ${ethers.utils.formatEther(usdtNativePrice[0])}/${ethers.utils.formatEther(usdtNativePrice[1])}`, colors.blue);
            
            log('✅ Price verification completed', colors.green);
            
        } catch (error) {
            log(`❌ Failed to verify prices: ${error.message}`, colors.red);
            throw error;
        }
    }

    async run() {
        try {
            await this.initialize();
            await this.updateAllPrices();
            await this.verifyPrices();
            
            log('🎉 3DPass Oracle price update process completed successfully!', colors.green);
            
        } catch (error) {
            log(`❌ Oracle price update failed: ${error.message}`, colors.red);
            console.error(error);
            process.exit(1);
        }
    }
}

// Command line execution
if (require.main === module) {
    const updater = new Oracle3DPassUpdater();
    updater.run()
        .then(() => {
            log('✅ 3DPass Oracle price updater completed successfully', colors.green);
            process.exit(0);
        })
        .catch(error => {
            log(`❌ 3DPass Oracle price updater failed: ${error.message}`, colors.red);
            console.error(error);
            process.exit(1);
        });
}

module.exports = Oracle3DPassUpdater;
