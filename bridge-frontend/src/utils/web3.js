import { ethers } from 'ethers';
import { getNetworkById } from '../config/networks';
import { P3D_PRECOMPILE_ADDRESS } from '../config/networks';
import { get3DPassTokenABI, is3DPassPrecompile, isP3DPrecompile } from './threedpass';

// MetaMask connection
export const connectWallet = async () => {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use this app.');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const account = accounts[0];
    
    // Create provider
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    
    return { account, provider };
  } catch (error) {
    throw new Error('Failed to connect wallet: ' + error.message);
  }
};

// Get current account
export const getCurrentAccount = async () => {
  if (!window.ethereum) return null;
  
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    return accounts[0] || null;
  } catch (error) {
    console.error('Error getting current account:', error);
    return null;
  }
};

// Get current network
export const getCurrentNetwork = async () => {
  if (!window.ethereum) return null;
  
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    const networkId = parseInt(chainId, 16);
    return getNetworkById(networkId);
  } catch (error) {
    console.error('Error getting current network:', error);
    return null;
  }
};

// Switch network
export const switchNetwork = async (networkId) => {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${networkId.toString(16)}` }],
    });
  } catch (switchError) {
    // This error code indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902) {
      const network = getNetworkById(networkId);
      if (!network) {
        throw new Error('Unsupported network');
      }

      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${networkId.toString(16)}`,
          chainName: network.name,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorer],
        }],
      });
    } else {
      throw switchError;
    }
  }
};

// Get token balance
export const getTokenBalance = async (provider, tokenAddress, account, decimals = 18) => {
  try {
    console.log('🔍 getTokenBalance called with:', { tokenAddress, account, decimals });
    
    if (!tokenAddress || tokenAddress === ethers.constants.AddressZero) {
      // Native token balance
      const balance = await provider.getBalance(account);
      const formattedBalance = ethers.utils.formatEther(balance);
      console.log('💰 Native token balance:', formattedBalance);
      return formattedBalance.toString();
    } else {
      // ERC20 token balance (including 3DPass precompiles)
      let abi;
      
      if (is3DPassPrecompile(tokenAddress)) {
        // Use appropriate ABI for 3DPass precompiles
        abi = get3DPassTokenABI(tokenAddress);
        console.log('🔍 Using 3DPass precompile ABI for:', tokenAddress);
      } else {
        // Standard ERC20 ABI
        abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
        console.log('🔍 Using standard ERC20 ABI for:', tokenAddress);
      }
      
      const tokenContract = new ethers.Contract(tokenAddress, abi, provider);
      const balance = await tokenContract.balanceOf(account);
      
      // Get decimals dynamically for 3DPass precompiles
      let tokenDecimals = decimals;
      if (is3DPassPrecompile(tokenAddress)) {
        try {
          tokenDecimals = await tokenContract.decimals();
          console.log('🔍 3DPass precompile decimals from contract:', tokenDecimals);
        } catch (error) {
          console.warn('⚠️ Failed to get decimals from 3DPass precompile, using configured value:', decimals);
          tokenDecimals = decimals;
        }
      }
      
      const formattedBalance = ethers.utils.formatUnits(balance, tokenDecimals);
      console.log('💰 ERC20 token balance:', formattedBalance);
      return formattedBalance.toString();
    }
  } catch (error) {
    console.error('Error getting token balance:', error);
    return '0';
  }
};

// Get token allowance
export const getTokenAllowance = async (provider, tokenAddress, owner, spender, decimals = 18) => {
  try {
    if (!tokenAddress || tokenAddress === ethers.constants.AddressZero) {
      return '0'; // Native tokens don't have allowance
    }
    
    let abi;
    
    if (is3DPassPrecompile(tokenAddress)) {
      // Use appropriate ABI for 3DPass precompiles
      abi = get3DPassTokenABI(tokenAddress);
    } else {
      // Standard ERC20 ABI
      abi = ['function allowance(address,address) view returns (uint256)', 'function decimals() view returns (uint8)'];
    }
    
    const tokenContract = new ethers.Contract(tokenAddress, abi, provider);
    const allowance = await tokenContract.allowance(owner, spender);
    
    // Get decimals dynamically for 3DPass precompiles
    let tokenDecimals = decimals;
    if (is3DPassPrecompile(tokenAddress)) {
      try {
        tokenDecimals = await tokenContract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for allowance, using configured value:', decimals);
        tokenDecimals = decimals;
      }
    }
    
    return ethers.utils.formatUnits(allowance, tokenDecimals);
  } catch (error) {
    console.error('Error getting token allowance:', error);
    return '0';
  }
};

