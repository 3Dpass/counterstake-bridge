"use strict";
const mutex = require('ocore/mutex.js');
const db = require('ocore/db.js');

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
	for (let v in versions)
		if (versions[v] === aa)
			return v;
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
	const rows = await db.query("SELECT DISTINCT aa FROM eth_addresses WHERE eth_address=?", [ethAddress]);
	return rows.map(r => r.aa);
}

async function getEthAddressForObyteAssistant(aa) {
	const rows = await db.query("SELECT eth_address FROM eth_addresses WHERE aa=?", [aa]);
	if (rows.length === 0)
		return null;
	return rows[0].eth_address;
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
