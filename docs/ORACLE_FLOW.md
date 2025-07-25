# Oracle Flow Documentation

## Overview

The Oracle system in the counterstake bridge serves as a **price feed mechanism** that provides exchange rates between different assets to calculate required stakes and gas costs. This document outlines the complete Oracle flow and its integration with the bridge contracts.

## Oracle Contract Structure

### Core Components

```solidity
struct Fraction {
    uint num;
    uint den;
}

mapping(string => mapping(string => Fraction)) public prices;
```

The Oracle contract stores price pairs as fractions (numerator/denominator) in a nested mapping where:
- **First key**: base asset identifier
- **Second key**: quote asset identifier  
- **Value**: price as a fraction

### Price Retrieval Logic

```solidity
function getPrice(string memory base, string memory quote) public override view returns (uint num, uint den) {
    if (keccak256(abi.encodePacked(base)) == keccak256(abi.encodePacked(quote)))
        return (1, 1);
    Fraction storage price = prices[base][quote];
    if (price.num > 0)
        return (price.num, price.den);
    // try a reverse fraction
    price = prices[quote][base];
    if (price.num > 0)
        return (price.den, price.num);
    return (0, 0);
}
```

The oracle can:
- Return `1:1` for same asset pairs
- Return stored price if available
- Try reverse price (inverse fraction) if direct price not found
- Return `(0,0)` if no price available

## Oracle Usage in Bridge Contracts

### 1. Import Contracts

**Import.sol** uses the oracle to calculate required stakes:

```solidity
function getOraclePrice(address oracleAddr) view private returns (uint, uint) {
    bytes32 home_asset_hash = keccak256(abi.encodePacked(home_asset));
    return IOracle(oracleAddr).getPrice(
        home_asset_hash == base_hash || home_asset_hash == zx_hash ? home_network : home_asset, 
        settings.tokenAddress == address(0) ? "_NATIVE_" : IERC20WithSymbol(settings.tokenAddress).symbol()
    );
}
```

**Required Stake Calculation**:
```solidity
function getRequiredStake(uint amount) public view override returns (uint) {
    (uint num, uint den) = getOraclePrice(oracleAddress);
    require(num > 0, "price num must be positive");
    require(den > 0, "price den must be positive");
    uint stake_in_image_asset = amount * settings.ratio100 / 100;
    return Math.max(Math.max(stake_in_image_asset * num / den, stake_in_image_asset * min_price20 / 1e20), settings.min_stake);
}
```

### 2. Assistant Contracts

**ExportAssistant.sol** uses the oracle for gas cost calculations:

```solidity
function getOraclePriceOfNative(address oracleAddr) view private returns (uint, uint) {
    if (tokenAddress == address(0))
        return (1, 1);
    (uint num, uint den) = IOracle(oracleAddr).getPrice("_NATIVE_", IERC20WithSymbol(tokenAddress).symbol());
    require(num > 0, "price num must be positive");
    require(den > 0, "price den must be positive");
    return (num, den);
}
```

**ImportAssistant.sol** does the same:

```solidity
function getOraclePriceOfNative() view private returns (uint, uint) {
    if (tokenAddress == address(0))
        return (1, 1);
    address oracleAddr = Import(bridgeAddress).oracleAddress();
    (uint num, uint den) = IOracle(oracleAddr).getPrice("_NATIVE_", IERC20WithSymbol(tokenAddress).symbol());
    require(num > 0, "price num must be positive");
    require(den > 0, "price den must be positive");
    return (num, den);
}
```

### 3. Gas Cost Calculation

Both assistants use oracle prices to convert gas costs to stake tokens:

```solidity
function getGasCostInStakeTokens(uint gas, uint num, uint den) view internal returns (uint) {
    return gas * tx.gasprice * num/den;
}
```

## Oracle Management

### Price Setting

Only the oracle owner can set prices:

```solidity
function setPrice(string memory base, string memory quote, uint num, uint den) onlyOwner public {
    Fraction storage reverse_price = prices[quote][base];
    bool reverse_price_exists = (reverse_price.num > 0 || reverse_price.den > 0);
    if (!reverse_price_exists)
        prices[base][quote] = Fraction({num: num, den: den});
    else
        prices[quote][base] = Fraction({num: den, den: num});
}
```

### Governance Control

Import contracts can change oracle addresses through governance:

```solidity
function setOracle(address oracleAddr) onlyVotedValueContract external {
    oracleAddress = oracleAddr;
}
```

### Oracle Validation

Contracts validate oracles before use:

```solidity
function validateOracle(address oracleAddr) view public {
    require(CounterstakeLibrary.isContract(oracleAddr), "bad oracle");
    (uint num, uint den) = getOraclePrice(oracleAddr);
    require(num > 0 || den > 0, "no price from oracle");
}
```

## Special Asset Handling

The system handles special cases:

- `"_NATIVE_"` for native tokens (ETH, BNB, etc.)
- `"P3D"` for 3DPass native token
- Base assets use network name instead of asset identifier
- Special handling for zero addresses and base assets

## Oracle Flow Summary

### 1. **Stake Calculation Flow**
1. User initiates a claim/transfer
2. Contract calls `getRequiredStake(amount)`
3. Oracle provides price for asset pair
4. Required stake calculated using: `amount * ratio * price + min_stake`
5. Minimum price protection applied

### 2. **Gas Cost Flow**
1. Assistant contract performs operation (claim/challenge)
2. Gas consumed is tracked
3. Oracle provides native token price
4. Gas cost converted to stake tokens: `gas * gasprice * oracle_price`
5. Network fee compensation updated

### 3. **Price Management Flow**
1. Oracle owner sets prices via `setPrice()`
2. Prices stored as fractions in mapping
3. Contracts validate oracle before use
4. Governance can change oracle addresses
5. Fallback mechanisms for missing prices

## Security Considerations

### Price Protection
- **Minimum price thresholds**: `min_price20` protects against malicious oracles
- **Validation checks**: Oracle addresses and price responses are validated
- **Governance control**: Oracle selection is managed through governance

### Fallback Mechanisms
- **Reverse price lookup**: If direct price not found, try inverse
- **Same asset handling**: Returns 1:1 for identical assets
- **Zero price handling**: Returns (0,0) for unavailable prices

### Gas Optimization
- **View functions**: Price queries are read-only
- **Caching**: Prices are queried only when needed
- **Efficient storage**: Fractional representation minimizes storage costs

## Integration Points

### Bridge Factory
The `CounterstakeFactory` creates Import/Export contracts with oracle addresses:
- Oracle address passed during contract creation
- Governance setup includes oracle management
- Oracle validation during initialization

### Assistant Contracts
- ExportAssistant: Uses oracle for gas cost calculations
- ImportAssistant: Uses oracle for gas cost calculations
- Both validate oracle addresses through governance

### Import/Export Contracts
- Import: Uses oracle for stake calculations
- Export: Inherits oracle functionality from base contracts
- Both support oracle address changes through governance

## Conclusion

The Oracle flow ensures that:
1. **Stake calculations** are based on current market prices
2. **Gas costs** are properly converted between different tokens
3. **Price protection** through minimum price thresholds
4. **Governance control** over oracle selection
5. **Fallback mechanisms** for missing price pairs

This creates a robust price discovery system that's essential for the bridge's economic security and proper functioning. 