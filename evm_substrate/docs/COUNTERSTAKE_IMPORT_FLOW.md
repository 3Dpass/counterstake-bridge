# Import Payment Flow Documentation

## Overview

This document details the complete payment flow for the Counterstake Bridge import functionality, covering both user self-claiming and assistant third-party claiming scenarios.

## 1. User Claims for Themselves (Self-Claiming)

### **Step 1: User Calls `claim()`**
```solidity
// User calls: claim(txid, txts, amount, reward, stake, sender_address, address(0), data)
// recipient_address defaults to msg.sender
```

### **Step 2: Counterstake.sol Processing**
```solidity
// In Counterstake.claim():
recipient_address = payable(msg.sender);  // User claims for themselves
bool bThirdPartyClaiming = (recipient_address != payable(msg.sender) && reward >= 0);  // = false
uint paid_amount = 0;  // No third-party claiming, so paid_amount = 0

receiveMoneyInClaim(stake, 0);
```

### **Step 3: ImportWrapper.sol Processing**
```solidity
// In ImportWrapper.receiveMoneyInClaim():
function receiveMoneyInClaim(uint stake, uint paid_amount) {
    if (paid_amount > 0) {  // false
        // Not executed
    }
    // Self-claiming: only transfer stake
    receiveStakeAsset(stake);  // Transfer stake from user to bridge
}
```

### **Step 4: Claim Processing**
```solidity
// Bridge processes the claim and waits for challenging period
// User waits for challenging period to end
```

### **Step 5: User Calls `withdraw()`**
```solidity
// After challenging period, user calls withdraw()
// Bridge determines if user is winning claimant
// If winning: sendWithdrawals(to_address, claimed_amount, won_stake)
```

### **Step 6: Token Distribution**
```solidity
// In ImportWrapper.sendWithdrawals():
function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) {
    if (paid_claimed_amount > 0) {
        // Mint image tokens to user
        require(ILocalAsset(precompileAddress).mint(to_address, paid_claimed_amount), "mint to precompile failed");
    }
    // Transfer stake tokens back to user
    transferTokens(settings.tokenAddress, to_address, won_stake);
}
```

---

## 2. Assistant Claims for User (Third-Party Claiming)

### **Step 1: Assistant Calls `claim()`**
```solidity
// Assistant calls: claim(txid, txts, amount, reward, stake, sender_address, user_address, data)
// recipient_address = user_address (different from msg.sender)
```

### **Step 2: Counterstake.sol Processing**
```solidity
// In Counterstake.claim():
recipient_address = user_address;  // Assistant claims for user
bool bThirdPartyClaiming = (recipient_address != payable(msg.sender) && reward >= 0);  // = true
uint paid_amount = amount - uint(reward);  // Calculate what user receives

receiveMoneyInClaim(stake, paid_amount);
```

### **Step 3: ImportWrapper.sol Processing**
```solidity
// In ImportWrapper.receiveMoneyInClaim():
function receiveMoneyInClaim(uint stake, uint paid_amount) {
    if (paid_amount > 0) {  // true
        // Burn image tokens from the assistant account
        require(ILocalAsset(precompileAddress).burn(msg.sender, paid_amount), "burn from precompile failed");
    }
    // Transfer stake from assistant to bridge
    receiveStakeAsset(stake);
}
```

### **Step 4: Token Transfer to User**
```solidity
// In Counterstake.claim() after processing:
if (bThirdPartyClaiming) {
    sendToClaimRecipient(recipient_address, paid_amount);
    notifyPaymentRecipient(recipient_address, paid_amount, 0, last_claim_num);
}
```

### **Step 5: ImportWrapper.sol Minting to User**
```solidity
// In ImportWrapper.sendToClaimRecipient():
function sendToClaimRecipient(address payable to_address, uint paid_amount) {
    // Mint image tokens to the user after assistant claim
    require(ILocalAsset(precompileAddress).mint(to_address, paid_amount), "mint to precompile failed");
}
```

### **Step 6: Assistant Notification**
```solidity
// Bridge calls assistant's onReceivedFromClaim() callback
// Assistant updates its internal accounting
```

### **Step 7: Claim Processing and Challenging Period**
```solidity
// Bridge processes the claim and starts challenging period
// Assistant waits for challenging period to end
// Other users can challenge the claim during this period
```

