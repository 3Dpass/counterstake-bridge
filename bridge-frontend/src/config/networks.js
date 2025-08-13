// Network configuration for Counterstake Bridge

// P3D precompile address constant
export const P3D_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000000802'; // native token address on 3dpass
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'; // native token address on most other networks

export const NETWORKS = {
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    explorer: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    contracts: {
      // Official Counterstake Bridge contract addresses
      exportFactory: '0x74aF8A878317E0F6e72e302FbcDF5f3009186398', // ETHEREUM_BRIDGE_FACTORY
      importFactory: '0xf7742caF6Dae87AE6D6fbE70F8aD002a3f1952b9', // ETHEREUM_BRIDGE_FACTORY (same for import)
      oracle: '0xAC4AA997A171A6CbbF5540D08537D5Cb1605E191', // ETHEREUM oracle
      assistantFactory: '0x0aD0Cce772ffcF8f9e70031cC8c1b7c20af5212F', // ETHEREUM_ASSISTANT_FACTORY
    },
    tokens: {
      USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        decimals: 6,
        name: 'Tether USD',
      },
      USDC: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin',
      },
      // Dummy tokens for testing purposes
      wP3D: {
        address: '0x1234567890123456789012345678901234567890',
        symbol: 'wP3D',
        decimals: 18,
        name: 'Wrapped P3D (Test)',
        isTestToken: true,
      },
      wFIRE: {
        address: '0x2345678901234567890123456789012345678901',
        symbol: 'wFIRE',
        decimals: 18,
        name: 'Wrapped FIRE (Test)',
        isTestToken: true,
      },
      wWATER: {
        address: '0x3456789012345678901234567890123456789012',
        symbol: 'wWATER',
        decimals: 18,
        name: 'Wrapped WATER (Test)',
        isTestToken: true,
      },
    },
    // Bridge instances deployed on Ethereum
    bridges: {
      // Export bridges (External -> 3DPass)
      USDT_EXPORT: {
        address: '0x6359F737F32BFd1862FfAfd9C2F888DfAdC8B7CF',
        type: 'export',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDT',
        homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDT',
        foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
        stakeTokenSymbol: 'USDT',
        stakeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        description: 'USDT Export Bridge (Ethereum → 3DPass)',
        isIssuerBurner: false
      },
      USDC_EXPORT: {
        address: '0x14982dc69e62508b3e4848129a55d6B1960b4Db0',
        type: 'export',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDC',
        homeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDC',
        foreignTokenAddress: '0xFbfbFBfA0000000000000000000000000000006f',
        stakeTokenSymbol: 'USDC',
        stakeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        description: 'USDC Export Bridge (Ethereum → 3DPass)',
        isIssuerBurner: false
      },
      // Test Import bridges (Ethereum -> 3DPass)
      WP3D_IMPORT: {
        address: '0x9876543210987654321098765432109876543210',
        type: 'import',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wP3D',
        foreignTokenAddress: '0x1234567890123456789012345678901234567890',
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO,
        description: 'wP3D Import Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true
      },
      WFIRE_IMPORT: {
        address: '0x8765432109876543210987654321098765432109',
        type: 'import',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'FIRE',
        homeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wFIRE',
        foreignTokenAddress: '0x2345678901234567890123456789012345678901',
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO,
        description: 'wFIRE Import Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true
      },
      WWATER_IMPORT: {
        address: '0x7654321098765432109876543210987654321098',
        type: 'import',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'WATER',
        homeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wWATER',
        foreignTokenAddress: '0x3456789012345678901234567890123456789012',
        stakeTokenSymbol: 'ETH',
        stakeTokenAddress: ADDRESS_ZERO,
        description: 'wWATER Import Bridge (Ethereum → 3DPass)',
        isIssuerBurner: true
      }
    },
    // Assistant contracts deployed on Ethereum
    assistants: {
      // Export Assistants
      USDT_EXPORT_ASSISTANT: {
        address: '0x0FAF9b7Cf0e62c6889486cE906d05A7a813a7cc5',
        type: 'export',
        bridgeAddress: '0x6359F737F32BFd1862FfAfd9C2F888DfAdC8B7CF',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDT',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDT',
        foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
        stakeTokenSymbol: 'USDT',
        stakeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        description: 'USDT Export Assistant',
        shareSymbol: 'USDTIA',
        shareName: 'USDT import assistant'
      },
      USDC_EXPORT_ASSISTANT: {
        address: '0xdf8D6962ADC7f29b6F9272376fE51D55B76B0fc5',
        type: 'export',
        bridgeAddress: '0x14982dc69e62508b3e4848129a55d6B1960b4Db0',
        homeNetwork: 'Ethereum',
        homeTokenSymbol: 'USDC',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wUSDC',
        foreignTokenAddress: '0xFbfbFBfA0000000000000000000000000000006f',
        stakeTokenSymbol: 'USDC',
        stakeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        description: 'USDC Import Wrapper Assistant',
        shareSymbol: 'USDCIA',
        shareName: 'USDC import assistant'
      }
    }
  },
  BSC: {
    id: 56,
    name: 'BNB Smart Chain',
    symbol: 'BSC',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    explorer: 'https://bscscan.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    contracts: {
      // Official Counterstake Bridge contract addresses
      exportFactory: '0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE', // BSC_BRIDGE_FACTORY
      importFactory: '0x0aD0Cce772ffcF8f9e70031cC8c1b7c20af5212F', // BSC_BRIDGE_FACTORY (same for import)
      oracle: '0xdD52899A001a4260CDc43307413A5014642f37A2', // BSC oracle
      assistantFactory: '0x9F60328982ab3e34020A9D43763db43d03Add7CF', // BSC_ASSISTANT_FACTORY
    },
    tokens: {
      BUSD: {
        address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        symbol: 'BUSD',
        decimals: 18,
        name: 'BUSD Token',
      },
      USDT: {
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT',
        decimals: 18,
        name: 'Tether USD',
      },
    },
    // Bridge instances deployed on BSC
    bridges: {
      // Export bridges (External -> 3DPass)
      BUSD_EXPORT: {
        address: '0xAd913348E7B63f44185D5f6BACBD18d7189B2F1B',
        type: 'export',
        homeNetwork: 'BNB Smart Chain',
        homeTokenSymbol: 'BUSD',
        homeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wBUSD',
        foreignTokenAddress: '0xFbFBFBfA0000000000000000000000000000014D',
        stakeTokenSymbol: 'BUSD',
        stakeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        description: 'BUSD Export Bridge (BSC → 3DPass)',
        isIssuerBurner: false
      }
    },
    // Assistant contracts deployed on BSC
    assistants: {
      BUSD_EXPORT_ASSISTANT: {
        address: '0xA32ea7688b2937eeaf3f74804fbAFB70D0fc4FE3',
        type: 'export',
        bridgeAddress: '0xAd913348E7B63f44185D5f6BACBD18d7189B2F1B',
        homeNetwork: 'BNB Smart Chain',
        homeTokenSymbol: 'BUSD',
        foreignNetwork: '3DPass',
        foreignTokenSymbol: 'wBUSD',
        foreignTokenAddress: '0xFbFBFBfA0000000000000000000000000000014D',
        stakeTokenSymbol: 'BUSD',
        stakeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
        description: 'BUSD Export Assistant',
        shareSymbol: 'BUSDIA',
        shareName: 'BUSD import assistant'
      }
    }
  },
  THREEDPASS: {
    id: 1333,
    name: '3DPass',
    symbol: '3DPass',
    rpcUrl: 'https://rpc.3dpass.org',
    explorer: 'https://3dpscan.xyz',
    nativeCurrency: {
      name: 'P3D',
      symbol: 'P3D',
      decimals: 18,
    },
    contracts: {
      // Updated contract addresses from deployment logs
      exportFactory: '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0', // CounterstakeFactory from deployment
      importFactory: '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0', // Same factory for both
      oracle: '0xAc647d0caB27e912C844F27716154f54EDD519cE', // Oracle from deployment
      assistantFactory: '0x5b74685B32cdaA74a030DA14F15F56CcfB5cA1Bc', // AssistantFactory from deployment
    },
    tokens: {
      P3D: {
        address: P3D_PRECOMPILE_ADDRESS,
        symbol: 'P3D',
        decimals: 18,
        name: '3DPass Native Token',
        isPrecompile: true,
        isNative: true,
      },
      wUSDT: {
        address: '0xfBFBfbFA000000000000000000000000000000de',
        symbol: 'wUSDT',
        decimals: 6,
        name: 'Wrapped USDT',
        isPrecompile: true,
        assetId: 222, // From the test script
      },
      wUSDC: {
        address: '0xFbfbFBfA0000000000000000000000000000006f',
        symbol: 'wUSDC',
        decimals: 6,
        name: 'Wrapped USDC',
        isPrecompile: true,
        assetId: 223, // From the test script
      },
      wBUSD: {
        address: '0xFbFBFBfA0000000000000000000000000000014D',
        symbol: 'wBUSD',
        decimals: 18,
        name: 'Wrapped BUSD',
        isPrecompile: true,
        assetId: 224, // From the test script
      },
      FIRE: {
        address: '0xFbfBFBfA000000000000000000000000000001bC',
        symbol: 'FIRE',
        decimals: 18,
        name: 'FIRE Token',
        isPrecompile: true,
        assetId: 444, // From the test script
      },
      WATER: {
        address: '0xfBFBFBfa0000000000000000000000000000022b',
        symbol: 'WATER',
        decimals: 18,
        name: 'WATER Token',
        isPrecompile: true,
        assetId: 555, // From the test script
      },
    },
    // Bridge instances deployed on 3DPass
    bridges: {
      // Export bridges (3DPass -> External)
      P3D_EXPORT: {
        address: '0x626D4E8c191c36B5937fD73A2A1B774C2361EA80',
        type: 'export',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wP3D',
        foreignTokenAddress: '0x1234567890123456789012345678901234567890',
        stakeTokenSymbol: 'P3D',
        stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        description: 'P3D Export Bridge (3DPass → Ethereum)',
        isIssuerBurner: false
      },
      FIRE_EXPORT: {
        address: '0xFaF7C72bE647BC86106993E861C48b6c24a3cAd6',
        type: 'export',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'FIRE',
        homeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wFIRE',
        foreignTokenAddress: '0x2345678901234567890123456789012345678901',
        stakeTokenSymbol: 'FIRE',
        stakeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        description: 'FIRE Export Bridge (3DPass → Ethereum)',
        isIssuerBurner: false
      },
      WATER_EXPORT: {
        address: '0xeaeF21F2C0bcE1487Eaf9622b91600155B181a4b',
        type: 'export',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'WATER',
        homeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wWATER',
        foreignTokenAddress: '0x3456789012345678901234567890123456789012',
        stakeTokenSymbol: 'WATER',
        stakeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        description: 'WATER Export Bridge (3DPass → Ethereum)',
        isIssuerBurner: false
      }
    },
    // Import Wrapped bridges (3DPass -> External)
    USDT_IMPORT: {
      address: '0x6359F737F32BFd1862FfAfd9C2F888DfAdC8B7CF',
      type: 'import_wrapper',
      homeNetwork: 'Ethereum',
      homeTokenSymbol: 'USDT',
      homeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wUSDT',
      foreignTokenAddress: '0xfBFBfbFA000000000000000000000000000000de',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      description: 'USDT Import Wrapper Bridge (Ethereum → 3DPass)',
      isIssuerBurner: false
    },
    USDC_IMPORT: {
      address: '0x14982dc69e62508b3e4848129a55d6B1960b4Db0',
      type: 'import_wrapper',
      homeNetwork: 'Ethereum',
      homeTokenSymbol: 'USDC',
      homeTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wUSDC',
      foreignTokenAddress: '0xFbfbFBfA0000000000000000000000000000006f',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      description: 'USDC Import Wrapper Bridge (Ethereum → 3DPass)',
      isIssuerBurner: false
    },
    BUSD_IMPORT: {
      address: '0xAd913348E7B63f44185D5f6BACBD18d7189B2F1B',
      type: 'import_wrapper',
      homeNetwork: 'BNB Smart Chain',
      homeTokenSymbol: 'BUSD',
      homeTokenAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      foreignNetwork: '3DPass',
      foreignTokenSymbol: 'wBUSD',
      foreignTokenAddress: '0xFbFBFBfA0000000000000000000000000000014D',
      stakeTokenSymbol: 'P3D',
      stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
      description: 'BUSD Import Wrapper Bridge (BNB Smart Chain → 3DPass)',
      isIssuerBurner: false
    },
    // Assistant contracts deployed on 3DPass
    assistants: {
    // Export Assistants
      P3D_EXPORT_ASSISTANT: {
        address: '0x747B60493839a26E20d191F6dC960C8C79C159AE',
      type: 'export',
        bridgeAddress: '0x626D4E8c191c36B5937fD73A2A1B774C2361EA80',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'P3D',
        homeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wP3D',
        foreignTokenAddress: '0x1234567890123456789012345678901234567890',
        stakeTokenSymbol: 'P3D',
        stakeTokenAddress: P3D_PRECOMPILE_ADDRESS,
        description: 'P3D Export Assistant',
        shareSymbol: 'P3DEA',
        shareName: 'P3D export assistant'
      },
      FIRE_EXPORT_ASSISTANT: {
        address: '0x8893d06fDfBd4B5696407413840bC2F333b33ca8',
      type: 'export',
        bridgeAddress: '0xFaF7C72bE647BC86106993E861C48b6c24a3cAd6',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'FIRE',
        homeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wFIRE',
        foreignTokenAddress: '0x2345678901234567890123456789012345678901',
        stakeTokenSymbol: 'FIRE',
        stakeTokenAddress: '0xFbfBFBfA000000000000000000000000000001bC',
        description: 'FIRE Export Assistant',
        shareSymbol: 'FIREA',
        shareName: 'FIRE export assistant'
      },
      WATER_EXPORT_ASSISTANT: {
        address: '0x18d62db034579BCAcfB1e527647658f1AbAD0536',
      type: 'export',
        bridgeAddress: '0xeaeF21F2C0bcE1487Eaf9622b91600155B181a4b',
        homeNetwork: '3DPass',
        homeTokenSymbol: 'WATER',
        homeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        foreignNetwork: 'Ethereum',
        foreignTokenSymbol: 'wWATER',
        foreignTokenAddress: '0x3456789012345678901234567890123456789012',
        stakeTokenSymbol: 'WATER',
        stakeTokenAddress: '0xfBFBFBfa0000000000000000000000000000022b',
        description: 'WATER Export Assistant',
        shareSymbol: 'WATEA',
        shareName: 'WATER export assistant'
      }
    }
  }
};

