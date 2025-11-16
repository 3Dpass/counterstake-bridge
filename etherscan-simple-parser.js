/**
 * Etherscan Simple Parser - Extracts block numbers, transactions, and event logs from Etherscan
 * Targets: 
 *   - Transactions page: https://etherscan.io/txs?a=0x3a96AC42A28D5610Aca2A79AE782988110108eDe
 *   - Transaction detail: https://etherscan.io/tx/0x.../#eventlog
 * Simple approach that works with the basic HTML content
 * 
 * Features:
 *   - Extract block numbers from transaction listings
 *   - Extract transaction hashes and block numbers
 *   - Optionally fetch and extract event logs from transaction detail pages
 *   - Event logs include: event name, contract address, topics, and decoded data parameters
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { wait } = require('./utils.js');
const { BrowserSession, getRandomDelay } = require('./browser-headers.js');
const { normalizeAddress } = require('./address_normalizer.js');

// Cache directory for storing parser state
const CACHE_DIR = path.join(__dirname, '.etherscan-cache');

/**
 * Get cache file path for an address
 * @param {string} address - Contract address
 * @returns {string} Cache file path
 */
function getCacheFilePath(address) {
  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  // Normalize address first, then use lowercase for filename (consistent cache key)
  // This ensures checksummed addresses from etherscan.js are handled correctly
  const normalizedAddress = normalizeAddress(address, null);
  const filename = `${normalizedAddress.toLowerCase()}.json`;
  return path.join(CACHE_DIR, filename);
}

/**
 * Load parser state from cache file
 * @param {string} address - Contract address
 * @returns {Object|null} Cached state or null if not found/invalid
 */
function loadParserState(address) {
  try {
    // Normalize address for consistent cache file path lookup
    const normalizedAddress = normalizeAddress(address, null);
    const cacheFile = getCacheFilePath(normalizedAddress);
    
    if (!fs.existsSync(cacheFile)) {
      return null;
    }
    
    const cacheData = fs.readFileSync(cacheFile, 'utf8');
    const state = JSON.parse(cacheData);
    
    // Validate state structure
    if (!state.address || !state.timestamp) {
      console.log(`⚠️  Invalid cache file format for ${normalizedAddress}, ignoring`);
      return null;
    }
    
    console.log(`📂 Loaded cache state for ${normalizedAddress}: ${state.pagesFetched || 0} pages, ${state.transactions?.length || 0} transactions`);
    return state;
  } catch (error) {
    console.log(`⚠️  Error loading cache for ${address}: ${error.message}`);
    return null;
  }
}

/**
 * Save parser state to cache file
 * @param {string} address - Contract address
 * @param {Object} state - State to save
 */
function saveParserState(address, state) {
  try {
    // Normalize address for consistent cache file path
    const normalizedAddress = normalizeAddress(address, null);
    const cacheFile = getCacheFilePath(normalizedAddress);
    const stateToSave = {
      address: normalizedAddress.toLowerCase(), // Store lowercase for consistency
      timestamp: Date.now(),
      ...state
    };
    
    fs.writeFileSync(cacheFile, JSON.stringify(stateToSave, null, 2), 'utf8');
  } catch (error) {
    console.log(`⚠️  Error saving cache for ${address}: ${error.message}`);
  }
}

/**
 * Clear cache for an address (optional cleanup)
 * @param {string} address - Contract address
 */
function clearParserCache(address) {
  try {
    // Normalize address for consistent cache file path lookup
    const normalizedAddress = normalizeAddress(address, null);
    const cacheFile = getCacheFilePath(normalizedAddress);
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
      console.log(`🗑️  Cleared cache for ${normalizedAddress}`);
    }
  } catch (error) {
    console.log(`⚠️  Error clearing cache for ${address}: ${error.message}`);
  }
}