### **Step 8: Bridge Automatically Calls Assistant (Callback)**
```solidity
// After challenging period expires, bridge automatically calls assistant:
function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string memory, address, string memory) {
    uint invested = balances_in_work[claim_num];
    require(invested > 0, "BUG: I didn't stake in this claim?");
    
    receiveFromClaim(claim_num, claimed_amount, won_stake, invested);
}
```

### **Step 9: Assistant Updates Accounting**
```solidity
// In receiveFromClaim():
function receiveFromClaim(uint claim_num, uint claimed_amount, uint won_stake, uint invested) {
    uint total = claimed_amount + won_stake;
    updateMFAndGetBalances(total, true);
    
    if (total >= invested) {
        uint this_profit = total - invested;
        profit += int(this_profit);
        addRecentProfit(this_profit);
    } else {
        uint loss = invested - total;
        profit -= int(loss);
    }
    
    balance_in_work -= invested;
    delete balances_in_work[claim_num];
}
```

### **Step 10: Fallback Methods (If Callback Fails)**
```solidity
// If onReceivedFromClaim fails (e.g., out-of-gas), manual methods can be used:

// For winning claims:
function recordWin(uint claim_num) nonReentrant external {
    // Can be called by anybody if onReceivedFromClaim was missed
    // Only works if assistant staked on winning side
}

// For losing claims:
function recordLoss(uint claim_num) nonReentrant external {
    // Can be called by anybody if assistant staked on losing side only
    // Records the loss and updates accounting
}
```

### **Step 9: Token Distribution to Assistant**
```solidity
// In ImportWrapper.sendWithdrawals():
function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) {
    if (paid_claimed_amount > 0) {
        // Mint image tokens to assistant (for profit/loss accounting)
        require(ILocalAsset(precompileAddress).mint(to_address, paid_claimed_amount), "mint to precompile failed");
    }
    // Transfer stake tokens back to assistant
    transferTokens(settings.tokenAddress, to_address, won_stake);
}
```

---

## 3. Repatriation Flow (Transfer Back to Home Chain)

### **Overview**
The `transferToHomeChain` function allows users to transfer their wrapped foreign assets back to the home chain, effectively "repatriating" their tokens. This process burns the wrapped tokens on 3DPass and initiates a transfer on the home network.

### **Step 1: User Calls `transferToHomeChain()`**
```solidity
// User calls: transferToHomeChain(home_address, data, amount, reward)
function transferToHomeChain(string memory home_address, string memory data, uint amount, uint reward) external {
    // Burn tokens from the precompile
    require(ILocalAsset(precompileAddress).burn(msg.sender, amount), "burn from precompile failed");
    emit NewRepatriation(msg.sender, amount, reward, home_address, data);
}
```

### **Step 2: Token Burning**
```solidity
// The bridge burns the wrapped tokens from the user's account
require(ILocalAsset(precompileAddress).burn(msg.sender, amount), "burn from precompile failed");
```

### **Step 3: Event Emission**
```solidity
// Bridge emits event to notify off-chain systems
emit NewRepatriation(msg.sender, amount, reward, home_address, data);
```

### **Step 4: Off-Chain Processing**
```solidity
// Off-chain systems monitor the NewRepatriation event
// They process the transfer on the home network
// Example: wUSDT -> USDT on Ethereum
```

---

## Key Differences Summary

| Aspect | User Self-Claiming | Assistant Third-Party Claiming |
|--------|-------------------|--------------------------------|
| **`recipient_address`** | `msg.sender` | `user_address` |
| **`bThirdPartyClaiming`** | `false` | `true` |
| **`paid_amount`** | `0` | `amount - reward` |
| **Stake Transfer** | `receiveStakeAsset(stake)` | `receiveStakeAsset(stake)` |
| **Image Tokens** | Minted on `withdraw()` | Burned from assistant, then minted to user |
| **User Receives Tokens** | After challenging period | Instantly |
| **Claim Finalization** | User calls `withdraw()` | Bridge calls `onReceivedFromClaim()` callback |
| **Token Operations** | Mint only | Burn + Mint + automatic callback |

## Benefits of the Mint/Burn Flow

### **For Users:**
- **Instant Token Delivery**: Users receive image tokens immediately when assistants claim for them
- **No Waiting Period**: No need to wait for the challenging period to receive tokens
- **Better UX**: Seamless experience with immediate token availability

