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

async function checkChallengeAddressesFromLogs() {
	console.log('='.repeat(70));
	console.log('CHECKING CHALLENGE ADDRESSES FROM LOGS');
	console.log('='.repeat(70));
	console.log('');

	try {
		// From logs:
		// Claim 13 challenge: address: '0x078E7A2037b63846836E9d721cf2dabC08b94281'
		// Claim 1 challenge: address: '0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE'

		const challengeAddresses = [
			{ claim_num: 13, address: '0x078E7A2037b63846836E9d721cf2dabC08b94281' },
			{ claim_num: 1, address: '0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE' }
		];

		for (const ch of challengeAddresses) {
			console.log(`Challenge for claim ${ch.claim_num}:`);
			console.log(`  event.address: ${ch.address}`);
			
			const bridge = await getBridgeByAddress(ch.address);
			if (!bridge) {
				console.log(`  ❌ Bridge not found for address ${ch.address}`);
				continue;
			}

			console.log(`  Bridge found: bridge_id=${bridge.bridge_id}, home=${bridge.home_network}, foreign=${bridge.foreign_network}`);
			console.log(`  export_aa: ${bridge.export_aa}`);
			console.log(`  import_aa: ${bridge.import_aa}`);

			const type = getType(ch.address, bridge);
			console.log(`  getType returns: ${type}`);

			const validOutcome = await getValidOutcome({ claim_num: ch.claim_num, bridge_id: bridge.bridge_id, type }, false);
			console.log(`  getValidOutcome returns: ${validOutcome === null ? 'NULL (claim not found!)' : validOutcome}`);

			// Check what claims exist for this claim_num
			const allClaims = await db.query("SELECT * FROM claims WHERE claim_num=?", [ch.claim_num]);
			console.log(`  Claims in DB for claim_num=${ch.claim_num}:`);
			for (const c of allClaims) {
				console.log(`    bridge_id=${c.bridge_id}, type=${c.type}, transfer_id=${c.transfer_id || 'NULL'}`);
			}
			console.log('');
		}

	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	}
	process.exit(0);
}

checkChallengeAddressesFromLogs();

