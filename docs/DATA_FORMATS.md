# Data Formats and Address Normalization

This document describes the address normalization requirements and data format specifications for all parameters stored in the database.

## Overview

All addresses and asset identifiers must be normalized before storage to ensure consistent formatting and prevent comparison issues. The normalization process is handled by the `address_normalizer.js` module.

## Address Types

### EVM Addresses
- **Format**: `0x` followed by 40 hexadecimal characters (42 characters total)
- **Example**: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- **Normalization**: Converted to checksummed format using `ethers.utils.getAddress()`
- **Networks**: Ethereum, BSC, Polygon, Kava, 3DPass

### Obyte Addresses
- **Format**: Base58-encoded string (variable length, typically 32-33 characters)
- **Example**: `O6H6Z57IZX3M4R3P3Q4V5W6X7Y8Z9A0B1C2D3`
- **Normalization**: Stored as-is (no changes)
- **Networks**: Obyte

## Address Normalizer Module

The `address_normalizer.js` module provides centralized address normalization logic:

### Functions

#### `isEVMAddress(address)`
- **Purpose**: Checks if an address is in EVM format
- **Returns**: `true` if address starts with `0x` and is 42 characters long
- **Usage**: Internal helper function

#### `normalizeAddress(address, networkApi)`
- **Purpose**: Normalizes an address to checksummed format if EVM, otherwise returns as-is
- **Parameters**:
  - `address` (string): The address to normalize
  - `networkApi` (Object, optional): Network API instance for validation
- **Returns**: Checksummed EVM address or original address if not EVM
- **Behavior**:
  - EVM addresses: Checksummed using `ethers.utils.getAddress()`
  - Obyte addresses: Returned unchanged
  - Invalid addresses: Returned as-is (no error thrown)

#### `normalizeAddressCaseInsensitive(address)`
- **Purpose**: Normalizes address for case-insensitive comparison
- **Returns**: Checksummed EVM address or lowercase version if checksumming fails
- **Usage**: For database lookups where case-insensitivity is desired

## Database Tables and Address Fields

### bridges Table

| Column | Type | Description | Normalization Required |
|--------|------|-------------|------------------------|
| `export_aa` | VARCHAR(50) | Export bridge contract address | ✅ Yes |
| `import_aa` | VARCHAR(50) | Import bridge contract address | ✅ Yes |
| `export_assistant_aa` | VARCHAR(50) | Export assistant contract address | ✅ Yes |
| `import_assistant_aa` | VARCHAR(50) | Import assistant contract address | ✅ Yes |
| `home_asset` | VARCHAR(50) | Home network asset identifier | ✅ Yes |
| `foreign_asset` | VARCHAR(50) | Foreign network asset identifier | ✅ Yes |
| `stake_asset` | VARCHAR(50) | Staking asset identifier | ✅ Yes |

**Normalization Details:**
- `export_aa`: Normalized using `home_network` API
- `import_aa`: Normalized using `foreign_network` API
- `export_assistant_aa`: Normalized using `home_network` API
- `import_assistant_aa`: Normalized using `foreign_network` API
- `home_asset`: Normalized using `home_network` API
- `foreign_asset`: Normalized using `foreign_network` API
- `stake_asset`: Normalized using `foreign_network` API (for expatriation) or `home_network` API (for repatriation)

**Input Format:**
- **EVM**: Any case (lowercase, uppercase, mixed) → Checksummed format
- **Obyte**: Base58 string → Stored as-is

**Example:**
```
Input:  "0x742d35cc6634c0532925a3b844bc9e7595f0beb" (lowercase)
Output: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" (checksummed)

Input:  "O6H6Z57IZX3M4R3P3Q4V5W6X7Y8Z9A0B1C2D3" (Obyte)
Output: "O6H6Z57IZX3M4R3P3Q4V5W6X7Y8Z9A0B1C2D3" (unchanged)
```

### transfers Table

| Column | Type | Description | Normalization Required |
|--------|------|-------------|------------------------|
| `sender_address` | VARCHAR(50) | Address that initiated the transfer | ✅ Yes |
| `dest_address` | VARCHAR(50) | Destination address for the transfer | ✅ Yes |

**Normalization Details:**
- `sender_address`: Normalized using source network API (home_network for expatriation, foreign_network for repatriation)
- `dest_address`: Normalized using destination network API (foreign_network for expatriation, home_network for repatriation)

**Input Format:**
- **EVM**: Any case → Checksummed format
- **Obyte**: Base58 string → Stored as-is