// Testnet configurations
export const TESTNET_NETWORKS = {
  ETHEREUM: {
    ...NETWORKS.ETHEREUM,
    id: 5, // Goerli
    name: 'Ethereum Goerli',
    rpcUrl: 'https://goerli.infura.io/v3/YOUR_INFURA_KEY',
    explorer: 'https://goerli.etherscan.io',
  },
  BSC: {
    ...NETWORKS.BSC,
    id: 97, // BSC Testnet
    name: 'BSC Testnet',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    explorer: 'https://testnet.bscscan.com',
  },
  THREEDPASS: {
    ...NETWORKS.THREEDPASS,
    id: 1334, // 3DPass Testnet
    name: '3DPass Testnet',
    rpcUrl: 'https://test-rpc-http.3dpass.org',
    explorer: 'https://test-explorer.3dpass.org',
  }
};

// Bridge configuration
export const BRIDGE_CONFIG = {
  // Default stake ratio (10-20%)
  defaultStakeRatio: 15,
  
  // Minimum stake amounts
  minStake: {
    ETHEREUM: '0.01',
    BSC: '0.1',
    THREEDPASS: '100',
  },
  
  // Challenging periods (in hours)
  challengingPeriods: [72, 168, 720, 1440],
  
  // Large transfer threshold
  largeThreshold: {
    ETHEREUM: '1000000000000000000000', // 1000 ETH
    BSC: '10000000000000000000000', // 10000 BNB
    THREEDPASS: '1000000000000000000000000' // 1000000 P3D
  }
};

