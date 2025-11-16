/*jslint node: true */
"use strict";

const conf = require('ocore/conf.js');
const eventBus = require('ocore/event_bus.js');
const device = require('ocore/device.js');
const db = require('ocore/db.js');
const { networkApi } = require('./transfers.js');
const { normalizeAddress } = require('./address_normalizer.js');

/**
 * Peer seeding module for EVM chains
 * Allows nodes to share block numbers and events with peers during catch-up
 * instead of querying block explorers/parsers
 */

// Cache for peer requests to avoid duplicate requests
const pendingPeerRequests = new Map(); // requestId => { resolve, reject, timeout }

// Discovered peers cache (automatically discovered via Obyte network)
const discoveredPeers = new Set(); // Set of Obyte device addresses
const MAX_DISCOVERED_PEERS = 50; // Maximum number of discovered peers to keep

/**
 * Get block numbers from database for a given address and network
 * Queries the blockchain provider to get block numbers from transaction hashes
 * @param {string} network - Network name (Ethereum, BSC, etc.)
 * @param {string} address - Contract address
 * @param {number} startblock - Starting block number
 * @returns {Promise<number[]>} Array of block numbers
 */
async function getBlockNumbersFromDB(network, address, startblock = 0) {
	try {
		// Normalize the address to match what's stored in the database (checksummed for EVM addresses)
		const networkApiInstance = networkApi[network];
		const normalizedAddress = normalizeAddress(address, networkApiInstance);
		
		// Get bridges where this address is either export_aa or import_aa
		const bridges = await db.query(`
			SELECT bridge_id, export_aa, import_aa, home_network, foreign_network
			FROM bridges 
			WHERE (export_aa = ? OR import_aa = ?) 
			AND (home_network = ? OR foreign_network = ?)
		`, [normalizedAddress, normalizedAddress, network, network]);
		
		if (bridges.length === 0) {
			// Not a bridge address, might be a factory - we can't get block numbers from DB for factories
			return [];
		}
		
		const blockNumbers = new Set();
		
		// Get the network API instance
		if (!networkApi[network]) {
			console.log(`Network API not available for ${network}`);
			return [];
		}
		
		// For each bridge, get transfers and claims
		for (const bridge of bridges) {
			// Determine which side of the bridge this address is on
			// Compare normalized addresses (database stores checksummed addresses)
			const isExport = bridge.export_aa && normalizeAddress(bridge.export_aa, networkApiInstance) === normalizedAddress;
			const isImport = bridge.import_aa && normalizeAddress(bridge.import_aa, networkApiInstance) === normalizedAddress;
			
			// Get transfers where this network is involved
			let transfers = [];
			if (isExport && bridge.home_network === network) {
				// Export side - expatriations
				transfers = await db.query(`
					SELECT txid 
					FROM transfers 
					WHERE bridge_id = ? 
					AND type = 'expatriation'
				`, [bridge.bridge_id]);
			} else if (isImport && bridge.foreign_network === network) {
				// Import side - repatriations
				transfers = await db.query(`
					SELECT txid 
					FROM transfers 
					WHERE bridge_id = ? 
					AND type = 'repatriation'
				`, [bridge.bridge_id]);
			}
			
			// Get claims (always on the import side)
			const claims = await db.query(`
				SELECT claim_txid as txid
				FROM claims 
				WHERE bridge_id = ?
			`, [bridge.bridge_id]);
			
			// Combine all transaction hashes
			const allTxids = [
				...transfers.map(t => t.txid),
				...claims.map(c => c.txid)
			];
			
			// Query blockchain for block numbers (limit to avoid too many requests)
			const maxQueries = 100; // Limit to avoid rate limiting
			const txidsToQuery = allTxids.slice(0, maxQueries);
			
			for (const txid of txidsToQuery) {
				try {
					const tx = await networkApi[network].getTransaction(txid);
					if (tx && tx.blockNumber) {
						const blockNum = typeof tx.blockNumber === 'number' ? tx.blockNumber : tx.blockNumber.toNumber();
						if (blockNum >= startblock) {
							blockNumbers.add(blockNum);
						}
					}
				} catch (e) {
					// Transaction might not exist or be in a different network
					// Skip it
				}
			}
		}
		
		return Array.from(blockNumbers).sort((a, b) => a - b);
	} catch (e) {
		console.error(`Error getting block numbers from DB for ${network}/${address}:`, e);
		return [];
	}
}

