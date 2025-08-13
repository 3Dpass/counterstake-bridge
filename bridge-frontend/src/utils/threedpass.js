import { ethers } from 'ethers';
import { IP3D_ABI, IPRECOMPILE_ERC20_ABI } from '../contracts/abi';
import { P3D_PRECOMPILE_ADDRESS, NETWORKS } from '../config/networks';

// 3DPass specific utility functions for ERC20 precompile interactions

/**
 * Get the appropriate ABI for a 3DPass token
 * @param {string} tokenAddress - Token address
 * @returns {Array} Contract ABI
 */
export const get3DPassTokenABI = (tokenAddress) => {
  if (tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return IP3D_ABI;
  }
  return IPRECOMPILE_ERC20_ABI;
};

/**
 * Get token metadata from 3DPass ERC20 precompile
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @param {string} tokenAddress - ERC20 precompile address
 * @returns {Promise<Object>} Token metadata
 */
export const get3DPassTokenMetadata = async (provider, tokenAddress) => {
  try {
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    
    let decimals;
    // Try to get decimals from network configuration first
    const configDecimals = getTokenDecimalsFromConfig(tokenAddress);
    if (configDecimals !== null) {
      decimals = configDecimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for metadata, using default:', error);
        decimals = 18; // fallback
      }
    }
    
    const [name, symbol, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply()
    ]);

    return {
      name,
      symbol,
      decimals,
      totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
      address: tokenAddress,
      isPrecompile: true,
      isNative: tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase(),
      assetId: getAssetIdFromPrecompile(tokenAddress)
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
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    const balance = await contract.balanceOf(account);
    
    // Get decimals to format properly
    let decimals;
    // Try to get decimals from network configuration first
    const configDecimals = getTokenDecimalsFromConfig(tokenAddress);
    if (configDecimals !== null) {
      decimals = configDecimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile, using default:', error);
        decimals = 18; // fallback
      }
    }
    
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
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, signer);
    
    // Get decimals to parse amount correctly
    let decimals;
    // Try to get decimals from network configuration first
    const configDecimals = getTokenDecimalsFromConfig(tokenAddress);
    if (configDecimals !== null) {
      decimals = configDecimals;
    } else {
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for transfer, using default:', error);
        decimals = 18; // fallback
      }
    }
    
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
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, signer);
    
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
    const abi = get3DPassTokenABI(tokenAddress);
    const contract = new ethers.Contract(tokenAddress, abi, provider);
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
  if (!address) return false;
  
  // P3D precompile
  if (address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return true;
  }
  
  // Other 3DPass ERC20 precompiles (start with 0xFBFBFBFA)
  return address.toLowerCase().startsWith('0xfbfbfbfa');
};

/**
 * Check if address is specifically the P3D precompile
 * @param {string} address - Address to check
 * @returns {boolean} True if P3D precompile
 */
export const isP3DPrecompile = (address) => {
  return address && address.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
};

/**
 * Get asset ID from precompile address (for substrate interactions)
 * @param {string} address - Precompile address
 * @returns {number|null} Asset ID or null if not found
 */
export const getAssetIdFromPrecompile = (address) => {
  if (!address) return null;
  
  const assetMap = {
    [P3D_PRECOMPILE_ADDRESS.toLowerCase()]: null, // P3D (native, no asset ID)
    '0xfbfbfbfa000000000000000000000000000000de': 222,  // wUSDT
    '0xfbfbfbfa0000000000000000000000000000006f': 223,  // wUSDC
    '0xfbfbfbfa0000000000000000000000000000014d': 224,  // wBUSD
    '0xfbfbfbfa000000000000000000000000000001bc': 444,  // FIRE
    '0xfbfbfbfa0000000000000000000000000000022b': 555,  // WATER
  };
  
  return assetMap[address.toLowerCase()] || null;
};

/**
 * Get precompile address from asset ID
 * @param {number} assetId - Asset ID
 * @returns {string|null} Precompile address or null if not found
 */
