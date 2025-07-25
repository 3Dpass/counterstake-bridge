# Counterstake Bridge Governance System

The governance contracts provide a **decentralized governance system** for the counterstake bridge, allowing stakeholders to vote on and update various parameters of the bridge contracts without requiring centralized control or contract upgrades.

## Overview

The governance system enables:
- **Dynamic parameter updates** without contract upgrades
- **Community voting** on bridge settings
- **Gradual implementation** with safety periods
- **Transparent decision-making** with on-chain voting

## Core Architecture

### 1. Governance Contract - Main Controller

The `Governance` contract is the central governance controller that manages voting tokens, voted parameters, and the overall governance process.

```solidity
contract Governance is ReentrancyGuard {
    uint constant public governance_challenging_period = 10 days;
    uint constant public governance_freeze_period = 30 days;
    
    address public votingTokenAddress;        // Token used for voting (ETH or ERC20)
    address public governedContractAddress;   // Contract being governed
    
    VotedValue[] public votedValues;          // All votable parameters
    mapping(string => VotedValue) public votedValuesMap;
    
    mapping(address => uint) public balances; // User voting token balances
}
```

### 2. VotedValue Contracts - Parameter Voting

Three types of VotedValue contracts handle different parameter types:

#### VotedValueUint - Numeric Parameters
```solidity
contract VotedValueUint is VotedValue {
    uint public leader;           // Currently winning value
    uint public current_value;    // Currently active value
    
    mapping(address => uint) public choices;           // User's vote
    mapping(uint => uint) public votesByValue;         // Total votes per value
    mapping(uint => mapping(address => uint)) public votesByValueAddress;
}
```

#### VotedValueAddress - Address Parameters
```solidity
contract VotedValueAddress is VotedValue {
    address public leader;        // Currently winning address
    address public current_value; // Currently active address
    
    mapping(address => address) public choices;        // User's vote
    mapping(address => uint) public votesByValue;      // Total votes per address
}
```

#### VotedValueUintArray - Array Parameters
```solidity
contract VotedValueUintArray is VotedValue {
    uint[] public leader;         // Currently winning array
    uint[] public current_value;  // Currently active array
    
    mapping(address => uint[]) public choices;         // User's vote
    mapping(bytes32 => uint) public votesByValue;      // Total votes per array
}
```

## Governance Process

### 1. Voting Process

Users can vote on parameter changes by staking voting tokens:

```solidity
function vote(uint value) nonReentrant external {
    validationCallback(value);    // Validate the proposed value
    // Remove previous vote if any
    // Add new vote with user's balance
    // Update leader if this value has more votes
}

function voteAndDeposit(uint value, uint amount) nonReentrant payable external {
    governance.deposit{value: msg.value}(msg.sender, amount);
    _vote(value);
}
```

### 2. Time Periods

The governance process has two critical time periods:

- **Challenging Period**: 10 days after a new leader emerges
- **Freeze Period**: 30 days after challenging period ends
- **Total Lock-in**: 40 days before votes can be changed

```solidity
function checkVoteChangeLock() view public {
    require(challenging_period_start_ts + governance.governance_challenging_period() + 
            governance.governance_freeze_period() < block.timestamp, 
            "you cannot change your vote yet");
}

function checkChallengingPeriodExpiry() view public {
    require(block.timestamp > challenging_period_start_ts + 
            governance.governance_challenging_period(), 
            "challenging period not expired yet");
}
```

### 3. Commitment Process

After the challenging period expires, anyone can commit the winning value:

```solidity
function commit() nonReentrant external {
    require(leader != current_value, "already equal to leader");
    checkChallengingPeriodExpiry();  // Must wait for challenging period
    current_value = leader;           // Update the actual value
    commitCallback(leader);           // Call the governed contract
}
```

## Governed Parameters

### Bridge Contract Parameters

The main bridge contracts (Export/Import) can govern these parameters:

```solidity
// Required stake percentage (10-20% of transfer amount)
governance.addVotedValue("ratio100", votedValueFactory.createVotedValueUint(
    governance, settings.ratio100, this.validateRatio, this.setRatio));

// Stake multiplier for challenges (150%)
governance.addVotedValue("counterstake_coef100", votedValueFactory.createVotedValueUint(
    governance, settings.counterstake_coef100, this.validateCounterstakeCoef, this.setCounterstakeCoef));

// Minimum stake amount
governance.addVotedValue("min_stake", votedValueFactory.createVotedValueUint(
    governance, settings.min_stake, this.validateMinStake, this.setMinStake));

// Minimum transaction age before claiming
governance.addVotedValue("min_tx_age", votedValueFactory.createVotedValueUint(
    governance, settings.min_tx_age, this.validateMinTxAge, this.setMinTxAge));

// Threshold for "large" transfers
governance.addVotedValue("large_threshold", votedValueFactory.createVotedValueUint(
    governance, settings.large_threshold, this.validateLargeThreshold, this.setLargeThreshold));

// Time limits for challenges
governance.addVotedValue("challenging_periods", votedValueFactory.createVotedValueUintArray(
    governance, settings.challenging_periods, this.validateChallengingPeriods, this.setChallengingPeriods));

// Time limits for large transfer challenges
governance.addVotedValue("large_challenging_periods", votedValueFactory.createVotedValueUintArray(
    governance, settings.large_challenging_periods, this.validateChallengingPeriods, this.setLargeChallengingPeriods));
```

