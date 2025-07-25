import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { NETWORKS } from '../config/networks';

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
            customRpc: false,
            customContracts: false,
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
          customRpc: false,
          customContracts: false,
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
          customRpc: false,
          customContracts: false,
        };
      });
      setSettings(defaultSettings);
      return { success: true };
    } catch (error) {
      console.error('Error resetting settings:', error);
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

  // Check if network has custom settings
  const hasCustomSettings = useCallback((networkKey) => {
    if (!settings[networkKey]) {
      return false;
    }

    const networkSettings = settings[networkKey];
    return networkSettings.customRpc || networkSettings.customContracts;
  }, [settings]);

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
    resetSettings,
    
    // Utilities
    getNetworkWithSettings,
    getAllNetworksWithSettings,
    hasCustomSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 