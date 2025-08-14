# Private Key Setup Guide for Counterstake Bridge Watchdog

This guide explains how to set up private keys for the Counterstake bridge watchdog bot to sign transactions, perform counterstake operations, and assist with cross-chain transfers.

## 🔐 Overview

The watchdog bot needs private keys to:
- **Sign transactions** on EVM networks (Ethereum, BSC, 3DPass, Polygon, Kava)
- **Perform counterstake operations** when fraud is detected
- **Claim transfers** for users (earning assistant rewards)
- **Send challenges** against fraudulent claims
- **Manage Obyte wallet** for Obyte network operations

## 📋 Existing Keys Format

If you already have a `keys.json` file, here's what it contains:

### Current `keys.json` Structure
```json
{
  "mnemonic_phrase": "tooth unlock fossil diet lounge recipe snack craft noble heavy any talent",
  "temp_priv_key": "dTpS5QTeEAVn6/9/uLP+MCImWV1zSo1iiAh80rkY0qg=",
  "prev_temp_priv_key": "KjDHApOWTRsGvnLEgtAkJzUwpVVywkP935BovZxpiag="
}
```

### What Each Field Does
- **`mnemonic_phrase`**: 12-word BIP39 mnemonic that generates your EVM private keys
- **`temp_priv_key`**: Base64-encoded temporary private key for Obyte operations
- **`prev_temp_priv_key`**: Previous temporary key (for key rotation security)

### Generated Addresses
From your existing mnemonic, the bot generates:
- **EVM Address**: `0x410F43d38BAA817F37EB50731dd6626EfdAEE52D` (same across all EVM networks)
- **Private Key**: `0x4a9e1b33f857af0b8f00d64f283214f09d431b4981e8dc9fce8212029a0032f7`

### Working with Existing Keys
If you already have a `keys.json` file:
1. **Backup your existing keys** before making any changes
2. **Verify the mnemonic phrase** is correct and secure
3. **Test the generated addresses** match your expectations
4. **Fund the addresses** with the tokens you want to bridge

### Adding Your Existing Account
If you want to use your own existing account instead of the current one:

**Option 1: Use the setup script**
```bash
node setup_existing_account.js "your twelve word mnemonic phrase here"
```

**Option 2: Manual setup**
1. Backup your current `keys.json`
2. Replace the `mnemonic_phrase` with your existing 12-word mnemonic
3. The `temp_priv_key` and `prev_temp_priv_key` will be generated automatically when you start the bot

**Example:**
```json
{
  "mnemonic_phrase": "your existing twelve word mnemonic phrase here",
  "temp_priv_key": "will be generated automatically",
  "prev_temp_priv_key": "will be generated automatically"
}
```

## 📁 Key Storage Locations

### 1. Obyte Keys (`keys.json`)

**Location**: `~/Library/Application Support/counterstake-bridge/keys.json`

This file contains the Obyte wallet mnemonic phrase and is used for:
- Obyte network transactions
- Generating EVM private keys for all networks
- Admin chat authentication

### 2. User Configuration (`conf.json`)

**Location**: `~/Library/Application Support/counterstake-bridge/conf.json`

Contains additional configuration including:
- Device private key for Obyte
- Admin email settings
- Network-specific API keys

## 🚀 Step-by-Step Setup

### Step 1: Create Configuration Directory

```bash
# Create the configuration directory
mkdir -p "/Users/$USER/Library/Application Support/counterstake-bridge"
cd "/Users/$USER/Library/Application Support/counterstake-bridge"
```

### Step 2: Generate Obyte Wallet (First Time Setup)

If you don't have an existing Obyte wallet, create one:

```bash
# Install Obyte headless wallet if not already installed
npm install -g headless-obyte

# Generate a new wallet
headless-obyte --gen-wallet
```

This will create a `keys.json` file with your mnemonic phrase.

### Step 3: Set Up `keys.json`

