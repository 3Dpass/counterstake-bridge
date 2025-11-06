/**
 * BSCScan Simple Parser - Extracts block numbers, transactions, and event logs from BSCScan
 * Targets: 
 *   - Transactions page: https://bscscan.com/txs?a=0x078E7A2037b63846836E9d721cf2dabC08b94281
 *   - Transaction detail: https://bscscan.com/tx/0x.../#eventlog
 * Simple approach that works with the basic HTML content
 * 
 * Features:
 *   - Extract block numbers from transaction listings
 *   - Extract transaction hashes and block numbers
 *   - Optionally fetch and extract event logs from transaction detail pages
 *   - Event logs include: event name, contract address, topics, and decoded data parameters
 */

const fetch = require('node-fetch');
const { wait } = require('./utils.js');

/**
 * Parse BSCScan transactions page to extract block numbers and transaction hashes
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Parsing options
 * @param {boolean} options.maxPages - Maximum number of pages to fetch (default: 10, 0 = all pages)
 * @param {boolean} options.includeEventLogs - Whether to fetch and extract event logs for each transaction (default: false)
 * @returns {Promise<Object>} Parsed result with block numbers and transaction data
 */
async function parseBSCScanBlockNumbers(bridgeAddress, options = {}) {
  const {
    delay = 2000,
    retries = 3,
    includeTransactions = true, // New option to include transaction hashes
    includeEventLogs = false, // New option to fetch event logs for each transaction
    maxPages = 10 // Maximum pages to fetch (0 = all pages, default: 10 to avoid excessive requests)
  } = options;

  const baseUrl = 'https://bscscan.com/';
  
  console.log(`🔍 Parsing BSCScan for block numbers${includeTransactions ? ' and transactions' : ''}${includeEventLogs ? ' with event logs' : ''} (max ${maxPages === 0 ? 'all' : maxPages} pages)`);
  
  try {
    const allBlockNumbers = new Set();
    const allTransactions = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages && (maxPages === 0 || page <= maxPages)) {
      // BSCScan pagination: p parameter (1-indexed)
      const targetUrl = `${baseUrl}txs?a=${bridgeAddress}&p=${page}`;
      console.log(`📄 Fetching page ${page}...`);
      
      const result = await fetchBSCScanPage(targetUrl, { retries, delay, includeTransactions });
      
      if (!result.success) {
        console.log(`⚠️  Failed to fetch page ${page}, stopping pagination`);
        break;
      }
      
      // Add block numbers
      result.blockNumbers.forEach(block => allBlockNumbers.add(block));
      
      // Add transactions (avoid duplicates)
      if (result.transactions) {
        result.transactions.forEach(tx => {
          if (!allTransactions.find(t => t.txHash === tx.txHash)) {
            allTransactions.push(tx);
          }
        });
      }
      
      console.log(`  ✅ Page ${page}: Found ${result.blockNumbers.length} blocks, ${result.transactions?.length || 0} transactions`);
      
      // Check if there are more pages using the detection from fetchBSCScanPage
      hasMorePages = result.hasMorePages;
      
      // Also stop if we got no results (empty page)
      if (result.blockNumbers.length === 0 && (!result.transactions || result.transactions.length === 0)) {
        hasMorePages = false;
      }
      
      page++;
      
      // Add delay between pages to avoid rate limiting
      if (hasMorePages && (maxPages === 0 || page <= maxPages)) {
        await wait(delay);
      }
    }
    
    const uniqueBlocks = Array.from(allBlockNumbers).sort((a, b) => b - a);
    const sortedTransactions = allTransactions.sort((a, b) => b.blockNumber - a.blockNumber);
    
    console.log(`✅ Successfully parsed BSCScan (${page - 1} page(s))`);
    console.log(`Found ${uniqueBlocks.length} unique block numbers`);
    if (includeTransactions) {
      console.log(`Found ${sortedTransactions.length} unique transaction hashes`);
    }
    
    // Fetch event logs for each transaction if requested
    if (includeEventLogs && sortedTransactions.length > 0) {
      console.log(`\n📋 Fetching event logs for ${sortedTransactions.length} transactions...`);
      
      for (let i = 0; i < sortedTransactions.length; i++) {
        const tx = sortedTransactions[i];
        console.log(`  [${i + 1}/${sortedTransactions.length}] Fetching event logs for ${tx.txHash.substring(0, 16)}...`);
        
        try {
          const eventLogs = await fetchTransactionEventLogs(tx.txHash, { retries, delay });
          tx.eventLogs = eventLogs;
          
          if (eventLogs.length > 0) {
            console.log(`    ✅ Found ${eventLogs.length} event log(s)`);
          } else {
            console.log(`    ℹ️  No event logs found`);
          }
        } catch (error) {
          console.log(`    ⚠️  Failed to fetch event logs: ${error.message}`);
          tx.eventLogs = [];
        }
        
        // Add delay between transaction fetches to avoid rate limiting
        if (i < sortedTransactions.length - 1) {
          await wait(delay);
        }
      }
      
      const totalEventLogs = sortedTransactions.reduce((sum, tx) => sum + (tx.eventLogs?.length || 0), 0);
      console.log(`\n✅ Event log fetching complete: ${totalEventLogs} total event logs found`);
    }
    
    return {
      success: true,
      blockNumbers: uniqueBlocks,
      transactions: sortedTransactions,
      error: null,
      pagesFetched: page - 1
    };
    
  } catch (error) {
    console.error('❌ Error parsing BSCScan:', error);
    return {
      success: false,
      blockNumbers: [],
      transactions: [],
      error: error.message,
      pagesFetched: 0
    };
  }
}

