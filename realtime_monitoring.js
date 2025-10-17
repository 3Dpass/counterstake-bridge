#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const conf = require('./conf.js');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Universal log file path detection
// macOS: ~/Library/Application Support/counterstake-bridge/log.txt
// Windows: %APPDATA%/counterstake-bridge/log.txt
// Linux: ~/.local/share/counterstake-bridge/log.txt
function getLogPath() {
    // Check for custom log path via command line argument
    const args = process.argv.slice(2);
    const logArgIndex = args.findIndex(arg => arg === '--log' || arg === '-l');
    if (logArgIndex !== -1 && args[logArgIndex + 1]) {
        return path.resolve(args[logArgIndex + 1]);
    }
    
    // Check for environment variable
    if (process.env.COUNTERSTAKE_LOG_PATH) {
        return path.resolve(process.env.COUNTERSTAKE_LOG_PATH);
    }
    
    // Platform-specific default paths
    const platform = os.platform();
    const homeDir = os.homedir();
    
    switch (platform) {
        case 'darwin': // macOS
            return path.join(homeDir, 'Library', 'Application Support', 'counterstake-bridge', 'log.txt');
        case 'win32': // Windows
            return path.join(homeDir, 'AppData', 'Roaming', 'counterstake-bridge', 'log.txt');
        case 'linux': // Linux
            return path.join(homeDir, '.local', 'share', 'counterstake-bridge', 'log.txt');
        default:
            // Fallback to current directory
            return path.join(process.cwd(), 'log.txt');
    }
}

// Help function
function showHelp() {
    console.log(`${colors.cyan}${colors.bright}Counterstake Bridge Real-time Monitoring${colors.reset}\n`);
    console.log(`${colors.yellow}Usage:${colors.reset}`);
    console.log(`  node realtime_monitoring.js [options]`);
    console.log(`  ./realtime_monitoring.js [options]\n`);
    console.log(`${colors.yellow}Options:${colors.reset}`);
    console.log(`  --log, -l <path>    Custom log file path`);
    console.log(`  --help, -h          Show this help message\n`);
    console.log(`${colors.yellow}Environment Variables:${colors.reset}`);
    console.log(`  COUNTERSTAKE_LOG_PATH    Custom log file path\n`);
    console.log(`${colors.yellow}Default Log Paths:${colors.reset}`);
    console.log(`  macOS:    ~/Library/Application Support/counterstake-bridge/log.txt`);
    console.log(`  Windows:  %APPDATA%/counterstake-bridge/log.txt`);
    console.log(`  Linux:    ~/.local/share/counterstake-bridge/log.txt\n`);
    console.log(`${colors.yellow}Examples:${colors.reset}`);
    console.log(`  node realtime_monitoring.js`);
    console.log(`  node realtime_monitoring.js --log /custom/path/log.txt`);
    console.log(`  COUNTERSTAKE_LOG_PATH=/custom/path/log.txt node realtime_monitoring.js`);
}

// Check for help argument
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
}

const logPath = getLogPath();

