# Real-time Bridge Monitoring

## Overview
The `realtime_monitoring.js` script provides real-time monitoring of the Counterstake Bridge logs with color-coded output and comprehensive pattern matching.

## Usage

### Basic Usage
```bash
node realtime_monitoring.js
```

### Or make it executable and run directly
```bash
chmod +x realtime_monitoring.js
./realtime_monitoring.js
```

## Command Line Arguments

### Options
| Option | Short | Description |
|--------|-------|-------------|
| `--log <path>` | `-l <path>` | Custom log file path |
| `--help` | `-h` | Show help message and exit |

### Environment Variables
| Variable | Description |
|----------|-------------|
| `COUNTERSTAKE_LOG_PATH` | Custom log file path |

### Examples

#### Basic Usage
```bash
# Auto-detect platform and use default log path
node realtime_monitoring.js
./realtime_monitoring.js
```

#### Custom Log Path
```bash
# Using command line argument
node realtime_monitoring.js --log /path/to/your/log.txt
node realtime_monitoring.js -l /path/to/your/log.txt

# Using environment variable
COUNTERSTAKE_LOG_PATH=/path/to/your/log.txt node realtime_monitoring.js
```

#### Help and Information
```bash
# Show help message
node realtime_monitoring.js --help
node realtime_monitoring.js -h
```

#### Cross-Platform Examples
```bash
# macOS
node realtime_monitoring.js
# Uses: ~/Library/Application Support/counterstake-bridge/log.txt

# Windows
node realtime_monitoring.js
# Uses: %APPDATA%/counterstake-bridge/log.txt

# Linux
node realtime_monitoring.js
# Uses: ~/.local/share/counterstake-bridge/log.txt
```

## What It Monitors

The script monitors the following log patterns from the bridge system:

### Network Events
- `new block` - New blockchain blocks
- `ping`/`pong` - Network connectivity checks
- `NewExpatriation` - Outgoing transfers
- `NewRepatriation` - Incoming transfers
- `NewClaim` - New claim events
- `FinishedClaim` - Completed claims

### Transfer Processing
- `will not try to claim` - Transfer claim attempts
- `claiming transfer` - Active claiming
- `claimed transfer` - Successful claims
- `will claim` - Claim preparation

### Challenge System
- `challenge` - Challenge events
- `handling challenge` - Challenge processing
- `claim challenged` - Claims being challenged
- `will attack` - Attack attempts
- `attacking` - Active attacks
- `will challenge` - Challenge preparation
- `challenged claim` - Claims under challenge

### Claim Management
- `handling claim` - Claim processing
- `handling withdrawal` - Withdrawal processing
- `will withdraw` - Withdrawal preparation
- `withdrawal` - Withdrawal events
- `finished as expected` - Successful completions
- `finished as fraud` - Fraudulent completions
- `fraudulent_claim` - Fraudulent claim events

### Validation & Errors
- `invalid claim` - Invalid claims
- `valid claim` - Valid claims
- `transfer candidates` - Transfer matching
- `no transfer found` - Missing transfers
- `Error` - Error messages

### System Operations
- `will wait` - Waiting operations
- `will retry` - Retry attempts
- `retrying` - Active retries
- `rechecking` - Recheck operations
- `checkUnfinishedClaims` - Claim cleanup
- `updateMaxAmounts` - Balance updates

### Network Management
- `starting`/`started` - Service startup
- `restarting` - Service restarts
- `reconnect` - Reconnection attempts
- `disconnected` - Disconnection events

### Bridge Management
- `new export` - New export bridges
- `new import` - New import bridges
- `new assistant` - New assistant contracts

### 3DPass Integration
- `3DPass Registry` - Registry operations
- `Discovering bridges` - Bridge discovery
- `Failed to discover` - Discovery failures

