#!/usr/bin/env node

/**
 * Simplified script to parse query debug logs
 * Usage: node parse_query_debug_logs_simple.js [log_file_path]
 */

const fs = require('fs');
const path = require('path');

const logFilePath = process.argv[2] || path.join(
	process.env.HOME || process.env.USERPROFILE,
	'Library/Application Support/counterstake-bridge/log.txt'
);

if (!fs.existsSync(logFilePath)) {
	console.error(`❌ Log file not found: ${logFilePath}`);
	process.exit(1);
}

console.log(`📖 Reading logs from: ${logFilePath}\n`);

// Read and process in chunks to avoid memory issues
const stream = fs.createReadStream(logFilePath, { encoding: 'utf8' });
let buffer = '';
let inQueryBlock = false;
let currentQuery = null;
let queries = [];

function processLine(line) {
	// Start of query block
	if (line.includes('[QUERY DEBUG] Executing full query for claim')) {
		if (currentQuery) {
			queries.push(currentQuery);
		}
		const claimMatch = line.match(/claim (\d+)/);
		currentQuery = {
			claimNum: claimMatch ? claimMatch[1] : 'unknown',
			timestamp: line.match(/(\d{4}-\d{2}-\d{2}T[\d:\.]+Z)/)?.[1] || 'unknown',
			sql: null,
			parameters: {},
			fullQueryResults: null,
			txidQueryResults: null,
			comparison: null,
			allMatch: null,
			issue: null,
			inComparison: false
		};
		inQueryBlock = true;
		return;
	}
	
	if (!currentQuery || !inQueryBlock) return;
	
	// SQL query
	if (line.includes('SQL:') && !currentQuery.sql) {
		const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:\.]+Z:\s*/, '');
		const sqlMatch = cleanLine.match(/SQL:\s*(.+)/);
		if (sqlMatch) {
			currentQuery.sql = sqlMatch[1].trim();
		}
	}
	
	// Parameters
	if (line.includes('[') && line.includes(']') && line.includes('=') && line.includes(':')) {
		const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:\.]+Z:\s*/, '');
		const paramMatch = cleanLine.match(/\[\s*(\d+)\s*\]\s+(\w+):\s+(\w+)\s+=\s+(.+)/);
		if (paramMatch) {
			const [, index, name, type, value] = paramMatch;
			currentQuery.parameters[name] = { index: parseInt(index), type, value: value.trim() };
		}
	}
	
	// Query results
	if (line.includes('Query executed, returned')) {
		const resultMatch = line.match(/returned (\d+) result\(s\)/);
		if (resultMatch) {
			currentQuery.fullQueryResults = parseInt(resultMatch[1]);
		}
	}
	
	if (line.includes('Txid query returned')) {
		const resultMatch = line.match(/returned (\d+) result\(s\)/);
		if (resultMatch) {
			currentQuery.txidQueryResults = parseInt(resultMatch[1]);
		}
	}
	
	// Parameter comparison - look for the detailed comparison section
	if (line.includes('Detailed parameter comparison:') || line.includes('🔬 [QUERY DEBUG] Detailed parameter comparison:')) {
		currentQuery.comparison = {};
		currentQuery.inComparison = true;
		return;
	}
	
	// Parse comparison lines - format: "    bridge_id: DB=1 (number), Query=1 (number), Match=true"
	if (currentQuery && currentQuery.inComparison && line.includes('DB=') && line.includes('Query=')) {
		// Remove timestamp prefix
		const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:\.]+Z:\s*/, '');
		// Match: "    bridge_id: DB=1 (number), Query=1 (number), Match=true"
		// Use regex that doesn't require leading whitespace (pattern 2 from test)
		const compMatch = cleanLine.match(/(\w+):\s+DB=([^,]+)\s+\(([^)]+)\),\s+Query=([^,]+)\s+\(([^)]+)\),\s+Match=(true|false)/);
		if (compMatch) {
			const [, name, dbValue, dbType, queryValue, queryType, match] = compMatch;
			currentQuery.comparison[name] = {
				dbValue: dbValue.trim().replace(/^["']|["']$/g, ''), // Remove quotes
				dbType: dbType.trim(),
				queryValue: queryValue.trim().replace(/^["']|["']$/g, ''), // Remove quotes
				queryType: queryType.trim(),
				match: match === 'true'
			};
		}
		// Stop reading comparison after we've seen all 6 parameters
		if (Object.keys(currentQuery.comparison).length >= 6) {
			currentQuery.inComparison = false;
		}
	} else if (currentQuery && currentQuery.inComparison && !line.includes('DB=') && !line.includes('All parameters match') && !line.includes('🎯')) {
		// If we're in comparison mode but hit a non-comparison line (except "All parameters match"), stop
		// But only if we've read at least one comparison line
		if (Object.keys(currentQuery.comparison).length > 0) {
			currentQuery.inComparison = false;
		}
	}
	
	// All match
	if (line.includes('All parameters match:')) {
		const matchMatch = line.match(/match: (true|false)/);
		if (matchMatch) {
			currentQuery.allMatch = matchMatch[1] === 'true';
		}
	}
	
	// Issue
	if (line.includes('CRITICAL:')) {
		currentQuery.issue = 'SQLite query execution issue';
	} else if (line.includes("Parameters don't match")) {
		currentQuery.issue = 'Real parameter mismatch';
	}
	
	// End of query block (when we see a new query or move far enough)
	if (line.includes('[QUERY DEBUG] Executing full query for claim') && currentQuery.claimNum !== 'unknown') {
		inQueryBlock = false;
	}
}

// Process file
stream.on('data', chunk => {
	buffer += chunk;
	const lines = buffer.split('\n');
	buffer = lines.pop() || ''; // Keep incomplete line in buffer
	
	lines.forEach(processLine);
});

stream.on('end', () => {
	// Process remaining buffer
	if (buffer) processLine(buffer);
	if (currentQuery) queries.push(currentQuery);
	
	// Generate report
	generateReport();
});

function generateReport() {
	console.log('='.repeat(80));
	console.log('QUERY DEBUG LOG ANALYSIS');
	console.log('='.repeat(80));
	console.log(`\nFound ${queries.length} query debug block(s)\n`);
	
	if (queries.length === 0) {
		console.log('⚠️  No query debug blocks found.');
		return;
	}
	
	// Show queries with comparisons first, then first 10 others
	const queriesWithComparison = queries.filter(q => q.comparison && Object.keys(q.comparison).length > 0);
	const otherQueries = queries.filter(q => !q.comparison || Object.keys(q.comparison).length === 0).slice(0, 10);
	const queriesToShow = [...queriesWithComparison.slice(0, 20), ...otherQueries];
	
	queriesToShow.forEach((query, index) => {
		console.log(`\n${'='.repeat(80)}`);
		console.log(`QUERY #${index + 1} - Claim ${query.claimNum}`);
		console.log(`Timestamp: ${query.timestamp}`);
		console.log(`${'='.repeat(80)}`);
		
		if (query.sql) {
			console.log(`\n📋 SQL: ${query.sql.substring(0, 100)}...`);
		}
		
		if (Object.keys(query.parameters).length > 0) {
			console.log(`\n📊 Parameters:`);
			Object.entries(query.parameters).forEach(([name, info]) => {
				console.log(`   ${name}: ${info.value} (${info.type})`);
			});
		}
		
		console.log(`\n🔍 Results: Full=${query.fullQueryResults ?? 'N/A'}, Txid=${query.txidQueryResults ?? 'N/A'}`);
		
		if (query.comparison && Object.keys(query.comparison).length > 0) {
			console.log(`\n🔬 Detailed Parameter Comparison:`);
			Object.entries(query.comparison).forEach(([name, comp]) => {
				const icon = comp.match ? '✅' : '❌';
				console.log(`   ${icon} ${name}:`);
				console.log(`      DB:    ${comp.dbValue} (${comp.dbType})`);
				console.log(`      Query: ${comp.queryValue} (${comp.queryType})`);
				console.log(`      Match: ${comp.match ? 'YES' : 'NO'}`);
				
				if (!comp.match) {
					console.log(`      ⚠️  MISMATCH DETECTED!`);
				}
			});
			
			// Show summary of mismatches
			const mismatches = Object.entries(query.comparison).filter(([, comp]) => !comp.match);
			if (mismatches.length > 0) {
				console.log(`\n   ❌ Mismatched parameters: ${mismatches.map(([name]) => name).join(', ')}`);
			}
		} else if (query.fullQueryResults === 0 && query.txidQueryResults > 0) {
			console.log(`\n⚠️  Full query returned 0 but txid query found ${query.txidQueryResults} transfer(s)`);
			console.log(`   This suggests a parameter mismatch, but detailed comparison not available in logs.`);
		}
		
		if (query.allMatch !== null) {
			console.log(`\n🎯 All match: ${query.allMatch ? '✅ YES' : '❌ NO'}`);
		}
		
		if (query.issue) {
			console.log(`\n⚠️  Issue: ${query.issue}`);
		}
	});
	
	// Summary
	console.log(`\n${'='.repeat(80)}`);
	console.log('SUMMARY');
	console.log(`${'='.repeat(80)}`);
	
	const sqliteIssues = queries.filter(q => q.issue === 'SQLite query execution issue').length;
	const mismatches = queries.filter(q => q.issue === 'Real parameter mismatch').length;
	const allMatch = queries.filter(q => q.allMatch === true).length;
	
	console.log(`Total queries: ${queries.length}`);
	console.log(`SQLite execution issues: ${sqliteIssues}`);
	console.log(`Real mismatches: ${mismatches}`);
	console.log(`All parameters match: ${allMatch}`);
	
	// Show queries with SQLite issues
	if (sqliteIssues > 0) {
		console.log(`\n⚠️  Queries with SQLite execution issues (parameters match but query fails):`);
		queries.filter(q => q.issue === 'SQLite query execution issue').slice(0, 5).forEach(q => {
			console.log(`   Claim ${q.claimNum} at ${q.timestamp}`);
		});
	}
}

