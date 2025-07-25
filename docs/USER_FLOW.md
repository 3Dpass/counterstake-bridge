# Counterstake Bridge User Flow

This document describes the complete user flow of the counterstake bridge system, which facilitates cross-chain transfers between different blockchain networks (Obyte, Ethereum, BSC, Polygon, Kava, 3DPass) using a trustless counterstake mechanism.

## System Overview

The counterstake bridge consists of three main components that work together:

1. **Contract on Source Chain** - Handles transfer initiation and staking
2. **Watchdog Bot** - Monitors, claims valid transfers, and challenges fraudulent claims. The bot is equipped with the Assistance function to speed up transfers.  
3. **Contract on Target Chain** - Handles claims, validation, and counterstake resolution

## Component Roles

### 1. Contract on Source Chain (Export Contract)

**Purpose**: Handles the initial transfer initiation and staking

**What it does**:
- Users call `transferToForeignChain()` to initiate a cross-chain transfer
- The contract accepts the user's tokens and a stake (required stake = amount × ratio/100)
- Emits a `NewExpatriation` event with transfer details
- Holds the user's tokens and stake until the transfer is claimed on the target chain
- Provides the foundation for the counterstake mechanism

**Key Functions**:
```solidity
function transferToForeignChain(
    string memory foreign_address, 
    string memory data, 
    uint amount, 
    int reward
) payable nonReentrant external {
    receiveStakeAsset(amount);
    if (reward >= 0)
        require(uint(reward) < amount, "reward too big");
    emit NewExpatriation(msg.sender, amount, reward, foreign_address, data);
}
```

**User Interaction**:
- User specifies destination address on target chain
- User provides transfer amount and optional reward for assistants
- User pays required stake (typically 10-20% of transfer amount)
- Contract locks user's tokens until transfer is completed

### 2. Watchdog Bot

**Purpose**: Monitors transfers, claims valid transfers, and challenges fraudulent claims

**What it does**:
- **Monitoring**: Watches both source and target chains for new transfers and claims
- **Claiming**: When a valid transfer is detected, the bot claims it on the target chain using assistant contracts
- **Watchdog Function**: Detects fraudulent claims and challenges them with counterstakes
- **Balance Management**: Manages funds across multiple chains to facilitate transfers
- **Profit Optimization**: Only claims transfers that provide sufficient reward to cover gas fees and desired profit margin

**Key Responsibilities**:

**Transfer Detection & Claiming**:
```javascript
async function handleTransfer(transfer) {
    // Validates the transfer parameters
    // Checks if transfer is profitable enough to claim
    // Sends claim to target chain if conditions are met
    // Manages assistant contract interactions
}
```

**Fraud Detection & Challenging**:
```javascript
async function attackClaim(bridge, type, claim_num, claim_txid) {
    // Detects fraudulent claims
    // Challenges them with counterstakes
    // Aims to win the stake posted by fraudulent claimants
}
```

**Configuration Options**:
- `min_reward_ratio`: Minimum net reward (default 0.5%)
- `max_exposure`: Max share of balance for counterstakes (default 50%)
- `evm_min_transfer_age`: Minimum age before claiming (default 5 minutes)
- `evm_count_blocks_for_finality`: Blocks to wait before challenging (default 20)

### 3. Contract on Target Chain (Import Contract)

**Purpose**: Handles claims, validates transfers, and manages the counterstake mechanism

**What it does**:
- Accepts claims from the watchdog bot about transfers from the source chain
- Validates that the claimed transfer actually exists on the source chain
- Manages the counterstake mechanism where participants can stake on "yes" (valid) or "no" (invalid) outcomes
- Distributes rewards to correct stakers and penalizes incorrect ones
- Mints imported tokens to successful claimants

**Key Functions**:
```solidity
function claim(
    string memory txid, 
    uint32 txts, 
    uint amount, 
    int reward, 
    uint stake, 
    string memory sender_address, 
    address payable recipient_address, 
    string memory data
) nonReentrant payable external {
    // Creates a new claim for a transfer
    // Initiates the counterstake period
    // Allows others to challenge the claim
}

function challenge(
    string calldata claim_id, 
    CounterstakeLibrary.Side stake_on, 
    uint stake
) payable external {
    // Allows participants to stake against a claim
    // Can challenge both valid and invalid claims
}
```

## Assistant Contracts

The system includes **Assistant Contracts** that act as intermediaries and are **fully automated** - requiring **no user interaction or approval**.

### ExportAssistant
- Helps with claiming transfers on target chains
- Pools funds from multiple operators
- Earns fees (typically 1%) for facilitating transfers
- Manages risk and balance allocation
- **Fully automated operation** - no user approval needed

### ImportAssistant  
- Helps with claiming transfers back to source chains
- Provides liquidity for reverse transfers
- Handles token minting and distribution
- Manages counterstake participation
- **Fully automated operation** - no user approval needed

### Key Automation Features:

