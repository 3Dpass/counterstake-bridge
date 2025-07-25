import { ethers } from 'ethers';
import { getNetworkById } from '../config/networks';

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
export const getTokenBalance = async (provider, tokenAddress, account, decimals = 18, isPrecompile = false) => {
  try {
    if (tokenAddress === ethers.constants.AddressZero && !isPrecompile) {
      // Native token balance (for non-3DPass networks)
      const balance = await provider.getBalance(account);
      return ethers.utils.formatEther(balance);
    } else {
      // ERC20 token balance (including 3DPass precompiles)
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await tokenContract.balanceOf(account);
      return ethers.utils.formatUnits(balance, decimals);
    }
  } catch (error) {
    console.error('Error getting token balance:', error);
    return '0';
  }
};

// Get token allowance
export const getTokenAllowance = async (provider, tokenAddress, owner, spender, decimals = 18, isPrecompile = false) => {
  try {
    if (tokenAddress === ethers.constants.AddressZero && !isPrecompile) {
      // Native tokens don't need allowance (for non-3DPass networks)
      return ethers.constants.MaxUint256;
    } else {
      // ERC20 allowance (including 3DPass precompiles)
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function allowance(address,address) view returns (uint256)'],
        provider
      );
      const allowance = await tokenContract.allowance(owner, spender);
      return ethers.utils.formatUnits(allowance, decimals);
    }
  } catch (error) {
    console.error('Error getting token allowance:', error);
    return '0';
  }
};

// Approve token spending
export const approveToken = async (signer, tokenAddress, spender, amount, decimals = 18, isPrecompile = false) => {
  try {
    if (tokenAddress === ethers.constants.AddressZero && !isPrecompile) {
      // Native tokens don't need approval (for non-3DPass networks)
      return null;
    }

    // For 3DPass precompiles, we need approval
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        'function approve(address,uint256) returns (bool)',
        'function allowance(address,address) view returns (uint256)'
      ],
      signer
    );

    const amountWei = ethers.utils.parseUnits(amount, decimals);
    const tx = await tokenContract.approve(spender, amountWei);
    return await tx.wait();
  } catch (error) {
    throw new Error('Failed to approve token: ' + error.message);
  }
};

// Format address for display
export const formatAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Format amount with decimals
export const formatAmount = (amount, decimals = 18) => {
  if (!amount) return '0';
  
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  
  if (num < 0.000001) {
    return num.toExponential(6);
  }
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
};

// Validate address
export const isValidAddress = (address) => {
  return ethers.utils.isAddress(address);
};

// Validate amount
export const isValidAmount = (amount) => {
  if (!amount || amount <= 0) return false;
  return !isNaN(parseFloat(amount));
};

// Get gas estimate
export const estimateGas = async (contract, method, ...args) => {
  try {
    const gasEstimate = await contract.estimateGas[method](...args);
    return gasEstimate.mul(120).div(100); // Add 20% buffer
  } catch (error) {
    console.error('Error estimating gas:', error);
    throw new Error('Failed to estimate gas: ' + error.message);
  }
};

// Wait for transaction
export const waitForTransaction = async (txHash, provider) => {
  try {
    const receipt = await provider.waitForTransaction(txHash);
    return receipt;
  } catch (error) {
    throw new Error('Transaction failed: ' + error.message);
  }
};

// Listen for account changes
export const onAccountsChanged = (callback) => {
  if (!window.ethereum) return;
  
  window.ethereum.on('accountsChanged', callback);
};

// Listen for network changes
export const onChainChanged = (callback) => {
  if (!window.ethereum) return;
  
  window.ethereum.on('chainChanged', callback);
};

// Remove listeners
export const removeListeners = () => {
  if (!window.ethereum) return;
  
  window.ethereum.removeAllListeners('accountsChanged');
  window.ethereum.removeAllListeners('chainChanged');
}; 