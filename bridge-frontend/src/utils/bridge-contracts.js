import { ethers } from 'ethers';
import { 
  EXPORT_ABI,
  EXPORT_3DPASS_ABI, 
  IMPORT_ABI,
  IMPORT_3DPASS_ABI, 
  THREEDPASS_PRECOMPILE_ABI,
  EXPORT_ASSISTANT_ABI
} from '../contracts/abi';

// 3DPass Bridge Contract Utilities

/**
 * Get the appropriate ABI for a network
 * @param {string} networkSymbol - Network symbol (ETH, BSC, 3DPass)
 * @param {string} contractType - 'export' or 'import'
 * @returns {Array} Contract ABI
 */
export const getContractABI = (networkSymbol, contractType) => {
  if (networkSymbol === '3DPass') {
    return contractType === 'export' ? EXPORT_3DPASS_ABI : IMPORT_3DPASS_ABI;
  }
  // For other networks, use standard ABIs
  return contractType === 'export' ? EXPORT_ABI : IMPORT_ABI;
};

/**
 * Create bridge contract instance
 * @param {ethers.providers.Provider|ethers.Signer} providerOrSigner - Provider or signer
 * @param {string} contractAddress - Contract address
 * @param {string} networkSymbol - Network symbol
 * @param {string} contractType - 'export' or 'import'
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
 * @param {number} decimals - Token decimals
 * @returns {Promise<string>} Required stake amount
 */
export const getRequiredStake = async (contract, amount, decimals = 18) => {
  try {
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    const requiredStakeWei = await contract.getRequiredStake(amountWei);
    return ethers.utils.formatUnits(requiredStakeWei, decimals);
  } catch (error) {
    console.error('Error getting required stake:', error);
    throw new Error(`Failed to get required stake: ${error.message}`);
  }
};

/**
 * Initiate transfer to foreign chain (Export)
 * @param {ethers.Contract} contract - Export contract instance
 * @param {string} foreignAddress - Destination address on foreign chain
 * @param {string} data - Additional data
 * @param {string} amount - Transfer amount
 * @param {string} reward - Optional reward for assistants
 * @param {number} decimals - Token decimals
 * @param {boolean} isPrecompile - Whether token is a 3DPass precompile
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
    
    let tx;
    
    if (isPrecompile) {
      // For 3DPass precompiles, we need to approve first
      const tokenAddress = await contract.settings().then(settings => settings.tokenAddress);
      const tokenContract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, contract.signer);
      
      // Approve the export contract to spend tokens
      const approveTx = await tokenContract.approve(contract.address, amountWei);
      await approveTx.wait();
      
      // Now call transferToForeignChain (no ETH value for precompiles)
      tx = await contract.transferToForeignChain(foreignAddress, data, amountWei, rewardWei);
    } else {
      // For native tokens, send ETH value
      const value = await contract.settings().then(settings => {
        return settings.tokenAddress === ethers.constants.AddressZero ? amountWei : 0;
      });
      
      tx = await contract.transferToForeignChain(foreignAddress, data, amountWei, rewardWei, { value });
    }
    
    return await tx.wait();
  } catch (error) {
    console.error('Error transferring to foreign chain:', error);
    throw new Error(`Transfer failed: ${error.message}`);
  }
};

/**
 * Transfer to home chain (Import)
 * @param {ethers.Contract} contract - Import contract instance
 * @param {string} homeAddress - Destination address on home chain
 * @param {string} data - Additional data
 * @param {string} amount - Transfer amount
 * @param {string} reward - Optional reward for assistants
 * @param {number} decimals - Token decimals
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
    throw new Error(`Transfer failed: ${error.message}`);
  }
};

/**
 * Get bridge contract settings
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<Object>} Contract settings
 */
export const getBridgeSettings = async (contract) => {
  try {
    const settings = await contract.settings();
    return {
      tokenAddress: settings.tokenAddress,
      counterstakeCoef100: settings.counterstake_coef100,
      ratio100: settings.ratio100,
      minStake: settings.min_stake,
      largeThreshold: settings.large_threshold,
      challengingPeriods: settings.challenging_periods,
      largeChallengingPeriods: settings.large_challenging_periods,
    };
  } catch (error) {
    console.error('Error getting bridge settings:', error);
    throw new Error(`Failed to get settings: ${error.message}`);
  }
};

/**
 * Check if contract is 3DPass specific
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<boolean>} True if 3DPass contract
 */
