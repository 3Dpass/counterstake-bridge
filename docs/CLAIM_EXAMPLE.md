# EVM Chain Claim Submission Examples

This document provides comprehensive examples and parameter descriptions for submitting claims on EVM chains in the Counterstake Bridge system.

## Function Signature

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
) nonReentrant payable external
```

## Parameters Description

| Parameter | Type | Description |
|-----------|------|-------------|
| `txid` | `string` | Transaction ID of the original transfer on the source chain |
| `txts` | `uint32` | Unix timestamp of the original transfer transaction |
| `amount` | `uint` | Amount of tokens being claimed (in wei/smallest unit) |
| `reward` | `int` | Reward amount for the claimer (can be negative to disallow third-party claiming) |
| `stake` | `uint` | Stake amount required for the claim (must be >= required_stake) |
| `sender_address` | `string` | Address of the original sender on the source chain |
| `recipient_address` | `address payable` | Address to receive the claimed tokens (0x0 = msg.sender) |
| `data` | `string` | Additional data from the original transfer |

## Example 1: Self-Claiming (User claims for themselves)

```javascript
const { ethers } = require('ethers');

// Example: Claiming 1 ETH from Ethereum to BSC
const claimParams = {
    txid: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // Original transfer tx hash
    txts: 1640995200, // Unix timestamp of original transfer
    amount: ethers.utils.parseEther("1.0"), // 1 ETH in wei
    reward: 0, // No reward for self-claiming
    stake: ethers.utils.parseEther("0.1"), // Required stake amount
    sender_address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6", // Original sender
    recipient_address: "0x0000000000000000000000000000000000000000", // Will default to msg.sender
    data: "" // No additional data
};

// Call the claim function
const tx = await bridgeContract.claim(
    claimParams.txid,
    claimParams.txts,
    claimParams.amount,
    claimParams.reward,
    claimParams.stake,
    claimParams.sender_address,
    claimParams.recipient_address,
    claimParams.data,
    { 
        value: claimParams.stake, // Send stake as ETH if native token
        gasLimit: 500000 // Set appropriate gas limit
    }
);

console.log("Claim transaction hash:", tx.hash);
await tx.wait(); // Wait for confirmation
```

## Example 2: Third-Party Claiming (Claimer claims for someone else)

```javascript
// Example: Third-party claiming with reward
const claimParams = {
    txid: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txts: 1640995200,
    amount: ethers.utils.parseEther("1.0"), // 1 ETH
    reward: ethers.utils.parseEther("0.05"), // 0.05 ETH reward
    stake: ethers.utils.parseEther("0.1"), // Required stake
    sender_address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    recipient_address: "0xRecipientAddress123456789012345678901234567890", // Different from claimer
    data: ""
};

// Calculate total value to send
const paidAmount = claimParams.amount.sub(claimParams.reward); // 0.95 ETH
const totalValue = claimParams.stake.add(paidAmount); // 0.1 + 0.95 = 1.05 ETH

const tx = await bridgeContract.claim(
    claimParams.txid,
    claimParams.txts,
    claimParams.amount,
    claimParams.reward,
    claimParams.stake,
    claimParams.sender_address,
    claimParams.recipient_address,
    claimParams.data,
    { 
        value: totalValue,
        gasLimit: 500000
    }
);

console.log("Third-party claim transaction hash:", tx.hash);
```

## Example 3: ERC20 Token Claiming

```javascript
// Example: Claiming USDC tokens
const usdcAddress = "0xA0b86a33E6441b8c4C8C0e4b8b8b8b8b8b8b8b8b"; // USDC contract address
const bridgeAddress = "0xBridgeAddress123456789012345678901234567890"; // Bridge contract address

// First, approve the bridge to spend your tokens
const usdcContract = new ethers.Contract(usdcAddress, erc20Abi, signer);
const stakeAmount = ethers.utils.parseUnits("100", 6); // 100 USDC (6 decimals)

// Approve stake amount
const approveTx = await usdcContract.approve(bridgeAddress, stakeAmount);
await approveTx.wait();

// Now make the claim
const claimParams = {
    txid: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    txts: 1640995200,
    amount: ethers.utils.parseUnits("1000", 6), // 1000 USDC
    reward: ethers.utils.parseUnits("10", 6), // 10 USDC reward
    stake: stakeAmount, // 100 USDC stake
    sender_address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    recipient_address: "0xRecipientAddress123456789012345678901234567890",
    data: ""
};

