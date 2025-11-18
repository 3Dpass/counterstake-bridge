/*jslint node: true */
"use strict";

const db = require('ocore/db.js');

async function checkDatabaseState() {
	console.log('='.repeat(70));
	console.log('DATABASE STATE CHECK');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get counts
		const bridges = await db.query("SELECT COUNT(*) as count FROM bridges");
		const transfers = await db.query("SELECT COUNT(*) as count FROM transfers");
		const claims = await db.query("SELECT COUNT(*) as count FROM claims");
		const challenges = await db.query("SELECT COUNT(*) as count FROM challenges");
		const unmatchedClaims = await db.query("SELECT COUNT(*) as count FROM claims WHERE transfer_id IS NULL");
		const matchedClaims = await db.query("SELECT COUNT(*) as count FROM claims WHERE transfer_id IS NOT NULL");
		const confirmedTransfers = await db.query("SELECT COUNT(*) as count FROM transfers WHERE is_confirmed=1");
		const unconfirmedTransfers = await db.query("SELECT COUNT(*) as count FROM transfers WHERE is_confirmed=0");

		console.log('COUNTS:');
		console.log(`  Bridges: ${bridges[0].count}`);
		console.log(`  Transfers: ${transfers[0].count} (${confirmedTransfers[0].count} confirmed, ${unconfirmedTransfers[0].count} unconfirmed)`);
		console.log(`  Claims: ${claims[0].count} (${matchedClaims[0].count} matched, ${unmatchedClaims[0].count} unmatched)`);
		console.log(`  Challenges: ${challenges[0].count}`);
		console.log('');

		// Get recent transfers
		console.log('RECENT TRANSFERS (last 10):');
		const recentTransfers = await db.query(`
			SELECT transfer_id, bridge_id, type, txid, txts, is_confirmed, creation_date
			FROM transfers
			ORDER BY transfer_id DESC
			LIMIT 10
		`);
		for (const t of recentTransfers) {
			console.log(`  Transfer ${t.transfer_id}: bridge=${t.bridge_id}, type=${t.type}, confirmed=${t.is_confirmed}, txid=${t.txid.substring(0, 20)}...`);
		}
		console.log('');

		// Get recent claims
		console.log('RECENT CLAIMS (last 10):');
		const recentClaims = await db.query(`
			SELECT claim_num, bridge_id, type, txid, txts, transfer_id, creation_date
			FROM claims
			ORDER BY claim_num DESC
			LIMIT 10
		`);
		for (const c of recentClaims) {
			console.log(`  Claim ${c.claim_num}: bridge=${c.bridge_id}, type=${c.type}, transfer_id=${c.transfer_id || 'NULL'}, txid=${c.txid.substring(0, 20)}...`);
		}
		console.log('');

		// Get recent challenges
		if (challenges[0].count > 0) {
			console.log('RECENT CHALLENGES (last 10):');
			const recentChallenges = await db.query(`
				SELECT challenge_id, claim_num, bridge_id, type, challenge_txid, creation_date
				FROM challenges
				ORDER BY challenge_id DESC
				LIMIT 10
			`);
			for (const ch of recentChallenges) {
				console.log(`  Challenge ${ch.challenge_id}: claim=${ch.claim_num}, bridge=${ch.bridge_id}, type=${ch.type}, txid=${ch.challenge_txid.substring(0, 20)}...`);
			}
			console.log('');
		}

		// Get unmatched claims details
		if (unmatchedClaims[0].count > 0) {
			console.log(`UNMATCHED CLAIMS (showing first 10 of ${unmatchedClaims[0].count}):`);
			const unmatched = await db.query(`
				SELECT claim_num, bridge_id, type, txid, txts, creation_date
				FROM claims
				WHERE transfer_id IS NULL
				ORDER BY claim_num DESC
				LIMIT 10
			`);
			for (const c of unmatched) {
				console.log(`  Claim ${c.claim_num}: bridge=${c.bridge_id}, type=${c.type}, txid=${c.txid.substring(0, 20)}...`);
			}
			console.log('');
		}

		// Check for transfers without claims
		const transfersWithoutClaims = await db.query(`
			SELECT COUNT(*) as count
			FROM transfers t
			LEFT JOIN claims c ON t.transfer_id = c.transfer_id
			WHERE t.is_confirmed=1 AND c.claim_num IS NULL
		`);
		console.log(`Transfers without claims: ${transfersWithoutClaims[0].count}`);
		console.log('');

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkDatabaseState();

