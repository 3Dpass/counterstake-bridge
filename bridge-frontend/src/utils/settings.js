import { NETWORKS, getBridgeInstances, getAssistantContracts, P3D_PRECOMPILE_ADDRESS } from '../config/networks';

/**
 * Load settings from localStorage
 * @returns {Object} Settings object
 */
export const loadSettings = () => {
  try {
    const savedSettings = localStorage.getItem('bridgeSettings');
    return savedSettings ? JSON.parse(savedSettings) : null;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
};

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings object to save
 * @returns {boolean} True if successful
 */
export const saveSettings = (settings) => {
  try {
    localStorage.setItem('bridgeSettings', JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
};

/**
 * Get network configuration with custom settings applied
 * @param {string} networkKey - Network key (ETHEREUM, BSC, THREEDPASS)
 * @returns {Object} Network configuration with custom settings
 */
export const getNetworkWithSettings = (networkKey) => {
  const settings = loadSettings();
  const defaultNetwork = NETWORKS[networkKey];
  
  if (!defaultNetwork) {
    return null;
  }

  if (!settings || !settings[networkKey]) {
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
};

/**
 * Get all networks with custom settings applied
 * @returns {Object} All networks with custom settings
 */
export const getAllNetworksWithSettings = () => {
  const customNetworks = {};
  
  Object.keys(NETWORKS).forEach(networkKey => {
    customNetworks[networkKey] = getNetworkWithSettings(networkKey);
  });

  return customNetworks;
};

/**
 * Get bridge instances with custom settings applied and structure compatibility
 * @returns {Object} Bridge instances with custom settings
 */
export const getBridgeInstancesWithSettings = () => {
  const settings = loadSettings();
  const customBridgeInstances = { ...getBridgeInstances() };
  
  if (settings && settings.bridgeInstances) {
    Object.assign(customBridgeInstances, settings.bridgeInstances);
  }

  return customBridgeInstances;
};

/**
 * Get assistant contracts with custom settings applied and structure compatibility
 * @returns {Object} Assistant contracts with custom settings
 */
export const getAssistantContractsWithSettings = () => {
  const settings = loadSettings();
  const customAssistantContracts = { ...getAssistantContracts() };
  
  if (settings && settings.assistantContracts) {
    Object.assign(customAssistantContracts, settings.assistantContracts);
  }

  return customAssistantContracts;
};

/**
 * Get bridge instances by network with structure compatibility
 * @param {string} networkSymbol - Network symbol
 * @returns {Array} Bridge instances for the network
 */
export const getBridgeInstancesByNetwork = (networkSymbol) => {
  const bridgeInstances = getBridgeInstancesWithSettings();
  return Object.values(bridgeInstances).filter(bridge => {
    return bridge.homeNetwork === networkSymbol || bridge.foreignNetwork === networkSymbol;
  });
};

/**
 * Get assistant contracts by network with structure compatibility
 * @param {string} networkSymbol - Network symbol
 * @returns {Array} Assistant contracts for the network
 */
export const getAssistantContractsByNetwork = (networkSymbol) => {
  const assistantContracts = getAssistantContractsWithSettings();
  return Object.values(assistantContracts).filter(assistant => {
    return assistant.homeNetwork === networkSymbol || assistant.foreignNetwork === networkSymbol;
  });
};

/**
 * Get bridge instances by type with structure compatibility
 * @param {string} type - Bridge type (import, export, import_wrapper)
 * @returns {Array} Bridge instances of the specified type
 */
export const getBridgeInstancesByType = (type) => {
  const bridgeInstances = getBridgeInstancesWithSettings();
  return Object.values(bridgeInstances).filter(bridge => bridge.type === type);
};

/**
 * Get assistant contracts by type with structure compatibility
 * @param {string} type - Assistant type (import, export, import_wrapper)
 * @returns {Array} Assistant contracts of the specified type
 */
export const getAssistantContractsByType = (type) => {
  const assistantContracts = getAssistantContractsWithSettings();
  return Object.values(assistantContracts).filter(assistant => assistant.type === type);
};

/**
 * Get bridge instance by address with structure compatibility
 * @param {string} address - Bridge address
 * @returns {Object|null} Bridge instance or null if not found
 */
export const getBridgeInstanceByAddress = (address) => {
  const bridgeInstances = getBridgeInstancesWithSettings();
  return Object.values(bridgeInstances).find(bridge => bridge.address === address);
};

/**
 * Get assistant contract by address with structure compatibility
 * @param {string} address - Assistant address
 * @returns {Object|null} Assistant contract or null if not found
 */
export const getAssistantContractByAddress = (address) => {
  const assistantContracts = getAssistantContractsWithSettings();
  return Object.values(assistantContracts).find(assistant => assistant.address === address);
};

/**
 * Get assistant contract for a specific bridge with structure compatibility
 * @param {string} bridgeAddress - Bridge address
 * @returns {Object|null} Assistant contract or null if not found
 */
export const getAssistantContractForBridge = (bridgeAddress) => {
  const assistantContracts = getAssistantContractsWithSettings();
  return Object.values(assistantContracts).find(assistant => assistant.bridgeAddress === bridgeAddress);
};

/**
 * Check if a bridge instance is for 3DPass network
 * @param {Object} bridgeInstance - Bridge instance
 * @returns {boolean} True if it's a 3DPass bridge
 */
export const is3DPassBridge = (bridgeInstance) => {
  if (!bridgeInstance) return false;
  
  return bridgeInstance.homeNetwork === '3DPass' || bridgeInstance.foreignNetwork === '3DPass';
};

/**
 * Check if an assistant contract is for 3DPass network
 * @param {Object} assistantContract - Assistant contract
 * @returns {boolean} True if it's a 3DPass assistant
 */
export const is3DPassAssistant = (assistantContract) => {
  if (!assistantContract) return false;
  
  return assistantContract.homeNetwork === '3DPass' || assistantContract.foreignNetwork === '3DPass';
};

/**
 * Get stake token symbol for a bridge instance
 * @param {Object} bridgeInstance - Bridge instance
 * @returns {string|null} Stake token symbol or null if not found
 */
export const getStakeTokenSymbol = (bridgeInstance) => {
  if (!bridgeInstance) return null;
  return bridgeInstance.stakeTokenSymbol;
};

/**
 * Get stake token address for a bridge instance
 * @param {Object} bridgeInstance - Bridge instance
 * @returns {string|null} Stake token address or null if not found
 */
export const getStakeTokenAddress = (bridgeInstance) => {
  if (!bridgeInstance) return null;
  return bridgeInstance.stakeTokenAddress;
};

/**
 * Validate RPC URL format
 * @param {string} url - RPC URL to validate
 * @returns {boolean} True if valid
 */
export const validateRpcUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate contract address format
 * @param {string} address - Contract address to validate
 * @returns {boolean} True if valid
 */
export const validateContractAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate token address format (supports both regular addresses and 3DPass precompile addresses)
 * @param {string} address - Token address to validate
 * @returns {boolean} True if valid
 */
export const validateTokenAddress = (address) => {
  if (!address) return false;
  
  // Regular Ethereum-style address
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return true;
  }
  
  return false;
};

/**
 * Check if a token is a 3DPass precompile
 * @param {string} tokenAddress - Token address to check
 * @returns {boolean} True if it's a 3DPass precompile
 */
export const is3DPassPrecompile = (tokenAddress) => {
  if (!tokenAddress) return false;
  
  // P3D precompile
  if (tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase()) {
    return true;
  }
  
  // Other 3DPass ERC20 precompiles (start with 0xFBFBFBFA)
  return tokenAddress.toLowerCase().startsWith('0xfbfbfbfa');
};

/**
 * Check if a token is the P3D precompile specifically
 * @param {string} tokenAddress - Token address to check
 * @returns {boolean} True if it's the P3D precompile
 */
export const isP3DPrecompile = (tokenAddress) => {
  return tokenAddress && tokenAddress.toLowerCase() === P3D_PRECOMPILE_ADDRESS.toLowerCase();
};

/**
 * Get P3D precompile address constant
 * @returns {string} P3D precompile address
 */
export const getP3DPrecompileAddress = () => {
  return P3D_PRECOMPILE_ADDRESS;
};

/**
 * Get default settings for a network
 * @param {string} networkKey - Network key
 * @returns {Object} Default settings
 */
export const getDefaultSettings = (networkKey) => {
  const network = NETWORKS[networkKey];
  if (!network) return null;

  return {
    rpcUrl: network.rpcUrl,
    contracts: { ...network.contracts },
    tokens: { ...network.tokens },
    customRpc: false,
    customContracts: false,
    customTokens: false,
  };
};

/**
 * Update settings for a specific network
 * @param {string} networkKey - Network key
 * @param {Object} newSettings - New settings to apply
 * @returns {boolean} True if successful
 */
export const updateNetworkSettings = (networkKey, newSettings) => {
  try {
    const currentSettings = loadSettings() || {};
    currentSettings[networkKey] = {
      ...currentSettings[networkKey],
      ...newSettings,
    };
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error updating network settings:', error);
    return false;
  }
};

/**
 * Reset settings to defaults
 */
export const resetSettings = () => {
  try {
    localStorage.removeItem('bridgeSettings');
    return true;
  } catch (error) {
    console.error('Error resetting settings:', error);
    return false;
  }
};

/**
 * Reset settings for a specific network
 * @param {string} networkKey - Network key
 * @returns {boolean} True if successful
 */
export const resetNetworkSettings = (networkKey) => {
  try {
    const currentSettings = loadSettings();
    if (currentSettings && currentSettings[networkKey]) {
      delete currentSettings[networkKey];
      return saveSettings(currentSettings);
    }
    return true;
  } catch (error) {
    console.error('Error resetting network settings:', error);
    return false;
  }
};

/**
 * Check if network has custom settings
 * @param {string} networkKey - Network key
 * @returns {boolean} True if has custom settings
 */
export const hasCustomSettings = (networkKey) => {
  const settings = loadSettings();
  if (!settings || !settings[networkKey]) {
    return false;
  }

  const networkSettings = settings[networkKey];
  return networkSettings.customRpc || networkSettings.customContracts || networkSettings.customTokens;
};

/**
 * Get network display name with custom indicator
 * @param {string} networkKey - Network key
 * @returns {string} Network name with custom indicator
 */
export const getNetworkDisplayName = (networkKey) => {
  const network = NETWORKS[networkKey];
  if (!network) return networkKey;

  const hasCustom = hasCustomSettings(networkKey);
  return hasCustom ? `${network.name} (Custom)` : network.name;
};

/**
 * Get available tokens for a network with custom settings applied
 * @param {string} networkKey - Network key
 * @returns {Object} Available tokens
 */
export const getNetworkTokens = (networkKey) => {
  const network = getNetworkWithSettings(networkKey);
  return network ? network.tokens : {};
};

/**
 * Get a specific token for a network with custom settings applied
 * @param {string} networkKey - Network key
 * @param {string} tokenSymbol - Token symbol
 * @returns {Object|null} Token configuration or null if not found
 */
export const getNetworkToken = (networkKey, tokenSymbol) => {
  const tokens = getNetworkTokens(networkKey);
  return tokens[tokenSymbol] || null;
};

/**
 * Add or update a custom token for a network
 * @param {string} networkKey - Network key
 * @param {string} tokenSymbol - Token symbol
 * @param {Object} tokenConfig - Token configuration
 * @returns {boolean} True if successful
 */
export const addCustomToken = (networkKey, tokenSymbol, tokenConfig) => {
  try {
    const currentSettings = loadSettings() || {};
    if (!currentSettings[networkKey]) {
      currentSettings[networkKey] = getDefaultSettings(networkKey);
    }
    
    if (!currentSettings[networkKey].tokens) {
      currentSettings[networkKey].tokens = {};
    }
    
    currentSettings[networkKey].tokens[tokenSymbol] = tokenConfig;
    currentSettings[networkKey].customTokens = true;
    
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error adding custom token:', error);
    return false;
  }
};

/**
 * Remove a custom token from a network
 * @param {string} networkKey - Network key
 * @param {string} tokenSymbol - Token symbol
 * @returns {boolean} True if successful
 */
export const removeCustomToken = (networkKey, tokenSymbol) => {
  try {
    const currentSettings = loadSettings();
    if (!currentSettings || !currentSettings[networkKey] || !currentSettings[networkKey].tokens) {
      return true;
    }
    
    delete currentSettings[networkKey].tokens[tokenSymbol];
    
    // Check if there are any remaining custom tokens
    const hasCustomTokens = Object.keys(currentSettings[networkKey].tokens).length > 0;
    currentSettings[networkKey].customTokens = hasCustomTokens;
    
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error removing custom token:', error);
    return false;
  }
};

/**
 * Get all custom tokens across all networks
 * @returns {Object} Object with network keys and their custom tokens
 */
export const getAllCustomTokens = () => {
  const settings = loadSettings();
  const customTokens = {};
  
  if (!settings) return customTokens;
  
  Object.keys(settings).forEach(networkKey => {
    if (settings[networkKey] && settings[networkKey].customTokens && settings[networkKey].tokens) {
      customTokens[networkKey] = settings[networkKey].tokens;
    }
  });
  
  return customTokens;
};

/**
 * Add or update a custom bridge instance with new structure support
 * @param {string} bridgeKey - Bridge instance key
 * @param {Object} bridgeConfig - Bridge instance configuration
 * @returns {boolean} True if successful
 */
export const addCustomBridgeInstance = (bridgeKey, bridgeConfig) => {
  try {
    const currentSettings = loadSettings() || {};
    if (!currentSettings.bridgeInstances) {
      currentSettings.bridgeInstances = {};
    }
    
    currentSettings.bridgeInstances[bridgeKey] = bridgeConfig;
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error adding custom bridge instance:', error);
    return false;
  }
};

/**
 * Remove a custom bridge instance
 * @param {string} bridgeKey - Bridge instance key
 * @returns {boolean} True if successful
 */
export const removeCustomBridgeInstance = (bridgeKey) => {
  try {
    const currentSettings = loadSettings();
    if (!currentSettings || !currentSettings.bridgeInstances) {
      return true;
    }
    
    delete currentSettings.bridgeInstances[bridgeKey];
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error removing custom bridge instance:', error);
    return false;
  }
};

/**
 * Add or update a custom assistant contract with new structure support
 * @param {string} assistantKey - Assistant contract key
 * @param {Object} assistantConfig - Assistant contract configuration
 * @returns {boolean} True if successful
 */
export const addCustomAssistantContract = (assistantKey, assistantConfig) => {
  try {
    const currentSettings = loadSettings() || {};
    if (!currentSettings.assistantContracts) {
      currentSettings.assistantContracts = {};
    }
    
    currentSettings.assistantContracts[assistantKey] = assistantConfig;
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error adding custom assistant contract:', error);
    return false;
  }
};

/**
 * Remove a custom assistant contract
 * @param {string} assistantKey - Assistant contract key
 * @returns {boolean} True if successful
 */
export const removeCustomAssistantContract = (assistantKey) => {
  try {
    const currentSettings = loadSettings();
    if (!currentSettings || !currentSettings.assistantContracts) {
      return true;
    }
    
    delete currentSettings.assistantContracts[assistantKey];
    return saveSettings(currentSettings);
  } catch (error) {
    console.error('Error removing custom assistant contract:', error);
    return false;
  }
};

/**
 * Get all custom bridge instances
 * @returns {Object} Custom bridge instances
 */
export const getAllCustomBridgeInstances = () => {
  const settings = loadSettings();
  return settings?.bridgeInstances || {};
};

/**
 * Get all custom assistant contracts
 * @returns {Object} Custom assistant contracts
 */
export const getAllCustomAssistantContracts = () => {
  const settings = loadSettings();
  return settings?.assistantContracts || {};
};

/**
 * Check if bridge instances have custom settings
 * @returns {boolean} True if has custom bridge instances
 */
export const hasCustomBridgeInstances = () => {
  const settings = loadSettings();
  return settings?.bridgeInstances && Object.keys(settings.bridgeInstances).length > 0;
};

/**
 * Check if assistant contracts have custom settings
 * @returns {boolean} True if has custom assistant contracts
 */
export const hasCustomAssistantContracts = () => {
  const settings = loadSettings();
  return settings?.assistantContracts && Object.keys(settings.assistantContracts).length > 0;
}; 