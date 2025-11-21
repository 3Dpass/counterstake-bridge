# Catch-Up Process Breakdown

## Overview
The catch-up process ensures that all missed bridge events (transfers, claims, challenges) are processed when the system starts or reconnects to a network. This document breaks down the entire process from start to finish.

---

## Phase 1: Initialization (transfers.js `start()`)

### 1.1 Pre-Catchup Setup
- **Location**: `transfers.js:2248-2301`
- **Actions**:
  - Link orphaned claims before catch-up (ensures no orphans are left behind)
  - Set up periodic orphaned claims linking during catchup (runs every 5 minutes)
  - Initialize `bCatchingUp = true` (global flag)
  - Initialize `bCatchingUpOrHandlingPostponedEvents = true`

### 1.2 Network Initialization
- **Location**: `transfers.js:1848-1870`
- **Actions**:
  - Initialize all network APIs (Obyte, Ethereum, BSC, Polygon, Kava, 3DPass)
  - Stagger initialization with delays to avoid connection conflicts
  - Each network creates its own `EvmChain` instance

---

## Phase 2: Catch-Up Execution (transfers.js)

### 2.1 Parallel Catch-Up for All Networks
- **Location**: `transfers.js:2303-2333`
- **Process**:
  - For each network in `networkApi`:
    - Create async function that retries up to 3 times
    - Call `networkApi[net].catchup()` for each network
    - Run all catch-ups in parallel using `Promise.all()`
    - Mark network as `caughtUp[net] = true` on success
    - Retry with 10-second delay on failure (max 3 attempts)

### 2.2 Network Catch-Up Completion Criteria

**A network's catch-up is considered complete when:**

1. **All address queries completed** (`evm-chain.js:2185-2287`):
   - All bridge contract addresses have been queried for missed blocks
   - Priority addresses processed first, then regular addresses
   - Each address queried via peer seeding (if enabled) or explorer/parser APIs
   - Events processed for each discovered block number

2. **All past events processed** (`evm-chain.js:2292-2299`):
   - Events from `since_block` processed for all bridge contracts
   - `processPastEventsOnBridgeContract()` called for each contract
   - All historical events up to current block have been handled

3. **Catch-up method completes** (`evm-chain.js:2307-2311`):
   - `catchup()` method returns without throwing an error
   - Sets `this.#bCatchingUp = false` (instance flag)
   - Updates `this.#last_caughtup_block` to current block - 100
   - Updates last block in database via `updateLastBlock()`
   - Logs: `"catching up {network} done"`

4. **Network marked as caught up** (`transfers.js:2314`):
   - Sets `caughtUp[net] = true` in the global `caughtUp` object
   - Logs: `"✅ {net} catch-up completed successfully"`

**Note:** If a network's catch-up fails after 3 retry attempts, `caughtUp[net]` is **not** set to `true`, and the network will retry on disconnection/reconnection.

### 2.3 Global Catch-Up Completion
- **Location**: `transfers.js:2334-2347`
- **Trigger**: After **all** networks complete their catch-up (`Promise.all()` resolves)
- **Actions**:
  - Set `bCatchingUp = false` (global flag)
  - Stop periodic orphaned claims linking
  - Clear claim retry counts
  - Set `bCatchingUpOrHandlingPostponedEvents = false` after 3 minutes
  - Run `checkUnfinishedClaims()`

---

## Phase 3: EVM Chain Catch-Up (evm-chain.js `catchup()`)

### 3.1 Initial Setup
- **Location**: `evm-chain.js:2027-2039`
- **Actions**:
  - Log initial sync stats (bridges, transfers, transfer ID range)
  - Set up periodic stat logging (every 10 seconds during catchup)
  - Set `this.#bCatchingUp = true` (instance flag)

### 3.2 Determine Block Range
- **Location**: `evm-chain.js:2041-2054`
- **Process**:
  1. Get `last_block` from `this.#last_caughtup_block` or `getLastBlock() - 100`
  2. Check for imported data (from import_metadata table)
  3. If imported data exists and extends beyond `last_block`, use it instead
  4. Get `top_available_block` from current blockchain state
  5. Log block range: `last_block` to `top_available_block`