/**
 * Fetch BSCScan page and extract block numbers and transaction hashes
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed page result with hasMorePages flag
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
      
      // Check for pagination: look for "Next" button or page numbers
      const hasNextPage = detectNextPage(html);
      
      if (blockNumbers.length > 0 || transactions.length > 0) {
        return {
          success: true,
          blockNumbers: blockNumbers,
          transactions: transactions,
          hasMorePages: hasNextPage
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
    transactions: [],
    hasMorePages: false
  };
}

/**
 * Detect if there's a next page by looking for pagination indicators in HTML
 * @param {string} html - HTML content
 * @returns {boolean} True if next page exists
 */
function detectNextPage(html) {
  // Look for "Next" button or link
  const nextPatterns = [
    /<a[^>]*>Next[^<]*<\/a>/i,
    /<a[^>]*class="[^"]*page-link[^"]*"[^>]*>Next/i,
    /<a[^>]*href="[^"]*p=\d+[^"]*"[^>]*>Next/i,
    /aria-label="Next"/i
  ];
  
  for (const pattern of nextPatterns) {
    if (pattern.test(html)) {
      return true;
    }
  }
  
  // Look for page numbers - if we see a page number higher than current, there might be more
  // But this is less reliable, so we'll use it as a secondary check
  const pageNumberPattern = /<a[^>]*href="[^"]*p=(\d+)[^"]*"[^>]*>(\d+)<\/a>/gi;
  const matches = [...html.matchAll(pageNumberPattern)];
  
  // If we see page numbers beyond what we'd expect for a single page, there might be more
  // This is a heuristic - BSCScan typically shows 25 transactions per page
  return matches.length > 5; // More than 5 page links suggests multiple pages
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
 * Fetch transaction detail page and extract event logs
 * @param {string} txHash - Transaction hash
 * @param {Object} options - Fetch options
 * @returns {Promise<Array>} Array of event log objects
 */
async function fetchTransactionEventLogs(txHash, options = {}) {
  const { retries = 3, delay = 1000 } = options;
  const baseUrl = 'https://bscscan.com/';
  const txUrl = `${baseUrl}tx/${txHash}#eventlog`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(txUrl, {
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
      
      // Extract event logs from HTML
      const eventLogs = extractEventLogs(html);
      
      return eventLogs;
      
    } catch (error) {
      if (attempt < retries) {
        console.log(`    ⏳ Attempt ${attempt} failed, waiting ${delay}ms before retry...`);
        await wait(delay);
      } else {
        throw error;
      }
    }
  }
  
  return [];
}

/**
 * Extract event logs from transaction detail page HTML
 * @param {string} html - HTML content
 * @returns {Array} Array of event log objects
 */
function extractEventLogs(html) {
  const eventLogs = [];
  
  console.log(`    🔍 Extracting event logs from HTML (${html.length} characters)...`);
  
  // Simple pattern matching like block extraction - look for logI_ divs
  // Pattern: <div id='logI_458'> or <div id="logI_458">
  // Handle both single and double quotes like block extraction
  const logIdPattern = /<div[^>]*id=["']logI_(\d+)["'][^>]*>/gi;
  const logIdMatches = [...html.matchAll(logIdPattern)];
  
  console.log(`    🔍 Found ${logIdMatches.length} logI_ entries in HTML`);
  
  // For each log entry, extract the content between this div and the next one
  logIdMatches.forEach((match, index) => {
    const logId = match[1];
    const logStart = match.index;
    
    // Find the content of this log entry - from this div to the next logI_ or end
    const remainingHtml = html.substring(logStart);
    const nextLogMatch = remainingHtml.substring(remainingHtml.indexOf('>') + 1).match(/<div[^>]*id=["']logI_(\d+)["'][^>]*>/i);
    
    let logEnd;
    if (nextLogMatch) {
      // Find where the previous log entry ends (before the next one starts)
      logEnd = logStart + remainingHtml.indexOf('>') + 1 + nextLogMatch.index;
    } else {
      // Last log entry - find the closing pattern or use end of relevant section
      const closingPattern = /<\/div>\s*<\/div>\s*<div[^>]*class=["']mb-5["']/;
      const closingMatch = remainingHtml.match(closingPattern);
      if (closingMatch) {
        logEnd = logStart + remainingHtml.indexOf('>') + 1 + closingMatch.index;
      } else {
        // Use a reasonable chunk - look for the end of the eventlog section
        const sectionEnd = remainingHtml.search(/<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*class=["']tab-pane fade"/);
        logEnd = sectionEnd > 0 ? logStart + remainingHtml.indexOf('>') + 1 + sectionEnd : logStart + Math.min(remainingHtml.length, 50000);
      }
    }
    
    const logContent = html.substring(logStart, logEnd);
    
    try {
      const eventLog = parseEventLogEntry(logContent, logId, index);
      if (eventLog) {
        eventLogs.push(eventLog);
      }
    } catch (error) {
      console.log(`    ⚠️  Failed to parse log ${logId}: ${error.message}`);
    }
  });
  
  console.log(`    🔍 Found ${eventLogs.length} parsed event logs`);
  
  return eventLogs;
}

/**
 * Parse a single event log entry from HTML
 * @param {string} logContent - HTML content of the event log entry
 * @param {string} logId - Log ID (e.g., "458")
 * @param {number} index - Index of the log
 * @returns {Object|null} Parsed event log object or null if parsing fails
 */
function parseEventLogEntry(logContent, logId, index) {
  const eventLog = {
    logIndex: parseInt(logId, 10),
    address: null,
    name: null,
    topics: [],
    data: {}
  };
  
  // Extract contract address - look for address links (handle both quote styles)
  const addressMatch = logContent.match(/<a[^>]*href=["']\/address\/(0x[a-fA-F0-9]{40})["'][^>]*>([^<]*)<\/a>/i);
  if (addressMatch) {
    eventLog.address = addressMatch[1].toLowerCase();
  }
  
  // Extract event name - look for funcname_0 or similar (handle both quote styles)
  // Format: <span id='funcname_0' ...>NewClaim (index_topic_1 uint256 claim_num, ...)</span>
  const nameMatch = logContent.match(/<span[^>]*id=["']funcname_\d+["'][^>]*>([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (nameMatch) {
    eventLog.name = nameMatch[1].trim();
  } else {
    // Try alternative pattern - look for event name after "Name" heading
    const altNameMatch = logContent.match(/<h6[^>]*>Name<\/h6>[\s\S]*?<p[^>]*>[\s\S]*?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (altNameMatch) {
      eventLog.name = altNameMatch[1].trim();
    }
  }
  
  // Extract topics - look for topic list items (handle both quote styles)
  // Format: <li><span class='badge'>0</span> <span class='font-monospace'>0x...</span></li>
  const topicPattern = /<li[^>]*>[\s\S]*?<span[^>]*class=["']badge[^>]*>(\d+)[^<]*<\/span>[\s\S]*?<span[^>]*class=["']font-monospace[^>]*>([^<]+)<\/span>/g;
  const topicMatches = [...logContent.matchAll(topicPattern)];
  
  topicMatches.forEach(topicMatch => {
    const topicIndex = parseInt(topicMatch[1], 10);
    const topicValue = topicMatch[2].trim();
    
    // Try to find decoded value - look for chunk_decode pattern (handle both quote styles)
    let decodedValue = null;
    const decodedPattern = new RegExp(`<span[^>]*id=["']chunk_decode_\\d+_${topicIndex}["'][^>]*>([^<]+)<\/span>`, 'i');
    const decodedMatch = logContent.match(decodedPattern);
    if (decodedMatch) {
      decodedValue = decodedMatch[1].trim();
    }
    
    eventLog.topics.push({
      index: topicIndex,
      value: topicValue,
      decoded: decodedValue
    });
  });
  
  // Extract data parameters - look for event_dec_data_1 or similar (handle both quote styles)
  const dataPattern = /<div[^>]*id=["']event_dec_data_(\d+)["'][^>]*>([\s\S]*?)<\/div>/;
  const dataMatch = logContent.match(dataPattern);
  
  if (dataMatch) {
    const dataContent = dataMatch[2];
    
    // Extract each parameter from the data section (handle both quote styles)
    // Format: <li class='d-lg-flex'><span class='text-muted'>param_name :</span><span class='font-monospace'>value</span></li>
    const paramPattern = /<li[^>]*>[\s\S]*?<span[^>]*class=["']text-muted[^>]*>([^:]+):<\/span>[\s\S]*?<span[^>]*class=["']font-monospace[^>]*>([\s\S]*?)<\/span>/g;
    const paramMatches = [...dataContent.matchAll(paramPattern)];
    
    paramMatches.forEach(paramMatch => {
      const paramName = paramMatch[1].trim();
      const paramContent = paramMatch[2];
      
      // Check if it's an address link (handle both quote styles)
      const addressLinkMatch = paramContent.match(/<a[^>]*href=["']\/address\/(0x[a-fA-F0-9]{40})["'][^>]*>([^<]+)<\/a>/i);
      let paramValue;
      
      if (addressLinkMatch) {
        // Use the address from the href
        paramValue = addressLinkMatch[1].toLowerCase();
      } else {
        // Extract text content, removing any HTML tags
        paramValue = paramContent.replace(/<[^>]+>/g, '').trim();
      }
      
      if (paramValue) {
        eventLog.data[paramName] = paramValue;
      }
    });
  }
  
  // Also extract raw data if available (handle both quote styles)
  const rawDataPattern = /<div[^>]*id=["']event_raw_data_(\d+)["'][^>]*style=["']display:none[^>]*>([^<]+)<\/div>/;
  const rawDataMatch = logContent.match(rawDataPattern);
  if (rawDataMatch) {
    eventLog.rawData = rawDataMatch[2].trim();
  }
  
  // Only return if we have at least an address or name
  if (eventLog.address || eventLog.name) {
    return eventLog;
  }
  
  return null;
}

/**
 * Test the BSCScan simple parser
 * @param {string} bridgeAddress - Bridge contract address to test
 * @param {Object} options - Test options
 * @param {boolean} options.includeEventLogs - Whether to test event log extraction (default: false)
 * @returns {Promise<Object>} Test result
 */
async function testBSCScanSimpleParser(bridgeAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281', options = {}) {
  const { includeEventLogs = false } = options;
  
  console.log(`🧪 Testing BSCScan Simple Parser${includeEventLogs ? ' with event logs' : ''}`);
  
  try {
    const result = await parseBSCScanBlockNumbers(bridgeAddress, {
      delay: 2000,
      retries: 2,
      includeEventLogs: includeEventLogs,
      maxPages: 1 // Only test first page for faster testing
    });
    
    console.log('📊 Test Results:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Block Numbers: ${result.blockNumbers.length}`);
    console.log(`  Error: ${result.error || 'None'}`);
    
    if (result.blockNumbers.length > 0) {
      console.log('📋 Block Numbers Found:');
      result.blockNumbers.slice(0, 10).forEach((block, index) => {
        console.log(`  ${index + 1}. Block ${block}`);
      });
      if (result.blockNumbers.length > 10) {
        console.log(`  ... and ${result.blockNumbers.length - 10} more`);
      }
    }
    
    if (result.transactions && result.transactions.length > 0) {
      console.log('📋 Transactions Found:');
      result.transactions.slice(0, 10).forEach((tx, index) => {
        console.log(`  ${index + 1}. ${tx.txHash.substring(0, 16)}... @ Block ${tx.blockNumber}`);
        if (includeEventLogs && tx.eventLogs && tx.eventLogs.length > 0) {
          console.log(`      Event Logs: ${tx.eventLogs.length}`);
          tx.eventLogs.forEach((log, logIndex) => {
            console.log(`        ${logIndex + 1}. ${log.name || 'Unknown'} @ ${log.address || 'Unknown'}`);
            if (log.data && Object.keys(log.data).length > 0) {
              console.log(`           Data: ${Object.keys(log.data).join(', ')}`);
            }
          });
        }
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
      transactions: [],
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
  fetchTransactionEventLogs,
  extractEventLogs,
  parseEventLogEntry,
  testBSCScanSimpleParser
};