The `keys.json` file has a specific format used by the Obyte headless wallet system:

```json
{
  "mnemonic_phrase": "your twelve word mnemonic phrase here",
  "temp_priv_key": "base64_encoded_temporary_private_key",
  "prev_temp_priv_key": "base64_encoded_previous_temporary_private_key"
}
```

**Example of existing keys.json:**
```json
{
  "mnemonic_phrase": "tooth unlock fossil diet lounge recipe snack craft noble heavy any talent",
  "temp_priv_key": "dTpS5QTeEAVn6/9/uLP+MCImWV1zSo1iiAh80rkY0qg=",
  "prev_temp_priv_key": "KjDHApOWTRsGvnLEgtAkJzUwpVVywkP935BovZxpiag="
}
```

**Key Components:**
- **`mnemonic_phrase`**: 12-word BIP39 mnemonic phrase (generates EVM private keys)
- **`temp_priv_key`**: Base64-encoded temporary private key for Obyte operations
- **`prev_temp_priv_key`**: Previous temporary private key (for key rotation)

**Generated Addresses:**
From the example mnemonic above, the bot generates:
- **EVM Address**: `0x410F43d38BAA817F37EB50731dd6626EfdAEE52D` (same across all EVM networks)
- **Private Key**: `0x4a9e1b33f857af0b8f00d64f283214f09d431b4981e8dc9fce8212029a0032f7`

**⚠️ Security Warning**: 
- Keep your mnemonic phrase secure and never share it
- The mnemonic phrase generates all your network private keys
- Back up this file securely

### Step 4: Set Up `conf.json`

Create the user configuration file:

```json
{
  "admin_email": "your-admin@example.com",
  "from_email": "bot@yourdomain.com",
  "hub": "obyte.org/bb",
  "infura_project_id": "your_infura_project_id",
  "alchemy_keys": {
    "ethereum": {
      "mainnet": "your_ethereum_mainnet_key",
      "testnet": "your_ethereum_testnet_key"
    },
    "polygon": {
      "mainnet": "your_polygon_mainnet_key",
      "testnet": "your_polygon_testnet_key"
    }
  }
}
```

**Note**: The `device_private_key` is now handled automatically by the Obyte headless wallet system using the `temp_priv_key` from `keys.json`. You don't need to specify it manually in `conf.json`.

### Step 5: Verify Key Generation

The bot automatically generates EVM private keys from your Obyte mnemonic. When you start the bot, it will display the addresses:

```bash
node run.js
```

You should see output like:
```
====== my Obyte address:  TNM2YRTJOANVGXMCFOH2FBVC3KYHZ4O6
====== my Ethereum address:  0x410F43d38BAA817F37EB50731dd6626EfdAEE52D
====== my BSC address:  0x410F43d38BAA817F37EB50731dd6626EfdAEE52D
====== my 3DPass address:  0x410F43d38BAA817F37EB50731dd6626EfdAEE52D
```

**Note**: All EVM networks (Ethereum, BSC, 3DPass, Polygon, Kava) use the same address because they're all derived from the same mnemonic phrase.

## 🔑 How Private Keys Are Used

### 1. EVM Networks (Ethereum, BSC, 3DPass, Polygon, Kava)

The bot uses the same private key (derived from Obyte mnemonic) for all EVM networks:

```javascript
// From evm-chain.js
constructor(network, factory_contract_addresses, assistant_factory_contract_addresses, provider){
    // Load mnemonic from keys.json
    let wallet = ethers.Wallet.fromMnemonic(
        JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase
    );
    
    // Connect wallet to provider
    this.#wallet = wallet.connect(provider);
    
    console.log(`====== my ${network} address: `, wallet.address);
}
```

### 2. Obyte Network

Uses the temporary private key from `keys.json` for Obyte-specific operations:

```javascript
// From obyte.js and headless-obyte
const keys = JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json'));
const temp_priv_key = keys.temp_priv_key; // Base64 encoded
// Used for Obyte transactions and admin chat
```

