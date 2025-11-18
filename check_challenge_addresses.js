/*jslint node: true */
"use strict";

const db = require('ocore/db.js');
const { normalizeAddress } = require('./address_normalizer.js');

async function checkChallengeAddresses() {
	console.log('='.repeat(70));
	console.log('CHECKING CHALLENGE EVENT ADDRESSES');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get all bridges with their addresses
		const bridges = await db.query(`
			SELECT bridge_id, home_network, foreign_network, export_aa, import_aa, export_assistant_aa, import_assistant_aa
			FROM bridges
			ORDER BY bridge_id
		`);

		console.log('Bridge addresses:');
		for (const bridge of bridges) {
			if (bridge.home_network === 'BSC' || bridge.foreign_network === 'BSC') {
				console.log(`\nBridge ${bridge.bridge_id}: home=${bridge.home_network}, foreign=${bridge.foreign_network}`);
				console.log(`  export_aa: ${bridge.export_aa || 'NULL'}`);
				console.log(`  import_aa: ${bridge.import_aa || 'NULL'}`);
				console.log(`  export_assistant_aa: ${bridge.export_assistant_aa || 'NULL'}`);
				console.log(`  import_assistant_aa: ${bridge.import_assistant_aa || 'NULL'}`);
			}
		}

		// Now let's simulate what getBridgeByAddress would do
		console.log('\n' + '='.repeat(70));
		console.log('SIMULATING getBridgeByAddress FOR CHALLENGE ADDRESSES');
		console.log('='.repeat(70));
		console.log('');

		// We need to check what addresses the challenges are actually using
		// From the logs, we know challenges are coming from BSC
		// But we need to know the actual event.address

		// Let's check what addresses could emit challenges
		// Challenges should come from export_aa or import_aa (not assistants)
		
		console.log('Testing getBridgeByAddress logic:');
		for (const bridge of bridges) {
			if (bridge.home_network === 'BSC' || bridge.foreign_network === 'BSC') {
				// Test with export_aa
				if (bridge.export_aa) {
					const normalized = normalizeAddress(bridge.export_aa, null);
					const [found] = await db.query("SELECT * FROM bridges WHERE export_aa=? OR import_aa=?", [normalized, normalized]);
					if (found) {
						const type = normalized === normalizeAddress(found.export_aa, null) ? 'repatriation' : 'expatriation';
						console.log(`  Bridge ${bridge.bridge_id} export_aa ${bridge.export_aa}:`);
						console.log(`    getBridgeByAddress would find: bridge_id=${found.bridge_id}`);
						console.log(`    getType would return: ${type}`);
						
						// Test getValidOutcome for claim 1
						const result = await db.query("SELECT * FROM claims WHERE claim_num=? AND bridge_id=? AND type=?", [1, found.bridge_id, type]);
						console.log(`    Claim 1 exists: ${result.length > 0 ? 'YES' : 'NO'}`);
						if (result.length > 0) {
							console.log(`    transfer_id: ${result[0].transfer_id || 'NULL'}`);
						}
					}
				}
				
				// Test with import_aa
				if (bridge.import_aa) {
					const normalized = normalizeAddress(bridge.import_aa, null);
					const [found] = await db.query("SELECT * FROM bridges WHERE export_aa=? OR import_aa=?", [normalized, normalized]);
					if (found) {
						const type = normalized === normalizeAddress(found.export_aa, null) ? 'repatriation' : 'expatriation';
						console.log(`  Bridge ${bridge.bridge_id} import_aa ${bridge.import_aa}:`);
						console.log(`    getBridgeByAddress would find: bridge_id=${found.bridge_id}`);
						console.log(`    getType would return: ${type}`);
						
						// Test getValidOutcome for claim 1
						const result = await db.query("SELECT * FROM claims WHERE claim_num=? AND bridge_id=? AND type=?", [1, found.bridge_id, type]);
						console.log(`    Claim 1 exists: ${result.length > 0 ? 'YES' : 'NO'}`);
						if (result.length > 0) {
							console.log(`    transfer_id: ${result[0].transfer_id || 'NULL'}`);
						}
					}
				}
			}
		}

		// Check what claims exist for bridge 10 and 11 (where claim 1 exists)
		console.log('\n' + '='.repeat(70));
		console.log('CLAIMS FOR BRIDGES 10 AND 11 (where claim 1 exists)');
		console.log('='.repeat(70));
		console.log('');

		const bridge10 = bridges.find(b => b.bridge_id === 10);
		const bridge11 = bridges.find(b => b.bridge_id === 11);

		if (bridge10) {
			console.log(`Bridge 10: home=${bridge10.home_network}, foreign=${bridge10.foreign_network}`);
			console.log(`  export_aa: ${bridge10.export_aa}`);
			console.log(`  import_aa: ${bridge10.import_aa}`);
			
			// Check claims
			const claims10 = await db.query("SELECT claim_num, type, transfer_id FROM claims WHERE bridge_id=10 ORDER BY claim_num");
			console.log(`  Claims: ${claims10.length}`);
			for (const c of claims10.slice(0, 5)) {
				console.log(`    Claim ${c.claim_num}: type=${c.type}, transfer_id=${c.transfer_id || 'NULL'}`);
			}
		}

		if (bridge11) {
			console.log(`\nBridge 11: home=${bridge11.home_network}, foreign=${bridge11.foreign_network}`);
			console.log(`  export_aa: ${bridge11.export_aa}`);
			console.log(`  import_aa: ${bridge11.import_aa}`);
			
			// Check claims
			const claims11 = await db.query("SELECT claim_num, type, transfer_id FROM claims WHERE bridge_id=11 ORDER BY claim_num");
			console.log(`  Claims: ${claims11.length}`);
			for (const c of claims11.slice(0, 5)) {
				console.log(`    Claim ${c.claim_num}: type=${c.type}, transfer_id=${c.transfer_id || 'NULL'}`);
			}
		}

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkChallengeAddresses();

