import { ethers } from 'ethers';
import { THREEDPASS_PRECOMPILE_ABI } from '../contracts/abi';

// 3DPass specific utility functions for ERC20 precompile interactions

/**
 * Get token metadata from 3DPass ERC20 precompile
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @returns {Promise<Object>} Token metadata
 */
export const get3DPassTokenMetadata = async (provider, tokenAddress) => {
  try {
    const contract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, provider);
    
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
      contract.totalSupply()
    ]);

    return {
      name,
      symbol,
      decimals,
      totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
      address: tokenAddress
    };
  } catch (error) {
    console.error('Error getting 3DPass token metadata:', error);
    throw new Error(`Failed to get token metadata for ${tokenAddress}: ${error.message}`);
  }
};

/**
 * Get balance for any 3DPass token (including P3D)
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} account - Account address
 * @returns {Promise<string>} Formatted balance
 */
export const get3DPassTokenBalance = async (provider, tokenAddress, account) => {
  try {
    const contract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, provider);
    const balance = await contract.balanceOf(account);
    
    // Get decimals to format properly
    const decimals = await contract.decimals();
    return ethers.utils.formatUnits(balance, decimals);
  } catch (error) {
    console.error('Error getting 3DPass token balance:', error);
    return '0';
  }
};

/**
 * Transfer 3DPass tokens using ERC20 precompile
 * @param {ethers.Signer} signer - Web3 signer
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} to - Recipient address
 * @param {string} amount - Amount to transfer
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const transfer3DPassToken = async (signer, tokenAddress, to, amount) => {
  try {
    const contract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, signer);
    
    // Get decimals to parse amount correctly
    const decimals = await contract.decimals();
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    
    const tx = await contract.transfer(to, amountWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error transferring 3DPass token:', error);
    throw new Error(`Failed to transfer token: ${error.message}`);
  }
};

/**
 * Approve 3DPass tokens for spending
 * @param {ethers.Signer} signer - Web3 signer
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} spender - Spender address
 * @param {string} amount - Amount to approve
 * @returns {Promise<ethers.ContractReceipt>} Transaction receipt
 */
export const approve3DPassToken = async (signer, tokenAddress, spender, amount) => {
  try {
    const contract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, signer);
    
    // Get decimals to parse amount correctly
    const decimals = await contract.decimals();
    const amountWei = ethers.utils.parseUnits(amount, decimals);
    
    const tx = await contract.approve(spender, amountWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error approving 3DPass token:', error);
    throw new Error(`Failed to approve token: ${error.message}`);
  }
};

/**
 * Get allowance for 3DPass tokens
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @param {string} owner - Owner address
 * @param {string} spender - Spender address
 * @returns {Promise<string>} Formatted allowance
 */
export const get3DPassTokenAllowance = async (provider, tokenAddress, owner, spender) => {
  try {
    const contract = new ethers.Contract(tokenAddress, THREEDPASS_PRECOMPILE_ABI, provider);
    const allowance = await contract.allowance(owner, spender);
    
    // Get decimals to format properly
    const decimals = await contract.decimals();
    return ethers.utils.formatUnits(allowance, decimals);
  } catch (error) {
    console.error('Error getting 3DPass token allowance:', error);
    return '0';
  }
};

/**
 * Check if address is a valid 3DPass ERC20 precompile
 * @param {string} address - Address to check
 * @returns {boolean} True if valid precompile
 */
export const is3DPassPrecompile = (address) => {
  const precompileAddresses = [
    '0x0000000000000000000000000000000000000802', // P3D
    '0xfBFBfbFA000000000000000000000000000000de', // wUSDT
    '0xFbfbFBfA0000000000000000000000000000006f', // wUSDC
    '0xFbFBFBfA0000000000000000000000000000014D', // wBUSD
  ];
  
  return precompileAddresses.includes(address.toLowerCase());
};

/**
 * Get asset ID from precompile address (for substrate interactions)
 * @param {string} address - Precompile address
 * @returns {number|null} Asset ID or null if not found
 */
export const getAssetIdFromPrecompile = (address) => {
  const assetMap = {
    '0x0000000000000000000000000000000000000802': null, // P3D (native, no asset ID)
    '0xfBFBfbFA000000000000000000000000000000de': 222,  // wUSDT
    '0xFbfbFBfA0000000000000000000000000000006f': 223,  // wUSDC
    '0xFbFBFBfA0000000000000000000000000000014D': 224,  // wBUSD
  };
  
  return assetMap[address.toLowerCase()] || null;
};

/**
 * Validate 3DPass transaction parameters
 * @param {Object} params - Transaction parameters
 * @returns {Object} Validation result
 */
export const validate3DPassTransaction = (params) => {
  const { tokenAddress, amount, to } = params;
  const errors = [];

  if (!is3DPassPrecompile(tokenAddress)) {
    errors.push('Invalid 3DPass precompile address');
  }

  if (!ethers.utils.isAddress(to)) {
    errors.push('Invalid recipient address');
  }

  if (!amount || parseFloat(amount) <= 0) {
    errors.push('Invalid amount');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get all available 3DPass tokens with metadata
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @returns {Promise<Array>} Array of token objects with metadata
 */
export const getAll3DPassTokens = async (provider) => {
  const tokenAddresses = [
    '0x0000000000000000000000000000000000000802', // P3D
    '0xfBFBfbFA000000000000000000000000000000de', // wUSDT
    '0xFbfbFBfA0000000000000000000000000000006f', // wUSDC
    '0xFbFBFBfA0000000000000000000000000000014D', // wBUSD
  ];

  const tokens = [];
  
  for (const address of tokenAddresses) {
    try {
      const metadata = await get3DPassTokenMetadata(provider, address);
      tokens.push({
        ...metadata,
        address,
        isPrecompile: true,
        assetId: getAssetIdFromPrecompile(address)
      });
    } catch (error) {
      console.warn(`Failed to get metadata for ${address}:`, error.message);
    }
  }

  return tokens;
}; 