/*jslint node: true */
"use strict";

/**
 * Link orphaned claims (claims with transfer_id = NULL) to their corresponding transfers
 * by querying the blockchain and matching with existing transfers in the database
 */

const db = require('ocore/db.js');
const { ethers } = require("ethers");
const { getProvider } = require("./evm/provider.js");
const exportJson = require('./evm/build/contracts/Export.json');
const importJson = require('./evm/build/contracts/Import.json');
const { BigNumber } = require("ethers");
const { normalizeAddress } = require('./address_normalizer.js');

// Data matching functions (don't require full network API initialization)
const string_utils = require('ocore/string_utils.js');

// We'll import addTransfer dynamically to avoid circular dependencies
let transfersModule = null;
function getTransfersModule() {
	if (!transfersModule) {
		transfersModule = require('./transfers.js');
	}
	return transfersModule;
}

async function getBridge(bridge_id) {
	const [bridge] = await db.query("SELECT * FROM bridges WHERE bridge_id=?", [bridge_id]);
	if (!bridge)
		throw Error(`bridge not found: ${bridge_id}`);
	return bridge;
}

function amountsMatch(src_amount, src_asset_decimals, dst_amount, dst_asset_decimals) {
	// Same logic as in transfers.js
	src_amount = BigNumber.from(src_amount);
	dst_amount = BigNumber.from(dst_amount);
	const factor = BigNumber.from(10).pow(Math.abs(src_asset_decimals - dst_asset_decimals));
	return (
		src_asset_decimals > dst_asset_decimals && dst_amount.mul(factor).eq(src_amount)
		||
		src_asset_decimals <= dst_asset_decimals && src_amount.mul(factor).eq(dst_amount)
	);
}

/**
 * Validate a claim against a transfer using the same logic as handleNewClaim in transfers.js
 * This is the exact same validation that happens when a new claim is processed
 * @param {Object} claim - The claim object
 * @param {Object} transfer - The transfer object
 * @param {Object} bridge - The bridge object with network info
 * @returns {Object} { valid: boolean, reason: string }
 */
function validateClaimAgainstTransfer(claim, transfer, bridge) {
	// Check if bridge is complete
	const bCompleteBridge = bridge.export_aa && bridge.import_aa;
	if (!bCompleteBridge) {
		return {
			valid: false,
			reason: `Bridge ${bridge.bridge_id} is incomplete (missing export_aa or import_aa)`
		};
	}
	
	// Check decimals
	if (bridge.home_asset_decimals === null || bridge.foreign_asset_decimals === null) {
		return {
			valid: false,
			reason: `Bridge ${bridge.bridge_id} has null decimals (home: ${bridge.home_asset_decimals}, foreign: ${bridge.foreign_asset_decimals})`
		};
	}
	
	// Check creation_date: transfer must be created before or at the same time as the claim
	if (claim.creation_date && transfer.creation_date) {
		const claimDate = new Date(claim.creation_date);
		const transferDate = new Date(transfer.creation_date);
		if (claimDate < transferDate) {
			return {
				valid: false,
				reason: `Creation date invalid: claim was created ${claim.creation_date} before transfer ${transfer.creation_date}`
			};
		}
	}
	
	// Determine network for data matching
	const network = claim.type === 'expatriation' ? bridge.foreign_network : bridge.home_network;
	
	// Check data matches (same as checkTransfer in transfers.js)
	if (!dataMatches(network, transfer.data || '0x', claim.data || '0x')) {
		return {
			valid: false,
			reason: `Data mismatch: transfer.data="${transfer.data}", claim.data="${claim.data}"`
		};
	}
	
	// Check amounts match (same as checkTransfer in transfers.js)
	const src_asset_decimals = claim.type === 'expatriation' ? bridge.home_asset_decimals : bridge.foreign_asset_decimals;
	const dst_asset_decimals = claim.type === 'expatriation' ? bridge.foreign_asset_decimals : bridge.home_asset_decimals;
	
	if (!amountsMatch(transfer.amount, src_asset_decimals, claim.amount, dst_asset_decimals)) {
		return {
			valid: false,
			reason: `Amount mismatch: transfer.amount=${transfer.amount} (${src_asset_decimals} decimals), claim.amount=${claim.amount} (${dst_asset_decimals} decimals)`
		};
	}
	
	// Check rewards match (same as checkTransfer in transfers.js)
	if (!amountsMatch(transfer.reward, src_asset_decimals, claim.reward, dst_asset_decimals)) {
		return {
			valid: false,
			reason: `Reward mismatch: transfer.reward=${transfer.reward} (${src_asset_decimals} decimals), claim.reward=${claim.reward} (${dst_asset_decimals} decimals)`
		};
	}
	
	return { valid: true, reason: null };
}