#### Logic Behind `last_block` Movement

**Key Concept**: `last_block` represents the starting point for catchup queries, but it does NOT move forward during catchup. It's only updated at catchup completion.

**1. Initial `last_block` Determination** (line 2043):
```javascript
let last_block = this.#last_caughtup_block || Math.max(await this.getLastBlock() - 100, 0);
```
- **Priority 1**: Use `this.#last_caughtup_block` if it exists (from previous catchup session)
- **Priority 2**: Otherwise, use `getLastBlock() - 100` from database
  - `getLastBlock()` reads from `last_blocks` table in database
  - `- 100` provides a safety margin for blockchain reorganizations
- **Priority 3**: Can be overridden by imported data if it extends further (line 2048-2050)

**2. During Catchup - `last_block` is Fixed**:
- `last_block` is used as the starting point for address queries
- It does NOT change during catchup execution
- All address queries start from this fixed `last_block`
- Events are processed, but database is NOT updated during catchup (see `updateLastBlock()` below)

**3. `updateLastBlock()` Behavior** (line 171-174):
```javascript
async updateLastBlock(last_block) {
    if (!this.#bCatchingUp) // we handle events out of order while catching up
        await db.query("UPDATE last_blocks SET last_block=? WHERE network=?", [last_block, this.network]);
}
```
- **During catchup** (`this.#bCatchingUp = true`): Database is NOT updated
  - This prevents partial updates while events are being processed out of order
  - Events may arrive in any order during catchup
- **After catchup** (`this.#bCatchingUp = false`): Database IS updated
  - Each event handler calls `updateLastBlock(event.blockNumber)`
  - Database is continuously updated as events are processed

**4. At Catchup Completion** (line 2310-2311):
```javascript
const blockNumber = await this.getBlockNumber();
this.#last_caughtup_block = Math.max(blockNumber - 100, 0);
await this.updateLastBlock(blockNumber);
```
- Gets current blockchain block number
- Sets `this.#last_caughtup_block = current_block - 100` (safety margin)
- Updates database to current block (not `- 100`)
- This becomes the starting point for the next catchup

**5. During Normal Operation** (after catchup):
- Each event handler (e.g., `onNewExpatriation`, `onNewClaim`) calls `updateLastBlock(event.blockNumber)`
- Database is continuously updated with the latest processed block
- This keeps the database in sync with real-time event processing

**Summary**:
- **During catchup**: `last_block` is fixed, database is NOT updated
- **At catchup completion**: `last_block` jumps to `current_block - 100`, database updated to `current_block`
- **During normal operation**: Database continuously moves forward with each event
- **Next catchup**: Starts from the last saved `last_block` in database (or `this.#last_caughtup_block` if available)

### 3.3 Collect Addresses to Check
- **Location**: `evm-chain.js:2056-2164`
- **Process**:
  1. **Bridge Contracts**:
     - Add all addresses from `this.#contractsByAddress` that have `NewClaim` filter
     - Query database for bridges where this network is `foreign_network` or `home_network`
     - Filter out not-supported bridges (from `conf.NotSupportedBridges`)
     - Add `import_aa` addresses (if `foreign_network === this.network`)
     - Add `export_aa` addresses (if `home_network === this.network`)
     - Create contract instances if they don't exist
     - Set up event listeners (`NewExpatriation`, `NewRepatriation`, `NewClaim`, etc.)
  
  2. **Factory Contracts**:
     - Add factory contract addresses from `this.#factory_contract_addresses`
     - Add assistant factory contract addresses from `this.#assistant_factory_contract_addresses`
  
  3. **Logging**:
     - Log all addresses being checked with bridge info
     - Show total count of addresses (contracts + factories)

