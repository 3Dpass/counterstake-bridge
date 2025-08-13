import { ethers } from 'ethers';
import { 
  EXPORT_ABI,
  IMPORT_WRAPPER_ABI,
  ASSISTANT_FACTORY_ABI,
  EXPORT_ASSISTANT_ABI
} from '../contracts/abi';
import { getBridgeInstanceByAddress } from '../config/networks';

// 3DPass Bridge Contract Utilities

/**
 * Get the appropriate ABI for a network
 * @param {string} networkSymbol - Network symbol (ETH, BSC, 3DPass)
 * @param {string} contractType - 'export' or 'import_wrapper'
 * @returns {Array} Contract ABI
 */
export const getContractABI = (networkSymbol, contractType) => {
  if (networkSymbol === '3DPass') {
    return contractType === 'export' ? EXPORT_ABI : IMPORT_WRAPPER_ABI;
  }
  // For other networks, use standard ABIs
  return contractType === 'export' ? EXPORT_ABI : IMPORT_WRAPPER_ABI;
};

/**
 * Get bridge instance by address
 * @param {string} address - Bridge contract address
 * @returns {Object|null} Bridge instance or null if not found
 */
export const getBridgeInstance = (address) => {
  return getBridgeInstanceByAddress(address);
};

/**
 * Get bridge ABI based on bridge instance
 * @param {Object} bridgeInstance - Bridge instance from BRIDGE_INSTANCES
 * @returns {Array} Contract ABI
 */
export const getBridgeABI = (bridgeInstance) => {
  if (!bridgeInstance) return null;
  
  const networkSymbol = bridgeInstance.sourceNetwork;
  const contractType = bridgeInstance.type;
  
  return getContractABI(networkSymbol, contractType);
};

/**
 * Create bridge contract instance
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @param {string} contractAddress - Contract address
 * @param {string} networkSymbol - Network symbol
 * @param {string} contractType - 'export' or 'import_wrapper'
 * @returns {ethers.Contract} Contract instance
 */
export const createBridgeContract = (providerOrSigner, contractAddress, networkSymbol, contractType) => {
  const abi = getContractABI(networkSymbol, contractType);
  return new ethers.Contract(contractAddress, abi, providerOrSigner);
};

/**
 * Get required stake for a transfer
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} amount - Transfer amount
 * @param {number} transferTokenDecimals - Transfer token decimals
 * @param {number} stakeTokenDecimals - Stake token decimals
 * @returns {Promise<string>} Required stake amount
 */
export const getRequiredStake = async (contract, amount, transferTokenDecimals = 18, stakeTokenDecimals = 18) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, transferTokenDecimals);
    const requiredStakeWei = await contract.getRequiredStake(amountWei);
    return ethers.utils.formatUnits(requiredStakeWei, stakeTokenDecimals);
  } catch (error) {
    console.error('Error getting required stake:', error);
    throw new Error(`Failed to get required stake: ${error.message}`);
  }
};

/**
 * Get required stake in original token units (not P3D)
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} amount - Transfer amount
 * @param {number} transferTokenDecimals - Transfer token decimals
 * @returns {Promise<string>} Required stake amount in original token units
 */
export const getRequiredStakeInOriginalToken = async (contract, amount, transferTokenDecimals = 18) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, transferTokenDecimals);
    const requiredStakeWei = await contract.getRequiredStake(amountWei);
    
    // Convert stake from stake token to original token units
    // The stake is returned in P3D units, but we want to show it in original token units
    // So we format it using the original token decimals
    return ethers.utils.formatUnits(requiredStakeWei, transferTokenDecimals);
  } catch (error) {
    console.error('Error getting required stake in original token:', error);
    throw new Error(`Failed to get required stake in original token: ${error.message}`);
  }
};

