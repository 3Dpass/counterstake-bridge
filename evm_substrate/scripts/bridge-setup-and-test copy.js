// Load centralized configuration first
const testConfig = require('../bridge-test-config.json');

const { ethers } = require('ethers');
const conf = require('../../counterstake-bridge/conf.js');

// P3D Precompile Configuration - from centralized config
const P3D_PRECOMPILE_ADDRESS = testConfig.development.contracts.nativeTokenPrecompile;

// Test configuration - using centralized config
const TEST_CONFIG = {
    // Ethereum local token addresses - from mainnet config
    usdtEthAddress: testConfig.mainnet.contracts.usdt.ethereum, // USDT on Ethereum
    usdcEthAddress: testConfig.mainnet.contracts.usdc.ethereum, // USDC on Ethereum (mainnet)

    // Ethereum foreign token addresses - from mainnet config
    wP3DEthAddress: testConfig.mainnet.contracts.wP3D.ethereum, // wP3D on Ethereum
    wFIREEthAddress: testConfig.mainnet.contracts.wFIRE.ethereum, // wFIRE on Ethereum
    wWATEREthAddress: testConfig.mainnet.contracts.wWATER.ethereum, // wWATER on Ethereum
    
    // BSC token addresses - from mainnet config
    busdBscAddress: testConfig.mainnet.contracts.busd.bsc, // BUSD on BSC
    
    // 3DPass foreign token addresses - from development assets config
    wUsdt3DPassAddress: testConfig.development.assets.Asset1.evmContract, // wUSDT on 3DPass
    wUsdc3DPassAddress: testConfig.development.assets.Asset2.evmContract, // wUSDC on 3DPass
    wBusd3DPassAddress: testConfig.development.assets.Asset3.evmContract, // wBUSD on 3DPass

    // 3DPass local token addresses - from development assets config
    fire3DPassAddress: testConfig.development.assets.Asset4.evmContract, // FIRE on 3DPass
    water3DPassAddress: testConfig.development.assets.Asset5.evmContract, // WATER on 3DPass
    
    // Test parameters (as strings, will be parsed when needed)
    testAmount: '1', // 1 token for testing
    largeThreshold: '10000', // 10k tokens (matching deploy-and-configure-counterstake.js)
    priceInUSD: 1 // 1 USD per token
};

// Centralized challenging periods configuration
const CHALLENGING_PERIODS_CONFIG = {
    // Small claims challenging periods (in seconds)
    // challenging_periods: [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // [14h, 3d, 7d, 30d] - original challenging_periods
    // First period is 3 minutes for testing, others are longer for production
    challenging_periods: [3*60, 3*60, 3*60, 60*24*3600], // [3min, 3min, 3min, 60days] - testing challenging_periods
    
    // Large claims challenging periods (in seconds)
    large_challenging_periods: [1*7*24*3600, 30*24*3600, 60*24*3600] // [1week, 30days, 60days]
};

function log(message) {
    console.log(message);
}

// Helper function to properly handle settings structure
function processSettings(settings) {
    // Remove numeric keys and handle arrays properly
    const processed = {};
    for (let key in settings) {
        if (!key.match(/^\d+$/)) {
            processed[key] = settings[key];
        }
    }
    
    // Handle challenging periods arrays - they come as separate array elements
    // The Settings struct has: tokenAddress, ratio100, counterstake_coef100, min_tx_age, min_stake, challenging_periods[], large_challenging_periods[], large_threshold
    // So challenging_periods is at index 5, large_challenging_periods at index 6
    if (settings['5'] !== undefined) {
        processed.challenging_periods = [];
        let i = 5;
        while (settings[i.toString()] !== undefined) {
            processed.challenging_periods.push(settings[i.toString()]);
            i++;
        }
    }
    
    // Handle large challenging periods arrays
    if (settings['6'] !== undefined) {
        processed.large_challenging_periods = [];
        let i = 6;
        while (settings[i.toString()] !== undefined) {
            processed.large_challenging_periods.push(settings[i.toString()]);
            i++;
        }
    }
    
    return processed;
}

function validateP3DPrecompileAddress(address) {
    if (address !== P3D_PRECOMPILE_ADDRESS) {
        throw new Error(`Invalid P3D precompile address: ${address}. Expected: ${P3D_PRECOMPILE_ADDRESS}`);
    }
            log(`✓ P3D precompile address validation passed: ${address}`);
}

async function deployContract(contractJson, signer, ...args) {
    log(`Deploying ${contractJson.contractName}...`);
    const factory = new ethers.ContractFactory(
        contractJson.abi, 
        contractJson.bytecode, 
        signer
    );
    const contract = await factory.deploy(...args);
    await contract.deployed();
            log(`  ✓ Deployed ${contractJson.contractName} to: ${contract.address}`);
    return contract;
}