const tx = await bridgeContract.claim(
    claimParams.txid,
    claimParams.txts,
    claimParams.amount,
    claimParams.reward,
    claimParams.stake,
    claimParams.sender_address,
    claimParams.recipient_address,
    claimParams.data,
    { 
        value: 0, // No ETH value for ERC20 tokens
        gasLimit: 500000
    }
);
```

## Example 4: Complete Claiming Workflow with Error Handling

```javascript
async function submitClaim(bridgeContract, claimParams) {
    try {
        // Validate parameters
        if (!claimParams.txid || claimParams.txid.length !== 66) {
            throw new Error("Invalid txid format");
        }
        
        if (claimParams.amount <= 0) {
            throw new Error("Amount must be greater than 0");
        }
        
        if (claimParams.stake <= 0) {
            throw new Error("Stake must be greater than 0");
        }
        
        // Check if transfer is old enough
        const currentTime = Math.floor(Date.now() / 1000);
        const minTxAge = 300; // 5 minutes (example)
        if (currentTime < claimParams.txts + minTxAge) {
            throw new Error("Transfer is too recent, please wait");
        }
        
        // Estimate gas
        const gasEstimate = await bridgeContract.estimateGas.claim(
            claimParams.txid,
            claimParams.txts,
            claimParams.amount,
            claimParams.reward,
            claimParams.stake,
            claimParams.sender_address,
            claimParams.recipient_address,
            claimParams.data,
            { value: claimParams.stake }
        );
        
        // Submit claim with 20% gas buffer
        const tx = await bridgeContract.claim(
            claimParams.txid,
            claimParams.txts,
            claimParams.amount,
            claimParams.reward,
            claimParams.stake,
            claimParams.sender_address,
            claimParams.recipient_address,
            claimParams.data,
            { 
                value: claimParams.stake,
                gasLimit: gasEstimate.mul(120).div(100) // 20% buffer
            }
        );
        
        console.log("Claim submitted:", tx.hash);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log("Claim confirmed in block:", receipt.blockNumber);
        
        return {
            success: true,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
        };
        
    } catch (error) {
        console.error("Claim submission failed:", error.message);
        
        // Handle specific error cases
        if (error.message.includes("has already been claimed")) {
            console.log("This transfer has already been claimed");
        } else if (error.message.includes("the stake is too small")) {
            console.log("Insufficient stake amount");
        } else if (error.message.includes("too early")) {
            console.log("Transfer is too recent, please wait");
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Usage
const result = await submitClaim(bridgeContract, claimParams);
if (result.success) {
    console.log("Claim successful:", result.txHash);
} else {
    console.log("Claim failed:", result.error);
}
```

## Important Validation Rules

1. **Amount Validation**: `amount > 0`
2. **Stake Validation**: `stake >= getRequiredStake(amount)`
3. **Timing Validation**: `block.timestamp >= txts + min_tx_age`
4. **Reward Logic**: 
   - If `reward < 0`: Only the original sender can claim (third-party claiming disabled)
   - If `reward >= 0`: Third-party claiming allowed
5. **Duplicate Prevention**: The transfer must not have been claimed already
6. **Address Validation**: All addresses must be valid format

## Value Calculation Guide

### For Native Token Claims (ETH, BNB, MATIC, etc.)
- **Self-claiming**: Send only the stake amount as `value`
- **Third-party claiming**: Send `stake + (amount - reward)` as `value`

### For ERC20 Token Claims
- **Self-claiming**: Send 0 as `value`, ensure sufficient token balance and approval
- **Third-party claiming**: Send 0 as `value`, ensure sufficient token balance and approval

## Gas Considerations

1. **Gas Limit**: Typically 300,000-500,000 gas units
2. **Gas Price**: Use appropriate gas price for network conditions
3. **Gas Estimation**: Always estimate gas before submitting
4. **Gas Buffer**: Add 10-20% buffer to estimated gas

## Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "0 claim" | Amount is zero | Set amount > 0 |
| "the stake is too small" | Insufficient stake | Increase stake amount |
| "too early" | Transfer too recent | Wait for min_tx_age |
| "this transfer has already been claimed" | Duplicate claim | Check if already claimed |
| "reward too large" | Reward >= amount | Reduce reward amount |
| "the sender disallowed third-party claiming" | Negative reward with third-party | Use original sender address |

## Network-Specific Notes

### Ethereum
- Gas prices can be high, monitor gas prices
- Use EIP-1559 transactions when possible

### BSC (Binance Smart Chain)
- Lower gas costs than Ethereum
- Faster block times

### Polygon
- Very low gas costs
- Fast confirmation times

### Kava
- EVM-compatible Cosmos chain
- Check network-specific requirements

## Best Practices

1. **Always validate parameters** before submission
2. **Check transfer age** to ensure it's claimable
3. **Estimate gas** and add buffer
4. **Handle errors gracefully** with specific error messages
5. **Monitor transaction status** after submission
6. **Use appropriate gas prices** for network conditions
7. **Test on testnets** before mainnet deployment

## Testing

Always test your claim submission on testnets first:

- **Ethereum**: Goerli, Sepolia
- **BSC**: BSC Testnet
- **Polygon**: Mumbai
- **Kava**: Kava Testnet

This ensures your implementation works correctly before using real funds on mainnet.
