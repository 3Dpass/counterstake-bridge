/*jslint node: true */
"use strict";

/**
 * Import database for peer seeding
 * Imports the exported tables into the local database
 */

const fs = require('fs');
const path = require('path');
const db = require('ocore/db.js');
const { normalizeAddress } = require('./address_normalizer.js');

async function importDatabase(exportFile) {
	try {
		if (!exportFile) {
			console.error('❌ Please provide the export file path');
			console.log('Usage: node import_db_for_seeding.js <export_file.json>');
			process.exit(1);
		}
		
		const exportPath = path.resolve(exportFile);
		if (!fs.existsSync(exportPath)) {
			console.error(`❌ Export file not found: ${exportPath}`);
			process.exit(1);
		}
		
		console.log(`Importing database from: ${exportPath}\n`);
		
		// Read export file
		const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
		
		if (!exportData.tables) {
			console.error('❌ Invalid export file format');
			process.exit(1);
		}
		
		console.log(`Export date: ${exportData.exportDate || 'unknown'}\n`);
		
		// Create metadata table to track imports (if it doesn't exist)
		await db.query(`
			CREATE TABLE IF NOT EXISTS import_metadata (
				network VARCHAR(10) NOT NULL PRIMARY KEY,
				import_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				export_date VARCHAR(50),
				last_block INT NOT NULL DEFAULT 0
			)
		`);
		
		// Import tables in order (respecting foreign key constraints)
		// Order: bridges (no deps) -> transfers (needs bridges) -> claims (needs bridges, transfers) 
		// -> challenges (needs bridges, claims) -> pooled_assistants (needs bridges) -> last_blocks (no deps)
		const tableOrder = ['bridges', 'transfers', 'claims', 'challenges', 'pooled_assistants', 'last_blocks'];
		
		for (const tableName of tableOrder) {
			if (!exportData.tables[tableName]) {
				console.log(`⚠️  Table ${tableName} not found in export, skipping...`);
				continue;
			}
			
			const rows = exportData.tables[tableName];
			console.log(`Importing table: ${tableName} (${rows.length} rows)...`);
			
			if (rows.length === 0) {
				console.log(`  No rows to import`);
				continue;
			}
			
			// Get column names from first row
			const columns = Object.keys(rows[0]);
			const placeholders = columns.map(() => '?').join(', ');
			const columnNames = columns.join(', ');
			
			// Define address columns for each table that need normalization
			const addressColumns = {
				bridges: ['export_aa', 'export_assistant_aa', 'import_aa', 'import_assistant_aa', 'home_asset', 'foreign_asset', 'stake_asset'],
				transfers: ['sender_address', 'dest_address'],
				claims: ['sender_address', 'dest_address', 'claimant_address'],
				challenges: ['address'],
				pooled_assistants: ['assistant_aa', 'bridge_aa', 'manager', 'shares_asset']
			};
			
			// Get address columns for this table (if any)
			const tableAddressColumns = addressColumns[tableName] || [];
			
			// Use INSERT OR IGNORE to avoid duplicates
			const sql = `INSERT OR IGNORE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
			
			let imported = 0;
			for (const row of rows) {
				// Normalize addresses before inserting (ensures checksummed format for EVM addresses)
				const normalizedRow = { ...row };
				for (const addressCol of tableAddressColumns) {
					if (normalizedRow[addressCol] && typeof normalizedRow[addressCol] === 'string') {
						// Normalize address (checksums EVM addresses, leaves Obyte as-is)
						normalizedRow[addressCol] = normalizeAddress(normalizedRow[addressCol], null);
					}
				}
				
				const values = columns.map(col => normalizedRow[col]);
				const result = await db.query(sql, values);
				if (result.affectedRows > 0) {
					imported++;
				}
			}
			
			console.log(`  Imported ${imported} new rows (${rows.length - imported} duplicates skipped)`);
		}
		
		// Record import metadata for each network that has last_blocks imported
		if (exportData.tables.last_blocks) {
			for (const lastBlockRow of exportData.tables.last_blocks) {
				if (lastBlockRow.last_block > 0) {
					await db.query(`
						INSERT OR REPLACE INTO import_metadata (network, import_date, export_date, last_block)
						VALUES (?, CURRENT_TIMESTAMP, ?, ?)
					`, [lastBlockRow.network, exportData.exportDate || null, lastBlockRow.last_block]);
					console.log(`  Recorded import metadata for ${lastBlockRow.network} (last_block: ${lastBlockRow.last_block})`);
				}
			}
		}
		
		console.log(`\n✅ Database import completed successfully!`);
		console.log(`\n💡 Note: The imported data will be used for peer seeding.`);
		console.log(`   Make sure to restart your node for the changes to take effect.`);
		
		process.exit(0);
	} catch (e) {
		console.error('❌ Error importing database:', e);
		process.exit(1);
	}
}

// Get export file from command line
const exportFile = process.argv[2];
importDatabase(exportFile);

