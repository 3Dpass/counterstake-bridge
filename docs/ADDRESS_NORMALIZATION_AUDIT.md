# Address Normalization Audit Report

This document provides a comprehensive audit of all address storage operations to ensure all addresses are normalized before being stored in the database.

## Summary

✅ **All address fields are normalized before storage**

## Database Tables and Address Fields

### 1. `bridges` Table

#### Address Fields:
- `export_aa` - Export bridge contract address
- `import_aa` - Import bridge contract address  
- `export_assistant_aa` - Export assistant contract address
- `import_assistant_aa` - Import assistant contract address
- `home_asset` - Home network asset identifier
- `foreign_asset` - Foreign network asset identifier
- `stake_asset` - Staking asset identifier

#### Storage Operations Verified:

**transfers.js:**
- ✅ `handleNewExportAA()` - Line 1335: `export_aa` normalized before duplicate check
- ✅ `handleNewExportAA()` - Line 1384: `export_aa` normalized in INSERT params[0]
- ✅ `handleNewExportAA()` - Line 1386: `home_asset` normalized in INSERT params[2]
- ✅ `handleNewExportAA()` - Line 1389: `foreign_asset` normalized in INSERT params[6]
- ✅ `handleNewExportAA()` - Line 1372: `export_aa` normalized in UPDATE
- ✅ `handleNewImportAA()` - Line 1397: `import_aa` normalized before duplicate check
- ✅ `handleNewImportAA()` - Line 1450: `import_aa` normalized in INSERT params[0]
- ✅ `handleNewImportAA()` - Line 1452: `home_asset` normalized in INSERT params[2]
- ✅ `handleNewImportAA()` - Line 1455: `foreign_asset` normalized in INSERT params[5]
- ✅ `handleNewImportAA()` - Line 1457: `stake_asset` normalized in INSERT params[8]
- ✅ `handleNewImportAA()` - Line 1438: `import_aa` and `stake_asset` normalized in UPDATE
- ✅ `handleNewAssistantAA()` - Line 1464: `assistant_aa` normalized
- ✅ `handleNewAssistantAA()` - Line 1465: `bridge_aa` normalized
- ✅ `handleNewAssistantAA()` - Line 1466: `manager` normalized
- ✅ `handleNewAssistantAA()` - Line 1469: `shares_asset` normalized
- ✅ `handleNewAssistantAA()` - Line 1480: `assistant_aa` normalized in UPDATE
- ✅ `handleNewManager()` - Line 1489: `assistant_aa` normalized before lookup
- ✅ `handleNewManager()` - Line 1509: `assistant_aa` normalized in UPDATE
- ✅ `handleNewManager()` - Line 1524: `newManager` normalized in UPDATE

**setup_3dpass_bridges_from_registry.js:**
- ✅ Line 439-447: Bridge addresses normalized for comparison
- ✅ Line 479: `assistant_aa` normalized
- ✅ Line 480: `bridge_aa` normalized
- ✅ Line 482: `manager` normalized
- ✅ Line 484: `shares_asset` normalized
- ✅ Line 506: `assistantAddress` normalized before UPDATE
- ✅ Line 511-512: `assistantAddress` normalized in UPDATE
- ✅ Line 520-521: `assistantAddress` normalized in UPDATE
- ✅ Line 597: `home_asset` normalized
- ✅ Line 599: `foreign_asset` normalized
- ✅ Line 602-605: `stake_asset` normalized
- ✅ Line 623: `bridge.address` normalized in UPDATE
- ✅ Line 624: `assistantAddress` normalized in UPDATE
- ✅ Line 626: `checksummed_home_asset` normalized
- ✅ Line 630: `checksummed_foreign_asset` normalized
- ✅ Line 684: `home_asset` normalized
- ✅ Line 687: `foreign_asset` normalized
- ✅ Line 707: `bridge.address` normalized in UPDATE
- ✅ Line 708: `assistantAddress` normalized in UPDATE
- ✅ Line 710: `checksummed_home_asset_export` normalized
- ✅ Line 714: `checksummed_foreign_asset_export` normalized
- ✅ Line 783: `home_asset` normalized
- ✅ Line 785: `foreign_asset` normalized
- ✅ Line 788-791: `stake_asset` normalized
- ✅ Line 812: `bridge.address` normalized in INSERT
- ✅ Line 813: `assistantAddress` normalized in INSERT
- ✅ Line 803: `checksummed_home_asset_import` normalized
- ✅ Line 808: `checksummed_foreign_asset_import` normalized
- ✅ Line 811: `checksummed_stake_asset_import` normalized
- ✅ Line 906: `home_asset` normalized
- ✅ Line 909: `foreign_asset` normalized
- ✅ Line 926: `bridge.address` normalized in INSERT
- ✅ Line 927: `assistantAddress` normalized in INSERT
- ✅ Line 923: `checksummed_home_asset_export_new` normalized
- ✅ Line 929: `checksummed_foreign_asset_export_new` normalized
- ✅ Line 833: `assistant_aa` normalized
- ✅ Line 834: `bridge_aa` normalized
- ✅ Line 836: `manager` normalized
- ✅ Line 838: `shares_asset` normalized
- ✅ Line 950: `assistant_aa` normalized
- ✅ Line 951: `bridge_aa` normalized
- ✅ Line 953: `manager` normalized
- ✅ Line 957: `shares_asset` normalized

