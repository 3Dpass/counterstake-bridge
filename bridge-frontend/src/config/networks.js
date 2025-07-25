// Network configuration for Counterstake Bridge
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
    },
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
  },
  THREEDPASS: {
    id: 1333,
    name: '3DPass',
    symbol: '3DPass',
    rpcUrl: 'https://rpc-http.3dpass.org',
    explorer: 'https://explorer.3dpass.org',
    nativeCurrency: {
      name: 'P3D',
      symbol: 'P3D',
      decimals: 18,
    },
    contracts: {
      // Official Counterstake Bridge contract addresses
      exportFactory: '0x943e8fcbA7C432D0C1adf61dC43C33273111e168', // 3DPass export factory
      importFactory: '0x943e8fcbA7C432D0C1adf61dC43C33273111e168', // 3DPass import factory (same address)
      oracle: '0xAc647d0caB27e912C844F27716154f54EDD519cE', // 3DPass oracle
      assistantFactory: '0xAc647d0caB27e912C844F27716154f54EDD519cE', // 3DPass assistant factory (same as oracle)
      p3dPrecompile: '0x0000000000000000000000000000000000000802',
    },
    tokens: {
      P3D: {
        address: '0x0000000000000000000000000000000000000802',
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
    },
  },
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
  },
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
    THREEDPASS: '1000000000000000000000000', // 1000000 P3D
  },
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