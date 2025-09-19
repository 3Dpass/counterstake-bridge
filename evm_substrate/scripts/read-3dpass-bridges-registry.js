const { ethers } = require('ethers');
const path = require('path');

// Import contract ABIs
const BridgesRegistry = require('../build/contracts/BridgesRegistry.json');

// Load configuration
const conf = require('../../conf.js');
const { getProvider } = require('../../evm/provider.js');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
    console.log(`${color}%s${colors.reset}`, message);
}

function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}

function formatDuration(seconds) {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

async function readBridgesRegistry() {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
    log('  📋 BRIDGES REGISTRY INFORMATION READER', colors.cyan);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
    
    try {
        const provider = getProvider('3DPass');
        log(`\n🔗 Connected to 3DPass network`, colors.blue);

        // Get deployed contract addresses from conf.js
        const counterstakeFactoryAddress = conf.threedpass_factory_contract_addresses[conf.version];
        const assistantFactoryAddress = conf.threedpass_assistant_factory_contract_addresses[conf.version];
        const bridgesRegistryAddress = conf.threedpass_bridges_registry_addresses[conf.version];
        const oracleAddress = conf.threedpass_oracle_addresses['3DPass'];

        log(`\n🏗️  INFRASTRUCTURE CONTRACTS:`, colors.cyan);
        log(`  🏭 CounterstakeFactory: ${counterstakeFactoryAddress}`);
        log(`  🤖 AssistantFactory: ${assistantFactoryAddress}`);
        log(`  📋 BridgesRegistry: ${bridgesRegistryAddress}`);
        log(`  🔮 Oracle: ${oracleAddress}`);

        // Create contract instance (read-only, no signer needed)
        const bridgesRegistry = new ethers.Contract(bridgesRegistryAddress, BridgesRegistry.abi, provider);

        // Test registry configuration
        log(`\n⚙️  REGISTRY CONFIGURATION:`, colors.cyan);
        const registryCounterstakeFactory = await bridgesRegistry.counterstakeFactory();
        const registryAssistantFactory = await bridgesRegistry.assistantFactory();
        log(`  🏭 Registry CounterstakeFactory: ${registryCounterstakeFactory}`);
        log(`  🤖 Registry AssistantFactory: ${registryAssistantFactory}`);
        log(`  ✅ Factory addresses match: ${registryCounterstakeFactory === counterstakeFactoryAddress && registryAssistantFactory === assistantFactoryAddress}`);

        // Get overall counts
        log(`\n📊 REGISTRY OVERVIEW:`, colors.cyan);
        const bridgeCount = await bridgesRegistry.getBridgeCount();
        const assistantCount = await bridgesRegistry.getAssistantCount();
        log(`  🌉 Total Bridges: ${bridgeCount}`);
        log(`  🤖 Total Assistants: ${assistantCount}`);

        // Get all bridges and assistants
        const allBridges = await bridgesRegistry.getAllBridges();
        const allAssistants = await bridgesRegistry.getAllAssistants();
        
        log(`\n🌉 ALL BRIDGES (${allBridges.length}):`, colors.green);
        if (allBridges.length === 0) {
            log(`  📭 No bridges registered`, colors.yellow);
        } else {
            for (let i = 0; i < allBridges.length; i++) {
                const bridgeAddress = allBridges[i];
                try {
                    const bridgeInfo = await bridgesRegistry.getBridge(bridgeAddress);
                    const bridgeType = bridgeInfo.bridgeType === 0 ? 'Export' : 'Import';
                    const createdAt = formatTimestamp(bridgeInfo.createdAt);
                    const age = formatDuration(Math.floor(Date.now() / 1000) - bridgeInfo.createdAt);
                    
                    log(`  ${i + 1}. ${bridgeAddress}`, colors.green);
                    log(`     📋 Type: ${bridgeType}`, colors.blue);
                    log(`     📅 Created: ${createdAt}`, colors.blue);
                    log(`     ⏰ Age: ${age}`, colors.blue);
                } catch (err) {
                    log(`  ${i + 1}. ${bridgeAddress} - ❌ Error: ${err.message}`, colors.red);
                }
            }
        }

        log(`\n🤖 ALL ASSISTANTS (${allAssistants.length}):`, colors.green);
        if (allAssistants.length === 0) {
            log(`  📭 No assistants registered`, colors.yellow);
        } else {
            for (let i = 0; i < allAssistants.length; i++) {
                const assistantAddress = allAssistants[i];
                try {
                    const assistantInfo = await bridgesRegistry.getAssistant(assistantAddress);
                    const assistantType = assistantInfo.assistantType === 0 ? 'Import' : 'Export';
                    const createdAt = formatTimestamp(assistantInfo.createdAt);
                    const age = formatDuration(Math.floor(Date.now() / 1000) - assistantInfo.createdAt);
                    
                    log(`  ${i + 1}. ${assistantAddress}`, colors.green);
                    log(`     📋 Type: ${assistantType}`, colors.blue);
                    log(`     📅 Created: ${createdAt}`, colors.blue);
                    log(`     ⏰ Age: ${age}`, colors.blue);
                } catch (err) {
                    log(`  ${i + 1}. ${assistantAddress} - ❌ Error: ${err.message}`, colors.red);
                }
            }
        }

        // Get bridges by type
        log(`\n🌉 BRIDGES BY TYPE:`, colors.cyan);
        const exportBridges = await bridgesRegistry.getBridgesByType(0); // Export type
        const importBridges = await bridgesRegistry.getBridgesByType(1); // Import type
        
        log(`  📤 Export Bridges (${exportBridges.length}):`, colors.magenta);
        if (exportBridges.length === 0) {
            log(`    📭 No export bridges`, colors.yellow);
        } else {
            exportBridges.forEach((address, index) => {
                log(`    ${index + 1}. ${address}`, colors.magenta);
            });
        }
        
        log(`  📥 Import Bridges (${importBridges.length}):`, colors.magenta);
        if (importBridges.length === 0) {
            log(`    📭 No import bridges`, colors.yellow);
        } else {
            importBridges.forEach((address, index) => {
                log(`    ${index + 1}. ${address}`, colors.magenta);
            });
        }

        // Get assistants by type
        log(`\n🤖 ASSISTANTS BY TYPE:`, colors.cyan);
        const exportAssistants = await bridgesRegistry.getAssistantsByType(1); // Export type
        const importAssistants = await bridgesRegistry.getAssistantsByType(0); // Import type
        
        log(`  📤 Export Assistants (${exportAssistants.length}):`, colors.magenta);
        if (exportAssistants.length === 0) {
            log(`    📭 No export assistants`, colors.yellow);
        } else {
            exportAssistants.forEach((address, index) => {
                log(`    ${index + 1}. ${address}`, colors.magenta);
            });
        }
        
        log(`  📥 Import Assistants (${importAssistants.length}):`, colors.magenta);
        if (importAssistants.length === 0) {
            log(`    📭 No import assistants`, colors.yellow);
        } else {
            importAssistants.forEach((address, index) => {
                log(`    ${index + 1}. ${address}`, colors.magenta);
            });
        }


        // Summary statistics
        log(`\n📈 SUMMARY STATISTICS:`, colors.cyan);
        log(`  🌉 Total Bridges: ${bridgeCount}`);
        log(`    📤 Export Bridges: ${exportBridges.length}`);
        log(`    📥 Import Bridges: ${importBridges.length}`);
        log(`  🤖 Total Assistants: ${assistantCount}`);
        log(`    📤 Export Assistants: ${exportAssistants.length}`);
        log(`    📥 Import Assistants: ${importAssistants.length}`);

        // Network information
        const network = await provider.getNetwork();
        const blockNumber = await provider.getBlockNumber();
        const block = await provider.getBlock(blockNumber);
        
        log(`\n🌐 NETWORK INFORMATION:`, colors.cyan);
        log(`  🔗 Network: ${network.name} (Chain ID: ${network.chainId})`);
        log(`  📦 Latest Block: ${blockNumber}`);
        log(`  ⏰ Block Timestamp: ${formatTimestamp(block.timestamp)}`);

        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);
        log('  ✅ BRIDGES REGISTRY READ COMPLETE', colors.green);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);

    } catch (err) {
        log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red);
        log('  ❌ BRIDGES REGISTRY READ FAILED', colors.red);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red);
        log(`\n❌ Error: ${err.message}`, colors.red);
        console.error(err);
        process.exit(1);
    }
}

readBridgesRegistry();
