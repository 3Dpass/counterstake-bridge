import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { NETWORKS, getBridgeInstances, getAssistantContracts, P3D_PRECOMPILE_ADDRESS } from '../config/networks';

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize settings from localStorage or defaults
  const initializeSettings = useCallback(() => {
    try {
      const savedSettings = localStorage.getItem('bridgeSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      } else {
        // Initialize with default network config
        const defaultSettings = {};
        Object.keys(NETWORKS).forEach(networkKey => {
          const network = NETWORKS[networkKey];
          defaultSettings[networkKey] = {
            rpcUrl: network.rpcUrl,
            contracts: { ...network.contracts },
            tokens: { ...network.tokens },
            customRpc: false,
            customContracts: false,
            customTokens: false,
          };
        });
        setSettings(defaultSettings);
      }
      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing settings:', error);
      // Fallback to defaults
      const defaultSettings = {};
      Object.keys(NETWORKS).forEach(networkKey => {
        const network = NETWORKS[networkKey];
        defaultSettings[networkKey] = {
          rpcUrl: network.rpcUrl,
          contracts: { ...network.contracts },
          tokens: { ...network.tokens },
          customRpc: false,
          customContracts: false,
          customTokens: false,
        };
      });
      setSettings(defaultSettings);
      setIsInitialized(true);
    }
  }, []);

  // Save settings to localStorage and update state
  const saveSettings = useCallback(async (newSettings) => {
    try {
      localStorage.setItem('bridgeSettings', JSON.stringify(newSettings));
      setSettings(newSettings);
      return { success: true };
    } catch (error) {
      console.error('Error saving settings:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Update a specific network setting
  const updateNetworkSetting = useCallback((networkKey, field, value) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        [field]: value,
      }
    }));
  }, []);

  // Update contract address for a network
  const updateContractAddress = useCallback((networkKey, contractType, address) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        contracts: {
          ...prev[networkKey]?.contracts,
          [contractType]: address,
        }
      }
    }));
  }, []);

  // Update token configuration for a network
  const updateTokenConfig = useCallback((networkKey, tokenSymbol, tokenConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        tokens: {
          ...prev[networkKey]?.tokens,
          [tokenSymbol]: tokenConfig,
        },
        customTokens: true,
      }
    }));
  }, []);

  // Add a new custom token to a network
  const addCustomToken = useCallback((networkKey, tokenSymbol, tokenConfig) => {
    setSettings(prev => ({
      ...prev,
      [networkKey]: {
        ...prev[networkKey],
        tokens: {
          ...prev[networkKey]?.tokens,
          [tokenSymbol]: tokenConfig,
        },
        customTokens: true,
      }
    }));
  }, []);

  // Remove a custom token from a network
  const removeCustomToken = useCallback((networkKey, tokenSymbol) => {
    setSettings(prev => {
      const newTokens = { ...prev[networkKey]?.tokens };
      delete newTokens[tokenSymbol];
      
      // Check if there are any remaining custom tokens
      const hasCustomTokens = Object.keys(newTokens).length > 0;
      
      return {
        ...prev,
        [networkKey]: {
          ...prev[networkKey],
          tokens: newTokens,
          customTokens: hasCustomTokens,
        }
      };
    });
  }, []);

  // Add or update a custom bridge instance with new structure support
  const addCustomBridgeInstance = useCallback((bridgeKey, bridgeConfig) => {
    setSettings(prev => ({
      ...prev,
      bridgeInstances: {
        ...prev.bridgeInstances,
        [bridgeKey]: bridgeConfig,
      }
    }));
  }, []);

  // Remove a custom bridge instance
  const removeCustomBridgeInstance = useCallback((bridgeKey) => {
    setSettings(prev => {
      const newBridgeInstances = { ...prev.bridgeInstances };
      delete newBridgeInstances[bridgeKey];
      
      return {
        ...prev,
        bridgeInstances: newBridgeInstances,
      };
    });
  }, []);

  // Add or update a custom assistant contract with new structure support
  const addCustomAssistantContract = useCallback((assistantKey, assistantConfig) => {
    setSettings(prev => ({
      ...prev,
      assistantContracts: {
        ...prev.assistantContracts,
        [assistantKey]: assistantConfig,
      }
    }));
  }, []);

  // Remove a custom assistant contract
  const removeCustomAssistantContract = useCallback((assistantKey) => {
    setSettings(prev => {
      const newAssistantContracts = { ...prev.assistantContracts };
      delete newAssistantContracts[assistantKey];
      
      return {
        ...prev,
        assistantContracts: newAssistantContracts,
      };
    });
  }, []);

  // Reset settings to defaults
  const resetSettings = useCallback(() => {
    try {
      localStorage.removeItem('bridgeSettings');
      const defaultSettings = {};
      Object.keys(NETWORKS).forEach(networkKey => {
        const network = NETWORKS[networkKey];
        defaultSettings[networkKey] = {
          rpcUrl: network.rpcUrl,
          contracts: { ...network.contracts },
          tokens: { ...network.tokens },
          customRpc: false,
          customContracts: false,
          customTokens: false,
        };
      });
      setSettings(defaultSettings);
      return { success: true };
    } catch (error) {
      console.error('Error resetting settings:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Reset settings for a specific network
  const resetNetworkSettings = useCallback((networkKey) => {
    try {
      const network = NETWORKS[networkKey];
      if (!network) return { success: false, error: 'Network not found' };

      setSettings(prev => ({
        ...prev,
        [networkKey]: {
          rpcUrl: network.rpcUrl,
          contracts: { ...network.contracts },
          tokens: { ...network.tokens },
          customRpc: false,
          customContracts: false,
          customTokens: false,
        }
      }));
      return { success: true };
    } catch (error) {
      console.error('Error resetting network settings:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Get network configuration with custom settings applied
  const getNetworkWithSettings = useCallback((networkKey) => {
    const defaultNetwork = NETWORKS[networkKey];
    
    if (!defaultNetwork) {
      return null;
    }

    if (!settings[networkKey]) {
      return defaultNetwork;
    }

    const networkSettings = settings[networkKey];
    const customNetwork = { ...defaultNetwork };

    // Apply custom RPC URL if enabled
    if (networkSettings.customRpc && networkSettings.rpcUrl) {
      customNetwork.rpcUrl = networkSettings.rpcUrl;
    }

    // Apply custom contract addresses if enabled
    if (networkSettings.customContracts && networkSettings.contracts) {
      customNetwork.contracts = {
        ...customNetwork.contracts,
        ...networkSettings.contracts,
      };
    }

    // Apply custom tokens if enabled
    if (networkSettings.customTokens && networkSettings.tokens) {
      customNetwork.tokens = {
        ...customNetwork.tokens,
        ...networkSettings.tokens,
      };
    }

    return customNetwork;
  }, [settings]);

  // Get all networks with custom settings applied
  const getAllNetworksWithSettings = useCallback(() => {
    const customNetworks = {};
    
    Object.keys(NETWORKS).forEach(networkKey => {
      customNetworks[networkKey] = getNetworkWithSettings(networkKey);
    });

    return customNetworks;
  }, [getNetworkWithSettings]);

  // Get bridge instances with custom settings applied and structure compatibility
  const getBridgeInstancesWithSettings = useCallback(() => {
    const customBridgeInstances = { ...getBridgeInstances() };
    
    if (settings.bridgeInstances) {
      Object.assign(customBridgeInstances, settings.bridgeInstances);
    }

    return customBridgeInstances;
  }, [settings]);

  // Get assistant contracts with custom settings applied and structure compatibility
  const getAssistantContractsWithSettings = useCallback(() => {
    const customAssistantContracts = { ...getAssistantContracts() };
    
    if (settings.assistantContracts) {
      Object.assign(customAssistantContracts, settings.assistantContracts);
    }

    return customAssistantContracts;
  }, [settings]);

  // Get available tokens for a network with custom settings applied
  const getNetworkTokens = useCallback((networkKey) => {
    const network = getNetworkWithSettings(networkKey);
    return network ? network.tokens : {};
  }, [getNetworkWithSettings]);

  // Get a specific token for a network with custom settings applied
  const getNetworkToken = useCallback((networkKey, tokenSymbol) => {
    const tokens = getNetworkTokens(networkKey);
    return tokens[tokenSymbol] || null;
  }, [getNetworkTokens]);

  // Check if network has custom settings
  const hasCustomSettings = useCallback((networkKey) => {
    if (!settings[networkKey]) {
      return false;
    }

    const networkSettings = settings[networkKey];
    return networkSettings.customRpc || networkSettings.customContracts || networkSettings.customTokens;
  }, [settings]);

  // Get all custom tokens across all networks
  const getAllCustomTokens = useCallback(() => {
    const customTokens = {};
    
    Object.keys(settings).forEach(networkKey => {
      if (settings[networkKey] && settings[networkKey].customTokens && settings[networkKey].tokens) {
        customTokens[networkKey] = settings[networkKey].tokens;
      }
    });
    
    return customTokens;
  }, [settings]);

  // Get all custom bridge instances
  const getAllCustomBridgeInstances = useCallback(() => {
    return settings.bridgeInstances || {};
  }, [settings]);

  // Get all custom assistant contracts
  const getAllCustomAssistantContracts = useCallback(() => {
    return settings.assistantContracts || {};
  }, [settings]);

  // Check if bridge instances have custom settings
  const hasCustomBridgeInstances = useCallback(() => {
    return settings.bridgeInstances && Object.keys(settings.bridgeInstances).length > 0;
  }, [settings]);

  // Check if assistant contracts have custom settings
  const hasCustomAssistantContracts = useCallback(() => {
    return settings.assistantContracts && Object.keys(settings.assistantContracts).length > 0;
  }, [settings]);

  // Get P3D precompile address constant
  const getP3DPrecompileAddress = useCallback(() => {
    return P3D_PRECOMPILE_ADDRESS;
  }, []);

  // Check if a token is a 3DPass precompile
  const is3DPassPrecompile = useCallback((tokenAddress) => {
    if (!tokenAddress) return false;
    
    // P3D precompile
    if (tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
      return true;
    }
    
    // Other 3DPass ERC20 precompiles (start with 0xFBFBFBFA)
    return tokenAddress.toLowerCase().startsWith('0xfbfbfbfa');
  }, []);

  // Check if a token is the P3D precompile specifically
  const isP3DPrecompile = useCallback((tokenAddress) => {
    return tokenAddress && tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
  }, []);

  // Get bridge instances by network with structure compatibility
  const getBridgeInstancesByNetwork = useCallback((networkSymbol) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    return Object.values(bridgeInstances).filter(bridge => {
      return bridge.homeNetwork === networkSymbol || bridge.foreignNetwork === networkSymbol;
    });
  }, [getBridgeInstancesWithSettings]);

  // Get assistant contracts by network with structure compatibility
  const getAssistantContractsByNetwork = useCallback((networkSymbol) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).filter(assistant => {
      return assistant.homeNetwork === networkSymbol || assistant.foreignNetwork === networkSymbol;
    });
  }, [getAssistantContractsWithSettings]);

  // Get bridge instances by type with structure compatibility
  const getBridgeInstancesByType = useCallback((type) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    return Object.values(bridgeInstances).filter(bridge => bridge.type === type);
  }, [getBridgeInstancesWithSettings]);

  // Get assistant contracts by type with structure compatibility
  const getAssistantContractsByType = useCallback((type) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).filter(assistant => assistant.type === type);
  }, [getAssistantContractsWithSettings]);

  // Get bridge instance by address with structure compatibility
  const getBridgeInstanceByAddress = useCallback((address) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    return Object.values(bridgeInstances).find(bridge => bridge.address === address);
  }, [getBridgeInstancesWithSettings]);

  // Get assistant contract by address with structure compatibility
  const getAssistantContractByAddress = useCallback((address) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).find(assistant => assistant.address === address);
  }, [getAssistantContractsWithSettings]);

  // Get assistant contract for a specific bridge with structure compatibility
  const getAssistantContractForBridge = useCallback((bridgeAddress) => {
    const assistantContracts = getAssistantContractsWithSettings();
    return Object.values(assistantContracts).find(assistant => assistant.bridgeAddress === bridgeAddress);
  }, [getAssistantContractsWithSettings]);

  // Check if a bridge instance is for 3DPass network
  const is3DPassBridge = useCallback((bridgeInstance) => {
    if (!bridgeInstance) return false;
    
    return bridgeInstance.homeNetwork === '3DPass' || bridgeInstance.foreignNetwork === '3DPass';
  }, []);

  // Check if an assistant contract is for 3DPass network
  const is3DPassAssistant = useCallback((assistantContract) => {
    if (!assistantContract) return false;
    
    return assistantContract.homeNetwork === '3DPass' || assistantContract.foreignNetwork === '3DPass';
  }, []);

  // Get stake token symbol for a bridge instance
  const getStakeTokenSymbol = useCallback((bridgeInstance) => {
    if (!bridgeInstance) return null;
    return bridgeInstance.stakeTokenSymbol;
  }, []);

  // Get stake token address for a bridge instance
  const getStakeTokenAddress = useCallback((bridgeInstance) => {
    if (!bridgeInstance) return null;
    return bridgeInstance.stakeTokenAddress;
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  const value = {
    // State
    settings,
    isInitialized,
    
    // Actions
    saveSettings,
    updateNetworkSetting,
    updateContractAddress,
    updateTokenConfig,
    addCustomToken,
    removeCustomToken,
    addCustomBridgeInstance,
    removeCustomBridgeInstance,
    addCustomAssistantContract,
    removeCustomAssistantContract,
    resetSettings,
    resetNetworkSettings,
    
    // Utilities
    getNetworkWithSettings,
    getAllNetworksWithSettings,
    getBridgeInstancesWithSettings,
    getAssistantContractsWithSettings,
    getNetworkTokens,
    getNetworkToken,
    hasCustomSettings,
    getAllCustomTokens,
    getAllCustomBridgeInstances,
    getAllCustomAssistantContracts,
    hasCustomBridgeInstances,
    hasCustomAssistantContracts,
    
    // Bridge and Assistant utilities with structure compatibility
    getBridgeInstancesByNetwork,
    getAssistantContractsByNetwork,
    getBridgeInstancesByType,
    getAssistantContractsByType,
    getBridgeInstanceByAddress,
    getAssistantContractByAddress,
    getAssistantContractForBridge,
    is3DPassBridge,
    is3DPassAssistant,
    
    // Stake token utilities
    getStakeTokenSymbol,
    getStakeTokenAddress,
    
    // 3DPass specific utilities
    getP3DPrecompileAddress,
    is3DPassPrecompile,
    isP3DPrecompile,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 