### 3.4 Query Addresses for Block Numbers
- **Location**: `evm-chain.js:2166-2287`
- **Condition**: Only if `top_available_block > last_block`
- **Process**:
  
  **3.4.1 Priority Separation**:
  - Separate addresses into priority and regular sets
  - Priority addresses come from `conf.topPriorityBridges`
  
  **3.4.2 For Each Address** (`queryAddress` function):
  
  **a) Peer Seeding (if enabled)**:
  - If `conf.bEnablePeerSeeding`:
    - Request block numbers from peers via `peer_seeding.requestBlockNumbersFromPeers()`
    - If peers return blocks, use them
    - Otherwise, fall back to explorer/parser
  
  **b) Explorer/Parser Fallback**:
  - If peer seeding didn't return results and not in peer-seeding-only mode:
  
  **3.4.3 Address Query Tracking and Resuming**:
  
  **⚠️ Important: Address queries are NOT tracked for resuming**
  - **No state saved**: The catchup process does NOT save which addresses have been queried
  - **No resume mechanism**: If catchup is interrupted, it will re-query ALL addresses from `last_block`
  - **Sequential processing**: Addresses are processed one-by-one in a loop (lines 2276-2287)
  - **Only block-level persistence**: Only `this.#last_caughtup_block` is saved, not address-level progress
  
  **What IS tracked:**
  - `this.#last_caughtup_block`: Last block that was caught up (persisted in database)
  - Parser cache: For BSCScan/Etherscan parsers, parsing progress per address is cached (pages, transactions)
  - But catchup doesn't track which addresses it has already queried
  
  **What happens on interruption:**
  - If catchup is interrupted and restarted:
    1. Uses `this.#last_caughtup_block` (if set) or `getLastBlock() - 100` from database
    2. Re-collects ALL addresses to check (fresh list)
    3. Re-queries ALL addresses from `last_block` to current
    4. This means addresses may be queried multiple times if catchup is interrupted
  
  **Why this works:**
  - Parser cache prevents redundant API calls (cached results are reused)
  - Database prevents duplicate event processing (duplicate checks in event handlers)
  - Block-level tracking ensures no events are missed (always queries from last caught-up block)
  - The overhead of re-querying addresses is acceptable since parser cache speeds up subsequent queries

#### Can Catchup Be Interrupted?

**Short Answer**: Yes, catchup can be interrupted and will still work correctly, but it's inefficient.

**What Happens During Catchup**:
- Events are **immediately saved** to the database as they're processed (transfers, claims, challenges)
- `last_blocks` table is **NOT updated** during catchup (only at completion)
- Duplicate checks prevent re-processing events that are already in the database

**What Happens If Interrupted**:
1. **Events already processed are safe**: All events processed before interruption are already saved to the database
2. **No progress lost**: Database has all the events that were processed
3. **On restart**: 
   - Uses old `last_block` value from database (since it wasn't updated during catchup)
   - Re-queries ALL addresses from that old `last_block`
   - Re-processes events, but duplicate checks skip events already in database
4. **Result**: 
   - ✅ **Safe**: No events are lost or processed twice (duplicate checks prevent this)
   - ⚠️ **Inefficient**: Re-queries all addresses and re-processes events (but skips duplicates)
   - ⚠️ **Time-consuming**: Takes longer because it re-does work

**Why It's Safe**:
- Events are saved immediately (not batched)
- Duplicate checks in event handlers (lines 860-869, 949-957, 983-992) prevent re-processing
- Database is the source of truth for what's been processed

**Why It's Inefficient**:
- No resume mechanism - always starts from `last_block`
- Re-queries all addresses even if some were already queried
- Re-processes events (but duplicate checks make this fast)

**Best Practice**: 
- Ideally, catchup should complete in one take for efficiency
- But if interrupted, it will still work correctly - just takes longer
- The system is designed to be resilient to interruptions
    - Check if imported data exists and covers the range
    - If not, call `this.getAddressBlocks(address, last_block)`
    - This triggers:
      - **Parser Mode** (if `conf.AlwaysUseBSCscanParser` or `conf.AlwaysUseEtherscanParser`):
        - Load parser cache for address
        - If cache exists and `hasMorePages = false`: start from page 1 (check for new data)
        - If cache exists and `hasMorePages = true`: resume from `lastProcessedPage + 1`
        - If no cache: start from page 1 and parse all pages until `hasMorePages = false`
        - Extract block numbers and transactions from HTML pages
        - Cache results with `hasMorePages` flag
      - **Provider Mode** (if parser not enabled):
        - Query blockchain provider for events
        - Extract block numbers from event logs
  
  **c) Process Events**:
  - If address has a contract instance (bridge contract):
    - For each block number found:
      - Call `this.processPastEventsOnBridgeContract(contract, blockNumber, blockNumber)`
      - This processes events for that specific block
  - If address is a factory:
    - Log that events will be processed by factory monitoring
  
  **3.4.3 Execution Order**:
  - Query priority addresses first (sequentially)
  - Then query regular addresses (sequentially)