### **For Assistants:**
- **Simplified Operations**: Direct burn/mint operations instead of complex batch transfers
- **Clear Token Flow**: Assistant burns tokens they own, bridge mints to user
- **Better Failure Handling**: Each operation can be handled independently
- **Improved Performance**: Fewer external calls and simpler state management

### **For the Bridge:**
- **Backward Compatibility**: Regular users still use the original flow
- **Optimized for Common Case**: Assistant claims are optimized while maintaining security
- **Clean Architecture**: Clear separation between stake handling and image token operations
- **Precompile Integration**: Leverages 3DPass ERC20 precompile capabilities

## Technical Implementation Details

### **Assistant Flow Mechanism**
Import Wrapper Assistants use a **callback-based mechanism** rather than manual withdrawal:

1. **Automatic Processing**: After the challenging period expires, the bridge automatically calls the assistant's `onReceivedFromClaim()` function
2. **No Manual Withdrawal**: Assistants do NOT call `withdraw()` - the bridge handles this automatically
3. **Fallback Methods**: If the callback fails (e.g., out-of-gas), manual `recordWin()` or `recordLoss()` methods can be used
4. **Passive Operation**: Assistants are passive investors that receive automatic callbacks when claims are resolved

### **Why Callback-Based Design?**
- **Atomic Operations**: Claim resolution and fund distribution happen together
- **Gas Efficiency**: No separate withdrawal transactions needed
- **Reliability**: Automatic processing reduces manual intervention
- **Security**: Only the bridge can call the callback function
- **Simplicity**: Assistants don't need to track when to withdraw

### **Precompile Integration**
The bridge uses the 3DPass ERC20 precompile at `precompileAddress` for all image token operations:

1. **Minting**: `ILocalAsset(precompileAddress).mint(to_address, amount)`
2. **Burning**: `ILocalAsset(precompileAddress).burn(from_address, amount)`

### **Bridge Role Management**
The bridge contract must be configured as both Issuer and Admin for the precompile:

```solidity
function setupPrecompileRoles() external {
    ILocalAsset(precompileAddress).setTeam(
        address(this), // issuer - can mint
        address(this), // admin - can burn
        address(this)  // freezer - can freeze/unfreeze
    );
}
```

### **Assistant Detection**
The system identifies assistant contracts by checking if they implement the `CounterstakeReceiver` interface:

```solidity
function isAssistantContract(address caller) internal view returns (bool) {
    return CounterstakeLibrary.isContract(caller) && 
           _supportsERC165Interface(caller, type(CounterstakeReceiver).interfaceId);
}
```

### **Condition Logic**
The primary condition for determining claim type is passed from `Counterstake.sol` to avoid logic duplication:

```solidity
bool bThirdPartyClaiming = (recipient_address != payable(msg.sender) && reward >= 0);
```

This ensures consistency across the entire claim processing pipeline.

### **Token Flow Summary**

#### **Self-Claiming Flow:**
1. User transfers stake to bridge
2. Bridge processes claim
3. After challenging period: Bridge mints image tokens to user

#### **Third-Party Claiming Flow:**
1. Assistant burns their image tokens
2. Assistant transfers stake to bridge
3. Bridge immediately mints image tokens to user
4. After challenging period: Bridge mints image tokens to assistant (if winning)

#### **Repatriation Flow:**
1. User burns their wrapped tokens (e.g., wUSDT)
2. Bridge emits repatriation event
3. Off-chain systems process transfer on home network
4. User receives native tokens on home network (e.g., USDT on Ethereum)

## Repatriation Benefits

### **For Users:**
- **Complete Bridge Cycle**: Users can transfer tokens in both directions
- **Asset Flexibility**: Convert between wrapped and native tokens as needed
- **Cross-Chain Liquidity**: Access liquidity on both networks

### **For the Bridge:**
- **Bidirectional Flow**: Supports both import and export operations
- **Token Supply Management**: Burning wrapped tokens maintains proper supply ratios
- **Event-Driven Architecture**: Clean separation between on-chain and off-chain processing

### **For the Ecosystem:**
- **Liquidity Provision**: Enables cross-chain DeFi applications
- **Arbitrage Opportunities**: Users can capitalize on price differences between networks
- **Risk Management**: Users can repatriate assets when needed 