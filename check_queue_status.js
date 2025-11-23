#!/usr/bin/env node
/**
 * Check Queue Status
 * 
 * Parses the log file to show current queue status for Obyte and other networks
 */

const fs = require('fs');
const path = require('path');

const logPath = path.join(process.env.HOME || process.env.USERPROFILE, 'Library/Application Support/counterstake-bridge/log.txt');

function checkQueueStatus() {
    try {
        if (!fs.existsSync(logPath)) {
            console.log('❌ Log file not found at:', logPath);
            return;
        }

        // Read last 5000 lines of log (to ensure we catch queue status)
        const logContent = fs.readFileSync(logPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        const recentLines = lines.slice(-5000);

        // Find the most recent "queued jobs" line
        let lastQueueLine = null;
        for (let i = recentLines.length - 1; i >= 0; i--) {
            if (recentLines[i].includes('queued jobs:')) {
                lastQueueLine = recentLines[i];
                break;
            }
        }

        if (!lastQueueLine) {
            console.log('⚠️  No queue status found in recent logs');
            return;
        }

        // Extract timestamp
        const timestampMatch = lastQueueLine.match(/^(\d{4}-\d{2}-\d{2}T[\d:\.]+Z):/);
        const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

        // Parse queue data - extract JSON arrays
        // Find the position of "queued jobs:" and "locked keys:" to extract the JSON between them
        const queueStart = lastQueueLine.indexOf('queued jobs:');
        const lockedStart = lastQueueLine.indexOf('locked keys:');
        
        let queueMatch = null;
        let lockedMatch = null;
        
        if (queueStart !== -1) {
            const queueStr = lockedStart !== -1 
                ? lastQueueLine.substring(queueStart + 'queued jobs:'.length, lockedStart).trim()
                : lastQueueLine.substring(queueStart + 'queued jobs:'.length).trim();
            // Remove trailing comma if present
            const cleanQueueStr = queueStr.replace(/,\s*$/, '');
            queueMatch = { 1: cleanQueueStr };
        }
        
        if (lockedStart !== -1) {
            const lockedStr = lastQueueLine.substring(lockedStart + 'locked keys:'.length).trim();
            lockedMatch = { 1: lockedStr };
        }

        console.log('📊 Queue Status (as of ' + timestamp + '):');
        console.log('');

        if (queueMatch) {
            try {
                // Try to parse the JSON array
                let queueStr = queueMatch[1];
                // If it looks truncated, try to count manually
                if (!queueStr.endsWith(']')) {
                    // Count occurrences of ["Obyte"], ["Ethereum"], etc.
                    const jobMatches = queueStr.match(/\["([^"]+)"\]/g);
                    if (jobMatches) {
                        const jobCounts = {};
                        jobMatches.forEach(match => {
                            const networkMatch = match.match(/"([^"]+)"/);
                            if (networkMatch) {
                                const network = networkMatch[1];
                                jobCounts[network] = (jobCounts[network] || 0) + 1;
                            }
                        });
                        console.log('Queued Jobs:');
                        console.log(`   Total: ${jobMatches.length}+ jobs (may be truncated)`);
                        Object.entries(jobCounts).forEach(([network, count]) => {
                            console.log(`   - ${network}: ${count} job(s)`);
                        });
                    } else {
                        console.log('Queued Jobs:');
                        console.log('   Raw:', queueStr.substring(0, 200) + (queueStr.length > 200 ? '...' : ''));
                    }
                } else {
                    const queuedJobs = JSON.parse(queueStr);
                    const jobCounts = {};
                    queuedJobs.forEach(job => {
                        const key = job[0] || 'unknown';
                        jobCounts[key] = (jobCounts[key] || 0) + 1;
                    });

                    console.log('Queued Jobs:');
                    if (queuedJobs.length === 0) {
                        console.log('   ✅ No jobs queued');
                    } else {
                        console.log(`   Total: ${queuedJobs.length} jobs`);
                        Object.entries(jobCounts).forEach(([network, count]) => {
                            console.log(`   - ${network}: ${count} job(s)`);
                        });
                    }
                }
            } catch (e) {
                console.log('Queued Jobs:');
                console.log('   ⚠️  Could not parse:', queueMatch[1].substring(0, 100));
            }
        } else {
            console.log('Queued Jobs:');
            console.log('   ⚠️  Not found in log line');
        }

        if (lockedMatch) {
            try {
                let lockStr = lockedMatch[1];
                if (!lockStr.endsWith(']')) {
                    // Count manually
                    const lockMatches = lockStr.match(/\["([^"]+)"\]/g);
                    if (lockMatches) {
                        console.log('');
                        console.log('Locked Keys:');
                        lockMatches.forEach(match => {
                            const keyMatch = match.match(/"([^"]+)"/);
                            if (keyMatch) {
                                console.log(`   - ${keyMatch[1]}`);
                            }
                        });
                    }
                } else {
                    const lockedKeys = JSON.parse(lockStr);
                    console.log('');
                    console.log('Locked Keys:');
                    if (lockedKeys.length === 0) {
                        console.log('   ✅ No locks held');
                    } else {
                        lockedKeys.forEach(lock => {
                            const key = lock[0] || 'unknown';
                            console.log(`   - ${key}`);
                        });
                    }
                }
            } catch (e) {
                console.log('');
                console.log('Locked Keys:');
                console.log('   ⚠️  Could not parse');
            }
        }

        console.log('');

    } catch (error) {
        console.error('Error checking queue status:', error.message);
    }
}

checkQueueStatus();