**Example:**
```
Input:  sender_address = "0xabc123..." (lowercase)
Output: sender_address = "0xAbC123..." (checksummed)

Input:  dest_address = "O6H6Z57..." (Obyte)
Output: dest_address = "O6H6Z57..." (unchanged)
```

### claims Table

| Column | Type | Description | Normalization Required |
|--------|------|-------------|------------------------|
| `sender_address` | VARCHAR(50) | Original transfer sender address | ✅ Yes |
| `dest_address` | VARCHAR(50) | Original transfer destination address | ✅ Yes |
| `claimant_address` | VARCHAR(50) | Address that made the claim | ✅ Yes |

**Normalization Details:**
- `sender_address`: Normalized using source network API
- `dest_address`: Normalized using destination network API
- `claimant_address`: Normalized using claim network API (foreign_network for expatriation, home_network for repatriation)

**Input Format:**
- **EVM**: Any case → Checksummed format
- **Obyte**: Base58 string → Stored as-is

**Example:**
```
Input:  claimant_address = "0xdef456..." (mixed case)
Output: claimant_address = "0xDeF456..." (checksummed)
```

### challenges Table

| Column | Type | Description | Normalization Required |
|--------|------|-------------|------------------------|
| `address` | VARCHAR(50) | Address that made the challenge | ✅ Yes |

**Normalization Details:**
- `address`: Normalized using challenge network API (foreign_network for expatriation, home_network for repatriation)

**Input Format:**
- **EVM**: Any case → Checksummed format
- **Obyte**: Base58 string → Stored as-is

**Example:**
```
Input:  address = "0x789abc..." (uppercase)
Output: address = "0x789AbC..." (checksummed)
```

### pooled_assistants Table

| Column | Type | Description | Normalization Required |
|--------|------|-------------|------------------------|
| `assistant_aa` | VARCHAR(50) | Assistant contract address | ✅ Yes |
| `bridge_aa` | VARCHAR(50) | Bridge contract address | ✅ Yes |
| `manager` | VARCHAR(50) | Manager address | ✅ Yes |
| `shares_asset` | VARCHAR(50) | Shares token address | ✅ Yes |

**Normalization Details:**
- `assistant_aa`: Normalized using `network` API
- `bridge_aa`: Normalized using `network` API
- `manager`: Normalized using `network` API
- `shares_asset`: Normalized using `network` API

**Input Format:**
- **EVM**: Any case → Checksummed format
- **Obyte**: Base58 string → Stored as-is

**Example:**
```
Input:  manager = "0x111222..." (lowercase)
Output: manager = "0x111222..." (checksummed)
```

## Normalization Rules Summary

### EVM Addresses (0x...)
1. **Input**: Accepts any case (lowercase, uppercase, mixed)
2. **Processing**: Validated and checksummed using `ethers.utils.getAddress()`
3. **Output**: Mixed-case checksummed format (EIP-55)
4. **Error Handling**: If checksumming fails, address is returned as-is

### Obyte Addresses (Base58)
1. **Input**: Base58-encoded string
2. **Processing**: No changes applied
3. **Output**: Stored exactly as received

### Invalid Addresses
1. **Input**: Addresses that don't match EVM or Obyte format
2. **Processing**: Returned as-is (no error thrown)
3. **Output**: Stored exactly as received

## Implementation Requirements

### Before Storage
All address fields MUST be normalized using `normalizeAddress()` before being inserted or updated in the database.

### Normalization Points
1. **Event Handlers** (`evm-chain.js`, `obyte.js`): Normalize addresses when processing blockchain events
2. **Transfer Functions** (`transfers.js`): Normalize addresses in `addTransfer()` before storage
3. **Claim Functions** (`transfers.js`): Normalize addresses in `handleNewClaim()` before storage
4. **Challenge Functions** (`transfers.js`): Normalize addresses in `handleChallenge()` before storage
5. **Bridge Functions** (`transfers.js`): Normalize addresses in `handleNewExportAA()`, `handleNewImportAA()`, `handleNewAssistantAA()`, `handleNewManager()` before storage
6. **Database Import** (`import_db_for_seeding.js`): Normalize addresses during import

### Network API Usage
When normalizing addresses, always pass the appropriate `networkApi` instance:
- Use `networkApi[home_network]` for home network addresses
- Use `networkApi[foreign_network]` for foreign network addresses
- Use `networkApi[network]` for addresses on a specific network

## Validation Rules

### EVM Address Validation
- Must start with `0x`
- Must be exactly 42 characters long
- Must contain only hexadecimal characters (0-9, a-f, A-F)
- Checksum validation is performed by `ethers.utils.getAddress()`

### Obyte Address Validation
- Must be valid Base58-encoded string
- Validation is performed by the Obyte network API