// Helper functions
export const getNetworkById = (chainId) => {
  const allNetworks = { ...NETWORKS, ...TESTNET_NETWORKS };
  return Object.values(allNetworks).find(network => network.id === chainId);
};

export const getNetworkBySymbol = (symbol) => {
  const allNetworks = { ...NETWORKS, ...TESTNET_NETWORKS };
  return Object.values(allNetworks).find(network => network.symbol === symbol);
};

export const isTestnet = (chainId) => {
  return [5, 97, 1334].includes(chainId);
};

export const getSupportedNetworks = () => {
  return Object.values(NETWORKS);
};

export const getSupportedTestnetNetworks = () => {
  return Object.values(TESTNET_NETWORKS);
};

// Bridge instance helper functions - Updated to work with new structure
export const getBridgeInstances = () => {
  const allBridges = {};
  Object.values(NETWORKS).forEach(network => {
    if (network.bridges) {
      Object.assign(allBridges, network.bridges);
    }
    // Also include import_wrapper bridges that are defined at the network level
    // These are properties of the network object, not inside the bridges object
    Object.keys(network).forEach(key => {
      if (key.endsWith('_IMPORT') && network[key].type === 'import_wrapper') {
        allBridges[key] = network[key];
      }
    });
  });
  return allBridges;
};

