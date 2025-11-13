/*jslint node: true */
"use strict";

/**
 * Export database for peer seeding
 * Exports the relevant tables needed for peer seeding:
 * - bridges: Bridge configurations (created from factory events)
 * - transfers: Expatriation/repatriation events
 * - claims: Claim events
 * - challenges: Challenge events (counterstake challenges)
 * - pooled_assistants: Pooled assistant configurations (created from assistant factory events)
 * - last_blocks: Last processed block numbers per network
 */

const fs = require('fs');
const path = require('path');
const desktopApp = require('ocore/desktop_app.js');
const db = require('ocore/db.js');

async function exportDatabase() {
	try {
		console.log('Exporting database for peer seeding...\n');
		
		// Get the app data directory
		const appDataDir = desktopApp.getAppDataDir();
		console.log(`App data directory: ${appDataDir}`);
		
		// Export relevant tables for peer seeding
		// Includes: bridges (from factory events), transfers, claims, challenges, 
		// pooled_assistants (from assistant factory events), and last_blocks
		const tables = ['bridges', 'transfers', 'claims', 'challenges', 'pooled_assistants', 'last_blocks'];
		const exportData = {
			exportDate: new Date().toISOString(),
			tables: {}
		};
		
		for (const tableName of tables) {
			console.log(`Exporting table: ${tableName}...`);
			const rows = await db.query(`SELECT * FROM ${tableName}`);
			// Ensure all values are properly serialized (handle Date objects, BigInt, etc.)
			const serializedRows = rows.map(row => {
				const serialized = {};
				for (const key in row) {
					let value = row[key];
					
					// Handle null/undefined first
					if (value === null || value === undefined) {
						serialized[key] = null;
						continue;
					}
					
					// Handle Date objects
					if (value instanceof Date) {
						serialized[key] = value.toISOString();
						continue;
					}
					
					// Handle BigInt
					if (typeof value === 'bigint') {
						serialized[key] = value.toString();
						continue;
					}
					
					// Handle objects - try to extract primitive value
					if (typeof value === 'object') {
						// Try valueOf first (for Number objects, etc.)
						const primitive = value.valueOf();
						if (typeof primitive !== 'object' && primitive !== value) {
							value = primitive;
						} else {
							// Try toString if it's not the default object toString
							const str = value.toString();
							if (str !== '[object Object]') {
								// Check if it's a number string
								const num = Number(str);
								if (!isNaN(num) && str.trim() !== '') {
									value = num;
								} else {
									value = str;
								}
							} else {
								// Last resort: try JSON.stringify for complex objects
								try {
									value = JSON.stringify(value);
								} catch (e) {
									value = String(value);
								}
							}
						}
					}
					
					// Ensure numbers are actual numbers, not strings
					if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
						const num = parseInt(value, 10);
						if (!isNaN(num)) {
							value = num;
						}
					}
					
					serialized[key] = value;
				}
				return serialized;
			});
			exportData.tables[tableName] = serializedRows;
			console.log(`  Exported ${rows.length} rows`);
		}
		
		// Create export filename with timestamp
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
		const exportFilename = `db_export_${timestamp}.json`;
		const exportPath = path.join(process.cwd(), exportFilename);
		
		// Write export file
		fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
		
		console.log(`\n✅ Database exported successfully!`);
		console.log(`📁 Export file: ${exportPath}`);
		console.log(`\n📊 Summary:`);
		for (const tableName of tables) {
			console.log(`   ${tableName}: ${exportData.tables[tableName].length} rows`);
		}
		
		console.log(`\n📦 To share with someone:`);
		console.log(`   1. Share the file: ${exportFilename}`);
		console.log(`   2. They can import it using: node import_db_for_seeding.js ${exportFilename}`);
		
		process.exit(0);
	} catch (e) {
		console.error('❌ Error exporting database:', e);
		process.exit(1);
	}
}

// Run export
exportDatabase();

