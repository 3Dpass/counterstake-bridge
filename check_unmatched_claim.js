/*jslint node: true */
"use strict";

const db = require('ocore/db.js');
const { normalizeAddress } = require('./address_normalizer.js');

// Mock networkApi for normalization
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

async function checkUnmatchedClaim() {
	console.log('='.repeat(70));
	console.log('CHECKING UNMATCHED CLAIM');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get the unmatched claim
		const unmatched = await db.query(`
			SELECT claim_num, bridge_id, type, txid, txts, sender_address, dest_address, transfer_id
			FROM claims
			WHERE transfer_id IS NULL
			ORDER BY claim_num
		`);

		if (unmatched.length === 0) {
			console.log('No unmatched claims found.');
			process.exit(0);
		}

		console.log(`Found ${unmatched.length} unmatched claim(s):\n`);

		// Get all bridges
		const bridges = await db.query("SELECT * FROM bridges ORDER BY bridge_id");
		const bridgeMap = {};
		for (const bridge of bridges) {
			bridgeMap[bridge.bridge_id] = bridge;
		}

		for (const claim of unmatched) {
			console.log(`Claim ${claim.claim_num}:`);
			console.log(`  Bridge ID: ${claim.bridge_id}`);
			console.log(`  Type: ${claim.type}`);
			console.log(`  txid: ${claim.txid}`);
			console.log(`  txts: ${claim.txts}`);
			console.log(`  sender_address: ${claim.sender_address}`);
			console.log(`  dest_address: ${claim.dest_address}`);
			console.log('');

			const bridge = bridgeMap[claim.bridge_id];
			if (!bridge) {
				console.log(`  ⚠️  Bridge ${claim.bridge_id} not found`);
				continue;
			}

			// Simulate handleNewClaim normalization logic
			const src_network = claim.type === 'expatriation' ? bridge.home_network : bridge.foreign_network;
			const dst_network = claim.type === 'expatriation' ? bridge.foreign_network : bridge.home_network;

			const normalized_sender = normalizeAddress(claim.sender_address, mockNetworkApi[src_network]);
			const normalized_dest = normalizeAddress(claim.dest_address, mockNetworkApi[dst_network]);

			console.log(`  Normalized addresses:`);
			console.log(`    sender: ${normalized_sender} (network: ${src_network})`);
			console.log(`    dest: ${normalized_dest} (network: ${dst_network})`);
			console.log('');

			// Check for transfers with same txid
			const transfersWithTxid = await db.query(`
				SELECT transfer_id, bridge_id, type, txid, txts, sender_address, dest_address, is_confirmed
				FROM transfers
				WHERE txid=?
			`, [claim.txid]);

			console.log(`  Transfers with same txid: ${transfersWithTxid.length}`);
			for (const t of transfersWithTxid) {
				console.log(`    Transfer ${t.transfer_id}: bridge=${t.bridge_id}, type=${t.type}, txts=${t.txts}, confirmed=${t.is_confirmed}`);
				console.log(`      sender: ${t.sender_address}`);
				console.log(`      dest: ${t.dest_address}`);
			}
			console.log('');

			// Try to find matching transfer
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
				console.log(`  ✅ Found ${matchingTransfers.length} matching transfer(s):`);
				for (const t of matchingTransfers) {
					console.log(`    Transfer ${t.transfer_id}`);
				}
			} else {
				console.log(`  ❌ No matching transfer found`);
				console.log(`  Looking for: bridge_id=${claim.bridge_id}, type=${claim.type}, txts=${claim.txts}`);
			}
			console.log('');
		}

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkUnmatchedClaim();

