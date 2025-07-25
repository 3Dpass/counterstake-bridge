import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS, BRIDGE_CONFIG } from '../config/networks';
import { getTokenBalance, isValidAddress, isValidAmount } from '../utils/web3';
import { createBridgeContract, getRequiredStake, transferToForeignChain } from '../utils/bridge-contracts';
import { AlertCircle, Calculator, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';

const BridgeForm = () => {
  const { account, provider, signer, network, isConnected } = useWeb3();
  const { getNetworkWithSettings } = useSettings();
  
  const [formData, setFormData] = useState({
    sourceNetwork: '',
    sourceToken: '',
    destinationNetwork: '',
    destinationToken: '',
    amount: '',
    destinationAddress: '',
    reward: '0',
  });
  
  const [balances, setBalances] = useState({});
  const [requiredStake, setRequiredStake] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Get available networks excluding current network
  const getAvailableNetworks = () => {
    if (!network) return Object.values(NETWORKS);
    return Object.values(NETWORKS).filter(n => n.id !== network.id);
  };

  // Get available tokens for a network
  const getAvailableTokens = (networkSymbol) => {
    if (!networkSymbol) return [];
    const network = Object.values(NETWORKS).find(n => n.symbol === networkSymbol);
    if (!network) return [];
    
    // For 3DPass, all tokens are ERC20 precompiles
    if (networkSymbol === '3DPass') {
      return Object.values(network.tokens);
    }
    
    // For other networks, include native token
    const tokens = [
      {
        address: '0x0000000000000000000000000000000000000000',
        symbol: network.nativeCurrency.symbol,
        name: network.nativeCurrency.name,
        decimals: network.nativeCurrency.decimals,
        isNative: true,
      },
      ...Object.values(network.tokens),
    ];
    
    return tokens;
  };



  // Load balances
  const loadBalances = useCallback(async () => {
    if (!account || !provider || !formData.sourceNetwork) return;
    
    const tokens = getAvailableTokens(formData.sourceNetwork);
    const newBalances = {};
    
    for (const token of tokens) {
      try {
        const balance = await getTokenBalance(
          provider,
          token.address,
          account,
          token.decimals,
          token.isPrecompile // Pass isPrecompile flag for 3DPass tokens
        );
        newBalances[token.symbol] = balance;
      } catch (error) {
        console.error(`Error loading balance for ${token.symbol}:`, error);
        newBalances[token.symbol] = '0';
      }
    }
    
    setBalances(newBalances);
  }, [account, provider, formData.sourceNetwork]);

  // Calculate required stake
  const calculateStake = useCallback(async () => {
    if (!formData.amount || !isValidAmount(formData.amount)) {
      setRequiredStake('0');
      return;
    }
    
    try {
      // Try to get stake from contract if available
      if (formData.sourceNetwork && formData.sourceToken && provider) {
        const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].symbol === formData.sourceNetwork);
        if (networkKey) {
          const networkConfig = getNetworkWithSettings(networkKey);
          if (networkConfig && networkConfig.contracts.exportFactory) {
            const contract = createBridgeContract(provider, networkConfig.contracts.exportFactory, formData.sourceNetwork, 'export');
            const token = getAvailableTokens(formData.sourceNetwork).find(t => t.symbol === formData.sourceToken);
            const stake = await getRequiredStake(contract, formData.amount, token?.decimals || 18);
            setRequiredStake(stake);
            return;
          }
        }
      }
      
      // Fallback to default calculation
      const amount = parseFloat(formData.amount);
      const stakeRatio = BRIDGE_CONFIG.defaultStakeRatio / 100;
      const stake = amount * stakeRatio;
      
      setRequiredStake(stake.toFixed(6));
    } catch (error) {
      console.error('Error calculating stake:', error);
      // Fallback to default calculation
      const amount = parseFloat(formData.amount);
      const stakeRatio = BRIDGE_CONFIG.defaultStakeRatio / 100;
      const stake = amount * stakeRatio;
      setRequiredStake(stake.toFixed(6));
    }
  }, [formData.amount, formData.sourceNetwork, formData.sourceToken, provider, getNetworkWithSettings]);

  // Handle form changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear related fields when network changes
    if (field === 'sourceNetwork') {
      setFormData(prev => ({
        ...prev,
        sourceToken: '',
        destinationNetwork: '',
        destinationToken: '',
        amount: '',
      }));
    } else if (field === 'destinationNetwork') {
      setFormData(prev => ({
        ...prev,
        destinationToken: '',
      }));
    }
    
    // Clear errors
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.sourceNetwork) {
      newErrors.sourceNetwork = 'Please select source network';
    }
    
    if (!formData.sourceToken) {
      newErrors.sourceToken = 'Please select source token';
    }
    
    if (!formData.destinationNetwork) {
      newErrors.destinationNetwork = 'Please select destination network';
    }
    
    if (!formData.destinationToken) {
      newErrors.destinationToken = 'Please select destination token';
    }
    
    if (!formData.amount || !isValidAmount(formData.amount)) {
      newErrors.amount = 'Please enter a valid amount';
    } else {
      const amount = parseFloat(formData.amount);
      const balance = parseFloat(balances[formData.sourceToken] || '0');
      const totalNeeded = amount + parseFloat(requiredStake);
      
      if (totalNeeded > balance) {
        newErrors.amount = `Insufficient balance. You need ${totalNeeded.toFixed(6)} ${formData.sourceToken}`;
      }
    }
    
    if (!formData.destinationAddress) {
      newErrors.destinationAddress = 'Please enter destination address';
    } else if (!isValidAddress(formData.destinationAddress)) {
      newErrors.destinationAddress = 'Please enter a valid address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      setErrors({ general: 'Please connect your wallet first' });
      return;
    }
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    setErrors({});
    
    try {
      // Get network and token information
      const sourceNetwork = Object.values(NETWORKS).find(n => n.symbol === formData.sourceNetwork);
      const sourceToken = getAvailableTokens(formData.sourceNetwork).find(t => t.symbol === formData.sourceToken);
      
      if (!sourceNetwork || !sourceToken) {
        throw new Error('Invalid network or token configuration');
      }
      
      // Create bridge contract
      const contract = createBridgeContract(signer, sourceNetwork.contracts.exportFactory, formData.sourceNetwork, 'export');
      
      // Execute transfer
      const receipt = await transferToForeignChain(
        contract,
        formData.destinationAddress,
        '', // data
        formData.amount,
        formData.reward,
        sourceToken.decimals,
        sourceToken.isPrecompile
      );
      
      console.log('Transfer successful:', receipt);
      
      // Reset form
      setFormData({
        sourceNetwork: '',
        sourceToken: '',
        destinationNetwork: '',
        destinationToken: '',
        amount: '',
        destinationAddress: '',
        reward: '0',
      });
      
      // Show success message
      setErrors({ success: 'Transfer initiated successfully! Check your transaction hash.' });
      
    } catch (error) {
      console.error('Transfer failed:', error);
      setErrors({ general: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Load balances when account or source network changes
  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  // Calculate stake when amount changes
  useEffect(() => {
    calculateStake();
  }, [calculateStake]);

  // Auto-fill destination address with current account
  useEffect(() => {
    if (account && !formData.destinationAddress) {
      setFormData(prev => ({ ...prev, destinationAddress: account }));
    }
  }, [account, formData.destinationAddress]);

  const availableNetworks = getAvailableNetworks();
  const sourceTokens = getAvailableTokens(formData.sourceNetwork);
  const destinationTokens = getAvailableTokens(formData.destinationNetwork);

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Cross-Chain Transfer</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {errors.general && (
            <div className="bg-error-900/50 border border-error-700 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-error-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-error-400 font-medium">Transfer Failed</h3>
                <p className="text-error-300 text-sm mt-1">{errors.general}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {errors.success && (
            <div className="bg-success-900/50 border border-success-700 rounded-lg p-4 flex items-start space-x-3">
              <div className="w-5 h-5 bg-success-500 rounded-full mt-0.5 flex-shrink-0"></div>
              <div>
                <h3 className="text-success-400 font-medium">Transfer Successful</h3>
                <p className="text-success-300 text-sm mt-1">{errors.success}</p>
              </div>
            </div>
          )}

          {/* Source Network & Token */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Source Network
              </label>
              <select
                value={formData.sourceNetwork}
                onChange={(e) => handleInputChange('sourceNetwork', e.target.value)}
                className={`input-field w-full ${errors.sourceNetwork ? 'border-error-500' : ''}`}
              >
                <option value="">Select network</option>
                {availableNetworks.map((net) => (
                  <option key={net.id} value={net.symbol}>
                    {net.name}
                  </option>
                ))}
              </select>
              {errors.sourceNetwork && (
                <p className="text-error-400 text-sm mt-1">{errors.sourceNetwork}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Source Token
              </label>
              <select
                value={formData.sourceToken}
                onChange={(e) => handleInputChange('sourceToken', e.target.value)}
                className={`input-field w-full ${errors.sourceToken ? 'border-error-500' : ''}`}
                disabled={!formData.sourceNetwork}
              >
                <option value="">Select token</option>
                {sourceTokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
              {formData.sourceToken && balances[formData.sourceToken] && (
                <p className="text-secondary-400 text-sm mt-1">
                  Balance: {parseFloat(balances[formData.sourceToken]).toFixed(6)} {formData.sourceToken}
                </p>
              )}
              {errors.sourceToken && (
                <p className="text-error-400 text-sm mt-1">{errors.sourceToken}</p>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-dark-800 rounded-full flex items-center justify-center border border-secondary-700">
              <ArrowDown className="w-6 h-6 text-secondary-400" />
            </div>
          </div>

          {/* Destination Network & Token */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Destination Network
              </label>
              <select
                value={formData.destinationNetwork}
                onChange={(e) => handleInputChange('destinationNetwork', e.target.value)}
                className={`input-field w-full ${errors.destinationNetwork ? 'border-error-500' : ''}`}
                disabled={!formData.sourceNetwork}
              >
                <option value="">Select network</option>
                {availableNetworks
                  .filter(net => net.symbol !== formData.sourceNetwork)
                  .map((net) => (
                    <option key={net.id} value={net.symbol}>
                      {net.name}
                    </option>
                  ))}
              </select>
              {errors.destinationNetwork && (
                <p className="text-error-400 text-sm mt-1">{errors.destinationNetwork}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Destination Token
              </label>
              <select
                value={formData.destinationToken}
                onChange={(e) => handleInputChange('destinationToken', e.target.value)}
                className={`input-field w-full ${errors.destinationToken ? 'border-error-500' : ''}`}
                disabled={!formData.destinationNetwork}
              >
                <option value="">Select token</option>
                {destinationTokens.map((token) => (
                  <option key={token.symbol} value={token.symbol}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
              {errors.destinationToken && (
                <p className="text-error-400 text-sm mt-1">{errors.destinationToken}</p>
              )}
            </div>
          </div>

          {/* Amount & Destination Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Amount
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.0"
                step="0.000001"
                className={`input-field w-full ${errors.amount ? 'border-error-500' : ''}`}
              />
              {errors.amount && (
                <p className="text-error-400 text-sm mt-1">{errors.amount}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Destination Address
              </label>
              <input
                type="text"
                value={formData.destinationAddress}
                onChange={(e) => handleInputChange('destinationAddress', e.target.value)}
                placeholder="0x..."
                className={`input-field w-full font-mono ${errors.destinationAddress ? 'border-error-500' : ''}`}
              />
              {errors.destinationAddress && (
                <p className="text-error-400 text-sm mt-1">{errors.destinationAddress}</p>
              )}
            </div>
          </div>

          {/* Stake Information */}
          <div className="bg-dark-800 rounded-lg p-4 border border-secondary-700">
            <div className="flex items-center space-x-2 mb-3">
              <Calculator className="w-4 h-4 text-secondary-400" />
              <h3 className="text-sm font-medium text-white">Stake Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-secondary-400">Required Stake</p>
                <p className="text-white font-mono">{requiredStake} {formData.sourceToken}</p>
              </div>
              <div>
                <p className="text-secondary-400">Stake Ratio</p>
                <p className="text-white">{BRIDGE_CONFIG.defaultStakeRatio}%</p>
              </div>
              <div>
                <p className="text-secondary-400">Total Required</p>
                <p className="text-white font-mono">
                  {formData.amount && requiredStake !== '0' 
                    ? (parseFloat(formData.amount) + parseFloat(requiredStake)).toFixed(6)
                    : '0'
                  } {formData.sourceToken}
                </p>
              </div>
            </div>
          </div>

          {/* Reward (Optional) */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Reward for Assistant (Optional)
            </label>
            <input
              type="number"
              value={formData.reward}
              onChange={(e) => handleInputChange('reward', e.target.value)}
              placeholder="0.0"
              step="0.000001"
              className="input-field w-full"
            />
            <p className="text-secondary-400 text-sm mt-1">
              Optional reward to incentivize assistants to process your transfer faster
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !isConnected}
            className="w-full btn-primary py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Processing Transfer...</span>
              </div>
            ) : (
              'Initiate Transfer'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default BridgeForm; 