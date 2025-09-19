# Database Management Scripts

This directory contains scripts for managing the Counterstake Bridge database, including cleanup and state checking utilities.

## Scripts Overview

### 1. `cleanup_database.js` - Database Cleanup Script

**Purpose**: Safely removes all bridge-related data from the database while respecting foreign key constraints.

**Usage**:
```bash
node cleanup_database.js
```

**What it does**:
- Removes data in the correct order to avoid foreign key constraint violations:
  1. Challenges
  2. Claims  
  3. Transfers
  4. Pooled Assistants
  5. Bridges
- Shows before/after counts
- Verifies successful cleanup
- Handles errors gracefully

**Features**:
- ✅ Respects foreign key constraints
- ✅ Shows detailed progress
- ✅ Verifies final state
- ✅ Safe to run multiple times
- ✅ Proper error handling

### 2. `check_database_state.js` - Database State Checker

**Purpose**: Checks the current state of the database without making any changes.

**Usage**:
```bash
node check_database_state.js
```

**What it shows**:
- Count of records in each table
- Detailed bridge information (if any exist)
- Bridge types (Import only, Export only, Complete)
- Summary statistics

**Features**:
- ✅ Read-only operation
- ✅ Detailed bridge information
- ✅ Bridge type classification
- ✅ Summary statistics

## Database Schema

The bridge system uses the following tables with foreign key relationships:

```
bridges (parent table)
├── pooled_assistants (references bridges.bridge_id)
├── transfers (references bridges.bridge_id)
├── claims (references bridges.bridge_id)
└── challenges (references bridges.bridge_id)
```

## Foreign Key Constraints

The cleanup script removes data in the correct order to respect these constraints:

1. **challenges** → references `bridges.bridge_id`
2. **claims** → references `bridges.bridge_id`
3. **transfers** → references `bridges.bridge_id`
4. **pooled_assistants** → references `bridges.bridge_id`
5. **bridges** → parent table (removed last)

## Common Use Cases

### Clean Database for Fresh Start
```bash
# Check current state
node check_database_state.js

# Clean everything
node cleanup_database.js

# Verify cleanup
node check_database_state.js
```

### Debug Bridge Issues
```bash
# Check what bridges exist
node check_database_state.js

# If needed, clean and start fresh
node cleanup_database.js
```

### Before Testing New Bridge Setup
```bash
# Clean database
node cleanup_database.js

# Run bridge setup
node setup_3dpass_bridges_from_registry.js

# Verify results
node check_database_state.js
```

## Error Handling

Both scripts include comprehensive error handling:

- **Database connection errors**: Properly handled with cleanup
- **Foreign key violations**: Prevented by correct deletion order
- **Missing tables**: Gracefully handled
- **Connection cleanup**: Always closes database connections

## Safety Features

- **Read-only check**: `check_database_state.js` never modifies data
- **Idempotent cleanup**: `cleanup_database.js` can be run multiple times safely
- **Verification**: Both scripts verify their operations
- **Graceful shutdown**: Proper database connection cleanup

## Integration with Other Scripts

These scripts work well with other bridge management scripts:

- `setup_3dpass_bridges_from_registry.js` - Bridge setup
- `remove_all_bridges.js` - Alternative cleanup (legacy)
- `check_3dpass_bridges.js` - 3DPass-specific checks

## Troubleshooting

### "Database is already clean" Message
This is normal when the database has no bridge data. The script will exit gracefully.

### Foreign Key Constraint Errors
If you encounter these errors, use the cleanup script which handles the correct deletion order.

### Connection Issues
Make sure the Obyte node is not running when using these scripts, or use a separate database connection.

## Examples

### Example Output - Clean Database
```
📊 Current database state:
  Challenges: 0
  Claims: 0
  Transfers: 0
  Pooled Assistants: 0
  Bridges: 0

📈 Summary:
  Total bridge-related records: 0
  Status: Database is clean
```

### Example Output - Database with Bridges
```
📊 Current database state:
  Challenges: 5
  Claims: 12
  Transfers: 25
  Pooled Assistants: 8
  Bridges: 3

🌉 Bridge Details:
  Bridge 1:
    Home: Ethereum USDT (0xdAC17F958D2ee523a2206206994597C13D831ec7)
    Foreign: 3DPass wUSDT (0xfBFBfbFA000000000000000000000000000000de)
    Import AA: 0x00D5f00250434e76711e8127A37c6f84dBbDAA4C
    Export AA: 0x3a96AC42A28D5610Aca2A79AE782988110108eDe
    Type: Complete (Import + Export)
```
