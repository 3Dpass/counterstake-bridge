# Export Payment Flow Documentation

## Overview

This document details the complete payment flow for the Counterstake Bridge export functionality, covering both user self-claiming and assistant third-party claiming scenarios.

## 1. Expatriation Flow (Send to Foreign Chain)

### **Overview**
The `transferToForeignChain` function allows users to transfer their native 3DPass assets to a foreign chain, effectively "expatriating" their tokens. This process transfers tokens from the user to the bridge and initiates a transfer on the foreign network.

### **Step 1: User Calls `transferToForeignChain()`**
```solidity
// User calls: transferToForeignChain(foreign_address, data, amount, reward)
function transferToForeignChain(string memory foreign_address, string memory data, uint amount, int reward) payable nonReentrant external {
    receiveStakeAsset(amount);  // Transfer tokens from user to bridge
    if (reward >= 0)
        require(uint(reward) < amount, "reward too big");
    emit NewExpatriation(msg.sender, amount, reward, foreign_address, data);
}
```

### **Step 2: Token Transfer to Bridge**
```solidity
// The bridge receives tokens from the user's account
receiveStakeAsset(amount);  // Transfer tokens from user to bridge
```

### **Step 3: Validation**
```solidity
// Bridge validates the reward amount
if (reward >= 0)
    require(uint(reward) < amount, "reward too big");
```

### **Step 4: Event Emission**
```solidity
// Bridge emits event to notify off-chain systems
emit NewExpatriation(msg.sender, amount, reward, foreign_address, data);
```

### **Step 5: Off-Chain Processing**
```solidity
// Off-chain systems monitor the NewExpatriation event
// They process the transfer on the foreign network
// Example: P3D -> wP3D on Ethereum
```

---

## 2. User Claims for Themselves (Self-Claiming)

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

### **Step 3: Export.sol Processing**
```solidity
// In Export.receiveMoneyInClaim():
function receiveMoneyInClaim(uint stake, uint paid_amount) {
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
// In Export.sendWithdrawals():
function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) {
    uint total = won_stake + paid_claimed_amount;
    // Transfer total amount (stake + claimed amount) to user
    transferTokens(settings.tokenAddress, to_address, total);
}
```

---

## 3. Assistant Claims for User (Third-Party Claiming)

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

