# 3DPass Oracle Price Updater Guide

This guide explains how to set up and use the 3DPass Oracle Price Updater to automatically maintain accurate price feeds for the Counterstake bridge system.

## 🔐 Overview

The 3DPass Oracle Price Updater is responsible for:
- **Fetching P3D/USD prices** from CoinGecko API
- **Updating oracle contract** with current price ratios
- **Maintaining price feeds** for bridge operations
- **Automated scheduling** via cron jobs

## 📋 Prerequisites

### 1. Oracle Manager Keys
You need oracle manager credentials in your `keys.json` file:

```json
{
  "mnemonic_phrase": "your twelve word mnemonic phrase here",
  "temp_priv_key": "base64_encoded_temporary_private_key",
  "prev_temp_priv_key": "base64_encoded_previous_temporary_private_key",
  "oracle_manager_evm_address": "0x...",
  "oracle_manager_evm_private_key": "0x..."
}
```

### 2. Required Fields
- **`oracle_manager_evm_address`**: The EVM address that owns the oracle contract
- **`oracle_manager_evm_private_key`**: Private key for signing oracle update transactions

### 3. P3D Balance
The oracle manager address must have sufficient P3D tokens for gas fees:
- **Minimum**: ~0.4 P3D (for batch transaction with 8 price updates)
- **Recommended**: 1+ P3D (for multiple updates)

## 🚀 Manual Oracle Price Update

### Step 1: Run the Price Updater

```bash
# Navigate to the scripts directory
cd /path/to/counterstake-bridge/evm_substrate/scripts

# Run the oracle price updater
node oracle_price_updater.js
```

### Step 2: Monitor the Output

The script will display:
- ✅ **Initialization**: Network connection and key verification
- 💰 **Balance Check**: P3D balance verification
- 📊 **Price Fetching**: Current P3D/USD price from CoinGecko
- 🔄 **Price Updates**: Oracle contract updates via batch transaction
- ✅ **Verification**: Confirmation of updated prices

### Example Output:
```
[2025-01-18T10:30:00.000Z] 🚀 Initializing 3DPass Oracle Price Updater...
[2025-01-18T10:30:01.000Z] ✅ Connected to 3DPass network
[2025-01-18T10:30:01.000Z] ✅ Oracle signer address: 0x...
[2025-01-18T10:30:01.000Z] ✅ Oracle contract initialized: 0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB
[2025-01-18T10:30:01.000Z] ✅ Signer is confirmed as oracle owner
[2025-01-18T10:30:02.000Z] 💰 Checking P3D balance for signer...
[2025-01-18T10:30:02.000Z]    P3D Balance: 1.5 P3D
[2025-01-18T10:30:02.000Z]    Required for batch transaction: 0.4 P3D
[2025-01-18T10:30:02.000Z] ✅ Sufficient P3D balance for all transactions
[2025-01-18T10:30:03.000Z] 📊 Fetching P3D price from CoinGecko...
[2025-01-18T10:30:04.000Z] ✅ P3D/USD Price: $0.1234
[2025-01-18T10:30:05.000Z] 🔄 Updating all oracle prices using Batch precompile...
[2025-01-18T10:30:06.000Z] ✅ All oracle price updates completed successfully!
```

## ⏰ Automated Oracle Updates (Cron Job)

### Step 1: Setup Cron Job

**macOS/Linux:**
```bash
# Navigate to the scripts directory
cd /path/to/counterstake-bridge/evm_substrate/scripts

# Make the setup script executable
chmod +x setup_oracle_cron.sh

# Run the setup script
./setup_oracle_cron.sh
```