// Comprehensive grep pattern for all relevant logs from transfers.js and network files
const grepPattern = [
    'new block', 'ping', 'pong',
    'NewExpatriation', 'NewRepatriation', 'NewClaim', 'FinishedClaim',
    'will not try to claim', 'claiming transfer', 'challenge', 'handling challenge', 'claim challenged',
    'will claim', 'claimed transfer', 'will attack', 'attacking', 'will challenge', 'challenged claim',
    'handling claim', 'handling withdrawal', 'will withdraw', 'withdrawal',
    'finished as expected', 'finished as fraud', 'fraudulent_claim',
    'invalid claim', 'valid claim', 'transfer candidates', 'no transfer found',
    'will wait', 'will retry', 'retrying', 'rechecking',
    'checkUnfinishedClaims', 'updateMaxAmounts', 'starting', 'started', 'restarting',
    'reconnect', 'disconnected', 'new export', 'new import', 'new assistant',
    'inserting transfer', 'duplicate transfer', 'emitting txid', 're-confirmed',
    'forgetting unconfirmed', 'bounced tx', '3DPass Registry', 'Discovering bridges',
    'Failed to discover', 'Error', '❌', '✅', '🔍',
    'WARNING: stake_asset is null', 'stake_asset is null for bridge',
    // Sync status logs (will be filtered based on transfer ID threshold)
    '🔄 Syncing\\.\\.\\.',
    // Claim rejection and gas cost logs
    'the reward.*is only.*which is less than the minimum.*to justify the fees', 'will not claim',
    'required gas for claim\\+withdraw', 'getMinReward', 'fMinReward',
    '3DPass oracle fallback', 'oracle fallback.*succeeded', 'oracle fallback.*failed',
    'fetchERC20ExchangeRate.*failed', 'unable to determine min reward',
    '3DPass.*getMinReward returned null', 'using default.*P3D for claim',
    // Balance and notification patterns
    'not enough balance', 'Insufficient balance', 'Skipping notification',
    'dst amount', 'staked_bal', 'claimed_bal', 'balance available for counterstaking',
    // Withdrawal patterns
    'checkUnfinishedClaims', 'unfinished claims', 'will withdraw', 'withdrawal', 'withdrawing',
    'withdraw_delay', 'withdraw delay', 'withdraw eligibility', 'withdraw attempt',
    // 'bad initial state', 'Assistant.*has bad initial state', 'gross balance.*but total supply', 'will try to claim myself'
].join('|');

// Configuration for notification threshold (should match conf.js)
const ADMIN_NOTIFICATION_THRESHOLD = 3668; // Skip notifications for old transfers (transfer_id <= this value)

// Throttling for sync logs - only show one per time period
let lastSyncLogTime = 0;
const SYNC_LOG_THROTTLE_MS = conf.statsLogPeriod; // Use configurable interval from conf.js

// Track current transfer ID range globally
let currentMaxTransferId = 0;
let currentTransferCount = 0;
let currentBridgeCount = 0;

// Toggle for full log display
let showFullLogs = false;

    // Function to get current transfer ID range from print_bridges.js and check_transfers.js
    async function getCurrentTransferIdRange() {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            let bridgeCount = currentBridgeCount; // Keep existing bridge count as fallback
            let maxId = currentMaxTransferId; // Keep existing max ID as fallback
            let transferCount = currentTransferCount; // Keep existing transfer count as fallback
            
            // Get bridge count from print_bridges.js
            try {
                const { stdout: bridgesOutput } = await execAsync('node print_bridges.js');
                const bridgeCountMatch = bridgesOutput.match(/Found (\d+) bridge\(s\) in database/);
                if (bridgeCountMatch) {
                    bridgeCount = parseInt(bridgeCountMatch[1]);
                }
            } catch (bridgesError) {
                // Silently continue with existing bridge count
            }
            
            // Get transfer ID range and count from check_transfers.js
            try {
                const { stdout: transfersOutput } = await execAsync('node check_transfers.js');
                const transferIdMatch = transfersOutput.match(/Transfer ID range: (\d+) to (\d+)/);
                const transferCountMatch = transfersOutput.match(/Total transfers: (\d+)/);
                
                if (transferIdMatch) {
                    maxId = parseInt(transferIdMatch[2]);
                }
                if (transferCountMatch) {
                    transferCount = parseInt(transferCountMatch[1]);
                }
            } catch (transfersError) {
                // Silently continue with existing values
            }
            
            // Always update values and log if they've changed
            if (maxId !== currentMaxTransferId || transferCount !== currentTransferCount || bridgeCount !== currentBridgeCount) {
                currentMaxTransferId = maxId;
                currentTransferCount = transferCount;
                currentBridgeCount = bridgeCount;
                console.log(`${colors.yellow}[${new Date().toISOString()}] 🔄 Syncing... Bridges: ${bridgeCount} Current transfer ID range: ${currentMaxTransferId} Transfers: ${transferCount} Target -> ${ADMIN_NOTIFICATION_THRESHOLD}${colors.reset}`);
            }
            
            return maxId;
        } catch (error) {
            // Silently continue with existing values
            return currentMaxTransferId;
        }
    }

