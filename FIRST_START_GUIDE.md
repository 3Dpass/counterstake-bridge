# Counterstake Bridge Watchdog - First Start Guide

This guide will help you set up the Counterstake bridge watchdog bot to monitor cross-chain bridges between Ethereum, BSC, and 3DPass.

## Prerequisites

- Node.js v18+ installed
- 3DPass dev node running at `ws://127.0.0.1:9944`
- Deployed Counterstake contracts on all networks
- Basic understanding of cross-chain bridges

## 1. Initial Setup

### 1.1 Install Dependencies

```bash
# Install dependencies
npm install

# If you encounter sqlite3 native binding issues, rebuild:
npm rebuild sqlite3
```

### 1.2 Fix Ethers.js Version

The bot requires ethers.js v5. If you have v6, downgrade:

```bash
npm uninstall ethers
npm install ethers@^5.7.2
```

## 2. Configuration

### 2.1 Create User Configuration

Create the user config directory and file:

```bash
mkdir -p "/Users/$USER/Library/Application Support/counterstake-bridge"
```

Create `/Users/$USER/Library/Application Support/counterstake-bridge/conf.json`:

```json
{
  "admin_email": "admin@example.com",
  "from_email": "bot@example.com",
  "device_private_key": "your_device_private_key_here",
  "hub": "obyte.org/bb"
}
```

### 2.2 Update Main Configuration

Edit `conf.js` to enable the networks you want to monitor:

```javascript
// Enable/disable networks
exports.disablePolygon = true;  // Disable if you don't need Polygon
exports.disableKava = true;     // Disable if you don't need Kava
exports.disableBSC = false;     // Enable BSC for your bridges

// Other settings remain default
```

## 3. Network Provider Configuration

### 3.1 Update Provider Settings

Edit `evm/provider.js` to use appropriate RPC endpoints:

```javascript
case 'BSC':
    // Use public RPC (no API key required)
    return new ethers.providers.JsonRpcProvider(
        process.env.testnet 
            ? "https://data-seed-prebsc-1-s1.binance.org:8545" 
            : "https://bsc-dataseed.binance.org"
    );

case '3DPass':
    return process.env.devnet
        ? new ethers.providers.JsonRpcProvider("http://127.0.0.1:9944")
        : new ethers.providers.WebSocketProvider(
            process.env.testnet 
                ? `ws://127.0.0.1:9944` 
                : `ws://127.0.0.1:9944`
          );
```

## 4. Bridge Setup

### 4.1 Deploy Contracts

First, deploy your Counterstake contracts on all networks using the `bridge-setup-and-test.js` script or your deployment process.

### 4.2 Set Up Database Bridges

Create a script to set up the bridges in the database. Create `setup_bridges.js`:

```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library/Application Support/counterstake-bridge/byteball-light.sqlite');
const db = new sqlite3.Database(dbPath);

// Bridge configurations based on your deployed contracts
const bridges = [
    {
        home_network: 'Ethereum',
        home_asset: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        home_asset_decimals: 6,
        home_symbol: 'USDT',
        export_aa: null, // Will be detected automatically
        export_assistant_aa: null, // Will be detected automatically
        foreign_network: '3DPass',
        foreign_asset: '0xfBFBfbFA000000000000000000000000000000de', // 3DPass USDT
        foreign_asset_decimals: 18,
        foreign_symbol: 'USDT',
        stake_asset: '0x0000000000000000000000000000000000000802', // P3D precompile
        import_aa: '0xe8E8eAb629d7e324cB97381f70E2FcD869fb6DdE', // Your deployed import contract
        import_assistant_aa: null
    },
    {
        home_network: 'Ethereum',
        home_asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        home_asset_decimals: 6,
        home_symbol: 'USDC',
        export_aa: null,
        export_assistant_aa: null,
        foreign_network: '3DPass',
        foreign_asset: '0xFbfbFBfA0000000000000000000000000000006f', // 3DPass USDC
        foreign_asset_decimals: 18,
        foreign_symbol: 'USDC',
        stake_asset: '0x0000000000000000000000000000000000000802',
        import_aa: '0xFbfbFBfA0000000000000000000000000000006f', // Your USDC import contract
        import_assistant_aa: null
    },
    {
        home_network: 'BSC',
        home_asset: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
        home_asset_decimals: 18,
        home_symbol: 'BUSD',
        export_aa: null,
        export_assistant_aa: null,
        foreign_network: '3DPass',
        foreign_asset: '0xFbFBFBfA0000000000000000000000000000014D', // 3DPass BUSD
        foreign_asset_decimals: 18,
        foreign_symbol: 'BUSD',
        stake_asset: '0x0000000000000000000000000000000000000802',
        import_aa: '0xFbFBFBfA0000000000000000000000000000014D', // Your BUSD import contract
        import_assistant_aa: null
    }
];

