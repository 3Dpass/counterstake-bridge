# BridgesRegistry Contract

## Overview

The `BridgesRegistry` contract is a centralized registry that stores information about all bridges and assistants created by the Counterstake factories. It provides easy lookup capabilities and maintains a comprehensive list of all deployed bridge infrastructure.

## Features

### Bridge Registration
- **Bridge Address**: The deployed bridge contract address
- **Bridge Type**: Either `Export` or `Import` 
- **Created At**: Timestamp when the bridge was created
- **Exists Flag**: Boolean to check if a bridge is registered

### Assistant Registration
- **Assistant Address**: The deployed assistant contract address
- **Assistant Type**: Either `Import` or `Export`
- **Created At**: Timestamp when the assistant was created
- **Exists Flag**: Boolean to check if an assistant is registered

## Contract Structure

### Enums
```solidity
enum BridgeType { Export, Import }
enum AssistantType { Import, Export }
```

### Structs
```solidity
struct Bridge {
    address bridgeAddress;
    BridgeType bridgeType;
    uint256 createdAt;
    bool exists;
}

struct Assistant {
    address assistantAddress;
    AssistantType assistantType;
    uint256 createdAt;
    bool exists;
}
```

## Key Functions

### Registration Functions
- `registerBridge(address bridgeAddress, BridgeType bridgeType)` - Registers a new bridge (only callable by factories)
- `registerAssistant(address assistantAddress, AssistantType assistantType)` - Registers a new assistant (only callable by factories)

### Query Functions
- `getBridge(address bridgeAddress)` - Returns bridge information
- `getAssistant(address assistantAddress)` - Returns assistant information
- `isBridgeRegistered(address bridgeAddress)` - Checks if a bridge is registered
- `isAssistantRegistered(address assistantAddress)` - Checks if an assistant is registered

### Enumeration Functions
- `getAllBridges()` - Returns all registered bridge addresses
- `getAllAssistants()` - Returns all registered assistant addresses
- `getBridgesByType(BridgeType bridgeType)` - Returns bridges of a specific type
- `getAssistantsByType(AssistantType assistantType)` - Returns assistants of a specific type
- `getBridgeCount()` - Returns total number of registered bridges
- `getAssistantCount()` - Returns total number of registered assistants

### Configuration Functions
- `setFactories(address _counterstakeFactory, address _assistantFactory)` - Sets factory addresses (can only be called once)

## Events

```solidity
event BridgeRegistered(address indexed bridgeAddress, BridgeType bridgeType, uint256 createdAt);
event AssistantRegistered(address indexed assistantAddress, AssistantType assistantType, uint256 createdAt);
```

## Deployment Order

1. **Deploy BridgesRegistry** - Deploy the registry contract first
2. **Deploy Factories** - Deploy CounterstakeFactory and AssistantFactory with registry address
3. **Set Factory Addresses** - Call `setFactories()` on the registry to establish the connection

## Integration with Factories

### CounterstakeFactory Integration
The `CounterstakeFactory` automatically registers bridges when they are created:
- Export bridges are registered with `BridgeType.Export`
- ImportWrapper bridges are registered with `BridgeType.Import`

### AssistantFactory Integration
The `AssistantFactory` automatically registers assistants when they are created:
- ExportAssistant contracts are registered with `AssistantType.Export`
- ImportWrapperAssistant contracts are registered with `AssistantType.Import`

## Usage Examples

### Checking if a Bridge is Registered
```javascript
const isRegistered = await bridgesRegistry.isBridgeRegistered(bridgeAddress);
if (isRegistered) {
    const bridgeInfo = await bridgesRegistry.getBridge(bridgeAddress);
    console.log(`Bridge type: ${bridgeInfo.bridgeType === 0 ? 'Export' : 'Import'}`);
    console.log(`Created at: ${new Date(bridgeInfo.createdAt * 1000)}`);
}
```

### Getting All Export Bridges
```javascript
const exportBridges = await bridgesRegistry.getBridgesByType(0); // BridgeType.Export
console.log(`Found ${exportBridges.length} export bridges`);
```

### Getting All Assistants
```javascript
const allAssistants = await bridgesRegistry.getAllAssistants();
const assistantCount = await bridgesRegistry.getAssistantCount();
console.log(`Total assistants: ${assistantCount}`);
```

## Security Features

- **Factory-Only Registration**: Only the authorized factories can register bridges and assistants
- **Immutable Factory Addresses**: Once set, factory addresses cannot be changed
- **Duplicate Prevention**: Cannot register the same address twice
- **Address Validation**: Ensures addresses are not zero addresses

## Benefits

1. **Centralized Lookup**: Easy to find all bridges and assistants in the system
2. **Type Classification**: Clear distinction between Export and Import bridges/assistants
3. **Creation Tracking**: Timestamp tracking for audit and monitoring purposes
4. **Automated Registration**: No manual intervention required - registration happens automatically
5. **Query Optimization**: Efficient queries for specific types or all items
6. **Event Logging**: All registrations are logged as events for external monitoring

## Testing

Use the provided test script `test-bridges-registry.js` to verify the registry functionality:

```bash
node counterstake-bridge/evm/scripts/test-bridges-registry.js
```

This script will:
1. Deploy all necessary contracts
2. Create test bridges and assistants
3. Verify automatic registration
4. Test all query functions
5. Validate the complete workflow
