const { request } = require('./request.js');
const { wait } = require('./utils.js');
const { normalizeAddress } = require('./address_normalizer.js');

const threedpass_base_url = process.env.testnet ? 'https://api-testnet.3dpscan.xyz' : 'https://api.3dpscan.xyz';
let last_req_ts = 0;

/**
 * Get blocks containing EVM events for a specific contract address
 * @param {Object} params - Parameters object
 * @param {string} params.address - Contract address to query
 * @param {number} params.startblock - Starting block number
 * @param {number} params.endblock - Ending block number (optional)
 * @param {number} params.count - Retry count for error handling
 * @returns {Promise<number[]>} Array of block numbers containing EVM events
 */
async function getAddressBlocks({ address, startblock, endblock, count = 0 }) {
	try {
		let page = 0;
		const page_size = 100;
		let all_blocks = [];
		
		while (true) {
			// Rate limiting: 1 request per second
			const passed = Date.now() - last_req_ts;
			if (passed < 1000) {
				console.log(`will wait for ${1000 - passed} ms between 3dpscan requests`);
				await wait(1000 - passed);
			}
			
			// Build URL for EVM events query
			let url = `${threedpass_base_url}/events?section=evm&is_extrinsic=false&block_start=${startblock || 0}`;
			if (endblock) {
				url += `&block_end=${endblock}`;
			}
			url += `&page=${page}`;
			
			console.log(`Querying 3DPass EVM events for address ${address}: ${url}`);
			const resp = await request(url);
			last_req_ts = Date.now();
			
			if (!resp.items) {
				if (resp.total === 0 && resp.page === 0) { // no events for this address
					break;
				}
				throw Error(`no items from 3dpscan EVM events: ${JSON.stringify(resp)}`);
			}
			
			// Filter events for the specific contract address
			// Normalize both addresses for consistent comparison (handles checksummed addresses from DB)
			const normalizedAddress = normalizeAddress(address, null); // No networkApi needed for basic EVM address normalization
			const relevantEvents = resp.items.filter(item => {
				if (item.section !== 'evm' || item.method !== 'Log') {
					return false;
				}
				
				const log = item.args[0].value;
				const normalizedLogAddress = normalizeAddress(log.address, null);
				return normalizedLogAddress === normalizedAddress;
			});
			
			// Extract block heights from relevant events
			const blocks = relevantEvents.map(item => item.indexer.blockHeight);
			all_blocks.push(...blocks);
			
			console.log(`Found ${relevantEvents.length} relevant EVM events in page ${page} for address ${address}`);
			
			// Check if we should continue pagination
			if (resp.items.length < page_size) {
				break; // No more pages
			}
			if (resp.items.length === 0) {
				break; // No more items
			}
			page++;
		}
		
		// Process and return unique blocks
		let unique_blocks = [...new Set(all_blocks)];
		if (startblock) {
			unique_blocks = unique_blocks.filter(b => b >= startblock);
		}
		unique_blocks.sort((a, b) => a - b);
		
		console.log(`Found ${unique_blocks.length} unique blocks with EVM events for address ${address}`);
		return unique_blocks;
	}
	catch (e) {
		console.log(`getAddressBlocks from 3dpscan EVM events failed`, e);
		if (count > 5) {
			throw e;
		}
		console.log(`will retry getAddressBlocks from 3dpscan in 60 sec`);
		await wait(60 * 1000);
		count++;
		return await getAddressBlocks({ address, startblock, endblock, count });
	}
}

/**
 * Get EVM transaction events for a specific address
 * @param {Object} params - Parameters object
 * @param {string} params.address - Contract address to query
 * @param {number} params.startblock - Starting block number
 * @param {number} params.endblock - Ending block number (optional)
 * @param {number} params.count - Retry count for error handling
 * @returns {Promise<number[]>} Array of block numbers containing EVM transactions
 */
async function getAddressTransactionBlocks({ address, startblock, endblock, count = 0 }) {
	try {
		let page = 0;
		const page_size = 100;
		let all_blocks = [];
		
		while (true) {
			// Rate limiting: 1 request per second
			const passed = Date.now() - last_req_ts;
			if (passed < 1000) {
				console.log(`will wait for ${1000 - passed} ms between 3dpscan requests`);
				await wait(1000 - passed);
			}
			
			// Build URL for EVM transaction events query
			let url = `${threedpass_base_url}/events?section=ethereum&is_extrinsic=false&time_dimension=block&block_start=${startblock || 0}`;
			if (endblock) {
				url += `&block_end=${endblock}`;
			}
			url += `&page=${page}`;
			
			console.log(`Querying 3DPass EVM transactions for address ${address}: ${url}`);
			const resp = await request(url);
			last_req_ts = Date.now();
			
			if (!resp.items) {
				if (resp.total === 0 && resp.page === 0) { // no transactions for this address
					break;
				}
				throw Error(`no items from 3dpscan EVM transactions: ${JSON.stringify(resp)}`);
			}
			
			// Filter transactions for the specific contract address
			// Normalize addresses for consistent comparison (handles checksummed addresses from DB)
			const normalizedAddress = normalizeAddress(address, null); // No networkApi needed for basic EVM address normalization
			const relevantTransactions = resp.items.filter(item => {
				if (item.section !== 'ethereum' || item.method !== 'Executed') {
					return false;
				}
				
				const args = item.args;
				const toAddress = args.find(arg => arg.name === 'to')?.value;
				const fromAddress = args.find(arg => arg.name === 'from')?.value;
				
				const normalizedToAddress = toAddress ? normalizeAddress(toAddress, null) : null;
				const normalizedFromAddress = fromAddress ? normalizeAddress(fromAddress, null) : null;
				
				return normalizedToAddress === normalizedAddress || 
					   normalizedFromAddress === normalizedAddress;
			});
			
			// Extract block heights from relevant transactions
			const blocks = relevantTransactions.map(item => item.indexer.blockHeight);
			all_blocks.push(...blocks);
			
			console.log(`Found ${relevantTransactions.length} relevant EVM transactions in page ${page} for address ${address}`);
			
			// Check if we should continue pagination
			if (resp.items.length < page_size) {
				break; // No more pages
			}
			if (resp.items.length === 0) {
				break; // No more items
			}
			page++;
		}
		
		// Process and return unique blocks
		let unique_blocks = [...new Set(all_blocks)];
		if (startblock) {
			unique_blocks = unique_blocks.filter(b => b >= startblock);
		}
		unique_blocks.sort((a, b) => a - b);
		
		console.log(`Found ${unique_blocks.length} unique blocks with EVM transactions for address ${address}`);
		return unique_blocks;
	}
	catch (e) {
		console.log(`getAddressTransactionBlocks from 3dpscan EVM transactions failed`, e);
		if (count > 5) {
			throw e;
		}
		console.log(`will retry getAddressTransactionBlocks from 3dpscan in 60 sec`);
		await wait(60 * 1000);
		count++;
		return await getAddressTransactionBlocks({ address, startblock, endblock, count });
	}
}

exports.getAddressBlocks = getAddressBlocks;
exports.getAddressTransactionBlocks = getAddressTransactionBlocks; 