/**
 * Request block numbers from peers
 * @param {string} network - Network name
 * @param {string} address - Contract address
 * @param {number} startblock - Starting block number
 * @returns {Promise<number[]>} Array of block numbers, or empty array if no peers respond
 */
async function requestBlockNumbersFromPeers(network, address, startblock) {
	if (!conf.bEnablePeerSeeding) {
		return [];
	}
	
	try {
		// Generate a unique request ID
		const requestId = `${network}-${address.toLowerCase()}-${startblock}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		
		// Create a promise that will be resolved when we get a response
		return new Promise((resolve) => {
			// Set timeout (10 seconds)
			const timeout = setTimeout(() => {
				pendingPeerRequests.delete(requestId);
				console.log(`Peer request timeout for ${network}/${address} from block ${startblock}`);
				resolve([]); // Return empty array on timeout, will fall back to explorer
			}, 10000);
			
			// Store the request
			pendingPeerRequests.set(requestId, { resolve, timeout });
			
			// Send request to peers
			// Note: This requires peers to be paired/connected via Obyte network
			// In a full implementation, you'd want peer discovery or a DHT
			const message = {
				type: 'evm_seed_request',
				requestId,
				network,
				address: address.toLowerCase(),
				startblock
			};
			
			// Send request to known peer addresses
			console.log(`Requesting block numbers from peers for ${network}/${address} from block ${startblock} (requestId: ${requestId})`);
			
			// Send to all available peers (configured + discovered)
			const peerAddresses = getAllPeerAddresses();
			if (peerAddresses.length > 0) {
				const configuredPeers = new Set((conf.peerSeedingAddresses || []).map(addr => addr.toLowerCase()));
				let sentCount = 0;
				let configuredSent = 0;
				let discoveredSent = 0;
				
				for (const peerAddress of peerAddresses) {
					try {
						device.sendMessageToDevice(peerAddress, 'json', JSON.stringify(message));
						sentCount++;
						if (configuredPeers.has(peerAddress.toLowerCase())) {
							configuredSent++;
						} else {
							discoveredSent++;
						}
					} catch (e) {
						console.log(`Could not send peer request to ${peerAddress}: ${e.message}`);
					}
				}
				if (sentCount > 0) {
					console.log(`Sent seed request to ${sentCount} peer(s) (${configuredSent} configured, ${discoveredSent} discovered)`);
				} else {
					console.log(`No peers available to send request to`);
				}
			} else {
				console.log(`No peer addresses available (configured or discovered) - will only respond to incoming requests`);
			}
		});
	} catch (e) {
		console.error(`Error requesting block numbers from peers:`, e);
		return [];
	}
}

/**
 * Add a peer to the discovered peers list
 * @param {string} peerAddress - Obyte device address
 */
function addDiscoveredPeer(peerAddress) {
	if (!peerAddress) return;
	
	const addressLower = peerAddress.toLowerCase();
	
	// Add to discovered peers
	if (!discoveredPeers.has(addressLower)) {
		discoveredPeers.add(addressLower);
		console.log(`🔍 Discovered new peer: ${addressLower} (total discovered: ${discoveredPeers.size})`);
		
		// Limit the size of discovered peers set
		if (discoveredPeers.size > MAX_DISCOVERED_PEERS) {
			// Remove oldest entries (simple FIFO - convert to array and remove first)
			const peersArray = Array.from(discoveredPeers);
			const toRemove = peersArray.slice(0, peersArray.length - MAX_DISCOVERED_PEERS);
			toRemove.forEach(addr => discoveredPeers.delete(addr));
		}
	}
}

/**
 * Get all available peer addresses (configured + discovered)
 * @returns {string[]} Array of peer addresses
 */
function getAllPeerAddresses() {
	const configuredPeers = conf.peerSeedingAddresses || [];
	const allPeers = new Set([
		...configuredPeers.map(addr => addr.toLowerCase()),
		...Array.from(discoveredPeers)
	]);
	return Array.from(allPeers);
}

/**
 * Handle incoming peer seeding requests
 * @param {string} from_address - Peer address
 * @param {Object} message - Request message
 */
async function handleSeedRequest(from_address, message) {
	if (!conf.bServeAsSeeder) {
		return;
	}
	
	try {
		const { requestId, network, address, startblock } = message;
		
		// Automatically discover this peer
		addDiscoveredPeer(from_address);
		
		console.log(`Received seed request from ${from_address}: ${network}/${address} from block ${startblock}`);
		
		// Get block numbers from database
		const blockNumbers = await getBlockNumbersFromDB(network, address, startblock);
		
		// Send response
		const response = {
			type: 'evm_seed_response',
			requestId,
			network,
			address,
			startblock,
			blockNumbers
		};
		
		device.sendMessageToDevice(from_address, 'json', JSON.stringify(response));
		console.log(`Sent seed response to ${from_address}: ${blockNumbers.length} block numbers`);
	} catch (e) {
		console.error(`Error handling seed request:`, e);
	}
}

/**
 * Handle incoming peer seeding responses
 * @param {string} from_address - Peer address
 * @param {Object} message - Response message
 */
function handleSeedResponse(from_address, message) {
	try {
		const { requestId, blockNumbers } = message;
		
		// Automatically discover this peer
		addDiscoveredPeer(from_address);
		
		// Find the pending request
		const request = pendingPeerRequests.get(requestId);
		if (!request) {
			console.log(`Received seed response for unknown request ${requestId}`);
			return;
		}
		
		// Clear timeout
		clearTimeout(request.timeout);
		pendingPeerRequests.delete(requestId);
		
		// Resolve the promise
		console.log(`Received seed response from ${from_address}: ${blockNumbers.length} block numbers`);
		request.resolve(blockNumbers);
	} catch (e) {
		console.error(`Error handling seed response:`, e);
	}
}

/**
 * Initialize peer seeding handlers
 */
function start() {
	if (!conf.bEnablePeerSeeding && !conf.bServeAsSeeder) {
		return;
	}
	
	// Listen for peer messages via text (Obyte device messages)
	eventBus.on('text', async (from_address, text) => {
		try {
			// Try to parse as JSON (peer seeding messages)
			const message = JSON.parse(text);
			if (message.type === 'evm_seed_request') {
				await handleSeedRequest(from_address, message);
			} else if (message.type === 'evm_seed_response') {
				handleSeedResponse(from_address, message);
			}
		} catch (e) {
			// Not a JSON message or not a seeding message, ignore
		}
	});
	
	// Listen for JSON messages directly if the device module supports it
	eventBus.on('json', async (from_address, json) => {
		try {
			const message = typeof json === 'string' ? JSON.parse(json) : json;
			if (message.type === 'evm_seed_request') {
				await handleSeedRequest(from_address, message);
			} else if (message.type === 'evm_seed_response') {
				handleSeedResponse(from_address, message);
			}
		} catch (e) {
			// Not a seeding message, ignore
		}
	});
	
	// Listen for broadcast peer seed requests (from eventBus)
	eventBus.on('peer_seed_request', async (message) => {
		if (!conf.bServeAsSeeder) {
			return;
		}
		// This would be handled by peers that receive the broadcast
		// For now, we rely on direct device messages
	});
	
	if (conf.bEnablePeerSeeding) {
		console.log('Peer seeding enabled - will request block numbers from peers during catch-up');
		console.log(`  Automatic peer discovery enabled - peers will be discovered via Obyte network`);
	}
	if (conf.bServeAsSeeder) {
		console.log('Peer seeding server enabled - will respond to peer requests for block numbers');
	}
	
	// Load configured peers into discovered set (so they're always available)
	if (conf.peerSeedingAddresses && conf.peerSeedingAddresses.length > 0) {
		conf.peerSeedingAddresses.forEach(addr => addDiscoveredPeer(addr));
		console.log(`  Loaded ${conf.peerSeedingAddresses.length} configured peer(s) into discovery cache`);
	}
}

exports.start = start;
exports.requestBlockNumbersFromPeers = requestBlockNumbersFromPeers;
exports.getBlockNumbersFromDB = getBlockNumbersFromDB;
exports.getDiscoveredPeers = () => Array.from(discoveredPeers);
exports.getAllPeerAddresses = getAllPeerAddresses;