console.log(`${colors.cyan}${colors.bright}🚀 Counterstake Bridge Real-time Monitoring${colors.reset}`);
console.log(`${colors.yellow}🖥️  Platform: ${os.platform()} (${os.arch()})${colors.reset}`);
console.log(`${colors.yellow}📁 Log file: ${logPath}${colors.reset}`);
console.log(`${colors.blue}🔍 Monitoring patterns: ${grepPattern.length} patterns${colors.reset}`);
console.log(`${colors.blue}📊 Log filtering: Only show sync logs when transfer ID <= ${ADMIN_NOTIFICATION_THRESHOLD}, show all logs when transfer ID > ${ADMIN_NOTIFICATION_THRESHOLD}${colors.reset}`);
console.log(`${colors.blue}⏱️  Sync log throttling: ${SYNC_LOG_THROTTLE_MS/1000}s interval${colors.reset}`);
console.log(`${colors.blue}⌨️  Press Ctrl+D to toggle reach log display${colors.reset}`);
console.log(`${colors.green}⏰ Started at: ${new Date().toISOString()}${colors.reset}`);
console.log(`${colors.magenta}${'='.repeat(80)}${colors.reset}\n`);

// Get initial transfer ID range
getCurrentTransferIdRange().then(() => {
    console.log(`${colors.blue}[${new Date().toISOString()}] 🔄 Syncing... Bridges: ${currentBridgeCount} Current transfer ID range: ${currentMaxTransferId} Transfers: ${currentTransferCount} Target -> ${ADMIN_NOTIFICATION_THRESHOLD}${colors.reset}`);
});

// Update transfer ID range every statsLogPeriod seconds
const statsInterval = setInterval(() => {
    getCurrentTransferIdRange();
}, conf.statsLogPeriod);

// Handle keyboard input for Ctrl+D toggle (only if stdin is a TTY)
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
        // Check for Ctrl+D (ASCII 4)
        if (key === '\u0004') {
            showFullLogs = !showFullLogs;
            const status = showFullLogs ? 'ENABLED' : 'DISABLED';
            const color = showFullLogs ? colors.green : colors.yellow;
            console.log(`\n${color}📋 Full log display: ${status}${colors.reset}`);
            console.log(`${colors.blue}📊 Current mode: ${showFullLogs ? 'Showing all logs' : 'Filtered mode (sync logs only when transfer ID <= ' + ADMIN_NOTIFICATION_THRESHOLD + ')'}${colors.reset}\n`);
        }
        // Check for Ctrl+C to exit
        else if (key === '\u0003') {
            cleanup();
        }
    });
} else {
    console.log(`${colors.yellow}⚠️  Keyboard input not available (not a TTY). Ctrl+D toggle disabled.${colors.reset}`);
}

// Handle SIGINT (Ctrl+C) for graceful shutdown
process.on('SIGINT', cleanup);

// Handle SIGTERM for graceful shutdown
process.on('SIGTERM', cleanup);

// Check if log file exists
const fs = require('fs');
if (!fs.existsSync(logPath)) {
    console.error(`${colors.red}❌ Log file not found: ${logPath}${colors.reset}`);
    console.error(`${colors.yellow}💡 Make sure the counterstake-bridge is running and logging to this path${colors.reset}`);
    process.exit(1);
}

// Spawn the tail command with grep
const tailProcess = spawn('tail', ['-f', logPath]);
const grepProcess = spawn('grep', ['--color=always', '-E', grepPattern], {
    stdio: ['pipe', 'pipe', 'pipe']
});

