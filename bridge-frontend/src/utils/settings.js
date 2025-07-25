import { NETWORKS } from '../config/networks';

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
    customRpc: false,
    customContracts: false,
  };
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
  return networkSettings.customRpc || networkSettings.customContracts;
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