export const getBridgeInstanceByAddress = (address) => {
  return Object.values(NETWORKS).reduce((found, network) => {
    if (found) return found;
    if (network.bridges) {
      return Object.values(network.bridges).find(bridge => 
    bridge.address.toLowerCase() === address.toLowerCase()
  );
    }
    return null;
  }, null);
};

export const getBridgeInstancesByType = (type) => {
  const bridges = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.bridges) {
      Object.values(network.bridges).forEach(bridge => {
        if (bridge.type === type) {
          bridges.push(bridge);
        }
      });
    }
  });
  return bridges;
};

export const getBridgeInstancesByNetwork = (networkSymbol) => {
  const bridges = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.bridges) {
      Object.values(network.bridges).forEach(bridge => {
        if (bridge.homeNetwork === networkSymbol || bridge.foreignNetwork === networkSymbol) {
          bridges.push(bridge);
        }
      });
    }
  });
  return bridges;
};

// Assistant contract helper functions - Updated to work with new structure
export const getAssistantContracts = () => {
  const allAssistants = {};
  Object.values(NETWORKS).forEach(network => {
    if (network.assistants) {
      Object.assign(allAssistants, network.assistants);
    }
  });
  return allAssistants;
};

export const getAssistantContractByAddress = (address) => {
  return Object.values(NETWORKS).reduce((found, network) => {
    if (found) return found;
    if (network.assistants) {
      return Object.values(network.assistants).find(assistant => 
    assistant.address.toLowerCase() === address.toLowerCase()
  );
    }
    return null;
  }, null);
};

export const getAssistantContractsByType = (type) => {
  const assistants = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.assistants) {
      Object.values(network.assistants).forEach(assistant => {
        if (assistant.type === type) {
          assistants.push(assistant);
        }
      });
    }
  });
  return assistants;
};

export const getAssistantContractsByNetwork = (networkSymbol) => {
  const assistants = [];
  Object.values(NETWORKS).forEach(network => {
    if (network.assistants) {
      Object.values(network.assistants).forEach(assistant => {
        if (assistant.homeNetwork === networkSymbol || assistant.foreignNetwork === networkSymbol) {
          assistants.push(assistant);
        }
      });
    }
  });
  return assistants;
};

export const getAssistantContractForBridge = (bridgeAddress) => {
  return Object.values(NETWORKS).reduce((found, network) => {
    if (found) return found;
    if (network.assistants) {
      return Object.values(network.assistants).find(assistant => 
    assistant.bridgeAddress.toLowerCase() === bridgeAddress.toLowerCase()
  );
    }
    return null;
  }, null);
}; 