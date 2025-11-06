#!/usr/bin/env node

/**
 * Test script for BSCScan Simple Parser
 * Tests extraction of block numbers, transaction hashes, and event logs
 */

const { testBSCScanSimpleParser } = require('./bscscan-simple-parser');

// Bridge contract address from the example
const bridgeAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281';

async function runTest() {
  console.log('='.repeat(60));
  console.log('BSCScan Parser Test');
  console.log('='.repeat(60));
  console.log(`Bridge Address: ${bridgeAddress}`);
  console.log('Testing: Block numbers, Transaction hashes, and Event logs');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Test with event logs enabled
    const result = await testBSCScanSimpleParser(bridgeAddress, {
      includeEventLogs: true
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Success: ${result.success}`);
    console.log(`📦 Pages Fetched: ${result.pagesFetched}`);
    console.log(`🔢 Block Numbers: ${result.blockNumbers.length}`);
    console.log(`📝 Transactions: ${result.transactions.length}`);
    
    // Count total event logs
    const totalEventLogs = result.transactions.reduce((sum, tx) => {
      return sum + (tx.eventLogs ? tx.eventLogs.length : 0);
    }, 0);
    console.log(`📋 Event Logs: ${totalEventLogs}`);
    
    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
    }

    // Show detailed event log information for first few transactions
    if (result.transactions && result.transactions.length > 0) {
      console.log('');
      console.log('='.repeat(60));
      console.log('Detailed Event Log Information');
      console.log('='.repeat(60));
      
      const transactionsWithLogs = result.transactions.filter(tx => tx.eventLogs && tx.eventLogs.length > 0);
      
      if (transactionsWithLogs.length > 0) {
        transactionsWithLogs.slice(0, 3).forEach((tx, txIndex) => {
          console.log('');
          console.log(`Transaction ${txIndex + 1}: ${tx.txHash.substring(0, 20)}...`);
          console.log(`  Block: ${tx.blockNumber}`);
          console.log(`  Event Logs: ${tx.eventLogs.length}`);
          
          tx.eventLogs.forEach((log, logIndex) => {
            console.log(`  └─ Event ${logIndex + 1}: ${log.name || 'Unknown'}`);
            console.log(`     Address: ${log.address || 'Unknown'}`);
            
            if (log.topics && log.topics.length > 0) {
              console.log(`     Topics:`);
              log.topics.forEach(topic => {
                console.log(`       [${topic.index}]: ${topic.value}`);
                if (topic.decoded) {
                  console.log(`         Decoded: ${topic.decoded}`);
                }
              });
            }
            
            if (log.data && Object.keys(log.data).length > 0) {
              console.log(`     Data Parameters:`);
              Object.entries(log.data).forEach(([key, value]) => {
                const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
                console.log(`       ${key}: ${displayValue}`);
              });
            }
          });
        });
      } else {
        console.log('No event logs found in transactions.');
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Test completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('Test Failed with Error:');
    console.error('='.repeat(60));
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