/**
 * Transfer tokens to foreign chain (Export)
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} foreignAddress - Foreign address
 * @param {string} data - Additional data
 * @param {string} amount - Transfer amount
 * @param {string} reward - Reward amount (default: '0')
 * @param {number} decimals - Token decimals (default: 18)
 * @param {boolean} isPrecompile - Whether token is a precompile (default: false)
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const transferToForeignChain = async (
  contract, 
  foreignAddress, 
  data, 
  amount, 
  reward = '0', 
  decimals = 18,
  isPrecompile = false
) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    const rewardWei = ethers.utils.parseUnits(reward, decimals);
    
    // For precompile tokens, we need to handle differently
    if (isPrecompile) {
      // Precompile tokens are handled natively by the bridge
      const tx = await contract.transferToForeignChain(foreignAddress, data, amountWei, rewardWei);
      return await tx.wait();
    } else {
      // Regular ERC20 tokens
      const tx = await contract.transferToForeignChain(foreignAddress, data, amountWei, rewardWei);
      return await tx.wait();
    }
  } catch (error) {
    console.error('Error transferring to foreign chain:', error);
    throw new Error(`Failed to transfer to foreign chain: ${error.message}`);
  }
};

/**
 * Transfer tokens to home chain (Import Wrapper)
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} homeAddress - Home address
 * @param {string} data - Additional data
 * @param {string} amount - Transfer amount
 * @param {string} reward - Reward amount (default: '0')
 * @param {number} decimals - Token decimals (default: 18)
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const transferToHomeChain = async (
  contract, 
  homeAddress, 
  data, 
  amount, 
  reward = '0', 
  decimals = 18
) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    const rewardWei = ethers.utils.parseUnits(reward, decimals);
    
    const tx = await contract.transferToHomeChain(homeAddress, data, amountWei, rewardWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error transferring to home chain:', error);
    throw new Error(`Failed to transfer to home chain: ${error.message}`);
  }
};

/**
 * Get bridge settings
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<Object>} Bridge settings
 */
export const getBridgeSettings = async (contract) => {
  try {
    const settings = await contract.settings();
    return {
      tokenAddress: settings.tokenAddress,
      ratio100: settings.ratio100,
      counterstake_coef100: settings.counterstake_coef100,
      min_tx_age: settings.min_tx_age,
      min_stake: settings.min_stake,
      challenging_periods: settings.challenging_periods,
      large_challenging_periods: settings.large_challenging_periods,
      large_threshold: settings.large_threshold,
    };
  } catch (error) {
    console.error('Error getting bridge settings:', error);
    throw new Error(`Failed to get bridge settings: ${error.message}`);
  }
};

/**
 * Check if contract is a 3DPass contract
 * @param {ethers.Contract} contract - Contract instance
 * @returns {Promise<boolean>} True if 3DPass contract
 */
export const is3DPassContract = async (contract) => {
  try {
    // Check if contract has P3D_PRECOMPILE function (3DPass specific)
    await contract.P3D_PRECOMPILE();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get bridge token information
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @returns {Promise<Object>} Token information
 */
export const getBridgeTokenInfo = async (contract, provider) => {
  try {
    const settings = await getBridgeSettings(contract);
    const tokenAddress = settings.tokenAddress;
    
    // Check if it's a 3DPass precompile
    const is3DPass = await is3DPassContract(contract);
    
    if (is3DPass) {
      // For 3DPass precompiles, use the appropriate ABI
      const { get3DPassTokenMetadata } = await import('./threedpass');
      return await get3DPassTokenMetadata(provider, tokenAddress);
    } else {
      // For regular ERC20 tokens
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
        provider
      );
      
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);
      
      return {
        name,
        symbol,
        decimals,
        address: tokenAddress,
        isPrecompile: false
      };
    }
  } catch (error) {
    console.error('Error getting bridge token info:', error);
    throw new Error(`Failed to get bridge token info: ${error.message}`);
  }
};

/**
 * Validate bridge transfer parameters
 * @param {Object} params - Transfer parameters
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<Object>} Validation result
 */
