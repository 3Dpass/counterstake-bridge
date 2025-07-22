const { request } = require('./request.js');
const { wait } = require('./utils.js');
const { h160ToH256 } = require("./utils.js");
const { encodeAddress } = require('@polkadot/util-crypto');

const threedpass_base_url = process.env.testnet ? 'https://api-testnet.3dpscan.xyz' : 'https://api.3dpscan.xyz';
let last_req_ts = 0;

async function getAddressBlocks({ address, startblock, count = 0 }) {
	try {
		const h256Address = h160ToH256(address);
		const prefix = process.env.testnet ? 72 : 71;
		const ss58Address = encodeAddress(h256Address, prefix);
		let page = 0;
		const page_size = 100;
		let all_blocks = [];
		while (true) {
			const passed = Date.now() - last_req_ts;
			if (passed < 1000) {
				console.log(`will wait for ${1000 - passed} ms between 3dpscan requests`);
				await wait(1000 - passed);
			}
			const url = `${threedpass_base_url}/accounts/${ss58Address}/transfers?page=${page}&page_size=${page_size}`;
			const resp = await request(url);
			last_req_ts = Date.now();
			if (!resp.items) {
				if (resp.total === 0 && resp.page === 0) { // no transactions for this address
					break;
				}
				throw Error(`no items from 3dpscan for ${ss58Address}: ${JSON.stringify(resp)}`);
			}
			const blocks = resp.items.map(item => item.indexer.blockHeight);
			all_blocks.push(...blocks);
			if (resp.items.length < page_size || (startblock && blocks.length > 0 && Math.min(...blocks) < startblock))
				break;
			if (resp.items.length === 0) // no more items
				break;
			page++;
		}
		let unique_blocks = [...new Set(all_blocks)];
		if (startblock)
			unique_blocks = unique_blocks.filter(b => b >= startblock);
		unique_blocks.sort((a, b) => a - b);
		return unique_blocks;
	}
	catch (e) {
		console.log(`getAddressBlocks from 3dpscan failed`, e);
		if (count > 5)
			throw e;
		console.log(`will retry getAddressBlocks from 3dpscan in 60 sec`);
		await wait(60 * 1000);
		count++;
		return await getAddressBlocks({ address, startblock, count });
	}
}

exports.getAddressBlocks = getAddressBlocks; 