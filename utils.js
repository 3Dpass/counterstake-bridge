"use strict";
const mutex = require('ocore/mutex.js');
const db = require('ocore/db.js');
const { normalizeAddress } = require('./address_normalizer.js');

let watchedKeys = {};

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function die(msg) {
	throw Error(msg);
}

async function checkForDeadlock(key) {
	const t = setTimeout(die, 10 * 60 * 1000, `possible deadlock on ${key}`);
	const unlock = await mutex.lock(key);
	unlock();
	clearTimeout(t);
}

function watchForDeadlock(key) {
	if (watchedKeys[key])
		return console.log('already watching for deadlock on ' + key);
	watchedKeys[key] = true;
	setInterval(() => checkForDeadlock(key), 10 * 60 * 1000);
}

function getVersion(versions, aa) {
	// Normalize addresses for comparison (handles checksummed addresses from DB)
	// Use normalizeAddress to ensure EVM addresses are checksummed, Obyte addresses remain as-is
	const normalizedAa = aa ? normalizeAddress(aa, null) : aa;
	for (let v in versions) {
		const normalizedVersion = versions[v] ? normalizeAddress(versions[v], null) : versions[v];
		if (normalizedVersion === normalizedAa)
			return v;
	}
	return null;
}

async function asyncCallWithTimeout(asyncPromise, timeLimit = 60000) {
	let timeoutHandle;

	const timeoutPromise = new Promise((_resolve, reject) => {
		timeoutHandle = setTimeout(
			() => reject(new Error(`async call timeout limit ${timeLimit} reached`)),
			timeLimit
		);
	});

	return Promise.race([asyncPromise, timeoutPromise]).then(result => {
		clearTimeout(timeoutHandle);
		return result;
	});
}

function isRateLimitError(errMsg) {
	return (
		errMsg.includes("Your app has exceeded its compute units per second capacity")
		||
		errMsg.includes("rate-limit")
		||
		errMsg.includes("rate limit")
		||
		errMsg.includes("project ID request rate exceeded")
		||
		errMsg.includes("Too Many Requests")
		||
		errMsg.includes("Rate limited")
		||
		errMsg.includes("RequestRateLimitExceeded")
	);
}

async function getObyteAssistantsForEthAddress(ethAddress) {
	// Normalize EVM address before querying database (handles checksummed addresses from DB)
	const normalizedEthAddress = normalizeAddress(ethAddress, null);
	const rows = await db.query("SELECT DISTINCT aa FROM eth_addresses WHERE eth_address=?", [normalizedEthAddress]);
	return rows.map(r => r.aa);
}

async function getEthAddressForObyteAssistant(aa) {
	const rows = await db.query("SELECT eth_address FROM eth_addresses WHERE aa=?", [aa]);
	if (rows.length === 0)
		return null;
	// Normalize EVM address before returning (ensures checksummed format)
	const ethAddress = rows[0].eth_address;
	return normalizeAddress(ethAddress, null);
}

function h160ToH256(h160Address) {
	const addressBytes = Buffer.from(h160Address.slice(2), 'hex');
	const h256Address = Buffer.concat([Buffer.alloc(12), addressBytes]).toString('hex');
	return '0x' + h256Address;
}

exports.asyncCallWithTimeout = asyncCallWithTimeout;
exports.wait = wait;
exports.watchForDeadlock = watchForDeadlock;
exports.getVersion = getVersion;
exports.isRateLimitError = isRateLimitError;
exports.getObyteAssistantsForEthAddress = getObyteAssistantsForEthAddress;
exports.getEthAddressForObyteAssistant = getEthAddressForObyteAssistant;
exports.h160ToH256 = h160ToH256;
