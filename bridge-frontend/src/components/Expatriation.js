import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { AlertCircle, CheckCircle, ArrowRight, Loader } from 'lucide-react';
import { motion } from 'framer-motion';

const Expatriation = ({ 
  bridgeInstance, 
  formData, 
  sourceToken, 
  signer, 
  onSuccess, 
  onError 
}) => {
  const [step, setStep] = useState('approve'); // 'approve', 'approved', 'transfer', 'success'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [approvalTxHash, setApprovalTxHash] = useState('');
  const [transferTxHash, setTransferTxHash] = useState('');
  const [currentAllowance, setCurrentAllowance] = useState('0');
  const [requiredAmount, setRequiredAmount] = useState('0');
  const [isCheckingApproval, setIsCheckingApproval] = useState(true);

  // Create token contract for approval
  const createTokenContract = useCallback((tokenAddress) => {
    const tokenABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function allowance(address owner, address spender) external view returns (uint256)',
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)',
      'function symbol() external view returns (string)'
    ];
    return new ethers.Contract(tokenAddress, tokenABI, signer);
  }, [signer]);

  // Create export bridge contract
  const createExportContract = useCallback(() => {
    const exportABI = [
      'function transferToForeignChain(string foreign_address, string data, uint amount, int reward) payable',
      'function foreign_network() view returns (string)',
      'function foreign_asset() view returns (string)',
      'function getRequiredStake(uint amount) view returns (uint)',
      'function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)'
    ];
    return new ethers.Contract(bridgeInstance.address, exportABI, signer);
  }, [bridgeInstance.address, signer]);

  // Check if approval is needed
  const checkApprovalNeeded = useCallback(async () => {
    try {
      setIsCheckingApproval(true);
      const exportContract = createExportContract();
      // Ensure the selected token matches the bridge's configured token
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      if (settings && bridgeTokenAddress.toLowerCase() !== sourceToken.address.toLowerCase()) {
        setError('Selected token does not match the bridge configuration. Please reselect the correct token/network.');
        return true;
      }

      const tokenContract = createTokenContract(bridgeTokenAddress);
      // Always use actual on-chain decimals to avoid mismatches
      const actualDecimals = await tokenContract.decimals();
      const amount = ethers.utils.parseUnits(formData.amount, actualDecimals);
      const allowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
      
      // Store the values for display
      setRequiredAmount(ethers.utils.formatUnits(amount, actualDecimals));
      setCurrentAllowance(ethers.utils.formatUnits(allowance, actualDecimals));
      
      const needsApproval = allowance.lt(amount);
      console.log('🔍 Approval check:', {
        required: ethers.utils.formatUnits(amount, actualDecimals),
        current: ethers.utils.formatUnits(allowance, actualDecimals),
        needsApproval
      });
      
      return needsApproval;
    } catch (error) {
      console.error('Error checking approval:', error);
      setError('Failed to check approval status: ' + error.message);
      return true; // Assume approval is needed if check fails
    } finally {
      setIsCheckingApproval(false);
    }
  }, [sourceToken.address, formData.amount, bridgeInstance.address, signer, createExportContract, createTokenContract]);

  // Handle approval
  const handleApprove = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('🔍 Starting approval process...');
      console.log('📋 Approval details:', {
        tokenAddress: sourceToken.address,
        bridgeAddress: bridgeInstance.address,
        amount: formData.amount,
        decimals: sourceToken.decimals
      });

      const exportContract = createExportContract();
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      if (settings && bridgeTokenAddress.toLowerCase() !== sourceToken.address.toLowerCase()) {
        throw new Error('Selected token does not match the bridge configuration.');
      }

      const tokenContract = createTokenContract(bridgeTokenAddress);
      const tokenDecimals = await tokenContract.decimals();
      const amount = ethers.utils.parseUnits(formData.amount, tokenDecimals);
      
      console.log('💰 Parsed amount for approval:', ethers.utils.formatUnits(amount, tokenDecimals));
      
      // Check current allowance
      const currentAllowanceBN = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
      console.log('📊 Current allowance:', ethers.utils.formatUnits(currentAllowanceBN, tokenDecimals));
      
      if (currentAllowanceBN.gte(amount)) {
        console.log('✅ Sufficient allowance already exists');
        setStep('approved');
        setIsLoading(false);
        return;
      }

      console.log('🔐 Approving bridge to spend tokens...');
      const approveTx = await tokenContract.approve(bridgeInstance.address, amount, { 
        gasLimit: 100000 
      });
      
      console.log('⏳ Waiting for approval transaction confirmation...');
      const receipt = await approveTx.wait();
      
      console.log('✅ Approval transaction confirmed:', receipt.transactionHash);
      setApprovalTxHash(receipt.transactionHash);
      // Refresh allowance display using actual decimals
      try {
        const updatedAllowance = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
        setCurrentAllowance(ethers.utils.formatUnits(updatedAllowance, tokenDecimals));
        setRequiredAmount(ethers.utils.formatUnits(amount, tokenDecimals));
      } catch (e) {
        console.warn('⚠️ Could not refresh allowance after approval:', e);
      }
      setStep('approved');
      
    } catch (error) {
      console.error('❌ Approval failed:', error);
      setError(error.message || 'Approval failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle transfer
  const handleTransfer = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('🌉 Starting transfer process...');
      console.log('📋 Transfer details:', {
        bridgeAddress: bridgeInstance.address,
        foreignAddress: formData.destinationAddress,
        amount: formData.amount,
        reward: formData.reward,
        decimals: sourceToken.decimals
      });

      const exportContract = createExportContract();
      
      // Get actual token decimals from contract to avoid configuration mismatches
      let settings;
      try {
        settings = await exportContract.settings();
      } catch (e) {
        console.warn('⚠️ Could not fetch bridge settings:', e);
      }
      const bridgeTokenAddress = settings?.tokenAddress || sourceToken.address;
      if (settings && bridgeTokenAddress.toLowerCase() !== sourceToken.address.toLowerCase()) {
        throw new Error('Selected token does not match the bridge configuration.');
      }

      const tokenContract = createTokenContract(bridgeTokenAddress);
      const actualDecimals = await tokenContract.decimals();
      
      // Use actual decimals instead of configured ones
      const amount = ethers.utils.parseUnits(formData.amount, actualDecimals);
      const rewardInput = (formData.reward && String(formData.reward).length > 0) ? formData.reward : '0';
      const reward = ethers.utils.parseUnits(rewardInput, actualDecimals);
      const data = '0x'; // Empty data for ERC20 transfers (matching test script)
      
      console.log('💰 Parsed amounts:', {
        amount: ethers.utils.formatUnits(amount, actualDecimals),
        reward: ethers.utils.formatUnits(reward, actualDecimals)
      });

      // Validate parameters
      console.log('🔍 Transfer parameters:', {
        foreignAddress: formData.destinationAddress,
        data: data,
        amount: amount.toString(),
        reward: reward.toString(),
        amountType: typeof amount,
        rewardType: typeof reward
      });

      // Validate bridge contract configuration
      try {
        const foreignNetwork = await exportContract.foreign_network();
        const foreignAsset = await exportContract.foreign_asset();
        console.log('🔍 Bridge configuration:', {
          foreignNetwork,
          foreignAsset
        });
      } catch (error) {
        console.warn('⚠️ Could not verify bridge configuration:', error);
      }

      // Validate token configuration
      try {
        const tokenContract = createTokenContract(sourceToken.address);
        const tokenDecimals = await tokenContract.decimals();
        const tokenSymbol = await tokenContract.symbol();
        const tokenBalance = await tokenContract.balanceOf(await signer.getAddress());
        
        console.log('🔍 Token validation:', {
          address: sourceToken.address,
          configuredDecimals: sourceToken.decimals,
          actualDecimals: tokenDecimals,
          configuredSymbol: sourceToken.symbol,
          actualSymbol: tokenSymbol,
          balance: ethers.utils.formatUnits(tokenBalance, tokenDecimals),
          parsedAmount: ethers.utils.formatUnits(amount, tokenDecimals),
          hasEnoughBalance: tokenBalance.gte(amount)
        });
        
        // Check if decimals mismatch
        if (sourceToken.decimals !== tokenDecimals) {
          console.warn('⚠️ Token decimals mismatch!', {
            configured: sourceToken.decimals,
            actual: tokenDecimals
          });
        }
      } catch (error) {
        console.warn('⚠️ Could not validate token configuration:', error);
      }

      console.log('🌉 Initiating transfer to foreign chain...');
      // Sanity-check allowance just before transfer
      try {
        const allowanceBN = await tokenContract.allowance(await signer.getAddress(), bridgeInstance.address);
        if (allowanceBN.lt(amount)) {
          console.warn('⚠️ Insufficient allowance at transfer time, prompting re-approval', {
            allowance: ethers.utils.formatUnits(allowanceBN, actualDecimals),
            required: ethers.utils.formatUnits(amount, actualDecimals)
          });
          setError('Insufficient allowance for transfer. Please approve again.');
          setStep('approve');
          setIsLoading(false);
          return;
        }
      } catch (e) {
        console.warn('⚠️ Could not check allowance before transfer:', e);
      }
      const transferTx = await exportContract.transferToForeignChain(
        formData.destinationAddress,
        data,
        amount,
        reward,
        { gasLimit: 9000000 }
      );
      
      console.log('⏳ Waiting for transfer transaction confirmation...');
      const receipt = await transferTx.wait();
      
      console.log('✅ Transfer transaction confirmed:', receipt.transactionHash);
      setTransferTxHash(receipt.transactionHash);
      setStep('success');
      
      // Call success callback
      if (onSuccess) {
        onSuccess(receipt.transactionHash);
      }
      
    } catch (error) {
      console.error('❌ Transfer failed:', error);
      setError(error.message || 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if approval is needed on component mount
  useEffect(() => {
    const checkApproval = async () => {
      try {
        const needsApproval = await checkApprovalNeeded();
        if (!needsApproval) {
          setStep('approved');
        }
      } catch (error) {
        console.error('Error in approval check:', error);
        setError('Failed to check approval status');
      }
    };
    
    if (signer && sourceToken && bridgeInstance) {
      checkApproval();
    }
  }, [signer, sourceToken, bridgeInstance, checkApprovalNeeded]);

  const renderStep = () => {
    switch (step) {
      case 'approve':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-warning-900/50 border border-warning-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-warning-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-warning-400 font-medium">Approval Required</h3>
                  <p className="text-warning-300 text-sm mt-1">
                    You need to approve the bridge contract to spend your {sourceToken.symbol} tokens before initiating the transfer.
                  </p>
                  
                  {!isCheckingApproval && (
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-warning-300">Required amount:</span>
                        <span className="text-warning-400 font-medium">{requiredAmount} {sourceToken.symbol}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-warning-300">Current allowance:</span>
                        <span className="text-warning-400 font-medium">{currentAllowance} {sourceToken.symbol}</span>
                      </div>
                      {parseFloat(currentAllowance) > 0 && (
                        <div className="text-xs text-warning-300 mt-1">
                          You have an existing allowance, but it's insufficient for this transfer.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={handleApprove}
                disabled={isLoading || isCheckingApproval}
                className="w-full btn-warning py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Approving...</span>
                  </div>
                ) : isCheckingApproval ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Checking Approval Status...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <span>Approve {sourceToken.symbol}</span>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </button>
              
              <button
                onClick={async () => {
                  setError('');
                  await checkApprovalNeeded();
                }}
                disabled={isCheckingApproval}
                className="w-full btn-secondary py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingApproval ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Checking...</span>
                  </div>
                ) : (
                  <span>Refresh Approval Status</span>
                )}
              </button>
            </div>
          </motion.div>
        );

      case 'approved':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-success-900/50 border border-success-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-success-400 font-medium">Approval Successful</h3>
                  <p className="text-success-300 text-sm mt-1">
                    Bridge contract is now approved to spend your {sourceToken.symbol} tokens.
                  </p>
                  
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-success-300">Current allowance:</span>
                      <span className="text-success-400 font-medium">{currentAllowance} {sourceToken.symbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-success-300">Required for transfer:</span>
                      <span className="text-success-400 font-medium">{requiredAmount} {sourceToken.symbol}</span>
                    </div>
                  </div>
                  
                  {approvalTxHash && (
                    <p className="text-success-300 text-xs mt-2 font-mono">
                      TX: {approvalTxHash.slice(0, 10)}...{approvalTxHash.slice(-8)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <button
              onClick={handleTransfer}
              disabled={isLoading}
              className="w-full btn-primary py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Initiating Transfer...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <span>Initiate Transfer</span>
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </button>
          </motion.div>
        );

      case 'success':
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-success-900/50 border border-success-700 rounded-lg p-4"
          >
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-success-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-success-400 font-medium">Transfer Successful</h3>
                <p className="text-success-300 text-sm mt-1">
                  Your {sourceToken.symbol} tokens have been successfully transferred to {formData.destinationNetwork}.
                </p>
                {transferTxHash && (
                  <p className="text-success-300 text-xs mt-2 font-mono">
                    TX: {transferTxHash.slice(0, 10)}...{transferTxHash.slice(-8)}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="bg-error-900/50 border border-error-700 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-error-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-error-400 font-medium">Operation Failed</h3>
            <p className="text-error-300 text-sm mt-1">{error}</p>
            <button
              onClick={() => {
                setError('');
                setStep('approve');
              }}
              className="text-error-400 text-sm mt-2 hover:text-error-300 underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderStep()}
    </div>
  );
};

export default Expatriation;