/**
 * Data matching function that matches the logic in networkApi[network].dataMatches
 * For EVM chains: simple string comparison
 * For Obyte: handles JSON sorting (same as Obyte.dataMatches)
 */
function dataMatches(network, sent_data, claimed_data) {
	// Normalize null/undefined
	let sent = sent_data || '0x';
	const claimed = claimed_data || '0x';
	
	// Decode HTML entities in transfer data (sometimes stored with &quot; etc.)
	if (typeof sent === 'string' && sent.includes('&quot;')) {
		sent = sent.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
	}
	
	// For EVM chains (Ethereum, BSC, Polygon, Kava, 3DPass), simple string comparison
	if (network !== 'Obyte') {
		return sent === claimed;
	}
	
	// For Obyte: handle JSON sorting (same logic as Obyte.dataMatches)
	if (sent === claimed)
		return true;
	try {
		// Obyte allows JSON objects to be stringified without sorting when sending
		// but they must match when claiming (data is part of hash)
		const obj_sent_data = JSON.parse(sent);
		const sorted_sent_data = string_utils.getJsonSourceString(obj_sent_data, false);
		return sorted_sent_data === claimed;
	} catch (e) {
		// Not JSON or parsing failed, use simple string comparison
		return sent === claimed;
	}
}

/**
 * Fetch and save a transfer event from the blockchain by txid
 * This function fetches the transaction receipt, parses the event, and saves it to the database
 * @param {string} txid - The transaction ID to fetch
 * @param {Object} bridge - The bridge object with network info
 * @param {string} type - 'expatriation' or 'repatriation'
 * @returns {Promise<Object|null>} The saved transfer object, or null if not found/failed
 */
