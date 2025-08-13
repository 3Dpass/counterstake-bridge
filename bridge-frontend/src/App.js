import React, { useState } from 'react';
import { Web3Provider } from './contexts/Web3Context';
import { SettingsProvider } from './contexts/SettingsContext';
import Header from './components/Header';
import BridgeForm from './components/BridgeForm';
import ClaimList from './components/ClaimList';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

function App() {
  const [activeTab, setActiveTab] = useState('bridge'); // 'bridge' or 'transfers'

    return (
    <Web3Provider>
      <SettingsProvider>
        <div className="min-h-screen bg-dark-950">
          <Header />

          <main className="pt-8 pb-16">
          
          {/* Tab Navigation */}
          <section className="mb-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex space-x-1 bg-dark-800 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('bridge')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'bridge'
                      ? 'bg-primary-600 text-white'
                      : 'text-secondary-400 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  Transfer
                </button>
                <button
                  onClick={() => setActiveTab('transfers')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'transfers'
                      ? 'bg-primary-600 text-white'
                      : 'text-secondary-400 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  Claim
                </button>
              </div>
            </div>
          </section>

          {/* Bridge Form Section */}
          {activeTab === 'bridge' && (
            <section id="bridge" className="mb-16">
              <BridgeForm />
            </section>
          )}

          {/* Transfer List Section */}
          {activeTab === 'transfers' && (
            <section id="transfers" className="mb-16">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <ClaimList />
              </div>
            </section>
          )}

          {/* How It Works Section */}
          <section className="mb-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-12"
              >
                <h2 className="text-3xl font-bold text-white mb-4" id="how-it-works">How It Works</h2>
                <p className="text-secondary-300 max-w-2xl mx-auto">
                  The cross-chain transfer process is simple
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {[
                  {
                    step: '1',
                    title: 'Initiate Transfer',
                    description: 'Select source and destination networks, enter amount and destination address.',
                    icon: '🚀',
                  },
                  {
                    step: '2',
                    title: 'Offer Rewards',
                    description: 'Offer 2-3% to the bridge nodes to speed up the transfer.',
                    icon: '💰',
                  },
                  {
                    step: '3',
                    title: 'Watchdogs Claim',
                    description: 'Nodes claim valid transfers and challenge fraudulent ones.',
                    icon: '🤖',
                  },
                  {
                    step: '4',
                    title: 'Receive Tokens',
                    description: 'Receive tokens on destination chain.',
                    icon: '✅',
                  },
                ].map((item, index) => (
                  <motion.div
                    key={item.step}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="card text-center relative"
                  >
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{item.step}</span>
                      </div>
                    </div>
                    <div className="text-4xl mb-4 mt-4">{item.icon}</div>
                    <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-secondary-400 text-sm">{item.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="bg-dark-900 border-t border-secondary-800 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-6">
                <a 
                  href="https://counterstake.org" 
                  className="text-secondary-400 text-sm hover:text-white transition-colors"
                >
                  Counterstake Bridge
                </a>
                <a 
                  href="https://github.com/byteball/counterstake-bridge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-400 hover:text-white transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    className="inline-block"
                  >
                    <title>GitHub Repository</title>
                    <path
                      fill="currentColor"
                      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>

        {/* Toast Notifications */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid #475569',
            },
            success: {
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </div>
        </SettingsProvider>
      </Web3Provider>
  );
}

export default App; 