/**
 * Parse Etherscan transactions page to extract block numbers and transaction hashes
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Parsing options
 * @param {boolean} options.maxPages - Maximum number of pages to fetch (default: 10, 0 = all pages)
 * @param {boolean} options.includeEventLogs - Whether to fetch and extract event logs for each transaction (default: false)
 * @returns {Promise<Object>} Parsed result with block numbers and transaction data
 */
async function parseEtherscanBlockNumbers(bridgeAddress, options = {}) {
  const {
    delay = 2000,
    retries = 3,
    includeTransactions = true, // New option to include transaction hashes
    includeEventLogs = false, // New option to fetch event logs for each transaction
    maxPages = 10, // Maximum pages to fetch (0 = all pages, default: 10 to avoid excessive requests)
    session = null, // Optional BrowserSession for maintaining consistency across requests
    clearCache = false // Option to clear existing cache and start fresh
  } = options;
  
  // Normalize address for consistent cache handling and URL usage (handles checksummed addresses from etherscan.js)
  const normalizedAddress = normalizeAddress(bridgeAddress, null);
  
  // Clear cache if requested
  if (clearCache) {
    clearParserCache(normalizedAddress);
  }
  
  // Load existing cache state (uses normalized address internally)
  const cachedState = loadParserState(normalizedAddress);
  const cachedTransactions = cachedState?.transactions || [];
  const cachedTxHashes = new Set(cachedTransactions.map(tx => tx.txHash.toLowerCase()));
  const lastProcessedTxIndex = cachedState?.lastProcessedTxIndex !== undefined ? cachedState.lastProcessedTxIndex : -1;
  const lastProcessedPage = cachedState?.lastProcessedPage || 0;
  
  // Create a session for this parsing run if not provided
  const browserSession = session || new BrowserSession();

  const baseUrl = 'https://etherscan.io/';
  
  const resumeMsg = cachedState ? ` (resuming from page ${lastProcessedPage + 1}, ${cachedTransactions.length} cached transactions)` : '';
  console.log(`🔍 Parsing Etherscan for address ${normalizedAddress} - block numbers${includeTransactions ? ' and transactions' : ''}${includeEventLogs ? ' with event logs' : ''} (max ${maxPages === 0 ? 'all' : maxPages} pages)${resumeMsg}`);
  
  try {
    const allBlockNumbers = new Set();
    // Start with cached transactions
    const allTransactions = [...cachedTransactions];
    let page = lastProcessedPage + 1; // Resume from next page after last processed
    let hasMorePages = true;
    let pagesFetched = 0;
    
    // If we have cached transactions, add their block numbers
    cachedTransactions.forEach(tx => {
      allBlockNumbers.add(tx.blockNumber);
    });
    
    while (hasMorePages && (maxPages === 0 || page <= maxPages)) {
      // Etherscan pagination: p parameter (1-indexed)
      // Use normalized address in URL (Etherscan accepts both formats, but normalizing ensures consistency)
      const targetUrl = `${baseUrl}txs?a=${normalizedAddress}&p=${page}`;
      console.log(`📄 Fetching page ${page}...`);
      
      const result = await fetchEtherscanPage(targetUrl, { retries, delay, includeTransactions, session: browserSession });
      
      if (!result.success) {
        console.log(`⚠️  Failed to fetch page ${page}, stopping pagination`);
        // Save state before stopping
        saveParserState(normalizedAddress, {
          pagesFetched: lastProcessedPage + pagesFetched,
          lastProcessedPage: page - 1,
          lastProcessedTxIndex: lastProcessedTxIndex,
          blockNumbers: Array.from(allBlockNumbers).sort((a, b) => b - a),
          transactions: allTransactions
        });
        break;
      }
      
      // Add block numbers
      result.blockNumbers.forEach(block => allBlockNumbers.add(block));
      
      // Add transactions (avoid duplicates with cached ones)
      if (result.transactions) {
        result.transactions.forEach(tx => {
          const txHashLower = tx.txHash.toLowerCase();
          if (!cachedTxHashes.has(txHashLower) && !allTransactions.find(t => t.txHash.toLowerCase() === txHashLower)) {
            allTransactions.push(tx);
            cachedTxHashes.add(txHashLower);
          }
        });
      }
      
      pagesFetched++;
      console.log(`  ✅ Page ${page}: Found ${result.blockNumbers.length} blocks, ${result.transactions?.length || 0} transactions`);
      
      // Save state after each page
      saveParserState(normalizedAddress, {
        pagesFetched: lastProcessedPage + pagesFetched,
        lastProcessedPage: page,
        lastProcessedTxIndex: lastProcessedTxIndex,
        blockNumbers: Array.from(allBlockNumbers).sort((a, b) => b - a),
        transactions: allTransactions
      });
      
      // Check if there are more pages using the detection from fetchEtherscanPage
      hasMorePages = result.hasMorePages;
      
      // Also stop if we got no results (empty page)
      if (result.blockNumbers.length === 0 && (!result.transactions || result.transactions.length === 0)) {
        hasMorePages = false;
      }
      
      page++;
      
      // Add random delay between pages to avoid rate limiting and detection
      if (hasMorePages && (maxPages === 0 || page <= maxPages)) {
        const pageDelay = getRandomDelay(delay, 30); // 30% jitter
        await wait(pageDelay);
      }
    }
    
    const uniqueBlocks = Array.from(allBlockNumbers).sort((a, b) => b - a);
    // Sort transactions by block number (newest first) to prioritize recent transactions
    // This ensures that when checking against database and parsing, most recent transactions are processed first
    const sortedTransactions = allTransactions.sort((a, b) => b.blockNumber - a.blockNumber);
    
    const totalPagesFetched = lastProcessedPage + pagesFetched;
    console.log(`✅ Successfully parsed Etherscan (${totalPagesFetched} total page(s), ${pagesFetched} new)`);
    console.log(`Found ${uniqueBlocks.length} unique block numbers`);
    if (includeTransactions) {
      console.log(`Found ${sortedTransactions.length} unique transaction hashes (${cachedTransactions.length} from cache, ${sortedTransactions.length - cachedTransactions.length} new)`);
      if (sortedTransactions.length > 0) {
        console.log(`  Most recent: Block ${sortedTransactions[0].blockNumber}, Oldest: Block ${sortedTransactions[sortedTransactions.length - 1].blockNumber}`);
      }
    }
    
    // Fetch event logs for each transaction if requested
    // Process transactions in order (newest first) to prioritize recent transactions
    if (includeEventLogs && sortedTransactions.length > 0) {
      console.log(`\n📋 Fetching event logs for ${sortedTransactions.length} transactions (processing newest first)...`);
      
      // Optional function to check if transaction already has events in database
      const checkTransactionExists = options.checkTransactionExists || null;
      
      let skippedCount = 0;
      let fetchedCount = 0;
      let cachedCount = 0;
      
      // Process transactions in order (newest first) - most recent transactions are checked and parsed first
      // Start from lastProcessedTxIndex + 1 to skip already processed transactions
      const startIndex = lastProcessedTxIndex + 1;
      for (let i = startIndex; i < sortedTransactions.length; i++) {
        const tx = sortedTransactions[i];
        
        // Check if transaction already has event logs in cache
        if (tx.eventLogs && tx.eventLogs.length > 0) {
          console.log(`  [${i + 1}/${sortedTransactions.length}] ✅ Using cached event logs for ${tx.txHash.substring(0, 16)}... (${tx.eventLogs.length} logs)`);
          cachedCount++;
          continue;
        }
        
        // Check if transaction already exists in database
        if (checkTransactionExists) {
          try {
            const exists = await checkTransactionExists(tx.txHash);
            if (exists) {
              console.log(`  [${i + 1}/${sortedTransactions.length}] ⏭️  Skipping ${tx.txHash.substring(0, 16)}... (already in database)`);
              tx.eventLogs = []; // Mark as skipped
              skippedCount++;
              // Save state after skipping
              saveParserState(normalizedAddress, {
                pagesFetched: totalPagesFetched,
                lastProcessedPage: page - 1,
                lastProcessedTxIndex: i,
                blockNumbers: uniqueBlocks,
                transactions: sortedTransactions
              });
              continue;
            }
          } catch (error) {
            console.log(`  [${i + 1}/${sortedTransactions.length}] ⚠️  Error checking transaction existence: ${error.message}, will fetch anyway`);
          }
        }
        
        console.log(`  [${i + 1}/${sortedTransactions.length}] Fetching event logs for ${tx.txHash.substring(0, 16)}...`);
        
        try {
          const eventLogs = await fetchTransactionEventLogs(tx.txHash, { retries, delay, session: browserSession });
          tx.eventLogs = eventLogs;
          fetchedCount++;
          
          if (eventLogs.length > 0) {
            console.log(`    ✅ Found ${eventLogs.length} event log(s)`);
          } else {
            console.log(`    ℹ️  No event logs found`);
          }
          
          // Save state after each transaction with event logs
          saveParserState(normalizedAddress, {
            pagesFetched: totalPagesFetched,
            lastProcessedPage: page - 1,
            lastProcessedTxIndex: i,
            blockNumbers: uniqueBlocks,
            transactions: sortedTransactions
          });
        } catch (error) {
          console.log(`    ⚠️  Failed to fetch event logs: ${error.message}`);
          tx.eventLogs = [];
          // Save state even on error to track progress
          saveParserState(normalizedAddress, {
            pagesFetched: totalPagesFetched,
            lastProcessedPage: page - 1,
            lastProcessedTxIndex: i,
            blockNumbers: uniqueBlocks,
            transactions: sortedTransactions
          });
        }
        
        // Add random delay between transaction fetches to avoid rate limiting and detection
        if (i < sortedTransactions.length - 1) {
          const txDelay = getRandomDelay(delay, 30); // 30% jitter
          await wait(txDelay);
        }
      }
      
      const totalEventLogs = sortedTransactions.reduce((sum, tx) => sum + (tx.eventLogs?.length || 0), 0);
      console.log(`\n✅ Event log fetching complete: ${totalEventLogs} total event logs found`);
      if (cachedCount > 0) {
        console.log(`   📦 Used ${cachedCount} cached transaction(s)`);
      }
      if (skippedCount > 0) {
        console.log(`   ⏭️  Skipped ${skippedCount} transactions (already in database)`);
      }
      if (fetchedCount > 0) {
        console.log(`   📥 Fetched ${fetchedCount} new transactions`);
      }
    }
    
    // Final state save
    saveParserState(normalizedAddress, {
      pagesFetched: totalPagesFetched,
      lastProcessedPage: page - 1,
      lastProcessedTxIndex: includeEventLogs ? sortedTransactions.length - 1 : -1,
      blockNumbers: uniqueBlocks,
      transactions: sortedTransactions
    });
    
    return {
      success: true,
      blockNumbers: uniqueBlocks,
      transactions: sortedTransactions,
      error: null,
      pagesFetched: totalPagesFetched
    };
    
  } catch (error) {
    console.error('❌ Error parsing Etherscan:', error);
    // Save state even on error to preserve progress
    saveParserState(normalizedAddress, {
      pagesFetched: lastProcessedPage + pagesFetched,
      lastProcessedPage: page - 1,
      lastProcessedTxIndex: lastProcessedTxIndex,
      blockNumbers: Array.from(allBlockNumbers).sort((a, b) => b - a),
      transactions: allTransactions,
      error: error.message
    });
    return {
      success: false,
      blockNumbers: [],
      transactions: [],
      error: error.message,
      pagesFetched: lastProcessedPage + pagesFetched
    };
  }
}