## Examples

### Example 1: EVM Address Normalization
```javascript
const { normalizeAddress } = require('./address_normalizer.js');
const networkApi = require('./ethereum.js');

// Input: lowercase
const input = "0x742d35cc6634c0532925a3b844bc9e7595f0beb";
const normalized = normalizeAddress(input, networkApi);
// Output: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb" (checksummed)
```

### Example 2: Obyte Address (No Change)
```javascript
const { normalizeAddress } = require('./address_normalizer.js');
const networkApi = require('./obyte.js');

// Input: Obyte address
const input = "O6H6Z57IZX3M4R3P3Q4V5W6X7Y8Z9A0B1C2D3";
const normalized = normalizeAddress(input, networkApi);
// Output: "O6H6Z57IZX3M4R3P3Q4V5W6X7Y8Z9A0B1C2D3" (unchanged)
```

### Example 3: Transfer Address Normalization
```javascript
// In addTransfer() function
const bridge = await getBridge(bridge_id);
const src_network = type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
const dst_network = type === 'expatriation' ? bridge.foreign_network : bridge.home_network;

sender_address = normalizeAddress(sender_address, networkApi[src_network]);
dest_address = normalizeAddress(dest_address, networkApi[dst_network]);
```

## Important Notes

1. **Consistency**: All addresses must be normalized before storage to ensure consistent database queries and comparisons
2. **Case Sensitivity**: EVM addresses are case-insensitive but stored in checksummed format for integrity
3. **Obyte Compatibility**: Obyte addresses are never modified to maintain compatibility with the Obyte network
4. **Error Handling**: Invalid addresses are stored as-is rather than throwing errors, allowing the system to handle edge cases gracefully
5. **Network Context**: Always use the correct network API when normalizing addresses to ensure proper validation

## Non-Address Data Fields

### Numeric Fields (Amounts, Rewards, Stakes)

All numeric values representing token amounts are stored as **decimal strings** (not scientific notation) to preserve precision for large numbers (up to 2^256).

#### Format Requirements

| Field | Database Type | Input Format | Storage Format | Example |
|-------|---------------|--------------|----------------|---------|
| `amount` | VARCHAR(78) | BigNumber, Number, or String | Decimal string | `"1000000000000000000"` |
| `reward` | VARCHAR(78) | BigNumber, Number, or String | Decimal string | `"50000000000000000"` |
| `stake` | VARCHAR(78) | BigNumber, Number, or String | Decimal string | `"2000000000000000000"` |
| `my_stake` | VARCHAR(78) | BigNumber, Number, or String | Decimal string | `"0"` or `"100000000000000000"` |

**Normalization:**
- **Input**: Accepts `BigNumber` objects, JavaScript numbers, or numeric strings
- **Processing**: Converted to `BigNumber` using `BigNumber.from()`, then to string using `.toString()`
- **Output**: Decimal string representation (no scientific notation, no decimal point for integer values)
- **Precision**: Full precision preserved (no rounding)

**Example:**
```javascript
// Input: BigNumber object
const amount = BigNumber.from("1000000000000000000");
const amountString = amount.toString();
// Output: "1000000000000000000"

// Input: Number (for Obyte)
const reward = 1000000;
const rewardString = reward.toString();
// Output: "1000000"

// Input: String
const stake = "2000000000000000000";
// Output: "2000000000000000000" (stored as-is if already valid)
```

**Important Notes:**
- All amounts are stored in the smallest unit (wei for EVM, bytes for Obyte)
- Never use scientific notation (e.g., `"1e18"` is invalid)
- Always use `.toString()` on BigNumber objects before storage
- Negative rewards are allowed (stored as negative decimal strings)

### Transaction IDs (txid, claim_txid, challenge_txid)

Transaction IDs are network-specific and stored exactly as received from the blockchain.

#### Format Requirements

| Field | Database Type | Network | Format | Example |
|-------|---------------|---------|--------|---------|
| `txid` | VARCHAR(66) | EVM | `0x` + 64 hex chars | `"0x1234...abcd"` |
| `txid` | VARCHAR(66) | Obyte | Base58 string | `"abc123..."` |
| `claim_txid` | VARCHAR(66) | EVM | `0x` + 64 hex chars | `"0x5678...efgh"` |
| `claim_txid` | VARCHAR(66) | Obyte | Base58 string | `"xyz789..."` |
| `challenge_txid` | VARCHAR(66) | EVM | `0x` + 64 hex chars | `"0x9abc...ijkl"` |
| `challenge_txid` | VARCHAR(66) | Obyte | Base58 string | `"mno456..."` |

