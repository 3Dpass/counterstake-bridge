# Block Number Filtering Logic during the catch-up. 

## Overview

The `getAddressBlocks()` function retrieves block numbers containing transactions/events for a specific address, with optional filtering by `startblock` parameter.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Caller: evm-chain.js                                     │
│    this.getAddressBlocks(factory_address, last_block)       │
│    where last_block = getLastBlock() - 100                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. BSC.getAddressBlocks() (bsc.js:46)                        │
│    Calls: getAddressBlocks({                                 │
│      chainid: 56,                                            │
│      address: factory_address,                               │
│      startblock: last_block,  ← FILTER PARAMETER             │
│      networkApi: { BSC: this }                               │
│    })                                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. etherscan.js: getAddressBlocks()                         │
│    - Normalizes address                                      │
│    - Checks if AlwaysUseBSCscanParser is enabled            │
│    - If yes: uses parser (BSCScan HTML parser)              │
│    - If no: uses Etherscan API                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Parser Path (AlwaysUseBSCscanParser)                     │
│    parseBSCScanBlockNumbers(address, options)                │
│                                                              │
│    a) Loads cache state:                                     │
│       - cachedBlockNumbers: [82 blocks]                     │
│       - cachedTransactions: [82 transactions]               │
│                                                              │
│    b) Adds block numbers to allBlockNumbers Set:             │
│       - From cachedBlockNumbers array                        │
│       - From transaction.blockNumber fields                  │
│                                                              │
│    c) Checks for new pages (if needed)                       │
│                                                              │
│    d) Returns:                                               │
│       {                                                      │
│         success: true,                                       │
│         blockNumbers: [82 blocks],  ← ALL BLOCKS            │
│         transactions: [82 transactions]                      │
│       }                                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Filtering Logic (etherscan.js:174-183)                   │
│                                                              │
│    let blocks = result.blockNumbers;  // 82 blocks          │
│                                                              │
│    if (startblock) {                                         │
│      const initLen = blocks.length;  // 82                  │
│      blocks = blocks.filter(b => b >= startblock);           │
│      // Example:                                             │
│      //   startblock = 68425600 (recent block)               │
│      //   blocks = [8676162, ..., 60644366]                 │
│      //   All blocks < 68425600 → filtered out              │
│      //   Result: blocks = [] (0 blocks)                    │
│    }                                                         │
│                                                              │
│    Returns: blocks (filtered array)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Caller receives filtered blocks                          │
│    - If all blocks filtered: []                          │
│    - If some blocks match: [block1, block2, ...]            │
│    - These blocks are used to process events                │
└─────────────────────────────────────────────────────────────┘
```

## Key Points

### 1. **Purpose of `startblock` Parameter**

The `startblock` parameter is used to **only return blocks that are >= startblock**. This is useful for:
- **Catch-up scenarios**: Only process events from a certain block forward
- **Missed blocks**: When the system was offline, only process blocks since the last known block
- **Performance**: Avoid processing old blocks that have already been handled

### 2. **Why Blocks Get Filtered Out**

**Example Scenario:**
```
Cache has blocks: [8676162, ..., 60644366]  (82 blocks, oldest to newest)
startblock = 68425600  (current block - 100, very recent)

Filter: blocks.filter(b => b >= 68425600)
Result: []  (all blocks are older than 68425600)
```

**Why this happens:**
- The cache contains **historical blocks** (old transactions)
- `startblock` is set to a **recent block** (e.g., `last_block - 100`)
- All cached blocks are **older** than `startblock`
- Therefore, **all blocks are filtered out**

### 3. **When This is Expected vs. Problematic**

**✅ Expected (Normal Behavior):**
- Cache has old blocks (e.g., blocks 1-1000)
- `startblock` is recent (e.g., block 5000)
- All blocks filtered out → `[]` returned
- **This is fine** because:
  - The transactions are still available in cache
  - Events are processed from transactions, not just block numbers
  - The system processes events from cached transactions during catch-up

**❌ Problematic (Bug):**
- Cache has recent blocks (e.g., blocks 5000-6000)
- `startblock` is recent (e.g., block 5500)
- All blocks filtered out → `[]` returned
- **This is a problem** if:
  - The system needs to process events from those recent blocks
  - But the transactions aren't being processed correctly

### 4. **Current Behavior**

In your case:
- **Cache**: 82 blocks (ranging from 8676162 to 60644366)
- **startblock**: Likely ~68425600 (recent block)
- **Result**: All 82 blocks filtered out → `[]` returned
- **Transactions**: Still available (82 transactions in cache)
- **Events**: Processed from cached transactions via `processPastEventsFromParserCache()`

**This is working as intended** because:
1. The blocks are filtered out (they're too old)
2. But the **transactions are still cached** and available
3. Events are processed from **cached transactions**, not from the filtered block list
4. The `processPastEventsFromParserCache()` function uses cached transactions directly

### 5. **Why Transactions Are Still Processed**

Even though blocks are filtered out, transactions are still processed because:

1. **Transactions are cached separately** from block numbers
2. **`processPastEventsFromParserCache()`** uses cached transactions directly:
   ```javascript
   const transactions = thisArg.getCachedTransactions(contractAddress);
   // Processes events from these transactions, regardless of block filtering
   ```
3. **Block filtering only affects** the return value of `getAddressBlocks()`, not the cached transaction data

## Summary

The filtering logic:
1. **Parser returns ALL blocks** from cache (e.g., 82 blocks)
2. **Filter removes blocks** that are < `startblock` (e.g., all 82 filtered out)
3. **Returns filtered array** (e.g., `[]`)
4. **But transactions remain available** in cache for event processing
5. **Events are processed** from cached transactions, not from the filtered block list

The "found 0 blocks" message is **misleading** because it doesn't indicate a problem - it just means all cached blocks are older than `startblock`, but the transactions are still available for processing.

