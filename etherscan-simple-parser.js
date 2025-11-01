/**
 * Etherscan Simple Parser - Extracts block numbers from Etherscan transactions page
 * Targets: https://etherscan.io/txs?a=0x3a96AC42A28D5610Aca2A79AE782988110108eDe
 * Simple approach that works with the basic HTML content
 */

const fetch = require('node-fetch');
const { wait } = require('./utils.js');

/**
 * Parse Etherscan transactions page to extract block numbers
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Parsed result with block numbers
 */
async function parseEtherscanBlockNumbers(bridgeAddress, options = {}) {
  const {
    delay = 2000,
    retries = 3
  } = options;

  const baseUrl = 'https://etherscan.io/';
  const targetUrl = `${baseUrl}txs?a=${bridgeAddress}`;
  
  console.log(`🔍 Parsing Etherscan for block numbers: ${targetUrl}`);
  
  try {
    const result = await fetchEtherscanPage(targetUrl, { retries, delay });
    
    if (result.success) {
      console.log(`✅ Successfully parsed Etherscan page`);
      console.log(`Found ${result.blockNumbers.length} block numbers`);
      return {
        success: true,
        blockNumbers: result.blockNumbers,
        error: null
      };
    } else {
      return {
        success: false,
        blockNumbers: [],
        error: result.error || 'Failed to parse Etherscan page'
      };
    }
    
  } catch (error) {
    console.error('❌ Error parsing Etherscan:', error);
    return {
      success: false,
      blockNumbers: [],
      error: error.message
    };
  }
}

/**
 * Fetch Etherscan page and extract block numbers
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed page result
 */
async function fetchEtherscanPage(url, options = {}) {
  const { retries = 3, delay = 1000 } = options;
  
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
      
      if (blockNumbers.length > 0) {
        return {
          success: true,
          blockNumbers: blockNumbers
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
    blockNumbers: []
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
 * Test the Etherscan simple parser
 * @param {string} bridgeAddress - Bridge contract address to test
 * @returns {Promise<Object>} Test result
 */
async function testEtherscanSimpleParser(bridgeAddress = '0x3a96AC42A28D5610Aca2A79AE782988110108eDe') {
  console.log(`🧪 Testing Etherscan Simple Parser`);
  
  try {
    const result = await parseEtherscanBlockNumbers(bridgeAddress, {
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
  parseEtherscanBlockNumbers,
  fetchEtherscanPage,
  extractBlockNumbers,
  testEtherscanSimpleParser
};