async function setupBridges() {
    console.log('Setting up bridges in database...');
    
    for (const bridge of bridges) {
        const sql = `
            INSERT OR REPLACE INTO bridges (
                home_network, home_asset, home_asset_decimals, home_symbol,
                export_aa, export_assistant_aa,
                foreign_network, foreign_asset, foreign_asset_decimals, foreign_symbol,
                stake_asset, import_aa, import_assistant_aa
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            bridge.home_network,
            bridge.home_asset,
            bridge.home_asset_decimals,
            bridge.home_symbol,
            bridge.export_aa,
            bridge.export_assistant_aa,
            bridge.foreign_network,
            bridge.foreign_asset,
            bridge.foreign_asset_decimals,
            bridge.foreign_symbol,
            bridge.stake_asset,
            bridge.import_aa,
            bridge.import_assistant_aa
        ];
        
        await new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) {
                    console.error('Error inserting bridge:', err);
                    reject(err);
                } else {
                    console.log(`Bridge ${this.lastID}: ${bridge.home_network} ${bridge.home_symbol} -> ${bridge.foreign_network} ${bridge.foreign_symbol}`);
                    resolve();
                }
            });
        });
    }
    
    console.log('Bridge setup complete!');
    db.close();
}

setupBridges().catch(console.error);
```

### 4.3 Run Bridge Setup

```bash
node setup_bridges.js
```

## 5. Start the Bot

### 5.1 Start the Watchdog

```bash
node run.js
```

### 5.2 Verify Connections

Check the logs to ensure all networks are connected:

```bash
tail -f "/Users/$USER/Library/Application Support/counterstake-bridge/log.txt"
```

Look for:
- `new block Ethereum XXXX` - Ethereum mainnet working
- `new block BSC XXXX` - BSC mainnet working  
- `new block 3DPass XXXX` - 3DPass devnet working
- `pong Ethereum/BSC/3DPass` - Health checks working

## 6. Troubleshooting

### 6.1 Common Issues

**Ethers.js Version Mismatch**
```bash
npm uninstall ethers
npm install ethers@^5.7.2
```

**SQLite3 Native Bindings**
```bash
npm rebuild sqlite3
```

**BSC Connection Issues**
- Ensure BSC is enabled in `conf.js`
- Check that the public RPC endpoint is accessible
- Verify no firewall blocking the connection

**3DPass Connection Issues**
- Ensure 3DPass dev node is running at `ws://127.0.0.1:9944`
- Check WebSocket URL in `evm/provider.js`
- Verify the node supports EVM compatibility

**Missing API Keys**
- The bot will work without Etherscan/BSCscan API keys
- API keys are only used for transaction history lookup
- Core monitoring works without them

### 6.2 Network Status Check

Check which networks are active:

```bash
sqlite3 "/Users/$USER/Library/Application Support/counterstake-bridge/byteball-light.sqlite" \
  "SELECT bridge_id, home_network, foreign_network, home_asset, foreign_asset FROM bridges ORDER BY bridge_id;"
```

### 6.3 Log Monitoring

Monitor real-time activity:

```bash
# All logs
tail -f "/Users/$USER/Library/Application Support/counterstake-bridge/log.txt"

# Network-specific logs
grep -i "ethereum\|bsc\|3dpass" "/Users/$USER/Library/Application Support/counterstake-bridge/log.txt"

# Bridge events
grep -i "import\|export\|claim\|challenge" "/Users/$USER/Library/Application Support/counterstake-bridge/log.txt"
```

## 7. Bridge Monitoring

The bot will automatically:

- Monitor new blocks on all networks
- Detect transfer events from home networks to 3DPass
- Process claim events on 3DPass
- Handle challenge events
- Assist with bridge operations

## 8. Current Bridge Configuration

Based on your setup, the bot monitors:

| Bridge ID | Home Network | Asset | Foreign Network | Asset |
|-----------|--------------|-------|-----------------|-------|
| 4 | Ethereum | USDT | 3DPass | USDT |
| 5 | Ethereum | USDC | 3DPass | USDC |
| 6 | BSC | BUSD | 3DPass | BUSD |

## 9. Environment Variables

Optional environment variables:

```bash
export devnet=true          # Use devnet/testnet
export testnet=true         # Use testnet
export BSC_provider="wss://your-bsc-endpoint"  # Custom BSC provider
export Ethereum_provider="wss://your-eth-endpoint"  # Custom ETH provider
```

## 10. Maintenance

### 10.1 Regular Checks

- Monitor log files for errors
- Check network connectivity
- Verify bridge contract addresses are current
- Update API keys if needed

### 10.2 Restart Bot

```bash
pkill -f "node run.js"
node run.js
```

## Support

For issues:
1. Check the logs for error messages
2. Verify network connectivity
3. Ensure all contracts are deployed and accessible
4. Check that 3DPass dev node is running

The bot is now ready to monitor your cross-chain bridges between Ethereum, BSC, and 3DPass! 