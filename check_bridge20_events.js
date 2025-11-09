#!/usr/bin/env node

/**
 * Check Bridge 20 Events
 * 
 * This script checks the database for all events (transfers, claims, challenges) for bridge 20
 * to confirm if any events are stored.
 * 
 * Usage: node check_bridge20_events.js
 */

const db = require('ocore/db.js');
const conf = require('ocore/conf.js');
const db_import = require('./db_import.js');

const BRIDGE_ID = 20; // 3DPass bridge

async function checkBridge20Events() {
    console.log('🔍 Checking Bridge 20 Events in Database...\n');
    
    try {
        // Initialize database connection
        await db_import.initDB();
        console.log('✅ Database initialized\n');

        // Check for transfers on bridge 20
        console.log('📊 Checking transfers on bridge 20:');
        const transfers = await db.query("SELECT transfer_id, type, txid, txts, sender_address, dest_address, amount, reward, is_confirmed, creation_date FROM transfers WHERE bridge_id=? ORDER BY creation_date DESC", [BRIDGE_ID]);
        
        if (transfers.length === 0) {
            console.log('❌ No transfers found on bridge 20\n');
        } else {
            console.log(`✅ Found ${transfers.length} transfer(s) on bridge 20:\n`);
            transfers.forEach((transfer, index) => {
                console.log(`Transfer ${index + 1}:`);
                console.log(`  transfer_id: ${transfer.transfer_id}`);
                console.log(`  type: ${transfer.type}`);
                console.log(`  txid: ${transfer.txid}`);
                console.log(`  txts: ${transfer.txts}`);
                console.log(`  sender_address: ${transfer.sender_address}`);
                console.log(`  dest_address: ${transfer.dest_address}`);
                console.log(`  amount: ${transfer.amount}`);
                console.log(`  reward: ${transfer.reward}`);
                console.log(`  is_confirmed: ${transfer.is_confirmed}`);
                console.log(`  creation_date: ${transfer.creation_date}`);
                console.log('');
            });
        }

        // Check for claims on bridge 20
        console.log('📊 Checking claims on bridge 20:');
        const claims = await db.query("SELECT claim_num, type, txid, txts, sender_address, dest_address, claimant_address, amount, reward, transfer_id, claim_txid, is_finished, creation_date FROM claims WHERE bridge_id=? ORDER BY creation_date DESC", [BRIDGE_ID]);
        
        if (claims.length === 0) {
            console.log('❌ No claims found on bridge 20\n');
        } else {
            console.log(`✅ Found ${claims.length} claim(s) on bridge 20:\n`);
            claims.forEach((claim, index) => {
                console.log(`Claim ${index + 1}:`);
                console.log(`  claim_num: ${claim.claim_num}`);
                console.log(`  type: ${claim.type}`);
                console.log(`  txid: ${claim.txid}`);
                console.log(`  txts: ${claim.txts}`);
                console.log(`  sender_address: ${claim.sender_address}`);
                console.log(`  dest_address: ${claim.dest_address}`);
                console.log(`  claimant_address: ${claim.claimant_address}`);
                console.log(`  amount: ${claim.amount}`);
                console.log(`  reward: ${claim.reward}`);
                console.log(`  transfer_id: ${claim.transfer_id || 'NULL'}`);
                console.log(`  claim_txid: ${claim.claim_txid}`);
                console.log(`  is_finished: ${claim.is_finished}`);
                console.log(`  creation_date: ${claim.creation_date}`);
                console.log('');
            });
        }

        // Check for challenges on bridge 20
        console.log('📊 Checking challenges on bridge 20:');
        const challenges = await db.query("SELECT challenge_id, claim_num, type, address, stake_on, stake, challenge_txid, creation_date FROM challenges WHERE bridge_id=? ORDER BY creation_date DESC", [BRIDGE_ID]);
        
        if (challenges.length === 0) {
            console.log('❌ No challenges found on bridge 20\n');
        } else {
            console.log(`✅ Found ${challenges.length} challenge(s) on bridge 20:\n`);
            challenges.forEach((challenge, index) => {
                console.log(`Challenge ${index + 1}:`);
                console.log(`  challenge_id: ${challenge.challenge_id}`);
                console.log(`  claim_num: ${challenge.claim_num}`);
                console.log(`  type: ${challenge.type}`);
                console.log(`  address: ${challenge.address}`);
                console.log(`  stake_on: ${challenge.stake_on}`);
                console.log(`  stake: ${challenge.stake}`);
                console.log(`  challenge_txid: ${challenge.challenge_txid}`);
                console.log(`  creation_date: ${challenge.creation_date}`);
                console.log('');
            });
        }

        // Summary
        console.log('📊 Summary:');
        console.log(`  Transfers: ${transfers.length}`);
        console.log(`  Claims: ${claims.length}`);
        console.log(`  Challenges: ${challenges.length}`);
        console.log(`  Total events: ${transfers.length + claims.length + challenges.length}\n`);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
    
    process.exit(0);
}

checkBridge20Events();

