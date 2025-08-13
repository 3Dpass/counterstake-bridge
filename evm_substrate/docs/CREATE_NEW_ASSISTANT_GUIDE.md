# Create New Assistant Guide

## Overview

This guide provides step-by-step instructions for creating new Export and Import Wrapper assistants for the Counterstake Bridge system. Assistants are ERC20 contracts that automate bridge operations and provide share-based investment opportunities.

## Table of Contents

1. [Assistant Types](#assistant-types)
2. [Prerequisites](#prerequisites)
3. [Assistant Creation Process](#assistant-creation-process)
4. [Assistant Configuration](#assistant-configuration)
5. [Assistant Flow Documentation](#assistant-flow-documentation)
6. [Testing and Validation](#testing-and-validation)
7. [Production Deployment](#production-deployment)

## Assistant Types

### 1. Export Assistant
- **Purpose**: Automates export operations (3DPass → Foreign Networks)
- **Token Flow**: Uses native 3DPass tokens (P3D, FIRE, WATER)
- **Operations**: Claims on foreign networks, manages stake, tracks profit/loss
- **Example**: P3D Export Assistant for P3D → wP3D on Ethereum

### 2. Import Wrapper Assistant
- **Purpose**: Automates import operations (Foreign Networks → 3DPass)
- **Token Flow**: Uses wrapped tokens on 3DPass (wUSDT, wUSDC, wBUSD)
- **Operations**: Claims on 3DPass, mints/burns wrapped tokens, tracks profit/loss
- **Example**: USDT Import Wrapper Assistant for USDT → wUSDT on 3DPass

## Prerequisites

### Required Infrastructure
1. **CounterstakeFactory**: Deployed and configured
2. **AssistantFactory**: Deployed and configured
3. **Oracle**: Configured with price feeds
4. **Bridge Contracts**: Export or Import Wrapper bridges deployed
5. **Precompile Tokens**: ERC20 precompiles for the target tokens

### Required Configuration
1. **Token Addresses**: Precompile addresses for all involved tokens
2. **Oracle Price Feeds**: Price feeds for token conversions
3. **Network Configuration**: RPC endpoints and chain IDs
4. **Manager Account**: Account with sufficient tokens for assistant operations

## Assistant Creation Process

### Step 1: Prepare Configuration

Create a configuration object for your assistant:

```javascript
const ASSISTANT_CONFIG = {
    // Bridge Configuration
    bridgeAddress: "0x...", // Export or Import Wrapper bridge address
    managerAddress: "0x...", // Manager account address
    oracleAddress: "0x...", // Oracle contract address
    
    // Fee Configuration
    managementFee10000: 100, // 1% management fee (100 basis points)
    successFee10000: 1000,   // 10% success fee (1000 basis points)
    
    // For Import Wrapper Assistants only
    swapFee10000: 10,        // 0.1% swap fee (10 basis points)
    
    // Token Configuration
    exponent: 1,             // Share calculation exponent (1, 2, or 4)
    
    // Assistant Identity
    name: "Token Export Assistant", // Assistant name
    symbol: "TOKENEA"              // Assistant symbol
};
```

### Step 2: Create Export Assistant

```javascript
async function createExportAssistant(config) {
    const assistantFactory = new ethers.Contract(
        assistantFactoryAddress,
        AssistantFactoryJson.abi,
        signer
    );
    
    const tx = await assistantFactory.createExportAssistant(
        config.bridgeAddress,        // Export bridge address
        config.managerAddress,       // Manager address
        config.managementFee10000,   // Management fee (basis points)
        config.successFee10000,      // Success fee (basis points)
        config.oracleAddress,        // Oracle address
        config.exponent,             // Share exponent
        config.name,                 // Assistant name
        config.symbol,               // Assistant symbol
        { gasLimit: 9000000 }
    );
    
    const receipt = await tx.wait();
    
    // Extract assistant address from event
    const newExportAssistantEvent = receipt.logs.find(log => {
        try {
            const parsedLog = assistantFactory.interface.parseLog(log);
            return parsedLog.name === 'NewExportAssistant';
        } catch (e) {
            return false;
        }
    });
    
    if (newExportAssistantEvent) {
        const parsedEvent = assistantFactory.interface.parseLog(newExportAssistantEvent);
        return parsedEvent.args.contractAddress;
    } else {
        throw new Error('NewExportAssistant event not found');
    }
}
```

### Step 3: Create Import Wrapper Assistant

```javascript
async function createImportWrapperAssistant(config) {
    const assistantFactory = new ethers.Contract(
        assistantFactoryAddress,
        AssistantFactoryJson.abi,
        signer
    );
    
    const tx = await assistantFactory.createImportWrapperAssistant(
        config.bridgeAddress,        // Import Wrapper bridge address
        config.managerAddress,       // Manager address
        config.managementFee10000,   // Management fee (basis points)
        config.successFee10000,      // Success fee (basis points)
        config.swapFee10000,         // Swap fee (basis points)
        config.exponent,             // Share exponent
        config.name,                 // Assistant name
        config.symbol,               // Assistant symbol
        { gasLimit: 3000000 }
    );
    
    const receipt = await tx.wait();
    
    // Extract assistant address from event
    const newImportWrapperAssistantEvent = receipt.logs.find(log => {
        try {
            const parsedLog = assistantFactory.interface.parseLog(log);
            return parsedLog.name === 'NewImportWrapperAssistant';
        } catch (e) {
            return false;
        }
    });
    
    if (newImportWrapperAssistantEvent) {
        const parsedEvent = assistantFactory.interface.parseLog(newImportWrapperAssistantEvent);
        return parsedEvent.args.contractAddress;
    } else {
        throw new Error('NewImportWrapperAssistant event not found');
    }
}
```

## Assistant Configuration

### Fee Structure

```javascript
// Management Fee: Annual fee based on total assets under management
const managementFee10000 = 100; // 1% annually

// Success Fee: Fee on profits generated by the assistant
const successFee10000 = 1000;   // 10% of profits

// Swap Fee: Fee for token swaps (Import Wrapper Assistants only)
const swapFee10000 = 10;        // 0.1% per swap
```

### Share Calculation

```javascript
// Exponent determines how shares are calculated relative to token balance
const exponent = 1; // Linear relationship (1:1)
// exponent = 2;   // Square root relationship (reduces volatility)
// exponent = 4;   // Fourth root relationship (further reduces volatility)
```

### Oracle Price Feeds

Ensure the oracle has the required price feeds:

```javascript
// For Export Assistants (3DPass → Foreign)
await oracle.setPrice(
    "_NATIVE_",                    // Native token
    "wTOKEN",                      // Wrapped token symbol
    ethers.utils.parseEther('1'),  // Price numerator
    ethers.utils.parseEther('1'),  // Price denominator
    { gasLimit: 500000 }
);

// For Import Wrapper Assistants (Foreign → 3DPass)
await oracle.setPrice(
    "TOKEN",                       // Foreign token symbol
    "_NATIVE_",                    // Native token
    ethers.utils.parseEther('1'),  // Price numerator
    ethers.utils.parseEther('1'),  // Price denominator
    { gasLimit: 500000 }
);
```

## Assistant Flow Documentation

### Export Assistant Flow

#### 1. User Expatriation
```solidity
// User transfers tokens to bridge for export
function transferToForeignChain(
    string memory foreign_address,
    string memory data,
    uint amount,
    int reward
) external {
    receiveStakeAsset(amount);  // Transfer tokens from user to bridge
    emit NewExpatriation(msg.sender, amount, reward, foreign_address, data);
}
```

#### 2. Assistant Claim
```solidity
// Assistant claims on foreign network
function claim(
    string memory txid,
    uint32 txts,
    uint amount,
    int reward,
    string memory sender_address,
    address payable recipient_address,
    string memory data
) external {
    uint required_stake = Export(bridgeAddress).getRequiredStake(amount);
    uint paid_amount = amount - uint(reward);
    uint total = required_stake + paid_amount;
    
    // Verify sufficient balance
    (, int net_balance) = updateMFAndGetBalances(0, false);
    require(total <= uint(net_balance), "not enough balance");
    
    // Call bridge claim function
    Export(bridgeAddress).claim(txid, txts, amount, reward, required_stake, sender_address, recipient_address, data);
    
    // Track investment and network fees
    balances_in_work[claim_num] = total + network_fee;
    balance_in_work += total + network_fee;
}
```

#### 3. Assistant Callback
```solidity
// Bridge calls assistant when claim is resolved
function onReceivedFromClaim(
    uint claim_num,
    uint claimed_amount,
    uint won_stake,
    string memory,
    address,
    string memory
) external {
    uint invested = balances_in_work[claim_num];
    receiveFromClaim(claim_num, claimed_amount, won_stake, invested);
}
```

#### 4. Profit/Loss Tracking
```solidity
function receiveFromClaim(
    uint claim_num,
    uint claimed_amount,
    uint won_stake,
    uint invested
) private {
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

### Import Wrapper Assistant Flow

#### 1. Assistant Claim
```solidity
// Assistant claims on 3DPass network
function claim(
    string memory txid,
    uint32 txts,
    uint amount,
    int reward,
    string memory sender_address,
    address payable recipient_address,
    string memory data
) external {
    uint required_stake = ImportWrapper(bridgeAddress).getRequiredStake(amount);
    uint paid_amount = amount - uint(reward);
    uint total = required_stake + paid_amount;
    
    // Verify sufficient balance
    (, int net_balance) = updateMFAndGetBalances(0, false);
    require(total <= uint(net_balance), "not enough balance");
    
    // Call bridge claim function
    ImportWrapper(bridgeAddress).claim(txid, txts, amount, reward, required_stake, sender_address, recipient_address, data);
    
    // Track investment and network fees
    balances_in_work[claim_num] = total + network_fee;
    balance_in_work += total + network_fee;
}
```

#### 2. Token Minting to User
```solidity
// Bridge immediately mints tokens to user
function sendToClaimRecipient(address payable to_address, uint paid_amount) {
    require(ILocalAsset(precompileAddress).mint(to_address, paid_amount), "mint to precompile failed");
}
```

#### 3. Assistant Callback
```solidity
// Bridge calls assistant when claim is resolved
function onReceivedFromClaim(
    uint claim_num,
    uint claimed_amount,
    uint won_stake,
    string memory,
    address,
    string memory
) external {
    uint invested = balances_in_work[claim_num];
    receiveFromClaim(claim_num, claimed_amount, won_stake, invested);
}
```

## Testing and Validation

### 1. Assistant Creation Test

```javascript
async function testAssistantCreation() {
    log('Testing assistant creation...');
    
    // Create assistant
    const assistantAddress = await createExportAssistant(ASSISTANT_CONFIG);
    log(`  ✓ Assistant created: ${assistantAddress}`);
    
    // Verify assistant contract
    const assistant = new ethers.Contract(
        assistantAddress,
        ExportAssistantJson.abi,
        signer
    );
    
    // Check basic properties
    const name = await assistant.name();
    const symbol = await assistant.symbol();
    const bridgeAddress = await assistant.bridgeAddress();
    const managerAddress = await assistant.managerAddress();
    
    log(`  ✓ Assistant properties verified:`);
    log(`    - Name: ${name}`);
    log(`    - Symbol: ${symbol}`);
    log(`    - Bridge: ${bridgeAddress}`);
    log(`    - Manager: ${managerAddress}`);
}
```

### 2. Assistant Functionality Test

```javascript
async function testAssistantFunctionality() {
    log('Testing assistant functionality...');
    
    // Test share operations
    const shareAmount = ethers.utils.parseEther('1');
    const buySharesTx = await assistant.buyShares(shareAmount);
    await buySharesTx.wait();
    log(`  ✓ Share purchase successful`);
    
    // Test claim operations
    const claimTx = await assistant.claim(
        'test_txid',
        Math.floor(Date.now() / 1000),
        ethers.utils.parseEther('0.1'),
        0,
        'sender_address',
        userAddress,
        'test_data'
    );
    await claimTx.wait();
    log(`  ✓ Claim operation successful`);
    
    // Test fee withdrawal
    const withdrawTx = await assistant.withdrawManagementFee();
    await withdrawTx.wait();
    log(`  ✓ Fee withdrawal successful`);
}
```

### 3. Integration Test

```javascript
async function testAssistantIntegration() {
    log('Testing assistant integration...');
    
    // Test with bridge
    const bridge = new ethers.Contract(
        ASSISTANT_CONFIG.bridgeAddress,
        ExportJson.abi,
        signer
    );
    
    // Verify bridge settings
    const settings = await bridge.settings();
    log(`  ✓ Bridge settings verified`);
    
    // Test oracle integration
    const oracle = new ethers.Contract(
        ASSISTANT_CONFIG.oracleAddress,
        OracleJson.abi,
        signer
    );
    
    const price = await oracle.getPrice("_NATIVE_", "wTOKEN");
    log(`  ✓ Oracle price feed verified: (${price[0]}, ${price[1]})`);
}
```

## Production Deployment

### 1. Pre-deployment Checklist

- [ ] All infrastructure contracts deployed
- [ ] Oracle price feeds configured
- [ ] Bridge contracts deployed and tested
- [ ] Manager account funded with sufficient tokens
- [ ] Gas limits and fees calculated
- [ ] Security audit completed

### 2. Deployment Script

```javascript
async function deployAssistantToProduction() {
    log('Deploying assistant to production...');
    
    try {
        // 1. Create assistant
        const assistantAddress = await createExportAssistant(PRODUCTION_CONFIG);
        log(`  ✓ Assistant deployed: ${assistantAddress}`);
        
        // 2. Verify assistant
        await verifyAssistant(assistantAddress);
        log(`  ✓ Assistant verified`);
        
        // 3. Configure assistant
        await configureAssistant(assistantAddress);
        log(`  ✓ Assistant configured`);
        
        // 4. Fund assistant
        await fundAssistant(assistantAddress);
        log(`  ✓ Assistant funded`);
        
        // 5. Test assistant
        await testAssistant(assistantAddress);
        log(`  ✓ Assistant tested`);
        
        log('🎉 Assistant deployment complete!');
        return assistantAddress;
        
    } catch (error) {
        log(`❌ Assistant deployment failed: ${error.message}`);
        throw error;
    }
}
```

### 3. Post-deployment Verification

```javascript
async function verifyAssistant(assistantAddress) {
    log('Verifying assistant deployment...');
    
    const assistant = new ethers.Contract(
        assistantAddress,
        ExportAssistantJson.abi,
        signer
    );
    
    // Verify contract bytecode
    const code = await provider.getCode(assistantAddress);
    if (code === '0x') {
        throw new Error('Assistant contract not deployed');
    }
    
    // Verify interface
    const name = await assistant.name();
    const symbol = await assistant.symbol();
    
    if (name !== PRODUCTION_CONFIG.name || symbol !== PRODUCTION_CONFIG.symbol) {
        throw new Error('Assistant configuration mismatch');
    }
    
    log(`  ✓ Assistant verification complete`);
}
```

### 4. Configuration and Funding

```javascript
async function configureAssistant(assistantAddress) {
    log('Configuring assistant...');
    
    const assistant = new ethers.Contract(
        assistantAddress,
        ExportAssistantJson.abi,
        signer
    );
    
    // Approve precompile tokens
    const approveTx = await assistant.approvePrecompile();
    await approveTx.wait();
    log(`  ✓ Precompile approval complete`);
    
    // Set up initial parameters
    // (Additional configuration as needed)
    
    log(`  ✓ Assistant configuration complete`);
}

async function fundAssistant(assistantAddress) {
    log('Funding assistant...');
    
    // Transfer initial tokens to assistant
    const tokenContract = new ethers.Contract(
        TOKEN_ADDRESS,
        TokenJson.abi,
        signer
    );
    
    const fundingAmount = ethers.utils.parseEther('1000'); // 1000 tokens
    const transferTx = await tokenContract.transfer(assistantAddress, fundingAmount);
    await transferTx.wait();
    
    log(`  ✓ Assistant funded with ${ethers.utils.formatEther(fundingAmount)} tokens`);
}
```

## Example Implementation

### Complete Assistant Creation Script

```javascript
const { ethers } = require('ethers');

// Configuration
const ASSISTANT_CONFIG = {
    bridgeAddress: "0x626D4E8c191c36B5937fD73A2A1B774C2361EA80",
    managerAddress: "0x41d06a54D85EE34c0Ca7c21979eE87b9817cde5b",
    oracleAddress: "0xAc647d0caB27e912C844F27716154f54EDD519cE",
    managementFee10000: 100,
    successFee10000: 1000,
    exponent: 1,
    name: "P3D Export Assistant",
    symbol: "P3DEA"
};

async function createNewAssistant() {
    // Setup provider and signer
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);
    
    // Load contract ABIs
    const AssistantFactoryJson = require('./build/contracts/AssistantFactory.json');
    const assistantFactoryAddress = "0x..."; // From configuration
    
    // Create assistant factory contract
    const assistantFactory = new ethers.Contract(
        assistantFactoryAddress,
        AssistantFactoryJson.abi,
        signer
    );
    
    // Create Export Assistant
    const tx = await assistantFactory.createExportAssistant(
        ASSISTANT_CONFIG.bridgeAddress,
        ASSISTANT_CONFIG.managerAddress,
        ASSISTANT_CONFIG.managementFee10000,
        ASSISTANT_CONFIG.successFee10000,
        ASSISTANT_CONFIG.oracleAddress,
        ASSISTANT_CONFIG.exponent,
        ASSISTANT_CONFIG.name,
        ASSISTANT_CONFIG.symbol,
        { gasLimit: 9000000 }
    );
    
    const receipt = await tx.wait();
    
    // Extract assistant address
    const newExportAssistantEvent = receipt.logs.find(log => {
        try {
            const parsedLog = assistantFactory.interface.parseLog(log);
            return parsedLog.name === 'NewExportAssistant';
        } catch (e) {
            return false;
        }
    });
    
    if (newExportAssistantEvent) {
        const parsedEvent = assistantFactory.interface.parseLog(newExportAssistantEvent);
        const assistantAddress = parsedEvent.args.contractAddress;
        
        console.log(`✅ Assistant created successfully!`);
        console.log(`Address: ${assistantAddress}`);
        console.log(`Name: ${ASSISTANT_CONFIG.name}`);
        console.log(`Symbol: ${ASSISTANT_CONFIG.symbol}`);
        
        return assistantAddress;
    } else {
        throw new Error('Assistant creation failed - event not found');
    }
}

// Run the creation
createNewAssistant()
    .then(address => console.log(`Assistant deployed at: ${address}`))
    .catch(error => console.error(`Error: ${error.message}`));
```

## Best Practices

### 1. Security Considerations
- Use multi-signature wallets for manager accounts
- Implement proper access controls
- Regular security audits
- Monitor for unusual activity

### 2. Performance Optimization
- Optimize gas usage in assistant operations
- Use appropriate gas limits
- Monitor network congestion
- Implement retry mechanisms

### 3. Monitoring and Maintenance
- Monitor assistant balances and performance
- Track profit/loss metrics
- Regular fee withdrawals
- Update oracle price feeds as needed

### 4. User Experience
- Clear documentation for users
- Transparent fee structure
- Easy share purchase/redemption process
- Regular performance reports

## Troubleshooting

### Common Issues

1. **Insufficient Balance Error**
   - Ensure manager account has sufficient tokens
   - Check network fee calculations
   - Verify reward amounts exceed network fees

2. **Oracle Price Feed Errors**
   - Verify all required price feeds are set
   - Check price feed accuracy
   - Ensure oracle contract is accessible

3. **Gas Limit Errors**
   - Increase gas limits for complex operations
   - Optimize contract interactions
   - Monitor network conditions

4. **Permission Errors**
   - Verify manager permissions
   - Check contract ownership
   - Ensure proper role assignments

### Debug Tools

```javascript
// Assistant balance checker
async function checkAssistantBalance(assistantAddress) {
    const assistant = new ethers.Contract(assistantAddress, ExportAssistantJson.abi, signer);
    
    const balance = await assistant.getGrossBalance();
    const balanceInWork = await assistant.balance_in_work();
    const profit = await assistant.profit();
    
    console.log(`Gross Balance: ${ethers.utils.formatEther(balance)}`);
    console.log(`Balance in Work: ${ethers.utils.formatEther(balanceInWork)}`);
    console.log(`Profit: ${profit.toString()}`);
}

// Network fee calculator
async function calculateNetworkFee(assistantAddress, claimAmount) {
    const assistant = new ethers.Contract(assistantAddress, ExportAssistantJson.abi, signer);
    
    // Estimate gas usage
    const gasEstimate = await assistant.estimateGas.claim(
        'test_txid',
        Math.floor(Date.now() / 1000),
        claimAmount,
        0,
        'sender_address',
        userAddress,
        'test_data'
    );
    
    const gasPrice = await provider.getGasPrice();
    const networkFee = gasEstimate.mul(gasPrice);
    
    console.log(`Estimated Network Fee: ${ethers.utils.formatEther(networkFee)}`);
    return networkFee;
}
```

This guide provides a comprehensive approach to creating and managing assistants in the Counterstake Bridge system. Follow these steps carefully to ensure successful deployment and operation of your assistants.
