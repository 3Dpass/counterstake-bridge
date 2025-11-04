/**
 * BSCScan Simple Parser - Extracts block numbers from BSCScan transactions page
 * Targets: https://bscscan.com/txs?a=0x078E7A2037b63846836E9d721cf2dabC08b94281
 * Simple approach that works with the basic HTML content
 */

const fetch = require('node-fetch');
const { wait } = require('./utils.js');

/**
 * Parse BSCScan transactions page to extract block numbers and transaction hashes
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Parsed result with block numbers and transaction data
 */
async function parseBSCScanBlockNumbers(bridgeAddress, options = {}) {
  const {
    delay = 2000,
    retries = 3,
    includeTransactions = true // New option to include transaction hashes
  } = options;

  const baseUrl = 'https://bscscan.com/';
  const targetUrl = `${baseUrl}txs?a=${bridgeAddress}`;
  
  console.log(`🔍 Parsing BSCScan for block numbers${includeTransactions ? ' and transactions' : ''}: ${targetUrl}`);
  
  try {
    const result = await fetchBSCScanPage(targetUrl, { retries, delay, includeTransactions });
    
    if (result.success) {
      console.log(`✅ Successfully parsed BSCScan page`);
      console.log(`Found ${result.blockNumbers.length} block numbers`);
      if (includeTransactions && result.transactions) {
        console.log(`Found ${result.transactions.length} transaction hashes`);
      }
      return {
        success: true,
        blockNumbers: result.blockNumbers,
        transactions: result.transactions || [], // Transaction hashes with block numbers
        error: null
      };
    } else {
      return {
        success: false,
        blockNumbers: [],
        transactions: [],
        error: result.error || 'Failed to parse BSCScan page'
      };
    }
    
  } catch (error) {
    console.error('❌ Error parsing BSCScan:', error);
    return {
      success: false,
      blockNumbers: [],
      transactions: [],
      error: error.message
    };
  }
}

/**
 * Fetch BSCScan page and extract block numbers and transaction hashes
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed page result
 */
