"use strict";
const { ethers } = require("ethers");
const conf = require('../conf.js');
const WebSocket = require('ws');

// Cache providers to prevent multiple WebSocket connections to the same network
const providerCache = {};

/**
 * Mask API keys in URLs for safe logging
 * @param {string} url - URL that may contain API keys
 * @returns {string} URL with API keys masked
 */
function maskApiKeyInUrl(url) {
	if (!url || typeof url !== 'string') return url;
	
	// Mask Infura API keys (format: wss://bsc-mainnet.infura.io/ws/v3/API_KEY)
	url = url.replace(/\/ws\/v3\/([a-f0-9]+)/gi, '/ws/v3/***');
	
	// Mask other common API key patterns
	url = url.replace(/\/v1\/([a-f0-9-]+)/gi, '/v1/***');
	url = url.replace(/apikey\/([a-f0-9-]+)/gi, 'apikey/***');
	url = url.replace(/api_key=([a-f0-9-]+)/gi, 'api_key=***');
	
	return url;
}

function createProvider(url) {
	return url.startsWith('wss://') ? new ethers.providers.WebSocketProvider(url) : new ethers.providers.JsonRpcProvider(url);
}

function getProvider(network, bFree) {
	// Create cache key that includes network and bFree flag
	const cacheKey = `${network}_${bFree || false}`;
	
	// Return cached provider if available
	if (providerCache[cacheKey]) {
		return providerCache[cacheKey];
	}
	
	let provider;
	if (process.env.devnet)
		provider = new ethers.providers.JsonRpcProvider("http://0.0.0.0:7545") // ganache
	else if (process.env[network + '_provider'])
		provider = createProvider(process.env[network + '_provider']);
	else {
		switch (network) {
			case 'Ethereum':
				if (process.env.testnet)
					throw Error("rinkeby was discontinued");
				provider = process.env.devnet
					? new ethers.providers.JsonRpcProvider("http://0.0.0.0:7545") // ganache
					: new ethers.providers.WebSocketProvider(`wss://mainnet.gateway.tenderly.co`);
			//		: new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://eth-none.g.alchemy.com/v2/${conf.alchemy_keys.eth.testnet}` : `wss://eth-mainnet.g.alchemy.com/v2/${conf.alchemy_keys.eth.mainnet}`);
			//		: ethers.providers.InfuraProvider.getWebSocketProvider(process.env.testnet ? "rinkeby" : "homestead", conf.infura_project_id);
			//	return new ethers.providers.InfuraProvider(process.env.testnet ? "rinkeby" : "homestead", conf.infura_project_id);
				break;
			
			case 'BSC':
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://bsc-testnet.blockvision.org/v1/${conf.blockvision_key}` : `wss://bsc-mainnet.blockvision.org/v1/${conf.blockvision_key}`);
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://bsc-testnet.nodereal.io/ws/v1/${conf.nodereal_key}` : `wss://bsc-mainnet.nodereal.io/ws/v1/${conf.nodereal_key}`);
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://bsc.getblock.io/${conf.getblock_key}/testnet/` : `wss://bsc.getblock.io/${conf.getblock_key}/mainnet/`);
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://rpc.ankr.com/bsc_testnet_chapel/ws/${conf.ankr_key}` : `wss://rpc.ankr.com/bsc/ws/${conf.ankr_key}`);
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `https://speedy-nodes-nyc.moralis.io/${conf.moralis_key}/bsc/testnet/ws` : `wss://speedy-nodes-nyc.moralis.io/${conf.moralis_key}/bsc/mainnet/ws`);
				// Use Infura for BSC - load from conf.json
				let infuraApiKey = conf.infura_project_id || '';
				if (!infuraApiKey) {
					try {
						const fs = require('fs');
						const desktopApp = require('ocore/desktop_app.js');
						const confJsonPath = desktopApp.getAppDataDir() + '/' + conf.CONF_FILENAME;
						if (fs.existsSync(confJsonPath)) {
							const externalConf = JSON.parse(fs.readFileSync(confJsonPath, 'utf8'));
							infuraApiKey = externalConf.infura_project_id || '';
						}
					} catch (err) {
						console.log('Could not load infura_project_id from conf.json:', err.message);
					}
				}
				if (!infuraApiKey) {
					throw Error('BSC Infura API key (infura_project_id) not found in conf.json');
				}
				// Try both URL formats in case one works
				provider = new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://bsc-testnet.infura.io/ws/v3/${infuraApiKey}` : `wss://bsc-mainnet.infura.io/ws/v3/${infuraApiKey}`);
				// Alternative WebSocket providers (commented out for easy switching)
				//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://bsc-testnet.nodereal.io/ws/v1/${conf.nodereal_key}` : `wss://bsc-mainnet.nodereal.io/ws/v1/${conf.nodereal_key}`);
				//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://rpc.ankr.com/bsc_testnet_chapel/ws/${conf.ankr_key}` : `wss://rpc.ankr.com/bsc/ws/${conf.ankr_key}`);
				break;
			
			case 'Polygon':
				/*
				const url = bFree
					? (process.env.testnet ? "https://matic-testnet-archive-rpc.bwarelabs.com" : "https://rpc-mainnet.maticvigil.com")
					: (process.env.testnet ? `https://polygon-mumbai.infura.io/v3/${conf.infura_project_id}` : `https://polygon-mainnet.infura.io/v3/${conf.infura_project_id}`);
				return new ethers.providers.JsonRpcProvider(url);
				*/
			//	return new ethers.providers.JsonRpcProvider((process.env.testnet ? `https://polygon-mumbai.infura.io/v3/${conf.infura_project_id}` : `https://polygon-mainnet.infura.io/v3/${conf.infura_project_id}`));
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://polygon-mumbai.infura.io/v3/ws/${conf.infura_project_id}` : `wss://polygon-mainnet.infura.io/ws/v3/${conf.infura_project_id}`);
			//	return new ethers.providers.JsonRpcProvider((process.env.testnet ? `https://rpc.ankr.com/polygon_mumbai` : `https://polygon-rpc.com`));
				provider = new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://rpc.ankr.com/polygon_mumbai/ws/${conf.ankr_key}` : `wss://rpc.ankr.com/polygon/ws/${conf.ankr_key}`);
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://polygon-mumbai.g.alchemy.com/v2/${conf.alchemy_keys.polygon.testnet}` : `wss://polygon-mainnet.g.alchemy.com/v2/${conf.alchemy_keys.polygon.mainnet}`);
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://matic-mumbai--ws.datahub.figment.io/apikey/${conf.datahub_key}` : `wss://matic-mainnet--ws.datahub.figment.io/apikey/${conf.datahub_key}`);
				break;

			case 'Kava':
			//	return new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://wevm.testnet.kava.io` : `wss://wevm.kava.io`);
				provider = new ethers.providers.WebSocketProvider(process.env.testnet ? `wss://wevm.testnet.kava.io` : `wss://wevm.kava-rpc.com`);
				break;
			
			case '3DPass':
				// JsonRpcProvider: https://rpc-http.3dpass.org 
				// WebSocketProvider: wss://rpc.3dpass.org
				//	return new ethers.providers.JsonRpcProvider(`https://rpc-http.3dpass.org`);
				provider = new ethers.providers.WebSocketProvider(`wss://rpc.3dpass.org`);
				break;
			
			default:
				throw Error(`unknown network ` + network);
		}
	}
	
	// Cache and return the provider
	if (provider) {
		providerCache[cacheKey] = provider;
		return provider;
	}
	
	throw Error(`failed to create provider for network ` + network);
}