async function fetchAndSaveTransferFromBlockchain(txid, bridge, type) {
	try {
		// Determine the network where the transfer originated
		const network = type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
		
		// Skip for Obyte (not an EVM chain)
		if (network === 'Obyte') {
			console.log(`⚠️  Cannot fetch transfer from blockchain for Obyte (not an EVM chain)`);
			return null;
		}
		
		// Get provider for the network
		const provider = getProvider(network, true);
		if (!provider) {
			console.log(`⚠️  Provider not available for ${network}`);
			return null;
		}
		
		console.log(`🔍 Fetching transaction ${txid} from ${network}...`);
		
		// Fetch transaction receipt
		let receipt;
		try {
			receipt = await provider.getTransactionReceipt(txid);
		} catch (e) {
			console.log(`❌ Transaction not found on ${network}: ${e.message}`);
			return null;
		}
		
		if (!receipt || receipt.status !== 1) {
			console.log(`❌ Transaction failed or not found (status: ${receipt?.status})`);
			return null;
		}
		
		// Get network APIs for timestamp and address normalization (same as normal flow)
		const transfers = getTransfersModule();
		const networkApi = transfers.networkApi;
		
		// Get block timestamp (same as normal flow - use network API method if available for retry logic)
		let txts;
		if (networkApi[network] && networkApi[network].getBlockTimestampByNumber) {
			// Use network API method which has retry logic (same as normal flow)
			try {
				txts = await networkApi[network].getBlockTimestampByNumber(receipt.blockNumber);
			} catch (e) {
				console.log(`⚠️  Failed to get block timestamp using network API, falling back to direct provider call: ${e.message}`);
				// Fallback to direct provider call
				const block = await provider.getBlock(receipt.blockNumber);
				if (!block) {
					console.log(`❌ Block ${receipt.blockNumber} not found`);
					return null;
				}
				txts = block.timestamp;
			}
		} else {
			// Fallback to direct provider call if network API not available
			const block = await provider.getBlock(receipt.blockNumber);
			if (!block) {
				console.log(`❌ Block ${receipt.blockNumber} not found`);
				return null;
			}
			txts = block.timestamp;
		}
		
		// Determine contract address and event type
		const bridge_aa = normalizeAddress(
			type === 'expatriation' ? bridge.export_aa : bridge.import_aa,
			null
		);
		const contractJson = type === 'expatriation' ? exportJson : importJson;
		const eventName = type === 'expatriation' ? 'NewExpatriation' : 'NewRepatriation';
		const contract = new ethers.Contract(bridge_aa, contractJson.abi, provider);
		
		// Parse event from logs
		let parsedEvent = null;
		for (const log of receipt.logs) {
			try {
				const parsed = contract.interface.parseLog(log);
				if (parsed && parsed.name === eventName) {
					parsedEvent = parsed;
					break;
				}
			} catch (e) {
				// Not this event, continue
			}
		}
		
		if (!parsedEvent) {
			console.log(`❌ ${eventName} event not found in transaction logs`);
			return null;
		}
		
		// Extract event parameters
		const rawSenderAddress = parsedEvent.args.sender_address || parsedEvent.args.sender;
		const rawDestAddress = parsedEvent.args.foreign_address || parsedEvent.args.home_address || parsedEvent.args.dest_address;
		// Keep amount and reward as BigNumber objects (same as normal flow - converted to string in addTransfer)
		const amount = parsedEvent.args.amount;
		const reward = parsedEvent.args.reward;
		const data = parsedEvent.args.data || '0x';
		
		// Normalize addresses like in the normal flow
		// networkApi was already fetched above for txts
		
		// Determine source and destination networks for proper address normalization
		const src_network = type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
		const dst_network = type === 'expatriation' ? bridge.foreign_network : bridge.home_network;
		
		// Normalize sender_address with source network API (like in onNewExpatriation/onNewRepatriation)
		// sender_address comes from the source network
		let sender_address = rawSenderAddress;
		if (networkApi[src_network]) {
			sender_address = normalizeAddress(rawSenderAddress, networkApi[src_network]);
		} else {
			// Fallback to basic normalization if network API not available
			sender_address = normalizeAddress(rawSenderAddress, null);
		}
		
		// Normalize dest_address with destination network API
		// dest_address can be from any chain (EVM or Obyte), so normalize appropriately
		let dest_address = rawDestAddress;
		if (networkApi[dst_network]) {
			dest_address = normalizeAddress(rawDestAddress, networkApi[dst_network]);
		} else {
			// Fallback to basic normalization if network API not available
			dest_address = normalizeAddress(rawDestAddress, null);
		}
		
		console.log(`✅ Found ${eventName} event: sender=${sender_address}, amount=${amount.toString()}, reward=${reward.toString()}, dest=${dest_address}`);
		
		// Create transfer object (same as normal flow - amount and reward are BigNumber objects, converted to string in addTransfer)
		const transfer = {
			bridge_id: bridge.bridge_id,
			type,
			amount,  // Keep as BigNumber (will be converted to string in addTransfer)
			reward,  // Keep as BigNumber (will be converted to string in addTransfer)
			sender_address,
			dest_address,
			data,
			txid,
			txts
		};
		
		// Save transfer to database using addTransfer
		// addTransfer will normalize addresses again with the correct network APIs (same as normal flow)
		await transfers.addTransfer(transfer, true); // true = bRewritable for EVM chains
		
		// Fetch the saved transfer from database to return it
		const [savedTransfer] = await db.query(`
			SELECT * FROM transfers
			WHERE txid = ? AND bridge_id = ? AND type = ?
			ORDER BY transfer_id DESC
			LIMIT 1
		`, [txid, bridge.bridge_id, type]);
		
		if (savedTransfer) {
			console.log(`✅ Successfully saved transfer ${savedTransfer.transfer_id} from blockchain`);
			return savedTransfer;
		} else {
			console.log(`⚠️  Transfer was not saved to database`);
			return null;
		}
		
	} catch (e) {
		console.error(`❌ Error fetching and saving transfer from blockchain: ${e.message}`);
		console.error(`   Stack: ${e.stack}`);
		return null;
	}
}

