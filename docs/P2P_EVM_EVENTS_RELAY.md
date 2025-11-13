# Peer-to-Peer EVM Events Relay (Peer Seeding)

This guide explains how to use the peer-to-peer block number and event sharing feature for EVM chains. This feature allows watchdog nodes to share block numbers and events with each other during catch-up, reducing reliance on block explorer APIs and parsers.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Exporting Database for Sharing](#exporting-database-for-sharing)
- [Importing Database from Peers](#importing-database-from-peers)
- [Setting Up Peer Connections](#setting-up-peer-connections)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The peer seeding feature allows nodes to:

1. **Request block numbers from peers** instead of querying block explorers/parsers
2. **Share block numbers** from their database with other nodes
3. **Reduce API rate limiting** by distributing the load across peers
4. **Speed up catch-up** by leveraging data already collected by peers

### Benefits

- ✅ Reduces API calls to block explorers (Etherscan, BSCScan, etc.)
- ✅ Faster catch-up when peers have the data
- ✅ Distributed data sharing across the network
- ✅ Fallback to explorers/parsers if peers don't respond

## How It Works

### Request Flow

1. **During catch-up**, when a node needs block numbers for an address:
   - If `bEnablePeerSeeding = true`, it sends a request to configured peers
   - Waits up to 10 seconds for a response
   - If peers respond with block numbers → uses those (no explorer call)
   - If peers don't respond → falls back to explorer/parser (unless `bPeerSeedingOnly = true`)

2. **When serving as seeder** (`bServeAsSeeder = true`):
   - Listens for peer requests
   - Queries database for block numbers associated with the requested address
   - Sends block numbers back to requesting peer

### Data Flow

```
Node A (needs data)          Node B (has data)
     |                            |
     |--- Request blocks -------->|
     |   (network, address,       |
     |    startblock)              |
     |                            |
     |                            |--- Query DB --->|
     |                            |<-- Get blocks --|
     |<-- Response (blocks) ------|
     |                            |
     |--- Process events --------->|
```

## Configuration

### Basic Configuration

Add these settings to your `conf.js` or `conf.json`:

```javascript
// Enable requesting block numbers from peers
exports.bEnablePeerSeeding = true;

// Enable responding to peer requests
exports.bServeAsSeeder = true;

// Known peer addresses (Obyte device addresses)
exports.peerSeedingAddresses = [
    'PEER1_DEVICE_ADDRESS',
    'PEER2_DEVICE_ADDRESS'
];

// Optional: Only use peers, never fall back to explorers
exports.bPeerSeedingOnly = false; // Set to true to disable fallback
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `bEnablePeerSeeding` | `false` | Enable requesting block numbers from peers during catch-up |
| `bServeAsSeeder` | `true` | Enable responding to peer requests for block numbers |
| `peerSeedingAddresses` | `[]` | Array of Obyte device addresses to send requests to |
| `bPeerSeedingOnly` | `false` | If `true`, never fall back to explorers/parsers (peers only) |

### Configuration Modes

#### Mode 1: Request Only
```javascript
exports.bEnablePeerSeeding = true;
exports.bServeAsSeeder = false;
exports.peerSeedingAddresses = ['PEER_ADDRESS'];
```
- Requests data from peers
- Does not respond to peer requests

#### Mode 2: Serve Only
```javascript
exports.bEnablePeerSeeding = false;
exports.bServeAsSeeder = true;
```
- Does not request from peers
- Responds to peer requests (useful for dedicated seeders)

#### Mode 3: Full P2P
```javascript
exports.bEnablePeerSeeding = true;
exports.bServeAsSeeder = true;
exports.peerSeedingAddresses = ['PEER1', 'PEER2'];
```
- Requests from peers
- Responds to peer requests
- Full bidirectional sharing

#### Mode 4: Peers Only (No Fallback)
```javascript
exports.bEnablePeerSeeding = true;
exports.bServeAsSeeder = true;
exports.bPeerSeedingOnly = true; // Never use explorers
exports.peerSeedingAddresses = ['PEER1', 'PEER2'];
```
- Only uses peers
- Never falls back to explorers/parsers
- Use only if you have reliable peers

## Exporting Database for Sharing

To share your database data with other nodes, use the export script:

### Step 1: Export Database

```bash
node export_db_for_seeding.js
```

This creates a JSON file (e.g., `db_export_2024-11-13.json`) containing:
- `bridges` - Bridge addresses and metadata
- `transfers` - Transaction hashes (used to derive block numbers)
- `claims` - Claim transaction hashes
- `last_blocks` - Last processed block numbers per network
- `challenges` - Challenge events (counterstake challenges)
- `pooled_assistants` - Pooled assistant configurations (from assistant factory events)

### Step 2: Check Export Contents

The export file includes:
```json
{
  "exportDate": "2024-11-13T10:30:00.000Z",
  "tables": {
    "bridges": [...],
    "transfers": [...],
    "claims": [...],
    "challenges": [...],
    "pooled_assistants": [...],
    "last_blocks": [...]
  }
}
```

### Step 3: Share the Export File

**Share only the JSON export file** - do NOT share:
- ❌ `keys.json` (contains private keys)
- ❌ `conf.json` (may contain API keys)
- ❌ The SQLite database file directly
- ❌ Any other sensitive files

### Export File Size

Typical export sizes:
- Small node (few bridges): ~100 KB - 1 MB
- Medium node (10-20 bridges): ~1-10 MB
- Large node (many bridges): ~10-50 MB

The export is compressed JSON and typically much smaller than the database file.

## Importing Database from Peers

To import data shared by a peer:

### Step 1: Receive Export File

Get the `db_export_YYYY-MM-DD.json` file from a peer.

### Step 2: Import the Data

```bash
node import_db_for_seeding.js db_export_2024-11-13.json
```

The import script:
- ✅ Imports bridges, transfers, claims, challenges, pooled_assistants, and last_blocks
- ✅ Skips duplicates (uses `INSERT OR IGNORE`)
- ✅ Preserves existing data
- ✅ Safe to run multiple times
- ✅ Respects foreign key constraints (imports in correct order)

### Step 3: Verify Import

Check the import results:
```bash
node check_seeding_data.js
```

This shows:
- Number of bridges, transfers, claims, challenges, pooled_assistants
- Networks and transaction counts
- Last processed blocks

### Step 4: Restart Node

After importing, restart your node for the changes to take effect:

```bash
# Stop the node
# Then restart it
node run.js
```

## Setting Up Peer Connections

### Prerequisites

1. **Obyte Network Connection**: Both nodes must be connected to the Obyte network
2. **Device Addresses**: You need each peer's Obyte device address
3. **Network Configuration**: `bWantNewPeers = true` (default) helps discover peers

### Finding Your Device Address

Your device address is logged when the node starts:
```
====== my device address: 0ZWJ32RGLQYRZP4JJC6R6TQUYXEROI6HX
```

Or check your node logs for the device address.

### Adding Peer Addresses

In your `conf.js` or `conf.json`:

```javascript
exports.peerSeedingAddresses = [
    '0ZWJ32RGLQYRZP4JJC6R6TQUYXEROI6HX', // Peer 1
    'ANOTHER_DEVICE_ADDRESS_HERE'        // Peer 2
];
```

### Testing Peer Connection

1. Enable peer seeding on both nodes
2. Check logs for peer communication:
   ```
   Requesting block numbers from peers for BSC/0x... from block 12345
   Sent seed request to 1 peer(s)
   ```

3. On the peer node, you should see:
   ```
   Received seed request from PEER_ADDRESS: BSC/0x... from block 12345
   Sent seed response to PEER_ADDRESS: X block numbers
   ```

## Usage Examples

### Example 1: New Node Catching Up

**Scenario**: You have a new node that needs to catch up quickly.

**Steps**:
1. Get database export from an existing node
2. Import the data:
   ```bash
   node import_db_for_seeding.js db_export_2024-11-13.json
   ```
3. Configure peer seeding:
   ```javascript
   exports.bEnablePeerSeeding = true;
   exports.bServeAsSeeder = true;
   exports.peerSeedingAddresses = ['EXISTING_NODE_ADDRESS'];
   ```
4. Restart node - it will use peer data during catch-up

### Example 2: Dedicated Seeder Node

**Scenario**: You want to run a node that only serves data to others.

**Configuration**:
```javascript
exports.bEnablePeerSeeding = false; // Don't request
exports.bServeAsSeeder = true;      // Only serve
```

This node will:
- ✅ Respond to all peer requests
- ❌ Never request from peers
- Useful for nodes with complete historical data

### Example 3: Private Network

**Scenario**: Multiple nodes in a private network sharing data.

**Configuration** (on all nodes):
```javascript
exports.bEnablePeerSeeding = true;
exports.bServeAsSeeder = true;
exports.peerSeedingAddresses = [
    'NODE1_ADDRESS',
    'NODE2_ADDRESS',
    'NODE3_ADDRESS'
];
```

All nodes will:
- Request from each other
- Respond to each other
- Share the load

### Example 4: Peers-Only Mode

**Scenario**: You want to completely avoid explorer API calls.

**Configuration**:
```javascript
exports.bEnablePeerSeeding = true;
exports.bServeAsSeeder = true;
exports.bPeerSeedingOnly = true; // Never use explorers
exports.peerSeedingAddresses = ['PEER1', 'PEER2', 'PEER3'];
```

**Warning**: Only use this if you have reliable peers. If peers don't respond, catch-up will skip those addresses.

## Troubleshooting

### Issue: No Response from Peers

**Symptoms**:
```
Peer request timeout for BSC/0x... from block 12345
no block numbers from peers, falling back to explorer/parser
```

**Solutions**:
1. **Check peer addresses**: Verify `peerSeedingAddresses` are correct
2. **Check peer is online**: Ensure peer node is running
3. **Check peer configuration**: Peer must have `bServeAsSeeder = true`
4. **Check Obyte connection**: Both nodes must be connected to Obyte network
5. **Check logs**: Look for connection errors in peer node logs

### Issue: Import Fails

**Symptoms**:
```
❌ Error importing database: ...
```

**Solutions**:
1. **Check file format**: Ensure the JSON file is valid
2. **Check file path**: Use absolute or correct relative path
3. **Check database**: Ensure database is not locked (stop node first)
4. **Check permissions**: Ensure write permissions to database

### Issue: Duplicate Data After Import

**Symptoms**: Same data appears multiple times.

**Solution**: This shouldn't happen - the import uses `INSERT OR IGNORE`. If it does:
1. Check for case differences in addresses (e.g., lowercase vs checksummed)
2. Run cleanup script if needed
3. Re-import (duplicates will be skipped)

### Issue: Wrong Block Numbers

**Symptoms**: Block numbers don't match expected values.

**Causes**:
- Database export was from a different network/chain
- Transaction hashes don't match the network
- Database corruption

**Solution**:
1. Verify export is from the correct network
2. Re-export from a trusted source
3. Check database integrity

### Issue: Slow Peer Responses

**Symptoms**: Takes long time to get responses.

**Solutions**:
1. **Database size**: Large databases take longer to query
2. **Network latency**: Obyte network latency affects response time
3. **Query optimization**: The system queries blockchain for each transaction hash
4. **Consider**: Use multiple peers for redundancy

## Best Practices

### 1. Regular Database Exports

Export your database regularly to share with new nodes:
```bash
# Weekly export
node export_db_for_seeding.js
```

### 2. Multiple Peers

Configure multiple peers for redundancy:
```javascript
exports.peerSeedingAddresses = [
    'PEER1',
    'PEER2',
    'PEER3'
];
```

### 3. Monitor Peer Health

Check peer responsiveness:
- Look for timeout messages in logs
- Monitor catch-up speed
- Remove unresponsive peers from list

### 4. Use Fallback Mode Initially

Start with fallback enabled:
```javascript
exports.bPeerSeedingOnly = false; // Allow fallback
```

Only disable fallback once you have reliable peers.

### 5. Dedicated Seeders

Consider running dedicated seeder nodes:
- Nodes with complete historical data
- High availability
- Only serve (`bEnablePeerSeeding = false`, `bServeAsSeeder = true`)

### 6. Security Considerations

- ✅ Only share database exports (JSON files)
- ❌ Never share `keys.json` or `conf.json`
- ✅ Verify peer addresses before adding
- ✅ Use trusted peers only
- ✅ Monitor for suspicious activity

### 7. Database Maintenance

Regular maintenance:
```bash
# Check database state
node check_seeding_data.js

# Check for duplicates
node check_database_state.js

# Clean if needed
node cleanup_database.js
```

## Checking Available Data

To see how much data you have available for sharing:

```bash
node check_seeding_data.js
```

This shows:
- Number of bridges, transfers, claims, challenges, pooled_assistants
- Unique transaction hashes (potential block numbers)
- Breakdown by network
- Last processed blocks

## Performance Considerations

### Database Query Performance

The `getBlockNumbersFromDB` function:
- Queries blockchain for each transaction hash
- Limited to 100 queries per request (to avoid rate limiting)
- May take time for large databases

### Network Performance

- Peer requests timeout after 10 seconds
- Multiple peers can be queried in parallel
- Obyte network latency affects response time

### Optimization Tips

1. **Cache block numbers**: Consider storing block numbers directly in database
2. **Batch queries**: Query multiple addresses together
3. **Prioritize recent data**: Focus on recent blocks first
4. **Use multiple peers**: Distribute load across peers

## Related Documentation

- [Database Management](./DATABASE_MANAGEMENT.md) - Database operations
- [Monitoring Guide](./MONITORING_README.md) - Node monitoring
- [Watchdog Node Flow](./WATCHDOG-NODE_FLOW.md) - Overall node operation

## Summary

The peer seeding feature enables efficient data sharing between watchdog nodes:

1. **Export** your database to share with others
2. **Import** peer databases to speed up catch-up
3. **Configure** peer addresses for automatic sharing
4. **Monitor** peer health and responsiveness
5. **Use fallback** mode for reliability

This reduces API calls, speeds up catch-up, and creates a distributed network of shared blockchain data.