**EVM Transaction IDs:**
- **Format**: `0x` prefix followed by exactly 64 hexadecimal characters
- **Total Length**: 66 characters
- **Validation**: Must match regex `/^0x[0-9a-f]{64}$/`
- **Case**: Stored as received (usually lowercase from blockchain)
- **Normalization**: None required (stored as-is)

**Obyte Transaction IDs:**
- **Format**: Base58-encoded string
- **Length**: Variable (typically 32-33 characters)
- **Validation**: Validated by Obyte network API
- **Normalization**: None required (stored as-is)

**Example:**
```javascript
// EVM txid
const evmTxid = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
// Stored as-is

// Obyte txid
const obyteTxid = "abc123xyz789mno456pqr012";
// Stored as-is
```

### Timestamps (txts)

Transaction timestamps are stored as Unix timestamps (seconds since epoch).

#### Format Requirements

| Field | Database Type | Format | Range | Example |
|-------|---------------|--------|-------|---------|
| `txts` | INT | Unix timestamp (seconds) | 0 to 2^31-1 | `1640995200` |

**Normalization:**
- **Input**: Unix timestamp as integer (seconds since Jan 1, 1970 UTC)
- **Processing**: Stored directly as integer
- **Output**: Integer value
- **Precision**: Seconds (not milliseconds)

**Example:**
```javascript
// Input: Block timestamp from blockchain
const txts = 1640995200; // Jan 1, 2022 00:00:00 UTC
// Stored as: 1640995200

// Input: Date object (must convert)
const date = new Date();
const txts = Math.floor(date.getTime() / 1000); // Convert to seconds
// Stored as: 1640995200
```

### Data Field

The `data` field stores arbitrary data associated with transfers and claims.

#### Format Requirements

| Field | Database Type | Format | Example |
|-------|---------------|--------|---------|
| `data` | TEXT | JSON string or empty string | `""` or `'{"key":"value"}'` |

**Normalization:**
- **Input**: JSON string, empty string, or null
- **Processing**: 
  - Empty string if null/undefined
  - JSON stringified if object
  - Stored as-is if already string
- **Output**: String (empty string `""` if no data)

**Example:**
```javascript
// Input: Empty/null
const data = null;
// Output: ""

// Input: Object
const data = { recipient: "0x123...", memo: "Payment" };
const dataString = JSON.stringify(data);
// Output: '{"recipient":"0x123...","memo":"Payment"}'

// Input: Already stringified
const data = '{"key":"value"}';
// Output: '{"key":"value"}'
```

### Enum Fields

#### Transfer/Claim Type

| Field | Database Type | Valid Values | Example |
|-------|---------------|--------------|---------|
| `type` | CHAR(12) | `'expatriation'` or `'repatriation'` | `'expatriation'` |

**Normalization:**
- **Input**: String `'expatriation'` or `'repatriation'`
- **Processing**: Stored as-is (case-sensitive)
- **Output**: Exact string value

**Example:**
```javascript
// Expatriation: Transfer from home network to foreign network
const type = 'expatriation';

// Repatriation: Transfer from foreign network to home network
const type = 'repatriation';
```

#### Stake Outcome

| Field | Database Type | Valid Values | Example |
|-------|---------------|--------------|---------|
| `stake_on` | VARCHAR(3) | `'yes'` or `'no'` | `'yes'` |

**Normalization:**
- **Input**: String `'yes'` or `'no'`
- **Processing**: Stored as-is (case-sensitive, lowercase)
- **Output**: Exact string value

**Example:**
```javascript
// Stake on valid claim
const stake_on = 'yes';

// Stake on invalid claim
const stake_on = 'no';
```

### Numeric Metadata Fields

#### Decimals

| Field | Database Type | Format | Range | Example |
|-------|---------------|--------|-------|---------|
| `home_asset_decimals` | TINYINT | Integer | 0-255 | `18` |
| `foreign_asset_decimals` | TINYINT | Integer | 0-255 | `6` |

**Normalization:**
- **Input**: Integer (0-255)
- **Processing**: Stored directly as integer
- **Output**: Integer value
- **Null Values**: Allowed (NULL if decimals unknown)

**Example:**
```javascript
// ETH has 18 decimals
const home_asset_decimals = 18;

// USDT has 6 decimals
const foreign_asset_decimals = 6;
```

### String Metadata Fields

#### Network Names

| Field | Database Type | Valid Values | Example |
|-------|---------------|--------------|---------|
| `home_network` | VARCHAR(10) | Network identifier | `'Ethereum'` |
| `foreign_network` | VARCHAR(10) | Network identifier | `'BSC'` |
| `network` | VARCHAR(10) | Network identifier | `'3DPass'` |

