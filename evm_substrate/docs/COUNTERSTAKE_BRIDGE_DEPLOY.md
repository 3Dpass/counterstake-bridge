# Counterstake Bridge Deployment Guide

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [System Architecture](#system-architecture)
4. [Deployment Process](#deployment-process)
5. [Configuration](#configuration)
6. [Contract Deployment](#contract-deployment)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Troubleshooting](#troubleshooting)
9. [Security Considerations](#security-considerations)
10. [Maintenance](#maintenance)

## Overview

The Counterstake Bridge is a cross-chain bridge system that enables secure asset transfers between different blockchain networks. This guide covers the complete deployment process for the 3DPass implementation of the Counterstake Bridge with **P3D/assets precompile integration**.

3DPass -> ETH/BSC

## Import
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

## Export
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


### Key Features
- **Cross-chain asset transfers** between 3DPass and other networks
- **P3D/assets precompile integration** for native token and assets support
- **Counterstake mechanism** for dispute resolution
- **Oracle integration** for price feeds
- **Governance system** for parameter management
- **Assistant contracts** for gas optimization

## Prerequisites

### Required Software
- **Node.js** v16+ (v18.20.2 recommended)
- **pnpm** package manager (v10.13.1+)
- **Rust** toolchain (latest stable)
- **Git** for version control
- **jq** for JSON processing

### System Requirements
- **RAM**: Minimum 8GB, Recommended 16GB
- **Storage**: 50GB+ free space
- **CPU**: 4+ cores recommended
- **Network**: Stable internet connection


### Installation Commands

```bash
# Install Node.js (macOS)
brew install node

# Install pnpm
npm install -g pnpm

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install jq (macOS)
brew install jq

# Clone the repository
git clone <repository-url>
cd 3DP-bridge
```

## System Architecture

### Core Components

```
3DPass Bridge System
├── Substrate Layer (3DPass Chain)
│   ├── Native P3D Token 
│   ├── PoscanAssets pallet // LocalAssets
│   ├── EVM Pallet
│   └── Bridge Pallet
└── EVM Layer
    └──  Counterstake Contracts
    │    ├── Bridge Infrastructure
    │    │    ├── Export/ImportWraper Contracts
    │    │    ├── Assistant Contracts
    │    │    ├── Factory Contracts
    │    │    └── BridgesRegistry // Central registry for tracking
    │    ├── Oracle System
    │    └── Governance Contracts
    ├── balances-erc20 evm precompile // P3D interaction (Native)
    │   └── P3D ERC20 Address (Native): `0x0000000000000000000000000000000000000802`
    └── assets-erc20 precompile // Assets interaction
```

### BridgesRegistry Overview

The `BridgesRegistry` contract serves as a centralized registry for tracking all deployed bridge and assistant contracts. It provides:

**Key Features:**
- **Automatic Registration**: New bridges and assistants are automatically registered upon creation
- **Type Classification**: Distinguishes between Export/Import bridges and Import/Export assistants
- **Creation Tracking**: Records timestamps for audit and monitoring purposes
- **Easy Lookup**: Multiple query functions for different use cases
- **Event Logging**: All registrations logged for external monitoring

**Registry Functions:**
- `registerBridge(address bridge, BridgeType type)` - Called by factories
- `registerAssistant(address assistant, AssistantType type)` - Called by factories
- `getBridgeCount()` / `getAssistantCount()` - Get total counts
- `getAllBridges()` / `getAllAssistants()` - Get all addresses
- `getBridgesByType(type)` / `getAssistantsByType(type)` - Filter by type
- `getBridge(address)` / `getAssistant(address)` - Get detailed info
- `isBridgeRegistered(address)` / `isAssistantRegistered(address)` - Check registration

**Integration:**
- Deployed before factory contracts to avoid circular dependencies
- Factory addresses set via `setFactories()` after deployment
- Factories automatically call registry functions when creating new contracts
### Native currency. Important!!! 

Although P3D is a natinve currency in 3dpass, it represents ERC20 token in opposed to other Ethereum-kind-of-systems leveraging the address zero  `0x0000000000000000000000000000000000000000`. 
---
P3D_PRECOMPILE Address (Native): `0x0000000000000000000000000000000000000802`
---

- The Address Zero is not allowed to be stake asset in the contracts!
- Conventional Solidiy interface for native currency is not supported by the contracts!
- The Zddress Zero, however, might be used as a default address, but never represents the native token! 

### poscan-assets-erc20 precompiles on Import only! 

The main implication of using the original version of the Counterstake bridge is the `Import.sol` contract being ERC20 token itself, which makes it impossible to interact with existing tokens. It can only create new foreign assets by cloning itself (ERC20 master contract).

The `ImportWrapper.sol` is a wrapper version of the Import contract, which allows for existing tokens interaction while following exactly the original Counterstake protocol rules. This uncovers cross-platfom integration possibilities for "3Dpass - The Ledger of Things" (LoT) and other hybrid networks. 

In `ImportWrapper.sol` the stake tokens must be either P3D (via `balances-erc20` precmpile) or `poscan-assets-erc20` precompile IERC20 interface callable from Solidity at a specific address prefixed as `0xFBFBFBFA`. The address format is `0xFBFBFBFA + <AssetId in hex>`, where the `AssetId` is an asset id from the poscan-assets Substrate based module operating within the original 3Dpass runtime. And the foreign assets (wrqpped tokens, e.g. wUSDT on LoT) must be `poscan-assets-erc20` precompile IERC20 only.


### Contract Hierarchy

1. **CounterstakeLibrary** - Core library functions
2. **Oracle** - Price feed management
3. **VotedValue Contracts** - Governance parameter storage
4. **Governance** - Administrative functions
5. **BridgesRegistry** - Central registry for bridge and assistant tracking
6. **Export/ImportWrapper** - Bridge core contracts
7. **Assistant Contracts** - Gas optimization
8. **Factory Contracts** - Contract deployment management


## Deployment Process

The Counterstake Bridge deployment follows a **two-phase process**:

### Phase 1: Infrastructure Deployment
Deploy the core infrastructure contracts that will serve as factories and templates for creating bridge instances.

### Phase 2: Bridge Creation  
Use the deployed factories to create specific bridge contracts for different token pairs and network combinations.

Cloning Flow: 

Counterstake.sol (abstract)
    ↓
Export.sol (concrete, deployed as master)
    ↓
Clones created by CounterstakeFactory.sol


Counterstake.sol (abstract)  
    ↓
ImportWrapper.sol (concrete, deployed as master)
    ↓  
Clones created by CounterstakeFactory.sol


### RUNNING AUTOMATIC DEPLOYMENT PROCEDURE

The process will proceed with the following:
1. run the node in development mode and test connectivity
2. top up accounts and Import Wrapped bridges with P3D, 
3. create assets via native Substrate extrinsics and test them via EVM precompiles:
  - `wUSDT`, `wUSDC`, `wBUSD` - foreign assets on 3dpass chain
  - `FIRE`, `WATER` - local assets on 3dpass 
4. deploy counterstake bridge contracts `./counterstake-bridge/evm/build/contracts`
5. create  bridge instances: 

Import: 
   - USDT on Ethereum -> wUSDT on 3DPass
   - USDC on Ethereum -> wUSDC on 3DPass
   - BUSD on BSC -> wBUSD on 3DPass

Export:
   - P3D on 3DPass -> wP3D on Ethereum
   - FIRE on 3DPass ->  wFIRE on Ethereum
   - WATER on 3DPass -> wWATER on Ethereum

#### Run the process with the following command:

```bash
./scripts/run-all-tests.sh --fast-blocks --no-rebuild --suite connectivity,funding,test-assets-erc20,test-transfer-assets,test-poscanAssets-set-team,test-poscanAssets-transfer-ownership,test-erc20-precompile,deploy-and-configure-counterstake,bridge-setup-and-test
```
Check the contracts addresses and deployment status: `./logs/deploy-counterstake.log` and `./logs/bridge-setup-test.log`

Config: `./scripts/bridge-test-config.json`

DETAILED DESCRIPTION

### Step 1: Environment Setup

```bash
# Set environment variables
export RPC_URL="http://localhost:9978"
export WS_URL="ws://localhost:9944"
export CHAIN_ID=1333

# Create necessary directories
mkdir -p logs test-results
```

### Step 2: Build 3DPass Node

```bash
# Build with fast-blocks feature for testing
cargo build --release --features fast-blocks

# For production (60s blocks)
cargo build --release
```

### Step 3: Start 3DPass Node

```bash
# Development mode with fast blocks
./target/release/poscan-consensus \
    --dev \
    --base-path ~/3dp-chain-test \
    --rpc-port 9978 \
    --ws-port 9944 \
    --port 30333 \
    --rpc-external \
    --ws-external \
    --unsafe-rpc-external \
    --rpc-methods unsafe \
    -lruntime=info
```

### Step 4: Start Miner

```bash
# Start block production
node miner.js --host 127.0.0.1 --port 9978
```

### Step 5: Deploy Infrastructure Contracts

```bash
# Deploy core infrastructure (Phase 1)
node scripts/test-suites/deploy-and-configure-counterstake.js
```

### Step 6: Create Bridge Instances

```bash
# Create specific bridge contracts (Phase 2)
node bridge-setup-and-test.js
```

This script uses the deployed factories to create specific bridge instances:
- **Ethereum ↔ 3DPass bridges** for different tokens
- **BSC ↔ 3DPass bridges** for different tokens  
- **Other network combinations** as configured

The factory pattern allows efficient creation of multiple bridge instances without redeploying core infrastructure.

## Configuration

### Bridge Configuration for the frontend and watchdog bots (`conf.js`)

```javascript
// 3DPass Network Configuration
exports.threedpass_factory_contract_addresses = {
    'v1.0': '0x1445f694117d847522b81A97881850DbB965db9A'
};
exports.threedpass_assistant_factory_contract_addresses = {
    'v1.0': '0x20bc80863d472aBafE45a6c6Fad87236960f6ac2'
};
exports.threedpass_bridges_registry_addresses = {
    'v1.0': '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0'
};
exports.threedpass_oracle_addresses = {
    '3DPass': '0xAc647d0caB27e912C844F27716154f54EDD519cE'
};

// P3D Precompile Configuration
exports.P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802';

// Bridge Parameters
exports.evm_min_transfer_age = 0.5 * 60; // 30 seconds for testing
exports.evm_count_blocks_for_finality = 1; // 1 block for testing
exports.evm_required_gas = 420e3 + 70e3; // 490k gas for claim + withdraw
exports.max_exposure = 0.5; // 50% of balance can be sent in counterstake
exports.recheck_timeout = 15 * 60 * 1000; // 15 minutes
```

### Solidity Compiler Configuration (`truffle-config.js`)

```javascript
compilers: {
    solc: {
        version: "0.8.13",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1  // Optimize for contract size
            },
            evmVersion: "london",
            viaIR: true  // Enable intermediate representation
        }
    }
}
```
---
## Contract Deployment procedure

### Phase 1: Infrastructure Deployment Order

The `deploy-and-configure-counterstake.js` script deploys contracts in this specific order:

1. **CounterstakeLibrary** - Core library functions
2. **Oracle** - Price feed management (with P3D price configurations)
3. **VotedValue Contracts** - Governance parameter storage
   - VotedValueUint
   - VotedValueUintArray  
   - VotedValueAddress
4. **VotedValueFactory** - Factory for creating voted value instances
5. **Governance** - Administrative functions and parameter management (using P3D precompile)
6. **GovernanceFactory** - Factory for creating governance instances
7. **Export Master Contract** - Template for export bridge contracts (P3D-integrated)
8. **Import Wrapper Master Contract** - Template for import bridge contracts (P3D-assets-precompiles integrated)
9. **BridgesRegistry** - Central registry for tracking all bridges and assistants
10. **CounterstakeFactory** - Factory for creating Export/Import bridge contracts (with registry integration)
11. **ExportAssistant** - Gas optimization template for exports
12. **ImportWrapperAssistant** - Gas optimization template for imports
13. **AssistantFactory** - Factory for creating assistant contract instances (with registry integration)

### Phase 2: Bridge Instance Creation

The `bridge-setup-and-test.js` script uses the deployed factories to create specific bridge instances:
---

### Phase 1: Infrastructure Deployment Script

The deployment process uses the `deploy-and-configure-counterstake.js` script which handles the complete infrastructure setup:

```javascript
// deploy-and-configure-counterstake.js
const { ethers } = require('ethers');

// P3D Precompile Configuration
const P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802';

// 3DPass wrapped token addresses
const wUsdt3DPassAddress = '0xfBFBfbFA000000000000000000000000000000de'; // wUSDT on 3DPass

// Ethereum token addresses
const usdtEthAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT on Ethereum

async function deployContract(contractJson, signer, ...args) {
    // Validate P3D precompile address if used in constructor arguments
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === 'string' && args[i].toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
            validateP3DPrecompileAddress(args[i]);
        }
    }
    
    const factory = new ethers.ContractFactory(
        contractJson.abi, 
        contractJson.bytecode, 
        signer
    );
    const contract = await factory.deploy(...args);
    await contract.deployed();
    return contract;
}

// Complete infrastructure deployment sequence
const csLib = await deployContract(CounterstakeLibrary, signer);

// Link CounterstakeLibrary into contracts
link(Export, 'CounterstakeLibrary', csLib.address);
link(ImportWrapper, 'CounterstakeLibrary', csLib.address);
link(ExportAssistant, 'CounterstakeLibrary', csLib.address);

// Deploy Oracle with comprehensive price feeds
const oracle = await deployContract(Oracle, signer);

// Set comprehensive Oracle price feeds
await oracle.setPrice("wUSDT", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
await oracle.setPrice("_NATIVE_", "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
await oracle.setPrice("P3D", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
await oracle.setPrice("_NATIVE", "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
await oracle.setPrice(usdtEthAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
await oracle.setPrice(usdtEthAddress, "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
await oracle.setPrice("wUSDT", usdtEthAddress, ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));

// Deploy VotedValue contracts
const votedValueUint = await deployContract(VotedValueUint, signer);
const votedValueUintArray = await deployContract(VotedValueUintArray, signer);
const votedValueAddress = await deployContract(VotedValueAddress, signer);
const votedValueFactory = await deployContract(VotedValueFactory, signer, 
    votedValueUint.address, 
    votedValueUintArray.address, 
    votedValueAddress.address
);

// Deploy Governance with P3D precompile
const governance = await deployContract(Governance, signer, csLib.address, P3D_PRECOMPILE_ADDRESS);
const governanceFactory = await deployContract(GovernanceFactory, signer, governance.address);

// Deploy Export with P3D integration
const exportMaster = await deployContract(Export, signer,
    "3DPass", // foreign_network
    wUsdt3DPassAddress, // foreign_asset (wUSDT precompile)
    P3D_PRECOMPILE_ADDRESS, // tokenAddr (stake token is P3D)
    160, // counterstake_coef100
    110, // ratio100
    ethers.utils.parseEther('10000'), // large_threshold
    [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
    [4*24*3600, 7*24*3600, 30*24*3600] // large_challenging_periods
);

// Deploy ImportWrapper with P3D integration
const importWrapperMaster = await deployContract(ImportWrapper, signer,
    "Ethereum", // home_network
    usdtEthAddress, // home_asset address
    wUsdt3DPassAddress, // precompileAddress (existing wUSDT precompile)
    P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (stake token is P3D)
    oracle.address, // oracleAddr
    160, // counterstake_coef100
    110, // ratio100
    ethers.utils.parseEther('10000'), // large_threshold
    [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
    [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
    { gasLimit: 5000000 }
);

// Deploy BridgesRegistry
const bridgesRegistry = await deployContract(BridgesRegistry, signer);

// Deploy CounterstakeFactory with registry integration
const counterstakeFactory = await deployContract(CounterstakeFactory, signer,
    exportMaster.address,
    importWrapperMaster.address,
    governanceFactory.address,
    votedValueFactory.address,
    bridgesRegistry.address
);

// Deploy Assistant contracts
const exportAssistant = await deployContract(ExportAssistant, signer,
    exportMaster.address, // bridgeAddr
    ethers.constants.AddressZero, // managerAddr
    100, // _management_fee10000
    2500, // _success_fee10000 (25%)
    oracle.address, // oracleAddr
    1, // _exponent
    "EXPS export assistant temp", // name
    "EXPS", // symbol
    { gasLimit: 90000000 }
);

const importWrapperAssistant = await deployContract(ImportWrapperAssistant, signer,
    importWrapperMaster.address, // bridgeAddr
    ethers.constants.AddressZero, // managerAddr
    100, // _management_fee10000
    2000, // _success_fee10000 (20%)
    10, // _swap_fee10000
    1, // _exponent
    "IMPS import assistant temp", // name
    "IMPS", // symbol
    { gasLimit: 119990000 }
);

// Deploy AssistantFactory with registry integration
const assistantFactory = await deployContract(AssistantFactory, signer,
    exportAssistant.address,
    importWrapperAssistant.address,
    governanceFactory.address,
    votedValueFactory.address,
    bridgesRegistry.address
);

// Set factory addresses in BridgesRegistry
await bridgesRegistry.setFactories(counterstakeFactory.address, assistantFactory.address);
```

**Key Features:**
- **P3D Precompile Integration**: Uses `0x0000000000000000000000000000000000000802` for native token operations
- **Wrapped Token Support**: Integrates with existing wUSDT, wUSDC, wBUSD precompiles
- **Oracle Price Configuration**: Sets up comprehensive price feeds for all token pairs
- **Library Linking**: Links CounterstakeLibrary into Export, ImportWrapper, and ExportAssistant contracts
- **BridgesRegistry Integration**: Centralized tracking of all bridges and assistants with automatic registration
- **Configuration Management**: Updates `conf.js` with deployed contract addresses
- **Gas Optimization**: Uses appropriate gas limits for complex deployments

### Phase 2: Bridge Creation Script

The bridge creation process uses the `bridge-setup-and-test.js` script which creates comprehensive bridge instances:

```javascript
// bridge-setup-and-test.js
const { ethers } = require('ethers');
const conf = require('../../counterstake-bridge/conf.js');

// P3D Precompile Configuration
const P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802';

// Test configuration with wrapped tokens
const TEST_CONFIG = {
    // Ethereum token addresses
    usdtEthAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT on Ethereum
    usdcEthAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
    busdBscAddress: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD on BSC
    
    // 3DPass wrapped token addresses
    wUsdt3DPassAddress: "0xfBFBfbFA000000000000000000000000000000de", // wUSDT on 3DPass
    wUsdc3DPassAddress: "0xFbfbFBfA0000000000000000000000000000006f", // wUSDC on 3DPass
    wBusd3DPassAddress: "0xFbFBFBfA0000000000000000000000000000014D", // wBUSD on 3DPass
    
    // Test parameters
    testAmount: ethers.utils.parseEther('1'),
    largeThreshold: ethers.utils.parseEther('10000'),
    priceInUSD: 1
};

// Oracle price setup for comprehensive token pairs
async function setupOraclePrices(oracle) {
    // Set up cross-chain price feeds
    await oracle.setPrice(TEST_CONFIG.usdtEthAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    await oracle.setPrice(TEST_CONFIG.usdcEthAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    await oracle.setPrice(TEST_CONFIG.busdBscAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    
    // Set up wrapped token price feeds
    await oracle.setPrice(TEST_CONFIG.wUsdt3DPassAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    await oracle.setPrice(TEST_CONFIG.wUsdc3DPassAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    await oracle.setPrice(TEST_CONFIG.wBusd3DPassAddress, "P3D", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    
    // Set up _NATIVE_ vs wrapped token symbol price feeds
    await oracle.setPrice("_NATIVE_", "wUSDT", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    await oracle.setPrice("_NATIVE_", "wUSDC", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    await oracle.setPrice("_NATIVE_", "wBUSD", ethers.utils.parseEther('1'), ethers.utils.parseEther('0.0014'));
    
    // Set up P3D vs _NATIVE_ price feed
    await oracle.setPrice("P3D", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
    
    // Set up wrapped token vs _NATIVE_ price feeds
    await oracle.setPrice("wUSDT", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
    await oracle.setPrice("wUSDC", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
    await oracle.setPrice("wBUSD", "_NATIVE_", ethers.utils.parseEther('1'), ethers.utils.parseEther('1'));
}

// Create Import Wrapper Bridges (External -> 3DPass)
async function createImportWrappers(factory) {
    // USDT Import Wrapper (Ethereum -> 3DPass)
    const importWrapperUsdtTx = await factory.createImportWrapper(
        "Ethereum", // home_network
        TEST_CONFIG.usdtEthAddress, // home_asset (USDT on Ethereum)
        TEST_CONFIG.wUsdt3DPassAddress, // precompileAddress (existing wUSDT precompile)
        P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile)
        oracleAddress, // oracleAddr
        160, // counterstake_coef100
        110, // ratio100
        TEST_CONFIG.largeThreshold, // large_threshold
        [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
        [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
        { gasLimit: 5000000 }
    );
    const importWrapperUsdtReceipt = await importWrapperUsdtTx.wait();
    const importWrapperUsdtAddress = importWrapperUsdtReceipt.events[0].args.contractAddress;
    
    // USDC Import Wrapper (Ethereum -> 3DPass)
    const importWrapperUsdcTx = await factory.createImportWrapper(
        "Ethereum", // home_network
        TEST_CONFIG.usdcEthAddress, // home_asset (USDC on Ethereum)
        TEST_CONFIG.wUsdc3DPassAddress, // precompileAddress (existing wUSDC precompile)
        P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile)
        oracleAddress, // oracleAddr
        160, // counterstake_coef100
        110, // ratio100
        TEST_CONFIG.largeThreshold, // large_threshold
        [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
        [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
        { gasLimit: 5000000 }
    );
    const importWrapperUsdcReceipt = await importWrapperUsdcTx.wait();
    const importWrapperUsdcAddress = importWrapperUsdcReceipt.events[0].args.contractAddress;
    
    // BUSD Import Wrapper (BSC -> 3DPass)
    const importWrapperBusdTx = await factory.createImportWrapper(
        "BSC", // home_network
        TEST_CONFIG.busdBscAddress, // home_asset (BUSD on BSC)
        TEST_CONFIG.wBusd3DPassAddress, // precompileAddress (existing wBUSD precompile)
        P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr (P3D precompile)
        oracleAddress, // oracleAddr
        160, // counterstake_coef100
        110, // ratio100
        TEST_CONFIG.largeThreshold, // large_threshold
        [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
        [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
        { gasLimit: 5000000 }
    );
    const importWrapperBusdReceipt = await importWrapperBusdTx.wait();
    const importWrapperBusdAddress = importWrapperBusdReceipt.events[0].args.contractAddress;
    
    return {
        importWrapperUsdtAddress,
        importWrapperUsdcAddress,
        importWrapperBusdAddress
    };
}

// Create Export Bridges (3DPass -> External)
async function createExportBridges(factory) {
    // wUSDT Export Bridge (3DPass -> Ethereum)
    const exportWUsdtTx = await factory.createExport(
        "3DPass", // foreign_network
        TEST_CONFIG.wUsdt3DPassAddress, // foreign_asset address from Import bridge
        P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr from Import bridge
        160, // counterstake_coef100
        110, // ratio100
        TEST_CONFIG.largeThreshold, // large_threshold
        [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
        [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
        { gasLimit: 5000000 }
    );
    const exportWUsdtReceipt = await exportWUsdtTx.wait();
    const exportWUsdtAddress = exportWUsdtReceipt.events[0].args.contractAddress;
    
    // wUSDC Export Bridge (3DPass -> Ethereum)
    const exportWUsdcTx = await factory.createExport(
        "3DPass", // foreign_network
        TEST_CONFIG.wUsdc3DPassAddress, // foreign_asset address from Import bridge
        P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr from Import bridge
        160, // counterstake_coef100
        110, // ratio100
        TEST_CONFIG.largeThreshold, // large_threshold
        [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
        [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
        { gasLimit: 5000000 }
    );
    const exportWUsdcReceipt = await exportWUsdcTx.wait();
    const exportWUsdcAddress = exportWUsdcReceipt.events[0].args.contractAddress;
    
    // wBUSD Export Bridge (3DPass -> BSC)
    const exportWBusdTx = await factory.createExport(
        "3DPass", // foreign_network
        TEST_CONFIG.wBusd3DPassAddress, // foreign_asset address from Import bridge
        P3D_PRECOMPILE_ADDRESS, // stakeTokenAddr from Import bridge
        160, // counterstake_coef100
        110, // ratio100
        TEST_CONFIG.largeThreshold, // large_threshold
        [14*3600, 3*24*3600, 7*24*3600, 30*24*3600], // challenging_periods
        [4*24*3600, 7*24*3600, 30*24*3600], // large_challenging_periods
        { gasLimit: 5000000 }
    );
    const exportWBusdReceipt = await exportWBusdTx.wait();
    const exportWBusdAddress = exportWBusdReceipt.events[0].args.contractAddress;
    
    return {
        exportWUsdtAddress,
        exportWUsdcAddress,
        exportWBusdAddress
    };
}

// Create Assistant contracts
async function createAssistants(assistantFactory, importWrappers, exports) {
    // Import Wrapper Assistants
    const importWrapperUsdtAssistantTx = await assistantFactory.createImportWrapperAssistant(
        importWrappers.importWrapperUsdtAddress, // bridge address
        signerAddress, // manager address
        100, // management_fee10000
        1000, // success_fee10000 (10%)
        10, // swap_fee10000
        1, // exponent
        "USDT import assistant", // name
        "USDTIA", // symbol
        { gasLimit: 3000000 }
    );
    const importWrapperUsdtAssistantReceipt = await importWrapperUsdtAssistantTx.wait();
    const importWrapperUsdtAssistantAddress = importWrapperUsdtAssistantReceipt.events[0].args.contractAddress;
    
    // Export Assistants
    const exportWUsdtAssistantTx = await assistantFactory.createExportAssistant(
        exports.exportWUsdtAddress, // bridge address
        signerAddress, // manager address
        100, // management_fee10000
        1000, // success_fee10000 (10%)
        oracleAddress, // oracle address
        1, // exponent
        "wUSDT export assistant", // name
        "wUSDTEA", // symbol
        { gasLimit: 3000000 }
    );
    const exportWUsdtAssistantReceipt = await exportWUsdtAssistantTx.wait();
    const exportWUsdtAssistantAddress = exportWUsdtAssistantReceipt.events[0].args.contractAddress;
    
    return {
        importWrapperUsdtAssistantAddress,
        exportWUsdtAssistantAddress
    };
}
```

**Key Features:**
- **Comprehensive Bridge Creation**: Creates Import Wrapper and Export bridges for USDT, USDC, and BUSD
- **Existing Precompile Integration**: Uses existing wUSDT, wUSDC, wBUSD precompiles without creating duplicates
- **Assistant Contract Creation**: Creates Import Wrapper Assistants and Export Assistants for automated processing
- **Automatic Registry Registration**: All new bridges and assistants are automatically registered in the BridgesRegistry
- **Oracle Price Configuration**: Sets up comprehensive price feeds for all token pairs
- **Cross-Chain Support**: Supports Ethereum, BSC, and 3DPass networks
- **Gas Optimization**: Uses appropriate gas limits for complex bridge deployments



## Post-Deployment Verification

### 1. Contract Verification

```bash
# Check contract deployment
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x2CA310AF11b7923D1a65240B317551a264C8AA2C","latest"],"id":1}' \
  http://localhost:9978
```

### 2. Oracle Configuration (P3D-Integrated)

```javascript
// Set P3D oracle prices (required for bridge validation)
await oracle.setPrice(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT address
    "P3D", // P3D token
    1, 1 // 1:1 ratio for testing
);

await oracle.setPrice(
    "wUSDT", // wUSDT on 3DPass
    "P3D", // P3D token
    1, 1 // 1:1 ratio for testing
);

await oracle.setPrice(
    "P3D", // P3D token
    "_NATIVE_", // Native ETH
    1, 1 // 1:1 ratio for testing
);

await oracle.setPrice(
    "Ethereum", // Ethereum network
    "P3D", // P3D token
    1, 1 // 1:1 ratio for testing
);
```

### 3. Governance Setup

```javascript
// Grant admin role
await governance.grantRole(ADMIN_ROLE, adminAddress);

// Set initial parameters
await governance.setParameter("min_transfer_age", 30);
await governance.setParameter("required_gas", 490000);
```

### 4. Bridge Testing

```bash
# Run comprehensive tests
./scripts/run-all-tests.sh --fast-blocks --no-rebuild --suite all
```

### 5. Verify Bridge Creation

```bash
# Check that bridge instances were created successfully
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["BRIDGE_CONTRACT_ADDRESS","latest"],"id":1}' \
  http://localhost:9978

# Verify factory events
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{"address":"FACTORY_ADDRESS","topics":["0x..."]}],"id":1}' \
  http://localhost:9978

# Verify BridgesRegistry registration
node scripts/test-bridges-registry-simple.js
```

## Troubleshooting

### Common Issues

#### 1. Contract Size Limit Error
```
Error: CreateContractLimit
```
**Solution**: Optimize Solidity compiler settings
```javascript
optimizer: {
    enabled: true,
    runs: 1  // Optimize for size, not gas efficiency
}
```

#### 2. Insufficient Funds Error
```
Error: insufficient funds for intrinsic transaction cost
```
**Solution**: Ensure deployment account has sufficient P3D balance
```bash
# Check balance
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xYOUR_ADDRESS","latest"],"id":1}' \
  http://localhost:9978
```

#### 3. Deployment Timeout
```
Error: Deployment timed out after 15 minutes
```
**Solution**: Increase timeout and check network stability
```bash
# Increase timeout in run-all-tests.sh
timeout 1800 node "$SCRIPT_DIR/$test_file"  # 30 minutes
```

#### 4. Node Connection Issues
```
Error: Node is not responding
```
**Solution**: Check node status and restart if necessary
```bash
# Check node process
ps aux | grep poscan-consensus

# Restart node
pkill -f poscan-consensus
./target/release/poscan-consensus --dev --rpc-port 9978
```

#### 5. Factory Contract Issues
```
Error: Factory contract not found
```
**Solution**: Verify infrastructure deployment and factory addresses
```bash
# Check if factories are deployed
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["FACTORY_ADDRESS","latest"],"id":1}' \
  http://localhost:9978

# Verify conf.js has correct factory addresses
cat counterstake-bridge/conf.js | grep -A 5 "threedpass_factory"
```

#### 6. Bridge Creation Failures
```
Error: Bridge creation failed
```
**Solution**: Check factory parameters and network configuration
```bash
# Verify oracle prices are set
node scripts/verify-oracle-prices.js

# Check network configuration
node scripts/verify-network-config.js

# Verify P3D precompile integration
node scripts/verify-p3d-integration.js

# Verify BridgesRegistry integration
node scripts/test-bridges-registry-simple.js
```

### Debug Commands

```bash
# Check node logs
tail -f logs/node.log

# Check infrastructure deployment logs
tail -f logs/deploy-counterstake.log

# Check bridge creation logs
tail -f logs/bridge-setup-test.log

# Check test results
cat test-results/comprehensive-test-report.json | jq '.'

# Verify contract addresses
cat counterstake-bridge/conf.js | grep -A 10 "threedpass"

# Check factory events
node scripts/check-factory-events.js

# Verify bridge instances
node scripts/verify-bridge-instances.js

# Verify P3D precompile integration
node scripts/verify-p3d-integration.js

# Verify BridgesRegistry functionality
node scripts/test-bridges-registry-simple.js
```

## Security Considerations

### 1. Access Control
- **Admin Roles**: Limit admin access to trusted addresses
- **Multi-sig**: Use multi-signature wallets for critical operations
- **Timelock**: Implement timelock for parameter changes

### 2. Oracle Security
- **Multiple Oracles**: Use multiple price feed sources
- **Oracle Validation**: Implement oracle validation mechanisms
- **Price Deviation**: Set maximum price deviation limits

### 3. Bridge Security
- **Counterstake Limits**: Set appropriate counterstake amounts
- **Challenge Periods**: Configure adequate challenge periods
- **Gas Limits**: Set appropriate gas limits for operations

### 4. Network Security
- **RPC Security**: Restrict RPC access in production
- **Firewall**: Configure firewall rules
- **Monitoring**: Implement comprehensive monitoring

## Maintenance

### Regular Tasks

#### 1. Oracle Updates
```javascript
// Update price feeds
await oracle.setPrice(tokenAddress, newPrice);
```

#### 2. Parameter Updates
```javascript
// Update bridge parameters
await governance.setParameter("min_transfer_age", newValue);
await governance.setParameter("required_gas", newGasLimit);
```

#### 3. Balance Monitoring
```bash
# Monitor bridge balances
node scripts/monitor-balances.js
```

#### 4. Log Analysis
```bash
# Analyze bridge activity
node scripts/analyze-activity.js
```

#### 5. Registry Monitoring
```bash
# Monitor BridgesRegistry
node scripts/monitor-registry.js

# Check registry statistics
node scripts/registry-stats.js
```

### Backup and Recovery

#### 1. Configuration Backup
```bash
# Backup configuration
cp counterstake-bridge/conf.js backup/conf-$(date +%Y%m%d).js
```

#### 2. Contract Addresses Backup
```bash
# Export contract addresses
node scripts/export-addresses.js > backup/addresses-$(date +%Y%m%d).json
```

#### 3. Recovery Procedures
```bash
# Restore configuration
cp backup/conf-$(date +%Y%m%d).js counterstake-bridge/conf.js

# Redeploy if necessary
./scripts/run-all-tests.sh --suite deploy-and-configure-counterstake
```

## Production Deployment

### Environment Variables
```bash
export NODE_ENV=production
export RPC_URL=https://rpc-http.3dpass.org
export WS_URL=wss://rpc-ws.3dpass.org
export CHAIN_ID=1333
export ADMIN_ADDRESS=0x...
export ORACLE_ADDRESS=0x...
export P3D_PRECOMPILE_ADDRESS=0x0000000000000000000000000000000000000802
```

### Production Configuration
```javascript
// Production settings
exports.evm_min_transfer_age = 5 * 60; // 5 minutes
exports.evm_count_blocks_for_finality = 20; // 20 blocks
exports.max_exposure = 0.3; // 30% of balance
exports.recheck_timeout = 30 * 60 * 1000; // 30 minutes

// P3D Precompile Configuration
exports.P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802';

// Production Oracle Prices (replace with real market prices)
exports.production_oracle_prices = {
    'USDT_P3D': { num: 1000000, den: 1 }, // 1 USDT = 1 P3D
    'P3D_NATIVE': { num: 1, den: 1000000000000000000 }, // 1 P3D = 0.001 ETH
    'WUSDT_P3D': { num: 1000000, den: 1 }, // 1 wUSDT = 1 P3D
    'ETHEREUM_P3D': { num: 1, den: 1000000000000000000 } // 1 ETH = 1000 P3D
};
```

### Monitoring Setup
```bash
# Set up monitoring
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

---

**Note**: This guide covers the deployment process for the 3DPass implementation of the Counterstake Bridge with P3D precompile integration. For other networks or custom configurations, refer to the specific network documentation and adjust parameters accordingly.

**Key Modifications in v1.1**:
- ✅ P3D precompile integration (`0x0000000000000000000000000000000000000802`)
- ✅ Export/Import contracts with P3D stake token support
- ✅ Oracle price configurations for P3D token pairs
- ✅ Governance contracts using P3D precompile for voting
- ✅ Assistant contracts with proper P3D token validation
- ✅ Production-ready oracle validation (no temporary workarounds)
- ✅ BridgesRegistry for centralized bridge and assistant tracking
- ✅ Automatic registration of new bridges and assistants
- ✅ Factory integration with registry for seamless management

**Version**: 1.1  
**Last Updated**: July 22, 2025  
**Maintainer**: 3DPass Development Team 