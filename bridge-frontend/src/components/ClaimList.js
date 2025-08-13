import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { 
  getAllClaims, 
  getClaimsForRecipient, 
  createCounterstakeContract 
} from '../utils/bridge-contracts';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  User,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const ClaimList = () => {
  const { account, provider, network, isConnected } = useWeb3();
  const { getNetworkWithSettings, getBridgeInstancesWithSettings } = useSettings();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' or 'my'
  const [currentBlock, setCurrentBlock] = useState(null);

  // Load claims
  const loadClaims = useCallback(async () => {
    if (!account || !provider || !network) return;

    setLoading(true);
    try {
      const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === network.id);
      if (!networkKey) {
        throw new Error('Network configuration not found');
      }
      
      const networkConfig = getNetworkWithSettings(networkKey);
      if (!networkConfig || !networkConfig.contracts) {
        throw new Error('Network configuration not found');
      }

      // Get bridge instances for this network
      const bridgeInstances = getBridgeInstancesWithSettings();
      const networkBridgeInstances = Object.values(bridgeInstances).filter(bridge => 
        bridge.homeNetwork === network.name || bridge.foreignNetwork === network.name
      );

      if (networkBridgeInstances.length === 0) {
        throw new Error('No bridge instances found for this network');
      }

      // Get current block for timestamp calculations
      const block = await provider.getBlock('latest');
      setCurrentBlock(block);

        // Fetch claims from all bridge instances
        const allClaims = [];
        for (const bridgeInstance of networkBridgeInstances) {
          try {
            const contract = await createCounterstakeContract(provider, bridgeInstance.address);
            
            let bridgeClaims;
            if (filter === 'my') {
              bridgeClaims = await getClaimsForRecipient(contract, account, 100);
            } else {
              bridgeClaims = await getAllClaims(contract, 100);
            }

          // Add bridge information to each claim
          const claimsWithBridgeInfo = bridgeClaims.map(claim => ({
            ...claim,
            bridgeInstance,
            bridgeAddress: bridgeInstance.address,
            bridgeType: bridgeInstance.type,
            homeNetwork: bridgeInstance.homeNetwork,
            foreignNetwork: bridgeInstance.foreignNetwork,
            homeTokenAddress: bridgeInstance.homeTokenAddress,
            foreignTokenAddress: bridgeInstance.foreignTokenAddress
          }));

          allClaims.push(...claimsWithBridgeInfo);
        } catch (error) {
          console.error(`Error loading claims from bridge ${bridgeInstance.address}:`, error);
        }
      }

      // Sort claims by claim number (most recent first)
      allClaims.sort((a, b) => b.claimNum - a.claimNum);

      setClaims(allClaims);
    } catch (error) {
      console.error('Error loading claims:', error);
      toast.error(`Failed to load claims: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [account, provider, network, getNetworkWithSettings, getBridgeInstancesWithSettings, filter]);

  // Refresh claims
  const refreshClaims = async () => {
    setRefreshing(true);
    await loadClaims();
    setRefreshing(false);
  };

  // Load claims on mount and when dependencies change
  useEffect(() => {
    if (isConnected) {
      loadClaims();
    }
  }, [loadClaims, isConnected, filter]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      loadClaims();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadClaims, isConnected]);

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="text-secondary-400 mb-4">
          <Clock className="w-12 h-12 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
          <p className="text-secondary-400">
            Connect your wallet to view claims
          </p>
        </div>
      </div>
    );
  }

  const getClaimStatus = (claim) => {
    if (!currentBlock) return 'unknown';
    
    const now = currentBlock.timestamp;
    const expiryTime = claim.expiryTs.toNumber();
    
    if (claim.finished) {
      return claim.withdrawn ? 'withdrawn' : 'finished';
    }
    
    if (now > expiryTime) {
      return 'expired';
    }
    
    return 'active';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <Clock className="w-5 h-5 text-warning-500" />;
      case 'finished':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'withdrawn':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'expired':
        return <XCircle className="w-5 h-5 text-error-500" />;
      default:
        return <Clock className="w-5 h-5 text-secondary-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'finished':
        return 'Finished';
      case 'withdrawn':
        return 'Withdrawn';
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'text-warning-500';
      case 'finished':
        return 'text-success-500';
      case 'withdrawn':
        return 'text-success-500';
      case 'expired':
        return 'text-error-500';
      default:
        return 'text-secondary-400';
    }
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount, decimals = 18) => {
    try {
      const ethers = require('ethers');
      return parseFloat(ethers.utils.formatUnits(amount, decimals)).toFixed(6);
    } catch (error) {
      return amount.toString();
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getTimeRemaining = (expiryTs) => {
    if (!currentBlock) return '';
    
    const now = currentBlock.timestamp;
    const expiryTime = expiryTs.toNumber();
    const timeRemaining = expiryTime - now;
    
    if (timeRemaining <= 0) {
      return 'Expired';
    }
    
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  const getOutcomeText = (outcome) => {
    return outcome === 0 ? 'NO' : 'YES';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Claims</h2>
          <p className="text-secondary-400">
            View all claims on the current network
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter Toggle */}
          <div className="flex bg-dark-800 rounded-lg p-1">
            <button
              onClick={() => setFilter('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <Users className="w-4 h-4" />
              All Claims
            </button>
            <button
              onClick={() => setFilter('my')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'my'
                  ? 'bg-primary-600 text-white'
                  : 'text-secondary-400 hover:text-white hover:bg-dark-700'
              }`}
            >
              <User className="w-4 h-4" />
              My Claims
            </button>
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={refreshClaims}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-secondary-400">Loading claims...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && claims.length === 0 && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <Clock className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Claims Found</h3>
            <p className="text-secondary-400">
              {filter === 'my' 
                ? 'You don\'t have any claims on this network' 
                : 'No claims found on this network'
              }
            </p>
          </div>
        </div>
      )}

      {/* Claims List */}
      <AnimatePresence>
        {claims.map((claim, index) => {
          const status = getClaimStatus(claim);
          return (
            <motion.div
              key={`${claim.bridgeAddress}-${claim.claimNum}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
              className="card mb-4"
            >
              <div className="flex items-start justify-between">
                {/* Claim Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-medium text-white">
                      Claim #{claim.claimNum}
                    </span>
                    {getStatusIcon(status)}
                    <span className={`text-sm font-medium ${getStatusColor(status)}`}>
                      {getStatusText(status)}
                    </span>
                    <span className="text-sm text-secondary-400">
                      {claim.bridgeType === 'export' ? 'Export' : 'Import'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-secondary-400">Amount:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatAmount(claim.amount)} {network.symbol}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">Recipient:</span>
                      <span className="text-white ml-2 font-mono">
                        {formatAddress(claim.recipientAddress)}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">Current Outcome:</span>
                      <span className="text-white ml-2 font-medium">
                        {getOutcomeText(claim.currentOutcome)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-secondary-400">YES Stakes:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatAmount(claim.yesStake)} {network.symbol}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">NO Stakes:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatAmount(claim.noStake)} {network.symbol}
                      </span>
                    </div>
                    
                    <div>
                      <span className="text-secondary-400">Expiry:</span>
                      <span className="text-white ml-2">
                        {formatDate(claim.expiryTs)}
                      </span>
                    </div>
                  </div>

                  {status === 'active' && (
                    <div className="mt-2">
                      <span className="text-warning-400 text-sm font-medium">
                        {getTimeRemaining(claim.expiryTs)}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 text-xs text-secondary-400">
                    <span>Bridge: {formatAddress(claim.bridgeAddress)}</span>
                    <span className="mx-2">•</span>
                    <span>{claim.homeNetwork} → {claim.foreignNetwork}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ClaimList;
