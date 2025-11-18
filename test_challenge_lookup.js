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
		return 'repatriation';
	if (normalizedImportAa && normalizedAddress === normalizedImportAa)
		return 'expatriation';
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

async function testChallengeLookup() {
	console.log('='.repeat(70));
	console.log('TESTING CHALLENGE LOOKUP WITH DIFFERENT CONTRACT ADDRESSES');
	console.log('='.repeat(70));
	console.log('');

	try {
		// Get all BSC bridge addresses
		const bridges = await db.query(`
			SELECT bridge_id, home_network, foreign_network, export_aa, import_aa
			FROM bridges
			WHERE home_network='BSC' OR foreign_network='BSC'
			ORDER BY bridge_id
		`);

		console.log('Testing challenge lookup for claim 1 from different BSC contract addresses:\n');

		for (const bridge of bridges) {
			// Test with export_aa if it's a BSC address
			if (bridge.export_aa && bridge.export_aa.startsWith('0x')) {
				const eventAddress = bridge.export_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 1, bridge_id: foundBridge.bridge_id, type }, false);
					console.log(`Bridge ${bridge.bridge_id} export_aa (${eventAddress}):`);
					console.log(`  getBridgeByAddress → bridge_id=${foundBridge.bridge_id}`);
					console.log(`  getType → type=${type}`);
					console.log(`  getValidOutcome → ${validOutcome === null ? 'NULL (claim not found!)' : validOutcome}`);
					console.log('');
				}
			}

			// Test with import_aa if it's a BSC address
			if (bridge.import_aa && bridge.import_aa.startsWith('0x')) {
				const eventAddress = bridge.import_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 1, bridge_id: foundBridge.bridge_id, type }, false);
					console.log(`Bridge ${bridge.bridge_id} import_aa (${eventAddress}):`);
					console.log(`  getBridgeByAddress → bridge_id=${foundBridge.bridge_id}`);
					console.log(`  getType → type=${type}`);
					console.log(`  getValidOutcome → ${validOutcome === null ? 'NULL (claim not found!)' : validOutcome}`);
					console.log('');
				}
			}
		}

		// Now test for claim 13
		console.log('='.repeat(70));
		console.log('Testing challenge lookup for claim 13:\n');

		for (const bridge of bridges) {
			if (bridge.export_aa && bridge.export_aa.startsWith('0x')) {
				const eventAddress = bridge.export_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 13, bridge_id: foundBridge.bridge_id, type }, false);
					if (validOutcome === null) {
						console.log(`Bridge ${bridge.bridge_id} export_aa (${eventAddress}):`);
						console.log(`  getValidOutcome → NULL (claim not found!)`);
						console.log('');
					}
				}
			}

			if (bridge.import_aa && bridge.import_aa.startsWith('0x')) {
				const eventAddress = bridge.import_aa;
				const foundBridge = await getBridgeByAddress(eventAddress);
				if (foundBridge && foundBridge.bridge_id === bridge.bridge_id) {
					const type = getType(eventAddress, foundBridge);
					const validOutcome = await getValidOutcome({ claim_num: 13, bridge_id: foundBridge.bridge_id, type }, false);
					if (validOutcome === null) {
						console.log(`Bridge ${bridge.bridge_id} import_aa (${eventAddress}):`);
						console.log(`  getValidOutcome → NULL (claim not found!)`);
						console.log('');
					}
				}
			}
		}

		// Show what claims actually exist
		console.log('='.repeat(70));
		console.log('CLAIMS THAT EXIST IN DATABASE:');
		console.log('='.repeat(70));
		const claims = await db.query("SELECT claim_num, bridge_id, type FROM claims WHERE claim_num IN (1, 13) ORDER BY claim_num, bridge_id");
		for (const claim of claims) {
			console.log(`  Claim ${claim.claim_num}: bridge_id=${claim.bridge_id}, type=${claim.type}`);
		}

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

testChallengeLookup();