// Approve token spending
export const approveToken = async (signer, tokenAddress, spender, amount, decimals = 18) => {
  try {
    if (!tokenAddress || tokenAddress === ethers.constants.AddressZero) {
      throw new Error('Cannot approve native token');
    }
    
    let abi;
    
    if (is3DPassPrecompile(tokenAddress)) {
      // Use appropriate ABI for 3DPass precompiles
      abi = get3DPassTokenABI(tokenAddress);
    } else {
      // Standard ERC20 ABI
      abi = ['function approve(address,uint256) returns (bool)', 'function decimals() view returns (uint8)'];
    }
    
    const tokenContract = new ethers.Contract(tokenAddress, abi, signer);
    
    // Get decimals dynamically for 3DPass precompiles
    let tokenDecimals = decimals;
    if (is3DPassPrecompile(tokenAddress)) {
      try {
        tokenDecimals = await tokenContract.decimals();
      } catch (error) {
        console.warn('⚠️ Failed to get decimals from 3DPass precompile for approval, using configured value:', decimals);
        tokenDecimals = decimals;
      }
    }
    
    const amountWei = ethers.utils.parseUnits(amount, tokenDecimals);
    const tx = await tokenContract.approve(spender, amountWei);
    return await tx.wait();
  } catch (error) {
    console.error('Error approving token:', error);
    throw new Error(`Failed to approve token: ${error.message}`);
  }
};

// Format address for display
export const formatAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Format amount with proper decimals
export const formatAmount = (amount, decimals = 18) => {
  try {
    if (!amount || amount === '0') return '0';
    
    const num = parseFloat(amount);
    if (isNaN(num)) return '0';
    
    // Format based on size
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    } else if (num < 0.01 && num > 0) {
      return num.toExponential(2);
    } else {
      return num.toFixed(4);
    }
  } catch (error) {
    console.error('Error formatting amount:', error);
    return '0';
  }
};

// Validate Ethereum address
export const isValidAddress = (address) => {
  return ethers.utils.isAddress(address);
};

// Validate amount
export const isValidAmount = (amount) => {
  if (!amount) return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
};

// Estimate gas for transaction
export const estimateGas = async (contract, method, ...args) => {
  try {
    const gasEstimate = await contract.estimateGas[method](...args);
    return gasEstimate;
  } catch (error) {
    console.error('Error estimating gas:', error);
    throw new Error(`Failed to estimate gas: ${error.message}`);
  }
};

// Wait for transaction confirmation
export const waitForTransaction = async (txHash, provider) => {
  try {
    const receipt = await provider.waitForTransaction(txHash);
    return receipt;
  } catch (error) {
    console.error('Error waiting for transaction:', error);
    throw new Error(`Failed to wait for transaction: ${error.message}`);
  }
};

// Listen for account changes
export const onAccountsChanged = (callback) => {
  if (!window.ethereum) return;
  
  window.ethereum.on('accountsChanged', callback);
};

// Listen for chain changes
export const onChainChanged = (callback) => {
  if (!window.ethereum) return;
  
  window.ethereum.on('chainChanged', callback);
};

// Remove event listeners
export const removeListeners = () => {
  if (!window.ethereum) return;
  
  window.ethereum.removeAllListeners();
};

// Check if current network is 3DPass
export const is3DPassNetwork = async () => {
  const network = await getCurrentNetwork();
  return network && network.symbol === '3DPass';
};

// Get P3D precompile address
export const getP3DPrecompileAddress = () => {
  return P3D_PRECOMPILE_ADDRESS;
};

// Check if token is P3D precompile
export const isP3DToken = (tokenAddress) => {
  return isP3DPrecompile(tokenAddress);
};

// Get token metadata
export const getTokenMetadata = async (provider, tokenAddress) => {
  try {
    if (!tokenAddress || tokenAddress === ethers.constants.AddressZero) {
      return {
        name: 'Native Token',
        symbol: 'NATIVE',
        decimals: 18,
        isNative: true,
        isPrecompile: false
      };
    }
    
    if (is3DPassPrecompile(tokenAddress)) {
      // Use 3DPass specific function
      const { get3DPassTokenMetadata } = await import('./threedpass');
      return await get3DPassTokenMetadata(provider, tokenAddress);
    } else {
      // Standard ERC20 token
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
        isNative: false,
        isPrecompile: false
      };
    }
  } catch (error) {
    console.error('Error getting token metadata:', error);
    throw new Error(`Failed to get token metadata: ${error.message}`);
  }
}; 