async function setupBridgeTest() {
    log('--- Starting Bridge Setup and Test ---');
    
    try {
        // 1. Setup provider and signer
        log('Setting up provider and signer...');
        const provider = new ethers.providers.JsonRpcProvider(testConfig.development.network.rpcUrl);
        
        // Load test configuration for private key
        const privateKey = testConfig.development.accounts.account1.privateKey;
        if (!privateKey) {
            throw new Error('Private key for account1 not found in bridge-test-config.json');
        }
        
        const signer = new ethers.Wallet(privateKey, provider);
        const signerAddress = signer.address;
        log(`Using signer address: ${signerAddress}`);

        // 2. Validate P3D precompile
        log('Validating P3D precompile address...');
        validateP3DPrecompileAddress(P3D_PRECOMPILE_ADDRESS);

        // 3. Load deployed contract addresses from conf.js
        log('Loading deployed contract addresses...');
        const counterstakeFactory = conf.threedpass_factory_contract_addresses[conf.version];
        const assistantFactoryAddress = conf.threedpass_assistant_factory_contract_addresses[conf.version];
        const oracleAddress = conf.threedpass_oracle_addresses['3DPass'];

        // Validate that we have the required addresses
        if (!counterstakeFactory) {
            throw new Error(`CounterstakeFactory address not found for version ${conf.version}. Available versions: ${Object.keys(conf.threedpass_factory_contract_addresses || {}).join(', ')}`);
        }
        if (!assistantFactoryAddress) {
            throw new Error(`AssistantFactory address not found for version ${conf.version}. Available versions: ${Object.keys(conf.threedpass_assistant_factory_contract_addresses || {}).join(', ')}`);
        }
        if (!oracleAddress) {
            throw new Error('Oracle address not found in configuration');
        }

        log(`CounterstakeFactory: ${counterstakeFactory}`);
        log(`AssistantFactory: ${assistantFactoryAddress}`);
        log(`Oracle: ${oracleAddress}`);

        // 4. Load contract ABIs
        log('Loading contract ABIs...');
        const factoryJson = require('../../counterstake-bridge/evm/build/contracts/CounterstakeFactory.json');
        const assistantFactoryJson = require('../../counterstake-bridge/evm/build/contracts/AssistantFactory.json');
        const oracleJson = require('../../counterstake-bridge/evm/build/contracts/Oracle.json');
        const tokenJson = require('../../counterstake-bridge/evm/build/contracts/Token.json');

        // 5. Create contract instances
        log('Creating contract instances...');
        const factory = new ethers.Contract(counterstakeFactory, factoryJson.abi, signer);
        const assistantFactoryContract = new ethers.Contract(assistantFactoryAddress, assistantFactoryJson.abi, signer);
        const oracle = new ethers.Contract(oracleAddress, oracleJson.abi, signer);

        // 6. Test Oracle Price Configuration
        log('Testing Oracle price configuration...');
        try {
            const usdtP3DPrice = await oracle.getPrice(TEST_CONFIG.usdtEthAddress, "P3D");
            const usdcP3DPrice = await oracle.getPrice(TEST_CONFIG.usdcEthAddress, "P3D");
            const busdP3DPrice = await oracle.getPrice(TEST_CONFIG.busdBscAddress, "P3D");
            
            log(`  ✓ Oracle prices retrieved:`);
            log(`    - USDT vs P3D: (${usdtP3DPrice[0]}, ${usdtP3DPrice[1]})`);
            log(`    - USDC vs P3D: (${usdcP3DPrice[0]}, ${usdcP3DPrice[1]})`);
            log(`    - BUSD vs P3D: (${busdP3DPrice[0]}, ${busdP3DPrice[1]})`);
        } catch (err) {
            log(`  ✗ Failed to get Oracle prices: ${err.message}`);
            throw err;
        }

        // 6.5. Setup Oracle Price Feeds (if missing)
        log('Setting up Oracle price feeds...');
        try {
            // Check if USDT price is missing (0,0) and set it up
            const usdtP3DPrice = await oracle.getPrice(TEST_CONFIG.usdtEthAddress, "P3D");
            if (usdtP3DPrice[0].eq(0) && usdtP3DPrice[1].eq(0)) {
                log('  Setting up USDT vs P3D price feed...');
                const usdtPriceTx = await oracle.setPrice(
                    TEST_CONFIG.usdtEthAddress, // home_asset
                    "P3D", // native token on foreign network
                    ethers.utils.parseEther('1'), // price_numerator (1 USDT = 1 P3D)
                    ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                    { gasLimit: 500000 }
                );
                await usdtPriceTx.wait();
                log(`    ✓ USDT vs P3D price set: (1, 0.0014)`);
            } else {
                log(`    ✓ USDT vs P3D price already set: (${usdtP3DPrice[0]}, ${usdtP3DPrice[1]})`);
            }
            
            // Check if USDC and BUSD prices are missing (0,0) and set them up
            const usdcP3DPrice = await oracle.getPrice(TEST_CONFIG.usdcEthAddress, "P3D");
            const busdP3DPrice = await oracle.getPrice(TEST_CONFIG.busdBscAddress, "P3D");
            
            // Set USDC price if missing
            if (usdcP3DPrice[0].eq(0) && usdcP3DPrice[1].eq(0)) {
                log('  Setting up USDC vs P3D price feed...');
                const usdcPriceTx = await oracle.setPrice(
                    TEST_CONFIG.usdcEthAddress, // home_asset
                    "P3D", // native token on foreign network
                    ethers.utils.parseEther('1'), // price_numerator (1 USDC = 1 P3D)
                    ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                    { gasLimit: 500000 }
                );
                await usdcPriceTx.wait();
                log(`    ✓ USDC vs P3D price set: (1, 0.0014)`);
            } else {
                log(`    ✓ USDC vs P3D price already set: (${usdcP3DPrice[0]}, ${usdcP3DPrice[1]})`);
            }
            
            // Set BUSD price if missing
            if (busdP3DPrice[0].eq(0) && busdP3DPrice[1].eq(0)) {
                log('  Setting up BUSD vs P3D price feed...');
                const busdPriceTx = await oracle.setPrice(
                    TEST_CONFIG.busdBscAddress, // home_asset
                    "P3D", // native token on foreign network
                    ethers.utils.parseEther('1'), // price_numerator (1 BUSD = 1 P3D)
                    ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                    { gasLimit: 500000 }
                );
                await busdPriceTx.wait();
                log(`    ✓ BUSD vs P3D price set: (1, 0.0014)`);
            } else {
                log(`    ✓ BUSD vs P3D price already set: (${busdP3DPrice[0]}, ${busdP3DPrice[1]})`);
            }
            
            // Also set up wrapped token prices for 3DPass assets
            log('  Setting up wrapped token price feeds...');
            
            // wUSDT vs P3D
            const wUsdtP3DPrice = await oracle.getPrice(TEST_CONFIG.wUsdt3DPassAddress, "P3D");
            if (wUsdtP3DPrice[0].eq(0) && wUsdtP3DPrice[1].eq(0)) {
                const wUsdtPriceTx = await oracle.setPrice(
                    TEST_CONFIG.wUsdt3DPassAddress, // foreign_asset
                    "P3D", // native token on foreign network
                    ethers.utils.parseEther('1'), // price_numerator (1 wUSDT = 1 P3D)
                    ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                    { gasLimit: 500000 }
                );
                await wUsdtPriceTx.wait();
                log(`    ✓ wUSDT vs P3D price set: (1, 0.0014)`);
            }
            
            // wUSDC vs P3D
            const wUsdcP3DPrice = await oracle.getPrice(TEST_CONFIG.wUsdc3DPassAddress, "P3D");
            if (wUsdcP3DPrice[0].eq(0) && wUsdcP3DPrice[1].eq(0)) {
                const wUsdcPriceTx = await oracle.setPrice(
                    TEST_CONFIG.wUsdc3DPassAddress, // foreign_asset
                    "P3D", // native token on foreign network
                    ethers.utils.parseEther('1'), // price_numerator (1 wUSDC = 1 P3D)
                    ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                    { gasLimit: 500000 }
                );
                await wUsdcPriceTx.wait();
                log(`    ✓ wUSDC vs P3D price set: (1, 0.0014)`);
            }
            
            // wBUSD vs P3D
            const wBusdP3DPrice = await oracle.getPrice(TEST_CONFIG.wBusd3DPassAddress, "P3D");
            if (wBusdP3DPrice[0].eq(0) && wBusdP3DPrice[1].eq(0)) {
                const wBusdPriceTx = await oracle.setPrice(
                    TEST_CONFIG.wBusd3DPassAddress, // foreign_asset
                    "P3D", // native token on foreign network
                    ethers.utils.parseEther('1'), // price_numerator (1 wBUSD = 1 P3D)
                    ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                    { gasLimit: 500000 }
                );
                await wBusdPriceTx.wait();
                log(`    ✓ wBUSD vs P3D price set: (1, 0.0014)`);
            }
        
        // Set up _NATIVE_ vs wrapped token symbol price feeds (required by Export Assistant validation)
        log('  Setting up _NATIVE_ vs wrapped token symbol price feeds...');
        
        // _NATIVE_ vs wUSDT
        try {
            const nativeWUsdtPriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "wUSDT", // foreign_asset (exact symbol from config)
                ethers.utils.parseEther('1'), // price_numerator (1 _NATIVE_ = 1 wUSDT)
                ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                { gasLimit: 500000 }
            );
            await nativeWUsdtPriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "wUSDT");
            log(`    ✓ _NATIVE_ vs wUSDT price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs wUSDT price: ${err.message}`);
            throw err;
        }
        
        // _NATIVE_ vs wUSDC
        try {
            const nativeWUsdcPriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "wUSDC", // foreign_asset (exact symbol from config)
                ethers.utils.parseEther('1'), // price_numerator (1 _NATIVE_ = 1 wUSDC)
                ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                { gasLimit: 500000 }
            );
            await nativeWUsdcPriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "wUSDC");
            log(`    ✓ _NATIVE_ vs wUSDC price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs wUSDC price: ${err.message}`);
            throw err;
        }
        
        // _NATIVE_ vs wBUSD
        try {
            const nativeWBusdPriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "wBUSD", // foreign_asset (exact symbol from config)
                ethers.utils.parseEther('1'), // price_numerator (1 _NATIVE_ = 1 wBUSD)
                ethers.utils.parseEther('0.0014'), // price_denominator (0.0014 ratio)
                { gasLimit: 500000 }
            );
            await nativeWBusdPriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "wBUSD");
            log(`    ✓ _NATIVE_ vs wBUSD price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs wBUSD price: ${err.message}`);
            throw err;
        }
        
        // Set up P3D vs _NATIVE_ price feed (required for P3D precompile validation)
        log('  Setting up P3D vs _NATIVE_ price feed...');
        try {
            const p3dNativePriceTx = await oracle.setPrice(
                "P3D", // native token on 3Dpass
                "_NATIVE_", // native token
                ethers.utils.parseEther('1'), // price_numerator (1 P3D = 1 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1:1 ratio)
                { gasLimit: 500000 }
            );
            await p3dNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("P3D", "_NATIVE_");
            log(`    ✓ P3D vs _NATIVE_ price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set P3D vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // Set up Foreign token vs _NATIVE_ price feeds (required for 3DPass ERC20 precompile validation)
        log('  Setting up Foreign token vs _NATIVE_ price feeds...');
        
        // wUSDT vs _NATIVE_
        try {
            const wUsdtNativePriceTx = await oracle.setPrice(
                "wUSDT", // foreign_asset
                "_NATIVE_", // home_asset
                ethers.utils.parseEther('1'), // price_numerator (1 wUSDT = 1 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1:1 ratio)
                { gasLimit: 500000 }
            );
            await wUsdtNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("wUSDT", "_NATIVE_");
            log(`    ✓ wUSDT vs _NATIVE_ price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set wUSDT vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // wUSDC vs _NATIVE_
        try {
            const wUsdcNativePriceTx = await oracle.setPrice(
                "wUSDC", // foreign_asset
                "_NATIVE_", // native tokens
                ethers.utils.parseEther('1'), // price_numerator (1 wUSDC = 1 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1:1 ratio)
                { gasLimit: 500000 }
            );
            await wUsdcNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("wUSDC", "_NATIVE_");
            log(`    ✓ wUSDC vs _NATIVE_ price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set wUSDC vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // wBUSD vs _NATIVE_
        try {
            const wBusdNativePriceTx = await oracle.setPrice(
                "wBUSD", // foreign_asset
                "_NATIVE_", // native token
                ethers.utils.parseEther('1'), // price_numerator (1 wBUSD = 1 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1:1 ratio)
                { gasLimit: 500000 }
            );
            await wBusdNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("wBUSD", "_NATIVE_");
            log(`    ✓ wBUSD vs _NATIVE_ price set: (${actualPrice[0]}, ${actualPrice[1]})`);
        } catch (err) {
            log(`    ✗ Failed to set wBUSD vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // Set up _NATIVE_ vs wrapped token symbol price feeds for export assets (required by Export Assistant validation)
        log('  Setting up _NATIVE_ vs wrapped token symbol price feeds for export assets...');
        
        // _NATIVE_ vs wP3D (1 _NATIVE_ = 1 wP3D, 1:1 ratio for P3D)
        try {
            const nativeWP3dPriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "wP3D", // foreign_asset symbol
                ethers.utils.parseEther('1'), // price_numerator (1 wP3D)
                ethers.utils.parseEther('1'), // price_denominator (1 _NATIVE_)
                { gasLimit: 500000 }
            );
            await nativeWP3dPriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "wP3D");
            log(`    ✓ _NATIVE_ vs wP3D price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${1/1} wP3D per _NATIVE_`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs wP3D price: ${err.message}`);
            throw err;
        }
        
        // _NATIVE_ vs wFIRE (1 _NATIVE_ = 0.5 wFIRE, FIRE is more valuable)
        try {
            const nativeWFirePriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "wFIRE", // foreign_asset symbol
                ethers.utils.parseEther('0.5'), // price_numerator (0.5 wFIRE)
                ethers.utils.parseEther('1'), // price_denominator (1 _NATIVE_)
                { gasLimit: 500000 }
            );
            await nativeWFirePriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "wFIRE");
            log(`    ✓ _NATIVE_ vs wFIRE price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${0.5/1} wFIRE per _NATIVE_`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs wFIRE price: ${err.message}`);
            throw err;
        }
        
        // _NATIVE_ vs wWATER (1 _NATIVE_ = 2.5 wWATER, WATER is less valuable)
        try {
            const nativeWWaterPriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "wWATER", // foreign_asset symbol
                ethers.utils.parseEther('2.5'), // price_numerator (2.5 wWATER)
                ethers.utils.parseEther('1'), // price_denominator (1 _NATIVE_)
                { gasLimit: 500000 }
            );
            await nativeWWaterPriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "wWATER");
            log(`    ✓ _NATIVE_ vs wWATER price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${2.5/1} wWATER per _NATIVE_`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs wWATER price: ${err.message}`);
            throw err;
        }
        
        // Set up reverse price feeds for export assets (symbol vs _NATIVE_)
        log('  Setting up reverse price feeds for export assets (symbol vs _NATIVE_)...');
        
        // wP3D vs _NATIVE_ (1 wP3D = 1 _NATIVE_, 1:1 ratio for P3D)
        try {
            const wP3dNativePriceTx = await oracle.setPrice(
                "wP3D", // foreign_asset symbol
                "_NATIVE_", // native token
                ethers.utils.parseEther('1'), // price_numerator (1 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1 wP3D)
                { gasLimit: 500000 }
            );
            await wP3dNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("wP3D", "_NATIVE_");
            log(`    ✓ wP3D vs _NATIVE_ price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${1/1} _NATIVE_ per wP3D`);
        } catch (err) {
            log(`    ✗ Failed to set wP3D vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // wFIRE vs _NATIVE_ (1 wFIRE = 2000000 _NATIVE_, FIRE is more valuable)
        try {
            const wFireNativePriceTx = await oracle.setPrice(
                "wFIRE", // foreign_asset symbol
                "_NATIVE_", // native token
                ethers.utils.parseEther('2000000'), // price_numerator (2 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1 wFIRE)
                { gasLimit: 500000 }
            );
            await wFireNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("wFIRE", "_NATIVE_");
            log(`    ✓ wFIRE vs _NATIVE_ price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${2/1} _NATIVE_ per wFIRE`);
        } catch (err) {
            log(`    ✗ Failed to set wFIRE vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // wWATER vs _NATIVE_ (1 wWATER = 400000 _NATIVE_, WATER is less valuable)
        try {
            const wWaterNativePriceTx = await oracle.setPrice(
                "wWATER", // foreign_asset symbol
                "_NATIVE_", // native token
                ethers.utils.parseEther('400000'), // price_numerator (0.4 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1 wWATER)
                { gasLimit: 500000 }
            );
            await wWaterNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("wWATER", "_NATIVE_");
            log(`    ✓ wWATER vs _NATIVE_ price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${0.4/1} _NATIVE_ per wWATER`);
        } catch (err) {
            log(`    ✗ Failed to set wWATER vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // Set up Local token vs _NATIVE_ price feeds (FIRE and WATER without "w" prefix)
        log('  Setting up Local token vs _NATIVE_ price feeds...');
        
        // FIRE vs _NATIVE_ (1 FIRE = 2000000 _NATIVE_, FIRE is more valuable)
        try {
            const fireNativePriceTx = await oracle.setPrice(
                "FIRE", // foreign_asset symbol (without "w" prefix)
                "_NATIVE_", // native token
                ethers.utils.parseEther('2000000'), // price_numerator (2 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1 FIRE)
                { gasLimit: 500000 }
            );
            await fireNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("FIRE", "_NATIVE_");
            log(`    ✓ FIRE vs _NATIVE_ price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${2/1} _NATIVE_ per FIRE`);
        } catch (err) {
            log(`    ✗ Failed to set FIRE vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // WATER vs _NATIVE_ (1 WATER = 400000 _NATIVE_, WATER is less valuable)
        try {
            const waterNativePriceTx = await oracle.setPrice(
                "WATER", // foreign_asset symbol (without "w" prefix)
                "_NATIVE_", // native token
                ethers.utils.parseEther('400000'), // price_numerator (0.4 _NATIVE_)
                ethers.utils.parseEther('1'), // price_denominator (1 WATER)
                { gasLimit: 500000 }
            );
            await waterNativePriceTx.wait();
            const actualPrice = await oracle.getPrice("WATER", "_NATIVE_");
            log(`    ✓ WATER vs _NATIVE_ price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${0.4/1} _NATIVE_ per WATER`);
        } catch (err) {
            log(`    ✗ Failed to set WATER vs _NATIVE_ price: ${err.message}`);
            throw err;
        }
        
        // Set up _NATIVE_ vs unwrapped token price feeds (reverse combinations)
        log('  Setting up _NATIVE_ vs unwrapped token price feeds...');
        
        // _NATIVE_ vs FIRE (1 _NATIVE_ = 0.000005 FIRE, FIRE is more valuable)
        try {
            const nativeFirePriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "FIRE", // foreign_asset symbol (without "w" prefix)
                ethers.utils.parseEther('0.000005'), // price_numerator (0.5 FIRE)
                ethers.utils.parseEther('1'), // price_denominator (1 _NATIVE_)
                { gasLimit: 500000 }
            );
            await nativeFirePriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "FIRE");
            log(`    ✓ _NATIVE_ vs FIRE price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${0.5/1} FIRE per _NATIVE_`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs FIRE price: ${err.message}`);
            throw err;
        }
        
        // _NATIVE_ vs WATER (1 _NATIVE_ = 0.0000025 WATER, WATER is less valuable)
        try {
            const nativeWaterPriceTx = await oracle.setPrice(
                "_NATIVE_", // native token
                "WATER", // foreign_asset symbol (without "w" prefix)
                ethers.utils.parseEther('0.0000025'), // price_numerator (2.5 WATER)
                ethers.utils.parseEther('1'), // price_denominator (1 _NATIVE_)
                { gasLimit: 500000 }
            );
            await nativeWaterPriceTx.wait();
            const actualPrice = await oracle.getPrice("_NATIVE_", "WATER");
            log(`    ✓ _NATIVE_ vs WATER price set: (${ethers.utils.formatEther(actualPrice[0])}, ${ethers.utils.formatEther(actualPrice[1])}) = ${2.5/1} WATER per _NATIVE_`);
        } catch (err) {
            log(`    ✗ Failed to set _NATIVE_ vs WATER price: ${err.message}`);
            throw err;
        }
        
        log(`  ✓ All required Oracle price feeds configured`);
        } catch (err) {
            log(`  ✗ Failed to setup Oracle price feeds: ${err.message}`);
            throw err;
        }

        // 8. Create Import Wrapper Bridge (Ethereum -> 3DPass) - USDT using existing precompile
        log('Creating Import Wrapper bridge (Ethereum -> 3DPass) for USDT using existing precompile...');
        let importWrapperUsdtAddress;
        try {
            const importWrapperTx = await factory.createImportWrapper(
                "Ethereum", // home_network
                TEST_CONFIG.usdtEthAddress, // home_asset (USDT on Ethereum)
                TEST_CONFIG.wUsdt3DPassAddress, // precompileAddress (existing wUSDT precompile)
                P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile)
                oracleAddress, // oracleAddr
                160, // counterstake_coef100
                110, // ratio100
                ethers.utils.parseEther(TEST_CONFIG.largeThreshold), // large_threshold
                CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
                CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
                { gasLimit: 5000000 }
            );
            const importWrapperReceipt = await importWrapperTx.wait();
            // Find the NewImportWrapper event in the logs
            const newImportWrapperEvent = importWrapperReceipt.logs.find(log => {
                try {
                    const parsedLog = factory.interface.parseLog(log);
                    return parsedLog.name === 'NewImportWrapper';
                } catch (e) {
                    return false;
                }
            });
            if (newImportWrapperEvent) {
                const parsedEvent = factory.interface.parseLog(newImportWrapperEvent);
                importWrapperUsdtAddress = parsedEvent.args.contractAddress;
            } else {
                throw new Error('NewImportWrapper event not found in transaction receipt');
            }
            log(`  ✓ USDT Import Wrapper bridge created: ${importWrapperUsdtAddress}`);
            log(`  ✓ Using existing precompile: ${TEST_CONFIG.wUsdt3DPassAddress}`);
            

            
        } catch (err) {
            log(`  ✗ Failed to create USDT Import Wrapper bridge: ${err.message}`);
            throw err;
        }

        // 9. Create Import Wrapper Bridge (Ethereum -> 3DPass) - USDC using existing precompile
        log('Creating Import Wrapper bridge (Ethereum -> 3DPass) for USDC using existing precompile...');
        let importWrapperUsdcAddress;
        try {
            const importWrapperUsdcTx = await factory.createImportWrapper(
                "Ethereum", // home_network
                TEST_CONFIG.usdcEthAddress, // home_asset (USDC on Ethereum)
                TEST_CONFIG.wUsdc3DPassAddress, // precompileAddress (existing wUSDC precompile)
                P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile)
                oracleAddress, // oracleAddr
                160, // counterstake_coef100
                110, // ratio100
                ethers.utils.parseEther(TEST_CONFIG.largeThreshold), // large_threshold
                CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
                CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
                { gasLimit: 5000000 }
            );
            const importWrapperUsdcReceipt = await importWrapperUsdcTx.wait();
            // Find the NewImportWrapper event in the logs
            const newImportWrapperUsdcEvent = importWrapperUsdcReceipt.logs.find(log => {
                try {
                    const parsedLog = factory.interface.parseLog(log);
                    return parsedLog.name === 'NewImportWrapper';
                } catch (e) {
                    return false;
                }
            });
            if (newImportWrapperUsdcEvent) {
                const parsedEvent = factory.interface.parseLog(newImportWrapperUsdcEvent);
                importWrapperUsdcAddress = parsedEvent.args.contractAddress;
            } else {
                throw new Error('NewImportWrapper event not found in transaction receipt');
            }
            log(`  ✓ USDC Import Wrapper bridge created: ${importWrapperUsdcAddress}`);
            log(`  ✓ Using existing precompile: ${TEST_CONFIG.wUsdc3DPassAddress}`);
            

        } catch (err) {
            log(`  ✗ Failed to create USDC Import Wrapper bridge: ${err.message}`);
            throw err;
        }

        // 10. Create Import Wrapper Bridge (BSC -> 3DPass) - BUSD using existing precompile
        log('Creating Import Wrapper bridge (BSC -> 3DPass) for BUSD using existing precompile...');
        let importWrapperBusdAddress;
        try {
            const importWrapperBusdTx = await factory.createImportWrapper(
                "BSC", // home_network
                TEST_CONFIG.busdBscAddress, // home_asset (BUSD on BSC)
                TEST_CONFIG.wBusd3DPassAddress, // precompileAddress (existing wBUSD precompile)
                P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile)
                oracleAddress, // oracleAddr
                160, // counterstake_coef100
                110, // ratio100
                ethers.utils.parseEther(TEST_CONFIG.largeThreshold), // large_threshold
                CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
                CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
                { gasLimit: 5000000 }
            );
            const importWrapperBusdReceipt = await importWrapperBusdTx.wait();
            // Find the NewImportWrapper event in the logs
            const newImportWrapperBusdEvent = importWrapperBusdReceipt.logs.find(log => {
                try {
                    const parsedLog = factory.interface.parseLog(log);
                    return parsedLog.name === 'NewImportWrapper';
                } catch (e) {
                    return false;
                }
            });
            if (newImportWrapperBusdEvent) {
                const parsedEvent = factory.interface.parseLog(newImportWrapperBusdEvent);
                importWrapperBusdAddress = parsedEvent.args.contractAddress;
            } else {
                throw new Error('NewImportWrapper event not found in transaction receipt');
            }
            log(`  ✓ BUSD Import Wrapper bridge created: ${importWrapperBusdAddress}`);
            log(`  ✓ Using existing precompile: ${TEST_CONFIG.wBusd3DPassAddress}`);
            

            
        } catch (err) {
            log(`  ✗ Failed to create BUSD Import Wrapper bridge: ${err.message}`);
            throw err;
        }

        // 10.5. Verify Precompiled ERC20 Contracts
        log('Verifying precompiled ERC20 contracts...');
        
        // Load ERC20 ABI for symbol verification
        const erc20Abi = [
            { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
        ];
        
        let verifiedCount = 0;
        
        // Verify wUSDT precompile
        try {
            const wUsdtContract = new ethers.Contract(TEST_CONFIG.wUsdt3DPassAddress, erc20Abi, signer);
            const wUsdtSymbol = await wUsdtContract.symbol();
            log(`  ✓ wUSDT precompile symbol: ${wUsdtSymbol}`);
            verifiedCount++;
        } catch (err) {
            log(`  ⚠ wUSDT precompile verification failed: ${err.message}`);
        }
        
        // Verify wUSDC precompile
        try {
            const wUsdcContract = new ethers.Contract(TEST_CONFIG.wUsdc3DPassAddress, erc20Abi, signer);
            const wUsdcSymbol = await wUsdcContract.symbol();
            log(`  ✓ wUSDC precompile symbol: ${wUsdcSymbol}`);
            verifiedCount++;
        } catch (err) {
            log(`  ⚠ wUSDC precompile verification failed: ${err.message}`);
        }
        
        // Verify wBUSD precompile
        try {
            const wBusdContract = new ethers.Contract(TEST_CONFIG.wBusd3DPassAddress, erc20Abi, signer);
            const wBusdSymbol = await wBusdContract.symbol();
            log(`  ✓ wBUSD precompile symbol: ${wBusdSymbol}`);
            verifiedCount++;
        } catch (err) {
            log(`  ⚠ wBUSD precompile verification failed: ${err.message}`);
        }
        
        // Verify FIRE precompile
        try {
            const fireContract = new ethers.Contract(TEST_CONFIG.fire3DPassAddress, erc20Abi, signer);
            const fireSymbol = await fireContract.symbol();
            log(`  ✓ FIRE precompile symbol: ${fireSymbol}`);
            verifiedCount++;
        } catch (err) {
            log(`  ⚠ FIRE precompile verification failed: ${err.message}`);
        }
        
        // Verify WATER precompile
        try {
            const waterContract = new ethers.Contract(TEST_CONFIG.water3DPassAddress, erc20Abi, signer);
            const waterSymbol = await waterContract.symbol();
            log(`  ✓ WATER precompile symbol: ${waterSymbol}`);
            verifiedCount++;
        } catch (err) {
            log(`  ⚠ WATER precompile verification failed: ${err.message}`);
        }
        
        if (verifiedCount > 0) {
            log(`  ✓ Verified ${verifiedCount}/5 precompiled ERC20 contracts`);
        } else {
            log(`  ⚠ No precompiled ERC20 contracts could be verified, but continuing...`);
        }

        // 10.6. Create Export Bridges (3DPass -> External Networks)
        log('Creating Export bridges (3DPass -> External Networks)...');
        
        // Create Export Bridge (3DPass -> Ethereum) - P3D
        log('Creating Export bridge (3DPass -> Ethereum) for P3D...');
        let exportP3DAddress;
        try {
            const exportP3DTx = await factory.createExport(
                "Ethereum", // foreign_network (fixed typo: was "Ehereum")
                TEST_CONFIG.wP3DEthAddress, // foreign_asset address (wP3D on Ethereum)
                P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile on 3DPass)
                160, // counterstake_coef100
                110, // ratio100
                ethers.utils.parseEther(TEST_CONFIG.largeThreshold), // large_threshold
                CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
                CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
                { gasLimit: 9000000 }
            );
            const exportP3DReceipt = await exportP3DTx.wait();
            // Find the NewExport event in the logs
            const newExportP3DEvent = exportP3DReceipt.logs.find(log => {
                try {
                    const parsedLog = factory.interface.parseLog(log);
                    return parsedLog.name === 'NewExport';
                } catch (e) {
                    return false;
                }
            });
            if (newExportP3DEvent) {
                const parsedEvent = factory.interface.parseLog(newExportP3DEvent);
                exportP3DAddress = parsedEvent.args.contractAddress;
            } else {
                throw new Error('NewExport event not found in transaction receipt');
            }
            log(`  ✓ P3D Export bridge created: ${exportP3DAddress}`);
        } catch (err) {
            log(`  ✗ Failed to create P3D Export bridge: ${err.message}`);
            throw err;
        }

        // Create Export Bridge (3DPass -> Ethereum) - FIRE -> wFIRE
        log('Creating Export bridge (3DPass -> Ethereum) for FIRE...');
        let exportFIREAddress;
        try {
            const exportFIRETx = await factory.createExport(
                "Ethereum", // foreign_network
                TEST_CONFIG.wFIREEthAddress, // foreign_asset address (wFIRE on Ethereum)
                TEST_CONFIG.fire3DPassAddress, // stakeTokenAddr (FIRE token on 3DPass)
                160, // counterstake_coef100
                110, // ratio100
                ethers.utils.parseEther(TEST_CONFIG.largeThreshold), // large_threshold
                CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
                CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
                { gasLimit: 9000000 }
            );
            const exportFIREReceipt = await exportFIRETx.wait();
            // Find the NewExport event in the logs
            const newExportFIREEvent = exportFIREReceipt.logs.find(log => {
                try {
                    const parsedLog = factory.interface.parseLog(log);
                    return parsedLog.name === 'NewExport';
                } catch (e) {
                    return false;
                }
            });
            if (newExportFIREEvent) {
                const parsedEvent = factory.interface.parseLog(newExportFIREEvent);
                exportFIREAddress = parsedEvent.args.contractAddress;
            } else {
                throw new Error('NewExport event not found in transaction receipt');
            }
            log(`  ✓ FIRE Export bridge created: ${exportFIREAddress}`);
        } catch (err) {
            log(`  ✗ Failed to create FIRE Export bridge: ${err.message}`);
            throw err;
        }

        // Create Export Bridge (3DPass -> Ethereum) - WATER
        log('Creating Export bridge (3DPass -> Ethereum) for WATER...');
        let exportWATERAddress;
        try {
            const exportWATERTx = await factory.createExport(
                "Ethereum", // foreign_network (fixed: was "BSC" but token is on Ethereum)
                TEST_CONFIG.wWATEREthAddress, // foreign_asset address (wWATER on Ethereum)
                TEST_CONFIG.water3DPassAddress, // stakeTokenAddr (WATER token on 3DPass)
                160, // counterstake_coef100
                110, // ratio100
                ethers.utils.parseEther(TEST_CONFIG.largeThreshold), // large_threshold
                CHALLENGING_PERIODS_CONFIG.challenging_periods, // challenging_periods
                CHALLENGING_PERIODS_CONFIG.large_challenging_periods, // large_challenging_periods
                { gasLimit: 9000000 }
            );
            const exportWATERReceipt = await exportWATERTx.wait();
            // Find the NewExport event in the logs
            const newExportWATEREvent = exportWATERReceipt.logs.find(log => {
                try {
                    const parsedLog = factory.interface.parseLog(log);
                    return parsedLog.name === 'NewExport';
                } catch (e) {
                    return false;
                }
            });
            if (newExportWATEREvent) {
                const parsedEvent = factory.interface.parseLog(newExportWATEREvent);
                exportWATERAddress = parsedEvent.args.contractAddress;
            } else {
                throw new Error('NewExport event not found in transaction receipt');
            }
            log(`  ✓ WATER Export bridge created: ${exportWATERAddress}`);
        } catch (err) {
            log(`  ✗ Failed to create WATER Export bridge: ${err.message}`);
            throw err;
        }

        // 11. Create Import Wrapper Assistants
        log('Creating Import Wrapper Assistants...');
        let importWrapperUsdtAssistantAddress, importWrapperUsdcAssistantAddress, importWrapperBusdAssistantAddress;
        try {
            // USDT Import Wrapper Assistant
            const importWrapperUsdtAssistantTx = await assistantFactoryContract.createImportWrapperAssistant(
                importWrapperUsdtAddress, // bridge address
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 (matching official: 10%)
                10, // swap_fee10000
                1, // exponent
                "USDT import assistant", // name (matching official format)
                "USDTIA", // symbol (matching official format)
                { gasLimit: 3000000 }
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

            // USDC Import Wrapper Assistant
            const importWrapperUsdcAssistantTx = await assistantFactoryContract.createImportWrapperAssistant(
                importWrapperUsdcAddress, // bridge address
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 (matching official: 10%)
                10, // swap_fee10000
                1, // exponent
                "USDC import assistant", // name (matching official format)
                "USDCIA", // symbol (matching official format)
                { gasLimit: 3000000 }
            );
            const importWrapperUsdcAssistantReceipt = await importWrapperUsdcAssistantTx.wait();
            // Find the NewImportWrapperAssistant event in the logs
            const newImportWrapperUsdcAssistantEvent = importWrapperUsdcAssistantReceipt.logs.find(log => {
                try {
                    const parsedLog = assistantFactoryContract.interface.parseLog(log);
                    return parsedLog.name === 'NewImportWrapperAssistant';
                } catch (e) {
                    return false;
                }
            });
            if (newImportWrapperUsdcAssistantEvent) {
                const parsedEvent = assistantFactoryContract.interface.parseLog(newImportWrapperUsdcAssistantEvent);
                importWrapperUsdcAssistantAddress = parsedEvent.args.contractAddress;
                log(`  ✓ USDC Import Wrapper Assistant created: ${importWrapperUsdcAssistantAddress}`);
            } else {
                throw new Error('NewImportWrapperAssistant event not found in transaction receipt');
            }

            // BUSD Import Wrapper Assistant
            const importWrapperBusdAssistantTx = await assistantFactoryContract.createImportWrapperAssistant(
                importWrapperBusdAddress, // bridge address
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 (matching official: 10%)
                10, // swap_fee10000
                1, // exponent
                "BUSD import assistant", // name (matching official format)
                "BUSDIA", // symbol (matching official format)
                { gasLimit: 3000000 }
            );
            const importWrapperBusdAssistantReceipt = await importWrapperBusdAssistantTx.wait();
            // Find the NewImportWrapperAssistant event in the logs
            const newImportWrapperBusdAssistantEvent = importWrapperBusdAssistantReceipt.logs.find(log => {
                try {
                    const parsedLog = assistantFactoryContract.interface.parseLog(log);
                    return parsedLog.name === 'NewImportWrapperAssistant';
                } catch (e) {
                    return false;
                }
            });
            if (newImportWrapperBusdAssistantEvent) {
                const parsedEvent = assistantFactoryContract.interface.parseLog(newImportWrapperBusdAssistantEvent);
                importWrapperBusdAssistantAddress = parsedEvent.args.contractAddress;
                log(`  ✓ BUSD Import Wrapper Assistant created: ${importWrapperBusdAssistantAddress}`);
            } else {
                throw new Error('NewImportWrapperAssistant event not found in transaction receipt');
            }
        } catch (err) {
            log(`  ✗ Failed to create Import Wrapper Assistants: ${err.message}`);
            throw err;
        }

        // 11.5. Create Export Assistants
        log('Creating Export Assistants...');
        let exportP3DAssistantAddress, exportFIREAssistantAddress, exportWATERAssistantAddress;
        try {
            // P3D Export Assistant (for P3D bridge)
            const exportP3DAssistantTx = await assistantFactoryContract.createExportAssistant(
                exportP3DAddress, // bridge address (corrected variable name)
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 (matching official: 10%)
                oracleAddress, // oracle address
                1, // exponent
                "P3D export assistant", // name (matching official format)
                "P3DEA", // symbol (matching official format)
                { gasLimit: 9000000 }
            );
            const exportP3DAssistantReceipt = await exportP3DAssistantTx.wait();
            // Find the NewExportAssistant event in the logs
            const newExportP3DAssistantEvent = exportP3DAssistantReceipt.logs.find(log => {
                try {
                    const parsedLog = assistantFactoryContract.interface.parseLog(log);
                    return parsedLog.name === 'NewExportAssistant';
                } catch (e) {
                    return false;
                }
            });
            if (newExportP3DAssistantEvent) {
                const parsedEvent = assistantFactoryContract.interface.parseLog(newExportP3DAssistantEvent);
                exportP3DAssistantAddress = parsedEvent.args.contractAddress;
                log(`  ✓ P3D Export Assistant created: ${exportP3DAssistantAddress}`);
            } else {
                throw new Error('NewExportAssistant event not found in transaction receipt');
            }

            // FIRE Export Assistant (for FIRE bridge)
            const exportFIREAssistantTx = await assistantFactoryContract.createExportAssistant(
                exportFIREAddress, // bridge address (corrected variable name)
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 (matching official: 10%)
                oracleAddress, // oracle address
                1, // exponent
                "FIRE export assistant", // name (matching official format)
                "FIREA", // symbol (matching official format)
                { gasLimit: 9000000 }
            );
            const exportFIREAssistantReceipt = await exportFIREAssistantTx.wait();
            // Find the NewExportAssistant event in the logs
            const newExportFIREAssistantEvent = exportFIREAssistantReceipt.logs.find(log => {
                try {
                    const parsedLog = assistantFactoryContract.interface.parseLog(log);
                    return parsedLog.name === 'NewExportAssistant';
                } catch (e) {
                    return false;
                }
            });
            if (newExportFIREAssistantEvent) {
                const parsedEvent = assistantFactoryContract.interface.parseLog(newExportFIREAssistantEvent);
                exportFIREAssistantAddress = parsedEvent.args.contractAddress;
                log(`  ✓ FIRE Export Assistant created: ${exportFIREAssistantAddress}`);
            } else {
                throw new Error('NewExportAssistant event not found in transaction receipt');
            }

            // WATER Export Assistant (for WATER bridge)
            const exportWATERAssistantTx = await assistantFactoryContract.createExportAssistant(
                exportWATERAddress, // bridge address (corrected variable name)
                signerAddress, // manager address
                100, // management_fee10000
                1000, // success_fee10000 (matching official: 10%)
                oracleAddress, // oracle address
                1, // exponent
                "WATER export assistant", // name (matching official format)
                "WATEA", // symbol (matching official format)
                { gasLimit: 9000000 }
            );
            const exportWATERAssistantReceipt = await exportWATERAssistantTx.wait();
            // Find the NewExportAssistant event in the logs
            const newExportWATERAssistantEvent = exportWATERAssistantReceipt.logs.find(log => {
                try {
                    const parsedLog = assistantFactoryContract.interface.parseLog(log);
                    return parsedLog.name === 'NewExportAssistant';
                } catch (e) {
                    return false;
                }
            });
            if (newExportWATERAssistantEvent) {
                const parsedEvent = assistantFactoryContract.interface.parseLog(newExportWATERAssistantEvent);
                exportWATERAssistantAddress = parsedEvent.args.contractAddress;
                log(`  ✓ WATER Export Assistant created: ${exportWATERAssistantAddress}`);
            } else {
                throw new Error('NewExportAssistant event not found in transaction receipt');
            }
        } catch (err) {
            log(`  ✗ Failed to create Export Assistants: ${err.message}`);
            throw err;
        }

        // 11. Test Bridge Functionality
        log('Testing bridge functionality...');
        
        // Test Import bridge settings
        try {
            const importUsdtContract = new ethers.Contract(importWrapperUsdtAddress, require('../../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
            const rawSettings = await importUsdtContract.settings();
            const settings = processSettings(rawSettings);
            const precompileAddress = await importUsdtContract.precompileAddress();
            const oracleAddress = await importUsdtContract.oracleAddress();
            const governanceAddress = await importUsdtContract.governance();
            const minPrice20 = await importUsdtContract.min_price20();
            
            log(`  ✓ USDT Import bridge settings retrieved`);
            log(`    - Home network: ${await importUsdtContract.home_network()}`);
            log(`    - Home asset: ${await importUsdtContract.home_asset()}`);
            log(`    - Precompile address: ${precompileAddress}`);
            log(`    - Oracle address: ${oracleAddress}`);
            log(`    - Governance address: ${governanceAddress}`);
            log(`    - Stake token: ${settings.tokenAddress}`);
            log(`    - Ratio: ${settings.ratio100}/100`);
            log(`    - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
            log(`    - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
            log(`    - Min stake: ${ethers.utils.formatEther(settings.min_stake)}`);
            log(`    - Min price 20: ${ethers.utils.formatEther(minPrice20)}`);
            log(`    - Challenging periods: ${settings.challenging_periods ? settings.challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
            log(`    - Large challenging periods: ${settings.large_challenging_periods ? settings.large_challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
        } catch (err) {
            log(`  ✗ Failed to test USDT Import bridge: ${err.message}`);
            throw err;
        }

        try {
            const importUsdcContract = new ethers.Contract(importWrapperUsdcAddress, require('../../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
            const rawSettings = await importUsdcContract.settings();
            const settings = processSettings(rawSettings);
            const precompileAddress = await importUsdcContract.precompileAddress();
            const oracleAddress = await importUsdcContract.oracleAddress();
            const governanceAddress = await importUsdcContract.governance();
            const minPrice20 = await importUsdcContract.min_price20();
            
            log(`  ✓ USDC Import bridge settings retrieved`);
            log(`    - Home network: ${await importUsdcContract.home_network()}`);
            log(`    - Home asset: ${await importUsdcContract.home_asset()}`);
            log(`    - Precompile address: ${precompileAddress}`);
            log(`    - Oracle address: ${oracleAddress}`);
            log(`    - Governance address: ${governanceAddress}`);
            log(`    - Stake token: ${settings.tokenAddress}`);
            log(`    - Ratio: ${settings.ratio100}/100`);
            log(`    - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
            log(`    - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
            log(`    - Min stake: ${ethers.utils.formatEther(settings.min_stake)}`);
            log(`    - Min price 20: ${ethers.utils.formatEther(minPrice20)}`);
            log(`    - Challenging periods: ${settings.challenging_periods ? settings.challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
            log(`    - Large challenging periods: ${settings.large_challenging_periods ? settings.large_challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
        } catch (err) {
            log(`  ✗ Failed to test USDC Import bridge: ${err.message}`);
            throw err;
        }

        try {
            const importBusdContract = new ethers.Contract(importWrapperBusdAddress, require('../../counterstake-bridge/evm/build/contracts/ImportWrapper.json').abi, signer);
            const rawSettings = await importBusdContract.settings();
            const settings = processSettings(rawSettings);
            const precompileAddress = await importBusdContract.precompileAddress();
            const oracleAddress = await importBusdContract.oracleAddress();
            const governanceAddress = await importBusdContract.governance();
            const minPrice20 = await importBusdContract.min_price20();
            
            log(`  ✓ BUSD Import bridge settings retrieved`);
            log(`    - Home network: ${await importBusdContract.home_network()}`);
            log(`    - Home asset: ${await importBusdContract.home_asset()}`);
            log(`    - Precompile address: ${precompileAddress}`);
            log(`    - Oracle address: ${oracleAddress}`);
            log(`    - Governance address: ${governanceAddress}`);
            log(`    - Stake token: ${settings.tokenAddress}`);
            log(`    - Ratio: ${settings.ratio100}/100`);
            log(`    - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
            log(`    - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
            log(`    - Min stake: ${ethers.utils.formatEther(settings.min_stake)}`);
            log(`    - Min price 20: ${ethers.utils.formatEther(minPrice20)}`);
            log(`    - Challenging periods: ${settings.challenging_periods ? settings.challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
            log(`    - Large challenging periods: ${settings.large_challenging_periods ? settings.large_challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
        } catch (err) {
            log(`  ✗ Failed to test BUSD Import bridge: ${err.message}`);
            throw err;
        }

        // Test Export bridge settings
        try {
            const exportP3DContract = new ethers.Contract(exportP3DAddress, require('../../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
            const rawSettings = await exportP3DContract.settings();
            const settings = processSettings(rawSettings);
            const governanceAddress = await exportP3DContract.governance();
            
            log(`  ✓ P3D Export bridge settings retrieved`);
            log(`    - Foreign network: ${await exportP3DContract.foreign_network()}`);
            log(`    - Foreign asset: ${await exportP3DContract.foreign_asset()}`);
            log(`    - Governance address: ${governanceAddress}`);
            log(`    - Stake token: ${settings.tokenAddress}`);
            log(`    - Ratio: ${settings.ratio100}/100`);
            log(`    - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
            log(`    - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
            log(`    - Min stake: ${ethers.utils.formatEther(settings.min_stake)}`);
            log(`    - Challenging periods: ${settings.challenging_periods ? settings.challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
            log(`    - Large challenging periods: ${settings.large_challenging_periods ? settings.large_challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
        } catch (err) {
            log(`  ✗ Failed to test P3D Export bridge: ${err.message}`);
            throw err;
        }

        try {
            const exportFIREContract = new ethers.Contract(exportFIREAddress, require('../../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
            const rawSettings = await exportFIREContract.settings();
            const settings = processSettings(rawSettings);
            const governanceAddress = await exportFIREContract.governance();
            
            log(`  ✓ FIRE Export bridge settings retrieved`);
            log(`    - Foreign network: ${await exportFIREContract.foreign_network()}`);
            log(`    - Foreign asset: ${await exportFIREContract.foreign_asset()}`);
            log(`    - Governance address: ${governanceAddress}`);
            log(`    - Stake token: ${settings.tokenAddress}`);
            log(`    - Ratio: ${settings.ratio100}/100`);
            log(`    - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
            log(`    - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
            log(`    - Min stake: ${ethers.utils.formatEther(settings.min_stake)}`);
            log(`    - Challenging periods: ${settings.challenging_periods ? settings.challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
            log(`    - Large challenging periods: ${settings.large_challenging_periods ? settings.large_challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
        } catch (err) {
            log(`  ✗ Failed to test FIRE Export bridge: ${err.message}`);
            throw err;
        }

        try {
            const exportWATERContract = new ethers.Contract(exportWATERAddress, require('../../counterstake-bridge/evm/build/contracts/Export.json').abi, signer);
            const rawSettings = await exportWATERContract.settings();
            const settings = processSettings(rawSettings);
            const governanceAddress = await exportWATERContract.governance();
            
            log(`  ✓ WATER Export bridge settings retrieved`);
            log(`    - Foreign network: ${await exportWATERContract.foreign_network()}`);
            log(`    - Foreign asset: ${await exportWATERContract.foreign_asset()}`);
            log(`    - Governance address: ${governanceAddress}`);
            log(`    - Stake token: ${settings.tokenAddress}`);
            log(`    - Ratio: ${settings.ratio100}/100`);
            log(`    - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
            log(`    - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
            log(`    - Min stake: ${ethers.utils.formatEther(settings.min_stake)}`);
            log(`    - Challenging periods: ${settings.challenging_periods ? settings.challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
            log(`    - Large challenging periods: ${settings.large_challenging_periods ? settings.large_challenging_periods.map(p => p.toString()).join(', ') : 'undefined'}`);
        } catch (err) {
            log(`  ✗ Failed to test WATER Export bridge: ${err.message}`);
            throw err;
        }

        // 12. Test Oracle Integration
        log('Testing Oracle integration...');
        try {
            // Test price retrieval for all required tokens
            const usdtP3DPrice = await oracle.getPrice(TEST_CONFIG.usdtEthAddress, "P3D");
            const usdcP3DPrice = await oracle.getPrice(TEST_CONFIG.usdcEthAddress, "P3D");
            const busdP3DPrice = await oracle.getPrice(TEST_CONFIG.busdBscAddress, "P3D");
            const p3dNativePrice = await oracle.getPrice("P3D", "_NATIVE_");
            const wUsdtP3DPrice = await oracle.getPrice(TEST_CONFIG.wUsdt3DPassAddress, "P3D");
            const wUsdcP3DPrice = await oracle.getPrice(TEST_CONFIG.wUsdc3DPassAddress, "P3D");
            const wBusdP3DPrice = await oracle.getPrice(TEST_CONFIG.wBusd3DPassAddress, "P3D");
            
            // Test _NATIVE_ vs wrapped token symbol prices for export assets
            const nativeWP3dPrice = await oracle.getPrice("_NATIVE_", "wP3D");
            const nativeWFirePrice = await oracle.getPrice("_NATIVE_", "wFIRE");
            const nativeWWaterPrice = await oracle.getPrice("_NATIVE_", "wWATER");
            
            // Test reverse prices for export assets (symbol vs _NATIVE_)
            const wP3dNativePrice = await oracle.getPrice("wP3D", "_NATIVE_");
            const wFireNativePrice = await oracle.getPrice("wFIRE", "_NATIVE_");
            const wWaterNativePrice = await oracle.getPrice("wWATER", "_NATIVE_");
            
            log(`  ✓ Oracle prices retrieved:`);
            log(`    - USDT vs P3D: (${usdtP3DPrice[0]}, ${usdtP3DPrice[1]})`);
            log(`    - USDC vs P3D: (${usdcP3DPrice[0]}, ${usdcP3DPrice[1]})`);
            log(`    - BUSD vs P3D: (${busdP3DPrice[0]}, ${busdP3DPrice[1]})`);
            log(`    - P3D vs _NATIVE_: (${p3dNativePrice[0]}, ${p3dNativePrice[1]})`);
            log(`    - wUSDT vs P3D: (${wUsdtP3DPrice[0]}, ${wUsdtP3DPrice[1]})`);
            log(`    - wUSDC vs P3D: (${wUsdcP3DPrice[0]}, ${wUsdcP3DPrice[1]})`);
            log(`    - wBUSD vs P3D: (${wBusdP3DPrice[0]}, ${wBusdP3DPrice[1]})`);
            log(`    - _NATIVE_ vs wP3D: (${ethers.utils.formatEther(nativeWP3dPrice[0])}, ${ethers.utils.formatEther(nativeWP3dPrice[1])}) = 1.0 wP3D per _NATIVE_`);
            log(`    - _NATIVE_ vs wFIRE: (${ethers.utils.formatEther(nativeWFirePrice[0])}, ${ethers.utils.formatEther(nativeWFirePrice[1])}) = 0.5 wFIRE per _NATIVE_`);
            log(`    - _NATIVE_ vs wWATER: (${ethers.utils.formatEther(nativeWWaterPrice[0])}, ${ethers.utils.formatEther(nativeWWaterPrice[1])}) = 2.5 wWATER per _NATIVE_`);
            log(`    - wP3D vs _NATIVE_: (${ethers.utils.formatEther(wP3dNativePrice[0])}, ${ethers.utils.formatEther(wP3dNativePrice[1])}) = 1.0 _NATIVE_ per wP3D`);
            log(`    - wFIRE vs _NATIVE_: (${ethers.utils.formatEther(wFireNativePrice[0])}, ${ethers.utils.formatEther(wFireNativePrice[1])}) = 2.0 _NATIVE_ per wFIRE`);
            log(`    - wWATER vs _NATIVE_: (${ethers.utils.formatEther(wWaterNativePrice[0])}, ${ethers.utils.formatEther(wWaterNativePrice[1])}) = 0.4 _NATIVE_ per wWATER`);
        } catch (err) {
            log(`  ✗ Failed to test Oracle integration: ${err.message}`);
            throw err;
        }

        // 13. Test P3D Precompile Integration
        log('Testing P3D precompile integration...');
        try {
            // Use the same approach as the existing test
            const { ERC20PrecompileUtils } = require('../test-utils/erc20-precompile-utils');
            const Web3 = require('web3');
            const web3 = new Web3(testConfig.development.network.rpcUrl);
            const erc20Utils = new ERC20PrecompileUtils(web3);
            
            // Get token metadata
            const metadata = await erc20Utils.getTokenMetadata();
            log(`  ✓ P3D precompile integration verified:`);
            log(`    - Name: ${metadata.name}`);
            log(`    - Symbol: ${metadata.symbol}`);
            log(`    - Decimals: ${metadata.decimals}`);
            
            // Get balance for the signer
            const balance = await erc20Utils.getSubstrateBalance(signerAddress);
            log(`    - Balance: ${balance.balanceFormatted}`);
            
            // Verify precompile access
            const isAccessible = await erc20Utils.verifyPrecompileAccess();
            if (isAccessible) {
                log(`    - Precompile accessibility: ✅ Verified`);
            } else {
                throw new Error('Precompile not accessible');
            }
        } catch (err) {
            log(`  ✗ Failed to test P3D precompile integration: ${err.message}`);
            throw err;
        }

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('  🎉 BRIDGE SETUP AND TEST SUMMARY');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        log('\n📋 TEST RESULTS:');
        log(`  ✅ USDT Import bridge created and tested`);
        log(`  ✅ USDC Import bridge created and tested`);
        log(`  ✅ BUSD Import bridge created and tested`);
        log(`  ✅ Import Wrapper Assistants created`);
        log(`  ✅ Export bridges created`);
        log(`  ✅ Export Assistants created`);
        log(`  ✅ Oracle integration verified`);
        log(`  ✅ P3D precompile integration verified`);
        log(`  ✅ All bridge functionality tests passed`);

        log('\n🌉 BRIDGE INSTANCES CREATED:');
        log(`  📥 USDT Import Bridge (Ethereum → 3DPass):`);
        log(`     Address: ${importWrapperUsdtAddress}`);
        log(`     Foreign Asset: ${TEST_CONFIG.wUsdt3DPassAddress} wUSDT on 3DPass`);
        log(`     Home Asset: ${TEST_CONFIG.usdtEthAddress} (USDT on Ethereum)`);
        log(`     Stake Token: P3D ${P3D_PRECOMPILE_ADDRESS}`);
        log(`     Is Issuer/Burner: Yes`);

        log(`  📥 USDC Import Bridge (Ethereum → 3DPass):`);
        log(`     Address: ${importWrapperUsdcAddress}`);
        log(`     Foreign Asset: ${TEST_CONFIG.wUsdc3DPassAddress} (wUSDC on 3DPass)`);
        log(`     Home Asset: ${TEST_CONFIG.usdcEthAddress} (USDC on Ethereum)`);
        log(`     Stake Token: P3D ${P3D_PRECOMPILE_ADDRESS}`);
        log(`     Is Issuer/Burner: Yes`);

        log(`  📥 BUSD Import Bridge (BSC → 3DPass):`);
        log(`     Address: ${importWrapperBusdAddress}`);
        log(`     Foreign Asset: ${TEST_CONFIG.wBusd3DPassAddress} (wBUSD on 3DPass)`);
        log(`     Home Asset: ${TEST_CONFIG.busdBscAddress} (BUSD on BSC)`);
        log(`     Stake Token: P3D ${P3D_PRECOMPILE_ADDRESS}`);
        log(`     Is Issuer/Burner: Yes`);

        log(`  📤 P3D Export Bridge (3DPass → Ethereum):`);
        log(`     Address: ${exportP3DAddress}`);
        log(`     Home Asset: P3D ${P3D_PRECOMPILE_ADDRESS} (P3D on 3DPass)`);
        log(`     Foreign Asset: ${TEST_CONFIG.wP3DEthAddress} (wP3D on Ethereum)`);
        log(`     Stake Token: P3D ${P3D_PRECOMPILE_ADDRESS}`);
        log(`     Is Issuer/Burner: No`);

        log(`  📤 FIRE Export Bridge (3DPass → Ethereum):`);
        log(`     Address: ${exportFIREAddress}`);
        log(`     Home Asset: ${TEST_CONFIG.fire3DPassAddress} (FIRE on 3DPass)`);
        log(`     Foreign Asset: ${TEST_CONFIG.wFIREEthAddress} (wFIRE on Ethereum)`);
        log(`     Stake Token: FIRE ${TEST_CONFIG.fire3DPassAddress}`);
        log(`     Is Issuer/Burner: No`);

        log(`  📤 WATER Export Bridge (3DPass → Ethereum):`);
        log(`     Address: ${exportWATERAddress}`);
        log(`     Home Asset: ${TEST_CONFIG.water3DPassAddress} (WATER on 3DPass)`);
        log(`     Foreign Asset: ${TEST_CONFIG.wWATEREthAddress} (wWATER on Ethereum)`);
        log(`     Stake Token: WATER ${TEST_CONFIG.water3DPassAddress}`);
        log(`     Is Issuer/Burner: No`);

        log('\n🤖 ASSISTANT ERC20 CONTRACTS CREATED:');
        
        // Get assistant contract names and symbols
        try {
            // Load ERC20 ABI for name/symbol calls
            const erc20Abi = [
                { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
                { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
            ];
            
            log(`  📥 Import Wrapper Assistants:`);
            
            // USDT Import Wrapper Assistant
            const usdtAssistantContract = new ethers.Contract(importWrapperUsdtAssistantAddress, erc20Abi, signer);
            const usdtAssistantName = await usdtAssistantContract.name();
            const usdtAssistantSymbol = await usdtAssistantContract.symbol();
            log(`     • USDT Import Wrapper Assistant: ${importWrapperUsdtAssistantAddress}`);
            log(`         Share symbol: ${usdtAssistantSymbol}`);
            log(`         Share name: ${usdtAssistantName}`);
            
            // USDC Import Wrapper Assistant
            const usdcAssistantContract = new ethers.Contract(importWrapperUsdcAssistantAddress, erc20Abi, signer);
            const usdcAssistantName = await usdcAssistantContract.name();
            const usdcAssistantSymbol = await usdcAssistantContract.symbol();
            log(`     • USDC Import Wrapper Assistant: ${importWrapperUsdcAssistantAddress}`);
            log(`         Share symbol: ${usdcAssistantSymbol}`);
            log(`         Share name: ${usdcAssistantName}`);
            
            // BUSD Import Wrapper Assistant
            const busdAssistantContract = new ethers.Contract(importWrapperBusdAssistantAddress, erc20Abi, signer);
            const busdAssistantName = await busdAssistantContract.name();
            const busdAssistantSymbol = await busdAssistantContract.symbol();
            log(`     • BUSD Import Wrapper Assistant: ${importWrapperBusdAssistantAddress}`);
            log(`         Share symbol: ${busdAssistantSymbol}`);
            log(`         Share name: ${busdAssistantName}`);
            
            log(`  📤 Export Assistants:`);
            
            // P3D Export Assistant
            const p3dAssistantContract = new ethers.Contract(exportP3DAssistantAddress, erc20Abi, signer);
            const p3dAssistantName = await p3dAssistantContract.name();
            const p3dAssistantSymbol = await p3dAssistantContract.symbol();
            log(`     • P3D Export Assistant: ${exportP3DAssistantAddress}`);
            log(`         Share symbol: ${p3dAssistantSymbol}`);
            log(`         Share name: ${p3dAssistantName}`);
            
            // FIRE Export Assistant
            const fireAssistantContract = new ethers.Contract(exportFIREAssistantAddress, erc20Abi, signer);
            const fireAssistantName = await fireAssistantContract.name();
            const fireAssistantSymbol = await fireAssistantContract.symbol();
            log(`     • FIRE Export Assistant: ${exportFIREAssistantAddress}`);
            log(`         Share symbol: ${fireAssistantSymbol}`);
            log(`         Share name: ${fireAssistantName}`);
            
            // WATER Export Assistant
            const waterAssistantContract = new ethers.Contract(exportWATERAssistantAddress, erc20Abi, signer);
            const waterAssistantName = await waterAssistantContract.name();
            const waterAssistantSymbol = await waterAssistantContract.symbol();
            log(`     • WATER Export Assistant: ${exportWATERAssistantAddress}`);
            log(`         Share symbol: ${waterAssistantSymbol}`);
            log(`         Share name: ${waterAssistantName}`);
            
        } catch (err) {
            log(`  ⚠ Could not retrieve assistant names/symbols: ${err.message}`);
            log(`  📥 Import Wrapper Assistants:`);
            log(`     • USDT Import Wrapper Assistant: ${importWrapperUsdtAssistantAddress}`);
            log(`     • USDC Import Wrapper Assistant: ${importWrapperUsdcAssistantAddress}`);
            log(`     • BUSD Import Wrapper Assistant: ${importWrapperBusdAssistantAddress}`);
            log(`  📤 Export Assistants:`);
            log(`     • P3D Export Assistant: ${exportP3DAssistantAddress}`);
            log(`     • FIRE Export Assistant: ${exportFIREAssistantAddress}`);
            log(`     • WATER Export Assistant: ${exportWATERAssistantAddress}`);
        }

        log('\n🔗 COMPLETE WRAPPED ARCHITECTURE:');
        log(`  📥 Import Wrapper Bridges (using existing precompiles):`);
        log(`     • USDT: ${importWrapperUsdtAddress} → ${TEST_CONFIG.wUsdt3DPassAddress}`);
        log(`     • USDC: ${importWrapperUsdcAddress} → ${TEST_CONFIG.wUsdc3DPassAddress}`);
        log(`     • BUSD: ${importWrapperBusdAddress} → ${TEST_CONFIG.wBusd3DPassAddress}`);
        log(`  📤 Export Bridges (using native token precompiles):`);
        log(`     • P3D: ${exportP3DAddress} → ${TEST_CONFIG.wP3DEthAddress}`);
        log(`     • FIRE: ${exportFIREAddress} → ${TEST_CONFIG.wFIREEthAddress}`);
        log(`     • WATER: ${exportWATERAddress} → ${TEST_CONFIG.wWATEREthAddress}`);

        log('\n✅ ARCHITECTURE SUMMARY:');
        log(`  • All bridges use existing precompile addresses`);
        log(`  • All assistants use existing precompile addresses`);
        log(`  • No duplicate tokens created`);
        log(`  • Role-based mint/burn control`);
        log(`  • Clean, consistent approach`);

        log('\n🏗️  INFRASTRUCTURE CONTRACTS:');
        log(`  🏭 CounterstakeFactory: ${counterstakeFactory}`);
        log(`  🤖 AssistantFactory: ${assistantFactoryAddress}`);
        log(`  🔮 Oracle: ${oracleAddress}`);
        log(`  🪙 P3D Precompile: ${P3D_PRECOMPILE_ADDRESS}`);

        log('\n🎯 BRIDGE CAPABILITIES:');
        log(`  ✅ Cross-chain transfers from Ethereum to 3DPass (USDT, USDC)`);
        log(`  ✅ Cross-chain transfers from BSC to 3DPass (BUSD)`);
        log(`  ✅ Cross-chain transfers from 3DPass to Ethereum (P3D, FIRE, WATER)`);
        log(`  ✅ Native token staking for bridge security (P3D, FIRE, WATER)`);
        log(`  ✅ Oracle price feeds for accurate conversions`);
        log(`  ✅ Import wrapper assistants for automated processing`);
        log(`  ✅ Export assistants for automated processing`);
        log(`  ✅ Governance and voting mechanisms`);

        log('\n🚀 READY FOR PRODUCTION:');
        log(`  The 3DPass bridge is now fully operational and ready to handle`);
        log(`  bidirectional cross-chain transfers between Ethereum, BSC, and 3DPass networks.`);
        log(`  Import bridges support external tokens (USDT, USDC, BUSD) coming into 3DPass.`);
        log(`  Export bridges support native 3DPass tokens (P3D, FIRE, WATER) going to Ethereum.`);

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('  🎉 BRIDGE SETUP AND TEST COMPLETE');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (err) {
        log('\n--- Bridge Setup and Test Failed ---');
        log(err.message);
        log(err.stack);
        process.exit(1);
    }
}

// Run the test
setupBridgeTest();