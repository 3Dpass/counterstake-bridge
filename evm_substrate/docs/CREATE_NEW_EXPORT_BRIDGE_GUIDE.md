# Create New Export Bridge Guide

## Overview

This guide provides step-by-step instructions for creating new Export bridges in the 3DPass Counterstake Bridge system. Export bridges enable cross-chain transfers from 3DPass to external networks (like Ethereum, BSC), where native 3DPass tokens are wrapped into foreign network assets.

## Export Bridge
Export bridge is a two-way cross-chain bridge, which is designed to deal with local assets - the assets issued on the home chain. E.g. P3D (Export on P3D) < - > wP3D (Import on Ethereum). 

Example: 
3DPass <-> ETH/BSC (TWO-WAY-BRIDGE)
```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Home Chain    │         │     Whatchdog    │         │  Foreign Chain  │
│     3DPass      │         │                  │         │   (ETH/BSC)     │
│ - P3D, FIRE     │────────►┤  - Monitor Events│────────►│ - ImportContract│
│ - ExportContract│<────────│  - Counterstake  │<────────│ - wP3D, wFIRE   │
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

## Prerequisites

Before creating a new Export bridge, ensure you have:

- **Deployed Infrastructure**: CounterstakeFactory, AssistantFactory, and Oracle contracts
- **Native Token Precompile**: The native token precompile must exist on 3DPass
- **Foreign Token Address**: The wrapped token address on the target network
- **Network Configuration**: RPC endpoints and network details
- **Account Setup**: Signer account with sufficient funds for gas fees

## Understanding Export Bridges

An Export bridge facilitates the transfer of native 3DPass tokens to external networks. When users transfer tokens from 3DPass to Ethereum/BSC, the Export bridge:

1. **Receives** the native token on 3DPass
2. **Burns** the native token on 3DPass
3. **Releases** the corresponding wrapped token on the foreign network
4. **Uses** staking mechanisms for security
5. **Provides** automated processing through assistants

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

### Token Configuration

```javascript
const TOKEN_CONFIG = {
    foreignNetwork: "Ethereum",        // Target network
    foreignAsset: "0x...",            // Wrapped token on foreign network
    stakeTokenAddr: "0xFBFBFBFA00000000000000000000000000000004", // FIRE precompile on 3DPass (AssetId 4)
    symbol: "FIRE"                    // Token symbol
};
```

### Bridge Parameters

```javascript
const BRIDGE_PARAMS = {
    counterstake_coef100: 160,        // Counterstake coefficient
    ratio100: 110,                    // Bridge ratio
    large_threshold: "10000",         // Large claim threshold
    challenging_periods: [180, 180, 180, 5184000],
    large_challenging_periods: [604800, 2592000, 5184000]
};
```

## Step-by-Step Process

### Step 1: Setup Provider and Signer

```javascript
const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(privateKey, provider);

// P3D precompile address (native currency)
const P3D_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000802";
```

### Step 2: Load Contract Instances

```javascript
const factoryJson = require('./build/contracts/CounterstakeFactory.json');
const assistantFactoryJson = require('./build/contracts/AssistantFactory.json');
const oracleJson = require('./build/contracts/Oracle.json');

const factory = new ethers.Contract(counterstakeFactory, factoryJson.abi, signer);
const assistantFactory = new ethers.Contract(assistantFactory, assistantFactoryJson.abi, signer);
const oracle = new ethers.Contract(oracle, oracleJson.abi, signer);
```

### Step 3: Setup Oracle Price Feeds

```javascript
// Setup price feeds for the token
await oracle.setPrice(
    TOKEN_CONFIG.stakeTokenAddr,       // Native token on 3DPass
    "P3D",                            // P3D on 3DPass
    ethers.utils.parseEther('1'),     // price_numerator
    ethers.utils.parseEther('0.0014'), // price_denominator
    { gasLimit: 500000 }
);

await oracle.setPrice(
    "_NATIVE_",                       // Native token
    `w${TOKEN_CONFIG.symbol}`,        // Wrapped token symbol
    ethers.utils.parseEther('1'),     // price_numerator
    ethers.utils.parseEther('0.0014'), // price_denominator
    { gasLimit: 500000 }
);
```

### Step 4: Create Export Bridge

```javascript
const exportTx = await factory.createExport(
    TOKEN_CONFIG.foreignNetwork,       // foreign_network
    TOKEN_CONFIG.foreignAsset,         // foreign_asset
    TOKEN_CONFIG.stakeTokenAddr,       // stakeTokenAddr
    BRIDGE_PARAMS.counterstake_coef100, // counterstake_coef100
    BRIDGE_PARAMS.ratio100,           // ratio100
    ethers.utils.parseEther(BRIDGE_PARAMS.large_threshold), // large_threshold
    BRIDGE_PARAMS.challenging_periods, // challenging_periods
    BRIDGE_PARAMS.large_challenging_periods, // large_challenging_periods
    { gasLimit: 9000000 }
);