**Valid Network Values:**
- `'Ethereum'`
- `'BSC'`
- `'Polygon'`
- `'Kava'`
- `'3DPass'`
- `'Obyte'`

**Normalization:**
- **Input**: Network name string
- **Processing**: Stored as-is (case-sensitive, exact match required)
- **Output**: Exact string value

#### Symbols

| Field | Database Type | Format | Example |
|-------|---------------|--------|---------|
| `home_symbol` | VARCHAR(20) | Token symbol | `'ETH'` |
| `foreign_symbol` | VARCHAR(20) | Token symbol | `'USDT'` |
| `shares_symbol` | VARCHAR(20) | Token symbol | `'ASSIST'` |

**Normalization:**
- **Input**: Token symbol string (uppercase, lowercase, or mixed)
- **Processing**: Stored as-is (no normalization)
- **Output**: Exact string value

**Example:**
```javascript
const home_symbol = 'ETH';
const foreign_symbol = 'USDT';
const shares_symbol = 'ASSIST';
```

#### Versions

| Field | Database Type | Format | Example |
|-------|---------------|--------|---------|
| `e_v` | VARCHAR(6) | Version string | `'v1'` |
| `i_v` | VARCHAR(6) | Version string | `'v2'` |
| `ea_v` | VARCHAR(6) | Version string | `'v1'` |
| `ia_v` | VARCHAR(6) | Version string | `'v1'` |
| `version` | VARCHAR(6) | Version string | `'v1'` |

**Normalization:**
- **Input**: Version string (typically `'v1'`, `'v2'`, etc.)
- **Processing**: Stored as-is
- **Output**: Exact string value
- **Default**: `'v1'` if not specified

### Boolean/Flag Fields

#### Confirmation Flags

| Field | Database Type | Format | Values | Example |
|-------|---------------|--------|--------|---------|
| `is_confirmed` | TINYINT | Integer | `NULL`, `0`, or `1` | `1` |
| `is_bad` | TINYINT | Integer | `0` or `1` | `0` |
| `is_finished` | TINYINT | Integer | `0` or `1` | `0` |

**Normalization:**
- **Input**: Boolean or integer (0/1)
- **Processing**: 
  - `true` → `1`
  - `false` → `0`
  - `NULL` allowed for `is_confirmed` (unconfirmed state)
- **Output**: Integer (0 or 1, or NULL for `is_confirmed`)

**Example:**
```javascript
// Confirmed transfer
const is_confirmed = 1;

// Unconfirmed transfer (during reorg)
const is_confirmed = NULL;

// Bad transfer
const is_bad = 1;

// Finished claim
const is_finished = 1;
```

### Timestamp Fields (Auto-generated)

| Field | Database Type | Format | Description |
|-------|---------------|--------|-------------|
| `creation_date` | TIMESTAMP | SQL timestamp | Auto-generated on insert |

**Normalization:**
- **Input**: Not provided (auto-generated)
- **Processing**: Database sets `CURRENT_TIMESTAMP` on insert
- **Output**: SQL timestamp (e.g., `'2024-01-15 10:30:45'`)

## Data Format Summary Table

| Field Category | Normalization Required | Input Format | Storage Format |
|----------------|------------------------|--------------|----------------|
| **Addresses** | ✅ Yes | EVM: any case, Obyte: base58 | EVM: checksummed, Obyte: as-is |
| **Amounts/Rewards/Stakes** | ✅ Yes | BigNumber/Number/String | Decimal string |
| **Transaction IDs** | ❌ No | Network-specific | As-is |
| **Timestamps** | ❌ No | Unix timestamp (seconds) | Integer |
| **Data** | ✅ Yes | JSON object/string/null | JSON string or "" |
| **Type** | ❌ No | 'expatriation'/'repatriation' | As-is |
| **Stake Outcome** | ❌ No | 'yes'/'no' | As-is |
| **Decimals** | ❌ No | Integer 0-255 | Integer |
| **Network Names** | ❌ No | Network identifier | As-is |
| **Symbols** | ❌ No | Token symbol | As-is |
| **Versions** | ❌ No | Version string | As-is |
| **Flags** | ✅ Yes | Boolean/Integer | Integer 0/1 |

## Related Files

- `address_normalizer.js`: Core normalization logic
- `transfers.js`: Transfer, claim, and challenge handling
- `evm-chain.js`: EVM network event processing
- `obyte.js`: Obyte network event processing
- `setup_3dpass_bridges_from_registry.js`: Bridge setup and normalization
- `import_db_for_seeding.js`: Database import with normalization

