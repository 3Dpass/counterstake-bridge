import React from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { Wallet, Network, LogOut, Menu, X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReactComponent as Logo } from '../assets/logo.svg';
import SettingsDialog from './SettingsDialog';

const Header = () => {
  const {
    account,
    network,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    switchNetwork,
    formatAddress,
  } = useWeb3();

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const supportedNetworks = [
    { id: 1, name: 'Ethereum', symbol: 'ETH' },
    { id: 56, name: 'BSC', symbol: 'BSC' },
    { id: 1333, name: '3DPass', symbol: '3DPass' },
  ];

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setIsMenuOpen(false);
  };

  const handleNetworkSwitch = async (networkId) => {
    try {
      await switchNetwork(networkId);
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Failed to switch network:', error);
    }
  };

  return (
    <header className="bg-dark-900/80 backdrop-blur-md border-b border-secondary-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-3"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                <Logo className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Counterstake</h1>
              </div>
            </motion.div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#bridge" className="text-secondary-300 hover:text-white transition-colors">
              Bridge
            </a>
            <a href="#how-it-works" className="text-secondary-300 hover:text-white transition-colors">
              How it works
            </a>
          </nav>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-secondary-400 hover:text-white transition-colors p-2"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Network Selector */}
            {isConnected && network && (
              <div className="hidden sm:flex items-center space-x-2">
                <Network className="w-4 h-4 text-secondary-400" />
                <span className="text-sm text-secondary-300">{network.symbol}</span>
              </div>
            )}

            {/* Connect Button */}
            {!isConnected ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleConnect}
                disabled={isConnecting}
                className="btn-primary flex items-center space-x-2"
              >
                <Wallet className="w-4 h-4" />
                <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
              </motion.button>
            ) : (
              <div className="flex items-center space-x-2">
                {/* Account Info */}
                <div className="hidden sm:flex items-center space-x-2 bg-dark-800 px-3 py-2 rounded-lg border border-secondary-700">
                  <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                  <span className="text-sm text-white">{formatAddress(account)}</span>
                </div>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="md:hidden p-2 rounded-lg bg-dark-800 border border-secondary-700 hover:bg-dark-700 transition-colors"
                >
                  {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                </button>

                {/* Desktop Actions */}
                <div className="hidden md:flex items-center space-x-2">
                  <button
                    onClick={handleDisconnect}
                    className="p-2 rounded-lg bg-dark-800 border border-secondary-700 hover:bg-dark-700 transition-colors"
                    title="Disconnect"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-secondary-800 bg-dark-900"
          >
            <div className="px-4 py-4 space-y-4">
              {/* Mobile Navigation */}
              <nav className="space-y-2">
                <a
                  href="#bridge"
                  className="block px-3 py-2 text-secondary-300 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Bridge
                </a>
                <a
                  href="#how-it-works"
                  className="block px-3 py-2 text-secondary-300 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  How it works
                </a>
              </nav>

              {/* Network Selector */}
              {isConnected && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-secondary-400 px-3">Switch Network</h3>
                  <div className="space-y-1">
                    {supportedNetworks.map((net) => (
                      <button
                        key={net.id}
                        onClick={() => handleNetworkSwitch(net.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          network?.id === net.id
                            ? 'bg-primary-600 text-white'
                            : 'text-secondary-300 hover:text-white hover:bg-dark-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{net.name}</span>
                          {network?.id === net.id && (
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Disconnect Button */}
              {isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-error-400 hover:text-error-300 hover:bg-dark-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Disconnect</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Dialog */}
      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </header>
  );
};

export default Header; 