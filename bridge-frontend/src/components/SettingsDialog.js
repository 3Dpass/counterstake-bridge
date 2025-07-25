import React, { useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { 
  Settings, 
  Network, 
  Save, 
  RotateCcw, 
  X,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle
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
    resetSettings
  } = useSettings();
  const [copiedField, setCopiedField] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

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
          className="bg-dark-900 border border-secondary-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-7.2rem)] sm:max-h-[calc(100vh-10.8rem)] overflow-hidden relative"
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
                  <div>
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

              {/* Help Section */}
              <div className="card bg-secondary-900/50">
                <h4 className="text-sm font-semibold text-white mb-2">Need Help?</h4>
                <div className="text-xs text-secondary-400 space-y-1">
                  <p>• Use custom RPC URLs for better performance or privacy</p>
                  <p>• Custom contract addresses allow you to use your own deployments</p>
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