### Assistant Contract Parameters

Assistant contracts can govern these parameters:

```solidity
// How long profits take to become available
governance.addVotedValue("profit_diffusion_period", votedValueFactory.createVotedValueUint(
    governance, profit_diffusion_period, this.validateProfitDiffusionPeriod, this.setProfitDiffusionPeriod));

// Fee for exiting assistant pools
governance.addVotedValue("exit_fee10000", votedValueFactory.createVotedValueUint(
    governance, exit_fee10000, this.validateExitFee, this.setExitFee));

// Price oracle address
governance.addVotedValue("oracleAddress", votedValueFactory.createVotedValueAddress(
    governance, oracleAddress, this.validateOracle, this.setOracle));
```

## Factory Pattern

### GovernanceFactory

Creates new governance instances for different contracts:

```solidity
contract GovernanceFactory {
    address public immutable governanceMaster;
    
    function createGovernance(address governedContractAddress, address votingTokenAddress) 
        external returns (Governance) {
        Governance governance = Governance(Clones.clone(governanceMaster));
        governance.init(governedContractAddress, votingTokenAddress);
        return governance;
    }
}
```

### VotedValueFactory

Creates different types of voted value contracts:

```solidity
contract VotedValueFactory {
    // Create voted value for uint parameters
    function createVotedValueUint(Governance governance, uint initial_value, 
        function(uint) external validationCallback, function(uint) external commitCallback) 
        external returns (VotedValueUint);
        
    // Create voted value for address parameters
    function createVotedValueAddress(Governance governance, address initial_value,
        function(address) external validationCallback, function(address) external commitCallback) 
        external returns (VotedValueAddress);
        
    // Create voted value for uint array parameters
    function createVotedValueUintArray(Governance governance, uint[] memory initial_value,
        function(uint[] memory) external validationCallback, function(uint[] memory) external commitCallback) 
        external returns (VotedValueUintArray);
}
```

## Parameter Validation

All proposed values are validated before voting:

```solidity
function validateRatio(uint _ratio100) pure external {
    require(_ratio100 > 0 && _ratio100 < 64000, "bad ratio");
}

function validateCounterstakeCoef(uint _counterstake_coef100) pure external {
    require(_counterstake_coef100 > 100 && _counterstake_coef100 < 64000, "bad counterstake coef");
}

function validateMinStake(uint _min_stake) pure external {
    require(_min_stake > 0, "min stake must be positive");
}
```

## Bridge Contract Integration

Bridge contracts have functions that can only be called by governance:

```solidity
modifier onlyVotedValueContract() {
    require(governance.addressBelongsToGovernance(msg.sender), "not from voted value contract");
    _;
}

function setRatio(uint _ratio100) onlyVotedValueContract external {
    settings.ratio100 = uint16(_ratio100);
}

function setCounterstakeCoef(uint _counterstake_coef100) onlyVotedValueContract external {
    settings.counterstake_coef100 = uint16(_counterstake_coef100);
}
```

## Voting Power

Voting power is determined by:

1. **Token Balance**: Amount of voting tokens deposited in governance contract
2. **Stake Requirement**: Users must stake tokens to participate in voting
3. **Lock-in Period**: Votes are locked during challenging and freeze periods

## Example Governance Scenario

### Scenario: Increase Minimum Stake from 10% to 15%

1. **Proposal**: Community wants to increase minimum stake requirement
2. **Voting**: Users vote on the new value (15%) using their staked tokens
3. **Challenging Period**: 10 days for other proposals to compete
4. **Leader Selection**: If 15% gets the most votes, it becomes the leader
5. **Freeze Period**: 30 days where votes cannot be changed
6. **Commitment**: Anyone can commit the change after 40 total days
7. **Implementation**: Bridge contract automatically updates the parameter

## Benefits of Governance System

### Before Governance
- Parameters were hardcoded in contracts
- Changes required contract upgrades
- Centralized control needed for updates
- No community input on parameter changes

### With Governance
- Parameters can be updated dynamically
- Community decides on changes through voting
- No contract upgrades needed for parameter changes
- Transparent and decentralized decision-making
- Gradual implementation with safety periods
- Validation ensures only reasonable values are proposed

## Security Features

1. **Validation**: All proposed values are validated before voting
2. **Time Locks**: 40-day process prevents rapid changes
3. **Vote Locking**: Users cannot change votes during critical periods
4. **Authorization**: Only governance contracts can update parameters
5. **Transparency**: All votes and changes are on-chain and verifiable

## Use Cases

1. **Market Adaptation**: Adjust stake requirements based on market conditions
2. **Security Updates**: Modify challenging periods for better security
3. **Fee Optimization**: Update assistant fees based on network conditions
4. **Oracle Management**: Change price oracle addresses when needed
5. **Performance Tuning**: Optimize parameters based on usage patterns

The governance system ensures that the counterstake bridge can evolve and adapt to changing conditions while maintaining security, transparency, and decentralization. 