// Cleanup function to properly shut down all processes and intervals
let isShuttingDown = false;
function cleanup() {
    if (isShuttingDown) {
        console.log(`\n${colors.red}🛑 Force killing...${colors.reset}`);
        process.exit(1);
    }
    
    isShuttingDown = true;
    console.log(`\n${colors.yellow}🛑 Shutting down monitoring...${colors.reset}`);
    
    // Clear the stats interval
    if (statsInterval) {
        clearInterval(statsInterval);
    }
    
    // Kill child processes
    if (tailProcess) {
        tailProcess.kill('SIGTERM');
    }
    if (grepProcess) {
        grepProcess.kill('SIGTERM');
    }
    
    // Exit the process
    process.exit(0);
}

// Pipe tail output to grep
tailProcess.stdout.pipe(grepProcess.stdin);

// Handle grep output
grepProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Add timestamp to each line
    const lines = output.split('\n').filter(line => line.trim());
    lines.forEach(line => {
        // Check if this line contains transfer ID range info and update global state
        const transferIdMatch = line.match(/Transfer ID range: (\d+) to (\d+)/);
        if (transferIdMatch) {
            currentMaxTransferId = parseInt(transferIdMatch[2]);
        }
        
        // If full logs are enabled, show all logs regardless of threshold
        if (showFullLogs) {
            const timestamp = new Date().toISOString();
            console.log(`${colors.blue}[${timestamp}]${colors.reset} ${line}`);
            return;
        }
        
        // If we're below the threshold, only show sync logs
        if (currentMaxTransferId > 0 && currentMaxTransferId <= ADMIN_NOTIFICATION_THRESHOLD) {
            // Only show sync logs when below threshold
            if (line.includes('🔄 Syncing')) {
                // Throttle sync logs - only show one per time period
                const now = Date.now();
                if (now - lastSyncLogTime < SYNC_LOG_THROTTLE_MS) {
                    return; // Skip this log line due to throttling
                }
                
                // Extract network name and stats
                const networkMatch = line.match(/🔄 Syncing (\w+)\.\.\./);
                const statsMatch = line.match(/Total bridges: (\d+) Total transfers: (\d+)/);
                
                if (networkMatch && statsMatch) {
                    const network = networkMatch[1];
                    const bridges = statsMatch[1];
                    const transfers = statsMatch[2];
                    
                    // Show combined summary
                    const timestamp = new Date().toISOString();
                    console.log(`${colors.blue}[${timestamp}]${colors.reset} 🔄 Syncing... Networks: ${network} | Total bridges: ${bridges} | Total transfers: ${transfers} | Transfer ID range: ${transferIdMatch[1]} to ${transferIdMatch[2]}`);
                    
                    lastSyncLogTime = now;
                    return; // Skip the original log line
                }
            }
            // Suppress all other logs when below threshold
            return;
        }
        
        // If we're above the threshold, show all logs normally
        const timestamp = new Date().toISOString();
        console.log(`${colors.blue}[${timestamp}]${colors.reset} ${line}`);
    });
});

// Handle grep errors
grepProcess.stderr.on('data', (data) => {
    console.error(`${colors.red}Grep error: ${data}${colors.reset}`);
});

// Handle process errors
tailProcess.on('error', (err) => {
    console.error(`${colors.red}❌ Tail process error: ${err.message}${colors.reset}`);
});

grepProcess.on('error', (err) => {
    console.error(`${colors.red}❌ Grep process error: ${err.message}${colors.reset}`);
});

// Handle process exit
tailProcess.on('exit', (code) => {
    console.log(`${colors.yellow}📊 Tail process exited with code: ${code}${colors.reset}`);
});

grepProcess.on('exit', (code) => {
    console.log(`${colors.yellow}📊 Grep process exited with code: ${code}${colors.reset}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}🛑 Shutting down monitoring...${colors.reset}`);
    tailProcess.kill();
    grepProcess.kill();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(`\n${colors.yellow}🛑 Shutting down monitoring...${colors.reset}`);
    tailProcess.kill();
    grepProcess.kill();
    process.exit(0);
});

// Keep the process alive
process.stdin.resume();

console.log(`${colors.green}✅ Monitoring started successfully! Processing...${colors.reset}`);
console.log(`${colors.cyan}💡 Press Ctrl+C to stop monitoring.${colors.reset}\n`);
