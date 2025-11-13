/*jslint node: true */
"use strict";

/**
 * Check how many blocks are available in the database for peer seeding
 * This counts transactions that can be used to derive block numbers
 */

const db = require('ocore/db.js');
const { networkApi } = require('./transfers.js');

async function checkSeedingData() {
	try {
		console.log('Checking database for peer seeding data...\n');
		
		// Get counts from database
		const [transferCount] = await db.query("SELECT COUNT(*) as count FROM transfers");
		const [claimCount] = await db.query("SELECT COUNT(*) as count FROM claims");
		const [bridgeCount] = await db.query("SELECT COUNT(*) as count FROM bridges");
		
		console.log('📊 Database Statistics:');
		console.log(`   Bridges: ${bridgeCount.count}`);
		console.log(`   Transfers: ${transferCount.count}`);
		console.log(`   Claims: ${claimCount.count}`);
		console.log(`   Total transactions: ${transferCount.count + claimCount.count}`);
		
		// Get unique transaction hashes (these can be used to query block numbers)
		const transfers = await db.query("SELECT DISTINCT txid FROM transfers");
		const claims = await db.query("SELECT DISTINCT claim_txid as txid FROM claims");
		
		const uniqueTxids = new Set([
			...transfers.map(t => t.txid),
			...claims.map(c => c.txid)
		]);
		
		console.log(`\n📦 Potential Block Numbers:`);
		console.log(`   Unique transaction hashes: ${uniqueTxids.size}`);
		console.log(`   (Each transaction hash can be queried to get a block number)`);
		
		// Get network breakdown
		const networks = await db.query(`
			SELECT DISTINCT home_network as network FROM bridges
			UNION
			SELECT DISTINCT foreign_network as network FROM bridges
		`);
		
		console.log(`\n🌐 Networks in database:`);
		for (const row of networks) {
			const network = row.network;
			
			// Count transfers for this network
			const networkTransfers = await db.query(`
				SELECT COUNT(*) as count FROM transfers t
				JOIN bridges b ON t.bridge_id = b.bridge_id
				WHERE (b.home_network = ? AND t.type = 'expatriation')
				   OR (b.foreign_network = ? AND t.type = 'repatriation')
			`, [network, network]);
			
			// Count claims for this network (always on foreign network)
			const networkClaims = await db.query(`
				SELECT COUNT(*) as count FROM claims c
				JOIN bridges b ON c.bridge_id = b.bridge_id
				WHERE b.foreign_network = ?
			`, [network]);
			
			const total = networkTransfers[0].count + networkClaims[0].count;
			console.log(`   ${network}: ${total} transactions (${networkTransfers[0].count} transfers, ${networkClaims[0].count} claims)`);
		}
		
		// Get last blocks
		const lastBlocks = await db.query("SELECT * FROM last_blocks");
		console.log(`\n📏 Last Processed Blocks:`);
		for (const row of lastBlocks) {
			console.log(`   ${row.network}: block ${row.last_block}`);
		}
		
		console.log(`\n💡 Note: To get actual block numbers, the system queries the blockchain`);
		console.log(`   for each transaction hash. The ${uniqueTxids.size} unique transaction`);
		console.log(`   hashes can potentially provide up to ${uniqueTxids.size} block numbers`);
		console.log(`   (some transactions may be in the same block).`);
		
		process.exit(0);
	} catch (e) {
		console.error('❌ Error checking seeding data:', e);
		process.exit(1);
	}
}

// Run check
checkSeedingData();

