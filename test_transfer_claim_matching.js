/*jslint node: true */
"use strict";

/**
 * Test script to verify transfer-claim and challenge-claim matching
 * Uses the same logic as handleNewClaim and handleChallenge
 * Does NOT modify the database, only displays results
 */

const db = require('ocore/db.js');
const { normalizeAddress } = require('./address_normalizer.js');

// Mock networkApi for normalization (we only need the normalization, not actual network APIs)
const mockNetworkApi = {
	Obyte: {
		isValidAddress: (addr) => typeof addr === 'string' && addr.length > 0
	},
	BSC: {
		isValidAddress: (addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
	},
	Ethereum: {
		isValidAddress: (addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
	},
	Polygon: {
		isValidAddress: (addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
	},
	Kava: {
		isValidAddress: (addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
	},
	'3DPass': {
		isValidAddress: (addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42
	}
};

async function testAllClaimsAgainstTransfers() {
	console.log('='.repeat(70));
	console.log('TESTING ALL CLAIMS AGAINST TRANSFERS');
	console.log('='.repeat(70));
	console.log('');

	// Get all bridges
	const bridges = await db.query("SELECT * FROM bridges ORDER BY bridge_id");
	const bridgeMap = {};
	for (const bridge of bridges) {
		bridgeMap[bridge.bridge_id] = bridge;
	}
	console.log(`Found ${bridges.length} bridges\n`);

	// Get ALL claims (no limit)
	const allClaims = await db.query(`
		SELECT claim_num, bridge_id, type, txid, txts, sender_address, dest_address, transfer_id
		FROM claims
		ORDER BY bridge_id, claim_num
	`);

	console.log(`Testing ${allClaims.length} total claims:\n`);

	let matchedCount = 0;
	let unmatchedCount = 0;
	let alreadyLinkedCount = 0;
	let alreadyLinkedButWrongCount = 0;
	const unmatchedDetails = [];

	for (const claim of allClaims) {
		const bridge = bridgeMap[claim.bridge_id];
		if (!bridge) {
			console.log(`⚠️  Claim ${claim.claim_num}: Bridge ${claim.bridge_id} not found`);
			unmatchedCount++;
			continue;
		}

		// If already linked, verify the link is correct
		if (claim.transfer_id) {
			alreadyLinkedCount++;
			// Verify the link is correct
			const transfer = await db.query(`
				SELECT transfer_id, bridge_id, type, txid, txts, sender_address, dest_address
				FROM transfers
				WHERE transfer_id=?
			`, [claim.transfer_id]);

			if (transfer.length > 0 && transfer[0].txid === claim.txid) {
				// Link is correct
			} else {
				alreadyLinkedButWrongCount++;
				unmatchedDetails.push({
					claim_num: claim.claim_num,
					bridge_id: claim.bridge_id,
					type: claim.type,
					reason: `Has transfer_id=${claim.transfer_id} but transfer doesn't match`
				});
			}
			continue;
		}

		// Simulate handleNewClaim normalization logic (AFTER FIX)
		const src_network = claim.type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
		const dst_network = claim.type === 'expatriation' ? bridge.foreign_network : bridge.home_network;

		const normalized_sender = normalizeAddress(claim.sender_address, mockNetworkApi[src_network]);
		const normalized_dest = normalizeAddress(claim.dest_address, mockNetworkApi[dst_network]);

		// Simulate the query from findTransfers
		const matchingTransfers = await db.query(`
			SELECT transfer_id, bridge_id, type, txid, txts, sender_address, dest_address, is_confirmed
			FROM transfers
			WHERE bridge_id=? AND txid=? AND txts=? AND sender_address=? AND dest_address=? AND type=? AND is_confirmed=1
		`, [
			claim.bridge_id,
			claim.txid,
			claim.txts,
			normalized_sender,
			normalized_dest,
			claim.type
		]);

		if (matchingTransfers.length > 0) {
			matchedCount++;
		} else {
			unmatchedCount++;
			// Check if transfer exists with same txid but different criteria
			const transfersWithTxid = await db.query(`
				SELECT transfer_id, bridge_id, type, txts, sender_address, dest_address, is_confirmed
				FROM transfers
				WHERE txid=?
			`, [claim.txid]);

			unmatchedDetails.push({
				claim_num: claim.claim_num,
				bridge_id: claim.bridge_id,
				type: claim.type,
				txid: claim.txid,
				reason: transfersWithTxid.length > 0 
					? `Found ${transfersWithTxid.length} transfer(s) with same txid but different criteria`
					: 'No transfer found with this txid'
			});
		}
	}

	console.log('='.repeat(70));
	console.log(`SUMMARY:`);
	console.log(`  Total claims: ${allClaims.length}`);
	console.log(`  Already linked (correct): ${alreadyLinkedCount}`);
	console.log(`  Already linked (wrong): ${alreadyLinkedButWrongCount}`);
	console.log(`  Would match (unmatched): ${matchedCount}`);
	console.log(`  Unmatched: ${unmatchedCount}`);
	console.log('='.repeat(70));
	
	if (unmatchedDetails.length > 0 && unmatchedDetails.length <= 20) {
		console.log('\nUnmatched details:');
		for (const detail of unmatchedDetails) {
			console.log(`  ❌ Claim ${detail.claim_num} (bridge ${detail.bridge_id}, ${detail.type}): ${detail.reason}`);
			if (detail.txid) {
				console.log(`     txid: ${detail.txid.substring(0, 20)}...`);
			}
		}
	} else if (unmatchedDetails.length > 20) {
		console.log(`\nShowing first 20 of ${unmatchedDetails.length} unmatched details:`);
		for (let i = 0; i < 20; i++) {
			const detail = unmatchedDetails[i];
			console.log(`  ❌ Claim ${detail.claim_num} (bridge ${detail.bridge_id}, ${detail.type}): ${detail.reason}`);
			if (detail.txid) {
				console.log(`     txid: ${detail.txid.substring(0, 20)}...`);
			}
		}
		console.log(`  ... and ${unmatchedDetails.length - 20} more`);
	}
	console.log('');
}

async function testChallengeClaimMatching() {
	console.log('='.repeat(70));
	console.log('TESTING CHALLENGE-CLAIM MATCHING');
	console.log('='.repeat(70));
	console.log('');

	// Get all challenges
	const challenges = await db.query(`
		SELECT challenge_id, claim_num, bridge_id, type, address, stake_on, stake, challenge_txid
		FROM challenges
		ORDER BY bridge_id, claim_num
		LIMIT 20
	`);

	if (challenges.length === 0) {
		console.log('No challenges found in database');
		console.log('This confirms that challenges are not being stored.\n');
		
		// Check if there are NewChallenge events in logs that should have been stored
		console.log('Checking if there are claims that should have challenges...');
		const claimsWithChallenges = await db.query(`
			SELECT claim_num, bridge_id, type, transfer_id
			FROM claims
			WHERE transfer_id IS NOT NULL
			ORDER BY bridge_id, claim_num
			LIMIT 10
		`);
		
		console.log(`Found ${claimsWithChallenges.length} claims with transfers (these could have challenges)`);
		console.log('If challenges were processed, they should be stored for these claims.\n');
		return;
	}

	console.log(`Testing ${challenges.length} challenges:\n`);

	let foundCount = 0;
	let notFoundCount = 0;
	let noTransferIdCount = 0;

	for (const challenge of challenges) {
		// Simulate getValidOutcome logic (same as handleChallenge)
		const claim = await db.query(`
			SELECT claim_num, bridge_id, type, transfer_id
			FROM claims
			WHERE claim_num=? AND bridge_id=? AND type=?
		`, [challenge.claim_num, challenge.bridge_id, challenge.type]);

		if (claim.length === 0) {
			notFoundCount++;
			console.log(`❌ Challenge ${challenge.challenge_id} (claim ${challenge.claim_num}):`);
			console.log(`   Claim not found in database`);
			console.log(`   This would cause: "claim ${challenge.claim_num} challenged in ${challenge.challenge_txid} is not known yet, will retry"`);
		} else {
			foundCount++;
			const valid_outcome = claim[0].transfer_id ? 'yes' : 'no';
			if (!claim[0].transfer_id) {
				noTransferIdCount++;
				console.log(`⚠️  Challenge ${challenge.challenge_id} (claim ${challenge.claim_num}):`);
				console.log(`   Claim found but has no transfer_id (valid_outcome='no')`);
			} else {
				console.log(`✅ Challenge ${challenge.challenge_id} (claim ${challenge.claim_num}):`);
				console.log(`   Claim found with transfer_id=${claim[0].transfer_id} (valid_outcome='yes')`);
			}
		}
		console.log('');
	}

	console.log('='.repeat(70));
	console.log(`SUMMARY: ${foundCount} found, ${notFoundCount} not found, ${noTransferIdCount} without transfer_id`);
	console.log('='.repeat(70));
	console.log('');
}

async function testAllTransfersAgainstClaims() {
	console.log('='.repeat(70));
	console.log('TESTING ALL TRANSFERS AGAINST CLAIMS');
	console.log('='.repeat(70));
	console.log('');

	// Get all bridges
	const bridges = await db.query("SELECT * FROM bridges ORDER BY bridge_id");
	const bridgeMap = {};
	for (const bridge of bridges) {
		bridgeMap[bridge.bridge_id] = bridge;
	}
	console.log(`Found ${bridges.length} bridges\n`);

	// Get ALL transfers (no limit)
	const allTransfers = await db.query(`
		SELECT transfer_id, bridge_id, type, txid, txts, sender_address, dest_address, is_confirmed
		FROM transfers
		WHERE is_confirmed=1
		ORDER BY bridge_id, transfer_id
	`);

	console.log(`Testing ${allTransfers.length} confirmed transfers:\n`);

	let matchedCount = 0;
	let unmatchedCount = 0;
	const unmatchedDetails = [];

	for (const transfer of allTransfers) {
		const bridge = bridgeMap[transfer.bridge_id];
		if (!bridge) {
			console.log(`⚠️  Transfer ${transfer.transfer_id}: Bridge ${transfer.bridge_id} not found`);
			unmatchedCount++;
			continue;
		}

		// Simulate the reverse lookup: find claims that match this transfer
		// This uses the same normalization logic as handleNewClaim
		const src_network = transfer.type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
		const dst_network = transfer.type === 'expatriation' ? bridge.foreign_network : bridge.home_network;

		const normalized_sender = normalizeAddress(transfer.sender_address, mockNetworkApi[src_network]);
		const normalized_dest = normalizeAddress(transfer.dest_address, mockNetworkApi[dst_network]);

		// Find claims that would match this transfer
		const matchingClaims = await db.query(`
			SELECT claim_num, bridge_id, type, txid, txts, sender_address, dest_address, transfer_id
			FROM claims
			WHERE bridge_id=? AND txid=? AND txts=? AND sender_address=? AND dest_address=? AND type=?
		`, [
			transfer.bridge_id,
			transfer.txid,
			transfer.txts,
			normalized_sender,
			normalized_dest,
			transfer.type
		]);

		if (matchingClaims.length > 0) {
			matchedCount++;
			// Check if any of the matching claims are already linked to this transfer
			const linked = matchingClaims.filter(c => c.transfer_id === transfer.transfer_id);
			if (linked.length === 0 && matchingClaims.length > 0) {
				// Transfer exists but claim is not linked to it
				unmatchedDetails.push({
					transfer_id: transfer.transfer_id,
					bridge_id: transfer.bridge_id,
					type: transfer.type,
					reason: `Found ${matchingClaims.length} claim(s) but none linked to this transfer`
				});
			}
		} else {
			unmatchedCount++;
			// Check if any claims exist with same txid
			const claimsWithTxid = await db.query(`
				SELECT claim_num, bridge_id, type, txts, sender_address, dest_address
				FROM claims
				WHERE txid=?
			`, [transfer.txid]);

			unmatchedDetails.push({
				transfer_id: transfer.transfer_id,
				bridge_id: transfer.bridge_id,
				type: transfer.type,
				txid: transfer.txid,
				reason: claimsWithTxid.length > 0 
					? `Found ${claimsWithTxid.length} claim(s) with same txid but different criteria`
					: 'No claim found with this txid'
			});
		}
	}

	console.log('='.repeat(70));
	console.log(`SUMMARY:`);
	console.log(`  Total transfers: ${allTransfers.length}`);
	console.log(`  Have matching claims: ${matchedCount}`);
	console.log(`  No matching claims: ${unmatchedCount}`);
	console.log('='.repeat(70));
	
	if (unmatchedDetails.length > 0 && unmatchedDetails.length <= 20) {
		console.log('\nTransfers without matching claims:');
		for (const detail of unmatchedDetails) {
			console.log(`  ❌ Transfer ${detail.transfer_id} (bridge ${detail.bridge_id}, ${detail.type}): ${detail.reason}`);
			if (detail.txid) {
				console.log(`     txid: ${detail.txid.substring(0, 20)}...`);
			}
		}
	} else if (unmatchedDetails.length > 20) {
		console.log(`\nShowing first 20 of ${unmatchedDetails.length} transfers without matching claims:`);
		for (let i = 0; i < 20; i++) {
			const detail = unmatchedDetails[i];
			console.log(`  ❌ Transfer ${detail.transfer_id} (bridge ${detail.bridge_id}, ${detail.type}): ${detail.reason}`);
			if (detail.txid) {
				console.log(`     txid: ${detail.txid.substring(0, 20)}...`);
			}
		}
		console.log(`  ... and ${unmatchedDetails.length - 20} more`);
	}
	console.log('');
}

async function main() {
	try {
		await testAllClaimsAgainstTransfers();
		await testAllTransfersAgainstClaims();
		await testChallengeClaimMatching();
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

main();

