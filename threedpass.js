"use strict";
const conf = require('ocore/conf.js');
const EvmChain = require('./evm-chain.js');
const { getProvider } = require("./evm/provider.js");
const { getAddressBlocks } = require("./3dpscan.js");

let bCreated = false;

class ThreeDPass extends EvmChain {

	constructor() {
		if (bCreated)
			throw Error("ThreeDPass class already created, must be a singleton");
		bCreated = true;
		
		const provider = getProvider('3DPass');
		super('3DPass', conf.threedpass_factory_contract_addresses, conf.threedpass_assistant_factory_contract_addresses, provider);
	}

	forget() {
		console.log(`removing ${this.getProvider().listenerCount()} listeners on ${this.network}`);
		this.getProvider().removeAllListeners();
		bCreated = false;
	}

	getNativeSymbol() {
		return 'P3D';
	}

	getMaxBlockRange() {
		return 1000;
	}

	async getAddressBlocks(address, startblock) {
		return await getAddressBlocks({ address, startblock });
	}

}

module.exports = ThreeDPass; 