### 3.5 Process Past Events from Since Block
- **Location**: `evm-chain.js:2292-2299`
- **Process**:
  - Calculate `since_block`:
    - If `top_available_block` exists or no `last_caughtup_block`: use `getSinceBlock()`
    - Otherwise: use `this.#last_caughtup_block`
  - For each bridge contract in `this.#contractsByAddress`:
    - Call `this.processPastEventsOnBridgeContract(contract, since_block, 0)`
    - This processes all events from `since_block` to latest (to_block=0 means "all")

### 3.6 Catch-Up Completion
- **Location**: `evm-chain.js:2305-2312`
- **Actions**:
  - Acquire mutex lock (ensures all events are processed)
  - Set `this.#bCatchingUp = false`
  - Get current block number
  - Set `this.#last_caughtup_block = Math.max(blockNumber - 100, 0)`
  - Update last processed block in database
  - Log: `"catching up ${this.network} done"`

---

## Phase 4: Event Processing (evm-chain.js)

### 4.1 Process Past Events on Bridge Contract
- **Location**: `evm-chain.js:processPastEventsOnBridgeContract()`
- **Process**:
  1. Create event filters for:
     - `NewExpatriation`
     - `NewRepatriation`
     - `NewClaim`
     - `NewChallenge`
     - `FinishedClaim`
  
  2. **Parser Cache Path** (if parser enabled):
     - Call `processPastEventsFromParserCache()`
     - Load cached transactions and event logs from parser cache files
     - Filter by block range
     - Convert parser event logs to ethers.js event format
     - Decode event parameters using contract ABI
     - Call event handlers
  
  3. **Provider Path** (if parser not enabled):
     - Query blockchain provider for events
     - Decode events using contract interface
     - Call event handlers

### 4.2 Process Past Events from Parser Cache
- **Location**: `evm-chain.js:1594-1913`
- **Process**:
  1. **Load Cache**:
     - Get cached transactions for contract address
     - Filter transactions by block range (`since_block` to `to_block`)
     - If no transactions in range but cache exists:
       - For single block queries: process all cached transactions
       - For "process all" requests: process all cached transactions
       - For range queries: expand window or process all if no overlap
  
  2. **Sort Transactions**:
     - Sort by block number (chronological order)
     - Important for assistant events that depend on bridge events
  
  3. **Process Event Logs**:
     - For each transaction:
       - Get cached event logs
       - Filter by event topic (if filter provided)
       - For each matching log:
         - Try to decode using contract interface
         - Extract indexed parameters from `log.topics`
         - Extract non-indexed parameters from `log.data`
         - Handle special case: `data` parameter defaults to `""` if missing
         - If decoding fails, use fallback mapping (`mapEventDataToArgs`)
         - Create mock event object with:
           - `event` (event name)
           - `args` (decoded parameters)
           - `address` (contract address)
           - `blockNumber`
           - `blockHash` (may be null from parser)
           - `transactionHash`
           - `transactionIndex`
           - `removed` (false for cached events)
         - Call event handler with decoded parameters

### 4.3 Event Handlers
- **Location**: `evm-chain.js:onNewExpatriation`, `onNewRepatriation`, `onNewClaim`, etc.
- **Process**:
  - Each handler:
    1. Acquires mutex lock (`this.network + 'Event'`)
    2. Checks for duplicates (during catchup)
    3. Normalizes addresses to checksummed format
    4. Gets block timestamp (with fallback if `blockHash` is null)
    5. Calls corresponding function in `transfers.js`:
       - `transfers.addTransfer()` for transfers
       - `transfers.handleNewClaim()` for claims
       - `transfers.handleChallenge()` for challenges
    6. Updates last processed block
    7. Releases mutex lock

---

## Phase 5: Transfer/Claim Processing (transfers.js)

