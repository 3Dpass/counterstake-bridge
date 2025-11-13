/*jslint node: true */
"use strict";

/**
 * Import database for peer seeding
 * Imports the exported tables into the local database
 */

const fs = require('fs');
const path = require('path');
const db = require('ocore/db.js');

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
			
			// Use INSERT OR IGNORE to avoid duplicates
			const sql = `INSERT OR IGNORE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
			
			let imported = 0;
			for (const row of rows) {
				const values = columns.map(col => row[col]);
				const result = await db.query(sql, values);
				if (result.affectedRows > 0) {
					imported++;
				}
			}
			
			console.log(`  Imported ${imported} new rows (${rows.length - imported} duplicates skipped)`);
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

