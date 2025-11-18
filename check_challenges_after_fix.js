/*jslint node: true */
"use strict";

const db = require('ocore/db.js');

async function checkChallengesAfterFix() {
	console.log('='.repeat(70));
	console.log('CHECKING CHALLENGES AFTER FIX');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get counts
		const bridges = await db.query("SELECT COUNT(*) as count FROM bridges");
		const transfers = await db.query("SELECT COUNT(*) as count FROM transfers");
		const claims = await db.query("SELECT COUNT(*) as count FROM claims");
		const challenges = await db.query("SELECT COUNT(*) as count FROM challenges");
		const matchedClaims = await db.query("SELECT COUNT(*) as count FROM claims WHERE transfer_id IS NOT NULL");

		console.log('DATABASE STATE:');
		console.log(`  Bridges: ${bridges[0].count}`);
		console.log(`  Transfers: ${transfers[0].count}`);
		console.log(`  Claims: ${claims[0].count} (${matchedClaims[0].count} matched)`);
		console.log(`  Challenges: ${challenges[0].count}`);
		console.log('');

		if (challenges[0].count > 0) {
			console.log('✅ CHALLENGES ARE BEING STORED!');
			console.log('');
			
			// Get recent challenges
			const recentChallenges = await db.query(`
				SELECT challenge_id, claim_num, bridge_id, type, address, stake_on, stake, challenge_txid, creation_date
				FROM challenges
				ORDER BY challenge_id DESC
				LIMIT 10
			`);
			
			console.log(`Recent challenges (last ${recentChallenges.length}):`);
			for (const ch of recentChallenges) {
				// Verify the challenge has a matching claim
				const claim = await db.query(`
					SELECT claim_num, bridge_id, type, transfer_id
					FROM claims
					WHERE claim_num=? AND bridge_id=? AND type=?
				`, [ch.claim_num, ch.bridge_id, ch.type]);
				
				const status = claim.length > 0 ? '✅' : '❌';
				const transferInfo = claim.length > 0 && claim[0].transfer_id ? `(transfer_id=${claim[0].transfer_id})` : '(no transfer)';
				console.log(`  ${status} Challenge ${ch.challenge_id}: claim=${ch.claim_num}, bridge=${ch.bridge_id}, type=${ch.type} ${transferInfo}`);
			}
		} else {
			console.log('❌ NO CHALLENGES STORED YET');
			console.log('');
			
			// Check if there are claims that could have challenges
			const claimsWithTransfers = await db.query(`
				SELECT claim_num, bridge_id, type, transfer_id
				FROM claims
				WHERE transfer_id IS NOT NULL
				ORDER BY claim_num DESC
				LIMIT 10
			`);
			
			console.log(`Claims with transfers (could have challenges): ${claimsWithTransfers.length}`);
			for (const c of claimsWithTransfers) {
				console.log(`  Claim ${c.claim_num}: bridge=${c.bridge_id}, type=${c.type}, transfer_id=${c.transfer_id}`);
			}
		}

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkChallengesAfterFix();

