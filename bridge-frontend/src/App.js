import React, { useState } from 'react';
import { Web3Provider } from './contexts/Web3Context';
import { SettingsProvider } from './contexts/SettingsContext';
import Header from './components/Header';
import BridgeForm from './components/BridgeForm';
import TransferList from './components/TransferList';
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
                <TransferList />
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
                    title: 'Provide Stake',
                    description: 'Deposit required stake (typically 10-20% of transfer amount) as security.',
                    icon: '💰',
                  },
                  {
                    step: '3',
                    title: 'Watchdog Claims',
                    description: 'Automated watchdog bots claim valid transfers and challenge fraudulent ones.',
                    icon: '🤖',
                  },
                  {
                    step: '4',
                    title: 'Receive Tokens',
                    description: 'Tokens are minted on destination chain after successful validation.',
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
            <div className="text-center">
               <a href="#how-it-works" className="text-secondary-400 text-sm hover:text-white transition-colors pr-2">
               Counterstake Bridge
              </a>
            </div>
          </div>
        </footer>

        {/* Toast Notifications */}
        <Toaster
          position="top-right"
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