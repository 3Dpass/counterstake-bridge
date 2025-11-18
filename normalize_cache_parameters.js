#!/usr/bin/env node
/**
 * Script to normalize parameter names in existing parser cache files
 * 
 * This script updates existing cache files to use normalized parameter names
 * (e.g., "author address" -> "author_address") so they match what the code expects.
 * 
 * Usage: node normalize_cache_parameters.js [--dry-run] [--cache-dir=<dir>]
 */

const fs = require('fs');
const path = require('path');

/**
 * Normalize parameter name to match expected format
 * Converts "author address" -> "author_address", handles spaces, case, etc.
 * @param {string} paramName - Raw parameter name
 * @returns {string} Normalized parameter name
 */
function normalizeParameterName(paramName) {
  if (!paramName || typeof paramName !== 'string') {
    return paramName;
  }
  
  // Trim whitespace
  let normalized = paramName.trim();
  
  // Replace spaces and multiple spaces with single underscore
  normalized = normalized.replace(/\s+/g, '_');
  
  // Convert to lowercase
  normalized = normalized.toLowerCase();
  
  // Remove any leading/trailing underscores
  normalized = normalized.replace(/^_+|_+$/g, '');
  
  return normalized;
}

/**
 * Normalize parameter names in a cache file
 * @param {string} cacheFilePath - Path to cache file
 * @param {boolean} dryRun - If true, don't write changes
 * @returns {Object} Result with stats
 */
function normalizeCacheFile(cacheFilePath, dryRun = false) {
  const result = {
    file: cacheFilePath,
    updated: false,
    transactionsProcessed: 0,
    eventLogsProcessed: 0,
    parametersNormalized: 0,
    errors: []
  };
  
  try {
    // Read cache file
    const cacheContent = fs.readFileSync(cacheFilePath, 'utf8');
    const cache = JSON.parse(cacheContent);
    
    if (!cache.transactions || !Array.isArray(cache.transactions)) {
      result.errors.push('Invalid cache structure: missing transactions array');
      return result;
    }
    
    let hasChanges = false;
    
    // Process each transaction
    for (const tx of cache.transactions) {
      if (!tx.eventLogs || !Array.isArray(tx.eventLogs)) {
        continue;
      }
      
      result.transactionsProcessed++;
      
      // Process each event log
      for (const eventLog of tx.eventLogs) {
        if (!eventLog.data || typeof eventLog.data !== 'object') {
          continue;
        }
        
        result.eventLogsProcessed++;
        
        // Create normalized data object
        const normalizedData = {};
        const originalKeys = Object.keys(eventLog.data);
        
        for (const originalKey of originalKeys) {
          const normalizedKey = normalizeParameterName(originalKey);
          normalizedData[normalizedKey] = eventLog.data[originalKey];
          
          if (normalizedKey !== originalKey) {
            result.parametersNormalized++;
            hasChanges = true;
          }
        }
        
        // Replace data object with normalized version
        eventLog.data = normalizedData;
      }
    }
    
    // Write updated cache if there were changes
    if (hasChanges && !dryRun) {
      // Create backup
      const backupPath = cacheFilePath + '.backup';
      fs.writeFileSync(backupPath, cacheContent, 'utf8');
      
      // Write normalized cache
      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
      result.updated = true;
    } else if (hasChanges && dryRun) {
      result.updated = true; // Would be updated if not dry run
    }
    
  } catch (error) {
    result.errors.push(error.message);
  }
  
  return result;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cacheDirArg = args.find(arg => arg.startsWith('--cache-dir='));
  const cacheDirs = cacheDirArg 
    ? [cacheDirArg.split('=')[1]]
    : [
        path.join(__dirname, '.bscscan-cache'),
        path.join(__dirname, '.etherscan-cache')
      ];
  
  console.log('🔧 Normalizing parameter names in cache files...\n');
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  }
  
  const results = [];
  let totalFiles = 0;
  let totalUpdated = 0;
  let totalTransactions = 0;
  let totalEventLogs = 0;
  let totalParameters = 0;
  let totalErrors = 0;
  
  // Process each cache directory
  for (const cacheDir of cacheDirs) {
    if (!fs.existsSync(cacheDir)) {
      console.log(`⚠️  Cache directory not found: ${cacheDir}`);
      continue;
    }
    
    console.log(`📁 Processing: ${cacheDir}`);
    
    // Find all JSON files in cache directory
    const files = fs.readdirSync(cacheDir)
      .filter(file => file.endsWith('.json') && !file.endsWith('.backup'))
      .map(file => path.join(cacheDir, file));
    
    console.log(`   Found ${files.length} cache files\n`);
    
    // Process each cache file
    for (const cacheFile of files) {
      totalFiles++;
      const result = normalizeCacheFile(cacheFile, dryRun);
      results.push(result);
      
      if (result.updated) {
        totalUpdated++;
      }
      totalTransactions += result.transactionsProcessed;
      totalEventLogs += result.eventLogsProcessed;
      totalParameters += result.parametersNormalized;
      totalErrors += result.errors.length;
      
      // Print result for this file
      if (result.parametersNormalized > 0 || result.errors.length > 0) {
        const status = result.updated ? (dryRun ? '✅ (would update)' : '✅') : '⚠️';
        console.log(`   ${status} ${path.basename(cacheFile)}`);
        if (result.parametersNormalized > 0) {
          console.log(`      Normalized ${result.parametersNormalized} parameter name(s)`);
        }
        if (result.errors.length > 0) {
          console.log(`      Errors: ${result.errors.join(', ')}`);
        }
      }
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Files processed: ${totalFiles}`);
  console.log(`   Files ${dryRun ? 'would be ' : ''}updated: ${totalUpdated}`);
  console.log(`   Transactions processed: ${totalTransactions}`);
  console.log(`   Event logs processed: ${totalEventLogs}`);
  console.log(`   Parameters normalized: ${totalParameters}`);
  if (totalErrors > 0) {
    console.log(`   Errors: ${totalErrors}`);
  }
  console.log('='.repeat(60));
  
  if (dryRun && totalUpdated > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else if (totalUpdated > 0) {
    console.log('\n✅ Cache files updated! Backups created with .backup extension');
  } else if (totalParameters === 0) {
    console.log('\n✅ All cache files already have normalized parameter names');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { normalizeParameterName, normalizeCacheFile };

