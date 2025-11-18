/*jslint node: true */
"use strict";

const db = require('ocore/db.js');

async function getValidOutcome({ claim_num, bridge_id, type }, bThrowIfNotFound) {
	const [db_claim] = await db.query("SELECT * FROM claims WHERE claim_num=? AND bridge_id=? AND type=?", [claim_num, bridge_id, type]);
	if (!db_claim) {
		if (bThrowIfNotFound)
			throw Error(`claim ${claim_num} not found in db`);
		return null;
	}
	return db_claim.transfer_id ? 'yes' : 'no';
}

async function testGetValidOutcome() {
	console.log('='.repeat(70));
	console.log('TESTING getValidOutcome FUNCTION');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get all claims from database
		const allClaims = await db.query(`
			SELECT claim_num, bridge_id, type, transfer_id
			FROM claims
			ORDER BY claim_num, bridge_id, type
		`);

		console.log(`Total claims in database: ${allClaims.length}\n`);

		// Test getValidOutcome for each claim
		console.log('Testing getValidOutcome for each claim:');
		for (const claim of allClaims) {
			const result = await getValidOutcome({ claim_num: claim.claim_num, bridge_id: claim.bridge_id, type: claim.type }, false);
			const status = result === null ? '❌ NULL (not found!)' : result === 'yes' ? '✅ yes (valid)' : '⚠️  no (invalid)';
			console.log(`  Claim ${claim.claim_num} (bridge=${claim.bridge_id}, type=${claim.type}): ${status} (transfer_id=${claim.transfer_id || 'NULL'})`);
		}
		console.log('');

		// Test the specific claims from challenge logs (claim 1 and 13)
		console.log('Testing claims from challenge logs:');
		
		// Claim 1 - check all possible bridge/type combinations
		console.log('\nClaim 1:');
		const claim1Bridges = allClaims.filter(c => c.claim_num === 1);
		for (const c of claim1Bridges) {
			const result = await getValidOutcome({ claim_num: 1, bridge_id: c.bridge_id, type: c.type }, false);
			console.log(`  bridge_id=${c.bridge_id}, type=${c.type}: ${result === null ? 'NULL' : result}`);
		}
		
		// Test with wrong bridge_id
		console.log('  Testing with wrong bridge_id (should return null):');
		const wrongBridgeResult = await getValidOutcome({ claim_num: 1, bridge_id: 999, type: 'expatriation' }, false);
		console.log(`    bridge_id=999, type=expatriation: ${wrongBridgeResult === null ? 'NULL (as expected)' : wrongBridgeResult}`);
		
		// Test with wrong type
		console.log('  Testing with wrong type (should return null):');
		if (claim1Bridges.length > 0) {
			const wrongType = claim1Bridges[0].type === 'expatriation' ? 'repatriation' : 'expatriation';
			const wrongTypeResult = await getValidOutcome({ claim_num: 1, bridge_id: claim1Bridges[0].bridge_id, type: wrongType }, false);
			console.log(`    bridge_id=${claim1Bridges[0].bridge_id}, type=${wrongType}: ${wrongTypeResult === null ? 'NULL (as expected)' : wrongTypeResult}`);
		}

		// Claim 13
		console.log('\nClaim 13:');
		const claim13Bridges = allClaims.filter(c => c.claim_num === 13);
		for (const c of claim13Bridges) {
			const result = await getValidOutcome({ claim_num: 13, bridge_id: c.bridge_id, type: c.type }, false);
			console.log(`  bridge_id=${c.bridge_id}, type=${c.type}: ${result === null ? 'NULL' : result}`);
		}

		// Now let's check what bridge/type the challenges are using
		console.log('\n' + '='.repeat(70));
		console.log('CHECKING WHAT BRIDGE/TYPE CHALLENGES ARE USING');
		console.log('='.repeat(70));
		console.log('');

		// Get bridges to understand network mapping
		const bridges = await db.query("SELECT bridge_id, home_network, foreign_network, export_aa, import_aa FROM bridges ORDER BY bridge_id");
		const bridgeMap = {};
		for (const bridge of bridges) {
			bridgeMap[bridge.bridge_id] = bridge;
		}

		// For BSC challenges, we need to figure out which bridge/type
		// Challenges from BSC could be for:
		// - bridge where BSC is home_network and type=expatriation
		// - bridge where BSC is foreign_network and type=repatriation
		
		console.log('Bridges with BSC as home or foreign network:');
		for (const bridge of bridges) {
			if (bridge.home_network === 'BSC' || bridge.foreign_network === 'BSC') {
				const typeIfHome = bridge.home_network === 'BSC' ? 'expatriation' : 'repatriation';
				const typeIfForeign = bridge.foreign_network === 'BSC' ? 'repatriation' : 'expatriation';
				console.log(`  Bridge ${bridge.bridge_id}: home=${bridge.home_network}, foreign=${bridge.foreign_network}`);
				console.log(`    If BSC is home: type would be ${typeIfHome}`);
				console.log(`    If BSC is foreign: type would be ${typeIfForeign}`);
				
				// Test getValidOutcome for claim 1 with this bridge
				if (bridge.home_network === 'BSC') {
					const result = await getValidOutcome({ claim_num: 1, bridge_id: bridge.bridge_id, type: 'expatriation' }, false);
					console.log(`    Claim 1 with bridge_id=${bridge.bridge_id}, type=expatriation: ${result === null ? 'NULL' : result}`);
				}
				if (bridge.foreign_network === 'BSC') {
					const result = await getValidOutcome({ claim_num: 1, bridge_id: bridge.bridge_id, type: 'repatriation' }, false);
					console.log(`    Claim 1 with bridge_id=${bridge.bridge_id}, type=repatriation: ${result === null ? 'NULL' : result}`);
				}
			}
		}

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

testGetValidOutcome();

