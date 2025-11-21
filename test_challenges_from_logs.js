/*jslint node: true */
"use strict";

/**
 * Test script to parse challenge events from logs and match them against claims in database
 * Helps understand why challenges aren't being stored in the database
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('ocore/db.js');

function getLogPath() {
	// Check environment variable first
	if (process.env.COUNTERSTAKE_LOG_PATH) {
		return process.env.COUNTERSTAKE_LOG_PATH;
	}

	// Check command line argument
	const args = process.argv.slice(2);
	const logIndex = args.indexOf('--log');
	if (logIndex !== -1 && args[logIndex + 1]) {
		return args[logIndex + 1];
	}

	// Platform-specific default paths
	const platform = os.platform();
	switch (platform) {
		case 'darwin': // macOS
			return path.join(os.homedir(), 'Library', 'Application Support', 'counterstake-bridge', 'log.txt');
		case 'win32': // Windows
			return path.join(process.env.APPDATA || '', 'counterstake-bridge', 'log.txt');
		default: // Linux and others
			return path.join(os.homedir(), '.local', 'share', 'counterstake-bridge', 'log.txt');
	}
}

// Parse challenge events from logs
function parseChallengeEvents(logContent) {
	const lines = logContent.split('\n');
	const challenges = [];
	
	// Patterns to match:
	// 1. "got challenge ... for "yes"/"no" ..." (Obyte)
	// 2. "handling challenge of claim X with "yes"/"no" in tx ..." (transfers.js)
	// 3. "NewChallenge event ..." (EVM chains)
	// 4. "claim challenged in trigger ... null" or "claim challenged in trigger ... {claim object}"
	// 5. "ongoing claim X challenged in ... not found, will skip"
	// 6. "claim X challenged in ... is not known yet, will retry"
	
	let currentChallenge = null;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):/);
		const timestamp = timestampMatch ? timestampMatch[1] : null;
		
		// Pattern 1: Obyte challenge (from obyte.js)
		// "got challenge ... for "yes"/"no" that didn't change the outcome" or "that changed the outcome"
		const obyteChallengeMatch = line.match(/got challenge\s+([^\s]+)\s+for\s+"(yes|no)"\s+that\s+(didn't change|changed)\s+the\s+outcome/);
		if (obyteChallengeMatch) {
			currentChallenge = {
				challenge_txid: obyteChallengeMatch[1],
				stake_on: obyteChallengeMatch[2],
				outcome_changed: obyteChallengeMatch[3] === 'changed',
				timestamp: timestamp,
				line: i + 1,
				source: 'Obyte'
			};
		}
		
		// Pattern 2: "handling challenge of claim X with "yes"/"no" in tx ..."
		const handlingMatch = line.match(/handling challenge of claim\s+(\d+)\s+with\s+"(yes|no)"\s+in\s+tx\s+([^\s]+)/);
		if (handlingMatch) {
			const claim_num = parseInt(handlingMatch[1], 10);
			const challenge_txid = handlingMatch[3];
			
			// Check if this is a retry by looking for existing challenge with same txid
			let existingChallenge = challenges.find(ch => ch.challenge_txid === challenge_txid);
			
			if (!currentChallenge && !existingChallenge) {
				// New challenge - try to find source by looking backwards in log
				// Look for "got challenge" or "NewChallenge event" with same txid
				let foundSource = false;
				for (let j = i - 1; j >= Math.max(0, i - 100); j--) {
					const prevLine = lines[j];
					
					// Check for Obyte "got challenge" with matching txid
					if (prevLine.includes(challenge_txid) && prevLine.match(/got challenge\s+([^\s]+)\s+for/)) {
						currentChallenge = {
							timestamp: timestamp,
							line: i + 1,
							source: 'Obyte',
							is_retry: true
						};
						foundSource = true;
						break;
					}
					
					// Check for EVM "NewChallenge event" - need to look for transactionHash in following lines
					if (prevLine.match(/NewChallenge event/)) {
						// Look ahead for transactionHash (usually within next 20-25 lines)
						for (let k = j + 1; k < Math.min(lines.length, j + 30); k++) {
							const nextLine = lines[k];
							const txHashMatch = nextLine.match(/transactionHash:\s+['"](0x[a-fA-F0-9]+)['"]/);
							if (txHashMatch) {
								const txHash = txHashMatch[1].toLowerCase();
								if (txHash === challenge_txid.toLowerCase()) {
									currentChallenge = {
										timestamp: timestamp,
										line: i + 1,
										source: 'EVM',
										is_retry: true
									};
									foundSource = true;
									break;
								}
							}
							// Stop if we hit another log entry (timestamp pattern)
							if (nextLine.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z:/)) {
								break;
							}
						}
						if (foundSource) break;
					}
				}
				
				if (!foundSource) {
					// No source found - could be a retry or standalone
					currentChallenge = {
						timestamp: timestamp,
						line: i + 1,
						source: 'Unknown (possibly retry)'
					};
				}
			} else if (existingChallenge) {
				// This is a retry of an existing challenge
				existingChallenge.retry_count = (existingChallenge.retry_count || 0) + 1;
				existingChallenge.last_retry_timestamp = timestamp;
				existingChallenge.last_retry_line = i + 1;
				currentChallenge = existingChallenge; // Use existing for context
			}
			
			if (currentChallenge) {
				currentChallenge.claim_num = claim_num;
				currentChallenge.stake_on = handlingMatch[2];
				currentChallenge.challenge_txid = challenge_txid;
			}
		}
		
		// Pattern 3: "NewChallenge event" (EVM chains)
		// Format: "NewChallenge event {network} {claim_num} {author_address} {stake} {outcome} {current_outcome} ..."
		// The event object spans multiple lines, and transactionHash is in the object
		const newChallengeMatch = line.match(/NewChallenge event\s+(\w+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+(\w+)\s+(\w+)/);
		if (newChallengeMatch) {
			// Look ahead for transactionHash in the event object (usually within next 20 lines)
			let transactionHash = null;
			for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
				const nextLine = lines[j];
				const txHashMatch = nextLine.match(/transactionHash:\s+['"](0x[a-fA-F0-9]+)['"]/);
				if (txHashMatch) {
					transactionHash = txHashMatch[1];
					break;
				}
			}
			
			currentChallenge = {
				network: newChallengeMatch[1],
				claim_num: parseInt(newChallengeMatch[2], 10),
				author_address: newChallengeMatch[3],
				stake: newChallengeMatch[4],
				outcome: newChallengeMatch[5],
				current_outcome: newChallengeMatch[6],
				challenge_txid: transactionHash,
				timestamp: timestamp,
				line: i + 1,
				source: 'EVM'
			};
			// Convert boolean outcome to "yes"/"no"
			currentChallenge.stake_on = newChallengeMatch[5] === 'true' ? 'yes' : 'no';
		}
		
		// Pattern 4: "claim challenged in trigger ... null" or with claim object
		const claimChallengedMatch = line.match(/claim challenged in trigger\s+([^\s]+)\s+(null|{.*})/);
		if (claimChallengedMatch && currentChallenge) {
			currentChallenge.claim_found_on_chain = claimChallengedMatch[2] !== 'null';
			currentChallenge.claim_object = claimChallengedMatch[2] !== 'null' ? claimChallengedMatch[2] : null;
			// If claim is null on-chain, this is why challenge wasn't saved
			if (claimChallengedMatch[2] === 'null') {
				currentChallenge.skipped_reason = 'claim_finished_on_chain';
			}
		}
		
		// Pattern 5: "ongoing claim X challenged in ... not found, will skip"
		const notFoundMatch = line.match(/ongoing claim\s+(\d+)\s+challenged in\s+([^\s]+)\s+not found, will skip/);
		if (notFoundMatch && currentChallenge) {
			currentChallenge.claim_not_found = true;
			currentChallenge.claim_num = parseInt(notFoundMatch[1], 10);
			currentChallenge.challenge_txid = notFoundMatch[2];
			// Save this challenge and reset
			challenges.push(currentChallenge);
			currentChallenge = null;
		}
		
		// Pattern 6: "claim X challenged in ... is not known yet, will retry"
		const retryMatch = line.match(/claim\s+(\d+)\s+challenged in\s+([^\s]+)\s+is not known yet, will retry/);
		if (retryMatch && currentChallenge) {
			currentChallenge.claim_not_known = true;
			currentChallenge.claim_num = parseInt(retryMatch[1], 10);
			currentChallenge.challenge_txid = retryMatch[2];
			// Save this challenge and reset
			challenges.push(currentChallenge);
			currentChallenge = null;
		}
		
		// Pattern 7: Extract bridge_id and type if available
		// Look for context around the challenge
		if (currentChallenge && !currentChallenge.bridge_id) {
			const bridgeMatch = line.match(/bridge\s+(\d+)/);
			if (bridgeMatch) {
				currentChallenge.bridge_id = parseInt(bridgeMatch[1], 10);
			}
			const typeMatch = line.match(/\b(expatriation|repatriation)\b/);
			if (typeMatch) {
				currentChallenge.type = typeMatch[1];
			}
		}
		
		// Pattern 8: Extract valid_outcome from log messages
		// "valid outcome yes/no, current outcome yes/no"
		const validOutcomeMatch = line.match(/valid outcome\s+(yes|no),?\s+current outcome\s+(yes|no)/);
		if (validOutcomeMatch && currentChallenge) {
			currentChallenge.valid_outcome_from_log = validOutcomeMatch[1];
			currentChallenge.current_outcome_from_log = validOutcomeMatch[2];
		}
		
		// Pattern 9: Extract valid_outcome from notification messages
		// "staked ... on 'yes' valid outcome yes, current outcome no"
		const validOutcomeMatch2 = line.match(/staked.*on\s+['"](yes|no)['"].*valid outcome\s+(yes|no),?\s+current outcome\s+(yes|no)/);
		if (validOutcomeMatch2 && currentChallenge) {
			currentChallenge.stake_on_from_log = validOutcomeMatch2[1];
			currentChallenge.valid_outcome_from_log = validOutcomeMatch2[2];
			currentChallenge.current_outcome_from_log = validOutcomeMatch2[3];
		}
	}
	
	// If we have a current challenge that wasn't saved, save it
	if (currentChallenge && currentChallenge.claim_num) {
		// Check if we already have this challenge (by challenge_txid) - could be a retry
		// Use case-insensitive comparison for hex addresses
		const existing = challenges.find(ch => {
			if (!ch.challenge_txid || !currentChallenge.challenge_txid) return false;
			return ch.challenge_txid.toLowerCase() === currentChallenge.challenge_txid.toLowerCase();
		});
		if (!existing) {
			challenges.push(currentChallenge);
		} else {
			// Update existing with retry info
			existing.retry_count = (existing.retry_count || 0) + 1;
			existing.last_retry_timestamp = currentChallenge.timestamp;
			existing.last_retry_line = currentChallenge.line;
			// If source was unknown, try to inherit from existing
			if (currentChallenge.source && currentChallenge.source.includes('Unknown') && existing.source && !existing.source.includes('Unknown')) {
				currentChallenge.source = existing.source;
			}
		}
	}
	
	// Deduplicate challenges by challenge_txid (case-insensitive for hex addresses)
	const uniqueChallenges = [];
	const seenTxids = new Set();
	
	for (const challenge of challenges) {
		if (!challenge.challenge_txid) continue;
		const txidKey = challenge.challenge_txid.toLowerCase();
		if (!seenTxids.has(txidKey)) {
			seenTxids.add(txidKey);
			uniqueChallenges.push(challenge);
		} else {
			// This is a duplicate - update the existing one with retry info
			const existing = uniqueChallenges.find(ch => ch.challenge_txid.toLowerCase() === txidKey);
			if (existing) {
				existing.retry_count = (existing.retry_count || 0) + 1;
				if (challenge.timestamp && (!existing.last_retry_timestamp || challenge.timestamp > existing.last_retry_timestamp)) {
					existing.last_retry_timestamp = challenge.timestamp;
					existing.last_retry_line = challenge.line;
				}
			}
		}
	}
	
	return uniqueChallenges;
}

async function testChallengesFromLogs() {
	console.log('='.repeat(70));
	console.log('TESTING CHALLENGES FROM LOGS VS CLAIMS IN DATABASE');
	console.log('='.repeat(70));
	console.log('');
	
	const logPath = getLogPath();
	
	if (!fs.existsSync(logPath)) {
		console.log(`❌ Log file not found: ${logPath}`);
		console.log(`   Please provide log path via:`);
		console.log(`   - Environment variable: COUNTERSTAKE_LOG_PATH=/path/to/log.txt`);
		console.log(`   - Command line: --log /path/to/log.txt`);
		return;
	}
	
	console.log(`📄 Reading log file: ${logPath}`);
	const logContent = fs.readFileSync(logPath, 'utf8');
	const lines = logContent.split('\n');
	console.log(`📊 Total lines: ${lines.length}`);
	console.log('');
	
	// Parse challenge events
	console.log('🔍 Parsing challenge events from logs...');
	const challenges = parseChallengeEvents(logContent);
	console.log(`   Found ${challenges.length} challenge events\n`);
	
	if (challenges.length === 0) {
		console.log('⚠️  No challenge events found in logs');
		console.log('   Looking for patterns like:');
		console.log('   - "handling challenge of claim X"');
		console.log('   - "NewChallenge event"');
		console.log('   - "got challenge ... for "yes"/"no""');
		return;
	}
	
	// Get all bridges for lookup
	const bridges = await db.query("SELECT * FROM bridges ORDER BY bridge_id");
	const bridgeMap = {};
	for (const bridge of bridges) {
		bridgeMap[bridge.bridge_id] = bridge;
	}
	
	// Helper function to get valid outcome (same as getValidOutcome in transfers.js)
	async function getValidOutcome(claim_num, bridge_id, type) {
		const [db_claim] = await db.query("SELECT * FROM claims WHERE claim_num=? AND bridge_id=? AND type=?", [claim_num, bridge_id, type]);
		if (!db_claim) {
			return null;
		}
		return db_claim.transfer_id ? 'yes' : 'no';
	}
	
	// Get all challenges from database
	const dbChallenges = await db.query(`
		SELECT challenge_id, claim_num, bridge_id, type, address, stake_on, stake, challenge_txid
		FROM challenges
		ORDER BY bridge_id, claim_num
	`);
	const dbChallengeMap = {};
	for (const ch of dbChallenges) {
		const key = `${ch.bridge_id}-${ch.claim_num}-${ch.type}-${ch.challenge_txid}`;
		dbChallengeMap[key] = ch;
	}
	
	console.log(`📊 Database has ${dbChallenges.length} challenges stored\n`);
	
	// Analyze each challenge from logs
	let foundInDbCount = 0;
	let claimFoundCount = 0;
	let claimNotFoundCount = 0;
	let claimNotKnownCount = 0;
	let missingBridgeInfoCount = 0;
	let claimFinishedOnChainCount = 0;
	const details = [];
	
	for (const challenge of challenges) {
		// Try to find the claim in database
		let claim = null;
		let bridge = null;
		
		// If we have bridge_id and type, use them
		if (challenge.bridge_id && challenge.type) {
			bridge = bridgeMap[challenge.bridge_id];
			const claims = await db.query(`
				SELECT claim_num, bridge_id, type, transfer_id, txid, txts, sender_address, dest_address
				FROM claims
				WHERE claim_num=? AND bridge_id=? AND type=?
			`, [challenge.claim_num, challenge.bridge_id, challenge.type]);
			if (claims.length > 0) {
				claim = claims[0];
			}
		} else {
			// Try to find by claim_num across all bridges
			const claims = await db.query(`
				SELECT claim_num, bridge_id, type, transfer_id, txid, txts, sender_address, dest_address
				FROM claims
				WHERE claim_num=?
			`, [challenge.claim_num]);
			if (claims.length > 0) {
				claim = claims[0];
				bridge = bridgeMap[claim.bridge_id];
				challenge.bridge_id = claim.bridge_id;
				challenge.type = claim.type;
			}
		}
		
		// Check if challenge exists in database
		let dbChallenge = null;
		if (challenge.bridge_id && challenge.type && challenge.challenge_txid) {
			const key = `${challenge.bridge_id}-${challenge.claim_num}-${challenge.type}-${challenge.challenge_txid}`;
			dbChallenge = dbChallengeMap[key];
		}
		
		// Calculate valid_outcome using getValidOutcome logic
		let valid_outcome = null;
		if (challenge.bridge_id && challenge.type && challenge.claim_num) {
			valid_outcome = await getValidOutcome(challenge.claim_num, challenge.bridge_id, challenge.type);
		} else if (claim) {
			valid_outcome = claim.transfer_id ? 'yes' : 'no';
		}
		
		// Categorize
		if (dbChallenge) {
			foundInDbCount++;
		}
		
		if (claim) {
			claimFoundCount++;
		} else {
			if (challenge.claim_not_found) {
				claimNotFoundCount++;
			} else if (challenge.claim_not_known) {
				claimNotKnownCount++;
			}
		}
		
		if (!challenge.bridge_id || !challenge.type) {
			missingBridgeInfoCount++;
		}
		
		if (challenge.skipped_reason === 'claim_finished_on_chain') {
			claimFinishedOnChainCount++;
		}
		
		details.push({
			challenge: challenge,
			claim: claim,
			dbChallenge: dbChallenge,
			bridge: bridge,
			valid_outcome: valid_outcome
		});
	}
	
	// Print summary
	// Count by valid_outcome
	const outcomeStats = {
		null: 0,
		yes: 0,
		no: 0
	};
	for (const d of details) {
		if (d.valid_outcome === null) {
			outcomeStats.null++;
		} else if (d.valid_outcome === 'yes') {
			outcomeStats.yes++;
		} else if (d.valid_outcome === 'no') {
			outcomeStats.no++;
		}
	}
	
	console.log('='.repeat(70));
	console.log('SUMMARY:');
	console.log(`  Total challenges in logs: ${challenges.length}`);
	console.log(`  Challenges found in database: ${foundInDbCount}`);
	console.log(`  Challenges NOT in database: ${challenges.length - foundInDbCount}`);
	console.log('');
	console.log(`  Claims found in database: ${claimFoundCount}`);
	console.log(`  Claims NOT found (not found): ${claimNotFoundCount}`);
	console.log(`  Claims NOT found (not known yet): ${claimNotKnownCount}`);
	console.log(`  Missing bridge/type info: ${missingBridgeInfoCount}`);
	console.log('');
	console.log(`  getValidOutcome() results:`);
	console.log(`    null (claim not in DB): ${outcomeStats.null}`);
	console.log(`    'yes' (claim has transfer_id): ${outcomeStats.yes}`);
	console.log(`    'no' (claim has no transfer_id): ${outcomeStats.no}`);
	console.log('');
	console.log(`  Challenges skipped because claim finished on-chain: ${claimFinishedOnChainCount}`);
	console.log(`    (api.getClaim() returned null, challenge skipped before INSERT)`);
	console.log('='.repeat(70));
	console.log('');
	
	// Print details for challenges not in database
	const notInDb = details.filter(d => !d.dbChallenge);
	if (notInDb.length > 0) {
		console.log(`\n📋 DETAILS: ${notInDb.length} challenges NOT in database:\n`);
		
		for (let i = 0; i < Math.min(notInDb.length, 30); i++) {
			const d = notInDb[i];
			const ch = d.challenge;
			console.log(`${i + 1}. Challenge for claim ${ch.claim_num || '?'} (tx: ${ch.challenge_txid || '?'})`);
			if (ch.retry_count && ch.retry_count > 0) {
				console.log(`   🔄 Retry count: ${ch.retry_count} (processed ${ch.retry_count + 1} times total)`);
				if (ch.last_retry_timestamp) {
					console.log(`   Last retry: ${ch.last_retry_timestamp} (line ${ch.last_retry_line})`);
				}
			}
			console.log(`   Source: ${ch.source || 'Unknown'}`);
			console.log(`   Stake on: ${ch.stake_on || '?'}`);
			console.log(`   Timestamp: ${ch.timestamp || '?'}`);
			console.log(`   Line: ${ch.line || '?'}`);
			
			if (ch.bridge_id && ch.type) {
				console.log(`   Bridge: ${ch.bridge_id}, Type: ${ch.type}`);
			} else {
				console.log(`   ⚠️  Missing bridge_id or type`);
			}
			
			if (d.claim) {
				console.log(`   ✅ Claim found in DB: bridge_id=${d.claim.bridge_id}, type=${d.claim.type}, transfer_id=${d.claim.transfer_id || 'NULL'}`);
			} else {
				if (ch.claim_not_found) {
					console.log(`   ❌ Claim NOT found in DB (was null when challenge processed)`);
				} else if (ch.claim_not_known) {
					console.log(`   ⏳ Claim NOT known yet (would retry)`);
				} else {
					console.log(`   ❓ Claim status unknown`);
				}
			}
			
			// Show getValidOutcome result
			if (d.valid_outcome === null) {
				console.log(`   ⚠️  getValidOutcome() = null (claim not in database)`);
			} else {
				console.log(`   📊 getValidOutcome() = '${d.valid_outcome}' (${d.valid_outcome === 'yes' ? 'claim has transfer_id' : 'claim has no transfer_id'})`);
			}
			
			// Show valid_outcome from log if available
			if (ch.valid_outcome_from_log) {
				console.log(`   📝 From log: valid_outcome='${ch.valid_outcome_from_log}', current_outcome='${ch.current_outcome_from_log || '?'}'`);
				if (d.valid_outcome && d.valid_outcome !== ch.valid_outcome_from_log) {
					console.log(`   ⚠️  MISMATCH: DB says '${d.valid_outcome}' but log says '${ch.valid_outcome_from_log}'`);
				}
			}
			
			// Show why challenge wasn't saved
			if (ch.skipped_reason === 'claim_finished_on_chain') {
				console.log(`   ⚠️  Claim finished on-chain (api.getClaim() returned null)`);
				console.log(`   💡 Reason: Challenge skipped because claim is finished/withdrawn on-chain`);
				console.log(`   📝 Note: Claim exists in DB but not on-chain, so challenge was skipped before INSERT`);
			}
			
			if (d.dbChallenge) {
				console.log(`   ✅ Challenge found in DB: challenge_id=${d.dbChallenge.challenge_id}`);
			} else {
				console.log(`   ❌ Challenge NOT in DB`);
				if (d.valid_outcome === null) {
					console.log(`   💡 Reason: getValidOutcome() returned null, so challenge was skipped/retried`);
				} else if (ch.skipped_reason === 'claim_finished_on_chain') {
					console.log(`   💡 Reason: Claim finished on-chain, challenge skipped before INSERT (line 1008)`);
				} else if (d.claim && !d.dbChallenge) {
					console.log(`   💡 Reason: Claim exists but challenge not stored (may have been skipped for other reasons)`);
				}
			}
			
			console.log('');
		}
		
		if (notInDb.length > 30) {
			console.log(`   ... and ${notInDb.length - 30} more\n`);
		}
	}
	
	// Print statistics
	console.log('\n📊 BREAKDOWN BY STATUS:\n');
	
	const stats = {
		'Claim found, Challenge in DB': 0,
		'Claim found, Challenge NOT in DB': 0,
		'Claim NOT found, Challenge NOT in DB': 0,
		'Claim NOT known, Challenge NOT in DB': 0,
		'Missing bridge info': 0
	};
	
	for (const d of details) {
		if (!d.challenge.bridge_id || !d.challenge.type) {
			stats['Missing bridge info']++;
		} else if (d.claim && d.dbChallenge) {
			stats['Claim found, Challenge in DB']++;
		} else if (d.claim && !d.dbChallenge) {
			stats['Claim found, Challenge NOT in DB']++;
		} else if (d.challenge.claim_not_found) {
			stats['Claim NOT found, Challenge NOT in DB']++;
		} else if (d.challenge.claim_not_known) {
			stats['Claim NOT known, Challenge NOT in DB']++;
		}
	}
	
	for (const [status, count] of Object.entries(stats)) {
		if (count > 0) {
			console.log(`  ${status}: ${count}`);
		}
	}
	console.log('');
}

async function main() {
	try {
		await testChallengesFromLogs();
	} catch (error) {
		console.error('Error:', error);
		console.error(error.stack);
		process.exit(1);
	}
	process.exit(0);
}

main();