/**
 * Find a matching transfer for a claim by searching the database and optionally verifying on blockchain
 * This function can be used to find transfers that may have been missed during normal processing
 * @param {Object} claim - The claim object with bridge_id, type, txid, amount, reward, data, etc.
 * @param {Object} bridge - The bridge object with network info
 * @param {boolean} verifyOnChain - Whether to verify the transaction on the blockchain (for EVM chains)
 * @returns {Promise<Object|null>} The matching transfer object, or null if not found
 */
async function findTransferForClaim(claim, bridge, verifyOnChain = false) {
	try {
		// Search for transfers with matching txid, bridge_id, and type
		// Only include confirmed transfers (matching findTransfers behavior in transfers.js)
		const matchingTransfers = await db.query(`
			SELECT * FROM transfers
			WHERE txid = ? AND bridge_id = ? AND type = ? AND is_confirmed = 1
			ORDER BY transfer_id
		`, [claim.txid, claim.bridge_id, claim.type]);
		
		if (matchingTransfers.length === 0) {
			return null;
		}
		
		// Optionally verify on blockchain for EVM chains
		if (verifyOnChain) {
			const network = claim.type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
			
			if (network !== 'Obyte') {
				const provider = getProvider(network, true);
				if (provider) {
					try {
						const receipt = await provider.getTransactionReceipt(claim.txid);
						if (!receipt || receipt.status !== 1) {
							// Transaction failed or not found
							return null;
						}
						
						// Verify event exists
						const bridge_aa = normalizeAddress(
							claim.type === 'expatriation' ? bridge.export_aa : bridge.import_aa,
							null
						);
						const contractJson = claim.type === 'expatriation' ? exportJson : importJson;
						const eventName = claim.type === 'expatriation' ? 'NewExpatriation' : 'NewRepatriation';
						const contract = new ethers.Contract(bridge_aa, contractJson.abi, provider);
						
						let eventFound = false;
						for (const log of receipt.logs) {
							try {
								const parsed = contract.interface.parseLog(log);
								if (parsed && parsed.name === eventName) {
									eventFound = true;
									break;
								}
							} catch (e) {
								// Not this event, continue
							}
						}
						
						if (!eventFound) {
							return null;
						}
					} catch (e) {
						// Verification failed, but we can still try to match from database
						console.log(`⚠️  Blockchain verification failed for ${claim.txid}: ${e.message}`);
					}
				}
			}
		}
		
		// Find the best matching transfer using validation
		for (const transfer of matchingTransfers) {
			const validationResult = validateClaimAgainstTransfer(claim, transfer, bridge);
			if (validationResult.valid) {
				return transfer;
			}
		}
		
		return null;
	} catch (e) {
		console.error(`Error finding transfer for claim: ${e.message}`);
		return null;
	}
}

