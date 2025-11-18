/*jslint node: true */
"use strict";

const db = require('ocore/db.js');

async function checkClaimsForChallenges() {
	console.log('='.repeat(70));
	console.log('CHECKING CLAIMS FOR CHALLENGES');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get all claims
		const allClaims = await db.query(`
			SELECT claim_num, bridge_id, type, transfer_id, txid
			FROM claims
			ORDER BY claim_num
		`);

		console.log(`Total claims in database: ${allClaims.length}\n`);

		// Check for claims 1 and 13 (from logs)
		const claim1 = allClaims.filter(c => c.claim_num === 1);
		const claim13 = allClaims.filter(c => c.claim_num === 13);

		console.log('Claims 1 and 13 (from challenge logs):');
		if (claim1.length > 0) {
			console.log(`  Claim 1: bridge_id=${claim1[0].bridge_id}, type=${claim1[0].type}, transfer_id=${claim1[0].transfer_id || 'NULL'}`);
		} else {
			console.log('  Claim 1: NOT FOUND in database');
		}

		if (claim13.length > 0) {
			console.log(`  Claim 13: bridge_id=${claim13[0].bridge_id}, type=${claim13[0].type}, transfer_id=${claim13[0].transfer_id || 'NULL'}`);
		} else {
			console.log('  Claim 13: NOT FOUND in database');
		}
		console.log('');

		// Get all bridges to understand the network mapping
		const bridges = await db.query("SELECT bridge_id, home_network, foreign_network FROM bridges ORDER BY bridge_id");
		console.log('Bridge network mappings:');
		for (const bridge of bridges) {
			console.log(`  Bridge ${bridge.bridge_id}: home=${bridge.home_network}, foreign=${bridge.foreign_network}`);
		}
		console.log('');

		// Show all claims with their details
		console.log('All claims in database:');
		for (const claim of allClaims) {
			const bridge = bridges.find(b => b.bridge_id === claim.bridge_id);
			const network = claim.type === 'expatriation' ? bridge?.foreign_network : bridge?.home_network;
			console.log(`  Claim ${claim.claim_num}: bridge=${claim.bridge_id}, type=${claim.type}, network=${network || 'unknown'}, transfer_id=${claim.transfer_id || 'NULL'}`);
		}
		console.log('');

		// Check if challenges are looking for the right bridge_id/type
		console.log('Challenge lookup analysis:');
		console.log('  Challenges from BSC would be looking for:');
		console.log('    - type="repatriation" (BSC is foreign network)');
		console.log('    - OR type="expatriation" if BSC is home network');
		console.log('  Need to check which bridge the challenge is for...');
		console.log('');

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkClaimsForChallenges();

