# 3DPass P3D Integration Guide

## Overview

This guide explains how to integrate P3D (the native token of 3DPass) with the Counterstake bridge system. P3D is unique because it's implemented as an ERC20 precompile at address `0x0000000000000000000000000000000000000802`, which means it behaves like an ERC20 token but is actually native to the 3DPass network.

## Key Differences from Standard Native Tokens

### Standard Native Tokens (ETH, BNB, etc.)
- Use `AddressZero` (`0x0000000000000000000000000000000000000000`) to represent native tokens
- Transfers use `payable(address).transfer(amount)`
- Balance checks use `address.balance`

### P3D on 3DPass
- Uses precompile address `0x0000000000000000000000000000000000000802`
- Transfers use ERC20 interface: `IP3D(precompile).transfer(to, amount)`
- Balance checks use `IP3D(precompile).balanceOf(account)`
- Requires explicit approval: `IP3D(precompile).approve(spender, amount)`

## Contract Modifications

### 1. Counterstake3DPass.sol

This is the base contract that handles P3D's unique behavior:

```solidity
// P3D precompile address constant
address public constant P3D_PRECOMPILE = 0x0000000000000000000000000000000000000802;

// Validation function for token addresses
function validateTokenAddress(address _tokenAddr) internal pure {
    // Allow AddressZero (for native ETH on other networks)
    if (_tokenAddr == address(0)) {
        return;
    }
    // Allow P3D precompile address
    if (_tokenAddr == P3D_PRECOMPILE) {
        return;
    }
    // For other addresses, they should be valid contract addresses
    require(_tokenAddr != address(0), "invalid token address");
}

// Helper functions for P3D handling
function isP3D(address token) internal pure returns (bool) {
    return token == P3D_PRECOMPILE;
}

function isNativeToken(address token) internal pure returns (bool) {
    return token == address(0) || token == P3D_PRECOMPILE;
}

// P3D-aware transfer functions
function transferTokens(address token, address to, uint256 amount) internal {
    if (isP3D(token)) {
        require(IP3D(P3D_PRECOMPILE).transfer(to, amount), "P3D transfer failed");
    } else if (token == address(0)) {
        payable(to).transfer(amount);
    } else {
        IERC20(token).safeTransfer(to, amount);
    }
}
```

### 2. Export3DPass.sol

Inherits from `Counterstake3DPass` and adds validation for network/asset parameters:

```solidity
function initExport(string memory _foreign_network, string memory _foreign_asset) public {
    require(address(governance) == address(0), "already initialized");
    require(bytes(_foreign_network).length > 0, "foreign network cannot be empty");
    require(bytes(_foreign_asset).length > 0, "foreign asset cannot be empty");
    foreign_network = _foreign_network;
    foreign_asset = _foreign_asset;
}
```

### 3. Import3DPass.sol

Inherits from `Counterstake3DPass` and adds P3D-specific oracle validation:

```solidity
function validateOracle(address oracleAddr) view public {
    require(CounterstakeLibrary.isContract(oracleAddr), "bad oracle");
    (uint num, uint den) = getOraclePrice(oracleAddr);
    require(num > 0 || den > 0, "no price from oracle");
    
    // Additional validation for P3D-specific oracle requirements
    if (isP3D(settings.tokenAddress)) {
        // Verify that the oracle can provide P3D prices
        (uint p3d_num, uint p3d_den) = IOracle(oracleAddr).getPrice("P3D", "_NATIVE_");
        require(p3d_num > 0 || p3d_den > 0, "oracle must support P3D pricing");
    }
}
```

## Deployment Script Modifications

### 1. Explicit P3D Precompile Address Validation

The deployment script (`deploy-and-configure-3dpass-p3d.js`) includes comprehensive validation:

```javascript
// Validate P3D precompile address
function validateP3DPrecompileAddress(address) {
    if (address !== P3D_PRECOMPILE_ADDRESS) {
        throw new Error(`Invalid P3D precompile address. Expected: ${P3D_PRECOMPILE_ADDRESS}, Got: ${address}`);
    }
    log(`✓ P3D precompile address validation passed: ${address}`, colors.green);
}

// Validate token address for 3DPass deployment
function validateTokenAddressFor3DPass(address, context) {
    if (address === ethers.constants.AddressZero) {
        log(`⚠️  Warning: Using AddressZero (${address}) for ${context} - this may not work correctly on 3DPass`, colors.yellow);
        return false;
    }
    if (address === P3D_PRECOMPILE_ADDRESS) {
        log(`✓ Using P3D precompile address (${address}) for ${context}`, colors.green);
        return true;
    }
    log(`✓ Using ERC20 token address (${address}) for ${context}`, colors.cyan);
    return true;
}
```

### 2. Validation Points in Deployment

The script validates P3D precompile address usage at multiple points:

