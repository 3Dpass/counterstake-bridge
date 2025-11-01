#!/usr/bin/env node

/**
 * Ethereum Oracle Price Updater
 * Fetches ETH/USD and P3D/USD prices from CoinGecko and updates the Ethereum oracle contract
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
const conf = require('ocore/conf.js');

// Import Oracle ABI
const oracleJson = require('../build/contracts/Oracle.json');

// 3DPass Oracle address on Ethereum
const ORACLE_ADDRESS = '0xD69cdEF8cD89F1b47d820f4b4d7133DB66E3Fc7F';

// EVM decimals multiplier for price adjustments
const EVMdecimalsMultiplier = 1000000;

// Token addresses and configurations
const TOKEN_CONFIGS = {
    P3D: {
        symbol: 'P3D',
        coingeckoId: '3dpass',
        decimals: 18,
        P3D_PRECOMPILE: '0x0000000000000000000000000000000000000802'
    },
    ETH: {
        symbol: 'ETH',
        coingeckoId: 'ethereum',
        decimals: 18,
        usdPrice: null // Will be fetched from CoinGecko
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

class OracleEthereumUpdater {
    constructor() {
        this.oracle = null;
        this.signer = null;
        this.ethUsdPrice = null;
        this.p3dUsdPrice = null;
    }

    async initialize() {
        log('🚀 Initializing Ethereum Oracle Price Updater...', colors.cyan);
        
        try {
            // Setup provider and signer using Infura
            const infuraUrl = `https://mainnet.infura.io/v3/${conf.infura_project_id}`;
            const provider = new ethers.providers.JsonRpcProvider(infuraUrl);
            log(`✅ Connected to Ethereum network via Infura`, colors.green);
            
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

    async checkETHBalance() {
        try {
            log('💰 Checking ETH balance for signer...', colors.blue);
            
            // Get ETH balance
            const balance = await this.signer.getBalance();
            const balanceFormatted = ethers.utils.formatEther(balance);
            
            log(`   ETH Balance: ${balanceFormatted} ETH`, colors.blue);
            
            // Calculate required balance for transactions (3 price updates)
            // Using conservative gas estimates for Ethereum mainnet
            const gasLimit = ethers.BigNumber.from(200000); // Gas limit per transaction
            const gasPrice = await this.signer.getGasPrice();
            const totalRequired = gasLimit.mul(gasPrice).mul(3); // 3 transactions
            const totalRequiredFormatted = ethers.utils.formatEther(totalRequired);
            
            log(`   Required for transactions: ${totalRequiredFormatted} ETH`, colors.blue);
            
            if (balance.lt(totalRequired)) {
                const shortfall = totalRequired.sub(balance);
                const shortfallFormatted = ethers.utils.formatEther(shortfall);
                throw new Error(`Insufficient ETH balance. Need ${totalRequiredFormatted} ETH, have ${balanceFormatted} ETH. Shortfall: ${shortfallFormatted} ETH`);
            }
            
            log(`✅ Sufficient ETH balance for all transactions`, colors.green);
            return balance;
            
        } catch (error) {
            log(`❌ Failed to check ETH balance: ${error.message}`, colors.red);
            throw error;
        }
    }

    async fetchETHPrice() {
        try {
            log('📊 Fetching ETH price from CoinGecko...', colors.blue);
            const ethUsdPrice = await fetchCoingeckoExchangeRateCached('ETH', 'USD', true);
            
            this.ethUsdPrice = ethUsdPrice;
            TOKEN_CONFIGS.ETH.usdPrice = ethUsdPrice;
            
            log(`✅ ETH/USD Price: $${ethUsdPrice}`, colors.green);
            return ethUsdPrice;
        } catch (error) {
            log(`❌ Failed to fetch ETH price: ${error.message}`, colors.red);
            throw error;
        }
    }

    async fetchP3DPrice() {
        try {
            log('📊 Fetching P3D price from CoinGecko...', colors.blue);
            const rawP3dUsdPrice = await fetchCoingeckoExchangeRateCached('P3D', 'USD', true);
            
            // Apply EVM decimals multiplier adjustment
            // P3D on EVM (18 decimals) is worth 1,000,000 times more than on native chain (12 decimals)
            this.p3dUsdPrice = rawP3dUsdPrice * EVMdecimalsMultiplier;
            
            log(`✅ Raw P3D/USD Price: $${rawP3dUsdPrice}`, colors.blue);
            log(`✅ Adjusted P3D/USD Price to map 12 -> 18 decimals on EVM: $${this.p3dUsdPrice} (multiplied by ${EVMdecimalsMultiplier})`, colors.green);
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
            
            // Fetch _NATIVE_ vs P3D
            try {
                const nativeP3dPrice = await this.oracle.getPrice('_NATIVE_', 'P3D');
                prices['_NATIVE__vs_P3D'] = {
                    numerator: ethers.utils.formatEther(nativeP3dPrice[0]),
                    denominator: ethers.utils.formatEther(nativeP3dPrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(nativeP3dPrice[0])) / parseFloat(ethers.utils.formatEther(nativeP3dPrice[1]))
                };
            } catch (err) {
                prices['_NATIVE__vs_P3D'] = { error: err.message };
            }
            
            // Fetch P3D vs _NATIVE_
            try {
                const p3dNativePrice = await this.oracle.getPrice('P3D', '_NATIVE_');
                prices['P3D_vs__NATIVE_'] = {
                    numerator: ethers.utils.formatEther(p3dNativePrice[0]),
                    denominator: ethers.utils.formatEther(p3dNativePrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(p3dNativePrice[0])) / parseFloat(ethers.utils.formatEther(p3dNativePrice[1]))
                };
            } catch (err) {
                prices['P3D_vs__NATIVE_'] = { error: err.message };
            }
            
            // Fetch P3D precompile vs _NATIVE_
            try {
                const p3dPrecompileNativePrice = await this.oracle.getPrice(TOKEN_CONFIGS.P3D.P3D_PRECOMPILE, '_NATIVE_');
                prices['P3D_PRECOMPILE_vs__NATIVE_'] = {
                    numerator: ethers.utils.formatEther(p3dPrecompileNativePrice[0]),
                    denominator: ethers.utils.formatEther(p3dPrecompileNativePrice[1]),
                    ratio: parseFloat(ethers.utils.formatEther(p3dPrecompileNativePrice[0])) / parseFloat(ethers.utils.formatEther(p3dPrecompileNativePrice[1]))
                };
            } catch (err) {
                prices['P3D_PRECOMPILE_vs__NATIVE_'] = { error: err.message };
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
            
            // Get current gas price for Ethereum
            const gasPrice = await this.signer.getGasPrice();
            const gasParams = {
                gasLimit: 200000,
                gasPrice: gasPrice
            };
            
            log(`   Gas parameters: gasLimit=${gasParams.gasLimit}, gasPrice=${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei`, colors.blue);
            
            // Set price with gas parameters
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

    async updateAllPrices() {
        try {
            log('🔄 Starting oracle price updates...', colors.cyan);
            
            // Check ETH balance first
            await this.checkETHBalance();
            
            // Fetch current oracle prices BEFORE updates
            const pricesBefore = await this.fetchCurrentOraclePrices();
            await this.displayOraclePrices(pricesBefore, 'Current Oracle Prices (BEFORE)');
            
            // Fetch current ETH and P3D prices
            await this.fetchETHPrice();
            await this.fetchP3DPrice();
            
            if (!this.ethUsdPrice) {
                throw new Error('ETH price not available');
            }
            
            if (!this.p3dUsdPrice) {
                throw new Error('P3D price not available');
            }
            
            log(`📊 Price Summary:`, colors.magenta);
            log(`   ETH/USD: $${this.ethUsdPrice}`, colors.magenta);
            log(`   P3D/USD (adjusted): $${this.p3dUsdPrice} (raw price multiplied by ${EVMdecimalsMultiplier})`, colors.magenta);
            
            // Calculate price ratios
            const ethToP3d = this.ethUsdPrice / this.p3dUsdPrice;
            const p3dToEth = this.p3dUsdPrice / this.ethUsdPrice;
            
            log(`📊 Calculated Ratios (using adjusted P3D price):`, colors.magenta);
            log(`   ETH/P3D: ${ethToP3d}`, colors.magenta);
            log(`   P3D/ETH: ${p3dToEth}`, colors.magenta);
            log(`   P3D_PRECOMPILE/ETH: ${p3dToEth} (same as P3D/ETH)`, colors.magenta);
            
            // Update _NATIVE_ vs P3D (ETH vs P3D)
            await this.updateOraclePrice('_NATIVE_', 'P3D', ethToP3d, 1, '_NATIVE_ vs P3D (ETH vs P3D)');
            
            // Wait between transactions
            log('⏳ Waiting 3 seconds between transactions...', colors.yellow);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Update P3D vs _NATIVE_ (P3D vs ETH)
            await this.updateOraclePrice('P3D', '_NATIVE_', p3dToEth, 1, 'P3D vs _NATIVE_ (P3D vs ETH)');
            
            // Wait between transactions
            log('⏳ Waiting 3 seconds between transactions...', colors.yellow);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Update P3D precompile address vs _NATIVE_ (same rate as P3D vs _NATIVE_)
            await this.updateOraclePrice(TOKEN_CONFIGS.P3D.P3D_PRECOMPILE, '_NATIVE_', p3dToEth, 1, 'P3D Precompile vs _NATIVE_ (P3D Precompile vs ETH)');
            
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
            
            // Check _NATIVE_ vs P3D
            const nativeP3dPrice = await this.oracle.getPrice('_NATIVE_', 'P3D');
            log(`   _NATIVE_/P3D: ${ethers.utils.formatEther(nativeP3dPrice[0])}/${ethers.utils.formatEther(nativeP3dPrice[1])}`, colors.blue);
            
            // Check P3D vs _NATIVE_
            const p3dNativePrice = await this.oracle.getPrice('P3D', '_NATIVE_');
            log(`   P3D/_NATIVE_: ${ethers.utils.formatEther(p3dNativePrice[0])}/${ethers.utils.formatEther(p3dNativePrice[1])}`, colors.blue);
            
            // Check P3D precompile vs _NATIVE_
            const p3dPrecompileNativePrice = await this.oracle.getPrice(TOKEN_CONFIGS.P3D.P3D_PRECOMPILE, '_NATIVE_');
            log(`   P3D_PRECOMPILE/_NATIVE_: ${ethers.utils.formatEther(p3dPrecompileNativePrice[0])}/${ethers.utils.formatEther(p3dPrecompileNativePrice[1])}`, colors.blue);
            
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
            
            log('🎉 Ethereum Oracle price update process completed successfully!', colors.green);
            
        } catch (error) {
            log(`❌ Oracle price update failed: ${error.message}`, colors.red);
            console.error(error);
            process.exit(1);
        }
    }
}

// Command line execution
if (require.main === module) {
    const updater = new OracleEthereumUpdater();
    updater.run()
        .then(() => {
            log('✅ Ethereum Oracle price updater completed successfully', colors.green);
            process.exit(0);
        })
        .catch(error => {
            log(`❌ Ethereum Oracle price updater failed: ${error.message}`, colors.red);
            console.error(error);
            process.exit(1);
        });
}

module.exports = OracleEthereumUpdater;
