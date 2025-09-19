"use strict";
const conf = require('ocore/conf.js');
const EvmChain = require('./evm-chain.js');
const { getProvider } = require("./evm/provider.js");
const { getAddressBlocks, getAddressTransactionBlocks } = require("./3dpscan.js");
const { ethers } = require("ethers");
const { wait } = require('./utils.js');

// 3DPass-specific ABI imports from evm_substrate
const exportJson = require('./evm_substrate/build/contracts/Export.json');
const importWrapperJson = require('./evm_substrate/build/contracts/ImportWrapper.json');
const factoryJson = require('./evm_substrate/build/contracts/CounterstakeFactory.json');

const exportAssistantJson = require('./evm_substrate/build/contracts/ExportAssistant.json');
const importWrapperAssistantJson = require('./evm_substrate/build/contracts/ImportWrapperAssistant.json');
const assistantFactoryJson = require('./evm_substrate/build/contracts/AssistantFactory.json');

// 3DPass precompile interfaces
const ip3dJson = require('./evm_substrate/build/contracts/IP3D.json');
const iprecompileErc20Json = require('./evm_substrate/build/contracts/IPrecompileERC20.json');

const { BigNumber } = ethers;

// 3DPass-specific constants
const P3D_PRECOMPILE = '0x0000000000000000000000000000000000000802';

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

	async getAddressBlocks(address, startblock, endblock) {
		// Use EVM events API for more accurate block discovery
		return await getAddressBlocks({ address, startblock, endblock });
	}

	async getAddressTransactionBlocks(address, startblock, endblock) {
		// Get blocks containing EVM transactions for the address
		return await getAddressTransactionBlocks({ address, startblock, endblock });
	}

	// 3DPass-specific token validation
	isValidNonnativeAsset(asset) {
		// Allow P3D precompile
		if (asset === P3D_PRECOMPILE) {
			return true;
		}
		// Allow 3DPass ERC20 precompiles (prefix 0xFBFBFBFA)
		if (this.is3DPassERC20Precompile(asset)) {
			return true;
		}
		return false;
	}

	isValidAsset(asset) {
		return this.isValidNonnativeAsset(asset);
	}

	// Helper function to detect 3DPass ERC20 precompiles
	is3DPassERC20Precompile(tokenAddr) {
		// 3DPass ERC20 precompiles have prefix 0xFBFBFBFA
		return BigNumber.from(tokenAddr).shr(128).eq(0xFBFBFBFA);
	}

	// Helper function to check if token is P3D precompile
	isP3D(token) {
		return token === P3D_PRECOMPILE;
	}

	// Override getMyBalance to handle 3DPass precompiles
	async getMyBalance(asset) {
		if (this.isP3D(asset)) {
			// Use IP3D interface for P3D precompile
			const p3d = new ethers.Contract(asset, ip3dJson.abi, this.getProvider());
			return await p3d.balanceOf(this.getMyAddress());
		} else if (this.is3DPassERC20Precompile(asset)) {
			// Use IPrecompileERC20 interface for ERC20 precompiles
			const token = new ethers.Contract(asset, iprecompileErc20Json.abi, this.getProvider());
			return await token.balanceOf(this.getMyAddress());
		}
		// Fallback to standard ERC20
		return await super.getMyBalance(asset);
	}

	// Override getBalance to handle 3DPass precompiles
	async getBalance(address, asset, bExternalAddress, attempt = 0) {
		try {
			if (this.isP3D(asset)) {
				const p3d = new ethers.Contract(asset, ip3dJson.abi, this.getProvider());
				return await p3d.balanceOf(address);
			} else if (this.is3DPassERC20Precompile(asset)) {
				const token = new ethers.Contract(asset, iprecompileErc20Json.abi, this.getProvider());
				return await token.balanceOf(address);
			}
			// Fallback to standard ERC20
			return await super.getBalance(address, asset, bExternalAddress, attempt);
		}
		catch (e) {
			console.log(`getBalance ${address} ${asset} attempt ${attempt} failed`, e);
			if (attempt >= 10)
				throw e;
			attempt++;
			await wait(attempt * 30_000);
			return this.getBalance(address, asset, bExternalAddress, attempt);
		}
	}

	// Override getSymbol to handle 3DPass precompiles
	async getSymbol(tokenAddress) {
		if (this.isP3D(tokenAddress)) {
			return 'P3D';
		} else if (this.is3DPassERC20Precompile(tokenAddress)) {
			const token = new ethers.Contract(tokenAddress, iprecompileErc20Json.abi, this.getProvider());
			try {
				return await token.symbol();
			}
			catch (e) {
				console.log(`getSymbol(${tokenAddress}) failed`, e);
				return null;
			}
		}
		// Fallback to standard ERC20
		return await super.getSymbol(tokenAddress);
	}

	// Override getDecimals to handle 3DPass precompiles
	async getDecimals(tokenAddress) {
		if (this.isP3D(tokenAddress)) {
			return 18; // P3D has 18 decimals
		} else if (this.is3DPassERC20Precompile(tokenAddress)) {
			const token = new ethers.Contract(tokenAddress, iprecompileErc20Json.abi, this.getProvider());
			try {
				return await token.decimals();
			}
			catch (e) {
				console.log(`getDecimals(${tokenAddress}) failed`, e);
				return null;
			}
		}
		// Fallback to standard ERC20
		return await super.getDecimals(tokenAddress);
	}

	// Override approve to handle 3DPass precompiles
	async approve(tokenAddress, spenderAddress) {
		if (this.isP3D(tokenAddress)) {
			// Use IP3D interface for P3D precompile
			const p3d = new ethers.Contract(tokenAddress, ip3dJson.abi, this.getWallet());
			try {
				const allowance = await p3d.allowance(this.getMyAddress(), spenderAddress);
				if (allowance.gt(0)) {
					console.log(`spender ${spenderAddress} already approved for P3D`);
					return "already approved";
				}
				console.log(`will approve spender ${spenderAddress} to spend our P3D`);
				const res = await p3d.approve(spenderAddress, BigNumber.from(2).pow(256).sub(1));
				return res;
			}
			catch (e) {
				console.log(`approve P3D(${spenderAddress}) failed`, e);
				return null;
			}
		} else if (this.is3DPassERC20Precompile(tokenAddress)) {
			// Use IPrecompileERC20 interface for ERC20 precompiles
			const token = new ethers.Contract(tokenAddress, iprecompileErc20Json.abi, this.getWallet());
			try {
				const allowance = await token.allowance(this.getMyAddress(), spenderAddress);
				if (allowance.gt(0)) {
					console.log(`spender ${spenderAddress} already approved for ERC20 precompile`);
					return "already approved";
				}
				console.log(`will approve spender ${spenderAddress} to spend our ERC20 precompile`);
				const res = await token.approve(spenderAddress, BigNumber.from(2).pow(256).sub(1));
				return res;
			}
			catch (e) {
				console.log(`approve ERC20 precompile(${spenderAddress}) failed`, e);
				return null;
			}
		}
		// Fallback to standard ERC20
		return await super.approve(tokenAddress, spenderAddress);
	}

	// Override startWatchingExportAA to use 3DPass Export ABI
	startWatchingExportAA(export_aa) {
		const contract = new ethers.Contract(export_aa, exportJson.abi, this.getWallet());
		contract.on('NewExpatriation', this.onNewExpatriation.bind(this));
		this.addCounterstakeEventHandlers(contract);
		this._storeContractReference(export_aa, contract);
	}

	// Override startWatchingImportAA to use ImportWrapper ABI
	startWatchingImportAA(import_aa) {
		const contract = new ethers.Contract(import_aa, importWrapperJson.abi, this.getWallet());
		contract.on('NewRepatriation', this.onNewRepatriation.bind(this));
		this.addCounterstakeEventHandlers(contract);
		this._storeContractReference(import_aa, contract);
	}

	// Override startWatchingExportAssistantAA to use 3DPass ExportAssistant ABI
	startWatchingExportAssistantAA(export_assistant_aa) {
		const contract = new ethers.Contract(export_assistant_aa, exportAssistantJson.abi, this.getWallet());
		this._storeContractReference(export_assistant_aa, contract);
	}

	// Override startWatchingImportAssistantAA to use ImportWrapperAssistant ABI
	startWatchingImportAssistantAA(import_assistant_aa) {
		const contract = new ethers.Contract(import_assistant_aa, importWrapperAssistantJson.abi, this.getWallet());
		this._storeContractReference(import_assistant_aa, contract);
	}

	// Override startWatchingFactories to handle both Export and ImportWrapper events
	async startWatchingFactories() {
		console.log('3DPass startWatchingFactories called');
		try {
			// Call the parent method first to set up basic factory watching
			await super.startWatchingFactories();
		} catch (error) {
			console.error('Error in 3DPass startWatchingFactories:', error);
			throw error;
		}
		
		// Now add 3DPass-specific Export and ImportWrapper handling
		console.log('3DPass: Setting up 3DPass-specific factory monitoring...');
		const transfers = require('./transfers.js');
		const { getVersion } = require('./utils.js');
		
		// Handle NewExport events specifically for 3DPass
		const onNewExport = async (contractAddress, tokenAddress, foreign_network, foreign_asset, event) => {
			console.log(`NewExport event for 3DPass:`, { contractAddress, tokenAddress, foreign_network, foreign_asset });
			
			// Get factory addresses from conf
			const factoryAddresses = conf.threedpass_factory_contract_addresses;
			const version = getVersion(factoryAddresses, event.address);
			if (!version)
				throw Error(`undefined version of new export ${contractAddress} ${JSON.stringify(event)}`);
			
			// Get decimals for the token (P3D precompile or 3DPass ERC20 precompile)
			const decimals = await this.getDecimals(tokenAddress);
			if (decimals === null)
				return console.log(`not adding new export contract ${contractAddress} as its token ${tokenAddress} didn't return decimals`);
			
			// Normalize network names to ensure consistency
			const normalizedForeignNetwork = foreign_network === '3dpass' ? '3DPass' : foreign_network;
			
			const bAdded = await transfers.handleNewExportAA(contractAddress, this.network, tokenAddress, decimals, normalizedForeignNetwork, foreign_asset, version);
			if (bAdded)
				this.startWatchingExportAA(contractAddress);
		};

		// Handle NewImportWrapper events specifically for 3DPass
		const onNewImportWrapper = async (contractAddress, home_network, home_asset, precompileAddress, stakeTokenAddress, event) => {
			console.log(`NewImportWrapper event for 3DPass:`, { contractAddress, home_network, home_asset, precompileAddress, stakeTokenAddress });
			
			// Get factory addresses from conf
			const factoryAddresses = conf.threedpass_factory_contract_addresses;
			const version = getVersion(factoryAddresses, event.address);
			if (!version)
				throw Error(`undefined version of new import wrapper ${contractAddress} ${JSON.stringify(event)}`);
			
			// Normalize network names to ensure consistency
			const normalizedHomeNetwork = home_network === '3dpass' ? '3DPass' : home_network;
			
			const bAdded = await transfers.handleNewImportAA(contractAddress, normalizedHomeNetwork, home_asset, this.network, precompileAddress, 18, stakeTokenAddress, version);
			if (bAdded)
				this.startWatchingImportAA(contractAddress);
		};

		// Set up Export and ImportWrapper event listeners and process historical events
		console.log('3DPass: Processing factory contracts...');
		for (let v in conf.threedpass_factory_contract_addresses) {
			const factory_contract_address = conf.threedpass_factory_contract_addresses[v];
			console.log(`3DPass: Setting up factory contract ${v}: ${factory_contract_address}`);
			const contract = new ethers.Contract(factory_contract_address, factoryJson.abi, this.getProvider());
			
			// Set up event listeners for future events
			contract.on('NewExport', onNewExport);
			contract.on('NewImportWrapper', onNewImportWrapper);

			// Process historical events (this is what was missing!)
			const processPastEventsOnContract = async (from_block, to_block) => {
				console.log('3DPass factories processPastEventsOnContract', this.network, from_block, to_block);
				
				// Process NewExport events
				try {
					const exportEvents = await contract.queryFilter(contract.filters.NewExport(), from_block, to_block || 'latest');
					console.log(`Found ${exportEvents.length} NewExport events in range ${from_block}-${to_block || 'latest'}`);
					for (const event of exportEvents) {
						await onNewExport(event.args.contractAddress, event.args.tokenAddress, event.args.foreign_network, event.args.foreign_asset, event);
					}
				} catch (e) {
					console.log(`Error processing NewExport events:`, e.message);
				}
				
				// Process NewImportWrapper events
				try {
					const importEvents = await contract.queryFilter(contract.filters.NewImportWrapper(), from_block, to_block || 'latest');
					console.log(`Found ${importEvents.length} NewImportWrapper events in range ${from_block}-${to_block || 'latest'}`);
					for (const event of importEvents) {
						await onNewImportWrapper(event.args.contractAddress, event.args.home_network, event.args.home_asset, event.args.precompileAddress, event.args.stakeTokenAddress, event);
					}
				} catch (e) {
					console.log(`Error processing NewImportWrapper events:`, e.message);
				}
			};
		
		// get factory events that are beyond the block range
		const last_block = Math.max(await this.getLastBlock() - 100, 0);
		const top_available_block = await this.getTopAvailableBlock();
		if (top_available_block > last_block) {
			console.log(this.network, '3DPass factories top available block', top_available_block, '> last block', last_block);
			const blocks = await this.getAddressBlocks(factory_contract_address, last_block);
			console.log('3DPass factories blocks of missed txs', this.network, blocks);
			for (let blockNumber of blocks) {
				await processPastEventsOnContract(blockNumber, blockNumber);
			}
		}

		// Also check for historical factory events from the beginning
		// This is important because factory events might have happened much earlier
		console.log(this.network, '3DPass factories checking historical events from block 0');
		const historicalBlocks = await this.getAddressBlocks(factory_contract_address, 0, last_block - 1);
		console.log('3DPass factories historical blocks', this.network, historicalBlocks);
		for (let blockNumber of historicalBlocks) {
			await processPastEventsOnContract(blockNumber, blockNumber);
		}

			const since_block = await this.getSinceBlock();
			await processPastEventsOnContract(since_block, 0);
		}
	}

	// Override startWatchingAssistantFactories to handle both ExportAssistant and ImportWrapperAssistant events
	async startWatchingAssistantFactories() {
		// Call the parent method first to set up basic assistant factory watching
		await super.startWatchingAssistantFactories();
		
		// Now add 3DPass-specific ExportAssistant and ImportWrapperAssistant handling
		const transfers = require('./transfers.js');
		const { getVersion } = require('./utils.js');
		
		// Handle NewExportAssistant events specifically for 3DPass
		const onNewExportAssistant = async (assistantAddress, bridgeAddress, manager, symbol, event) => {
			console.log(`NewExportAssistant event for 3DPass:`, { assistantAddress, bridgeAddress, manager, symbol });
			
			// Get assistant factory addresses from conf
			const assistantFactoryAddresses = conf.threedpass_assistant_factory_contract_addresses;
			const version = getVersion(assistantFactoryAddresses, event.address);
			if (!version)
				throw Error(`undefined version of new export assistant ${assistantAddress} ${JSON.stringify(event)}`);
			
			const bAdded = await transfers.handleNewAssistantAA('export', assistantAddress, bridgeAddress, this.network, manager, assistantAddress, symbol, version);
			if (bAdded)
				this.startWatchingExportAssistantAA(assistantAddress);
		};

		// Handle NewImportWrapperAssistant events specifically for 3DPass
		const onNewImportWrapperAssistant = async (assistantAddress, bridgeAddress, precompileAddress, name, symbol, event) => {
			console.log(`NewImportWrapperAssistant event for 3DPass:`, { assistantAddress, bridgeAddress, precompileAddress, name, symbol });
			
			// Get assistant factory addresses from conf
			const assistantFactoryAddresses = conf.threedpass_assistant_factory_contract_addresses;
			const version = getVersion(assistantFactoryAddresses, event.address);
			if (!version)
				throw Error(`undefined version of new import wrapper assistant ${assistantAddress} ${JSON.stringify(event)}`);
			
			const bAdded = await transfers.handleNewAssistantAA('import', assistantAddress, bridgeAddress, this.network, assistantAddress, assistantAddress, symbol, version);
			if (bAdded)
				this.startWatchingImportAssistantAA(assistantAddress);
		};

		// Set up ExportAssistant and ImportWrapperAssistant event listeners and process historical events
		for (let v in conf.threedpass_assistant_factory_contract_addresses) {
			const assistant_factory_contract_address = conf.threedpass_assistant_factory_contract_addresses[v];
			const contract = new ethers.Contract(assistant_factory_contract_address, assistantFactoryJson.abi, this.getProvider());
			
			// Set up event listeners for future events
			contract.on('NewExportAssistant', onNewExportAssistant);
			contract.on('NewImportWrapperAssistant', onNewImportWrapperAssistant);

			// Process historical events (this is what was missing!)
			const processPastEventsOnContract = async (from_block, to_block) => {
				console.log('3DPass assistant factories processPastEventsOnContract', this.network, from_block, to_block);
				
				// Process NewExportAssistant events
				try {
					const exportAssistantEvents = await contract.queryFilter(contract.filters.NewExportAssistant(), from_block, to_block || 'latest');
					console.log(`Found ${exportAssistantEvents.length} NewExportAssistant events in range ${from_block}-${to_block || 'latest'}`);
					for (const event of exportAssistantEvents) {
						await onNewExportAssistant(event.args.contractAddress, event.args.bridgeAddress, event.args.manager, event.args.symbol, event);
					}
				} catch (e) {
					console.log(`Error processing NewExportAssistant events:`, e.message);
				}
				
				// Process NewImportWrapperAssistant events
				try {
					const importAssistantEvents = await contract.queryFilter(contract.filters.NewImportWrapperAssistant(), from_block, to_block || 'latest');
					console.log(`Found ${importAssistantEvents.length} NewImportWrapperAssistant events in range ${from_block}-${to_block || 'latest'}`);
					for (const event of importAssistantEvents) {
						await onNewImportWrapperAssistant(event.args.contractAddress, event.args.bridgeAddress, event.args.precompileAddress, event.args.name, event.args.symbol, event);
					}
				} catch (e) {
					console.log(`Error processing NewImportWrapperAssistant events:`, e.message);
				}
			};
		
		// get assistant factory events that are beyond the block range
		const last_block = Math.max(await this.getLastBlock() - 100, 0);
		const top_available_block = await this.getTopAvailableBlock();
		if (top_available_block > last_block) {
			console.log(this.network, '3DPass assistant factories top available block', top_available_block, '> last block', last_block);
			const blocks = await this.getAddressBlocks(assistant_factory_contract_address, last_block);
			console.log('3DPass assistant factories blocks of missed txs', this.network, blocks);
			for (let blockNumber of blocks) {
				await processPastEventsOnContract(blockNumber, blockNumber);
			}
		}

		// Also check for historical assistant factory events from the beginning
		// This is important because assistant factory events might have happened much earlier
		console.log(this.network, '3DPass assistant factories checking historical events from block 0');
		const historicalBlocks = await this.getAddressBlocks(assistant_factory_contract_address, 0, last_block - 1);
		console.log('3DPass assistant factories historical blocks', this.network, historicalBlocks);
		for (let blockNumber of historicalBlocks) {
			await processPastEventsOnContract(blockNumber, blockNumber);
		}

			const since_block = await this.getSinceBlock();
			await processPastEventsOnContract(since_block, 0);
		}
	}
}

module.exports = ThreeDPass; 