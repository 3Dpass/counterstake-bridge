#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

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
    // Claim rejection and gas cost logs
    'the reward.*is only.*which is less than the minimum.*to justify the fees', 'will not claim',
    'required gas for claim\\+withdraw', 'getMinReward', 'fMinReward',
    '3DPass oracle fallback', 'oracle fallback.*succeeded', 'oracle fallback.*failed',
    'fetchERC20ExchangeRate.*failed', 'unable to determine min reward',
    '3DPass.*getMinReward returned null', 'using default.*P3D for claim',
    // 'bad initial state', 'Assistant.*has bad initial state', 'gross balance.*but total supply', 'will try to claim myself'
].join('|');

console.log(`${colors.cyan}${colors.bright}🚀 Counterstake Bridge Real-time Monitoring${colors.reset}`);
console.log(`${colors.yellow}🖥️  Platform: ${os.platform()} (${os.arch()})${colors.reset}`);
console.log(`${colors.yellow}📁 Log file: ${logPath}${colors.reset}`);
console.log(`${colors.blue}🔍 Monitoring patterns: ${grepPattern.length} patterns${colors.reset}`);
console.log(`${colors.green}⏰ Started at: ${new Date().toISOString()}${colors.reset}`);
console.log(`${colors.magenta}${'='.repeat(80)}${colors.reset}\n`);

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

// Pipe tail output to grep
tailProcess.stdout.pipe(grepProcess.stdin);

// Handle grep output
grepProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Add timestamp to each line
    const lines = output.split('\n').filter(line => line.trim());
    lines.forEach(line => {
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

console.log(`${colors.green}✅ Monitoring started successfully!${colors.reset}`);
console.log(`${colors.cyan}💡 Press Ctrl+C to stop monitoring${colors.reset}\n`);