/**
 * Fetch Etherscan page and extract block numbers and transaction hashes
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {BrowserSession} options.session - Browser session for maintaining consistency (optional)
 * @returns {Promise<Object>} Parsed page result with hasMorePages flag
 */
async function fetchEtherscanPage(url, options = {}) {
  const { retries = 3, delay = 1000, includeTransactions = true, session = null } = options;
  
  // Use provided session or create a new one for this request
  const browserSession = session || new BrowserSession();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  🔄 Attempt ${attempt}/${retries} for ${url}`);
      
      // Generate realistic headers with referrer chain
      const headers = browserSession.getHeaders(url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        timeout: 30000
      });
      
      // Update cookies from response if present
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        browserSession.updateCookies(setCookieHeader);
      }
      
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
      
      // If no blocks found, wait and retry with jitter
      if (attempt < retries) {
        const retryDelay = getRandomDelay(delay * (attempt + 1), 25); // Exponential backoff with jitter
        console.log(`  ⏳ No blocks found, waiting ${retryDelay}ms before retry...`);
        await wait(retryDelay);
      }
      
    } catch (error) {
      console.log(`  ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < retries) {
        const retryDelay = getRandomDelay(delay * (attempt + 1), 25); // Exponential backoff with jitter
        console.log(`  ⏳ Waiting ${retryDelay}ms before retry...`);
        await wait(retryDelay);
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
  // This is a heuristic - Etherscan typically shows 25 transactions per page
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
    if (blockNumber > 0 && blockNumber > 1000) { // Ethereum blocks are typically > 1000
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
  
  // Pattern to match transaction rows in Etherscan table
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
 * @param {BrowserSession} options.session - Browser session for maintaining consistency (optional)
 * @returns {Promise<Array>} Array of event log objects
 */
async function fetchTransactionEventLogs(txHash, options = {}) {
  const { retries = 3, delay = 1000, session = null } = options;
  const baseUrl = 'https://etherscan.io/';
  const txUrl = `${baseUrl}tx/${txHash}#eventlog`;
  
  // Use provided session or create a new one for this request
  const browserSession = session || new BrowserSession();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Generate realistic headers with referrer to transaction listing page
      // Simulate coming from the main transactions page
      const referrerUrl = `${baseUrl}txs`; // Simulate coming from transactions listing
      const headers = browserSession.getHeaders(txUrl, { referrer: referrerUrl });
      
      const response = await fetch(txUrl, {
        method: 'GET',
        headers: headers,
        timeout: 30000
      });
      
      // Update cookies from response if present
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        browserSession.updateCookies(setCookieHeader);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Extract event logs from HTML
      const eventLogs = extractEventLogs(html);
      
      return eventLogs;
      
    } catch (error) {
      if (attempt < retries) {
        const retryDelay = getRandomDelay(delay * (attempt + 1), 25); // Exponential backoff with jitter
        console.log(`    ⏳ Attempt ${attempt} failed, waiting ${retryDelay}ms before retry...`);
        await wait(retryDelay);
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
 * Test the Etherscan simple parser
 * @param {string} bridgeAddress - Bridge contract address to test
 * @param {Object} options - Test options
 * @param {boolean} options.includeEventLogs - Whether to test event log extraction (default: false)
 * @returns {Promise<Object>} Test result
 */
async function testEtherscanSimpleParser(bridgeAddress = '0x3a96AC42A28D5610Aca2A79AE782988110108eDe', options = {}) {
  const { includeEventLogs = false } = options;
  
  console.log(`🧪 Testing Etherscan Simple Parser${includeEventLogs ? ' with event logs' : ''}`);
  
  try {
    const result = await parseEtherscanBlockNumbers(bridgeAddress, {
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
  parseEtherscanBlockNumbers,
  fetchEtherscanPage,
  extractBlockNumbers,
  extractTransactions,
  fetchTransactionEventLogs,
  extractEventLogs,
  parseEventLogEntry,
  testEtherscanSimpleParser,
  loadParserState,
  saveParserState,
  clearParserCache,
  getCacheFilePath
};
