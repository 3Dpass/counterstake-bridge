#!/usr/bin/env node

/**
 * Test script to verify BSCScan cache event decoding
 * Tests the flow from cache -> processPastEventsFromParserCache -> handler args
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { normalizeAddress } = require('./address_normalizer.js');

// Load ABIs
const factoryJson = require('./evm/build/contracts/CounterstakeFactory.json');
const assistantFactoryJson = require('./evm/build/contracts/AssistantFactory.json');

// Mock network API for testing
class MockNetworkAPI {
	constructor(network) {
		this.network = network;
	}
	
	getEventFragment(eventName, contractType = 'factory') {
		const abi = contractType === 'factory' ? factoryJson.abi : assistantFactoryJson.abi;
		const iface = new ethers.utils.Interface(abi);
		try {
			return iface.getEvent(eventName);
		} catch (e) {
			return null;
		}
	}
	
	mapEventDataToArgs(eventName, data) {
		if (!data || typeof data !== 'object') {
			return [];
		}
		
		const eventParamOrder = {
			'NewExport': ['contractAddress', 'tokenAddress', 'foreign_network', 'foreign_asset'],
			'NewImport': ['contractAddress', 'home_network', 'home_asset', 'symbol', 'stakeTokenAddress'],
			'NewExportAssistant': ['contractAddress', 'bridgeAddress', 'manager', 'symbol'],
			'NewImportAssistant': ['contractAddress', 'bridgeAddress', 'manager', 'symbol'],
			'NewImportWrapper': ['contractAddress', 'home_network', 'home_asset', 'precompileAddress', 'stakeTokenAddress'],
			'NewImportWrapperAssistant': ['contractAddress', 'bridgeAddress', 'precompileAddress', 'name', 'symbol']
		};
		
		const paramOrder = eventParamOrder[eventName];
		if (!paramOrder) {
			return Object.values(data);
		}
		
		const args = [];
		let eventFragment = null;
		try {
			let iface = null;
			if (eventName === 'NewExport' || eventName === 'NewImport' || eventName === 'NewImportWrapper') {
				iface = new ethers.utils.Interface(factoryJson.abi);
			} else if (eventName === 'NewExportAssistant' || eventName === 'NewImportAssistant' || eventName === 'NewImportWrapperAssistant') {
				iface = new ethers.utils.Interface(assistantFactoryJson.abi);
			}
			if (iface) {
				try {
					eventFragment = iface.getEvent(eventName);
				} catch (e) {}
			}
		} catch (e) {}
		
		for (let i = 0; i < paramOrder.length; i++) {
			const paramName = paramOrder[i];
			if (data.hasOwnProperty(paramName)) {
				let paramValue = data[paramName];
				
				const isAddress = eventFragment && eventFragment.inputs && eventFragment.inputs[i] 
					? eventFragment.inputs[i].type === 'address'
					: paramName.toLowerCase().includes('address') || paramName.toLowerCase().includes('manager') || paramName.toLowerCase().includes('token');
				
				if (isAddress && paramValue && typeof paramValue === 'string' && paramValue.startsWith('0x')) {
					try {
						paramValue = normalizeAddress(paramValue, null);
					} catch (e) {}
				}
				
				args.push(paramValue);
			} else {
				args.push(undefined);
			}
		}
		
		return args;
	}
}

function decodeEventFromCache(log, contractAddress, networkApi) {
	const eventName = log.name;
	if (!eventName) {
		return null;
	}
	
	// Get event fragment
	const contractType = eventName.includes('Assistant') ? 'assistant' : 'factory';
	const eventFragment = networkApi.getEventFragment(eventName, contractType);
	
	const eventArgs = [];
	
	if (eventFragment && eventFragment.inputs) {
		// Primary path: use event fragment
		for (const input of eventFragment.inputs) {
			let paramValue = null;
			
			if (input.indexed) {
				// Indexed parameters in topics
				const indexedIndex = eventFragment.inputs.filter(inp => inp.indexed).indexOf(input);
				const topic = log.topics.find(t => t.index === indexedIndex + 1);
				if (topic) {
					const topicValue = topic.value;
					if (input.type === 'address') {
						paramValue = normalizeAddress(topicValue, networkApi);
					} else {
						paramValue = topicValue;
					}
				}
			} else {
				// Non-indexed parameters in data
				if (log.data && log.data[input.name] !== undefined) {
					paramValue = log.data[input.name];
					
					if (input.type === 'address') {
						paramValue = normalizeAddress(paramValue, networkApi);
					}
				}
			}
			
			eventArgs.push(paramValue);
		}
		
		// Fill any null values using mapping
		if (eventArgs.some(v => v === null || v === undefined)) {
			const mappedArgs = networkApi.mapEventDataToArgs(eventName, log.data);
			for (let i = 0; i < eventArgs.length && i < mappedArgs.length; i++) {
				if (eventArgs[i] === null || eventArgs[i] === undefined) {
					eventArgs[i] = mappedArgs[i];
				}
			}
		}
	} else {
		// Fallback: use mapping function
		eventArgs.push(...networkApi.mapEventDataToArgs(eventName, log.data));
	}
	
	return {
		eventName,
		args: eventArgs,
		address: normalizeAddress(log.address || contractAddress, networkApi)
	};
}

async function testCacheFile(cacheFilePath) {
	console.log(`\n${'='.repeat(80)}`);
	console.log(`Testing cache file: ${path.basename(cacheFilePath)}`);
	console.log('='.repeat(80));
	
	const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
	const contractAddress = cacheData.address;
	const networkApi = new MockNetworkAPI('BSC');
	
	console.log(`\nContract Address: ${contractAddress}`);
	console.log(`Transactions: ${cacheData.transactions.length}`);
	
	let totalEvents = 0;
	let decodedEvents = 0;
	
	for (const tx of cacheData.transactions) {
		if (!tx.eventLogs || tx.eventLogs.length === 0) {
			continue;
		}
		
		console.log(`\n  Transaction: ${tx.txHash.substring(0, 16)}... (Block: ${tx.blockNumber})`);
		console.log(`    Event Logs: ${tx.eventLogs.length}`);
		
		for (const log of tx.eventLogs) {
			totalEvents++;
			
			if (!log.name) {
				console.log(`    ⚠️  Event log ${log.logIndex}: No event name`);
				continue;
			}
			
			console.log(`\n    📋 Event: ${log.name} (Log Index: ${log.logIndex})`);
			
			// Decode the event
			const decoded = decodeEventFromCache(log, contractAddress, networkApi);
			
			if (!decoded) {
				console.log(`      ❌ Failed to decode event`);
				continue;
			}
			
			decodedEvents++;
			
			// Show decoded args
			console.log(`      ✅ Decoded successfully`);
			console.log(`      Address: ${decoded.address}`);
			
			if (decoded.eventName === 'NewImport') {
				console.log(`      Args for onNewImport:`);
				console.log(`        contractAddress: ${decoded.args[0]}`);
				console.log(`        home_network: ${decoded.args[1]}`);
				console.log(`        home_asset: ${decoded.args[2]}`);
				console.log(`        symbol: ${decoded.args[3]}`);
				console.log(`        stakeTokenAddress: ${decoded.args[4]}`);
				
				// Verify addresses are normalized
				if (decoded.args[0] && decoded.args[0].startsWith('0x')) {
					const isNormalized = decoded.args[0] === normalizeAddress(decoded.args[0], null);
					console.log(`        ✅ contractAddress normalized: ${isNormalized}`);
				}
				if (decoded.args[4] && decoded.args[4] !== '0x0000000000000000000000000000000000000000' && decoded.args[4].startsWith('0x')) {
					const isNormalized = decoded.args[4] === normalizeAddress(decoded.args[4], null);
					console.log(`        ✅ stakeTokenAddress normalized: ${isNormalized}`);
				}
			} else if (decoded.eventName === 'NewImportAssistant') {
				console.log(`      Args for onNewImportAssistant:`);
				console.log(`        assistantAddress: ${decoded.args[0]}`);
				console.log(`        bridgeAddress: ${decoded.args[1]}`);
				console.log(`        manager: ${decoded.args[2]}`);
				console.log(`        symbol: ${decoded.args[3]}`);
				
				// Verify addresses are normalized
				['assistantAddress', 'bridgeAddress', 'manager'].forEach((name, idx) => {
					if (decoded.args[idx] && decoded.args[idx].startsWith('0x')) {
						const isNormalized = decoded.args[idx] === normalizeAddress(decoded.args[idx], null);
						console.log(`        ✅ ${name} normalized: ${isNormalized}`);
					}
				});
			} else if (decoded.eventName === 'NewExport') {
				console.log(`      Args for onNewExport:`);
				console.log(`        contractAddress: ${decoded.args[0]}`);
				console.log(`        tokenAddress: ${decoded.args[1]}`);
				console.log(`        foreign_network: ${decoded.args[2]}`);
				console.log(`        foreign_asset: ${decoded.args[3]}`);
			} else if (decoded.eventName === 'NewExportAssistant') {
				console.log(`      Args for onNewExportAssistant:`);
				console.log(`        assistantAddress: ${decoded.args[0]}`);
				console.log(`        bridgeAddress: ${decoded.args[1]}`);
				console.log(`        manager: ${decoded.args[2]}`);
				console.log(`        symbol: ${decoded.args[3]}`);
			} else {
				console.log(`      Args:`, decoded.args);
			}
			
			// Check for null/undefined values
			const hasNull = decoded.args.some(v => v === null || v === undefined);
			if (hasNull) {
				console.log(`      ⚠️  Warning: Some args are null/undefined`);
			}
		}
	}
	
	console.log(`\n  Summary:`);
	console.log(`    Total Events: ${totalEvents}`);
	console.log(`    Decoded Events: ${decodedEvents}`);
	console.log(`    Success Rate: ${totalEvents > 0 ? ((decodedEvents / totalEvents) * 100).toFixed(1) : 0}%`);
}

async function main() {
	console.log('🧪 Testing BSCScan Cache Event Decoding');
	console.log('='.repeat(80));
	
	// Test the cache files mentioned by the user
	const cacheFiles = [
		'.bscscan-cache/0x91c79a253481baa22e7e481f6509e70e5e6a883f.json', // Factory with NewImport
		'.bscscan-cache/0x65f7cb5a76c975ff763beae41b761861d019301c.json', // Assistant factory with NewImportAssistant
		'.bscscan-cache/0x472af6fdf5677c5b4a7f718dc6baf8c9f86db7fb.json', // Factory with NewImport
	];
	
	for (const cacheFile of cacheFiles) {
		const cachePath = path.join(__dirname, cacheFile);
		if (fs.existsSync(cachePath)) {
			await testCacheFile(cachePath);
		} else {
			console.log(`\n⚠️  Cache file not found: ${cacheFile}`);
		}
	}
	
	console.log(`\n${'='.repeat(80)}`);
	console.log('✅ Test Complete');
	console.log('='.repeat(80));
}

main().catch(console.error);