#### Manager-Only Access
Assistant contracts have a `managerAddress` (the watchdog bot) that controls all operations:
```solidity
modifier onlyManager() {
    require(msg.sender == managerAddress, "caller is not the manager");
    _;
}
```

#### Automated Claiming
The watchdog bot automatically claims profitable transfers:
```solidity
function claim(string memory txid, uint32 txts, uint amount, int reward, 
    string memory sender_address, address payable recipient_address, 
    string memory data) onlyManager nonReentrant external {
    // Automated claiming logic - no user approval needed
}
```

#### Automated Challenging
The bot automatically challenges fraudulent claims:
```solidity
function challenge(uint claim_num, CounterstakeLibrary.Side stake_on, 
    uint stake) onlyManager nonReentrant external {
    // Automated challenging logic - no user approval needed
}
```

### User Experience:
- **No interaction with assistant contracts required**
- Users only interact with main bridge contracts (Export/Import)
- Assistant claiming happens automatically in the background
- Optional rewards can be set to incentivize faster claiming

### Fee Structure:
- **Management Fee**: Ongoing fee based on time and balance (0.1-0.5% annually)
- **Success Fee**: Fee on profits (1-5%)
- **Network Fee Compensation**: Covers gas costs

### No User Actions Required:
- ❌ No approval needed for assistant to claim
- ❌ No manual intervention required  
- ❌ No additional transactions from user
- ✅ Fully automated end-to-end process

## Complete User Flow

### 1. Transfer Initiation
```
User → Source Chain Contract
├── Calls transferToForeignChain()
├── Provides destination address, amount, reward
├── Pays required stake (10-20% of amount)
└── Tokens locked in contract
```

### 2. Bot Monitoring & Claiming
```
Watchdog Bot
├── Detects NewExpatriation event
├── Validates transfer parameters
├── Checks profitability (reward > gas fees + min profit)
├── Claims transfer on target chain via assistant
└── Initiates counterstake period
```

### 3. Counterstake Period
```
Target Chain Contract
├── Accepts claim from bot
├── Opens challenging period (typically 3 days)
├── Allows others to stake on "yes" or "no"
├── Bot may challenge fraudulent claims
└── Waits for resolution
```

### 4. Resolution & Distribution
```
After Challenging Period
├── If no challenges: Claim succeeds, tokens minted
├── If challenged: Winner determined by stake amounts
├── Correct stakers receive rewards
├── Incorrect stakers lose their stakes
└── User receives imported tokens on target chain
```

## Economic Incentives

### For Users
- **Stake Requirement**: 10-20% of transfer amount as security
- **Reward System**: Can offer rewards to incentivize faster claiming
- **Risk**: Stakes lost if transfer is fraudulent

### For Watchdog Bots
- **Claiming Rewards**: Earn 1% fee on successful transfers
- **Counterstake Profits**: 66.7% ROI on successful challenges
- **Risk**: Lose stakes on incorrect challenges

### For Challengers
- **Profit Opportunity**: Win stakes from incorrect claims
- **Risk**: Lose stakes on incorrect challenges

## Security Features

### Fraud Prevention
- **Stake Requirements**: High stakes discourage fraudulent claims
- **Challenging Period**: Time for detection and response
- **Economic Incentives**: Profitable to challenge fraud
- **Multiple Validators**: Decentralized validation network

### Risk Management
- **Transfer Age Requirements**: Wait for blockchain finality
- **Balance Limits**: Maximum exposure per transfer
- **Oracle Integration**: Price feeds for cross-chain validation
- **Governance Controls**: Upgradable parameters

## Configuration Parameters

### Bot Configuration
- `min_reward_ratio`: Minimum profitable reward (default 0.5%)
- `max_exposure`: Maximum stake per transfer (default 50%)
- `evm_min_transfer_age`: Wait time for finality (default 5 minutes)
- `bWatchdog`: Enable fraud detection (default true)
- `bAttack`: Enable challenging (default true)

### Contract Parameters
- `counterstake_coef100`: Stake multiplier (default 150%)
- `ratio100`: Required stake percentage (default 10-20%)
- `challenging_periods`: Time limits for challenges
- `min_stake`: Minimum stake amounts

## Supported Networks

- **Obyte**: Native autonomous agents
- **Ethereum**: Smart contracts
- **BSC**: Smart contracts  
- **Polygon**: Smart contracts
- **Kava**: Smart contracts
- **3DPass**: Smart contracts

## Getting Started

1. **Deploy Contracts**: Use deployment scripts for each network
2. **Configure Bot**: Set up addresses, API keys, and parameters
3. **Fund Bot**: Provide liquidity across all networks
4. **Start Monitoring**: Run the watchdog bot
5. **Monitor Performance**: Track profits and adjust parameters

The counterstake bridge creates a trustless cross-chain system where economic incentives ensure honest behavior - fraudulent claims are challenged and penalized, while valid transfers are rewarded. 