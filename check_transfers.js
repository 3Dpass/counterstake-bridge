#!/usr/bin/env node

const db = require('ocore/db.js');

async function checkTransfers() {
    try {
        console.log('🔍 Checking current transfers in database...\n');

        // Get total count
        const countResult = await new Promise((resolve, reject) => {
            db.query('SELECT COUNT(*) as count FROM transfers', [], (rows) => {
                if (rows) resolve(rows[0]);
                else reject(new Error('Failed to get count'));
            });
        });

        console.log(`📊 Total transfers: ${countResult.count}`);

        // Get transfer ID range
        const rangeResult = await new Promise((resolve, reject) => {
            db.query('SELECT MIN(transfer_id) as min_id, MAX(transfer_id) as max_id FROM transfers', [], (rows) => {
                if (rows) resolve(rows[0]);
                else reject(new Error('Failed to get range'));
            });
        });

        console.log(`📈 Transfer ID range: ${rangeResult.min_id} to ${rangeResult.max_id}`);

        // Get most recent transfers
        const recentResult = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    t.transfer_id, 
                    t.txid, 
                    t.type, 
                    t.amount, 
                    t.reward, 
                    t.sender_address, 
                    t.dest_address,
                    t.creation_date,
                    b.home_network,
                    b.foreign_network,
                    b.home_symbol,
                    b.foreign_symbol
                FROM transfers t
                JOIN bridges b ON t.bridge_id = b.bridge_id
                ORDER BY t.transfer_id DESC 
                LIMIT 10
            `, [], (rows) => {
                if (rows) resolve(rows);
                else reject(new Error('Failed to get recent transfers'));
            });
        });

        console.log('\n🕒 Most recent transfers:');
        console.log('─'.repeat(120));
        recentResult.forEach(t => {
            const amount = (parseInt(t.amount) / Math.pow(10, 6)).toFixed(6); // Assuming 6 decimals for display
            const reward = (parseInt(t.reward) / Math.pow(10, 6)).toFixed(6);
            console.log(`ID: ${t.transfer_id.toString().padStart(4)} | ${t.type.padEnd(12)} | ${t.home_network}→${t.foreign_network} | ${amount.padStart(12)} ${t.foreign_symbol || '?'} | Reward: ${reward.padStart(8)} | ${t.creation_date}`);
        });

        // Get transfers by type
        const typeResult = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    t.type,
                    COUNT(*) as count,
                    b.home_network,
                    b.foreign_network
                FROM transfers t
                JOIN bridges b ON t.bridge_id = b.bridge_id
                GROUP BY t.type, b.home_network, b.foreign_network
                ORDER BY count DESC
            `, [], (rows) => {
                if (rows) resolve(rows);
                else reject(new Error('Failed to get transfers by type'));
            });
        });

        console.log('\n📋 Transfers by type:');
        console.log('─'.repeat(80));
        typeResult.forEach(t => {
            console.log(`${t.type.padEnd(12)} | ${t.home_network}→${t.foreign_network} | Count: ${t.count.toString().padStart(6)}`);
        });

        // Get transfers by date (last 7 days)
        const dateResult = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    DATE(creation_date) as date,
                    COUNT(*) as count
                FROM transfers 
                WHERE creation_date >= datetime('now', '-7 days')
                GROUP BY DATE(creation_date)
                ORDER BY date DESC
            `, [], (rows) => {
                if (rows) resolve(rows);
                else reject(new Error('Failed to get transfers by date'));
            });
        });

        console.log('\n📅 Transfers by date (last 7 days):');
        console.log('─'.repeat(40));
        dateResult.forEach(d => {
            console.log(`${d.date} | Count: ${d.count.toString().padStart(6)}`);
        });

        // Get unclaimed transfers (transfers without corresponding claims)
        const unclaimedResult = await new Promise((resolve, reject) => {
            db.query(`
                SELECT COUNT(*) as count
                FROM transfers t
                LEFT JOIN claims c ON t.transfer_id = c.transfer_id
                WHERE c.transfer_id IS NULL
            `, [], (rows) => {
                if (rows) resolve(rows[0]);
                else reject(new Error('Failed to get unclaimed transfers'));
            });
        });

        console.log(`\n⚠️  Unclaimed transfers: ${unclaimedResult.count}`);

        // Get recent unclaimed transfers
        const recentUnclaimedResult = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    t.transfer_id,
                    t.txid,
                    t.type,
                    t.amount,
                    t.reward,
                    t.creation_date,
                    b.home_network,
                    b.foreign_network
                FROM transfers t
                JOIN bridges b ON t.bridge_id = b.bridge_id
                LEFT JOIN claims c ON t.transfer_id = c.transfer_id
                WHERE c.transfer_id IS NULL
                ORDER BY t.transfer_id DESC
                LIMIT 5
            `, [], (rows) => {
                if (rows) resolve(rows);
                else reject(new Error('Failed to get recent unclaimed transfers'));
            });
        });

        if (recentUnclaimedResult.length > 0) {
            console.log('\n🚨 Recent unclaimed transfers:');
            console.log('─'.repeat(100));
            recentUnclaimedResult.forEach(t => {
                const amount = (parseInt(t.amount) / Math.pow(10, 6)).toFixed(6);
                const reward = (parseInt(t.reward) / Math.pow(10, 6)).toFixed(6);
                console.log(`ID: ${t.transfer_id.toString().padStart(4)} | ${t.type.padEnd(12)} | ${t.home_network}→${t.foreign_network} | ${amount.padStart(12)} | Reward: ${reward.padStart(8)} | ${t.creation_date}`);
            });
        }

        console.log('\n✅ Transfer check completed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error checking transfers:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Exiting...');
    process.exit(0);
});

checkTransfers();