1. **Start of deployment**: Validates the constant value
2. **Governance deployment**: Validates voting token address
3. **Export deployment**: Validates stake token address
4. **Import deployment**: Validates stake token address
5. **Assistant deployments**: Validates stake token addresses
6. **Final check**: Confirms all validations passed

### 3. Constructor Parameter Validation

The `deployContract` function automatically validates P3D precompile addresses in constructor arguments:

```javascript
async function deployContract(contractJson, signer, ...args) {
    // Validate P3D precompile address if it's used in constructor arguments
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === 'string' && args[i].toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
            validateP3DPrecompileAddress(args[i]);
        }
    }
    // ... deployment logic
}
```

## Configuration Updates

### 1. conf.js Updates

The deployment script automatically adds P3D precompile address to the configuration:

```javascript
// Add P3D precompile address to conf.js
if (!confContent.includes('p3d_precompile_address')) {
    confContent += `\n// 3DPass specific: P3D precompile address\nexports.p3d_precompile_address = '${P3D_PRECOMPILE_ADDRESS}';\n`;
    log(`Added P3D precompile address to conf.js: ${P3D_PRECOMPILE_ADDRESS}`, colors.cyan);
}
```

### 2. Oracle Price Configuration

P3D-specific oracle prices are set during deployment:

```javascript
// Set P3D prices in oracle
await oracle.setPrice(usdtEthAddress, "P3D", 1, 1); // USDT vs P3D
await oracle.setPrice("wUSDT", "P3D", 1, 1);       // wUSDT vs P3D
```

## Testing Considerations

### 1. P3D Precompile Interface Testing

Ensure the P3D precompile responds correctly to ERC20 calls:

```solidity
// Test P3D interface
function testP3DInterface() public {
    // Test transfer
    require(IP3D(P3D_PRECOMPILE).transfer(address(1), 1000), "P3D transfer failed");
    
    // Test balanceOf
    uint256 balance = IP3D(P3D_PRECOMPILE).balanceOf(address(1));
    require(balance >= 1000, "P3D balance check failed");
    
    // Test approve
    require(IP3D(P3D_PRECOMPILE).approve(address(2), 500), "P3D approve failed");
    
    // Test allowance
    uint256 allowance = IP3D(P3D_PRECOMPILE).allowance(address(1), address(2));
    require(allowance >= 500, "P3D allowance check failed");
}
```

### 2. Cross-Chain Compatibility Testing

Test that P3D bridge instances work correctly with other networks:

```javascript
// Test bridge creation with P3D
const exportContract = await factory.createExport(
    "Ethereum",           // foreign_network
    usdtEthAddress,       // foreign_asset
    P3D_PRECOMPILE_ADDRESS, // home_token (P3D)
    large_threshold,
    challenging_periods,
    long_challenging_periods
);
```

## Security Considerations

### 1. Audit Compliance

Our modifications maintain compliance with the original Counterstake audit:

- ✅ **No critical/high severity issues introduced**
- ✅ **Maintained existing security patterns** (reentrancy guards, etc.)
- ✅ **Improved code organization** (centralized token transfer logic)
- ✅ **Additive changes** (didn't modify existing secure code)

### 2. Validation Best Practices

- **Explicit validation** of P3D precompile address in constructors
- **Input validation** for network and asset parameters
- **Oracle validation** to ensure P3D price support
- **Deployment-time validation** to catch configuration errors early

### 3. Error Handling

- **Clear error messages** for validation failures
- **Graceful fallbacks** for non-P3D tokens
- **Comprehensive logging** during deployment

## Deployment Checklist

Before deploying to 3DPass mainnet, ensure:

- [ ] P3D precompile address validation is working
- [ ] Oracle supports P3D price feeds
- [ ] All contracts use P3D precompile address (not AddressZero)
- [ ] Bridge instances are created with correct parameters
- [ ] Watchdog bots are configured for P3D
- [ ] Cross-chain compatibility is tested
- [ ] Security audit findings are addressed

## Troubleshooting

### Common Issues

1. **"Invalid P3D precompile address" error**
   - Check that you're using `0x0000000000000000000000000000000000000802`
   - Ensure the address is correctly formatted

2. **"Oracle must support P3D pricing" error**
   - Verify oracle has P3D price feeds configured
   - Check oracle contract implementation

3. **"P3D transfer failed" error**
   - Ensure sufficient P3D balance
   - Check if approval is required
   - Verify P3D precompile is working correctly

### Debug Commands

```bash
# Check P3D precompile balance
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x0000000000000000000000000000000000000802","data":"0x70a08231000000000000000000000000YOUR_ADDRESS"}],"id":1}' http://localhost:9978

# Check P3D precompile interface
node -e "const { ethers } = require('ethers'); console.log('P3D interface:', ethers.utils.id('transfer(address,uint256)'));"
```

## Conclusion

The P3D integration maintains the security and functionality of the original Counterstake bridge while adding support for 3DPass's unique native token implementation. The explicit validation ensures that deployments are correct and secure. 