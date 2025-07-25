import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useSettings } from '../contexts/SettingsContext';
import { NETWORKS } from '../config/networks';
import { 
  getPendingTransfers, 
  claimTransfer, 
  getAssistantContract,
  getTransferStatus 
} from '../utils/bridge-contracts';
import { createBridgeContract } from '../utils/bridge-contracts';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowUpRight, 
  ArrowDownLeft,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const TransferList = () => {
  const { account, provider, signer, network, isConnected } = useWeb3();
  const { getNetworkWithSettings } = useSettings();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  // Load pending transfers
  const loadTransfers = useCallback(async () => {
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

      const { exportFactory, importFactory } = networkConfig.contracts;
      
      if (!exportFactory || !importFactory) {
        throw new Error('Bridge contracts not configured for this network');
      }

      // Create contract instances
      const exportContract = createBridgeContract(provider, exportFactory, network.symbol, 'export');
      const importContract = createBridgeContract(provider, importFactory, network.symbol, 'import');

      // Get pending transfers
      const pendingTransfers = await getPendingTransfers(exportContract, importContract, account);
      
      // Get status for each transfer
      const transfersWithStatus = await Promise.all(
        pendingTransfers.map(async (transfer) => {
          const status = await getTransferStatus(transfer.contract, transfer.id);
          return { ...transfer, ...status };
        })
      );

      setTransfers(transfersWithStatus);
    } catch (error) {
      console.error('Error loading transfers:', error);
      toast.error(`Failed to load transfers: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [account, provider, network, getNetworkWithSettings]);

  // Refresh transfers
  const refreshTransfers = async () => {
    setRefreshing(true);
    await loadTransfers();
    setRefreshing(false);
  };

  // Claim a transfer
  const handleClaim = async (transfer) => {
    if (!signer || !network) {
      toast.error('Please connect your wallet first');
      return;
    }

    setClaiming(prev => ({ ...prev, [transfer.id]: true }));
    
    try {
      const networkKey = Object.keys(NETWORKS).find(key => NETWORKS[key].id === network.id);
      if (!networkKey) {
        throw new Error('Network configuration not found');
      }
      
      const networkConfig = getNetworkWithSettings(networkKey);
      const { assistantFactory } = networkConfig.contracts;
      
      if (!assistantFactory) {
        throw new Error('Assistant factory not configured for this network');
      }

      // Get assistant contract
      const assistantContract = await getAssistantContract(
        transfer.contract, 
        provider, 
        assistantFactory
      );

      if (!assistantContract) {
        throw new Error('No assistant contract found for this transfer');
      }

      // Connect signer to assistant contract
      const assistantWithSigner = assistantContract.connect(signer);

      // Claim the transfer
      const receipt = await claimTransfer(assistantWithSigner, transfer, account);
      
      toast.success(`Transfer claimed successfully! Hash: ${receipt.transactionHash}`);
      
      // Refresh the transfer list
      await loadTransfers();
      
    } catch (error) {
      console.error('Error claiming transfer:', error);
      toast.error(`Claim failed: ${error.message}`);
    } finally {
      setClaiming(prev => ({ ...prev, [transfer.id]: false }));
    }
  };

  // Load transfers on mount and when dependencies change
  useEffect(() => {
    if (isConnected) {
      loadTransfers();
    }
  }, [loadTransfers, isConnected]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      loadTransfers();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadTransfers, isConnected]);

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="text-secondary-400 mb-4">
          <Clock className="w-12 h-12 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
          <p className="text-secondary-400">
            Connect your wallet to view and claim your transfers
          </p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'claimed':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-error-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-warning-500" />;
      default:
        return <Clock className="w-5 h-5 text-secondary-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmed';
      case 'claimed':
        return 'Claimed';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'text-success-500';
      case 'claimed':
        return 'text-success-500';
      case 'failed':
        return 'text-error-500';
      case 'pending':
        return 'text-warning-500';
      default:
        return 'text-secondary-400';
    }
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount) => {
    return parseFloat(amount).toFixed(6);
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Transfer History</h2>
          <p className="text-secondary-400">
            View and claim your pending transfers
          </p>
        </div>
        <button
          onClick={refreshTransfers}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-secondary-400">Loading transfers...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && transfers.length === 0 && (
        <div className="text-center py-12">
          <div className="text-secondary-400 mb-4">
            <Clock className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Transfers Found</h3>
            <p className="text-secondary-400">
              You don't have any pending transfers to claim
            </p>
          </div>
        </div>
      )}

      {/* Transfer List */}
      <AnimatePresence>
        {transfers.map((transfer, index) => (
          <motion.div
            key={transfer.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: index * 0.1 }}
            className="card mb-4"
          >
            <div className="flex items-center justify-between">
              {/* Transfer Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  {transfer.type === 'export' ? (
                    <ArrowUpRight className="w-5 h-5 text-primary-500" />
                  ) : (
                    <ArrowDownLeft className="w-5 h-5 text-accent-500" />
                  )}
                  <span className="text-sm font-medium text-white">
                    {transfer.type === 'export' ? 'Export' : 'Import'}
                  </span>
                  {getStatusIcon(transfer.status)}
                  <span className={`text-sm font-medium ${getStatusColor(transfer.status)}`}>
                    {getStatusText(transfer.status)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-secondary-400">Amount:</span>
                    <span className="text-white ml-2 font-medium">
                      {formatAmount(transfer.amount)} {network.symbol}
                    </span>
                  </div>
                  
                  {parseFloat(transfer.reward) > 0 && (
                    <div>
                      <span className="text-secondary-400">Reward:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatAmount(transfer.reward)} {network.symbol}
                      </span>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-secondary-400">Date:</span>
                    <span className="text-white ml-2">
                      {formatDate(transfer.timestamp)}
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <span className="text-secondary-400 text-sm">Destination:</span>
                  <span className="text-white ml-2 text-sm font-mono">
                    {formatAddress(transfer.destinationAddress)}
                  </span>
                </div>

                {transfer.blockNumber && (
                  <div className="mt-2">
                    <span className="text-secondary-400 text-sm">Block:</span>
                    <span className="text-white ml-2 text-sm font-mono">
                      {transfer.blockNumber}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 ml-4">
                {/* View on Explorer */}
                <a
                  href={`${network.explorer}/tx/${transfer.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary btn-sm flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View
                </a>

                {/* Claim Button */}
                {transfer.status === 'confirmed' && (
                  <button
                    onClick={() => handleClaim(transfer)}
                    disabled={claiming[transfer.id]}
                    className="btn-primary btn-sm flex items-center gap-2"
                  >
                    {claiming[transfer.id] ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Claiming...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Claim
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default TransferList; 