export const validateBridgeTransfer = async (params, contract) => {
  const { amount, recipient, data = '' } = params;
  const errors = [];
    
    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      errors.push('Invalid amount');
    }
    
  // Validate recipient address
  if (!recipient || !ethers.utils.isAddress(recipient)) {
    errors.push('Invalid recipient address');
  }

  // Validate data (optional)
  if (data && typeof data !== 'string') {
    errors.push('Invalid data format');
  }

  // Check if contract is valid
  try {
    await contract.settings();
  } catch (error) {
    errors.push('Invalid bridge contract');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get pending transfers for a user
 * @param {ethers.Contract} exportContract - Export bridge contract
 * @param {ethers.Contract} importContract - Import bridge contract
 * @param {string} userAddress - User address
 * @returns {Promise<Array>} Array of pending transfers
 */
export const getPendingTransfers = async (exportContract, importContract, userAddress) => {
  try {
    const pendingTransfers = [];
    
    // Get export transfers (outgoing)
    if (exportContract) {
      try {
    const exportFilter = exportContract.filters.NewExpatriation(userAddress);
    const exportEvents = await exportContract.queryFilter(exportFilter);
    
    for (const event of exportEvents) {
      const { sender_address, amount, reward, foreign_address, data } = event.args;
      const blockNumber = event.blockNumber;
      
      // Check if transfer is still pending (not claimed yet)
      const isClaimed = await checkIfTransferClaimed(exportContract, event.transactionHash);
      
      if (!isClaimed) {
        pendingTransfers.push({
          id: event.transactionHash,
          type: 'export',
          sender: sender_address,
          amount: ethers.utils.formatEther(amount),
          reward: ethers.utils.formatEther(reward),
          destinationAddress: foreign_address,
          data: data,
          blockNumber,
          timestamp: await getBlockTimestamp(exportContract.provider, blockNumber),
          status: 'pending',
          contract: exportContract,
        });
          }
        }
      } catch (error) {
        console.warn('Error getting export transfers:', error);
      }
    }
    
    // Get import transfers (incoming)
    if (importContract) {
      try {
    const importFilter = importContract.filters.NewRepatriation(userAddress);
    const importEvents = await importContract.queryFilter(importFilter);
    
    for (const event of importEvents) {
      const { sender_address, amount, reward, home_address, data } = event.args;
      const blockNumber = event.blockNumber;
      
      // Check if transfer is still pending (not claimed yet)
      const isClaimed = await checkIfTransferClaimed(importContract, event.transactionHash);
      
      if (!isClaimed) {
        pendingTransfers.push({
          id: event.transactionHash,
          type: 'import',
          sender: sender_address,
          amount: ethers.utils.formatEther(amount),
          reward: ethers.utils.formatEther(reward),
          destinationAddress: home_address,
          data: data,
          blockNumber,
          timestamp: await getBlockTimestamp(importContract.provider, blockNumber),
          status: 'pending',
          contract: importContract,
        });
          }
        }
      } catch (error) {
        console.warn('Error getting import transfers:', error);
      }
    }
    
    return pendingTransfers.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error getting pending transfers:', error);
    throw new Error(`Failed to get pending transfers: ${error.message}`);
  }
};

/**
 * Check if a transfer has been claimed
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} transferHash - Transfer hash
 * @returns {Promise<boolean>} True if claimed
 */
export const checkIfTransferClaimed = async (contract, transferHash) => {
  try {
    // This is a simplified check - in a real implementation, you'd need to
    // check the actual claim events or contract state
    const claimFilter = contract.filters.Claimed();
    const claimEvents = await contract.queryFilter(claimFilter);
    
    // Check if any claim event references this transfer
    for (const event of claimEvents) {
      if (event.transactionHash === transferHash) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if transfer claimed:', error);
    return false;
  }
};

/**
 * Get block timestamp
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {number} blockNumber - Block number
 * @returns {Promise<number>} Block timestamp
 */
export const getBlockTimestamp = async (provider, blockNumber) => {
  try {
    const block = await provider.getBlock(blockNumber);
    return block.timestamp;
  } catch (error) {
    console.error('Error getting block timestamp:', error);
    return Date.now() / 1000; // Fallback to current time
  }
};

/**
 * Claim a transfer using assistant contract
 * @param {ethers.Contract} assistantContract - Assistant contract instance
 * @param {Object} transfer - Transfer object
 * @param {string} claimerAddress - Claimer address
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const claimTransfer = async (assistantContract, transfer, claimerAddress) => {
  try {
    const { destinationAddress, data, amount, reward } = transfer;
    const amountWei = ethers.utils.parseEther(amount);
    const rewardWei = ethers.utils.parseEther(reward);
    
    let tx;
    
    if (transfer.type === 'export') {
      // Claim export transfer
      tx = await assistantContract.claim(destinationAddress, data, amountWei, rewardWei);
    } else {
      // Claim import transfer
      tx = await assistantContract.claim(destinationAddress, data, amountWei, rewardWei);
    }
    
    return await tx.wait();
  } catch (error) {
    console.error('Error claiming transfer:', error);
    throw new Error(`Failed to claim transfer: ${error.message}`);
  }
};

/**
 * Get assistant contract for a bridge
 * @param {ethers.Contract} bridgeContract - Bridge contract instance
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantFactoryAddress - Assistant factory address
 * @returns {Promise<ethers.Contract|null>} Assistant contract or null
 */
export const getAssistantContract = async (bridgeContract, provider, assistantFactoryAddress) => {
  try {
    const factoryContract = new ethers.Contract(assistantFactoryAddress, ASSISTANT_FACTORY_ABI, provider);
    
    const bridgeAddress = bridgeContract.address;
    let assistantAddress;
    
    // Try to get export assistant first
    try {
      assistantAddress = await factoryContract.getExportAssistant(bridgeAddress);
    } catch (error) {
      // If not found, try import assistant
      try {
        assistantAddress = await factoryContract.getImportAssistant(bridgeAddress);
      } catch (error2) {
        return null;
      }
    }
    
    if (assistantAddress === ethers.constants.AddressZero) {
      return null;
    }
    
    // Determine which ABI to use based on the bridge contract
    const is3DPass = await is3DPassContract(bridgeContract);
    const abi = is3DPass ? EXPORT_ASSISTANT_ABI : EXPORT_ASSISTANT_ABI; // Use same ABI for now
    
    return new ethers.Contract(assistantAddress, abi, provider);
  } catch (error) {
    console.error('Error getting assistant contract:', error);
    return null;
  }
};

/**
 * Get transfer status
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} transferHash - Transfer hash
 * @returns {Promise<Object>} Transfer status
 */
export const getTransferStatus = async (contract, transferHash) => {
  try {
    const receipt = await contract.provider.getTransactionReceipt(transferHash);
    
    if (!receipt) {
      return { status: 'pending', confirmed: false };
    }
    
    if (receipt.status === 0) {
      return { status: 'failed', confirmed: true, error: 'Transaction failed' };
    }
    
    // Check if transfer has been claimed
    const isClaimed = await checkIfTransferClaimed(contract, transferHash);
    
    return {
      status: isClaimed ? 'claimed' : 'confirmed',
      confirmed: true,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (error) {
    console.error('Error getting transfer status:', error);
    return { status: 'unknown', confirmed: false, error: error.message };
  }
}; 

/**
 * Get claim details for a specific claim number
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {number} claimNum - Claim number
 * @returns {Promise<Object|null>} Claim details or null if not found
 */
export const getClaimDetails = async (contract, claimNum) => {
  try {
    // First check if the claim exists by checking stakes
    const testAccount = "0x0000000000000000000000000000000000000000";
    const accountYesStake = await contract.stakes(claimNum, 0, testAccount); // 0 = YES
    const accountNoStake = await contract.stakes(claimNum, 1, testAccount);   // 1 = NO
    
    if (accountYesStake.eq(0) && accountNoStake.eq(0)) {
      return null; // Claim doesn't exist
    }

    // Get claim details using low-level call to handle the struct return
    const encodedData = contract.interface.encodeFunctionData('getClaim(uint256)', [claimNum]);
    const result = await contract.provider.call({
      to: contract.address,
      data: encodedData
    });
    
    // Decode the result
    const decodedResult = contract.interface.decodeFunctionResult('getClaim(uint256)', result);
    
    if (decodedResult && decodedResult.length > 0) {
      const claimData = decodedResult[0];
      return {
        claimNum,
        amount: claimData.amount,
        recipientAddress: claimData.recipient_address,
        data: claimData.data,
        expiryTs: claimData.expiry_ts,
        currentOutcome: claimData.current_outcome,
        yesStake: claimData.yes_stake,
        noStake: claimData.no_stake,
        finished: claimData.finished,
        withdrawn: claimData.withdrawn
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting claim details:', error);
    return null;
  }
};

/**
 * Get all claims for a contract (up to a limit)
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {number} limit - Maximum number of claims to fetch (default: 100)
 * @returns {Promise<Array>} Array of claim details
 */
export const getAllClaims = async (contract, limit = 100) => {
  try {
    const lastClaimNum = await contract.last_claim_num();
    const claims = [];
    
    // Start from the most recent claims and work backwards
    const startClaim = Math.max(1, lastClaimNum.toNumber() - limit + 1);
    const endClaim = lastClaimNum.toNumber();
    
    for (let claimNum = endClaim; claimNum >= startClaim; claimNum--) {
      const claimDetails = await getClaimDetails(contract, claimNum);
      if (claimDetails) {
        claims.push(claimDetails);
      }
    }
    
    return claims;
  } catch (error) {
    console.error('Error getting all claims:', error);
    return [];
  }
};

/**
 * Get claims for a specific recipient address
 * @param {ethers.Contract} contract - Counterstake contract instance
 * @param {string} recipientAddress - Recipient address to filter by
 * @param {number} limit - Maximum number of claims to fetch (default: 100)
 * @returns {Promise<Array>} Array of claim details for the recipient
 */
export const getClaimsForRecipient = async (contract, recipientAddress, limit = 100) => {
  try {
    const allClaims = await getAllClaims(contract, limit);
    return allClaims.filter(claim => 
      claim.recipientAddress.toLowerCase() === recipientAddress.toLowerCase()
    );
  } catch (error) {
    console.error('Error getting claims for recipient:', error);
    return [];
  }
};

/**
 * Create a Counterstake contract instance
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @param {string} contractAddress - Contract address
 * @returns {Promise<ethers.Contract>} Counterstake contract instance
 */
export const createCounterstakeContract = async (providerOrSigner, contractAddress) => {
  const { COUNTERSTAKE_ABI } = await import('../contracts/abi');
  return new ethers.Contract(contractAddress, COUNTERSTAKE_ABI, providerOrSigner);
}; 