# Create New Import Bridge Guide

## Overview

This guide provides step-by-step instructions for creating new Import bridges in the 3DPass Counterstake Bridge system. Import bridges enable cross-chain transfers from external networks (like Ethereum, BSC) to 3DPass, where foreign tokens are wrapped into native 3DPass assets.

## Import Bridge
Import bridge is a two-way cross-chain bridge, which is designed to deal with foreign assets - the assets issued on the foreign chain and then transfered to 3Dpass. E.g. USDT < - > wUSDT (Import on 3dpass)

Example: 

ETH/BSC <-> 3DPass (TWO-WAY-BRIDGE)

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Home Chain    │         │    Whatchdog     │         │  Foreign Chain  │
│   (ETH/BSC)     │         │                  │         │     3DPass      │
│ - ETH, USDT     │────────►┤  - Monitor Events│────────►│ - ImportContract│
│ - ExportContract│<────────│  - Counterstake  │<────────│ - wETH, wUSDT   │
│ - EVM Layer     │         │                  │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

### **⚠️ IMPORTANT**: Native currency.

Although P3D is a natinve currency in 3dpass, it represents ERC20 token in opposed to other Ethereum-kind-of-systems leveraging the address zero  `0x0000000000000000000000000000000000000000`. 
---
P3D_PRECOMPILE Address (Native): `0x0000000000000000000000000000000000000802`
---

- The Address Zero is not allowed to be stake asset in the contracts!
- Conventional Solidiy interface for native currency is not supported by the contracts!
- The Zddress Zero, however, might be used as a default address, but never represents the native token! 

### **⚠️ IMPORTANT**: poscan-assets-erc20 precompiles on Import only! 

The stake tokens must be either P3D (via `balances-erc20` precmpile) or `poscan-assets-erc20` precompile IERC20 interface callable from Solidity at a specific address prefixed as `0xFBFBFBFA`. 

The precompile address format is `0xFBFBFBFA + <AssetId in hex>`, where the `AssetId` is an asset id from the poscan-assets Substrate based module operating within the original 3Dpass runtime. Example: for the assetId: `222` (222 becomes `de` in hex), therefore the precompile address is `0xfBFBFBfa000000000000000000000000000000de`.

