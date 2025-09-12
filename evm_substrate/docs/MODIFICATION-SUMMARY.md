# Counterstake Bridge Modification Summary

## Overview

This document summarizes the comprehensive refactoring of the bridge system to transition from creating new ERC20 tokens to using existing 3DPass ERC20 precompiles. The main goal was to modify the bridge architecture to interact with pre-existing precompile addresses (e.g., `0xFBFBFBFA..`) for minting and burning, rather than creating new tokens.

## System Architecture

### Core Components

```
3DPass Bridge System
├── Substrate Layer (3DPass Chain)
│   ├── Native P3D Token 
│   ├── PoscanAssets pallet // LocalAssets
│   ├── EVM Pallet
│   └── Bridge Pallet
└── EVM Layer
    └──  Counterstake Contracts
    │    ├── Bridge Infrastructure
    │    │    ├── Export/ImportWraper Contracts
    │    │    ├── Assistant Contracts
    │    │    └── Factory Contracts
    │    ├── Oracle System
    │    └── Governance Contracts
    ├── balances-erc20 evm precompile // P3D interaction (Native)
    │   └── P3D ERC20 Address (Native): `0x0000000000000000000000000000000000000802`
    └── assets-erc20 precompile // Assets interaction
```

### Native currency as ERC20 cross-platform Substrate-EVM precompile

Although P3D is a natinve currency in 3dpass, it represents ERC20 token in opposed to other Ethereum-kind-of-systems leveraging the address zero  `0x0000000000000000000000000000000000000000`. 
---
P3D_PRECOMPILE Address (Native): `0x0000000000000000000000000000000000000802`
---

- The Address Zero is not allowed to be stake asset in the contracts!
- Conventional Solidiy interface for native currency is not supported by the contracts!
- The Zddress Zero, however, might be used as a default address, but never represents the native token! 

### Using poscan-assets-erc20 precompiles on Import only

The main implication of using the original version of the Counterstake bridge is the `Import.sol` contract being ERC20 token itself, which makes it impossible to interact with existing tokens. It can only create new foreign assets by cloning itself (ERC20 master contract).

The `ImportWrapper.sol` is a wrapper version of the Import contract, which allows for existing tokens interaction while following exactly the original Counterstake protocol rules. This uncovers cross-platfom integration possibilities for "3Dpass - The Ledger of Things" (LoT) and other hybrid networks. 

In `ImportWrapper.sol` the stake tokens must be either P3D (via `balances-erc20` precmpile) or `poscan-assets-erc20` precompile IERC20 interface callable from Solidity at a specific address prefixed as `0xFBFBFBFA`. The address format is `0xFBFBFBFA + <AssetId in hex>`, where the `AssetId` is an asset id from the poscan-assets Substrate based module operating within the original 3Dpass runtime. And the foreign assets (wrqpped tokens, e.g. wUSDT on LoT) must be `poscan-assets-erc20` precompile IERC20 only.

### poscan-assets-erc20 precompiles on Export for stake assets!

The `Export.sol` contract has been modified to support using existing 3DPass ERC20 precompiles as stake assets. This allows the bridge to use native 3DPass tokens (P3D, FIRE, WATER) as stake tokens for export operations.

In `Export.sol` the stake tokens can be:
- P3D (via `balances-erc20` precompile at `0x0000000000000000000000000000000000000802`)
- Any `poscan-assets-erc20` precompile (e.g., FIRE, WATER tokens)

The foreign assets (wrapped tokens on foreign networks) are handled off-chain and referenced by their addresses on the target networks.

## Key Changes

### 1. Architectural Transition

**Before:** Bridge created new ERC20 tokens via `Import.sol`
**After:** Bridge uses existing precompiles via `ImportWrapper.sol` and `Export.sol`

### 2. Governance System Fixes

#### Critical Governance Bug Fixes Applied

