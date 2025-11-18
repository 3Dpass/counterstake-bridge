/*jslint node: true */
"use strict";

const db = require('ocore/db.js');
const { normalizeAddress } = require('./address_normalizer.js');

async function getBridgeByAddress(bridge_aa) {
	const normalized_bridge_aa = normalizeAddress(bridge_aa, null);
	const [bridge] = await db.query("SELECT * FROM bridges WHERE export_aa=? OR import_aa=?", [normalized_bridge_aa, normalized_bridge_aa]);
	return bridge;
}

function getType(address, bridge) {
	const normalizedAddress = normalizeAddress(address, null);
	const normalizedExportAa = normalizeAddress(bridge.export_aa, null);
	const normalizedImportAa = normalizeAddress(bridge.import_aa, null);
	
	if (normalizedExportAa && normalizedAddress === normalizedExportAa)
		return 'expatriation';
	if (normalizedImportAa && normalizedAddress === normalizedImportAa)
		return 'repatriation';
	throw Error(`unable to determine transfer type on address ${address} and bridge ${bridge.bridge_id}`);
}

async function getValidOutcome({ claim_num, bridge_id, type }, bThrowIfNotFound) {
	const [db_claim] = await db.query("SELECT * FROM claims WHERE claim_num=? AND bridge_id=? AND type=?", [claim_num, bridge_id, type]);
	if (!db_claim) {
		if (bThrowIfNotFound)
			throw Error(`claim ${claim_num} not found in db`);
		return null;
	}
	return db_claim.transfer_id ? 'yes' : 'no';
}

async function checkWhyChallengesFail() {
	console.log('='.repeat(70));
	console.log('CHECKING WHY CHALLENGES ARE FAILING');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Check claims 1 and 13 (from logs)
		const claim1 = await db.query("SELECT * FROM claims WHERE claim_num=1");
		const claim13 = await db.query("SELECT * FROM claims WHERE claim_num=13");

		console.log('Claims in database:');
		console.log(`  Claim 1: ${claim1.length} record(s)`);
		for (const c of claim1) {
			console.log(`    bridge_id=${c.bridge_id}, type=${c.type}, transfer_id=${c.transfer_id || 'NULL'}`);
		}
		console.log(`  Claim 13: ${claim13.length} record(s)`);
		for (const c of claim13) {
			console.log(`    bridge_id=${c.bridge_id}, type=${c.type}, transfer_id=${c.transfer_id || 'NULL'}`);
		}
		console.log('');

		// Get BSC bridges
		const bridges = await db.query(`
			SELECT bridge_id, home_network, foreign_network, export_aa, import_aa
			FROM bridges
			WHERE home_network='BSC' OR foreign_network='BSC'
			ORDER BY bridge_id
		`);

		console.log('Testing challenge lookup for claim 1 and 13:');
		console.log('');

		// Test claim 1
		for (const bridge of bridges) {
			// Test with export_aa if it's a BSC address
			if (bridge.export_aa && bridge.export_aa.startsWith('0x')) {
				const eventAddress = bridge.export_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 1, bridge_id: foundBridge.bridge_id, type }, false);
					if (validOutcome !== null) {
						console.log(`✅ Claim 1 from bridge ${bridge.bridge_id} export_aa: type=${type}, validOutcome=${validOutcome}`);
					}
				}
			}

			// Test with import_aa if it's a BSC address
			if (bridge.import_aa && bridge.import_aa.startsWith('0x')) {
				const eventAddress = bridge.import_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 1, bridge_id: foundBridge.bridge_id, type }, false);
					if (validOutcome !== null) {
						console.log(`✅ Claim 1 from bridge ${bridge.bridge_id} import_aa: type=${type}, validOutcome=${validOutcome}`);
					}
				}
			}
		}

		// Test claim 13
		for (const bridge of bridges) {
			if (bridge.export_aa && bridge.export_aa.startsWith('0x')) {
				const eventAddress = bridge.export_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 13, bridge_id: foundBridge.bridge_id, type }, false);
					if (validOutcome !== null) {
						console.log(`✅ Claim 13 from bridge ${bridge.bridge_id} export_aa: type=${type}, validOutcome=${validOutcome}`);
					}
				}
			}

			if (bridge.import_aa && bridge.import_aa.startsWith('0x')) {
				const eventAddress = bridge.import_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 13, bridge_id: foundBridge.bridge_id, type }, false);
					if (validOutcome !== null) {
						console.log(`✅ Claim 13 from bridge ${bridge.bridge_id} import_aa: type=${type}, validOutcome=${validOutcome}`);
					}
				}
			}
		}

		// Check what the actual challenge event.address would be
		console.log('');
		console.log('From logs, challenges are coming from BSC.');
		console.log('Need to determine which contract address emitted the challenge...');
		console.log('The event.address should be in the cache file or event object.');

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkWhyChallengesFail();