### 5.1 Add Transfer
- **Location**: `transfers.js:addTransfer()`
- **Process**:
  - Normalize addresses
  - Insert transfer into database
  - Link orphaned claims if any match this transfer
  - During catchup: early duplicate check to avoid unnecessary work

### 5.2 Handle New Claim
- **Location**: `transfers.js:handleNewClaim()`
- **Entry Conditions** (must be met before processing starts):
  1. **Watchdog enabled**: `conf.bWatchdog` must be `true` (line 544)
     - If false: function returns early with log message
  2. **Bridge supported**: Bridge ID must not be in `conf.NotSupportedBridges` array (lines 548-551)
     - If in list: function returns early with log message
  3. **Address normalization**: All addresses normalized to checksummed format (lines 563-565)
  4. **Mutex lock acquired**: Network-specific mutex lock obtained (line 567)
  5. **No duplicate claim**: Claim with same `claim_num`, `bridge_id`, and `type` must not exist in database (lines 570-572)
     - If duplicate found: function returns early with unlock
  6. **Opposite network active**: `networkApi[opposite_network]` must exist (lines 576-577)
     - If not active: function returns early with unlock
  7. **Opposite network synced**: Must wait for opposite network to sync via `waitUntilSynced()` (line 578)
  8. **Bridge complete**: Bridge must have both `import_aa` and `export_aa` defined (lines 579-580)
     - If incomplete: attempts to refresh bridge from database
  9. **Amount validation**: `amount` must be a positive integer, `reward` must be an integer (lines 586-590)
     - Invalid amounts logged but don't stop processing
  10. **Txid validation**: `txid` must be valid for the opposite network (line 591)
      - Invalid txid logged but doesn't stop processing
- **Process** (after all entry conditions met):
  - Normalize addresses
  - Check for duplicate claim
  - Find matching transfer using:
    - `bridge_id`, `txid`, `txts`, `sender_address`, `dest_address`, `type`, `is_confirmed=1`
  - **If transfer not found** (no transfer candidates):
    - **BSC Network Fallback** (lines 625-720):
      - If opposite network is BSC: try fetching from BSCScan parser
      - Uses `fetchTransactionEventLogs()` to get event logs from HTML parser
      - Processes `NewExpatriation`/`NewRepatriation` events from parser cache
      - Creates mock event and processes through BSC network handler
    - **Retry Logic** (during catchup, lines 780-870):
      - Retry with exponential backoff (up to 10 retries total)
      - Try `refresh()` to expand search range after 3 retries
      - **Provider Fetch** (after max retries, lines 809-816):
        - If retry count >= `maxRetriesTotal` (default: 10):
        - Calls `fetchAndSaveTransferFromBlockchain(txid, bridge, type)`
        - This function:
          - Gets provider for opposite network
          - Fetches transaction receipt from blockchain
          - Parses `NewExpatriation`/`NewRepatriation` event from logs
          - Extracts event parameters (sender, amount, reward, dest, data)
          - Normalizes addresses using network APIs
          - Saves transfer to database via `addTransfer()`
          - Returns saved transfer for linking
        - If successful: links claim to fetched transfer
        - If failed: continues with retry logic or marks as invalid
  - **If transfer found**: link claim immediately
  - Create claim record in database

### 5.3 Handle Challenge
- **Location**: `transfers.js:handleChallenge()`
- **When is it triggered?**
  - **Immediately** when a `NewChallenge` event is detected on the blockchain:
    - EVM chains: `evm-chain.js:onNewChallenge()` → calls `handleChallenge()` (line 998)
    - Obyte: `obyte.js:onAAResponse()` → calls `handleChallenge()` (line 458)
  - **Not dependent on catch-up completion**: Challenges are processed as soon as events are detected
