"use strict";

const db = require('ocore/db.js');
const conf = require('ocore/conf.js');

async function investigateClaim(claim_num, bridge_id, type) {
	console.log(`\n=== Investigating Claim ${claim_num} on Bridge ${bridge_id} (${type}) ===\n`);
	
	// Get the claim details
	const [claim] = await db.query(
		"SELECT * FROM claims WHERE claim_num=? AND bridge_id=? AND type=?",
		[claim_num, bridge_id, type]
	);
	
	if (!claim) {
		console.log(`❌ Claim ${claim_num} not found in database`);
		return;
	}
	
	console.log('📋 Claim Details:');
	console.log(JSON.stringify(claim, null, 2));
	
	// Check if claim has a transfer_id (valid claim)
	if (claim.transfer_id) {
		console.log(`\n✅ Claim has transfer_id: ${claim.transfer_id}`);
		const [transfer] = await db.query("SELECT * FROM transfers WHERE transfer_id=?", [claim.transfer_id]);
		if (transfer) {
			console.log('📦 Matching Transfer:');
			console.log(JSON.stringify(transfer, null, 2));
		} else {
			console.log(`⚠️  Transfer ${claim.transfer_id} not found!`);
		}
	} else {
		console.log(`\n❌ Claim has NO transfer_id - this is why it was marked as invalid`);
		
		// Try to find transfers with the same txid
		console.log(`\n🔍 Searching for transfers with txid: ${claim.txid}`);
		const transfersWithTxid = await db.query(
			"SELECT * FROM transfers WHERE txid=?",
			[claim.txid]
		);
		
		if (transfersWithTxid.length === 0) {
			console.log(`❌ No transfers found with txid ${claim.txid}`);
			console.log(`   This means the transfer was never detected in the source chain`);
		} else {
			console.log(`\n⚠️  Found ${transfersWithTxid.length} transfer(s) with the same txid but they don't match:`);
			transfersWithTxid.forEach((transfer, idx) => {
				console.log(`\n   Transfer ${idx + 1}:`);
				console.log(`   - transfer_id: ${transfer.transfer_id}`);
				console.log(`   - bridge_id: ${transfer.bridge_id} (claim expects: ${bridge_id})`);
				console.log(`   - type: ${transfer.type} (claim expects: ${type})`);
				console.log(`   - txts: ${transfer.txts} (claim expects: ${claim.txts})`);
				console.log(`   - sender_address: ${transfer.sender_address} (claim expects: ${claim.sender_address})`);
				console.log(`   - dest_address: ${transfer.dest_address} (claim expects: ${claim.dest_address})`);
				console.log(`   - is_confirmed: ${transfer.is_confirmed} (claim expects: 1)`);
				console.log(`   - amount: ${transfer.amount} (claim expects: ${claim.amount})`);
				console.log(`   - reward: ${transfer.reward} (claim expects: ${claim.reward})`);
				console.log(`   - data: ${transfer.data} (claim expects: ${claim.data})`);
				
				// Check which fields don't match
				const mismatches = [];
				if (transfer.bridge_id !== bridge_id) mismatches.push(`bridge_id (${transfer.bridge_id} vs ${bridge_id})`);
				if (transfer.type !== type) mismatches.push(`type (${transfer.type} vs ${type})`);
				if (transfer.txts !== claim.txts) mismatches.push(`txts (${transfer.txts} vs ${claim.txts})`);
				if (transfer.sender_address?.toLowerCase() !== claim.sender_address?.toLowerCase()) mismatches.push(`sender_address`);
				if (transfer.dest_address?.toLowerCase() !== claim.dest_address?.toLowerCase()) mismatches.push(`dest_address`);
				if (transfer.is_confirmed !== 1) mismatches.push(`is_confirmed (${transfer.is_confirmed} vs 1)`);
				
				if (mismatches.length > 0) {
					console.log(`   ❌ Mismatches: ${mismatches.join(', ')}`);
				}
			});
		}
		
		// Check for transfers with similar criteria but different txid (maybe reorg?)
		console.log(`\n🔍 Checking for transfers with similar criteria (different txid):`);
		const similarTransfers = await db.query(
			`SELECT * FROM transfers 
			WHERE bridge_id=? AND type=? AND txts=? 
			AND LOWER(sender_address)=LOWER(?) AND LOWER(dest_address)=LOWER(?)
			AND is_confirmed=1
			AND txid != ?`,
			[bridge_id, type, claim.txts, claim.sender_address, claim.dest_address, claim.txid]
		);
		
		if (similarTransfers.length > 0) {
			console.log(`\n⚠️  Found ${similarTransfers.length} transfer(s) with similar criteria but different txid:`);
			similarTransfers.forEach((transfer, idx) => {
				console.log(`\n   Transfer ${idx + 1}:`);
				console.log(`   - transfer_id: ${transfer.transfer_id}`);
				console.log(`   - txid: ${transfer.txid} (claim has: ${claim.txid})`);
				console.log(`   - amount: ${transfer.amount} (claim: ${claim.amount})`);
				console.log(`   - reward: ${transfer.reward} (claim: ${claim.reward})`);
			});
		} else {
			console.log(`   No similar transfers found`);
		}
	}
	
	// Get bridge info
	const [bridge] = await db.query("SELECT * FROM bridges WHERE bridge_id=?", [bridge_id]);
	if (bridge) {
		console.log(`\n🌉 Bridge ${bridge_id} Info:`);
		console.log(`   - home_network: ${bridge.home_network}`);
		console.log(`   - foreign_network: ${bridge.foreign_network}`);
		console.log(`   - home_asset: ${bridge.home_asset}`);
		console.log(`   - foreign_asset: ${bridge.foreign_asset}`);
		console.log(`   - export_aa: ${bridge.export_aa}`);
		console.log(`   - import_aa: ${bridge.import_aa}`);
	}
	
	console.log(`\n=== End of Investigation ===\n`);
}

// Main execution
async function main() {
	const args = process.argv.slice(2);
	
	if (args.length < 3) {
		console.log('Usage: node investigate_claim.js <claim_num> <bridge_id> <type>');
		console.log('Example: node investigate_claim.js 5 19 repatriation');
		process.exit(1);
	}
	
	const claim_num = parseInt(args[0]);
	const bridge_id = parseInt(args[1]);
	const type = args[2]; // 'expatriation' or 'repatriation'
	
	await investigateClaim(claim_num, bridge_id, type);
	process.exit(0);
}

if (require.main === module) {
	main().catch(err => {
		console.error('Error:', err);
		process.exit(1);
	});
}

module.exports = { investigateClaim };