async function linkOrphanedClaims() {
	try {
		console.log('🔍 Finding orphaned claims (transfer_id IS NULL)...\n');
		
		// Find all claims with transfer_id = NULL
		const orphanedClaims = await db.query(`
			SELECT c.*, b.home_network, b.foreign_network, b.export_aa, b.import_aa,
			       b.home_asset_decimals, b.foreign_asset_decimals
			FROM claims c
			JOIN bridges b ON c.bridge_id = b.bridge_id
			WHERE c.transfer_id IS NULL
			ORDER BY c.bridge_id, c.type, c.claim_num
		`);
		
		console.log(`Found ${orphanedClaims.length} orphaned claims\n`);
		
		if (orphanedClaims.length === 0) {
			console.log('✅ No orphaned claims to link');
			return {
				total: 0,
				linked: 0,
				verified: 0,
				notFound: 0,
				alreadyLinked: 0,
				errors: 0
			};
		}
		
		let linkedCount = 0;
		let verifiedCount = 0;
		let notFoundCount = 0;
		let alreadyLinkedCount = 0;
		let errorCount = 0;
		
		for (let i = 0; i < orphanedClaims.length; i++) {
			const claim = orphanedClaims[i];
			const progress = `[${i + 1}/${orphanedClaims.length}]`;
			
			console.log(`\n${progress} Processing claim ${claim.claim_num} (bridge ${claim.bridge_id}, ${claim.type})`);
			console.log(`   txid: ${claim.txid}`);
			
			try {
				// First, check if there's a matching transfer in the database
				console.log(`   🔍 Searching for matching transfer in database...`);
				
				// Search for transfers with matching txid, bridge_id, and type
				// Only include confirmed transfers (matching findTransfers behavior in transfers.js)
				const matchingTransfers = await db.query(`
					SELECT * FROM transfers
					WHERE txid = ? AND bridge_id = ? AND type = ? AND is_confirmed = 1
					ORDER BY transfer_id
				`, [claim.txid, claim.bridge_id, claim.type]);
				
				if (matchingTransfers.length === 0) {
					console.log(`   ⚠️  No matching transfer found in database for txid ${claim.txid}`);
					console.log(`   🔍 Attempting to fetch transfer from blockchain...`);
					
					// Try to fetch and save the transfer from blockchain (same as in transfers.js max retries)
					try {
						const bridge = await getBridge(claim.bridge_id);
						const fetchedTransfer = await fetchAndSaveTransferFromBlockchain(claim.txid, bridge, claim.type);
						
						if (fetchedTransfer) {
							console.log(`   ✅ Successfully fetched and saved transfer ${fetchedTransfer.transfer_id} from blockchain`);
							// Use the fetched transfer for linking
							matchingTransfers.push(fetchedTransfer);
						} else {
							console.log(`   ⚠️  Failed to fetch transfer from blockchain`);
							notFoundCount++;
							continue;
						}
					} catch (fetchError) {
						console.error(`   ❌ Error fetching transfer from blockchain: ${fetchError.message}`);
						notFoundCount++;
						continue;
					}
				}
				
				console.log(`   ✅ Found ${matchingTransfers.length} potential transfer(s) in database`);
				
				// Determine network and contract address for verification
				const network = claim.type === 'expatriation' ? claim.home_network : claim.foreign_network;
				// Normalize bridge address for consistent contract creation (handles checksummed addresses from DB)
				const bridge_aa = normalizeAddress(
					claim.type === 'expatriation' ? claim.export_aa : claim.import_aa,
					null
				);
				
				// Skip blockchain verification for Obyte (not an EVM chain)
				let eventFound = true; // Assume valid for Obyte
				let eventData = null;
				let blockTimestamp = null;
				
				if (network !== 'Obyte') {
					// Get provider for EVM chains
					const provider = getProvider(network, true);
					if (!provider) {
						console.log(`   ⚠️  Provider not available for ${network}, skipping verification`);
						errorCount++;
						continue;
					}
					
					// Verify transaction exists on blockchain
					console.log(`   🔍 Verifying transaction on ${network}...`);
					let receipt;
					try {
						receipt = await provider.getTransactionReceipt(claim.txid);
					} catch (e) {
						console.log(`   ❌ Transaction not found on ${network}: ${e.message}`);
						notFoundCount++;
						continue;
					}
					
					if (!receipt || receipt.status !== 1) {
						console.log(`   ❌ Transaction failed or not found`);
						notFoundCount++;
						continue;
					}
					
					// Get block timestamp
					const block = await provider.getBlock(receipt.blockNumber);
					blockTimestamp = block ? block.timestamp : null;
					
					// Verify event exists
					const contractJson = claim.type === 'expatriation' ? exportJson : importJson;
					const eventName = claim.type === 'expatriation' ? 'NewExpatriation' : 'NewRepatriation';
					const contract = new ethers.Contract(bridge_aa, contractJson.abi, provider);
					
					eventFound = false;
					
					for (const log of receipt.logs) {
						try {
							const parsed = contract.interface.parseLog(log);
							if (parsed && parsed.name === eventName) {
								eventFound = true;
								// Normalize addresses from event parsing (handles checksummed addresses from blockchain)
								const rawSenderAddress = parsed.args.sender_address || parsed.args.sender;
								const rawDestAddress = parsed.args.foreign_address || parsed.args.home_address || parsed.args.dest_address;
								eventData = {
									sender_address: normalizeAddress(rawSenderAddress, null),
									amount: parsed.args.amount,
									reward: parsed.args.reward,
									dest_address: normalizeAddress(rawDestAddress, null),
									data: parsed.args.data || '0x'
								};
								break;
							}
						} catch (e) {
							// Not this event, continue
						}
					}
					
					if (!eventFound) {
						console.log(`   ⚠️  ${eventName} event not found in transaction logs`);
						notFoundCount++;
						continue;
					}
					
					verifiedCount++;
					console.log(`   ✅ Transaction verified on ${network}, ${eventName} event found`);
				} else {
					console.log(`   ⚠️  Skipping blockchain verification for Obyte (not an EVM chain)`);
				}
				
				// Get bridge info for validation
				const bridge = await getBridge(claim.bridge_id);
				
				// Find the best matching transfer using the same validation as handleNewClaim
				let bestMatch = null;
				let validationResult = null;
				
				for (const transfer of matchingTransfers) {
					// Use the exact same validation logic as handleNewClaim in transfers.js
					validationResult = validateClaimAgainstTransfer(claim, transfer, bridge);
					
					if (validationResult.valid) {
						bestMatch = transfer;
						break;
					}
				}
				
				if (!bestMatch) {
					console.log(`   ⚠️  No valid transfer found (validation failed)`);
					if (validationResult) {
						console.log(`      Reason: ${validationResult.reason}`);
					}
					console.log(`      Event data: amount=${eventData.amount.toString()}, reward=${eventData.reward.toString()}`);
					console.log(`      Claim data: amount=${claim.amount}, reward=${claim.reward}`);
					notFoundCount++;
					continue;
				}
				
				// Check if this transfer is already linked to another claim
				const [existingClaim] = await db.query(`
					SELECT claim_num, bridge_id, type 
					FROM claims 
					WHERE transfer_id = ? AND NOT (claim_num = ? AND bridge_id = ? AND type = ?)
				`, [bestMatch.transfer_id, claim.claim_num, claim.bridge_id, claim.type]);
				
				if (existingClaim) {
					console.log(`   ⚠️  Transfer ${bestMatch.transfer_id} is already linked to claim ${existingClaim.claim_num} (bridge ${existingClaim.bridge_id}, ${existingClaim.type})`);
					console.log(`   ⚠️  Skipping to avoid duplicate link`);
					alreadyLinkedCount++;
					continue;
				}
				
				// Link the claim to the transfer
				console.log(`   🔗 Linking claim ${claim.claim_num} to transfer ${bestMatch.transfer_id}`);
				await db.query(`
					UPDATE claims 
					SET transfer_id = ? 
					WHERE claim_num = ? AND bridge_id = ? AND type = ?
				`, [bestMatch.transfer_id, claim.claim_num, claim.bridge_id, claim.type]);
				
				linkedCount++;
				console.log(`   ✅ Successfully linked claim ${claim.claim_num} to transfer ${bestMatch.transfer_id}`);
				
			} catch (e) {
				console.error(`   ❌ Error processing claim ${claim.claim_num}: ${e.message}`);
				console.error(`   Stack: ${e.stack}`);
				errorCount++;
			}
		}
		
		console.log(`\n\n📊 Summary:`);
		console.log(`   Total orphaned claims: ${orphanedClaims.length}`);
		console.log(`   ✅ Successfully linked: ${linkedCount}`);
		console.log(`   ✅ Verified on blockchain: ${verifiedCount}`);
		console.log(`   ⚠️  Transfer not found: ${notFoundCount}`);
		console.log(`   ⚠️  Transfer already linked to another claim: ${alreadyLinkedCount}`);
		console.log(`   ❌ Errors: ${errorCount}`);
		
		return {
			total: orphanedClaims.length,
			linked: linkedCount,
			verified: verifiedCount,
			notFound: notFoundCount,
			alreadyLinked: alreadyLinkedCount,
			errors: errorCount
		};
	} catch (e) {
		console.error('❌ Fatal error:', e);
		console.error('Stack:', e.stack);
		throw e;
	}
}

// Export the function for use in other modules
module.exports = {
	linkOrphanedClaims,
	findTransferForClaim,
	fetchAndSaveTransferFromBlockchain
};

// If run directly as a script, execute the function
if (require.main === module) {
	linkOrphanedClaims()
		.then(() => process.exit(0))
		.catch((e) => {
			console.error('❌ Fatal error:', e);
			process.exit(1);
		});
}

