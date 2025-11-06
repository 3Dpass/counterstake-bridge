const _ = require('lodash');
const mutex = require('ocore/mutex.js');
const { request } = require('./request.js');
const { wait } = require('./utils.js');
const { parseBSCScanBlockNumbers } = require('./bscscan-simple-parser.js');
const { parseEtherscanBlockNumbers } = require('./etherscan-simple-parser.js');

let last_req_ts = {};


async function waitBetweenRequests(base_url, chainid, bWithApiKey) {
	const timeout = bWithApiKey ? 300 : 6000; // 6 sec
	// Use chainid-specific key to allow concurrent requests for different chains
	const rateLimitKey = chainid ? `${base_url}_chainid_${chainid}` : base_url;
	const passed = last_req_ts[rateLimitKey] ? Date.now() - last_req_ts[rateLimitKey] : Infinity;
	if (passed < timeout) {
		console.log(`will wait for ${timeout - passed} ms between ${base_url} requests (chainid ${chainid})`);
		await wait(timeout - passed);
	}
}

async function getAddressHistory({ base_url, chainid, address, startblock, startts, api_key, bInternal = false, getUrl, getOptions, retry_count = 0 }) {
	// Use chainid-specific mutex key to allow concurrent requests for different chains
	// This prevents Ethereum (chainid=1) and BSC (chainid=56) from blocking each other
	const mutexKey = chainid ? `${base_url}_chainid_${chainid}` : base_url;
	const unlock = await mutex.lock(mutexKey);
	const retry = async (msg) => {
		unlock(msg);
		retry_count++;
		return await getAddressHistory({ base_url, chainid, address, startblock, startts, api_key, bInternal, getUrl, getOptions, retry_count });
	};
	const requestWithUnlock = async (url) => {
		try {
			return await request(url, getOptions ? getOptions() : {});
		}
		catch (e) {
			console.log(`request ${url} failed`, e);
			unlock();
			throw e;
		}
	};
	await waitBetweenRequests(base_url, chainid, !!api_key);
	const rateLimitKey = chainid ? `${base_url}_chainid_${chainid}` : base_url;
	if (startts && !startblock) {
		const defaultGetUrl = () => {
			let url = `${base_url}/api?chainid=${chainid}&module=block&action=getblocknobytime&timestamp=${startts}&closest=after`;
			if (api_key)
				url += `&apikey=${api_key}`;
			return url;
		};
		const resp = await requestWithUnlock(getUrl ? getUrl('block-by-ts', startts) : defaultGetUrl());
		last_req_ts[rateLimitKey] = Date.now();
		if (!getUrl && resp.message === 'NOTOK' && retry_count < 10)
			return await retry(`got "${resp.result}", will retry`);
		startblock = getUrl ? resp : resp.result;
		if (!startblock) {
			unlock();
			throw Error(`no block number from ${base_url} for ${startts}: ${JSON.stringify(resp)}`);
		}
		await waitBetweenRequests(base_url, chainid, !!api_key);
	}
	const defaultGetUrl = () => {
		const action = bInternal ? 'txlistinternal' : 'txlist';
		let url = `${base_url}/api?chainid=${chainid}&module=account&action=${action}&address=${address}`;
		if (startblock)
			url += `&startblock=${startblock}`;
		if (api_key)
			url += `&apikey=${api_key}`;
		return url;
	};
	const resp = await requestWithUnlock(getUrl ? getUrl('account-history', { address, bInternal, startblock }) : defaultGetUrl());
	last_req_ts[rateLimitKey] = Date.now();
	if (!getUrl && resp.message === 'NOTOK' && retry_count < 10) {
		// Check if this is a rate limit error
		const rateLimitMsg = typeof resp.result === 'string' ? resp.result : '';
		const isRateLimitError = rateLimitMsg.includes('Free API access is temporarily unavailable') ||
			rateLimitMsg.includes('rate limit') ||
			rateLimitMsg.includes('Max rate limit reached');
		
		// If rate limit error on first attempt, throw immediately so getAddressBlocks can use fallback
		if (isRateLimitError && retry_count === 0) {
			unlock();
			throw new Error(`Free API access is temporarily unavailable: ${rateLimitMsg}`);
		}
		
		if (isRateLimitError && retry_count < 3) {
			// Use longer delay for rate limit errors (5 minutes)
			console.log(`got "${resp.result}", will retry in 5 minutes (rate limit)`);
			unlock();
			await wait(5 * 60 * 1000);
			return await getAddressHistory({ base_url, chainid, address, startblock, startts, api_key, bInternal, getUrl, getOptions, retry_count: retry_count + 1 });
		}
		// After 3 retries with rate limit, throw error so getAddressBlocks can try fallback
		if (isRateLimitError && retry_count >= 3) {
			unlock();
			throw new Error(`Free API access is temporarily unavailable: ${rateLimitMsg}`);
		}
		return await retry(`got "${resp.result}", will retry`);
	}
	unlock();
	const history = getUrl ? resp : resp.result;
	if (!Array.isArray(history)) {
		const errorMsg = typeof resp.result === 'string' ? resp.result : JSON.stringify(resp);
		// Check if it's a rate limit error in the error message
		if (errorMsg.includes('Free API access is temporarily unavailable')) {
			throw new Error(`Free API access is temporarily unavailable: ${errorMsg}`);
		}
		throw Error(`no history from ${base_url} for ${address}: ${JSON.stringify(resp)}`);
	}
	return history;
}