### 2. `transfers` Table

#### Address Fields:
- `sender_address` - Address that initiated the transfer
- `dest_address` - Destination address for the transfer

#### Storage Operations Verified:

**transfers.js:**
- ✅ `addTransfer()` - Line 177: `sender_address` normalized
- ✅ `addTransfer()` - Line 178: `dest_address` normalized
- ✅ `addTransfer()` - Line 196: Both addresses normalized before INSERT

### 3. `claims` Table

#### Address Fields:
- `sender_address` - Original transfer sender address
- `dest_address` - Original transfer destination address
- `claimant_address` - Address that made the claim

#### Storage Operations Verified:

**transfers.js:**
- ✅ `handleNewClaim()` - Line 554: `sender_address` normalized
- ✅ `handleNewClaim()` - Line 555: `dest_address` normalized
- ✅ `handleNewClaim()` - Line 556: `claimant_address` normalized
- ✅ `handleNewClaim()` - Line 906: All addresses normalized before INSERT

### 4. `challenges` Table

#### Address Fields:
- `address` - Address that made the challenge

#### Storage Operations Verified:

**transfers.js:**
- ✅ `handleChallenge()` - Line 965: `address` normalized
- ✅ `handleChallenge()` - Line 967: `normalized_address` used in INSERT

### 5. `pooled_assistants` Table

#### Address Fields:
- `assistant_aa` - Assistant contract address
- `bridge_aa` - Bridge contract address
- `manager` - Manager address
- `shares_asset` - Shares token address

#### Storage Operations Verified:

**transfers.js:**
- ✅ `handleNewAssistantAA()` - Line 1464: `assistant_aa` normalized
- ✅ `handleNewAssistantAA()` - Line 1465: `bridge_aa` normalized
- ✅ `handleNewAssistantAA()` - Line 1466: `manager` normalized
- ✅ `handleNewAssistantAA()` - Line 1469: `shares_asset` normalized
- ✅ `handleNewAssistantAA()` - Line 1481: All addresses normalized in INSERT
- ✅ `handleNewManager()` - Line 1524: `newManager` normalized
- ✅ `handleNewManager()` - Line 1542: `newManager` and `assistant_aa` normalized in UPDATE
- ✅ `populatePooledAssistantsTable()` - Line 1568: `shares_asset` normalized
- ✅ `populatePooledAssistantsTable()` - Line 1570: All addresses normalized in INSERT

**setup_3dpass_bridges_from_registry.js:**
- ✅ Line 479: `assistant_aa` normalized
- ✅ Line 480: `bridge_aa` normalized
- ✅ Line 482: `manager` normalized
- ✅ Line 484: `shares_asset` normalized
- ✅ Line 485-486: All addresses normalized in INSERT
- ✅ Line 833: `assistant_aa` normalized
- ✅ Line 834: `bridge_aa` normalized
- ✅ Line 836: `manager` normalized
- ✅ Line 838: `shares_asset` normalized
- ✅ Line 839-840: All addresses normalized in INSERT
- ✅ Line 950: `assistant_aa` normalized
- ✅ Line 951: `bridge_aa` normalized
- ✅ Line 953: `manager` normalized
- ✅ Line 957: `shares_asset` normalized
- ✅ Line 958-959: All addresses normalized in INSERT

## Lookup Operations Verified

**transfers.js:**
- ✅ `getBridgeByAddress()` - Line 159: Uses normalized address for lookup
- ✅ `handleNewManager()` - Line 1492: Uses normalized `assistant_aa` for lookup
- ✅ `handleNewExportAA()` - Line 1354: Uses normalized `foreign_asset` for lookup
- ✅ `handleNewImportAA()` - Line 1414: Uses normalized `foreign_asset` for lookup

## Import Operations Verified

**import_db_for_seeding.js:**
- ✅ Lines 75-81: Address columns defined for normalization
- ✅ Lines 93-97: All addresses normalized before INSERT during import

## Edge Cases Handled

1. **Null/undefined addresses**: All normalization functions handle null/undefined gracefully
2. **Obyte addresses**: Normalized using `normalizeAddress()` which returns Obyte addresses as-is
3. **Network API availability**: Normalization uses appropriate network API when available, falls back to null
4. **Stake asset normalization**: Handles cases where stake_asset might be on different networks

## Conclusion

✅ **All address storage operations are verified to use normalization before database operations.**

All INSERT and UPDATE statements that involve address fields have been audited and confirmed to normalize addresses using `normalizeAddress()` from `address_normalizer.js` before storage.