const exportReceipt = await exportTx.wait();
const exportAddress = exportReceipt.events[0].args.contractAddress;
console.log(`✓ Export bridge created: ${exportAddress}`);
```

### Step 5: Create Export Assistant

```javascript
const assistantTx = await assistantFactory.createExportAssistant(
    exportAddress,                     // bridge address
    signerAddress,                     // manager address
    100,                               // management_fee10000 (1%)
    1000,                              // success_fee10000 (10%)
    oracle,                            // oracle address
    1,                                 // exponent
    `${TOKEN_CONFIG.symbol} export assistant`, // name
    `${TOKEN_CONFIG.symbol}EA`,       // symbol
    { gasLimit: 9000000 }
);

const assistantReceipt = await assistantTx.wait();
const newAssistantEvent = assistantReceipt.logs.find(log => {
    try {
        const parsedLog = assistantFactory.interface.parseLog(log);
        return parsedLog.name === 'NewExportAssistant';
    } catch (e) {
        return false;
    }
});

if (newAssistantEvent) {
    const parsedEvent = assistantFactory.interface.parseLog(newAssistantEvent);
    const assistantAddress = parsedEvent.args.contractAddress;
    console.log(`✓ Export Assistant created: ${assistantAddress}`);
} else {
    throw new Error('NewExportAssistant event not found');
}
```

### Step 6: Precompile Approval (Critical Step)

**⚠️ IMPORTANT**: If the stake token is NOT P3D (no a native token) (i.e., it's another ERC20 precompile), you MUST call the `approvePrecompile` function on the assistant to allow the bridge to spend the assistant's tokens. 

Fund the assistant contract address with both P3D (native tokens) and the precompile tokens before the Approval call.

```javascript
// Check if stake token is not P3D (needs approval)
const isNonP3DToken = TOKEN_CONFIG.stakeTokenAddr !== P3D_PRECOMPILE_ADDRESS;

if (isNonP3DToken) {
    console.log(`🔄 Approving bridge to spend assistant's ${TOKEN_CONFIG.symbol} tokens...`);
    
    try {
        const exportAssistantJson = require('./build/contracts/ExportAssistant.json');
        const exportAssistant = new ethers.Contract(assistantAddress, exportAssistantJson.abi, signer);
        
        // Call approvePrecompile function
        const approveTx = await exportAssistant.approvePrecompile({ gasLimit: 2000000 });
        await approveTx.wait();
        console.log(`✅ ${TOKEN_CONFIG.symbol} Assistant precompile approval successful: ${approveTx.hash}`);
        
        // Verify approval
        const tokenContract = new ethers.Contract(TOKEN_CONFIG.stakeTokenAddr, [
            { "constant": true, "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}], "name": "allowance", "outputs": [{"name": "", "type": "uint256"}], "type": "function" }
        ], signer);
        
        const allowance = await tokenContract.allowance(assistantAddress, exportAddress);
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

### Step 7: Verify Bridge Configuration

```javascript
const exportJson = require('./build/contracts/Export.json');
const exportContract = new ethers.Contract(exportAddress, exportJson.abi, signer);

console.log('✓ Bridge Configuration:');
console.log(`  - Foreign network: ${await exportContract.foreign_network()}`);
console.log(`  - Foreign asset: ${await exportContract.foreign_asset()}`);
console.log(`  - Stake token: ${await exportContract.settings().then(s => s.tokenAddress)}`);
```

## Complete Example

### FIRE Export Bridge Creation

```javascript
const FIRE_CONFIG = {
    foreignNetwork: "Ethereum",
    foreignAsset: "0x...", // wFIRE on Ethereum
    stakeTokenAddr: "0xFBFBFBFA00000000000000000000000000000004", // FIRE precompile on 3DPass (AssetId 4)
    symbol: "FIRE"
};

const BRIDGE_PARAMS = {
    counterstake_coef100: 160,
    ratio100: 110,
    large_threshold: "10000",
    challenging_periods: [180, 180, 180, 5184000],
    large_challenging_periods: [604800, 2592000, 5184000]
};

// Create FIRE Export bridge
const result = await createExportBridge(FIRE_CONFIG, BRIDGE_PARAMS);
console.log('FIRE Export bridge created successfully:', result);
```

## Troubleshooting

### Common Issues

1. **"Precompile approval failed"**: Ensure sufficient P3D balance for gas fees
2. **"Oracle price feed not found"**: Configure all required price feeds
3. **"Gas limit exceeded"**: Increase gas limit for bridge creation
4. **"Event not found"**: Check transaction logs and event parsing

### Debugging Tips

- Enable verbose logging
- Check transaction receipts
- Validate all addresses
- Test Oracle prices before bridge creation
- **Always verify precompile approval for non-P3D tokens**

## Best Practices

1. **Configuration Management**: Use centralized config files
2. **Testing Strategy**: Test on development networks first
3. **Security**: Verify all contract addresses and permissions
4. **Documentation**: Maintain deployment logs and track addresses

## Conclusion

Creating new Export bridges requires careful attention to configuration, Oracle setup, precompile approval, and verification. **Always remember to call `approvePrecompile` for assistants that use non-P3D tokens as stake tokens.**

For additional support, refer to the main bridge documentation and the `bridge-setup-and-test.js` script for implementation examples.