export const getPrecompileFromAssetId = (assetId) => {
  const assetMap = {
    222: '0xfBFBfbFA000000000000000000000000000000de',  // wUSDT
    223: '0xFbfbFBfA0000000000000000000000000000006f',  // wUSDC
    224: '0xFbFBFBfA0000000000000000000000000000014D',  // wBUSD
    444: '0xFbfBFBfA000000000000000000000000000001bC',  // FIRE
    555: '0xfBFBFBfa0000000000000000000000000000022b',  // WATER
  };
  
  return assetMap[assetId] || null;
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
 * Get P3D precompile metadata using IP3D interface
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @returns {Promise<Object>} P3D token metadata
 */
export const getP3DPrecompileMetadata = async (provider) => {
  try {
    const contract = new ethers.Contract(P3D_PRECOMPILE_ADDRESS, IP3D_ABI, provider);
    
    // Get P3D decimals from network configuration
    const decimals = getTokenDecimalsFromConfig(P3D_PRECOMPILE_ADDRESS);
    
    const [name, symbol, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply()
    ]);

    return {
      name,
      symbol,
      decimals,
      totalSupply: ethers.utils.formatUnits(totalSupply, decimals),
      address: P3D_PRECOMPILE_ADDRESS,
      isPrecompile: true,
      isNative: true,
      assetId: null // P3D is native, no asset ID
    };
  } catch (error) {
    console.error('Error getting P3D precompile metadata:', error);
    throw new Error(`Failed to get P3D metadata: ${error.message}`);
  }
};

/**
 * Get all available 3DPass tokens with metadata
 * @param {ethers.providers.Provider} provider - Web3 provider
 * @returns {Promise<Array>} Array of token objects with metadata
 */
export const getAll3DPassTokens = async (provider) => {
  const tokenAddresses = [
    P3D_PRECOMPILE_ADDRESS, // P3D
    '0xfBFBfbFA000000000000000000000000000000de', // wUSDT
    '0xFbfbFBfA0000000000000000000000000000006f', // wUSDC
    '0xFbFBFBfA0000000000000000000000000000014D', // wBUSD
    '0xFbfBFBfA000000000000000000000000000001bC', // FIRE
    '0xfBFBFBfa0000000000000000000000000000022b', // WATER
  ];

  const tokens = [];
  
  for (const address of tokenAddresses) {
    try {
      const metadata = await get3DPassTokenMetadata(provider, address);
      tokens.push(metadata);
    } catch (error) {
      console.warn(`Failed to get metadata for ${address}:`, error.message);
    }
  }

  return tokens;
};

/**
 * Get P3D precompile address constant
 * @returns {string} P3D precompile address
 */
export const getP3DPrecompileAddress = () => {
  return P3D_PRECOMPILE_ADDRESS;
};

/**
 * Check if a token is a 3DPass native token (P3D)
 * @param {string} tokenAddress - Token address
 * @returns {boolean} True if native token
 */
export const is3DPassNativeToken = (tokenAddress) => {
  return tokenAddress && tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
};

/**
 * Get token symbol from precompile address
 * @param {string} address - Precompile address
 * @returns {string|null} Token symbol or null if not found
 */
export const getTokenSymbolFromPrecompile = (address) => {
  if (!address) return null;
  
  const symbolMap = {
    [P3D_PRECOMPILE_ADDRESS.toLowerCase()]: 'P3D',
    '0xfbfbfbfa000000000000000000000000000000de': 'wUSDT',
    '0xfbfbfbfa0000000000000000000000000000006f': 'wUSDC',
    '0xfbfbfbfa0000000000000000000000000000014d': 'wBUSD',
    '0xfbfbfbfa000000000000000000000000000001bc': 'FIRE',
    '0xfbfbfbfa0000000000000000000000000000022b': 'WATER',
  };
  
  return symbolMap[address.toLowerCase()] || null;
};

/**
 * Get token decimals from network configuration
 * @param {string} tokenAddress - Token address
 * @returns {number|null} Token decimals or null if not found
 */
export const getTokenDecimalsFromConfig = (tokenAddress) => {
  if (!tokenAddress) return null;
  
  const address = tokenAddress.toLowerCase();
  const tokens = NETWORKS.THREEDPASS.tokens;
  
  // Check if it's P3D
  if (address === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return tokens.P3D.decimals;
  }
  
  // Check other tokens by address
  for (const [, token] of Object.entries(tokens)) {
    if (token.address.toLowerCase() === address) {
      return token.decimals;
    }
  }
  
  return null;
}; 