exports.getProvider = getProvider;

// Function to get a listener provider (for listening to network events only)
// This is separate from the main provider which is used for transactions and calls
function getListenerProvider(network) {
	const cacheKey = `${network}_listener`;
	
	// Return cached listener provider if available
	if (providerCache[cacheKey]) {
		return providerCache[cacheKey];
	}
	
	let listenerProvider;
	
	if (process.env.devnet) {
		// Use same provider for devnet
		return getProvider(network);
	}
	
	switch (network) {
		case 'BSC':
			// Options: exbitron, Infura, or drpc.org public RPC
			// To use exbitron, set bsc_listener_use_exbitron = true in conf.js or conf.json
			// To use Infura, set bsc_listener_use_infura = true in conf.js or conf.json
			let bscListenerUrl;
			const useExbitron = conf.bsc_listener_use_exbitron || false;
			const useInfura = conf.bsc_listener_use_infura || (useExbitron ? false : true);
			
			if (useExbitron) {
				// Use exbitron endpoint with custom header
				bscListenerUrl = 'wss://bsc-wss.exbitron.com';
				
				// Load Exbitron API key from conf.json
				let exbitronApiKey = conf.exbitron_api_key || '';
				if (!exbitronApiKey) {
					try {
						const fs = require('fs');
						const desktopApp = require('ocore/desktop_app.js');
						const confJsonPath = desktopApp.getAppDataDir() + '/' + conf.CONF_FILENAME;
						if (fs.existsSync(confJsonPath)) {
							const externalConf = JSON.parse(fs.readFileSync(confJsonPath, 'utf8'));
							exbitronApiKey = externalConf.exbitron_api_key || '';
						}
					} catch (err) {
						console.log('Could not load exbitron_api_key from conf.json:', err.message);
					}
				}
				
				if (!exbitronApiKey) {
					throw Error('BSC Exbitron API key (exbitron_api_key) not found in conf.json');
				}
				
				// Create custom WebSocket with header
				// ethers.js WebSocketProvider doesn't directly support custom headers,
				// so we create a custom WebSocket connection and pass it to WebSocketProvider
				const customWebSocket = new WebSocket(bscListenerUrl, {
					headers: {
						'x-access-key': exbitronApiKey
					}
				});
				
				// Create WebSocketProvider with the custom WebSocket instance
				// In ethers v5, WebSocketProvider can accept a WebSocket instance as first argument
				// We pass the WebSocket instance directly to the constructor
				listenerProvider = new ethers.providers.WebSocketProvider(customWebSocket);
				console.log(`✅ Using Exbitron for BSC listener (bsc_listener_use_exbitron enabled)`);
			} else if (useInfura) {
				// Load Infura API key from conf.json (same as main provider)
				let infuraApiKey = conf.infura_project_id || '';
				if (!infuraApiKey) {
					try {
						const fs = require('fs');
						const desktopApp = require('ocore/desktop_app.js');
						const confJsonPath = desktopApp.getAppDataDir() + '/' + conf.CONF_FILENAME;
						if (fs.existsSync(confJsonPath)) {
							const externalConf = JSON.parse(fs.readFileSync(confJsonPath, 'utf8'));
							infuraApiKey = externalConf.infura_project_id || '';
						}
					} catch (err) {
						console.log('Could not load infura_project_id from conf.json:', err.message);
					}
				}
				if (!infuraApiKey) {
					console.log('⚠️  bsc_listener_use_infura is true but Infura API key not found, falling back to drpc.org');
					bscListenerUrl = process.env.testnet 
						? 'wss://bsc-testnet.publicnode.com'
						: 'wss://bsc.drpc.org';
					listenerProvider = new ethers.providers.WebSocketProvider(bscListenerUrl);
				} else {
					bscListenerUrl = process.env.testnet 
						? `wss://bsc-testnet.infura.io/ws/v3/${infuraApiKey}` 
						: `wss://bsc-mainnet.infura.io/ws/v3/${infuraApiKey}`;
					listenerProvider = new ethers.providers.WebSocketProvider(bscListenerUrl);
					console.log(`✅ Using Infura for BSC listener (bsc_listener_use_infura enabled)`);
				}
			} else {
				// Default: Use drpc.org public RPC
				bscListenerUrl = process.env.testnet 
					? 'wss://bsc-testnet.publicnode.com'
					: 'wss://bsc.drpc.org';
				listenerProvider = new ethers.providers.WebSocketProvider(bscListenerUrl);
			}
			
			// Store URL for logging purposes (masked to hide API keys)
			if (bscListenerUrl) {
				listenerProvider._providerUrl = maskApiKeyInUrl(bscListenerUrl);
			} else {
				listenerProvider._providerUrl = maskApiKeyInUrl('wss://bsc-wss.exbitron.com');
			}
			break;
		
		default:
			// For other networks, use the same provider as the main one
			return getProvider(network);
	}
	
	// Cache and return the listener provider
	if (listenerProvider) {
		providerCache[cacheKey] = listenerProvider;
		return listenerProvider;
	}
	
	throw Error(`failed to create listener provider for network ` + network);
}

exports.getListenerProvider = getListenerProvider;

// Function to clear provider cache for a specific network (useful when network disconnects)
function clearProviderCache(network) {
	if (network) {
		// Clear all cache entries for this network (including listener)
		Object.keys(providerCache).forEach(key => {
			if (key.startsWith(network + '_')) {
				console.log(`Clearing provider cache for ${key}`);
				delete providerCache[key];
			}
		});
	} else {
		// Clear all cached providers
		console.log('Clearing all provider cache');
		Object.keys(providerCache).forEach(key => delete providerCache[key]);
	}
}

exports.clearProviderCache = clearProviderCache;