async function getAddressBlocks({ base_url, chainid, address, startblock, startts, api_key, getUrl, getOptions, count = 0, networkApi = null }) {
	const conf = require('./conf.js');
	
	// If AlwaysUseBSCscanParser is enabled and this is BSC, skip API calls and use parser only
	if (conf.AlwaysUseBSCscanParser && chainid === 56) {
		console.log(`📡 AlwaysUseBSCscanParser enabled: using BSCScan HTML parser as only source for ${address}...`);
		try {
			const result = await parseBSCScanBlockNumbers(address, { 
				delay: 2000, 
				retries: 2, 
				includeTransactions: true, 
				includeEventLogs: true,
				maxPages: 0 // Fetch all pages
			});
			
			if (result.success && result.blockNumbers && result.blockNumbers.length > 0) {
				let blocks = result.blockNumbers;
				
				// Filter by startblock if provided
				if (startblock) {
					const initLen = blocks.length;
					blocks = blocks.filter(b => b >= startblock);
					console.log(`Filtered parser blocks: ${initLen} -> ${blocks.length} (startblock: ${startblock})`);
				}
				
				blocks.sort();
				
				// Store transaction hashes and event logs in cache
				if (result.transactions && result.transactions.length > 0 && networkApi) {
					const network = 'BSC';
					if (networkApi[network]) {
						networkApi[network].storeCachedTransactions(address, result.transactions);
						
						// Cache event logs for each transaction
						result.transactions.forEach(tx => {
							if (tx.eventLogs && tx.eventLogs.length > 0) {
								networkApi[network].storeCachedEventLogs(tx.txHash, tx.eventLogs);
							}
						});
					}
				}
				
				console.log(`✅ BSCScan parser (AlwaysUseBSCscanParser): found ${blocks.length} blocks${result.transactions ? ` and ${result.transactions.length} transactions` : ''}`);
				return blocks;
			} else {
				throw new Error(`BSCScan parser failed: ${result.error || 'unknown error'}`);
			}
		} catch (parserError) {
			console.error(`❌ BSCScan parser failed (AlwaysUseBSCscanParser enabled):`, parserError.message);
			throw parserError;
		}
	}
	
	// If AlwaysUseEtherscanParser is enabled and this is Ethereum, skip API calls and use parser only
	if (conf.AlwaysUseEtherscanParser && chainid === 1) {
		console.log(`📡 AlwaysUseEtherscanParser enabled: using Etherscan HTML parser as only source for ${address}...`);
		try {
			const result = await parseEtherscanBlockNumbers(address, { 
				delay: 2000, 
				retries: 2, 
				includeTransactions: true, 
				includeEventLogs: true,
				maxPages: 0 // Fetch all pages
			});
			
			if (result.success && result.blockNumbers && result.blockNumbers.length > 0) {
				let blocks = result.blockNumbers;
				
				// Filter by startblock if provided
				if (startblock) {
					const initLen = blocks.length;
					blocks = blocks.filter(b => b >= startblock);
					console.log(`Filtered parser blocks: ${initLen} -> ${blocks.length} (startblock: ${startblock})`);
				}
				
				blocks.sort();
				
				// Store transaction hashes and event logs in cache
				if (result.transactions && result.transactions.length > 0 && networkApi) {
					const network = 'Ethereum';
					if (networkApi[network]) {
						networkApi[network].storeCachedTransactions(address, result.transactions);
						
						// Cache event logs for each transaction
						result.transactions.forEach(tx => {
							if (tx.eventLogs && tx.eventLogs.length > 0) {
								networkApi[network].storeCachedEventLogs(tx.txHash, tx.eventLogs);
							}
						});
					}
				}
				
				console.log(`✅ Etherscan parser (AlwaysUseEtherscanParser): found ${blocks.length} blocks${result.transactions ? ` and ${result.transactions.length} transactions` : ''}`);
				return blocks;
			} else {
				throw new Error(`Etherscan parser failed: ${result.error || 'unknown error'}`);
			}
		} catch (parserError) {
			console.error(`❌ Etherscan parser failed (AlwaysUseEtherscanParser enabled):`, parserError.message);
			throw parserError;
		}
	}
	
	// Normal API-based flow
	try {
		const ext_history = await getAddressHistory({ base_url, chainid, address, startblock, startts, api_key, bInternal: false, getUrl, getOptions });
		const int_history = await getAddressHistory({ base_url, chainid, address, startblock, startts, api_key, bInternal: true, getUrl, getOptions });
		const history = ext_history.concat(int_history);
		let blocks = _.uniq(history.map(tx => parseInt(tx.blockNumber)));
		if (startblock) {
			const initLen = blocks.length;
			blocks = blocks.filter(b => b >= startblock); // kava explorer seems to ignore startblock and return the entire history
			console.log(`${address} txs since ${startblock}: ${initLen} before filtering, ${blocks.length} after filtering`);
		}
		blocks.sort();
		return blocks;
	}
	catch (e) {
		console.log(`getAddressBlocks ${base_url} failed`, e);
		console.log(`   Error message: ${e.message}`);
		console.log(`   Chain ID: ${chainid}, Address: ${address}, Count: ${count}`);
		
		// Check if this is a rate limit error
		const isRateLimitError = e.message && (
			e.message.includes('Free API access is temporarily unavailable') ||
			e.message.includes('rate limit') ||
			e.message.includes('NOTOK') && e.message.includes('Free API access')
		);
		
		console.log(`   Is rate limit error: ${isRateLimitError}`);
		
		// If rate limit error and we haven't tried fallback yet, try HTML parsing fallback
		if (isRateLimitError && count === 0) {
			console.log(`⚠️  Rate limit detected, attempting HTML parsing fallback for ${chainid === 56 ? 'BSC' : chainid === 1 ? 'Ethereum' : 'unknown'}...`);
			try {
				let fallbackBlocks = [];
				if (chainid === 56) {
					// BSC fallback
					console.log(`📡 Calling BSCScan HTML parser for ${address}...`);
					const result = await parseBSCScanBlockNumbers(address, { delay: 2000, retries: 2, includeTransactions: true, includeEventLogs: true });
					console.log(`📡 BSCScan parser result:`, { success: result.success, blockCount: result.blockNumbers?.length, txCount: result.transactions?.length, error: result.error });
					if (result.success && result.blockNumbers && result.blockNumbers.length > 0) {
						fallbackBlocks = result.blockNumbers;
						console.log(`✅ BSCScan HTML fallback succeeded: found ${fallbackBlocks.length} blocks${result.transactions ? ` and ${result.transactions.length} transactions` : ''}`);
						
					// Store transaction hashes in cache for later use in processPastEvents fallback
					if (result.transactions && result.transactions.length > 0 && networkApi) {
						const network = chainid === 56 ? 'BSC' : chainid === 1 ? 'Ethereum' : null;
						if (network && networkApi[network]) {
							networkApi[network].storeCachedTransactions(address, result.transactions);
							
							// Also cache event logs for each transaction if they exist
							result.transactions.forEach(tx => {
								if (tx.eventLogs && tx.eventLogs.length > 0) {
									networkApi[network].storeCachedEventLogs(tx.txHash, tx.eventLogs);
								}
							});
						}
					}
					} else {
						console.log(`⚠️  BSCScan HTML fallback found no blocks: ${result.error || 'unknown error'}`);
					}
				} else if (chainid === 1) {
					// Ethereum fallback
					console.log(`📡 Calling Etherscan HTML parser for ${address}...`);
					const result = await parseEtherscanBlockNumbers(address, { delay: 2000, retries: 2, includeTransactions: true, includeEventLogs: true });
					console.log(`📡 Etherscan parser result:`, { success: result.success, blockCount: result.blockNumbers?.length, txCount: result.transactions?.length, error: result.error });
					if (result.success && result.blockNumbers && result.blockNumbers.length > 0) {
						fallbackBlocks = result.blockNumbers;
						console.log(`✅ Etherscan HTML fallback succeeded: found ${fallbackBlocks.length} blocks${result.transactions ? ` and ${result.transactions.length} transactions` : ''}`);
						
						// Store transaction hashes in cache for later use in processPastEvents fallback
						if (result.transactions && result.transactions.length > 0 && networkApi) {
							const network = chainid === 56 ? 'BSC' : chainid === 1 ? 'Ethereum' : null;
							if (network && networkApi[network]) {
								networkApi[network].storeCachedTransactions(address, result.transactions);
								
								// Also cache event logs for each transaction if they exist
								result.transactions.forEach(tx => {
									if (tx.eventLogs && tx.eventLogs.length > 0) {
										networkApi[network].storeCachedEventLogs(tx.txHash, tx.eventLogs);
									}
								});
							}
						}
					} else {
						console.log(`⚠️  Etherscan HTML fallback found no blocks: ${result.error || 'unknown error'}`);
					}
				}
				
				if (fallbackBlocks.length > 0) {
					// Filter by startblock if provided
					if (startblock) {
						const initLen = fallbackBlocks.length;
						fallbackBlocks = fallbackBlocks.filter(b => b >= startblock);
						console.log(`Filtered fallback blocks: ${initLen} -> ${fallbackBlocks.length} (startblock: ${startblock})`);
					}
					fallbackBlocks.sort();
					return fallbackBlocks;
				} else {
					console.log(`⚠️  HTML fallback found no blocks, will retry API`);
				}
			} catch (fallbackError) {
				console.log(`⚠️  HTML fallback failed: ${fallbackError.message}, will retry API`);
				console.log(`   Fallback error stack:`, fallbackError.stack);
			}
		}
		
		if (count > 5) {
			console.error(`❌ getAddressBlocks ${base_url} failed after ${count} retries for address ${address}`);
			throw e;
		}
		
		// Use longer retry delay for rate limit errors (5 minutes) vs normal errors (60 seconds)
		const retryDelay = isRateLimitError ? 5 * 60 * 1000 : 60 * 1000;
		console.log(`will retry getAddressBlocks ${base_url} in ${retryDelay / 1000} sec${isRateLimitError ? ' (rate limit error)' : ''}`);
		await wait(retryDelay);
		count++;
		return await getAddressBlocks({ base_url, chainid, address, startblock, startts, api_key, getUrl, getOptions, count, networkApi });
	}
}

async function test() {
	const blocks = await getAddressBlocks({ base_url: 'https://api.bscscan.com', address: '0x91C79A253481bAa22E7E481f6509E70e5E6A883F' });
	console.log(blocks);
	process.exit();
}
//test();

exports.getAddressBlocks = getAddressBlocks;