- **Entry Conditions** (must be met before processing starts):
  1. **Watchdog enabled**: `conf.bWatchdog` must be `true` (line 983)
     - If false: function returns early with log message
  2. **Mutex lock acquired**: Network-specific mutex lock obtained (line 987)
  3. **No duplicate challenge**: Challenge with same `challenge_txid` and `bridge_id` must not exist in database (lines 990-992)
     - If duplicate found: function returns early with unlock
  4. **Bridge complete**: Bridge must have both `import_aa` and `export_aa` defined (lines 994-995)
     - If incomplete: attempts to refresh bridge from database
  5. **Bridge AA exists**: `bridge_aa` (determined by type) must not be null (lines 999-1001)
     - If null: throws error
  6. **Claim exists on-chain**: Claim must exist when fetched from network API (lines 1004-1009)
     - **Critical**: If `api.getClaim()` returns `null`, challenge is skipped before INSERT
     - If not found (`null`): emits 'challenge' event and returns early with unlock (line 1008)
     - **Why this happens**: Claim may have finished/withdrawn on-chain (even if it exists in database)
     - **Result**: Challenge is NOT stored in database, even if claim exists in DB with `transfer_id`
     - **Log message**: `"ongoing claim {claim_num} challenged in {challenge_txid} not found, will skip"`
     - **Note**: This check happens BEFORE `getValidOutcome()` - if claim is finished on-chain, challenge is skipped regardless of database state
  7. **Claim exists in database**: Claim must exist in database (checked via `getValidOutcome`, lines 1011-1018)
     - **Note**: This check only happens if claim exists on-chain (condition 6 passed)
     - **Critical**: If claim is still in retry logic in `handleNewClaim`, it hasn't been saved to DB yet
     - **Critical**: If claim is still in retry logic in `handleNewClaim`, it hasn't been saved to DB yet
     - If not found (`valid_outcome === null`): schedules retry after 60 seconds and returns
     - **Retry mechanism**: Will retry every 60 seconds until claim appears in database
     - This happens when:
       - Claim processing was delayed but someone challenged it in the meantime
       - Claim is still in retry logic waiting for transfer to appear
       - Claim hasn't completed `handleNewClaim` processing yet
- **Process** (after all entry conditions met):
  - Determine `valid_outcome`:
    - `'yes'` if claim has `transfer_id` (linked to a transfer)
    - `'no'` if claim has no `transfer_id` (orphaned claim)
  - Normalize challenger address
  - Emit 'challenge' event with claim and valid_outcome
  - **Store challenge in database** (line 1033):
    - INSERT happens here, but only if claim exists on-chain (condition 6 passed)
    - If claim finished on-chain, INSERT never executes (early return at line 1008)
  - **If challenge changed outcome** (`stake_on === claim.current_outcome`):
    - **If wrong outcome leads** (`claim.current_outcome !== valid_outcome`):
      - Requires bridge complete (`bCompleteBridge`)
      - Requires attack enabled (`conf.bAttack`)
      - Requires asset exists
      - Requires challenging period not expired
      - Requires positive required counterstake
      - Requires non-zero counterstake balance available
      - If all conditions met: sends counter-challenge

#### When Will `handleChallenge` Process Claims in Retry?

**Key Understanding:**
- `handleChallenge` is triggered **immediately** when challenge events are detected (not waiting for catch-up)
- However, it **cannot process** claims that are still in retry logic because:
  - Claims are only saved to the database at the **END** of `handleNewClaim` (line 970)
  - Claims in retry haven't been saved yet, so they don't exist in the database
  - `getValidOutcome()` queries the database - if claim doesn't exist, it returns `null`

**Processing Flow for Claims in Retry:**
1. **Challenge event detected** → `handleChallenge()` called immediately
2. **Claim not in database** (still in retry) → `getValidOutcome()` returns `null`
3. **Retry scheduled**: `handleChallenge()` schedules retry after 60 seconds (line 1014-1016)
4. **Wait for claim**: Retries every 60 seconds until claim appears in database
5. **Claim saved**: When `handleNewClaim` completes (finds transfer or gives up), it saves claim to DB (line 970)
6. **Challenge processed**: On next retry (within 60 seconds), `handleChallenge` finds claim and processes it

**Timeline Example:**
```
T+0s:   NewClaim event → handleNewClaim() starts → enters retry logic (not saved to DB)
T+5s:   NewChallenge event → handleChallenge() called → claim not in DB → retry in 60s
T+65s:  handleChallenge() retries → claim still not in DB → retry in 60s
T+120s: handleNewClaim() completes → claim saved to DB
T+125s: handleChallenge() retries → claim found → processes challenge
```