export const is3DPassContract = async (contract) => {
  try {
    // Try to call P3D_PRECOMPILE() function which only exists in 3DPass contracts
    await contract.P3D_PRECOMPILE();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get token information for bridge contract
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @returns {Promise<Object>} Token information
 */
export const getBridgeTokenInfo = async (contract, provider) => {
  try {
    const settings = await contract.settings();
    const tokenAddress = settings.tokenAddress;
    
    // Check if it's a 3DPass contract
    const is3DPass = await is3DPassContract(contract);
    
    if (is3DPass && tokenAddress === '0x0000000000000000000000000000000000000802') {
      // P3D precompile
      const p3dContract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, provider);
      const [name, symbol, decimals] = await Promise.all([
        p3dContract.name(),
        p3dContract.symbol(),
        p3dContract.decimals()
      ]);
      
      return {
        address: tokenAddress,
        name,
        symbol,
        decimals,
        isPrecompile: true,
        isNative: true,
      };
    } else if (tokenAddress === ethers.constants.AddressZero) {
      // Native token (for non-3DPass networks)
      return {
        address: tokenAddress,
        name: 'Native Token',
        symbol: 'NATIVE',
        decimals: 18,
        isNative: true,
        isPrecompile: false,
      };
    } else {
      // ERC20 token
      const tokenContract = new ethers.Contract(tokenAddress, [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
      ], provider);
      
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);
      
      return {
        address: tokenAddress,
        name,
        symbol,
        decimals,
        isNative: false,
        isPrecompile: is3DPass, // All 3DPass tokens are precompiles
      };
    }
  } catch (error) {
    console.error('Error getting bridge token info:', error);
    throw new Error(`Failed to get token info: ${error.message}`);
  }
};

/**
 * Validate bridge transfer parameters
 * @param {Object} params - Transfer parameters
 * @param {ethers.Contract} contract - Bridge contract instance
 * @returns {Promise<Object>} Validation result
 */
export const validateBridgeTransfer = async (params, contract) => {
  const { amount, foreignAddress } = params;
  const errors = [];
  
  try {
    // Check if contract is 3DPass
    const is3DPass = await is3DPassContract(contract);
    
    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      errors.push('Invalid amount');
    }
    
    // Validate address
    if (!ethers.utils.isAddress(foreignAddress)) {
      errors.push('Invalid destination address');
    }
    
    // Get required stake
    const settings = await contract.settings();
    const decimals = is3DPass ? 18 : 18; // Default to 18, could be made dynamic
    const requiredStake = await getRequiredStake(contract, amount, decimals);
    
    return {
      isValid: errors.length === 0,
      errors,
      requiredStake,
      is3DPass,
      settings: {
        ratio100: settings.ratio100,
        minStake: settings.min_stake,
        tokenAddress: settings.tokenAddress,
      }
    };
  } catch (error) {
    errors.push(`Validation error: ${error.message}`);
    return {
      isValid: false,
      errors,
      requiredStake: '0',
      is3DPass: false,
      settings: null
    };
  }
};

// ===== CLAIMING FUNCTIONALITY =====

/**
 * Get pending transfers for claiming
 * @param {ethers.Contract} exportContract - Export contract instance
 * @param {ethers.Contract} importContract - Import contract instance
 * @param {string} userAddress - User's address
 * @returns {Promise<Array>} Array of pending transfers
 */
export const getPendingTransfers = async (exportContract, importContract, userAddress) => {
  try {
    const pendingTransfers = [];
    
    // Get export transfers (outgoing)
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
    
    // Get import transfers (incoming)
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
    
    return pendingTransfers.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error getting pending transfers:', error);
    throw new Error(`Failed to get pending transfers: ${error.message}`);
  }
};

/**
 * Check if a transfer has been claimed
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} transferHash - Transfer transaction hash
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
 * @param {string} claimerAddress - Address claiming the transfer
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
    throw new Error(`Claim failed: ${error.message}`);
  }
};

/**
 * Get assistant contract for a bridge contract
 * @param {ethers.Contract} bridgeContract - Bridge contract instance
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} assistantFactoryAddress - Assistant factory address
 * @returns {Promise<ethers.Contract|null>} Assistant contract instance or null
 */
export const getAssistantContract = async (bridgeContract, provider, assistantFactoryAddress) => {
  try {
    const factoryContract = new ethers.Contract(
      assistantFactoryAddress,
      ['function getExportAssistant(address) view returns (address)', 'function getImportAssistant(address) view returns (address)'],
      provider
    );
    
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
 * Get transfer status and details
 * @param {ethers.Contract} contract - Bridge contract instance
 * @param {string} transferHash - Transfer transaction hash
 * @returns {Promise<Object>} Transfer status and details
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