async function fetchBSCScanPage(url, options = {}) {
  const { retries = 3, delay = 1000, includeTransactions = true } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  🔄 Attempt ${attempt}/${retries} for ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 30000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      console.log(`  ✅ Fetched HTML: ${html.length} characters`);
      
      // Extract block numbers from HTML
      const blockNumbers = extractBlockNumbers(html);
      
      // Extract transaction hashes if requested
      let transactions = [];
      if (includeTransactions) {
        transactions = extractTransactions(html);
      }
      
      if (blockNumbers.length > 0) {
        return {
          success: true,
          blockNumbers: blockNumbers,
          transactions: transactions
        };
      }
      
      // If no blocks found, wait and retry
      if (attempt < retries) {
        console.log(`  ⏳ No blocks found, waiting ${delay}ms before retry...`);
        await wait(delay);
      }
      
    } catch (error) {
      console.log(`  ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < retries) {
        console.log(`  ⏳ Waiting ${delay}ms before retry...`);
        await wait(delay);
      } else {
        throw error;
      }
    }
  }
  
  return {
    success: false,
    blockNumbers: [],
    transactions: []
  };
}

/**
 * Extract block numbers from HTML content
 * @param {string} html - HTML content
 * @returns {Array} Array of block numbers
 */
function extractBlockNumbers(html) {
  const blockNumbers = [];
  
  console.log(`  🔍 Extracting block numbers from HTML (${html.length} characters)...`);
  
  // Look for block links in the HTML
  const blockLinkPattern = /<a[^>]*href="\/block\/(\d+)"[^>]*>(\d+)<\/a>/gi;
  const blockMatches = [...html.matchAll(blockLinkPattern)];
  
  console.log(`  🔍 Found ${blockMatches.length} block links in HTML`);
  
  blockMatches.forEach(match => {
    const blockNumber = parseInt(match[1], 10);
    if (blockNumber > 0 && blockNumber > 1000) { // BSC blocks are typically > 1000
      blockNumbers.push(blockNumber);
    }
  });
  
  // Remove duplicates and sort (newest first)
  const uniqueBlocks = [...new Set(blockNumbers)].sort((a, b) => b - a);
  
  console.log(`  🔍 Found ${uniqueBlocks.length} unique block numbers`);
  if (uniqueBlocks.length > 0) {
    console.log(`  📋 Block numbers: ${uniqueBlocks.slice(0, 10).join(', ')}`);
  }
  
  return uniqueBlocks;
}

/**
 * Extract transaction hashes and their block numbers from HTML content
 * @param {string} html - HTML content
 * @returns {Array} Array of transaction objects { txHash, blockNumber }
 */
function extractTransactions(html) {
  const transactions = [];
  
  console.log(`  🔍 Extracting transaction hashes from HTML (${html.length} characters)...`);
  
  // Pattern to match transaction rows in BSCScan table
  // Looks for transaction hash links and associated block numbers
  // Format: <a href="/tx/0x...">0x...</a> in a row with block number
  const txRowPattern = /<tr[^>]*>[\s\S]*?<a[^>]*href="\/tx\/(0x[a-fA-F0-9]{64})"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*href="\/block\/(\d+)"[^>]*>(\d+)<\/a>[\s\S]*?<\/tr>/gi;
  const txMatches = [...html.matchAll(txRowPattern)];
  
  console.log(`  🔍 Found ${txMatches.length} transaction rows in HTML`);
  
  txMatches.forEach(match => {
    const txHash = match[1];
    const blockNumber = parseInt(match[3], 10);
    
    if (txHash && blockNumber > 0 && blockNumber > 1000) {
      transactions.push({
        txHash: txHash.toLowerCase(),
        blockNumber: blockNumber
      });
    }
  });
  
  // Also try a simpler pattern: look for transaction hash links near block links
  // This is a fallback if the row pattern doesn't work
  if (transactions.length === 0) {
    const simpleTxPattern = /<a[^>]*href="\/tx\/(0x[a-fA-F0-9]{64})"[^>]*>/gi;
    const simpleTxMatches = [...html.matchAll(simpleTxPattern)];
    
    // Try to find block numbers near transaction hashes
    simpleTxMatches.forEach(match => {
      const txHash = match[1].toLowerCase();
      const txIndex = match.index;
      
      // Look for block number within 500 characters after the transaction hash
      const afterTx = html.substring(txIndex, txIndex + 500);
      const blockMatch = afterTx.match(/<a[^>]*href="\/block\/(\d+)"[^>]*>(\d+)<\/a>/);
      
      if (blockMatch) {
        const blockNumber = parseInt(blockMatch[1], 10);
        if (blockNumber > 0 && blockNumber > 1000) {
          // Check if we already have this transaction
          if (!transactions.find(t => t.txHash === txHash)) {
            transactions.push({
              txHash: txHash,
              blockNumber: blockNumber
            });
          }
        }
      }
    });
  }
  
  // Remove duplicates (same txHash)
  const uniqueTransactions = transactions.filter((tx, index, self) =>
    index === self.findIndex(t => t.txHash === tx.txHash)
  );
  
  // Sort by block number (newest first)
  uniqueTransactions.sort((a, b) => b.blockNumber - a.blockNumber);
  
  console.log(`  🔍 Found ${uniqueTransactions.length} unique transactions`);
  if (uniqueTransactions.length > 0) {
    console.log(`  📋 Sample transactions: ${uniqueTransactions.slice(0, 5).map(t => `${t.txHash.substring(0, 10)}...@${t.blockNumber}`).join(', ')}`);
  }
  
  return uniqueTransactions;
}

/**
 * Test the BSCScan simple parser
 * @param {string} bridgeAddress - Bridge contract address to test
 * @returns {Promise<Object>} Test result
 */
async function testBSCScanSimpleParser(bridgeAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281') {
  console.log(`🧪 Testing BSCScan Simple Parser`);
  
  try {
    const result = await parseBSCScanBlockNumbers(bridgeAddress, {
      delay: 2000,
      retries: 2
    });
    
    console.log('📊 Test Results:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Block Numbers: ${result.blockNumbers.length}`);
    console.log(`  Error: ${result.error || 'None'}`);
    
    if (result.blockNumbers.length > 0) {
      console.log('📋 Block Numbers Found:');
      result.blockNumbers.forEach((block, index) => {
        console.log(`  ${index + 1}. Block ${block}`);
      });
    }
    
    if (result.transactions && result.transactions.length > 0) {
      console.log('📋 Transactions Found:');
      result.transactions.slice(0, 10).forEach((tx, index) => {
        console.log(`  ${index + 1}. ${tx.txHash.substring(0, 16)}... @ Block ${tx.blockNumber}`);
      });
      if (result.transactions.length > 10) {
        console.log(`  ... and ${result.transactions.length - 10} more`);
      }
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      blockNumbers: [],
      error: error.message
    };
  }
}

// Export functions
module.exports = {
  parseBSCScanBlockNumbers,
  fetchBSCScanPage,
  extractBlockNumbers,
  extractTransactions,
  testBSCScanSimpleParser
};
