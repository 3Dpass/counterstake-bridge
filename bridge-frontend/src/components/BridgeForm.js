import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { getTokenBalance, isValidAddress, isValidAmount } from '../utils/web3';
import { transferToForeignChain, createBridgeContract } from '../utils/bridge-contracts';
import { AlertCircle, ArrowDown, ArrowRightLeft, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import Expatriation from './Expatriation';
import Repatriation from './Repatriation';
import toast from 'react-hot-toast';

// Utility function for precise balance comparison
const compareBalances = (amount, balance, tolerance = 0.000001) => {
  const numAmount = Number(amount);
  const numBalance = Number(balance);
  
  // Check if either value is NaN
  if (isNaN(numAmount) || isNaN(numBalance)) {
    console.error('Invalid balance comparison values:', { amount, balance, numAmount, numBalance });
    return false;
  }
  
  // Use tolerance for floating point precision issues
  return numAmount <= numBalance + tolerance;
};

const BridgeForm = () => {
  const { account, provider, signer, network, isConnected } = useWeb3();
  const { getNetworkWithSettings, getBridgeInstancesWithSettings } = useSettings();
  
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
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [bridgeOperation, setBridgeOperation] = useState(null); // 'expatriation' or 'repatriation'
  const [selectedBridgeInstance, setSelectedBridgeInstance] = useState(null);
  const [showExpatriationFlow, setShowExpatriationFlow] = useState(false);
  const [showRepatriationFlow, setShowRepatriationFlow] = useState(false);
  const [showDestinationAddress, setShowDestinationAddress] = useState(false);

  // Get available networks excluding current network
  const getAvailableNetworks = () => {
    if (!network) return Object.values(NETWORKS);
    return Object.values(NETWORKS).filter(n => n.id !== network.id);
  };

  // Get available tokens for a network
  const getAvailableTokens = useCallback((networkName) => {
    if (!networkName) return [];
    const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].name === networkName);
    if (!networkKey) return [];
    
    const network = getNetworkWithSettings(networkKey);
    if (!network) return [];
    
    // For 3DPass, all tokens are ERC20 precompiles
    if (networkName === '3DPass') {
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
  }, [getNetworkWithSettings]);

  // Get available source tokens for a network (filtered by export bridges)
  const getAvailableSourceTokens = useCallback((sourceNetwork) => {
    if (!sourceNetwork) return [];
    
    console.log('🔍 getAvailableSourceTokens called with:', { sourceNetwork });
    
    const bridgeInstances = getBridgeInstancesWithSettings();
    console.log('📋 All bridge instances for source tokens:', bridgeInstances);
    
    const availableTokenAddresses = new Set();
    
    // Find all export bridges where this network is the home network
    Object.values(bridgeInstances).forEach(bridge => {
      console.log('🔍 Checking export bridge for source tokens:', {
        bridgeHomeNetwork: bridge.homeNetwork,
        bridgeHomeTokenAddress: bridge.homeTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.homeNetwork === sourceNetwork,
        isExport: bridge.type === 'export'
      });
      
      if (bridge.homeNetwork === sourceNetwork && bridge.type === 'export') {
        console.log('✅ Found export bridge for source network:', bridge);
        availableTokenAddresses.add(bridge.homeTokenAddress);
      }
    });
    
    // Find all import bridges where this network is the foreign network
    Object.values(bridgeInstances).forEach(bridge => {
      console.log('🔍 Checking import bridge for source tokens:', {
        bridgeForeignNetwork: bridge.foreignNetwork,
        bridgeForeignTokenAddress: bridge.foreignTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.foreignNetwork === sourceNetwork,
        isImport: bridge.type === 'import'
      });
      
      if (bridge.foreignNetwork === sourceNetwork && (bridge.type === 'import' || bridge.type === 'import_wrapper')) {
        console.log('✅ Found import bridge for source network:', bridge);
        availableTokenAddresses.add(bridge.foreignTokenAddress);
      }
    });
    
    console.log('🎯 Available token addresses:', Array.from(availableTokenAddresses));
    
    // Get all tokens for this network
    const allTokens = getAvailableTokens(sourceNetwork);
    console.log('📋 All tokens for network:', allTokens);
    
    // Filter tokens that are available in bridge instances
    const result = allTokens.filter(token => {
      const tokenAddress = token.address.toLowerCase();
      const isAvailable = Array.from(availableTokenAddresses).some(bridgeTokenAddress => 
        bridgeTokenAddress?.toLowerCase() === tokenAddress
      );
      console.log('🔍 Token check:', { tokenSymbol: token.symbol, tokenAddress, isAvailable });
      return isAvailable;
    });
    
    console.log('🎯 Final available source tokens:', result);
    return result;
  }, [getBridgeInstancesWithSettings, getAvailableTokens]);

  // Get available destination networks for a given source network and token
  const getAvailableDestinationNetworks = useCallback((sourceNetwork, sourceTokenAddress) => {
    if (!sourceNetwork || !sourceTokenAddress) return [];
    
    console.log('🔍 getAvailableDestinationNetworks called with:', { sourceNetwork, sourceTokenAddress });
    
    const bridgeInstances = getBridgeInstancesWithSettings();
    console.log('📋 All bridge instances:', bridgeInstances);
    
    const availableDestinations = new Set();
    
    // Check export bridges (source = home network)
    Object.values(bridgeInstances).forEach(bridge => {
      console.log('🔍 Checking export bridge:', {
        bridgeHomeNetwork: bridge.homeNetwork,
        bridgeHomeTokenAddress: bridge.homeTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.homeNetwork === sourceNetwork,
        matchesSourceToken: bridge.homeTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase(),
        isExport: bridge.type === 'export'
      });
      
      if (bridge.homeNetwork === sourceNetwork && 
          bridge.homeTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase() &&
          bridge.type === 'export') {
        console.log('✅ Found matching export bridge:', bridge);
        console.log('🎯 Adding foreign network to destinations:', bridge.foreignNetwork);
        availableDestinations.add(bridge.foreignNetwork);
      }
    });
    
    // Check import bridges (source = foreign network)
    Object.values(bridgeInstances).forEach(bridge => {
      console.log('🔍 Checking import bridge:', {
        bridgeForeignNetwork: bridge.foreignNetwork,
        bridgeForeignTokenAddress: bridge.foreignTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.foreignNetwork === sourceNetwork,
        matchesSourceToken: bridge.foreignTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase(),
        isImport: bridge.type === 'import'
      });
      
      if (bridge.foreignNetwork === sourceNetwork && 
          bridge.foreignTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase() &&
          (bridge.type === 'import' || bridge.type === 'import_wrapper')) {
        console.log('✅ Found matching import bridge:', bridge);
        console.log('🎯 Adding home network to destinations:', bridge.homeNetwork);
        availableDestinations.add(bridge.homeNetwork);
      }
    });
    
    console.log('🎯 Available destinations Set:', availableDestinations);
    console.log('🎯 Available destinations Array:', Array.from(availableDestinations));
    
    // Get network objects for the destination networks
    // Bridge instances now use network names like "Ethereum", "3DPass", "BNB Smart Chain"
    // NETWORKS object has network objects with .name property
    const allNetworks = Object.values(NETWORKS);
    console.log('📋 All available networks:', allNetworks.map(n => ({ symbol: n.symbol, name: n.name })));
    
    const result = allNetworks.filter(net => {
      // Match by network name (bridge instances use network names like "Ethereum", "3DPass")
      const isIncluded = availableDestinations.has(net.name);
      console.log(`🔍 Network ${net.symbol} (${net.name}) - included: ${isIncluded}`);
      return isIncluded;
    });
    
    console.log('🌐 Final destination networks:', result);
    console.log('🌐 Final destination networks count:', result.length);
    return result;
  }, [getBridgeInstancesWithSettings]);

  // Get available destination tokens for a given route
  const getAvailableDestinationTokens = useCallback((sourceNetwork, sourceTokenAddress, destinationNetwork) => {
    if (!sourceNetwork || !sourceTokenAddress || !destinationNetwork) return [];
    
    console.log('🔍 getAvailableDestinationTokens called with:', { sourceNetwork, sourceTokenAddress, destinationNetwork });
    
    const bridgeInstances = getBridgeInstancesWithSettings();
    console.log('📋 All bridge instances for destination tokens:', bridgeInstances);
    
    // Bridge instances use network keys (e.g., "ETHEREUM") as network names
    // So we use the destination network key directly for matching
    const destinationNetworkName = destinationNetwork;
    console.log('🔍 Destination network name for bridge matching:', destinationNetworkName);
    
    const availableTokenAddresses = new Set();
    
    // Check export bridges (source = home, destination = foreign)
    Object.values(bridgeInstances).forEach(bridge => {
      console.log('🔍 Checking export bridge for destination tokens:', {
        bridgeHomeNetwork: bridge.homeNetwork,
        bridgeHomeTokenAddress: bridge.homeTokenAddress,
        bridgeForeignNetwork: bridge.foreignNetwork,
        bridgeForeignTokenAddress: bridge.foreignTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.homeNetwork === sourceNetwork,
        matchesSourceToken: bridge.homeTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase(),
        matchesDestinationNetwork: bridge.foreignNetwork === destinationNetworkName,
        isExport: bridge.type === 'export'
      });
      
      if (bridge.homeNetwork === sourceNetwork && 
          bridge.homeTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase() &&
          bridge.foreignNetwork === destinationNetworkName &&
          bridge.type === 'export') {
        console.log('✅ Found matching export bridge for destination tokens:', bridge);
        console.log('🎯 Adding foreign token address to destinations:', bridge.foreignTokenAddress);
        availableTokenAddresses.add(bridge.foreignTokenAddress);
      }
    });
    
    // Check import bridges (source = foreign, destination = home)
    Object.values(bridgeInstances).forEach(bridge => {
      console.log('🔍 Checking import bridge for destination tokens:', {
        bridgeForeignNetwork: bridge.foreignNetwork,
        bridgeForeignTokenAddress: bridge.foreignTokenAddress,
        bridgeHomeNetwork: bridge.homeNetwork,
        bridgeHomeTokenAddress: bridge.homeTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.foreignNetwork === sourceNetwork,
        matchesSourceToken: bridge.foreignTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase(),
        matchesDestinationNetwork: bridge.homeNetwork === destinationNetworkName,
        isImport: bridge.type === 'import'
      });
      
      if (bridge.foreignNetwork === sourceNetwork && 
          bridge.foreignTokenAddress?.toLowerCase() === sourceTokenAddress?.toLowerCase() &&
          bridge.homeNetwork === destinationNetworkName &&
          (bridge.type === 'import' || bridge.type === 'import_wrapper')) {
        console.log('✅ Found matching import bridge for destination tokens:', bridge);
        console.log('🎯 Adding home token address to destinations:', bridge.homeTokenAddress);
        availableTokenAddresses.add(bridge.homeTokenAddress);
      }
    });
    
    console.log('🎯 Available token addresses for destination:', Array.from(availableTokenAddresses));
    
    // Get the network configuration for the destination network
    // destinationNetwork is now the network name (e.g., "Ethereum")
    const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].name === destinationNetwork);
    console.log('🔍 Network key for destination network:', networkKey);
    
    if (!networkKey || !NETWORKS[networkKey]) {
      console.log('❌ No network key found for destination network:', destinationNetwork);
      return [];
    }
    
    const network = getNetworkWithSettings(networkKey);
    console.log('📋 Network configuration for destination:', network);
    
    if (!network) {
      console.log('❌ No network configuration found for destination network:', destinationNetwork);
      return [];
    }
    
    // Get all tokens for the destination network
    const allTokens = getAvailableTokens(destinationNetwork);
    console.log('📋 All tokens for destination network:', allTokens);
    console.log('📋 Available token addresses from bridges:', Array.from(availableTokenAddresses));
    
    // Filter tokens that are available in bridge instances
    const result = allTokens.filter(token => {
      const tokenAddress = token.address.toLowerCase();
      const isAvailable = Array.from(availableTokenAddresses).some(bridgeTokenAddress => 
        bridgeTokenAddress?.toLowerCase() === tokenAddress
      );
      console.log('🔍 Token check for destination:', { 
        tokenSymbol: token.symbol, 
        tokenAddress, 
        isAvailable,
        availableTokenAddresses: Array.from(availableTokenAddresses)
      });
      return isAvailable;
    });
    
    console.log('🎯 Final available destination tokens:', result);
    return result;
  }, [getBridgeInstancesWithSettings, getNetworkWithSettings, getAvailableTokens]);

  // Find bridge instance and determine operation type
  const findBridgeInstanceAndOperation = useCallback((sourceNetwork, sourceTokenAddress, destinationNetwork, destinationTokenAddress) => {
    const bridgeInstances = getBridgeInstancesWithSettings();
    
    console.log('🔍 findBridgeInstanceAndOperation called with:', {
      sourceNetwork,
      sourceTokenAddress,
      destinationNetwork,
      destinationTokenAddress
    });
    
    console.log('📋 All bridge instances:', bridgeInstances);
    
    // Try to find as expatriation (export bridge: home -> foreign)
    const expatriationBridge = Object.values(bridgeInstances).find(bridge => {
      const matches = bridge.homeNetwork === sourceNetwork && 
        bridge.homeTokenAddress.toLowerCase() === sourceTokenAddress.toLowerCase() &&
        bridge.foreignNetwork === destinationNetwork && 
        bridge.foreignTokenAddress.toLowerCase() === destinationTokenAddress.toLowerCase() &&
        bridge.type === 'export';
      
      console.log('🔍 Checking expatriation bridge:', {
        bridgeHomeNetwork: bridge.homeNetwork,
        bridgeHomeTokenAddress: bridge.homeTokenAddress,
        bridgeForeignNetwork: bridge.foreignNetwork,
        bridgeForeignTokenAddress: bridge.foreignTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.homeNetwork === sourceNetwork,
        matchesSourceToken: bridge.homeTokenAddress.toLowerCase() === sourceTokenAddress.toLowerCase(),
        matchesDestinationNetwork: bridge.foreignNetwork === destinationNetwork,
        matchesDestinationToken: bridge.foreignTokenAddress.toLowerCase() === destinationTokenAddress.toLowerCase(),
        matchesType: bridge.type === 'export',
        matches
      });
      
      return matches;
    });
    
    if (expatriationBridge) {
      console.log('✅ Found expatriation bridge:', expatriationBridge);
      return { 
        bridgeInstance: expatriationBridge, 
        operation: 'expatriation',
        direction: 'export'
      };
    }
    
    // Try to find as repatriation (import bridge: foreign -> home)
    const repatriationBridge = Object.values(bridgeInstances).find(bridge => {
      const matches = bridge.foreignNetwork === sourceNetwork && 
        bridge.foreignTokenAddress.toLowerCase() === sourceTokenAddress.toLowerCase() &&
        bridge.homeNetwork === destinationNetwork && 
        bridge.homeTokenAddress.toLowerCase() === destinationTokenAddress.toLowerCase() &&
        (bridge.type === 'import' || bridge.type === 'import_wrapper');
      
      console.log('🔍 Checking repatriation bridge:', {
        bridgeForeignNetwork: bridge.foreignNetwork,
        bridgeForeignTokenAddress: bridge.foreignTokenAddress,
        bridgeHomeNetwork: bridge.homeNetwork,
        bridgeHomeTokenAddress: bridge.homeTokenAddress,
        bridgeType: bridge.type,
        matchesSourceNetwork: bridge.foreignNetwork === sourceNetwork,
        matchesSourceToken: bridge.foreignTokenAddress.toLowerCase() === sourceTokenAddress.toLowerCase(),
        matchesDestinationNetwork: bridge.homeNetwork === destinationNetwork,
        matchesDestinationToken: bridge.homeTokenAddress.toLowerCase() === destinationTokenAddress.toLowerCase(),
        matchesType: bridge.type === 'import' || bridge.type === 'import_wrapper',
        matches
      });
      
      return matches;
    });
    
    if (repatriationBridge) {
      console.log('✅ Found repatriation bridge:', repatriationBridge);
      return { 
        bridgeInstance: repatriationBridge, 
        operation: 'repatriation',
        direction: 'import'
      };
    }
    
    console.log('❌ No bridge instance found');
    return { bridgeInstance: null, operation: null, direction: null };
  }, [getBridgeInstancesWithSettings]);

  // Load balances
  const loadBalances = useCallback(async () => {
    if (!account || !provider || !formData.sourceNetwork) return;
    
    console.log('🔄 loadBalances called with:', { account, sourceNetwork: formData.sourceNetwork });
    
    const tokens = getAvailableSourceTokens(formData.sourceNetwork);
    console.log('📋 Available tokens for balance loading:', tokens);
    
    const newBalances = {};
    
    for (const token of tokens) {
      try {
        console.log(`🔍 Loading balance for ${token.symbol} (${token.address})`);
        const balance = await getTokenBalance(
          provider,
          token.address,
          account,
          token.decimals,
          token.isPrecompile
        );
        console.log(`💰 Balance for ${token.symbol}:`, balance);
        newBalances[token.symbol] = balance;
      } catch (error) {
        console.error(`Error loading balance for ${token.symbol}:`, error);
        newBalances[token.symbol] = '0';
      }
    }
    
    console.log('📊 Final balances object:', newBalances);
    setBalances(newBalances);
  }, [account, provider, formData.sourceNetwork, getAvailableSourceTokens]);

  // Detect bridge operation when destination token is selected
  const detectBridgeOperation = useCallback(() => {
    if (!formData.sourceNetwork || !formData.sourceToken || !formData.destinationNetwork || !formData.destinationToken) {
      setBridgeOperation(null);
      setSelectedBridgeInstance(null);
      return;
    }
    
    // Find the source token address
    const sourceTokens = getAvailableSourceTokens(formData.sourceNetwork);
    const sourceToken = sourceTokens.find(t => t.symbol === formData.sourceToken);
    
    if (!sourceToken) {
      console.error('Source token not found');
      return;
    }
    
    // Find the destination token address
    const destinationTokens = getAvailableDestinationTokens(formData.sourceNetwork, sourceToken.address, formData.destinationNetwork);
    const destinationToken = destinationTokens.find(t => t.symbol === formData.destinationToken);
    
    if (!destinationToken) {
      console.error('Destination token not found');
          return;
    }
    
    // Find the specific bridge instance for this transfer
    const { bridgeInstance, operation } = findBridgeInstanceAndOperation(
      formData.sourceNetwork, 
      sourceToken.address, 
      formData.destinationNetwork, 
      destinationToken.address
    );
    
    if (bridgeInstance) {
      setBridgeOperation(operation);
      setSelectedBridgeInstance(bridgeInstance);
    } else {
      setBridgeOperation(null);
      setSelectedBridgeInstance(null);
    }
  }, [formData.sourceNetwork, formData.sourceToken, formData.destinationNetwork, formData.destinationToken, getAvailableSourceTokens, getAvailableDestinationTokens, findBridgeInstanceAndOperation]);

  // Handle form changes
  const handleInputChange = (field, value) => {
    console.log('🔄 handleInputChange called:', { field, value });
    
    // Special handling for destination address validation
    if (field === 'destinationAddress') {
      // Only allow valid Ethereum address characters
      const validAddressRegex = /^[0-9a-fA-Fx]*$/;
      if (value && !validAddressRegex.test(value)) {
        // Don't update the value if it contains invalid characters
        return;
      }
      
      // Limit length to prevent overly long inputs
      if (value.length > 42) {
        return;
      }
      
      // Auto-format: ensure it starts with 0x if user types a valid hex
      let formattedValue = value;
      if (value && value.length >= 2 && !value.startsWith('0x') && /^[0-9a-fA-F]{2,}$/.test(value)) {
        formattedValue = '0x' + value;
      }
      
      setFormData(prev => ({ ...prev, [field]: formattedValue }));
      
      // Real-time validation
      if (formattedValue) {
        if (formattedValue.length < 42) {
          setErrors(prev => ({ ...prev, [field]: 'Address must be 42 characters long (including 0x)' }));
        } else if (!isValidAddress(formattedValue)) {
          setErrors(prev => ({ ...prev, [field]: 'Please enter a valid Ethereum address' }));
        } else {
          setErrors(prev => ({ ...prev, [field]: '' }));
        }
      } else {
        setErrors(prev => ({ ...prev, [field]: '' }));
      }
      return;
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-calculate reward when amount changes
    if (field === 'amount' && value && !isNaN(parseFloat(value))) {
      const amount = parseFloat(value);
      const calculatedReward = (amount * 0.03).toFixed(6); // 3% reward
      console.log('💰 Auto-calculating reward:', { amount, calculatedReward });
      setFormData(prev => ({ ...prev, reward: calculatedReward }));
    }
    
    // Clear related fields when network changes
    if (field === 'sourceNetwork') {
      setFormData(prev => ({
        ...prev,
        sourceToken: '',
        destinationNetwork: '',
        destinationToken: '',
        amount: '',
        reward: '0',
      }));
      setBridgeOperation(null);
      setSelectedBridgeInstance(null);
    } else if (field === 'sourceToken') {
      setFormData(prev => ({
        ...prev,
        destinationNetwork: '',
        destinationToken: '',
        amount: '',
        reward: '0',
      }));
      setBridgeOperation(null);
      setSelectedBridgeInstance(null);
    } else if (field === 'destinationNetwork') {
      setFormData(prev => ({
        ...prev,
        destinationToken: '',
      }));
      setBridgeOperation(null);
      setSelectedBridgeInstance(null);
    } else if (field === 'destinationToken') {
      // Detect bridge operation when destination token is selected
      console.log('🎯 Destination token selected, calling detectBridgeOperation');
      setTimeout(() => {
        console.log('⏰ setTimeout callback executing detectBridgeOperation');
        detectBridgeOperation();
      }, 0);
    }
    
    // Clear errors for other fields
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
    
    // Validate that the selected route exists
    if (formData.sourceNetwork && formData.sourceToken && formData.destinationNetwork && formData.destinationToken) {
      const sourceTokens = getAvailableSourceTokens(formData.sourceNetwork);
      const sourceToken = sourceTokens.find(t => t.symbol === formData.sourceToken);
      
      if (sourceToken) {
        const destinationTokens = getAvailableDestinationTokens(formData.sourceNetwork, sourceToken.address, formData.destinationNetwork);
        const destinationToken = destinationTokens.find(t => t.symbol === formData.destinationToken);
        
        if (destinationToken) {
          const { bridgeInstance } = findBridgeInstanceAndOperation(
            formData.sourceNetwork, 
            sourceToken.address, 
            formData.destinationNetwork, 
            destinationToken.address
          );
          
      if (!bridgeInstance) {
        newErrors.general = 'Selected route is not available. Please choose a valid combination of networks and tokens.';
          }
        } else {
          newErrors.general = 'Selected destination token is not available for this route.';
        }
      } else {
        newErrors.general = 'Selected source token is not available for this network.';
      }
    }
    
    if (!formData.amount || !isValidAmount(formData.amount)) {
      newErrors.amount = 'Please enter a valid amount';
    } else {
      const balanceString = balances[formData.sourceToken] || '0';
      
      console.log('🔍 Balance validation:', {
        amount: formData.amount,
        balance: balanceString,
        sourceToken: formData.sourceToken,
        comparison: compareBalances(formData.amount, balanceString)
      });
      
      if (!compareBalances(formData.amount, balanceString)) {
        newErrors.amount = `Insufficient ${formData.sourceToken} balance. You need ${Number(formData.amount).toFixed(18)} ${formData.sourceToken}`;
      }
    }
    
    if (!formData.destinationAddress) {
      newErrors.destinationAddress = 'Please enter receiver\'s address';
    } else if (!isValidAddress(formData.destinationAddress)) {
      newErrors.destinationAddress = 'Please enter a valid address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle expatriation success
  const handleExpatriationSuccess = (txHash) => {
    console.log('✅ Expatriation successful:', txHash);
    
    // Reset form
    setFormData({
      sourceNetwork: '',
      sourceToken: '',
      destinationToken: '',
      destinationNetwork: '',
      amount: '',
      destinationAddress: '',
      reward: '0',
    });
    
    // Reset bridge operation state
    setBridgeOperation(null);
    setSelectedBridgeInstance(null);
    
    // Hide expatriation flow
    setShowExpatriationFlow(false);
    
    // Show success message via toast notification
    toast.success(
      <div>
        <h3 className="text-success-400 font-medium">Success</h3>
        <p className="text-success-300 text-sm mt-1">Expatriation initiated successfully!</p>
      </div>,
      {
        duration: 6000,
        style: {
          background: '#065f46',
          border: '1px solid #047857',
          color: '#fff',
          padding: '16px',
          borderRadius: '8px',
        },
      }
    );
  };

  // Handle expatriation error
  const handleExpatriationError = (error) => {
    console.error('❌ Expatriation failed:', error);
    setErrors({ general: error });
    setShowExpatriationFlow(false);
  };

  // Handle repatriation success
  const handleRepatriationSuccess = (txHash) => {
    console.log('✅ Repatriation successful:', txHash);
    
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
    
    // Reset bridge operation state
    setBridgeOperation(null);
    setSelectedBridgeInstance(null);
    
    // Hide repatriation flow
    setShowRepatriationFlow(false);
    
    // Show success message via toast notification
    toast.success(
      <div>
        <h3 className="text-success-400 font-medium">Success</h3>
        <p className="text-success-300 text-sm mt-1">Repatriation initiated successfully!</p>
      </div>,
      {
        duration: 6000,
        style: {
          background: '#065f46',
          border: '1px solid #047857',
          color: '#fff',
          padding: '16px',
          borderRadius: '8px',
        },
      }
    );
  };

  // Handle repatriation error
  const handleRepatriationError = (error) => {
    console.error('❌ Repatriation failed:', error);
    setErrors({ general: error });
    setShowRepatriationFlow(false);
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
    
    // For expatriation, show the Expatriation component
    if (bridgeOperation === 'expatriation') {
      setShowExpatriationFlow(true);
      return;
    }
    
    // For repatriation, show the Repatriation component
    if (bridgeOperation === 'repatriation') {
      setShowRepatriationFlow(true);
      return;
    }
    
    setIsLoading(true);
    setErrors({});
    
    try {
      // Get network and token information
      const sourceTokens = getAvailableSourceTokens(formData.sourceNetwork);
      const sourceToken = sourceTokens.find(t => t.symbol === formData.sourceToken);
      
      const destinationTokens = getAvailableDestinationTokens(formData.sourceNetwork, sourceToken.address, formData.destinationNetwork);
      const destinationToken = destinationTokens.find(t => t.symbol === formData.destinationToken);
      
      if (!sourceToken || !destinationToken) {
        throw new Error('Invalid network or token configuration');
      }
      
      // Find the specific bridge instance for this transfer
      const { bridgeInstance, direction } = findBridgeInstanceAndOperation(
        formData.sourceNetwork, 
        sourceToken.address, 
        formData.destinationNetwork, 
        destinationToken.address
      );
      
      if (!bridgeInstance) {
        throw new Error('No bridge instance found for this transfer route');
      }
      
      // Create bridge contract using the specific bridge instance
      const contract = createBridgeContract(signer, bridgeInstance.address, formData.sourceNetwork, direction);
      
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
      
      // Show success message via toast notification
      toast.success(
        <div>
          <h3 className="text-success-400 font-medium">Transfer Successful</h3>
          <p className="text-success-300 text-sm mt-1">Transfer initiated successfully!</p>
        </div>,
        {
          duration: 6000,
          style: {
            background: '#065f46',
            border: '1px solid #047857',
            color: '#fff',
            padding: '16px',
            borderRadius: '8px',
          },
        }
      );
      
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



  const availableNetworks = getAvailableNetworks();
  const sourceTokens = getAvailableSourceTokens(formData.sourceNetwork);
  const destinationNetworks = useMemo(() => {
    if (!formData.sourceNetwork || !formData.sourceToken) return [];
    const sourceToken = sourceTokens.find(t => t.symbol === formData.sourceToken);
    return sourceToken ? getAvailableDestinationNetworks(formData.sourceNetwork, sourceToken.address) : [];
  }, [formData.sourceNetwork, formData.sourceToken, sourceTokens, getAvailableDestinationNetworks]);

  const destinationTokens = useMemo(() => {
    if (!formData.sourceNetwork || !formData.sourceToken || !formData.destinationNetwork) return [];
    const sourceToken = sourceTokens.find(t => t.symbol === formData.sourceToken);
    return sourceToken ? getAvailableDestinationTokens(formData.sourceNetwork, sourceToken.address, formData.destinationNetwork) : [];
  }, [formData.sourceNetwork, formData.sourceToken, formData.destinationNetwork, sourceTokens, getAvailableDestinationTokens]);

  // Auto-fill destination address with current account
  useEffect(() => {
    if (account && !formData.destinationAddress) {
      setFormData(prev => ({ ...prev, destinationAddress: account }));
    }
  }, [account, formData.destinationAddress]);

  // Auto-detect bridge operation when all required fields are available
  useEffect(() => {
    if (formData.sourceNetwork && formData.sourceToken && formData.destinationNetwork && destinationTokens.length > 0) {
      console.log('🔍 Auto-detecting bridge operation with available data');
      // If there's only one destination token available, auto-select it
      if (destinationTokens.length === 1 && !formData.destinationToken) {
        const autoSelectedToken = destinationTokens[0];
        console.log('🎯 Auto-selecting destination token:', autoSelectedToken.symbol);
        setFormData(prev => ({ ...prev, destinationToken: autoSelectedToken.symbol }));
        // Trigger bridge operation detection
        setTimeout(() => detectBridgeOperation(), 0);
      } else if (formData.destinationToken) {
        // If destination token is already selected, detect bridge operation
        console.log('🎯 Destination token already selected, detecting bridge operation');
        setTimeout(() => detectBridgeOperation(), 0);
      }
    }
  }, [formData.sourceNetwork, formData.sourceToken, formData.destinationNetwork, destinationTokens, formData.destinationToken, detectBridgeOperation]);

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
                  <option key={net.id} value={net.name}>
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
                  Balance: {Number(balances[formData.sourceToken]).toFixed(12)} {formData.sourceToken}
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
                disabled={!formData.sourceNetwork || !formData.sourceToken}
              >
                <option value="">Select network</option>
                {destinationNetworks.length > 0 ? (
                  destinationNetworks.map((net) => (
                    <option key={net.id} value={net.name}>
                      {net.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    {formData.sourceNetwork && formData.sourceToken 
                      ? 'No routes available for this token' 
                      : 'Select source network and token first'
                    }
                  </option>
                )}
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
                onChange={(e) => {
                  console.log('🎯 Destination token select onChange triggered:', e.target.value);
                  handleInputChange('destinationToken', e.target.value);
                }}
                onClick={() => console.log('🎯 Destination token select clicked')}
                className={`input-field w-full ${errors.destinationToken ? 'border-error-500' : ''}`}
                disabled={!formData.destinationNetwork}
                style={{ opacity: formData.destinationNetwork ? 1 : 0.5 }}
              >
                <option value="">Select token</option>
                {destinationTokens.length > 0 ? (
                  destinationTokens.map((token) => (
                    <option key={token.symbol} value={token.symbol}>
                      {token.symbol} - {token.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    {formData.destinationNetwork 
                      ? 'No tokens available for this route' 
                      : 'Select destination network first'
                    }
                  </option>
                )}
              </select>
              {errors.destinationToken && (
                <p className="text-error-400 text-sm mt-1">{errors.destinationToken}</p>
              )}
            </div>
          </div>

          {/* Amount & Reward for Assistant */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Amount
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', e.target.value)}
                  placeholder="0.0"
                  step="0.000001"
                  className={`input-field w-full pr-16 ${errors.amount ? 'border-error-500' : ''}`}
                />
                {formData.sourceToken && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="text-secondary-400 text-sm font-medium">
                      {formData.sourceToken}
                    </span>
                  </div>
                )}
              </div>
              {errors.amount && (
                <p className="text-error-400 text-sm mt-1">{errors.amount}</p>
              )}
            </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Reward (Recommended)
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
              This will incentivize nodes to speed up the transfer
            </p>
            </div>
          </div>

          {/* Bridge Operation Details */}
          {(() => {
            console.log('🔍 Bridge Operation Details Debug:', {
              bridgeOperation,
              selectedBridgeInstance: selectedBridgeInstance ? 'exists' : 'null',
              formData: {
                sourceNetwork: formData.sourceNetwork,
                sourceToken: formData.sourceToken,
                destinationNetwork: formData.destinationNetwork,
                destinationToken: formData.destinationToken
              },
              destinationTokens: destinationTokens.length,
              destinationNetworks: destinationNetworks.length
            });
            return null;
          })()}
          {bridgeOperation && selectedBridgeInstance && (
            <div className="bg-dark-800 border border-secondary-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                  <ArrowRightLeft className="w-3 h-3 text-white" />
                </div>
                <h3 className="text-white font-semibold">Bridge Operation Details</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-secondary-400 text-sm">Operation Type:</span>
                  <span className={`text-sm font-medium px-2 py-1 rounded ${
                    bridgeOperation === 'expatriation' 
                      ? 'bg-success-900/50 text-success-400 border border-success-700' 
                      : 'bg-warning-900/50 text-warning-400 border border-warning-700'
                  }`}>
                    {bridgeOperation === 'expatriation' ? 'Expatriation' : 'Repatriation'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-secondary-400 text-sm">Direction:</span>
                  <span className="text-white text-sm font-medium">
                    {formData.sourceNetwork} → {formData.destinationNetwork}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-secondary-400 text-sm">Bridge Type:</span>
                  <span className="text-white text-sm font-medium">
                    {bridgeOperation === 'expatriation' ? 'Export Bridge' : 'Import Bridge'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-secondary-400 text-sm">Bridge Contract:</span>
                  <span className="text-white text-sm font-mono">
                    {selectedBridgeInstance.address.slice(0, 6)}...{selectedBridgeInstance.address.slice(-4)}
                  </span>
                </div>
              </div>
            </div>
          )}



          {/* Receiver's Address */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-white">
                To Address {formData.destinationToken && `(${formData.destinationToken})`}
              </label>
              <button
                type="button"
                onClick={() => setShowDestinationAddress(!showDestinationAddress)}
                className="flex items-center space-x-1 text-secondary-400 hover:text-secondary-300 text-sm transition-colors"
              >
                {showDestinationAddress ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    <span>Show</span>
                  </>
                )}
              </button>
            </div>
            
            {showDestinationAddress && (
              <>
                <input
                  type="text"
                  value={formData.destinationAddress}
                  onChange={(e) => handleInputChange('destinationAddress', e.target.value)}
                  onKeyDown={(e) => {
                    // Prevent non-hex characters from being typed
                    const validChars = /[0-9a-fA-Fx]/;
                    const isBackspace = e.key === 'Backspace';
                    const isDelete = e.key === 'Delete';
                    const isArrowKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
                    const isCtrlKey = e.ctrlKey || e.metaKey;
                    
                    if (!isBackspace && !isDelete && !isArrowKey && !isCtrlKey && !validChars.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="0x..."
                  maxLength={42}
                  className={`input-field w-full font-mono ${errors.destinationAddress ? 'border-error-500' : formData.destinationAddress && formData.destinationAddress.length === 42 && isValidAddress(formData.destinationAddress) ? 'border-success-500' : ''}`}
                />
                {errors.destinationAddress && (
                  <p className="text-error-400 text-sm mt-1">{errors.destinationAddress}</p>
                )}
                {formData.destinationAddress && formData.destinationAddress.length === 42 && isValidAddress(formData.destinationAddress) && (
                  <p className="text-success-400 text-sm mt-1">✓ Valid address</p>
                )}
              </>
            )}
            
            {!showDestinationAddress && formData.destinationAddress && (
              <div className="bg-dark-800 border border-secondary-700 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-secondary-400 text-sm">
                    {formData.destinationAddress.slice(0, 6)}...{formData.destinationAddress.slice(-4)}
                  </span>
                  <span className="text-success-400 text-sm">✓ Valid address</span>
                </div>
              </div>
            )}
          </div>

                    {/* Submit Button */}
          {!showExpatriationFlow && !showRepatriationFlow ? (
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
                bridgeOperation === 'expatriation' ? 'Initiate Expatriation' : 
                bridgeOperation === 'repatriation' ? 'Initiate Repatriation' : 'Initiate Transfer'
              )}
            </button>
          ) : null}
        </form>
      </motion.div>

      {/* Expatriation Flow */}
      {showExpatriationFlow && bridgeOperation === 'expatriation' && selectedBridgeInstance && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <div className="card">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white mb-2">Expatriation Process</h3>
              <p className="text-secondary-400 text-sm">
                Getting {formData.sourceToken} locked on {formData.sourceNetwork} and transferring to {formData.destinationNetwork}
              </p>
            </div>
            
            <Expatriation
              bridgeInstance={selectedBridgeInstance}
              formData={formData}
              sourceToken={sourceTokens.find(t => t.symbol === formData.sourceToken)}
              signer={signer}
              onSuccess={handleExpatriationSuccess}
              onError={handleExpatriationError}
            />
          </div>
        </motion.div>
      )}

      {/* Repatriation Flow */}
      {showRepatriationFlow && bridgeOperation === 'repatriation' && selectedBridgeInstance && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <div className="card">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white mb-2">Repatriation Process</h3>
              <p className="text-secondary-400 text-sm">
                Burning {formData.sourceToken} on {formData.sourceNetwork} and transferring to {formData.destinationNetwork}
              </p>
            </div>
            
            <Repatriation
              bridgeInstance={selectedBridgeInstance}
              formData={formData}
              sourceToken={sourceTokens.find(t => t.symbol === formData.sourceToken)}
              signer={signer}
              onSuccess={handleRepatriationSuccess}
              onError={handleRepatriationError}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default BridgeForm; 