**Important Notes:**
- Challenges are **not blocked** by catch-up - they start processing immediately
- Challenges **wait** for claims to be saved (up to retry timeout)
- If claim never gets saved (stuck in retry forever), challenge will keep retrying every 60 seconds
- Once claim is saved, challenge will be processed on the next retry cycle (within 60 seconds)

#### Why Challenges May Not Be Stored Even When Claims Exist in Database

**Important Case**: Challenges can be skipped even when claims exist in the database with `transfer_id`.

**Scenario:**
1. Claim exists in database with `transfer_id` (so `getValidOutcome()` would return `'yes'`)
2. Claim is finished/withdrawn on-chain (so `api.getClaim()` returns `null`)
3. Challenge is processed, but `api.getClaim()` is called first (line 1004)
4. Since claim is `null` on-chain, function returns early (line 1008)
5. INSERT statement (line 1033) never executes
6. Challenge is NOT stored in database

**Why This Happens:**
- `api.getClaim()` fetches the claim from the blockchain/AA state
- If claim is finished/withdrawn, it no longer exists in the AA state
- The code assumes: "if claim doesn't exist on-chain, there's nothing to challenge"
- However, the challenge should still be recorded for historical purposes

**Log Pattern:**
```
claim challenged in trigger {challenge_txid} null
ongoing claim {claim_num} challenged in {challenge_txid} not found, will skip
```

