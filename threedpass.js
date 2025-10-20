"use strict";
const conf = require('ocore/conf.js');
const EvmChain = require('./evm-chain.js');
const { getProvider } = require("./evm/provider.js");
const { getAddressBlocks, getAddressTransactionBlocks } = require("./3dpscan.js");
const { ethers, BigNumber, constants: { AddressZero } } = require("ethers");
const { wait } = require('./utils.js');
const mutex = require('ocore/mutex.js');

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

// 3DPass-specific constants
// P3D native token ERC20 precompile address
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
		// Handle null/undefined tokenAddr
		if (tokenAddr === null || tokenAddr === undefined) {
			return false;
		}
		// 3DPass ERC20 precompiles have prefix 0xFBFBFBFA
		return BigNumber.from(tokenAddr).shr(128).eq(0xFBFBFBFA);
	}

	// Helper function to check if token is P3D precompile
	isP3D(token) {
		return token !== null && token !== undefined && token === P3D_PRECOMPILE;
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
			// Handle null asset parameter
			if (asset === null || asset === undefined) {
				console.log(`getBalance ${address} called with null/undefined asset, treating as zero balance`);
				return BigNumber.from(0);
			}
			
			if (this.isP3D(asset)) {
				const p3d = new ethers.Contract(asset, ip3dJson.abi, this.getProvider());
				const balance = await p3d.balanceOf(address);
				// Handle null return values
				if (balance === null || balance === undefined) {
					console.log(`getBalance ${address} ${asset} returned null, treating as zero balance`);
					return BigNumber.from(0);
				}
				return balance;
			} else if (this.is3DPassERC20Precompile(asset)) {
				const token = new ethers.Contract(asset, iprecompileErc20Json.abi, this.getProvider());
				const balance = await token.balanceOf(address);
				// Handle null return values
				if (balance === null || balance === undefined) {
					console.log(`getBalance ${address} ${asset} returned null, treating as zero balance`);
					return BigNumber.from(0);
				}
				return balance;
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

	/**
	 * Check if an address is an ImportWrapperAssistant contract
	 */
	isImportWrapperAssistant(assistantAddress) {
		// Check if we have this assistant in our contracts mapping
		return this.getContractReference(assistantAddress) !== null;
	}

	/**
	 * Check if an address is an ExportAssistant contract
	 */
	isExportAssistant(assistantAddress) {
		// Check if we have this assistant in our contracts mapping
		return this.getContractReference(assistantAddress) !== null;
	}

	/**
	 * Get the share balance (totalSupply) of an assistant contract
	 * This represents how many share tokens the assistant has minted
	 * Works for both ImportWrapperAssistant and ExportAssistant
	 */
	async getAssistantShareBalance(assistantAddress) {
		try {
			const assistant = this.getContractReference(assistantAddress);
			if (!assistant) {
				// If not in our mapping, try to determine the contract type and create a temporary instance
				// Try ImportWrapperAssistant first
				try {
					const tempAssistant = new ethers.Contract(assistantAddress, importWrapperAssistantJson.abi, this.getProvider());
					return await tempAssistant.totalSupply();
				} catch (error) {
					// If that fails, try ExportAssistant
					try {
						const tempAssistant = new ethers.Contract(assistantAddress, exportAssistantJson.abi, this.getProvider());
						return await tempAssistant.totalSupply();
					} catch (error2) {
						console.log(`Error getting assistant share balance for ${assistantAddress}:`, error2.message);
						return BigNumber.from(0);
					}
				}
			}
			return await assistant.totalSupply();
		} catch (error) {
			console.log(`Error getting assistant share balance for ${assistantAddress}:`, error.message);
			return BigNumber.from(0);
		}
	}

	// Override getDecimals to handle 3DPass precompiles
	async getDecimals(tokenAddress) {
		// Handle null tokenAddress parameter
		if (tokenAddress === null || tokenAddress === undefined) {
			console.log(`getDecimals called with null/undefined tokenAddress, using default 18`);
			return 18;
		}
		
		if (this.isP3D(tokenAddress)) {
			return 18; // P3D has 18 decimals
		} else if (this.is3DPassERC20Precompile(tokenAddress)) {
			const token = new ethers.Contract(tokenAddress, iprecompileErc20Json.abi, this.getProvider());
			try {
				const decimals = await token.decimals();
				// Handle null return values
				if (decimals === null || decimals === undefined) {
					console.log(`getDecimals(${tokenAddress}) returned null, using default 18`);
					return 18;
				}
				return decimals;
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
		// 3DPass-specific gas parameters (very low gas costs)
		const gasOptions = {
			...conf.threedpass_gas_config.standard
		};

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
				const res = await p3d.approve(spenderAddress, BigNumber.from(2).pow(256).sub(1), gasOptions);
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
				const res = await token.approve(spenderAddress, BigNumber.from(2).pow(256).sub(1), gasOptions);
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
		
		// Add NewManager event listener
		const onNewManager = async (previousManager, newManager, event) => {
			console.log(`NewManager event for 3DPass Export Assistant ${export_assistant_aa}`, { previousManager, newManager, network: this.network });
			const transfers = require('./transfers.js');
			await transfers.handleNewManager(export_assistant_aa, previousManager, newManager, this.network);
		};
		
		contract.on('NewManager', onNewManager);
		this._storeContractReference(export_assistant_aa, contract);
		
		// Process past NewManager events for this assistant
		this.processPastNewManagerEvents(contract, export_assistant_aa, onNewManager);
	}

	// Override startWatchingImportAssistantAA to use ImportWrapperAssistant ABI
	startWatchingImportAssistantAA(import_assistant_aa) {
		const contract = new ethers.Contract(import_assistant_aa, importWrapperAssistantJson.abi, this.getWallet());
		
		// Add NewManager event listener
		const onNewManager = async (previousManager, newManager, event) => {
			console.log(`NewManager event for 3DPass Import Assistant ${import_assistant_aa}`, { previousManager, newManager, network: this.network });
			const transfers = require('./transfers.js');
			await transfers.handleNewManager(import_assistant_aa, previousManager, newManager, this.network);
		};
		
		contract.on('NewManager', onNewManager);
		this._storeContractReference(import_assistant_aa, contract);
		
		// Process past NewManager events for this assistant
		this.processPastNewManagerEvents(contract, import_assistant_aa, onNewManager);
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

	// ===== 3DPass Precompile Support Functions =====

	/**
	 * Transfer tokens using 3DPass precompiles
	 * This is the key function for evm_substrate compatibility
	 */
	async transferTokens(tokenAddress, recipientAddress, amount) {
		// 3DPass-specific gas parameters (very low gas costs)
		const gasOptions = {
			...conf.threedpass_gas_config.standard
		};

		if (this.isP3D(tokenAddress)) {
			// Use IP3D interface for P3D precompile
			const p3d = new ethers.Contract(tokenAddress, ip3dJson.abi, this.getWallet());
			return await p3d.transfer(recipientAddress, amount, gasOptions);
		} else if (this.is3DPassERC20Precompile(tokenAddress)) {
			// Use IPrecompileERC20 interface for ERC20 precompiles
			const token = new ethers.Contract(tokenAddress, iprecompileErc20Json.abi, this.getWallet());
			return await token.transfer(recipientAddress, amount, gasOptions);
		}
		// Fallback to standard ERC20 transfer
		return await super.transferTokens(tokenAddress, recipientAddress, amount);
	}


	/**
	 * Override sendClaim to handle 3DPass-specific approval logic
	 */
	async sendClaim({ bridge_aa, amount, reward, claimed_asset, stake, staked_asset, sender_address, dest_address, data, txid, txts }) {
		const unlock = await mutex.lock(this.network + 'Tx');
		console.log(`will send a claim to ${this.network}`, { bridge_aa, amount, reward, claimed_asset, stake, staked_asset, sender_address, dest_address, data, txid, txts });
		await this.waitBetweenTransactions();
		
		// Handle approval for staked asset (3DPass-specific logic)
		if (staked_asset && staked_asset !== AddressZero) {
			const approval_res = await this.approve(staked_asset, bridge_aa);
			if (!approval_res)
				throw Error(`failed to approve ${bridge_aa} to spend our ${staked_asset}`);
		}

		const bThirdPartyClaiming = (dest_address && dest_address !== this.getMyAddress());
		const paid_amount = bThirdPartyClaiming ? amount.sub(reward) : BigNumber.from(0);
		const total = (claimed_asset === staked_asset) ? stake.add(paid_amount) : stake;
		const contract = this.getContractReference(bridge_aa);
		if (!contract)
			throw Error(`no contract by bridge AA ${bridge_aa}`);
		try {
			// 3DPass-specific gas parameters (very low gas costs)
			let opts = {
				value: 0, // Always 0 for 3DPass precompiles
				...conf.threedpass_gas_config.claim
			};
			
			await this.addAccessListIfNecessary(opts, claimed_asset, staked_asset, dest_address);
			const res = await contract.claim(txid, txts, amount, reward, stake, sender_address, dest_address, data, opts);
			const claim_txid = res.hash;
			console.log(`sent claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}: ${claim_txid}`);
			// Note: last_tx_ts and bWaitForMined are private properties in parent class
			// We'll let the parent class handle transaction timing
			unlock();
			return claim_txid;
		}
		catch (e) {
			console.log(`failed to send claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}`, e);
			unlock();
			if (e.toString().includes('has already been claimed')) {
				console.log(`transfer ${txid} already claimed, maybe we missed the event?`);
				process.nextTick(async () => {
					console.log(`will rescan events since ${txts}`);
					const blocks = await this.getAddressBlocks(bridge_aa, 0, txts);
					console.log(`blocks since ${txts}:`, blocks);
					for (let blockNumber of blocks) {
						await this.processPastEventsOnBridgeContract(contract, blockNumber, blockNumber);
					}
				});
			}
			return null;
		}
	}

	/**
	 * Override sendClaimFromPooledAssistant to handle 3DPass-specific logic
	 */
	async sendClaimFromPooledAssistant({ assistant_aa, amount, reward, claimed_asset, staked_asset, sender_address, dest_address, data, txid, txts }) {
		const unlock = await mutex.lock(this.network + 'Tx');
		if (!dest_address)
			throw Error(`no dest address in assistant claim`);
		await this.waitBetweenTransactions();
		const contract = this.getContractReference(assistant_aa);
		if (!contract)
			throw Error(`no contract by assistant AA ${assistant_aa}`);
		
		try {
			// 3DPass-specific gas parameters (very low gas costs)
			let opts = {
				value: 0, // Always 0 for 3DPass precompiles
				...conf.threedpass_gas_config.assistant
			};
			
			await this.addAccessListIfNecessary(opts, claimed_asset, staked_asset, dest_address);
			const res = await contract.claim(txid, txts, amount, reward, sender_address, dest_address, data, opts);
			const claim_txid = res.hash;
			console.log(`sent assistant claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}: ${claim_txid}`);
			// Note: last_tx_ts and bWaitForMined are private properties in parent class
			// We'll let the parent class handle transaction timing
			unlock();
			return claim_txid;
		}
		catch (e) {
			console.log(`failed to send assistant claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}`, e);
			unlock();
			return null;
		}
	}


	/**
	 * Override sendChallenge to handle 3DPass-specific approval logic
	 */
	async sendChallenge(bridge_aa, claim_num, stake_on, asset, counterstake) {
		const unlock = await mutex.lock(this.network + 'Tx');
		await this.waitBetweenTransactions();
		const side = stake_on === 'yes' ? 1 : 0;
		const contract = this.getContractReference(bridge_aa);
		if (!contract)
			throw Error(`no contract by bridge AA ${bridge_aa}`);
		
		// Handle approval for staking asset (3DPass-specific logic)
		if (asset && asset !== AddressZero) {
			const approval_res = await this.approve(asset, bridge_aa);
			if (!approval_res)
				throw Error(`failed to approve ${bridge_aa} to spend our ${asset} for challenge`);
		}
		
		try {
			// 3DPass-specific gas parameters (very low gas costs)
			let opts = {
				value: 0, // Always 0 for 3DPass precompiles
				...conf.threedpass_gas_config.challenge
			};
			
			const res = await contract['challenge(uint256,uint8,uint256)'](claim_num, side, counterstake, opts);
			const txid = res.hash;
			console.log(`sent counterstake ${counterstake} for "${stake_on}" to challenge claim ${claim_num}: ${txid}`);
			// Note: last_tx_ts and bWaitForMined are private properties in parent class
			// We'll let the parent class handle transaction timing
			unlock();
			return txid;
		}
		catch (e) {
			console.log(`failed to send challenge for claim ${claim_num} with ${stake_on} stake ${counterstake}`, e);
			unlock();
			return null;
		}
	}

	/**
	 * Override sendChallengeFromPooledAssistant to handle 3DPass-specific logic
	 */
	async sendChallengeFromPooledAssistant(assistant_aa, claim_num, stake_on, counterstake) {
		const unlock = await mutex.lock(this.network + 'Tx');
		await this.waitBetweenTransactions();
		const side = stake_on === 'yes' ? 1 : 0;
		const contract = this.getContractReference(assistant_aa);
		if (!contract)
			throw Error(`no contract by assistant AA ${assistant_aa}`);
		
		try {
			// 3DPass-specific gas parameters (very low gas costs)
			let opts = {
				value: 0, // Always 0 for 3DPass precompiles
				...conf.threedpass_gas_config.assistant
			};
			
			const res = await contract.challenge(claim_num, side, counterstake, opts);
			const txid = res.hash;
			console.log(`sent assistant counterstake ${counterstake} for "${stake_on}" to challenge claim ${claim_num}: ${txid}`);
			// Note: last_tx_ts and bWaitForMined are private properties in parent class
			// We'll let the parent class handle transaction timing
			unlock();
			return txid;
		}
		catch (e) {
			console.log(`failed to send assistant challenge for claim ${claim_num} with ${stake_on} stake ${counterstake}`, e);
			unlock();
			return null;
		}
	}


	/**
	 * Override sendWithdrawalRequest to use 3DPass-specific gas parameters
	 */
	async sendWithdrawalRequest(bridge_aa, claim_num, to_address) {
		const unlock = await mutex.lock(this.network + 'Tx');
		await this.waitBetweenTransactions();
		const contract = this.getContractReference(bridge_aa);
		
		// 3DPass-specific gas parameters (very low gas costs)
		let opts = {
			...conf.threedpass_gas_config.withdraw
		};
		
		if (to_address) { // Assistant contract withdrawal
			const code = await this.getProvider().getCode(to_address);
			const masterAddress = ethers.utils.getAddress('0x' + code.slice(22, 62));
			opts.accessList = [
				{ address: masterAddress, storageKeys: [] },
				{ address: to_address, storageKeys: ["0x0000000000000000000000000000000000000000000000000000000000000007"] },
			];
		}
		
		const res = to_address
			? await contract['withdraw(uint256,address)'](claim_num, to_address, opts)
			: await contract['withdraw(uint256)'](claim_num, opts);
		
		const txid = res.hash;
		console.log(`3DPass: sent withdrawal request on claim ${claim_num} to ${to_address || 'self'}: ${txid}`);
		// Note: last_tx_ts and wait for mined are handled by the parent class
		unlock();
		return txid;
	}



	/**
	 * Enhanced token validation for 3DPass precompiles
	 * Validates that a token address is a valid 3DPass precompile
	 */
	validate3DPassToken(tokenAddress) {
		if (this.isP3D(tokenAddress)) {
			return { valid: true, type: 'P3D', decimals: 18 };
		} else if (this.is3DPassERC20Precompile(tokenAddress)) {
			return { valid: true, type: 'ERC20_PRECOMPILE', decimals: null }; // Will be fetched dynamically
		}
		return { valid: false, type: 'UNKNOWN', decimals: null };
	}

	/**
	 * Get token info for 3DPass precompiles
	 * Returns comprehensive token information
	 */
	async getTokenInfo(tokenAddress) {
		const validation = this.validate3DPassToken(tokenAddress);
		if (!validation.valid) {
			throw new Error(`Invalid 3DPass token address: ${tokenAddress}`);
		}

		const info = {
			address: tokenAddress,
			type: validation.type,
			decimals: validation.decimals,
			symbol: null,
			name: null
		};

		try {
			if (this.isP3D(tokenAddress)) {
				info.symbol = 'P3D';
				info.name = '3DPass Native Token';
			} else if (this.is3DPassERC20Precompile(tokenAddress)) {
				const token = new ethers.Contract(tokenAddress, iprecompileErc20Json.abi, this.getProvider());
				info.symbol = await token.symbol();
				info.name = await token.name();
				info.decimals = await token.decimals();
			}
		} catch (e) {
			console.log(`Error getting token info for ${tokenAddress}:`, e.message);
		}

		return info;
	}
}

module.exports = ThreeDPass; 