**Windows (Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task: "3DPass Oracle Price Updater"
3. Set trigger: Every 30 minutes
4. Set action: Start a program
   - Program: `node`
   - Arguments: `oracle_price_updater.js`
   - Start in: `C:\path\to\counterstake-bridge\evm_substrate\scripts`

### Step 2: Verify Cron Job

```bash
# Check current crontab entries
crontab -l

# Look for the oracle updater entry
# Should show: */30 * * * * cd /path/to/scripts && node oracle_price_updater.js >> /path/to/logs/oracle_updates.log 2>> /path/to/logs/oracle_updates.err
```

### Step 3: Monitor Logs

```bash
# Monitor success logs
tail -f ~/Library/Application\ Support/counterstake-bridge/logs/oracle_updates.log

# Monitor error logs
tail -f ~/Library/Application\ Support/counterstake-bridge/logs/oracle_updates.err

# Check recent updates
tail -n 50 ~/Library/Application\ Support/counterstake-bridge/logs/oracle_updates.log
```

## 📊 Price Pairs Updated

The oracle updater maintains these price pairs:

### Primary Pairs
- **P3D/wUSDT**: P3D price in wUSDT terms
- **P3D/USDT**: P3D price in USDT terms
- **wUSDT/P3D**: wUSDT price in P3D terms
- **USDT/P3D**: USDT price in P3D terms

### Native Token Pairs
- **_NATIVE_/wUSDT**: Native token (P3D) price in wUSDT terms
- **wUSDT/_NATIVE_**: wUSDT price in native token terms
- **_NATIVE_/USDT**: Native token price in USDT terms
- **USDT/_NATIVE_**: USDT price in native token terms

## 🔧 Configuration

### Update Frequency
Default: Every 30 minutes
```bash
# To change frequency, edit the cron entry:
# Every 15 minutes: */15 * * * *
# Every hour: 0 * * * *
# Every 2 hours: 0 */2 * * *
```

### Gas Parameters
The script uses optimized gas parameters for 3DPass:
```javascript
const gasParams = {
    gasLimit: 4000000,        // Higher limit for batch transaction
    maxFeePerGas: 100,        // 100 wei (not gwei!)
    maxPriorityFeePerGas: 10  // 10 wei (not gwei!)
};
```

### Token Configurations
```javascript
const TOKEN_CONFIGS = {
    P3D: {
        symbol: 'P3D',
        coingeckoId: '3dpass',
        decimals: 18
    },
    wUSDT: {
        symbol: 'wUSDT',
        address: '0xfBFBfbFA000000000000000000000000000000de',
        decimals: 6,
        usdPrice: 1.0  // Pegged to USD
    },
    USDT: {
        symbol: 'USDT',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        usdPrice: 1.0  // Pegged to USD
    }
};
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. "Oracle manager EVM private key not found"
```bash
# Check keys.json structure
cat ~/Library/Application\ Support/counterstake-bridge/keys.json

# Ensure oracle_manager_evm_private_key is present
```

#### 2. "Insufficient P3D balance"
```bash
# Check P3D balance
node -e "
const { ethers } = require('ethers');
const { getProvider } = require('./evm/provider.js');
const provider = getProvider('3DPass');
const p3dContract = new ethers.Contract('0x0000000000000000000000000000000000000802', ['function balanceOf(address) view returns (uint256)'], provider);
p3dContract.balanceOf('YOUR_ORACLE_MANAGER_ADDRESS').then(balance => console.log('P3D Balance:', ethers.utils.formatEther(balance)));
"
```

#### 3. "Signer is not the oracle owner"
```bash
# Verify oracle ownership
node -e "
const { ethers } = require('ethers');
const { getProvider } = require('./evm/provider.js');
const provider = getProvider('3DPass');
const oracleContract = new ethers.Contract('0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB', ['function owner() view returns (address)'], provider);
oracleContract.owner().then(owner => console.log('Oracle Owner:', owner));
"
```

#### 4. "Failed to fetch P3D price from CoinGecko"
- Check internet connectivity
- Verify CoinGecko API is accessible
- Check for rate limiting

#### 5. "Batch transaction failed"
- Ensure sufficient P3D balance
- Check gas parameters
- Verify oracle contract is accessible

### Debug Commands

#### Check Oracle Prices
```bash
node -e "
const { ethers } = require('ethers');
const { getProvider } = require('./evm/provider.js');

async function checkPrices() {
    const provider = getProvider('3DPass');
    const oracleContract = new ethers.Contract('0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB', ['function getPrice(string,string) view returns (uint256,uint256)'], provider);
    
    try {
        const p3dWusdt = await oracleContract.getPrice('P3D', '0xfBFBfbFA000000000000000000000000000000de');
        console.log('P3D/wUSDT:', ethers.utils.formatEther(p3dWusdt[0]) + '/' + ethers.utils.formatEther(p3dWusdt[1]));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

checkPrices();
"
```

#### Test CoinGecko API
```bash
node -e "
const { fetchCoingeckoExchangeRateCached } = require('./prices.js');
fetchCoingeckoExchangeRateCached('P3D', 'USD', true).then(price => console.log('P3D/USD:', price)).catch(console.error);
"
```

## 📁 File Locations

### Scripts
- **Price Updater**: `evm_substrate/scripts/oracle_price_updater.js`
- **Cron Setup**: `evm_substrate/scripts/setup_oracle_cron.sh`

### Logs
- **Success Logs**: `~/Library/Application Support/counterstake-bridge/logs/oracle_updates.log`
- **Error Logs**: `~/Library/Application Support/counterstake-bridge/logs/oracle_updates.err`

### Configuration
- **Keys**: `~/Library/Application Support/counterstake-bridge/keys.json`
- **Oracle Contract**: `0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB`

## 🔄 Manual Cron Management

### Add Cron Job
```bash
# Edit crontab
crontab -e

# Add this line for every 30 minutes:
*/30 * * * * cd /path/to/counterstake-bridge/evm_substrate/scripts && node oracle_price_updater.js >> ~/Library/Application\ Support/counterstake-bridge/logs/oracle_updates.log 2>> ~/Library/Application\ Support/counterstake-bridge/logs/oracle_updates.err
```

### Remove Cron Job
```bash
# Edit crontab
crontab -e

# Delete the oracle_price_updater.js line
# Save and exit
```

### List Cron Jobs
```bash
# Show all cron jobs
crontab -l

# Show only oracle-related jobs
crontab -l | grep oracle
```

## 🚨 Monitoring and Alerts

### Set Up Monitoring
```bash
# Create monitoring script
cat > monitor_oracle.sh << 'EOF'
#!/bin/bash
LOG_FILE="$HOME/Library/Application Support/counterstake-bridge/logs/oracle_updates.log"
ERROR_FILE="$HOME/Library/Application Support/counterstake-bridge/logs/oracle_updates.err"

# Check if last update was within last hour
LAST_UPDATE=$(tail -n 1 "$LOG_FILE" | grep -o '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\}' | tail -n 1)
if [ -z "$LAST_UPDATE" ]; then
    echo "❌ No recent oracle updates found"
    exit 1
fi

# Check for errors in last 10 lines
if tail -n 10 "$ERROR_FILE" | grep -q "❌"; then
    echo "❌ Oracle update errors detected"
    exit 1
fi

echo "✅ Oracle updates running normally"
EOF

chmod +x monitor_oracle.sh
```

### Alert Integration
```bash
# Add to monitoring system (e.g., Nagios, Zabbix)
# Check oracle update frequency and error rates
```

## 📋 Summary Checklist

- [ ] Oracle manager keys configured in `keys.json`
- [ ] Oracle manager address has sufficient P3D balance
- [ ] Oracle manager is the owner of the oracle contract
- [ ] Manual price update test successful
- [ ] Cron job configured and running
- [ ] Log monitoring set up
- [ ] Error alerting configured
- [ ] Regular verification of price accuracy

## 🎯 Best Practices

1. **Regular Monitoring**: Check logs daily for errors
2. **Balance Management**: Keep oracle manager address funded
3. **Backup Keys**: Secure backup of oracle manager private key
4. **Network Monitoring**: Ensure stable internet connection
5. **Price Verification**: Periodically verify oracle prices match market prices
6. **Error Handling**: Set up alerts for failed updates
7. **Documentation**: Keep track of any configuration changes

Once properly configured, the oracle price updater will automatically maintain accurate price feeds for the Counterstake bridge system, ensuring reliable cross-chain operations.
