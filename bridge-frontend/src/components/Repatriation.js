import React, { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { AlertCircle, CheckCircle, ArrowRight, Loader } from 'lucide-react';
import { motion } from 'framer-motion';
import { createBridgeContract } from '../utils/bridge-contracts';

const Repatriation = ({ 
  bridgeInstance, 
  formData, 
  sourceToken, 
  signer, 
  onSuccess, 
  onError 
}) => {
  const [step, setStep] = useState('confirm'); // 'confirm', 'transfer', 'success'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [transferTxHash, setTransferTxHash] = useState('');

  // Create import wrapper contract for repatriation
  const createImportWrapperContract = useCallback(() => {
    // Use the bridge instance address and import wrapper ABI
    return createBridgeContract(signer, bridgeInstance.address, bridgeInstance.homeNetwork, 'import_wrapper');
  }, [signer, bridgeInstance.address, bridgeInstance.homeNetwork]);



  // Handle repatriation transfer
  const handleRepatriation = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('🔄 Starting repatriation process...');
      console.log('📋 Repatriation details:', {
        bridgeAddress: bridgeInstance.address,
        homeAddress: formData.destinationAddress,
        amount: formData.amount,
        reward: formData.reward,
        sourceTokenDecimals: sourceToken.decimals,
        bridgeType: bridgeInstance.type,
        homeNetwork: bridgeInstance.homeNetwork,
        foreignNetwork: bridgeInstance.foreignNetwork
      });

      const contract = createImportWrapperContract();
      const amountWei = ethers.utils.parseUnits(formData.amount, sourceToken.decimals);
      const rewardWei = ethers.utils.parseUnits(formData.reward, sourceToken.decimals);
      const data = "0x"; // Empty data for repatriation
      
      console.log('💰 Parsed amounts:', {
        amountWei: ethers.utils.formatUnits(amountWei, sourceToken.decimals),
        rewardWei: ethers.utils.formatUnits(rewardWei, sourceToken.decimals)
      });

      // Use fixed gas limit like the working test script
      const gasLimit = 500000;
      
      console.log('⛽ Gas limit:', gasLimit);
      
      setStep('transfer');
      
      console.log('🔐 Executing repatriation transfer...');
      const repatriationTx = await contract.transferToHomeChain(
        formData.destinationAddress,
        data,
        amountWei,
        rewardWei,
        { gasLimit: gasLimit }
      );
      
      console.log('⏳ Waiting for repatriation transaction confirmation...');
      const receipt = await repatriationTx.wait();
      
      console.log('✅ Repatriation transaction confirmed:', receipt.transactionHash);
      setTransferTxHash(receipt.transactionHash);
      setStep('success');
      
      // Parse NewRepatriation event if available
      try {
        const newRepatriationEvent = receipt.logs.find(log => {
          try {
            const decoded = contract.interface.parseLog(log);
            return decoded.name === 'NewRepatriation';
          } catch (e) {
            return false;
          }
        });
        
        if (newRepatriationEvent) {
          const decoded = contract.interface.parseLog(newRepatriationEvent);
          console.log('📝 NewRepatriation Event Details:', {
            sender: decoded.args.sender_address,
            amount: ethers.utils.formatUnits(decoded.args.amount, sourceToken.decimals),
            reward: ethers.utils.formatUnits(decoded.args.reward, sourceToken.decimals),
            homeAddress: decoded.args.home_address,
            data: decoded.args.data
          });
        }
      } catch (eventError) {
        console.warn('Could not parse NewRepatriation event:', eventError);
      }
      
      // Call success callback
      if (onSuccess) {
        onSuccess(receipt.transactionHash);
      }
      
    } catch (error) {
      console.error('❌ Repatriation failed:', error);
      setError(error.message || 'Repatriation failed');
      setStep('confirm');
      
      if (onError) {
        onError(error.message || 'Repatriation failed');
      }
    } finally {
      setIsLoading(false);
    }
  };



  const renderStepContent = () => {
    switch (step) {
      case 'confirm':
        return (
          <div className="space-y-6">
   

            <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-warning-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-warning-400 font-medium">Important Notice</h4>
                  <p className="text-warning-300 text-sm mt-1">
                    This repatriation will burn your {sourceToken.symbol} tokens on {bridgeInstance.foreignNetwork} 
                    and initiate the transfer back to {bridgeInstance.homeNetwork}. 
                    The process may take some time to complete.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleRepatriation}
              disabled={isLoading}
              className="w-full btn-primary py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Processing Repatriation...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Initiate Transfer</span>
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </button>
          </div>
        );

      case 'transfer':
        return (
          <div className="space-y-6">
            <div className="bg-primary-900/20 border border-primary-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Loader className="w-5 h-5 text-primary-400 animate-spin" />
                <div>
                  <h4 className="text-primary-400 font-medium">Processing Repatriation</h4>
                  <p className="text-primary-300 text-sm mt-1">
                    Burning {formData.amount} {sourceToken.symbol} and initiating transfer to {bridgeInstance.homeNetwork}...
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-6">
            <div className="bg-success-900/20 border border-success-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-success-400" />
                <div>
                  <h4 className="text-success-400 font-medium">Repatriation Successful!</h4>
                  <p className="text-success-300 text-sm mt-1">
                    Your {formData.amount} {sourceToken.symbol} has been burned and the transfer to {bridgeInstance.homeNetwork} has been initiated.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-dark-800 border border-secondary-700 rounded-lg p-4">
              <h4 className="text-white font-semibold mb-3">Transaction Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary-400">Status:</span>
                  <span className="text-success-400">Completed</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Transaction Hash:</span>
                  <span className="text-white font-mono text-xs">
                    {transferTxHash.slice(0, 6)}...{transferTxHash.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Amount Burned:</span>
                  <span className="text-white">{formData.amount} {sourceToken.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Reward Paid:</span>
                  <span className="text-white">{formData.reward} P3D</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-400">Destination:</span>
                  <span className="text-white font-mono text-xs">
                    {formData.destinationAddress.slice(0, 6)}...{formData.destinationAddress.slice(-4)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-info-900/20 border border-info-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-5 h-5 bg-info-500 rounded-full mt-0.5 flex-shrink-0"></div>
                <div>
                  <h4 className="text-info-400 font-medium">Next Steps</h4>
                  <p className="text-info-300 text-sm mt-1">
                    The repatriation has been initiated. The tokens will be transferred to {bridgeInstance.homeNetwork} 
                    once the process completes. You can track the progress using the transaction hash above.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSuccess && onSuccess(transferTxHash)}
              className="w-full btn-primary py-3"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Done
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Error Message */}
      {error && (
        <div className="bg-error-900/50 border border-error-700 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-error-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-error-400 font-medium">Repatriation Failed</h3>
            <p className="text-error-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Step Content */}
      {renderStepContent()}
    </motion.div>
  );
};

export default Repatriation;