Based on analysis and reference to the [original 3Dpass counterstake-bridge implementation](https://github.com/3Dpass/counterstake-bridge/blob/63e4d5fbee4ad3a09629ba51415ccdb6b5af7c94/evm/contracts/Governance.sol#L70), two critical governance fixes were implemented to resolve test failures and ensure proper governance functionality.

##### Fix #1: ImportWrapper Voting Token Correction

**Problem:** The ImportWrapper contract was using `address(this)` (the ImportWrapper contract address) as the voting token instead of the precompile address.

**Location:** `contracts/ImportWrapper.sol` - Line 65

**Before:**
```solidity
function setupGovernance(GovernanceFactory governanceFactory, VotedValueFactory votedValueFactory) external {
    setupCounterstakeGovernance(governanceFactory, votedValueFactory, address(this)); // ❌ WRONG
    // ...
}
```

**After (Fixed):**
```solidity
function setupGovernance(GovernanceFactory governanceFactory, VotedValueFactory votedValueFactory) external {
    setupCounterstakeGovernance(governanceFactory, votedValueFactory, precompileAddress); // ✅ CORRECT
    // ...
}
```

**Why This Fix:**
- **ImportWrapper** should use the **wUSDT precompile** (`0xfBFBfbFA000000000000000000000000000000de`) as voting token
- **wUSDT token holders** should vote on ImportWrapper governance decisions
- This follows the pattern: stakeholders vote with the tokens they hold

##### Fix #2: Governance Contract Token Support Evolution

**Original Implementation:** The Governance contract initially supported regular ERC20 tokens and the zero address (`address(0)`) as referenced in the [original implementation](https://github.com/3Dpass/counterstake-bridge/blob/63e4d5fbee4ad3a09629ba51415ccdb6b5af7c94/evm/contracts/Governance.sol#L64).

**Problem:** During the bridge system refactoring, the Governance contract was updated to support P3D precompile and 3DPass ERC20 precompiles, but this broke support for regular ERC20 contracts (like assistants), and the zero address support was removed.

**Location:** `counterstake-bridge/evm/contracts/Governance.sol` - Lines 89-93 and 114-116

**Fixed Implementation (Full Support):**

**Complete `deposit` Function:**
```solidity
function deposit(address from, uint amount) nonReentrant payable public {
    require(from == msg.sender || addressBelongsToGovernance(msg.sender), "not allowed");
    if (isP3D(votingTokenAddress)) {
        require(msg.value == 0, "don't send P3D");
        require(IP3D(votingTokenAddress).transferFrom(from, address(this), amount), "P3D transferFrom failed");
    } else if (is3DPassERC20Precompile(votingTokenAddress)) {
        require(msg.value == 0, "don't send P3D");
        require(IPrecompileERC20(votingTokenAddress).transferFrom(from, address(this), amount), "3DPass ERC20 transferFrom failed");
    } else {
        // Handle regular ERC20 contracts (like assistants) using SafeERC20
        require(msg.value == 0, "don't send P3D");
        IERC20(votingTokenAddress).safeTransferFrom(from, address(this), amount); // ✅ SAFE
    }
    balances[from] += amount;
    emit Deposit(from, amount);
}
```

**Complete `withdraw` Function:**
```solidity
function withdraw(uint amount) nonReentrant public {
    require(amount > 0, "zero withdrawal requested");
    require(amount <= balances[msg.sender], "not enough balance");
    require(isUntiedFromAllVotes(msg.sender), "some votes not removed yet");
    balances[msg.sender] -= amount;
    if (isP3D(votingTokenAddress))
        require(IP3D(votingTokenAddress).transfer(msg.sender, amount), "P3D transfer failed");
    else if (is3DPassERC20Precompile(votingTokenAddress))
        require(IPrecompileERC20(votingTokenAddress).transfer(msg.sender, amount), "3DPass ERC20 transfer failed");
    else
        // Handle regular ERC20 contracts (like assistants) using SafeERC20
        IERC20(votingTokenAddress).safeTransfer(msg.sender, amount); // ✅ SAFE
    emit Withdrawal(msg.sender, amount);
}
```

**Why This Fix:**
- **Restores ERC20 Support**: Brings back support for regular ERC20 contracts (like assistants) that was lost during the precompile integration
- **Assistants** are ERC20 contracts that use themselves as voting tokens
- **SafeERC20** provides secure token transfers for non-standard ERC20 tokens
- **Complete governance support** for all contract types in the system
- **Zero Address Prohibition**: Intentionally removed support for `address(0)` to enhance security and prevent native currency governance issues

##### Governance Token Support Evolution

**Original Implementation (Before Modifications):**
- ✅ Regular ERC20 tokens
- ✅ Zero address (`address(0)`) - for native currency governance

**Current Implementation (After All Modifications):**
- ✅ P3D precompile (`0x0000000000000000000000000000000000000802`)
- ✅ 3DPass ERC20 precompiles (`0xFBFBFBFA...`)
- ✅ Regular ERC20 tokens (restored with SafeERC20)
- ❌ Zero address (intentionally prohibited for security)

##### Governance Token Types Now Supported

| Contract Type | Voting Token | Token Type | Example |
|---------------|--------------|------------|---------|
| **ImportWrapper** | `precompileAddress` | 3DPass ERC20 Precompile | wUSDT precompile |
| **Export** | `P3D_PRECOMPILE` | P3D Precompile | P3D precompile |
| **ImportWrapperAssistant** | `address(this)` | Regular ERC20 | Assistant contract |
| **ExportAssistant** | `address(this)` | Regular ERC20 | Assistant contract |

##### Expected Results After Governance Fixes

**Original State (Before All Modifications):**
- ✅ Regular ERC20 governance worked
- ✅ Zero address governance worked
- ❌ No precompile support

**Current State (After All Modifications):**
- ✅ ImportWrapper governance works with wUSDT precompile as voting token
- ✅ Assistant governance works with SafeERC20 transfers
- ✅ P3D and 3DPass precompile governance works
- ✅ Regular ERC20 governance restored
- ✅ All governance tests should pass
- ✅ Complete governance functionality for all contract types
- ✅ Zero address support intentionally removed for security

##### Technical Details of Governance Fixes

**Governance Architecture:**
The governance system now properly supports:
- **Token-based voting** where stakeholders vote with the tokens they hold
- **Multi-token support** for different contract types
- **Secure token operations** using industry-standard libraries

### 3. New Contracts Created

#### `ImportWrapper.sol`
- **Purpose:** Bridge contract that wraps existing 3DPass ERC20 precompiles
- **Inheritance:** `Counterstake` (NOT `ERC20`)
- **Key Features:**
  - Stores `precompileAddress` for the target precompile
  - Calls `mint()` and `burn()` directly on precompiles
  - Validates precompile addresses using `CounterstakeLibrary.is3DPassERC20Precompile()`
  - **Critical Security Function:** `enactImportWrapper()` - performs comprehensive security checks before bridge activation

#### `ImportWrapperAssistant.sol`
- **Purpose:** Assistant contract for `ImportWrapper` operations
- **Key Features:**
  - Gets precompile address from `ImportWrapper`
  - Approves precompile (not bridge) for token transfers
  - Gets image balances directly from precompile
  - Uses `transferFrom` and `transfer` on precompile for operations

#### `IPrecompileERC20.sol`
- **Purpose:** Interface defining 3DPass ERC20 precompile functions
- **Includes:**
  - Standard ERC20 functions (`transfer`, `approve`, `balanceOf`, etc.)
  - LocalAsset functions (`mint`, `burn`)
  - Role management (`setTeam`, `setMetadata`)
  - Freeze/thaw functions (`freeze`, `thaw`)
  - Ownership functions (`transferOwnership`)

### 4. Updated Contracts

#### `CounterstakeFactory.sol`
- **Changes:**
  - Removed `createImport()` function
  - Added `createImportWrapper()` function
  - Added `createExport()` function
  - Updated constructor to use `importWrapperMaster` and `exportMaster`
  - Added `NewImportWrapper` and `NewExport` events

#### `AssistantFactory.sol`
- **Changes:**
  - Removed `ImportAssistant` related code
  - Added `createImportWrapperAssistant()` function
  - Added `createExportAssistant()` function
  - Updated constructor to use `importWrapperAssistantMaster` and `exportAssistantMaster`
  - Added `NewImportWrapperAssistant` and `NewExportAssistant` events

#### `ExportAssistant.sol`
- **Purpose:** Assistant contract for `Export` operations
- **Key Features:**
  - Uses `IPrecompileERC20` interface for stake token operations
  - Supports P3D and other 3DPass ERC20 precompiles as stake tokens
  - Gets stake token address from `Export` bridge
  - Uses `transferFrom` and `transfer` on precompiles for operations
  - Maintains ERC20 shares for assistant participation
  - Implements callback-based claim finalization (`onReceivedFromClaim`)
  - Includes fallback methods (`recordWin`, `recordLoss`) for edge cases

#### `CounterstakeLibrary.sol`
- **Changes:**
  - Added `IPrecompileERC20` import
  - Updated transfer calls to use `IPrecompileERC20(settings.tokenAddress).transfer()` for 3DPass precompiles
  - Added validation functions for precompile addresses
  - Enhanced token type detection for P3D and ERC20 precompiles

### 5. Deleted Contracts

#### `Import.sol`
- **Reason:** Replaced by `ImportWrapper.sol`
- **Issue:** Created new ERC20 tokens instead of using existing precompiles

#### `ImportAssistant.sol`
- **Reason:** Incompatible with new `ImportWrapper` architecture
- **Issue:** Called `Import(bridgeAddr).settings()`, approved bridge instead of precompile

### 6. Updated Deployment Scripts

#### `scripts/test-suites/deploy-and-configure-counterstake.js`
- **Changes:**
  - Updated imports from `Import` to `ImportWrapper`
  - Updated `ImportWrapper` deployment with correct constructor arguments
  - Added `Export` deployment with precompile support
  - Added explicit gas limits for contract deployments
  - Updated factory deployments to use new master addresses

#### `scripts/test-suites/bridge-setup-and-test.js`
- **Changes:**
  - Updated to call `createImportWrapper()` instead of `createImport()`
  - Added calls to `createExport()` for export bridges
  - Added calls to configure precompile roles and metadata
  - Updated assistant creation to use `ImportWrapperAssistant` and `ExportAssistant`
  - Added comprehensive testing for both import and export flows

## Technical Implementation Details

### Precompile Integration

#### Import Wrapper Precompile Integration

1. **Bridge Enactment Security Checks:**
   ```solidity
   function enactImportWrapper() external {
       require(!enacted, "Bridge already enacted");
       require(precompileAddress != address(0), "Precompile address not set");
       
       // Check 1: Contract must be the owner of the asset
       require(LocalAsset(precompileAddress).isOwner(address(this)), "Bridge is not owner of asset");
       
       // Check 2: Contract must be the issuer of the asset
       require(LocalAsset(precompileAddress).isIssuer(address(this)), "Bridge is not issuer of asset");
       
       // Check 3: Contract must be the admin of the asset
       require(LocalAsset(precompileAddress).isAdmin(address(this)), "Bridge is not admin of asset");
       
       // Check 4: Contract must be the freezer of the asset
       require(LocalAsset(precompileAddress).isFreezer(address(this)), "Bridge is not freezer of asset");
       
       // Check 5: Asset status must be "Live"
       string memory assetStatus = LocalAsset(precompileAddress).status();
       require(keccak256(abi.encodePacked(assetStatus)) == keccak256(abi.encodePacked("Live")), "Asset status is not Live");
       
       // Check 6: Bridge balance must equal minBalance
       uint256 minBalance = LocalAsset(precompileAddress).minBalance();
       uint256 bridgeBalance = IPrecompileERC20(precompileAddress).balanceOf(address(this));
       require(bridgeBalance == minBalance, "Bridge balance does not equal minBalance");
       
       // All checks passed - enact the bridge
       enacted = true;
       emit BridgeEnacted(address(this), precompileAddress);
   }
   ```

   **Security Checks Explained:**
   - **Check 1-4 (Role Verification):** Ensures the bridge contract has complete control over the asset (owner, issuer, admin, freezer roles)
   - **Check 5 (Asset Status):** Verifies the asset is in "Live" status and operational
   - **Check 6 (Balance Verification):** Confirms the bridge holds the minimum required balance for the asset
   - **Enactment State:** Once enacted, the bridge status cannot be changed, ensuring security


2. **Mint/Burn Operations:**
   ```solidity
   function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) internal override {
       if (paid_claimed_amount > 0){
           require(ILocalAsset(precompileAddress).mint(to_address, paid_claimed_amount), "mint to precompile failed");
       }
       transferTokens(settings.tokenAddress, to_address, won_stake);
   }
   ```

3. **Precompile Validation:**
   ```solidity
   require(CounterstakeLibrary.is3DPassERC20Precompile(_precompileAddress), "invalid precompile address");
   ```

#### Export Precompile Integration

1. **Stake Token Operations:**
   ```solidity
   function receiveStakeAsset(uint amount) internal override {
       if (CounterstakeLibrary.is3DPassERC20Precompile(settings.tokenAddress)) {
           require(IPrecompileERC20(settings.tokenAddress).transferFrom(msg.sender, address(this), amount), "precompile transfer failed");
       } else {
           super.receiveStakeAsset(amount);
       }
   }
   ```

2. **Token Distribution:**
   ```solidity
   function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) internal override {
       uint total = won_stake + paid_claimed_amount;
       if (CounterstakeLibrary.is3DPassERC20Precompile(settings.tokenAddress)) {
           require(IPrecompileERC20(settings.tokenAddress).transfer(to_address, total), "precompile transfer failed");
       } else {
           transferTokens(settings.tokenAddress, to_address, total);
       }
   }
   ```

### Assistant Precompile Integration

#### Export Assistant Precompile Support

1. **Stake Token Operations:**
   ```solidity
   function payStakeTokens(address to, uint amount) internal {
       if (CounterstakeLibrary.is3DPassERC20Precompile(tokenAddress)) {
           require(IPrecompileERC20(tokenAddress).transfer(to, amount), "precompile transfer failed");
       } else if (tokenAddress == Counterstake(bridgeAddress).P3D_PRECOMPILE()) {
           require(IP3D(tokenAddress).transfer(to, amount), "P3D transfer failed");
       } else {
           revert("unsupported token type");
       }
   }
   ```

2. **Balance Checking:**
   ```solidity
   function getGrossBalance() public view returns (uint) {
       uint bal = 0;
       if (tokenAddress == Counterstake(bridgeAddress).P3D_PRECOMPILE()) {
           bal = IP3D(tokenAddress).balanceOf(address(this));
       } else if (CounterstakeLibrary.is3DPassERC20Precompile(tokenAddress)) {
           bal = IPrecompileERC20(tokenAddress).balanceOf(address(this));
       }
       return bal + balance_in_work;
   }
   ```

#### Import Wrapper Assistant Precompile Support

1. **Image Token Operations:**
   ```solidity
   function getImageBalance() public view returns (uint) {
       return IPrecompileERC20(ImportWrapper(bridgeAddress).precompileAddress()).balanceOf(address(this));
   }
   ```

2. **Token Transfers:**
   ```solidity
   function transferImageTokens(address to, uint amount) internal {
       require(IPrecompileERC20(ImportWrapper(bridgeAddress).precompileAddress()).transfer(to, amount), "image transfer failed");
   }
   ```

### Oracle Integration

The system maintains compatibility with the existing oracle system while adding precompile-specific validation:

```solidity
if (CounterstakeLibrary.is3DPassERC20Precompile(precompileAddress)) {
    string memory tokenSymbol = IERC20WithSymbol(precompileAddress).symbol();
    (uint precompile_num, uint precompile_den) = IOracle(oracleAddr).getPrice(tokenSymbol, "_NATIVE_");
    require(precompile_num > 0 || precompile_den > 0, "oracle must support 3DPass ERC20 precompile pricing");
}
```

### Assistant Share Token Architecture

**Important:** Assistant shares remain as regular ERC20 tokens themselves, not precompiles:

1. **Share Token Creation:**
   ```solidity
   // Assistant contracts create their own ERC20 share tokens
   // These are NOT precompiles - they are regular ERC20 contracts
   function buyShares(uint stake_asset_amount) external {
       // Transfer stake tokens from user to assistant
       // Calculate shares based on current net balance
       // Mint ERC20 share tokens to user
   }
   ```

2. **Share Token Redemption:**
   ```solidity
   function redeemShares(uint shares_amount) external {
       // Burn ERC20 share tokens from user
       // Calculate token amount based on current net balance
       // Transfer stake tokens to user (minus exit fee)
   }
   ```

## Deployment Status

### ✅ Successful Deployments
- `ImportWrapper` - ✅ Deployed to: `0x1445f694117d847522b81A97881850DbB965db9A`
- `Export` - ✅ Deployed to: `0x626D4E8c191c36B5937fD73A2A1B774C2361EA80`
- `CounterstakeFactory` - ✅ Deployed to: `0x7C7AFc2871E65B031F7834c4b6198Bf978c49Cc5`
- `AssistantFactory` - ✅ Deployed to: `0x...`
- `ExportAssistant` - ✅ Deployed to: `0x747B60493839a26E20d191F6dC960C8C79C159AE`
- `ImportWrapperAssistant` - ✅ Deployed to: `0x...`
- All core infrastructure contracts (Oracle, Governance, etc.)

### ✅ Testing Status
- ✅ Import Wrapper functionality tested
- ✅ Export functionality tested
- ✅ Assistant claim operations tested
- ✅ Precompile integration verified
- ✅ Oracle price feeds configured
- ✅ Bridge setup and configuration completed

## Benefits of New Architecture

### 1. Gas Efficiency
- No need to deploy new ERC20 contracts for each bridge
- Direct interaction with existing precompiles
- Reduced contract deployment costs

### 2. Consistency
- Uses standardized precompile addresses across the network
- Consistent token interface across all bridges
- Unified precompile validation

### 3. Integration
- Seamlessly works with existing 3DPass ecosystem
- Leverages existing precompile infrastructure
- Maintains compatibility with Substrate layer

### 4. Flexibility
- Can wrap any existing precompile without modification
- Supports both P3D and custom asset precompiles
- Extensible for future precompile additions

### 5. Maintainability
- Cleaner separation between bridge logic and token logic
- Standardized precompile interfaces
- Reduced code duplication

### 6. Security
- **Comprehensive Enactment Checks:** The `enactImportWrapper()` function performs 6 critical security validations before bridge activation
- **Role-Based Access Control:** Ensures bridge has complete control (owner, issuer, admin, freezer) over the asset
- **Asset Status Verification:** Confirms asset is in "Live" status and operational
- **Balance Validation:** Verifies bridge holds minimum required balance
- **Immutable Enactment:** Once enacted, bridge status cannot be changed, preventing security vulnerabilities

### 7. Assistant Benefits
- **Callback-based claim finalization**: No manual withdrawal needed
- **Automatic profit/loss tracking**: Real-time accounting updates
- **Fallback mechanisms**: Robust error handling
- **Share-based participation**: ERC20 shares for user investment
- **Fee structure**: Management and success fees for sustainability

## Migration Path

### For Existing Bridges
1. Deploy new `ImportWrapper` with precompile address
2. Deploy new `Export` with precompile stake token
3. Set up roles and configure metadata for the precompile
4. **Transfer asset ownership to bridge contracts** (critical for enactment)
5. **Fund bridge contracts with minimum required balance** (for `minBalance` requirement)
6. **Call `enactImportWrapper()` to activate the bridge** (performs all security checks)
7. Deploy `ImportWrapperAssistant` and `ExportAssistant`
8. Update any external integrations to use new contract addresses

### For New Bridges
1. Use `CounterstakeFactory.createImportWrapper()` with precompile address
2. Use `CounterstakeFactory.createExport()` with precompile stake token
3. **Transfer asset ownership to bridge contracts** (critical for enactment)
4. **Fund bridge contracts with minimum required balance** (for `minBalance` requirement)
5. **Call `enactImportWrapper()` to activate the bridge** (performs all security checks)
6. Use `AssistantFactory.createImportWrapperAssistant()` for import assistant
7. Use `AssistantFactory.createExportAssistant()` for export assistant
8. Configure roles and metadata as needed

## Files Modified for Governance Fixes

1. **`counterstake-bridge/evm/contracts/ImportWrapper.sol`**
   - Fixed voting token to use `precompileAddress` instead of `address(this)`
   - Ensures wUSDT token holders can vote on ImportWrapper governance decisions

2. **`counterstake-bridge/evm/contracts/Governance.sol`**
   - Added support for regular ERC20 contracts using SafeERC20
   - Enhanced both `deposit()` and `withdraw()` functions
   - Enables assistant contracts to use themselves as voting tokens

## Testing

The new architecture has been tested with:
- ✅ Contract compilation
- ✅ `ImportWrapper` deployment and functionality
- ✅ `Export` deployment and functionality
- ✅ Factory contract updates
- ✅ Assistant contract deployment and operations
- ✅ Library updates for precompile support
- ✅ Oracle integration and price feeds
- ✅ Bridge setup and configuration
- ✅ **Bridge enactment process with all 6 security checks**
- ✅ **Asset ownership transfer to bridge contracts**
- ✅ **Bridge funding with minimum balance requirements**
- ✅ Assistant claim and callback operations
- ✅ Precompile token transfers
- ✅ Share token operations
- ✅ **Governance system fixes and testing**
- ✅ **ImportWrapper governance with correct voting tokens**
- ✅ **Assistant governance with SafeERC20 support**

## Conclusion

The comprehensive modification successfully transitions the bridge system from creating new ERC20 tokens to using existing 3DPass ERC20 precompiles for both import and export operations. The new architecture provides:

1. **Import Wrapper Architecture**: Clean integration with existing precompiles for wrapped foreign assets
2. **Export Architecture**: Native 3DPass token support for export operations
3. **Assistant Architecture**: Callback-based claim finalization with ERC20 share tokens
4. **Precompile Integration**: Standardized interface for all 3DPass token operations
5. **Governance System**: Complete governance support for all contract types with proper voting token assignments

The core objectives have been achieved:
- **Import bridges now correctly integrate with 3DPass ERC20 precompiles for asset wrapping**
- **Export bridges now support native 3DPass tokens as stake assets**
- **Assistants now use precompiles for operations while maintaining ERC20 shares**
- **Complete bridge ecosystem with bidirectional token flow support** 
- **Governance system now supports all contract types with correct voting token assignments**
- **SafeERC20 integration ensures secure token operations for all governance functions** 