### **Step 3: Export.sol Processing**
```solidity
// In Export.receiveMoneyInClaim():
function receiveMoneyInClaim(uint stake, uint paid_amount) {
    // Third-party claiming: transfer both stake and paid_amount
    receiveStakeAsset(stake + paid_amount);  // Transfer total from assistant to bridge
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

### **Step 5: Export.sol Transfer to User**
```solidity
// In Export.sendToClaimRecipient():
function sendToClaimRecipient(address payable to_address, uint paid_amount) {
    // Transfer paid_amount tokens to the user after assistant claim
    transferTokens(settings.tokenAddress, to_address, paid_amount);
}
```

### **Step 6: Assistant Notification**
```solidity
// Bridge calls assistant's onReceivedFromClaim() callback
// Assistant updates its internal accounting
```

### **Step 7: Claim Processing**
```solidity
// Bridge processes the claim and waits for challenging period
// Assistant waits for challenging period to end
```

### **Step 8: Assistant Calls `withdraw()`**
```solidity
// After challenging period, assistant calls withdraw()
// Bridge determines if assistant is winning claimant
// If winning: sendWithdrawals(to_address, claimed_amount, won_stake)
```

### **Step 9: Token Distribution to Assistant**
```solidity
// In Export.sendWithdrawals():
function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) {
    uint total = won_stake + paid_claimed_amount;
    // Transfer total amount (stake + claimed amount) to assistant
    transferTokens(settings.tokenAddress, to_address, total);
}
```

---

## 4. Export Assistant Contract Flow

### **Step 1: User Initiates Export**
```solidity
// User calls Export.transferToForeignChain():
function transferToForeignChain(string memory foreign_address, string memory data, uint amount, int reward) {
    receiveStakeAsset(amount);  // Transfer tokens from user to bridge
    emit NewExpatriation(msg.sender, amount, reward, foreign_address, data);
}
```

### **Step 2: Assistant Claims on Foreign Network**
```solidity
// Assistant calls ExportAssistant.claim():
function claim(string memory txid, uint32 txts, uint amount, int reward, string memory sender_address, address payable recipient_address, string memory data) {
    uint required_stake = Export(bridgeAddress).getRequiredStake(amount);
    uint paid_amount = amount - uint(reward);
    uint total = required_stake + paid_amount;
    
    // Verify assistant has sufficient balance
    (, int net_balance) = updateMFAndGetBalances(0, false);
    require(total <= uint(net_balance), "not enough balance");
    
    // Call bridge claim function
    Export(bridgeAddress).claim(txid, txts, amount, reward, required_stake, sender_address, recipient_address, data);
    
    // Track investment and network fees
    balances_in_work[claim_num] = total + network_fee;
    balance_in_work += total + network_fee;
}
```

### **Step 3: Claim Processing and Challenging Period**
```solidity
// Bridge processes the claim and starts challenging period
// Assistant waits for challenging period to end
// Other users can challenge the claim during this period
```

### **Step 4: Bridge Automatically Calls Assistant (Callback)**
```solidity
// After challenging period expires, bridge automatically calls assistant:
function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string memory, address, string memory) {
    uint invested = balances_in_work[claim_num];
    require(invested > 0, "BUG: I didn't stake in this claim?");
    
    receiveFromClaim(claim_num, claimed_amount, won_stake, invested);
}
```

### **Step 5: Assistant Updates Accounting**
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

### **Step 6: Fallback Methods (If Callback Fails)**
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

---

## Key Differences Summary

| Aspect | User Self-Claiming | Assistant Third-Party Claiming |
|--------|-------------------|--------------------------------|
| **`recipient_address`** | `msg.sender` | `user_address` |
| **`bThirdPartyClaiming`** | `false` | `true` |
| **`paid_amount`** | `0` | `amount - reward` |
| **Stake Transfer** | `receiveStakeAsset(stake)` | `receiveStakeAsset(stake + paid_amount)` |
| **User Receives Tokens** | After challenging period | Instantly |
| **Claim Finalization** | User calls `withdraw()` | Bridge calls `onReceivedFromClaim()` callback |
| **Token Operations** | Single transfer on withdraw | Transfer immediately + automatic callback |

## Benefits of the Export Flow

### **For Users:**
- **Instant Token Delivery**: Users receive tokens immediately when assistants claim for them
- **No Waiting Period**: No need to wait for the challenging period to receive tokens
- **Better UX**: Seamless experience with immediate token availability

### **For Assistants:**
- **Simplified Operations**: Direct token transfers instead of complex mint/burn operations
- **Clear Token Flow**: Assistant transfers tokens they own, bridge transfers to user
- **Better Failure Handling**: Each operation can be handled independently
- **Improved Performance**: Fewer external calls and simpler state management

### **For the Bridge:**
- **Backward Compatibility**: Regular users still use the original flow
- **Optimized for Common Case**: Assistant claims are optimized while maintaining security
- **Clean Architecture**: Clear separation between stake handling and token operations
- **Precompile Integration**: Leverages 3DPass ERC20 precompile capabilities

## Technical Implementation Details

### **Precompile Integration**
The bridge uses the 3DPass ERC20 precompile for all token operations:

1. **Transfer**: `IPrecompileERC20(token).transfer(to_address, amount)`
2. **TransferFrom**: `IPrecompileERC20(token).transferFrom(from_address, to_address, amount)`

### **Assistant Contract Features**
The ExportAssistant contract provides several key features:

1. **Share Management**: Users can buy/redeem shares representing their stake in the assistant
2. **Fee Structure**: Management fees and success fees for the assistant manager
3. **Profit Distribution**: Automatic profit diffusion over time
4. **Network Fee Compensation**: Tracks and compensates for gas costs

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

#### **Expatriation Flow:**
1. User transfers tokens to bridge for export
2. Bridge emits expatriation event
3. Off-chain systems process transfer on foreign network
4. User receives wrapped tokens on foreign network (e.g., wP3D on Ethereum)

#### **Self-Claiming Flow:**
1. User transfers stake to bridge
2. Bridge processes claim
3. After challenging period: Bridge transfers total amount (stake + claimed) to user

#### **Third-Party Claiming Flow:**
1. Assistant transfers total amount (stake + paid_amount) to bridge
2. Bridge immediately transfers paid_amount to user
3. After challenging period: Bridge transfers total amount (stake + claimed) to assistant (if winning)

#### **Export Assistant Flow:**
1. User transfers tokens to bridge for export
2. Assistant claims on foreign network with their own tokens
3. Assistant receives callback with results
4. Assistant updates internal accounting and profit/loss tracking
5. Shareholders can redeem shares based on assistant performance

## Export Assistant Management

### **Assistant Flow Mechanism**
Export Assistants use a **callback-based mechanism** rather than manual withdrawal:

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

### **Share Issuance**
```solidity
function buyShares(uint stake_asset_amount) {
    // Transfer tokens from user to assistant
    // Calculate shares based on current net balance
    // Mint shares to user
}
```

### **Share Redemption**
```solidity
function redeemShares(uint shares_amount) {
    // Burn shares from user
    // Calculate token amount based on current net balance
    // Transfer tokens to user (minus exit fee)
}
```

### **Fee Withdrawal**
```solidity
function withdrawManagementFee() {
    // Manager can withdraw accumulated management fees
}

function withdrawSuccessFee() {
    // Manager can withdraw success fees when profitable
}
```

## Expatriation Benefits

### **For Users:**
- **Cross-Chain Access**: Transfer tokens to foreign networks for broader DeFi access
- **Asset Flexibility**: Convert native tokens to wrapped versions on other chains
- **Liquidity Expansion**: Access liquidity pools and protocols on foreign networks

### **For the Bridge:**
- **Bidirectional Flow**: Supports both export and import operations
- **Token Management**: Proper handling of token transfers between networks
- **Event-Driven Architecture**: Clean separation between on-chain and off-chain processing

### **For the Ecosystem:**
- **Cross-Chain DeFi**: Enables users to participate in DeFi protocols on multiple networks
- **Liquidity Provision**: Creates opportunities for cross-chain liquidity provision
- **Arbitrage Opportunities**: Users can capitalize on price differences between networks

This export flow provides a complete bridge solution for transferring tokens from 3DPass to foreign networks, with both direct user claiming and assistant-mediated claiming options.
