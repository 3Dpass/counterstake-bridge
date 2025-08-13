import React, { useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS, getBridgeInstances, getAssistantContracts } from '../config/networks';
import { 
  Settings, 
  Network, 
  Save, 
  RotateCcw, 
  X,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Coins,
  Link,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const SettingsDialog = ({ isOpen, onClose }) => {
  const { network } = useWeb3();
  const { 
    settings, 
    saveSettings, 
    updateNetworkSetting, 
    updateContractAddress,
    addCustomToken,
    removeCustomToken,
    addCustomBridgeInstance,
    removeCustomBridgeInstance,
    addCustomAssistantContract,
    removeCustomAssistantContract,
    resetSettings
  } = useSettings();
  const [copiedField, setCopiedField] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddToken, setShowAddToken] = useState({});
  const [newToken, setNewToken] = useState({});
  const [showAddBridge, setShowAddBridge] = useState(false);
  const [newBridge, setNewBridge] = useState({});
  const [showAddAssistant, setShowAddAssistant] = useState(false);
  const [newAssistant, setNewAssistant] = useState({});

  // Save settings to localStorage
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const result = await saveSettings(settings);
      if (result.success) {
        toast.success('Settings saved successfully!');
        onClose();
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Failed to save settings');
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset settings to defaults
  const handleResetSettings = () => {
    const result = resetSettings();
    if (result.success) {
      toast.success('Settings reset to defaults');
    } else {
      toast.error('Failed to reset settings');
    }
  };

  // Copy field to clipboard
  const copyToClipboard = async (text, fieldName) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Validate RPC URL
  const validateRpcUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Validate contract address
  const validateContractAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  // Validate token address (supports both regular and 3DPass precompile addresses)
  const validateTokenAddress = (address) => {
    // Regular Ethereum-style address
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return true;
    }
    
    // 3DPass precompile address format
    if (/^0x[a-fA-F0-9]{40}$/.test(address) && address.startsWith('0x000000000000000000000000000000000000')) {
      return true;
    }
    
    // 3DPass wrapped token format (like 0xfBFBfbFA000000000000000000000000000000de)
    if (/^0x[a-fA-F0-9]{40}$/.test(address) && address.startsWith('0x')) {
      return true;
    }
    
    return false;
  };

  // Handle adding a new token
  const handleAddToken = (networkKey) => {
    const token = newToken[networkKey];
    if (!token || !token.symbol || !token.address || !token.name || !token.decimals) {
      toast.error('Please fill in all token fields');
      return;
    }

    if (!validateTokenAddress(token.address)) {
      toast.error('Invalid token address');
      return;
    }

    addCustomToken(networkKey, token.symbol, {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: parseInt(token.decimals),
    });

    setNewToken(prev => ({ ...prev, [networkKey]: {} }));
    setShowAddToken(prev => ({ ...prev, [networkKey]: false }));
    toast.success(`Token ${token.symbol} added successfully`);
  };

  // Handle removing a token
  const handleRemoveToken = (networkKey, tokenSymbol) => {
    removeCustomToken(networkKey, tokenSymbol);
    toast.success(`Token ${tokenSymbol} removed successfully`);
  };

  // Handle adding a new bridge instance
  const handleAddBridge = () => {
    const bridge = newBridge;
    if (!bridge.key || !bridge.address || !bridge.type || !bridge.homeNetwork || 
        !bridge.homeTokenSymbol || !bridge.foreignNetwork || !bridge.foreignTokenSymbol) {
      toast.error('Please fill in all bridge fields');
      return;
    }

    if (!validateContractAddress(bridge.address)) {
      toast.error('Invalid bridge address');
      return;
    }

    addCustomBridgeInstance(bridge.key, {
      address: bridge.address,
      type: bridge.type,
      homeNetwork: bridge.homeNetwork,
      homeTokenSymbol: bridge.homeTokenSymbol,
      homeTokenAddress: bridge.homeTokenAddress || '0x0000000000000000000000000000000000000000',
      foreignNetwork: bridge.foreignNetwork,
      foreignTokenSymbol: bridge.foreignTokenSymbol,
      foreignTokenAddress: bridge.foreignTokenAddress || '0x0000000000000000000000000000000000000000',
      stakeTokenSymbol: bridge.stakeTokenSymbol || 'P3D',
      stakeTokenAddress: bridge.stakeTokenAddress || '0x0000000000000000000000000000000000000000',
      description: bridge.description || `${bridge.homeTokenSymbol} ${bridge.type} Bridge`,
    });

    setNewBridge({});
    setShowAddBridge(false);
    toast.success(`Bridge ${bridge.key} added successfully`);
  };

  // Handle removing a bridge instance
  const handleRemoveBridge = (bridgeKey) => {
    removeCustomBridgeInstance(bridgeKey);
    toast.success(`Bridge ${bridgeKey} removed successfully`);
  };

  // Handle adding a new assistant contract
  const handleAddAssistant = () => {
    const assistant = newAssistant;
    if (!assistant.key || !assistant.address || !assistant.type || !assistant.bridgeAddress) {
      toast.error('Please fill in all assistant fields');
      return;
    }

    if (!validateContractAddress(assistant.address)) {
      toast.error('Invalid assistant address');
      return;
    }

    if (!validateContractAddress(assistant.bridgeAddress)) {
      toast.error('Invalid bridge address');
      return;
    }

    addCustomAssistantContract(assistant.key, {
      address: assistant.address,
      type: assistant.type,
      bridgeAddress: assistant.bridgeAddress,
      homeNetwork: assistant.homeNetwork,
      homeTokenSymbol: assistant.homeTokenSymbol,
      foreignNetwork: assistant.foreignNetwork,
      foreignTokenSymbol: assistant.foreignTokenSymbol,
      description: assistant.description || `${assistant.homeTokenSymbol} ${assistant.type} Assistant`,
    });

    setNewAssistant({});
    setShowAddAssistant(false);
    toast.success(`Assistant ${assistant.key} added successfully`);
  };

  // Handle removing an assistant contract
  const handleRemoveAssistant = (assistantKey) => {
    removeCustomAssistantContract(assistantKey);
    toast.success(`Assistant ${assistantKey} removed successfully`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start justify-center p-2 sm:p-4 pt-8 sm:pt-16"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[calc(100vh-7.2rem)] sm:max-h-[calc(100vh-10.8rem)] overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-secondary-800">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-white">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(96vh-14.4rem)] sm:max-h-[calc(96vh-18rem)]">
            <div className="space-y-6">
              {/* Network Settings */}
              {Object.entries(NETWORKS).map(([networkKey, networkConfig]) => (
                <div key={networkKey} className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <Network className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">{networkConfig.name}</h3>
                    {network?.symbol === networkConfig.symbol && (
                      <span className="px-2 py-1 bg-primary-600 text-white text-xs rounded-full">
                        Active
                      </span>
                    )}
                  </div>

                  {/* RPC URL Settings */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-secondary-300">
                        RPC Provider URL
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customRpc-${networkKey}`}
                          checked={settings[networkKey]?.customRpc || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customRpc', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customRpc-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings[networkKey]?.rpcUrl || ''}
                        onChange={(e) => updateNetworkSetting(networkKey, 'rpcUrl', e.target.value)}
                        placeholder="Enter RPC URL"
                        disabled={!settings[networkKey]?.customRpc}
                        className={`flex-1 input-field ${
                          settings[networkKey]?.customRpc && !validateRpcUrl(settings[networkKey]?.rpcUrl)
                            ? 'border-error-500'
                            : ''
                        } ${!settings[networkKey]?.customRpc ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''}`}
                      />
                      <button
                        onClick={() => copyToClipboard(settings[networkKey]?.rpcUrl, 'RPC URL')}
                        disabled={!settings[networkKey]?.customRpc}
                        className={`btn-secondary px-3 ${!settings[networkKey]?.customRpc ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {copiedField === 'RPC URL' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    
                    {settings[networkKey]?.customRpc && !validateRpcUrl(settings[networkKey]?.rpcUrl) && (
                      <p className="text-error-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid URL format
                      </p>
                    )}
                  </div>

                  {/* Contract Addresses */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-secondary-300">
                        Contract Addresses
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customContracts-${networkKey}`}
                          checked={settings[networkKey]?.customContracts || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customContracts', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customContracts-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(settings[networkKey]?.contracts || {}).map(([contractType, address]) => (
                        <div key={contractType} className="space-y-1">
                          <label className="text-xs text-secondary-400 capitalize">
                            {contractType.replace(/([A-Z])/g, ' $1').trim()}
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={address || ''}
                              onChange={(e) => updateContractAddress(networkKey, contractType, e.target.value)}
                              placeholder={`0x...`}
                              disabled={!settings[networkKey]?.customContracts}
                              className={`flex-1 input-field text-sm ${
                                settings[networkKey]?.customContracts && address && !validateContractAddress(address)
                                  ? 'border-error-500'
                                  : ''
                              } ${!settings[networkKey]?.customContracts ? 'opacity-50 cursor-not-allowed bg-dark-800' : ''}`}
                            />
                            <button
                              onClick={() => copyToClipboard(address, contractType)}
                              disabled={!settings[networkKey]?.customContracts}
                              className={`btn-secondary px-2 ${!settings[networkKey]?.customContracts ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {copiedField === contractType ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          {settings[networkKey]?.customContracts && address && !validateContractAddress(address) && (
                            <p className="text-error-500 text-xs flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Invalid address
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Token Management */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Token Management
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`customTokens-${networkKey}`}
                          checked={settings[networkKey]?.customTokens || false}
                          onChange={(e) => updateNetworkSetting(networkKey, 'customTokens', e.target.checked)}
                          className="w-4 h-4 text-primary-600 bg-dark-800 border-secondary-600 rounded focus:ring-primary-500"
                        />
                        <label htmlFor={`customTokens-${networkKey}`} className="text-xs text-secondary-400">
                          Custom
                        </label>
                      </div>
                    </div>

                    {/* Existing Tokens */}
                    <div className="space-y-2 mb-3">
                      {Object.entries(settings[networkKey]?.tokens || {}).map(([tokenSymbol, tokenConfig]) => (
                        <div key={tokenSymbol} className="flex items-center gap-2 p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{tokenSymbol}</span>
                              <span className="text-xs text-secondary-400">{tokenConfig.name}</span>
                            </div>
                            <div className="text-xs text-secondary-500 truncate">{tokenConfig.address}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => copyToClipboard(tokenConfig.address, `${tokenSymbol} address`)}
                              className="btn-secondary px-2 py-1"
                            >
                              {copiedField === `${tokenSymbol} address` ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {settings[networkKey]?.customTokens && (
                              <button
                                onClick={() => handleRemoveToken(networkKey, tokenSymbol)}
                                className="btn-error px-2 py-1"
                                title="Remove token"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Token */}
                    {settings[networkKey]?.customTokens && (
                      <div className="space-y-3">
                        {!showAddToken[networkKey] ? (
                          <button
                            onClick={() => setShowAddToken(prev => ({ ...prev, [networkKey]: true }))}
                            className="btn-secondary flex items-center gap-2 w-full"
                          >
                            <Plus className="w-4 h-4" />
                            Add Custom Token
                          </button>
                        ) : (
                          <div className="p-3 bg-dark-800 rounded border border-secondary-700 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Token Symbol (e.g., USDT)"
                                value={newToken[networkKey]?.symbol || ''}
                                onChange={(e) => setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: { ...prev[networkKey], symbol: e.target.value }
                                }))}
                                className="input-field text-sm"
                              />
                              <input
                                type="number"
                                placeholder="Decimals"
                                value={newToken[networkKey]?.decimals || ''}
                                onChange={(e) => setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: { ...prev[networkKey], decimals: e.target.value }
                                }))}
                                className="input-field text-sm"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Token Name (e.g., Tether USD)"
                              value={newToken[networkKey]?.name || ''}
                              onChange={(e) => setNewToken(prev => ({
                                ...prev,
                                [networkKey]: { ...prev[networkKey], name: e.target.value }
                              }))}
                              className="input-field text-sm"
                            />
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Token Address (0x...)"
                                value={newToken[networkKey]?.address || ''}
                                onChange={(e) => setNewToken(prev => ({
                                  ...prev,
                                  [networkKey]: { ...prev[networkKey], address: e.target.value }
                                }))}
                                className={`flex-1 input-field text-sm ${
                                  newToken[networkKey]?.address && !validateTokenAddress(newToken[networkKey]?.address)
                                    ? 'border-error-500'
                                    : ''
                                }`}
                              />
                              <button
                                onClick={() => handleAddToken(networkKey)}
                                className="btn-primary px-3"
                              >
                                Add
                              </button>
                              <button
                                onClick={() => {
                                  setShowAddToken(prev => ({ ...prev, [networkKey]: false }));
                                  setNewToken(prev => ({ ...prev, [networkKey]: {} }));
                                }}
                                className="btn-outline px-3"
                              >
                                Cancel
                              </button>
                            </div>
                            {newToken[networkKey]?.address && !validateTokenAddress(newToken[networkKey]?.address) && (
                              <p className="text-error-500 text-xs flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Invalid token address
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bridge Instances for this Network */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Bridge Instances
                        </label>
                      </div>
                    </div>

                    {/* Existing Bridge Instances for this Network */}
                    <div className="space-y-2 mb-3">
                      {Object.entries({ ...getBridgeInstances(), ...settings.bridgeInstances })
                        .filter(([bridgeKey, bridgeConfig]) => {
                          // For export bridges: show under home network
                          if (bridgeConfig.type === 'export') {
                            return bridgeConfig.homeNetwork === networkConfig.name;
                          }
                          // For import bridges: show under foreign network
                          if (bridgeConfig.type === 'import') {
                            return bridgeConfig.foreignNetwork === networkConfig.name;
                          }
                          return false;
                        })
                        .map(([bridgeKey, bridgeConfig]) => (
                        <div key={bridgeKey} className="p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">{bridgeKey}</span>
                              <span className={`px-1 py-0.5 text-xs rounded-full ${
                                bridgeConfig.type === 'import' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-green-600 text-white'
                              }`}>
                                {bridgeConfig.type}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyToClipboard(bridgeConfig.address, `${bridgeKey} address`)}
                                className="btn-secondary px-1 py-0.5"
                              >
                                {copiedField === `${bridgeKey} address` ? (
                                  <CheckCircle className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              {settings.bridgeInstances?.[bridgeKey] && (
                                <button
                                  onClick={() => handleRemoveBridge(bridgeKey)}
                                  className="btn-error px-1 py-0.5"
                                  title="Remove bridge"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-secondary-400 space-y-0.5">
                            <div>Address: {bridgeConfig.address}</div>
                            <div>Route: {bridgeConfig.homeNetwork} {bridgeConfig.homeTokenSymbol} → {bridgeConfig.foreignNetwork} {bridgeConfig.foreignTokenSymbol}</div>
                            <div>Stake: {bridgeConfig.stakeTokenSymbol}</div>
                            {bridgeConfig.description && (
                              <div>Description: {bridgeConfig.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Assistant Contracts for this Network */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary-500" />
                        <label className="text-sm font-medium text-secondary-300">
                          Assistant Contracts
                        </label>
                      </div>
                    </div>

                    {/* Existing Assistant Contracts for this Network */}
                    <div className="space-y-2 mb-3">
                      {Object.entries({ ...getAssistantContracts(), ...settings.assistantContracts })
                        .filter(([assistantKey, assistantConfig]) => {
                          // For export assistants: show under home network
                          if (assistantConfig.type === 'export') {
                            return assistantConfig.homeNetwork === networkConfig.name;
                          }
                          // For import assistants: show under foreign network
                          if (assistantConfig.type === 'import') {
                            return assistantConfig.foreignNetwork === networkConfig.name;
                          }
                          return false;
                        })
                        .map(([assistantKey, assistantConfig]) => (
                        <div key={assistantKey} className="p-2 bg-dark-800 rounded border border-secondary-700">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white">{assistantKey}</span>
                              <span className={`px-1 py-0.5 text-xs rounded-full ${
                                assistantConfig.type === 'import' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-green-600 text-white'
                              }`}>
                                {assistantConfig.type} Assistant
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => copyToClipboard(assistantConfig.address, `${assistantKey} address`)}
                                className="btn-secondary px-1 py-0.5"
                              >
                                {copiedField === `${assistantKey} address` ? (
                                  <CheckCircle className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              {settings.assistantContracts?.[assistantKey] && (
                                <button
                                  onClick={() => handleRemoveAssistant(assistantKey)}
                                  className="btn-error px-1 py-0.5"
                                  title="Remove assistant"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-secondary-400 space-y-0.5">
                            <div>Address: {assistantConfig.address}</div>
                            <div>Bridge: {assistantConfig.bridgeAddress}</div>
                            <div>Route: {assistantConfig.homeNetwork} {assistantConfig.homeTokenSymbol} → {assistantConfig.foreignNetwork} {assistantConfig.foreignTokenSymbol}</div>
                            {assistantConfig.description && (
                              <div>Description: {assistantConfig.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Network Info */}
                  <div className="mt-4 pt-4 border-t border-secondary-800">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-secondary-400">Chain ID:</span>
                        <span className="text-white ml-2">{networkConfig.id}</span>
                      </div>
                      <div>
                        <span className="text-secondary-400">Explorer:</span>
                        <a
                          href={networkConfig.explorer}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-500 hover:text-primary-400 ml-2 flex items-center gap-1"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Global Bridge Instances Management */}
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <Link className="w-5 h-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-white">Global Bridge Instances</h3>
                </div>

                {/* Add New Bridge Instance */}
                {!showAddBridge ? (
                  <button
                    onClick={() => setShowAddBridge(true)}
                    className="btn-secondary flex items-center gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom Bridge Instance
                  </button>
                ) : (
                  <div className="p-4 bg-dark-800 rounded border border-secondary-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Bridge Key (e.g., CUSTOM_USDT_IMPORT)"
                        value={newBridge.key || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, key: e.target.value }))}
                        className="input-field text-sm"
                      />
                      <select
                        value={newBridge.type || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, type: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="">Select Type</option>
                        <option value="import">Import</option>
                        <option value="export">Export</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="Bridge Address (0x...)"
                      value={newBridge.address || ''}
                      onChange={(e) => setNewBridge(prev => ({ ...prev, address: e.target.value }))}
                      className={`input-field text-sm ${
                        newBridge.address && !validateContractAddress(newBridge.address)
                          ? 'border-error-500'
                          : ''
                      }`}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newBridge.homeNetwork || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, homeNetwork: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="">Home Network</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="BNB Smart Chain">BNB Smart Chain</option>
                        <option value="3DPass">3DPass</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Home Token (e.g., USDT)"
                        value={newBridge.homeTokenSymbol || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, homeTokenSymbol: e.target.value }))}
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newBridge.foreignNetwork || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, foreignNetwork: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="">Foreign Network</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="BNB Smart Chain">BNB Smart Chain</option>
                        <option value="3DPass">3DPass</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Foreign Token (e.g., wUSDT)"
                        value={newBridge.foreignTokenSymbol || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, foreignTokenSymbol: e.target.value }))}
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Stake Token Symbol (e.g., P3D)"
                        value={newBridge.stakeTokenSymbol || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, stakeTokenSymbol: e.target.value }))}
                        className="input-field text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={newBridge.description || ''}
                        onChange={(e) => setNewBridge(prev => ({ ...prev, description: e.target.value }))}
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddBridge}
                        className="btn-primary px-3"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowAddBridge(false);
                          setNewBridge({});
                        }}
                        className="btn-outline px-3"
                      >
                        Cancel
                      </button>
                    </div>
                    {newBridge.address && !validateContractAddress(newBridge.address) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid bridge address
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Global Assistant Contracts Management */}
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-5 h-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-white">Global Assistant Contracts</h3>
                </div>

                {/* Add New Assistant Contract */}
                {!showAddAssistant ? (
                  <button
                    onClick={() => setShowAddAssistant(true)}
                    className="btn-secondary flex items-center gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom Assistant Contract
                  </button>
                ) : (
                  <div className="p-4 bg-dark-800 rounded border border-secondary-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Assistant Key (e.g., CUSTOM_USDT_IMPORT_ASSISTANT)"
                        value={newAssistant.key || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, key: e.target.value }))}
                        className="input-field text-sm"
                      />
                      <select
                        value={newAssistant.type || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, type: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="">Select Type</option>
                        <option value="import">Import Assistant</option>
                        <option value="export">Export Assistant</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Assistant Address (0x...)"
                        value={newAssistant.address || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, address: e.target.value }))}
                        className={`input-field text-sm ${
                          newAssistant.address && !validateContractAddress(newAssistant.address)
                            ? 'border-error-500'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        placeholder="Bridge Address (0x...)"
                        value={newAssistant.bridgeAddress || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, bridgeAddress: e.target.value }))}
                        className={`input-field text-sm ${
                          newAssistant.bridgeAddress && !validateContractAddress(newAssistant.bridgeAddress)
                            ? 'border-error-500'
                            : ''
                        }`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newAssistant.homeNetwork || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, homeNetwork: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="">Home Network</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="BNB Smart Chain">BNB Smart Chain</option>
                        <option value="3DPass">3DPass</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Home Token (e.g., USDT)"
                        value={newAssistant.homeTokenSymbol || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, homeTokenSymbol: e.target.value }))}
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newAssistant.foreignNetwork || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, foreignNetwork: e.target.value }))}
                        className="input-field text-sm"
                      >
                        <option value="">Foreign Network</option>
                        <option value="Ethereum">Ethereum</option>
                        <option value="BNB Smart Chain">BNB Smart Chain</option>
                        <option value="3DPass">3DPass</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Foreign Token (e.g., wUSDT)"
                        value={newAssistant.foreignTokenSymbol || ''}
                        onChange={(e) => setNewAssistant(prev => ({ ...prev, foreignTokenSymbol: e.target.value }))}
                        className="input-field text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={newAssistant.description || ''}
                      onChange={(e) => setNewAssistant(prev => ({ ...prev, description: e.target.value }))}
                      className="input-field text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddAssistant}
                        className="btn-primary px-3"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowAddAssistant(false);
                          setNewAssistant({});
                        }}
                        className="btn-outline px-3"
                      >
                        Cancel
                      </button>
                    </div>
                    {(newAssistant.address && !validateContractAddress(newAssistant.address)) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid assistant address
                      </p>
                    )}
                    {(newAssistant.bridgeAddress && !validateContractAddress(newAssistant.bridgeAddress)) && (
                      <p className="text-error-500 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Invalid bridge address
                      </p>
                    )}
                  </div>
                )}
              </div>


              {/* Help Section */}
              <div className="card bg-secondary-900/50">
                <h4 className="text-sm font-semibold text-white mb-2">Need Help?</h4>
                <div className="text-xs text-secondary-400 space-y-1">
                  <p>• Use custom RPC URLs for better performance or privacy</p>
                  <p>• Custom contract addresses allow you to use your own deployments</p>
                  <p>• Add custom tokens to support additional ERC-20 tokens</p>
                  <p>• Configure custom bridge instances for different routes</p>
                  <p>• Set up assistant contracts for automated bridge operations</p>
                  <p>• Settings are saved locally in your browser</p>
                  <p>• Reset to defaults if you encounter issues</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-secondary-800 bg-dark-800">
            <button
              onClick={handleResetSettings}
              className="btn-secondary flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="btn-primary flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SettingsDialog; 