The Obyte system automatically handles key rotation using `temp_priv_key` and `prev_temp_priv_key`.

## 💰 Funding Your Bot

After setting up private keys, fund the bot addresses:

### 1. Obyte Network
- **Address**: Displayed as "my Obyte address"
- **Fund with**: GBYTE and any Obyte tokens you want to bridge

### 2. EVM Networks
- **Address**: Same address across all EVM networks
- **Fund with**: 
  - **Ethereum**: ETH + ERC20 tokens
  - **BSC**: BNB + BEP20 tokens  
  - **3DPass**: P3D + wrapped tokens
  - **Polygon**: MATIC + ERC20 tokens
  - **Kava**: KAVA + ERC20 tokens

### 3. Recommended Funding Strategy

```javascript
// Minimum recommended balances for each network
const MINIMUM_BALANCES = {
    'Obyte': {
        'GBYTE': '100',  // For fees and staking
        'USDT': '1000',  // For transfers
        'USDC': '1000'   // For transfers
    },
    'Ethereum': {
        'ETH': '0.5',    // For gas fees
        'USDT': '1000',  // For transfers and counterstakes
        'USDC': '1000'   // For transfers and counterstakes
    },
    'BSC': {
        'BNB': '0.1',    // For gas fees
        'BUSD': '1000'   // For transfers and counterstakes
    },
    '3DPass': {
        'P3D': '100',    // For staking and fees
        'wUSDT': '1000', // For transfers
        'wUSDC': '1000'  // For transfers
    }
};

// Your specific addresses (from existing keys.json)
const YOUR_ADDRESSES = {
    'Obyte': 'TNM2YRTJOANVGXMCFOH2FBVC3KYHZ4O6', // Will be generated
    'EVM_Networks': '0x410F43d38BAA817F37EB50731dd6626EfdAEE52D' // Same for all EVM networks
};
```

## 🔧 Advanced Configuration

### 1. Custom Private Keys (Advanced)

If you want to use different private keys for different networks:

```javascript
// Modify evm-chain.js constructor
constructor(network, factory_contract_addresses, assistant_factory_contract_addresses, provider){
    this.network = network;
    this.#factory_contract_addresses = factory_contract_addresses;
    this.#assistant_factory_contract_addresses = assistant_factory_contract_addresses;
    this.#provider = provider;
    
    // Use network-specific private key if configured
    let wallet;
    if (conf[network + '_private_key']) {
        wallet = new ethers.Wallet(conf[network + '_private_key'], provider);
    } else {
        // Fall back to mnemonic-derived key
        wallet = ethers.Wallet.fromMnemonic(
            JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase
        ).connect(provider);
    }
    
    console.log(`====== my ${network} address: `, wallet.address);
    this.#wallet = wallet;
}
```

Then add to your `conf.json`:
```json
{
  "ethereum_private_key": "0x4a9e1b33f857af0b8f00d64f283214f09d431b4981e8dc9fce8212029a0032f7",
  "bsc_private_key": "0x...",
  "threedpass_private_key": "0x..."
}
```

**Note**: The example private key above is derived from your existing mnemonic phrase. For security, use different private keys for each network in production.

### 2. Hardware Wallet Integration

For enhanced security, you can integrate hardware wallets:

```javascript
// Example with Ledger (requires additional setup)
const { LedgerSigner } = require('@ethersproject/hardware-wallets');

async function setupHardwareWallet(provider) {
    const ledger = new LedgerSigner(provider, "m/44'/60'/0'/0/0");
    return ledger;
}
```

### 3. Multi-Signature Setup

For production environments, consider multi-signature wallets:

```javascript
// Example multi-sig configuration
const MULTISIG_CONFIG = {
    'ethereum': {
        'address': '0x...',
        'threshold': 2,
        'signers': [
            '0x...', // Bot key
            '0x...', // Admin key
            '0x...'  // Backup key
        ]
    }
};
```