**Impact:**
- Challenges for finished claims are not stored in the database
- This is expected behavior (finished claims can't be challenged)
- But challenges should still be recorded for audit/historical purposes

**Key Insight:**
- `getValidOutcome()` checks the database (returns `'yes'` if claim has `transfer_id`)
- `api.getClaim()` checks the blockchain/AA state (returns `null` if claim is finished)
- These can differ: claim exists in DB but is finished on-chain
- When they differ, challenge is skipped before INSERT

---

## Phase 6: Post-Catchup Cleanup

### 6.1 Global Cleanup
- **Location**: `transfers.js:2334-2347`
- **Actions**:
  - Set `bCatchingUp = false`
  - Stop periodic orphaned claims linking
  - Clear claim retry counts
  - Set `bCatchingUpOrHandlingPostponedEvents = false` after 3 minutes

### 6.2 Check Unfinished Claims
- **Location**: `transfers.js:2349`
- **Process**:
  - Check for claims that haven't been finalized
  - Set up periodic check (every 30 minutes in production, 2 minutes in testnet)

---

## Key Flags and State Variables

### Global Flags (transfers.js)
- `bCatchingUp`: `true` during catchup, `false` after completion
- `bCatchingUpOrHandlingPostponedEvents`: `true` during catchup + 3 minutes after
- `caughtUp[network]`: `true` when specific network catchup completes

### Instance Flags (evm-chain.js)
- `this.#bCatchingUp`: `true` during catchup, `false` after completion
- `this.#last_caughtup_block`: Last block processed during catchup

### Parser Cache State
- `hasMorePages`: `false` when parsing completed, `true` when interrupted
- `lastProcessedPage`: Last page number processed
- `pagesFetched`: Total pages fetched
- `transactions`: Array of cached transactions
- `blockNumbers`: Array of cached block numbers

---

## Error Handling

### Network-Level Errors
- Each network catchup retries up to 3 times
- 10-second delay between retries
- If all retries fail, network is marked as not caught up
- Will retry on disconnection/reconnection

### Address-Level Errors
- If querying an address fails, log error and continue with next address
- Errors don't stop the entire catchup process

### Event Processing Errors
- Errors in event handlers are caught and logged
- Processing continues with next event
- Mutex locks ensure no double-processing

---

## Mutex Lock Mechanism

### What is a Mutex Lock?
A **mutex** (mutual exclusion) lock is a synchronization mechanism that ensures only one operation can access a shared resource at a time. In this codebase, it's implemented via `ocore/mutex.js`.

### Network-Specific Locks
The mutex is **network-specific**, meaning each network (BSC, Ethereum, 3DPass, Obyte) has its own separate lock:
- **For `handleNewClaim`**: Lock key = `network` (determined by `type === 'expatriation' ? bridge.foreign_network : bridge.home_network`)
- **For `handleChallenge`**: Lock key = `network` (same determination)
- **For `addTransfer`**: Lock key = `dst_network` (destination network)

### Why Network-Specific?
1. **Parallel Processing**: Different networks can process events concurrently without blocking each other
   - BSC claims can be processed while Ethereum claims are being handled
   - This improves performance during catch-up when multiple networks are active
2. **Prevents Race Conditions**: Within a single network, the lock ensures:
   - No duplicate claim processing (two handlers trying to process the same claim simultaneously)
   - No database conflicts (concurrent INSERT operations on same claim)
   - Consistent state (operations complete in order)
3. **Sequential Processing Per Network**: All claims/challenges for a given network are processed one at a time, ensuring:
   - Duplicate checks happen before database writes
   - State changes are atomic
   - No interleaving of operations that could cause inconsistencies

### How It Works
```javascript
const unlock = await mutex.lock(network);  // Acquire lock for this network
try {
    // Process claim/challenge...
    // Database operations...
} finally {
    unlock();  // Release lock (or return unlock() for early exit)
}
```

### Example Scenario
Without mutex: Two `NewClaim` events arrive simultaneously for the same claim on BSC:
- Both handlers check for duplicates → both find none
- Both try to insert claim → database error or duplicate entry

With mutex: 
- First handler acquires BSC lock → processes claim → releases lock
- Second handler waits for lock → acquires lock → finds duplicate → exits early

### Important Notes
- The `unlock` function **must** be called when done (either explicitly or via `return unlock()`)
- Early returns must call `unlock()` to release the lock
- Different networks don't block each other, allowing true parallel processing

---

## Performance Optimizations

1. **Parallel Network Catchups**: All networks catch up simultaneously
2. **Priority Addresses**: Important bridges are queried first
3. **Parser Cache**: Reuses cached HTML-parsed data instead of API calls
4. **Early Duplicate Checks**: Skips processing if event already in database
5. **Batch Processing**: Processes multiple events in sequence per address
6. **Mutex Locks**: Prevents concurrent processing of same events

---

## Completion Criteria

### Network-Level Completion

A **particular network's catch-up is complete** when:
1. All bridge contract addresses have been queried for missed blocks
2. All events from `since_block` have been processed for all bridge contracts
3. `catchup()` method returns without error
4. `this.#bCatchingUp = false` is set (instance flag)
5. `this.#last_caughtup_block` is updated to current block - 100
6. Last processed block is updated in database
7. `caughtUp[network] = true` is set in transfers.js

**Note:** If a network fails after 3 retry attempts, it's **not** marked as caught up and will retry on reconnection.

### Global Completion

**Global catch-up is complete** when:
1. All networks have completed their `catchup()` method (or failed after max retries)
2. `Promise.all()` resolves (all network catch-ups finished)
3. `bCatchingUp = false` is set (global flag)
4. All event handlers have processed their events
5. Periodic orphaned claims linking is stopped
6. Claim retry counts are cleared
7. `bCatchingUpOrHandlingPostponedEvents = false` is set (after 3 minutes)

---

## Summary Flow Diagram

```
start()
  ├─> Link orphaned claims (pre-catchup)
  ├─> Set up periodic orphaned claims linking
  ├─> Initialize networks
  └─> Parallel catchups for all networks
       │
       ├─> For each network:
       │    ├─> catchup()
       │    │    ├─> Determine block range
       │    │    ├─> Collect addresses to check
       │    │    ├─> Query addresses for block numbers
       │    │    │    ├─> Try peer seeding
       │    │    │    ├─> Fall back to parser/explorer
       │    │    │    └─> Process events per block
       │    │    ├─> Process past events from since_block
       │    │    └─> Mark catchup complete
       │    │
       │    └─> Retry up to 3 times on failure
       │
       └─> All networks complete
            ├─> Set bCatchingUp = false
            ├─> Stop periodic orphaned claims linking
            ├─> Clear retry counts
            └─> Check unfinished claims
```

---

This breakdown covers the entire catch-up process from initialization to completion, including all error handling, optimizations, and state management.