The foreign assets (wrapped tokens, e.g. wUSDT on LoT) must be `poscan-assets-erc20` precompile IERC20 only.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Understanding Import Bridges](#understanding-import-bridges)
3. [Required Components](#required-components)
4. [Step-by-Step Process](#step-by-step-process)
5. [Configuration Parameters](#configuration-parameters)
6. [Oracle Price Feed Setup](#oracle-price-feed-setup)
7. [Bridge Creation](#bridge-creation)
8. [Assistant Creation](#assistant-creation)
9. [Verification and Testing](#verification-and-testing)
10. [Troubleshooting](#troubleshooting)


## Prerequisites

Before creating a new Import bridge, ensure you have:

- **Deployed Infrastructure**: CounterstakeFactory, AssistantFactory, and Oracle contracts
- **Precompiled Token**: The wrapped token precompile must exist on 3DPass
- **Network Configuration**: RPC endpoints and network details
- **Account Setup**: Signer account with sufficient funds for gas fees
- **Token Information**: Home network token address and 3DPass precompile address

## Understanding Import Bridges

### What is an Import Bridge?

An Import bridge facilitates the transfer of tokens from external networks (home networks) to 3DPass. When users transfer tokens from Ethereum/BSC to 3DPass, the Import bridge:

1. **Receives** the foreign token on the home network
2. **Mints** the corresponding wrapped token on 3DPass
3. **Uses** staking mechanisms for security
4. **Provides** automated processing through assistants

### Bridge Architecture

```
External Network (Ethereum/BSC) → Import Bridge → 3DPass Network
     ↓                              ↓              ↓
  USDT/USDC/BUSD              Bridge Contract   wUSDT/wUSDC/wBUSD
```

## Required Components

### Precompile Address Format

**⚠️ IMPORTANT**: All precompile addresses in 3DPass follow specific formats:

- **P3D Precompile (Native Currency)**: `0x0000000000000000000000000000000000000802`
- **poscan-assets-erc20 Precompiles**: `0xFBFBFBFA + <AssetId in hex>` (convert decimal AssetId to hex)

**Examples**:
- AssetId `1` (decimal) → `0x01` (hex) → `0xFBFBFBFA00000000000000000000000000000001` (wUSDT)
- AssetId `2` (decimal) → `0x02` (hex) → `0xFBFBFBFA00000000000000000000000000000002` (wUSDC)  
- AssetId `3` (decimal) → `0x03` (hex) → `0xFBFBFBFA00000000000000000000000000000003` (wBUSD)
- AssetId `4` (decimal) → `0x04` (hex) → `0xFBFBFBFA00000000000000000000000000000004` (FIRE)
- AssetId `5` (decimal) → `0x05` (hex) → `0xFBFBFBFA00000000000000000000000000000005` (WATER)
- AssetId `222` (decimal) → `0xde` (hex) → `0xFBFBFBFA000000000000000000000000000000de`

### 1. Infrastructure Contracts

```javascript
// Required deployed contracts
const counterstakeFactory = "0x..."; // CounterstakeFactory address
const assistantFactory = "0x...";     // AssistantFactory address  
const oracle = "0x...";              // Oracle address
const p3dPrecompile = "0x0000000000000000000000000000000000000802"; // P3D precompile address
```

### 2. Token Configuration

```javascript
const TOKEN_CONFIG = {
    // Home network token (external network)
    homeNetwork: "Ethereum",           // or "BSC"
    homeAsset: "0x...",               // Token address on home network
    
    // 3DPass wrapped token (precompile) - Format: 0xFBFBFBFA + <AssetId in hex>
    // Example: AssetId 1 (decimal) = 0x01 (hex) = 0xFBFBFBFA00000000000000000000000000000001
    precompileAddress: "0xFBFBFBFA00000000000000000000000000000001", // wUSDT precompile on 3DPass (AssetId 1)
    
    // Stake token (usually P3D)
    stakeTokenAddr: "0x0000000000000000000000000000000000000802",    // P3D precompile address
};
```

### 3. Bridge Parameters

```javascript
const BRIDGE_PARAMS = {
    counterstake_coef100: 160,        // Counterstake coefficient (160%)
    ratio100: 110,                    // Ratio (110%)
    large_threshold: "10000",         // Large claim threshold
    challenging_periods: [180, 180, 180, 5184000], // Small claims periods
    large_challenging_periods: [604800, 2592000, 5184000] // Large claims periods
};
```

## Step-by-Step Process

### Step 1: Setup Provider and Signer

```javascript
const { ethers } = require('ethers');

// Setup provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Setup signer
const privateKey = "0x..."; // Your private key
const signer = new ethers.Wallet(privateKey, provider);
const signerAddress = signer.address;

// P3D precompile address (native currency)
const P3D_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000802";
```

### Step 2: Load Contract Instances

```javascript
// Load contract ABIs
const factoryJson = require('./build/contracts/CounterstakeFactory.json');
const assistantFactoryJson = require('./build/contracts/AssistantFactory.json');
const oracleJson = require('./build/contracts/Oracle.json');

// Create contract instances
const factory = new ethers.Contract(counterstakeFactory, factoryJson.abi, signer);
const assistantFactory = new ethers.Contract(assistantFactory, assistantFactoryJson.abi, signer);
const oracle = new ethers.Contract(oracle, oracleJson.abi, signer);
```

### Step 3: Setup Oracle Price Feeds

Before creating the bridge, you must configure Oracle price feeds for the token:

```javascript
// Setup price feed for home asset vs P3D
await oracle.setPrice(
    TOKEN_CONFIG.homeAsset,           // home_asset (token on external network)
    "P3D",                           // native token on 3DPass
    ethers.utils.parseEther('1'),    // price_numerator
    ethers.utils.parseEther('0.0014'), // price_denominator
    { gasLimit: 500000 }
);

// Setup price feed for wrapped token vs P3D
await oracle.setPrice(
    TOKEN_CONFIG.precompileAddress,   // wrapped token on 3DPass
    "P3D",                           // native token on 3DPass
    ethers.utils.parseEther('1'),    // price_numerator
    ethers.utils.parseEther('0.0014'), // price_denominator
    { gasLimit: 500000 }
);

// Setup _NATIVE_ vs wrapped token symbol price feed
await oracle.setPrice(
    "_NATIVE_",                      // native token
    "wUSDT",                         // wrapped token symbol
    ethers.utils.parseEther('1'),    // price_numerator
    ethers.utils.parseEther('0.0014'), // price_denominator
    { gasLimit: 500000 }
);
```

### Step 4: Create Import Wrapper Bridge

```javascript
// Create Import Wrapper bridge
const importWrapperTx = await factory.createImportWrapper(
    TOKEN_CONFIG.homeNetwork,         // home_network (Ethereum/BSC)
    TOKEN_CONFIG.homeAsset,           // home_asset (token address on external network)
    TOKEN_CONFIG.precompileAddress,   // precompileAddress (wrapped token on 3DPass)
    TOKEN_CONFIG.stakeTokenAddr,      // stakeTokenAddr (P3D precompile)
    oracle,                          // oracleAddr
    BRIDGE_PARAMS.counterstake_coef100, // counterstake_coef100
    BRIDGE_PARAMS.ratio100,          // ratio100
    ethers.utils.parseEther(BRIDGE_PARAMS.large_threshold), // large_threshold
    BRIDGE_PARAMS.challenging_periods, // challenging_periods
    BRIDGE_PARAMS.large_challenging_periods, // large_challenging_periods
    { gasLimit: 5000000 }
);

// Wait for transaction confirmation
const importWrapperReceipt = await importWrapperTx.wait();
const importWrapperAddress = importWrapperReceipt.events[0].args.contractAddress;

console.log(`✓ Import Wrapper bridge created: ${importWrapperAddress}`);
```

### Step 5: Create Import Wrapper Assistant

```javascript
// Create Import Wrapper Assistant
const assistantTx = await assistantFactory.createImportWrapperAssistant(
    importWrapperAddress,             // bridge address
    signerAddress,                    // manager address
    100,                              // management_fee10000 (1%)
    1000,                             // success_fee10000 (10%)
    10,                               // swap_fee10000 (0.1%)
    1,                                // exponent
    "TOKEN import assistant",         // name
    "TOKENIA",                        // symbol
    { gasLimit: 3000000 }
);

// Wait for transaction confirmation
const assistantReceipt = await assistantTx.wait();

// Extract assistant address from event
const newAssistantEvent = assistantReceipt.logs.find(log => {
    try {
        const parsedLog = assistantFactory.interface.parseLog(log);
        return parsedLog.name === 'NewImportWrapperAssistant';
    } catch (e) {
        return false;
    }
});

if (newAssistantEvent) {
    const parsedEvent = assistantFactory.interface.parseLog(newAssistantEvent);
    const assistantAddress = parsedEvent.args.contractAddress;
    console.log(`✓ Import Wrapper Assistant created: ${assistantAddress}`);
} else {
    throw new Error('NewImportWrapperAssistant event not found');
}
```

### Step 5.5: Precompile Approval (Critical Step)

**⚠️ IMPORTANT**: If the stake token is NOT P3D (no a native token) (i.e., it's another ERC20 precompile), you MUST call the `approvePrecompile` function on the assistant to allow the bridge to spend the assistant's tokens. 

Fund the assistant with both P3D (native tokens) and the precompile tokens before the Approval call. 

```javascript
// Check if stake token is not P3D (needs approval)
const isNonP3DToken = TOKEN_CONFIG.stakeTokenAddr !== P3D_PRECOMPILE_ADDRESS;

if (isNonP3DToken) {
    console.log(`🔄 Approving bridge to spend assistant's ${TOKEN_CONFIG.symbol} tokens...`);
    
    try {
        // Load ImportWrapperAssistant ABI
        const importWrapperAssistantJson = require('./build/contracts/ImportWrapperAssistant.json');
        const importWrapperAssistant = new ethers.Contract(assistantAddress, importWrapperAssistantJson.abi, signer);
        
        // Call approvePrecompile function
        const approveTx = await importWrapperAssistant.approvePrecompile({ gasLimit: 2000000 });
        await approveTx.wait();
        console.log(`✅ ${TOKEN_CONFIG.symbol} Assistant precompile approval successful: ${approveTx.hash}`);
        
        // Verify approval
        const tokenContract = new ethers.Contract(TOKEN_CONFIG.stakeTokenAddr, [
            { "constant": true, "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}], "name": "allowance", "outputs": [{"name": "", "type": "uint256"}], "type": "function" }
        ], signer);
        
        const allowance = await tokenContract.allowance(assistantAddress, importWrapperAddress);
        console.log(`✅ Verified allowance: ${allowance.toString()}`);
        
    } catch (error) {
        console.error(`❌ ${TOKEN_CONFIG.symbol} Assistant precompile approval failed: ${error.message}`);
        console.log(`ℹ️ This might be due to insufficient P3D balance for gas fees`);
        console.log(`ℹ️ The assistant will not be able to function properly without approval`);
        throw error;
    }
} else {
    console.log(`⏭️ P3D token - no approval needed`);
}
```

### Step 6: Verify Bridge Configuration

```javascript
// Load ImportWrapper ABI
const importWrapperJson = require('./build/contracts/ImportWrapper.json');
const importWrapperContract = new ethers.Contract(importWrapperAddress, importWrapperJson.abi, signer);

// Get bridge settings
const rawSettings = await importWrapperContract.settings();
const settings = processSettings(rawSettings);

// Display bridge configuration
console.log('✓ Bridge Configuration:');
console.log(`  - Home network: ${await importWrapperContract.home_network()}`);
console.log(`  - Home asset: ${await importWrapperContract.home_asset()}`);
console.log(`  - Precompile address: ${await importWrapperContract.precompileAddress()}`);
console.log(`  - Oracle address: ${await importWrapperContract.oracleAddress()}`);
console.log(`  - Stake token: ${settings.tokenAddress}`);
console.log(`  - Ratio: ${settings.ratio100}/100`);
console.log(`  - Counterstake coefficient: ${settings.counterstake_coef100}/100`);
console.log(`  - Large threshold: ${ethers.utils.formatEther(settings.large_threshold)}`);
```

## Configuration Parameters

### Bridge Parameters Explained

| Parameter | Description | Example Value | Notes |
|-----------|-------------|---------------|-------|
| `home_network` | Source network name | "Ethereum" | Must match network configuration |
| `home_asset` | Token address on source network | "0x..." | Must be valid ERC20 address |
| `precompileAddress` | Wrapped token precompile on 3DPass | "0x..." | Must exist and be accessible |
| `stakeTokenAddr` | Staking token address | "0x..." | Usually P3D precompile |
| `counterstake_coef100` | Counterstake coefficient | 160 | 160% = 1.6x multiplier |
| `ratio100` | Bridge ratio | 110 | 110% = 1.1x ratio |
| `large_threshold` | Large claim threshold | "10000" | In token units |
| `challenging_periods` | Small claim periods | [180, 180, 180, 5184000] | In seconds |
| `large_challenging_periods` | Large claim periods | [604800, 2592000, 5184000] | In seconds |

### Challenging Periods

```javascript
// Testing configuration (short periods)
const TESTING_PERIODS = {
    challenging_periods: [3*60, 3*60, 3*60, 60*24*3600], // [3min, 3min, 3min, 60days]
    large_challenging_periods: [1*7*24*3600, 30*24*3600, 60*24*3600] // [1week, 30days, 60days]
};

// Production configuration (longer periods)
const PRODUCTION_PERIODS = {
    challenging_periods: [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // [14h, 3d, 7d, 30d]
    large_challenging_periods: [1*7*24*3600, 30*24*3600, 60*24*3600] // [1week, 30days, 60days]
};
```

## Oracle Price Feed Setup

### Required Price Feeds

For each Import bridge, you need to configure these Oracle price feeds:

1. **Home Asset vs P3D**: `homeAsset → P3D`
2. **Wrapped Token vs P3D**: `wrappedToken → P3D`
3. **_NATIVE_ vs Wrapped Symbol**: `_NATIVE_ → wTOKEN`

### Price Feed Configuration

```javascript
// Example for USDT Import bridge
const setupPriceFeeds = async () => {
    // 1. USDT vs P3D price feed
    await oracle.setPrice(
        "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT on Ethereum
        "P3D",                                         // P3D on 3DPass
        ethers.utils.parseEther('1'),                 // 1 USDT
        ethers.utils.parseEther('0.0014'),            // 0.0014 P3D
        { gasLimit: 500000 }
    );

    // 2. wUSDT vs P3D price feed
    await oracle.setPrice(
        "0xFBFBFBFA00000000000000000000000000000001", // wUSDT precompile on 3DPass (AssetId 1)
        "P3D",                                         // P3D on 3DPass
        ethers.utils.parseEther('1'),                 // 1 wUSDT
        ethers.utils.parseEther('0.0014'),            // 0.0014 P3D
        { gasLimit: 500000 }
    );

    // 3. _NATIVE_ vs wUSDT symbol price feed
    await oracle.setPrice(
        "_NATIVE_",                                    // Native token
        "wUSDT",                                       // wUSDT symbol
        ethers.utils.parseEther('1'),                 // 1 _NATIVE_
        ethers.utils.parseEther('0.0014'),            // 0.0014 wUSDT
        { gasLimit: 500000 }
    );
};
```

## Bridge Creation

### Complete Bridge Creation Function

```javascript
const createImportBridge = async (tokenConfig, bridgeParams) => {
    try {
        // 1. Setup Oracle price feeds
        await setupOraclePriceFeeds(tokenConfig);
        
        // 2. Create Import Wrapper bridge
        const importWrapperAddress = await createImportWrapper(tokenConfig, bridgeParams);
        
        // 3. Create Import Wrapper Assistant
        const assistantAddress = await createImportWrapperAssistant(importWrapperAddress, tokenConfig);
        
        // 4. Verify bridge configuration
        await verifyBridgeConfiguration(importWrapperAddress);
        
        return {
            importWrapperAddress,
            assistantAddress,
            success: true
        };
    } catch (error) {
        console.error('Failed to create Import bridge:', error);
        throw error;
    }
};
```

## Assistant Creation

### Assistant Parameters

| Parameter | Description | Example Value | Notes |
|-----------|-------------|---------------|-------|
| `bridgeAddress` | Import Wrapper bridge address | "0x..." | From bridge creation |
| `managerAddress` | Assistant manager | "0x..." | Signer address |
| `management_fee10000` | Management fee | 100 | 1% (100/10000) |
| `success_fee10000` | Success fee | 1000 | 10% (1000/10000) |
| `swap_fee10000` | Swap fee | 10 | 0.1% (10/10000) |
| `exponent` | Price exponent | 1 | Usually 1 |
| `name` | Assistant name | "TOKEN import assistant" | Human-readable name |
| `symbol` | Assistant symbol | "TOKENIA" | ERC20 symbol |

### Assistant Creation Function

```javascript
const createImportWrapperAssistant = async (bridgeAddress, tokenConfig) => {
    const assistantTx = await assistantFactory.createImportWrapperAssistant(
        bridgeAddress,                    // bridge address
        signerAddress,                    // manager address
        100,                              // management_fee10000 (1%)
        1000,                             // success_fee10000 (10%)
        10,                               // swap_fee10000 (0.1%)
        1,                                // exponent
        `${tokenConfig.symbol} import assistant`, // name
        `${tokenConfig.symbol}IA`,       // symbol
        { gasLimit: 3000000 }
    );

    const assistantReceipt = await assistantTx.wait();
    
    // Extract assistant address from event
    const newAssistantEvent = assistantReceipt.logs.find(log => {
        try {
            const parsedLog = assistantFactory.interface.parseLog(log);
            return parsedLog.name === 'NewImportWrapperAssistant';
        } catch (e) {
            return false;
        }
    });

    if (newAssistantEvent) {
        const parsedEvent = assistantFactory.interface.parseLog(newAssistantEvent);
        return parsedEvent.args.contractAddress;
    } else {
        throw new Error('NewImportWrapperAssistant event not found');
    }
};
```

## Verification and Testing

### Bridge Verification

```javascript
const verifyBridgeConfiguration = async (bridgeAddress) => {
    const importWrapperContract = new ethers.Contract(bridgeAddress, importWrapperJson.abi, signer);
    
    // Get all bridge settings
    const homeNetwork = await importWrapperContract.home_network();
    const homeAsset = await importWrapperContract.home_asset();
    const precompileAddress = await importWrapperContract.precompileAddress();
    const oracleAddress = await importWrapperContract.oracleAddress();
    const governanceAddress = await importWrapperContract.governance();
    
    // Verify settings match expected values
    if (homeNetwork !== TOKEN_CONFIG.homeNetwork) {
        throw new Error(`Home network mismatch: ${homeNetwork} != ${TOKEN_CONFIG.homeNetwork}`);
    }
    
    if (homeAsset !== TOKEN_CONFIG.homeAsset) {
        throw new Error(`Home asset mismatch: ${homeAsset} != ${TOKEN_CONFIG.homeAsset}`);
    }
    
    if (precompileAddress !== TOKEN_CONFIG.precompileAddress) {
        throw new Error(`Precompile address mismatch: ${precompileAddress} != ${TOKEN_CONFIG.precompileAddress}`);
    }
    
    console.log('✓ Bridge configuration verified successfully');
};
```

### Precompile Verification

```javascript
const verifyPrecompile = async (precompileAddress) => {
    const erc20Abi = [
        { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
    ];
    
    try {
        const precompileContract = new ethers.Contract(precompileAddress, erc20Abi, signer);
        const symbol = await precompileContract.symbol();
        console.log(`✓ Precompile verified: ${symbol} at ${precompileAddress}`);
        return true;
    } catch (err) {
        console.error(`✗ Precompile verification failed: ${err.message}`);
        return false;
    }
};
```

### Oracle Integration Test

```javascript
const testOracleIntegration = async (tokenConfig) => {
    try {
        // Test price retrieval
        const homeAssetPrice = await oracle.getPrice(tokenConfig.homeAsset, "P3D");
        const wrappedTokenPrice = await oracle.getPrice(tokenConfig.precompileAddress, "P3D");
        
        console.log(`✓ Oracle prices retrieved:`);
        console.log(`  - Home asset vs P3D: (${homeAssetPrice[0]}, ${homeAssetPrice[1]})`);
        console.log(`  - Wrapped token vs P3D: (${wrappedTokenPrice[0]}, ${wrappedTokenPrice[1]})`);
        
        return true;
    } catch (err) {
        console.error(`✗ Oracle integration test failed: ${err.message}`);
        return false;
    }
};
```

## Complete Example

### USDT Import Bridge Creation

```javascript
// Configuration
const USDT_CONFIG = {
    homeNetwork: "Ethereum",
    homeAsset: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT on Ethereum
    precompileAddress: "0xFBFBFBFA00000000000000000000000000000001", // wUSDT precompile on 3DPass (AssetId 1)
    stakeTokenAddr: "0x0000000000000000000000000000000000000802", // P3D precompile
    symbol: "USDT"
};

const BRIDGE_PARAMS = {
    counterstake_coef100: 160,
    ratio100: 110,
    large_threshold: "10000",
    challenging_periods: [180, 180, 180, 5184000],
    large_challenging_periods: [604800, 2592000, 5184000]
};

// Create USDT Import bridge
const result = await createImportBridge(USDT_CONFIG, BRIDGE_PARAMS);
console.log('USDT Import bridge created successfully:', result);
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "Invalid P3D precompile address" Error

**Problem**: P3D precompile address validation fails.

**Solution**: Verify the P3D precompile address in your configuration:
```javascript
const P3D_PRECOMPILE_ADDRESS = "0x..."; // Correct P3D precompile address
```

#### 2. "Precompile approval failed" Error

**Problem**: The `approvePrecompile` function fails.

**Solution**: Ensure sufficient P3D balance for gas fees and verify the assistant has the correct permissions:
```javascript
// Check P3D balance for gas fees
const p3dBalance = await p3dPrecompile.balanceOf(signerAddress);
console.log(`P3D balance: ${p3dBalance.toString()}`);

// Ensure you're the manager of the assistant
const manager = await importWrapperAssistant.manager();
if (manager !== signerAddress) {
    throw new Error('You are not the manager of this assistant');
}
```

#### 3. "Oracle price feed not found" Error

**Problem**: Required Oracle price feeds are missing.

**Solution**: Ensure all required price feeds are configured:
```javascript
// Check if price feed exists
const price = await oracle.getPrice(homeAsset, "P3D");
if (price[0].eq(0) && price[1].eq(0)) {
    // Price feed is missing, set it up
    await oracle.setPrice(homeAsset, "P3D", numerator, denominator);
}
```

#### 4. "Precompile verification failed" Error

**Problem**: The wrapped token precompile is not accessible.

**Solution**: Verify the precompile exists and is properly configured:
```javascript
// Test precompile access
const symbol = await precompileContract.symbol();
console.log(`Precompile symbol: ${symbol}`);
```

#### 5. "Gas limit exceeded" Error

**Problem**: Transaction gas limit is too low.

**Solution**: Increase gas limit for bridge creation:
```javascript
{ gasLimit: 5000000 } // Increase from default
```

#### 6. "Event not found" Error

**Problem**: Assistant creation event is not found in transaction receipt.

**Solution**: Check transaction logs and ensure proper event parsing:
```javascript
// Debug transaction logs
console.log('Transaction logs:', receipt.logs);
```

### Debugging Tips

1. **Enable verbose logging**: Add detailed console.log statements
2. **Check transaction receipts**: Verify all events are emitted correctly
3. **Validate addresses**: Ensure all addresses are correct and accessible
4. **Test Oracle prices**: Verify price feeds are working before bridge creation
5. **Monitor gas usage**: Track gas consumption and adjust limits accordingly
6. **Verify precompile approval**: Always check allowance after approval for non-P3D tokens

## Best Practices

### 1. Configuration Management

- Use centralized configuration files
- Validate all addresses before use
- Implement proper error handling
- Use environment variables for sensitive data

### 2. Testing Strategy

- Test on development networks first
- Verify all components individually
- Use small amounts for initial testing
- Monitor bridge performance after deployment

### 3. Security Considerations

- Verify all contract addresses
- Use secure private key management
- Implement proper access controls
- Monitor bridge activity regularly
- **Always verify precompile approval for non-P3D tokens**

### 4. Documentation

- Document all configuration parameters
- Maintain deployment logs
- Update configuration when changes are made
- Keep track of deployed addresses

## Conclusion

Creating new Import bridges requires careful attention to configuration, Oracle setup, precompile approval, and verification. Follow this guide step-by-step to ensure successful bridge deployment. **Always remember to call `approvePrecompile` for assistants that use non-P3D tokens as stake tokens.**

For additional support, refer to the main bridge documentation and the `bridge-setup-and-test.js` script for implementation examples.