### Transfer Database
- `inserting transfer` - Transfer insertion
- `duplicate transfer` - Duplicate handling
- `emitting txid` - Transaction events
- `re-confirmed` - Reconfirmation events
- `forgetting unconfirmed` - Cleanup operations
- `bounced tx` - Failed transactions

## Features

- **Cross-platform compatibility** - Works on macOS, Windows, and Linux
- **Automatic path detection** - Finds the correct log file location for your OS
- **Custom path support** - Override default paths via command line or environment variables
- **Color-coded output** for easy reading
- **Timestamped logs** for each event
- **Comprehensive pattern matching** covering all bridge operations
- **Graceful shutdown** with Ctrl+C
- **Error handling** for missing log files
- **Real-time streaming** with tail -f
- **Help system** with `--help` flag

## Log File Location

The script automatically detects the log file path based on your operating system:

### Default Paths
- **macOS**: `~/Library/Application Support/counterstake-bridge/log.txt`
- **Windows**: `%APPDATA%/counterstake-bridge/log.txt`
- **Linux**: `~/.local/share/counterstake-bridge/log.txt`

### Custom Paths
You can override the default path using:
- Command line: `--log /path/to/log.txt` or `-l /path/to/log.txt`
- Environment variable: `COUNTERSTAKE_LOG_PATH=/path/to/log.txt`

## Stopping the Monitor
Press `Ctrl+C` to gracefully stop the monitoring script.

## Troubleshooting

### Log file not found
If you see "Log file not found", ensure:
1. The counterstake-bridge is running
2. The log file path is correct
3. The bridge is configured to log to the expected location

### No output
If you see no output:
1. Check if the bridge is actively processing transactions
2. Verify the log file is being written to
3. Check if the bridge is in a "catching up" state

### Permission issues
If you get permission errors:
```bash
chmod +x realtime_monitoring.js
```

## Startup Information

When you start the monitoring script, it displays:

- **Platform detection**: Shows your OS platform and architecture
- **Log file path**: The detected or specified log file location
- **Pattern count**: Number of log patterns being monitored
- **Start timestamp**: When monitoring began
- **Status**: Confirmation that monitoring started successfully

## Example Output

### Startup Banner
```
🚀 Counterstake Bridge Real-time Monitoring
🖥️  Platform: darwin (x64)
📁 Log file: /Users/jm/Library/Application Support/counterstake-bridge/log.txt
🔍 Monitoring patterns: 45 patterns
⏰ Started at: 2024-01-15T10:30:00.000Z
================================================================================

✅ Monitoring started successfully!
💡 Press Ctrl+C to stop monitoring
```

### Real-time Log Output
```
[2024-01-15T10:30:15.123Z] new block Ethereum 18500000
[2024-01-15T10:30:16.456Z] NewExpatriation event Ethereum 0x123... 1000000000000000000 100000000000000000 3DPass_address data
[2024-01-15T10:30:17.789Z] will claim a transfer on 3DPass from 0x123... amount 1000000000 reward 100000000 txid 0xabc...
[2024-01-15T10:30:18.012Z] handling claim 12345 in tx 0xdef...
[2024-01-15T10:30:19.345Z] claimed transfer from 0x123... amount 1000000000 reward 100000000: 0xghi...
```

### Help Output
```
Counterstake Bridge Real-time Monitoring

Usage:
  node realtime_monitoring.js [options]
  ./realtime_monitoring.js [options]

Options:
  --log, -l <path>    Custom log file path
  --help, -h          Show this help message

Environment Variables:
  COUNTERSTAKE_LOG_PATH    Custom log file path

Default Log Paths:
  macOS:    ~/Library/Application Support/counterstake-bridge/log.txt
  Windows:  %APPDATA%/counterstake-bridge/log.txt
  Linux:    ~/.local/share/counterstake-bridge/log.txt

Examples:
  node realtime_monitoring.js
  node realtime_monitoring.js --log /custom/path/log.txt
  COUNTERSTAKE_LOG_PATH=/custom/path/log.txt node realtime_monitoring.js
```