## 🛡️ Security Best Practices

### 1. Key Management
- **Use dedicated wallets** for the bot (don't use personal wallets)
- **Regular key rotation** for production environments
- **Secure storage** of `keys.json` (encrypted, offline backup)
- **Access control** to configuration files

### 2. Network Security
```bash
# Set proper file permissions
chmod 600 "/Users/$USER/Library/Application Support/counterstake-bridge/keys.json"
chmod 600 "/Users/$USER/Library/Application Support/counterstake-bridge/conf.json"
```

### 3. Environment Variables
For additional security, use environment variables:

```bash
# Set environment variables
export COUNTERSTAKE_MNEMONIC="your mnemonic phrase"
export COUNTERSTAKE_DEVICE_KEY="your device key"
```

Then modify the code to read from environment:
```javascript
const mnemonic = process.env.COUNTERSTAKE_MNEMONIC || 
    JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase;
```

### 4. Monitoring and Alerts
Set up monitoring for your bot addresses:

```javascript
// Add to your monitoring system
const BOT_ADDRESSES = {
    'Obyte': 'TNM2YRTJOANVGXMCFOH2FBVC3KYHZ4O6', // Will be generated
    'Ethereum': '0x410F43d38BAA817F37EB50731dd6626EfdAEE52D',
    'BSC': '0x410F43d38BAA817F37EB50731dd6626EfdAEE52D',
    '3DPass': '0x410F43d38BAA817F37EB50731dd6626EfdAEE52D',
    'Polygon': '0x410F43d38BAA817F37EB50731dd6626EfdAEE52D',
    'Kava': '0x410F43d38BAA817F37EB50731dd6626EfdAEE52D'
};
```

## 🔍 Verification Steps

### 1. Test Key Generation
```bash
# Start the bot and verify addresses
node run.js

# Check that all network addresses are displayed
# Verify the addresses match your expectations
```

### 2. Test Transaction Signing
```bash
# Send a small test transaction on each network
# Verify the bot can sign and send transactions
```

### 3. Test Counterstake Operations
```bash
# Monitor the bot during a test transfer
# Verify it can perform counterstake operations
```

## 🚨 Troubleshooting

### Common Issues

1. **"Private key not found"**
   - Check that `keys.json` exists and has correct format
   - Verify file permissions

2. **"Invalid mnemonic"**
   - Ensure mnemonic phrase is 12 words
   - Check for typos or extra spaces

3. **"Insufficient balance"**
   - Fund the bot addresses with native tokens for gas fees
   - Fund with tokens you want to bridge

4. **"Network connection failed"**
   - Check RPC endpoint configuration
   - Verify network connectivity

### Debug Commands

```bash
# Check configuration files
cat "/Users/$USER/Library/Application Support/counterstake-bridge/keys.json"
cat "/Users/$USER/Library/Application Support/counterstake-bridge/conf.json"

# Test wallet generation
node -e "
const fs = require('fs');
const { ethers } = require('ethers');
const desktopApp = require('ocore/desktop_app.js');

const keys = JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json'));
const wallet = ethers.Wallet.fromMnemonic(keys.mnemonic_phrase);
console.log('Generated address:', wallet.address);
"
```

## 📋 Summary Checklist

- [ ] Created configuration directory
- [ ] Generated or imported Obyte wallet (`keys.json`)
- [ ] Created user configuration (`conf.json`)
- [ ] Verified key generation and addresses
- [ ] Funded bot addresses with native tokens
- [ ] Funded bot addresses with bridge tokens
- [ ] Set proper file permissions
- [ ] Tested transaction signing
- [ ] Tested counterstake operations
- [ ] Set up monitoring and alerts

Once you've completed these steps, your watchdog bot will be ready to sign transactions, perform counterstake operations, and assist with cross-chain transfers across all supported networks.
