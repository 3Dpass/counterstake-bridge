import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  connectWallet,
  getCurrentAccount,
  getCurrentNetwork,
  onAccountsChanged,
  onChainChanged,
  removeListeners,
} from '../utils/web3';
import { getNetworkById } from '../config/networks';

const Web3Context = createContext();

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
};

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [network, setNetwork] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  // Initialize Web3 connection
  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const { account: connectedAccount, provider: connectedProvider } = await connectWallet();
      const connectedSigner = connectedProvider.getSigner();
      const currentNetwork = await getCurrentNetwork();
      
      setAccount(connectedAccount);
      setProvider(connectedProvider);
      setSigner(connectedSigner);
      setNetwork(currentNetwork);
      setIsConnected(true);
      
      // Store connection state
      localStorage.setItem('web3Connected', 'true');
      
    } catch (err) {
      setError(err.message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setNetwork(null);
    setIsConnected(false);
    setError(null);
    
    // Clear connection state
    localStorage.removeItem('web3Connected');
  }, []);

  // Switch network
  const switchNetwork = async (networkId) => {
    if (!window.ethereum) {
      setError('MetaMask is not installed');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${networkId.toString(16)}` }],
      });
      
      // Update network state
      const newNetwork = getNetworkById(networkId);
      setNetwork(newNetwork);
      
    } catch (switchError) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        const targetNetwork = getNetworkById(networkId);
        if (!targetNetwork) {
          setError('Unsupported network');
          return;
        }

        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${networkId.toString(16)}`,
              chainName: targetNetwork.name,
              nativeCurrency: targetNetwork.nativeCurrency,
              rpcUrls: [targetNetwork.rpcUrl],
              blockExplorerUrls: [targetNetwork.explorer],
            }],
          });
          
          // Update network state
          setNetwork(targetNetwork);
          
        } catch (addError) {
          setError('Failed to add network to MetaMask');
        }
      } else {
        setError('Failed to switch network');
      }
    }
  };

  // Handle account changes
  const handleAccountsChanged = useCallback(async (accounts) => {
    if (accounts.length === 0) {
      // MetaMask is locked or the user has not connected any accounts
      disconnect();
    } else if (accounts[0] !== account) {
      // Update the account
      setAccount(accounts[0]);
    }
  }, [account, disconnect]);

  // Handle network changes
  const handleChainChanged = async (chainId) => {
    const networkId = parseInt(chainId, 16);
    const newNetwork = getNetworkById(networkId);
    setNetwork(newNetwork);
    
    // Reload the page to ensure everything is in sync
    window.location.reload();
  };

  // Check if wallet is connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        const currentAccount = await getCurrentAccount();
        const currentNetwork = await getCurrentNetwork();
        
        if (currentAccount && currentNetwork) {
          const connectedProvider = new ethers.providers.Web3Provider(window.ethereum);
          const connectedSigner = connectedProvider.getSigner();
          
          setAccount(currentAccount);
          setProvider(connectedProvider);
          setSigner(connectedSigner);
          setNetwork(currentNetwork);
          setIsConnected(true);
        }
      }
    };

    checkConnection();
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (window.ethereum) {
      onAccountsChanged(handleAccountsChanged);
      onChainChanged(handleChainChanged);
    }

    return () => {
      removeListeners();
    };
  }, [handleAccountsChanged]);

  // Auto-connect if previously connected
  useEffect(() => {
    const wasConnected = localStorage.getItem('web3Connected');
    if (wasConnected && !isConnected && !isConnecting) {
      connect();
    }
  }, [isConnected, isConnecting]);

  const value = {
    // State
    account,
    provider,
    signer,
    network,
    isConnecting,
    isConnected,
    error,
    
    // Actions
    connect,
    disconnect,
    switchNetwork,
    
    // Utilities
    formatAddress: (address) => {
      if (!address) return '';
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    },
    
    isSupportedNetwork: (networkId) => {
      return getNetworkById(networkId) !== undefined;
    },
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}; 