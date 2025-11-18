/*jslint node: true */
"use strict";

const fs = require('fs');
const path = require('path');
const os = require('os');

function getLogPath() {
	const platform = os.platform();
	const homeDir = os.homedir();
	
	switch (platform) {
		case 'darwin': // macOS
			return path.join(homeDir, 'Library', 'Application Support', 'counterstake-bridge', 'log.txt');
		case 'win32': // Windows
			return path.join(homeDir, 'AppData', 'Roaming', 'counterstake-bridge', 'log.txt');
		case 'linux': // Linux
			return path.join(homeDir, '.local', 'share', 'counterstake-bridge', 'log.txt');
		default:
			return path.join(process.cwd(), 'log.txt');
	}
}

async function checkChallengeLogs() {
	console.log('='.repeat(70));
	console.log('CHECKING CHALLENGE LOGS FOR getValidOutcome NULL RETURNS');
	console.log('='.repeat(70));
	console.log('');

	const logPath = getLogPath();
	
	if (!fs.existsSync(logPath)) {
		console.log(`❌ Log file not found: ${logPath}`);
		return;
	}

	const logContent = fs.readFileSync(logPath, 'utf8');
	const lines = logContent.split('\n');

	console.log(`📄 Log file: ${logPath}`);
	console.log(`📊 Total lines: ${lines.length}`);
	console.log('');

	// Search for challenge-related messages
	const challengeMessages = [];
	const nullReturnMessages = [];
	const retryMessages = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lowerLine = line.toLowerCase();
		
		if (lowerLine.includes('newchallenge') || lowerLine.includes('handling challenge')) {
			challengeMessages.push({ line: i + 1, content: line });
		}
		
		if (lowerLine.includes('is not known yet') || lowerLine.includes('will retry')) {
			if (lowerLine.includes('challenge') || lowerLine.includes('claim')) {
				nullReturnMessages.push({ line: i + 1, content: line });
			}
		}
		
		if (lowerLine.includes('challenged in') && lowerLine.includes('not known')) {
			retryMessages.push({ line: i + 1, content: line });
		}
	}

	console.log('🔍 CHALLENGE PROCESSING MESSAGES:');
	if (challengeMessages.length > 0) {
		console.log(`Found ${challengeMessages.length} challenge-related messages:`);
		challengeMessages.slice(-20).forEach(msg => {
			console.log(`  Line ${msg.line}: ${msg.content.substring(0, 150)}`);
		});
	} else {
		console.log('  ⚠️  No challenge processing messages found');
	}
	console.log('');

	console.log('❌ NULL RETURN MESSAGES (getValidOutcome returned null):');
	if (nullReturnMessages.length > 0) {
		console.log(`Found ${nullReturnMessages.length} messages indicating getValidOutcome returned null:`);
		nullReturnMessages.forEach(msg => {
			console.log(`  Line ${msg.line}: ${msg.content}`);
		});
	} else {
		console.log('  ✅ No null return messages found (or challenges not processed yet)');
	}
	console.log('');

	console.log('🔄 RETRY MESSAGES (challenges retrying due to null):');
	if (retryMessages.length > 0) {
		console.log(`Found ${retryMessages.length} retry messages:`);
		retryMessages.forEach(msg => {
			console.log(`  Line ${msg.line}: ${msg.content}`);
		});
	} else {
		console.log('  ✅ No retry messages found');
	}
	console.log('');

	// Extract claim numbers from retry messages
	if (retryMessages.length > 0) {
		console.log('📋 CLAIMS THAT RETURNED NULL:');
		const claimNums = new Set();
		retryMessages.forEach(msg => {
			const match = msg.content.match(/claim\s+(\d+)/i);
			if (match) {
				claimNums.add(match[1]);
			}
		});
		if (claimNums.size > 0) {
			console.log(`  Claims: ${Array.from(claimNums).join(', ')}`);
		}
	}
}

checkChallengeLogs().catch(console.error);

