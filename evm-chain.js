"use strict";
const fs = require("fs");
const { ethers } = require("ethers");
const eventBus = require('ocore/event_bus.js');
const conf = require('ocore/conf.js');
const db = require('ocore/db.js');
const mutex = require('ocore/mutex.js');
const desktopApp = require("ocore/desktop_app.js");
const notifications = require('./notifications.js');
const transfers = require('./transfers.js');
const { fetchExchangeRateInNativeAsset } = require('./prices.js');
const { wait, watchForDeadlock, getVersion, asyncCallWithTimeout, isRateLimitError } = require('./utils.js');
const { normalizeAddress } = require('./address_normalizer.js');

const exportJson = require('./evm/build/contracts/Export.json');
const importJson = require('./evm/build/contracts/Import.json');
const erc20Json = require('./evm/build/contracts/ERC20.json');
const factoryJson = require('./evm/build/contracts/CounterstakeFactory.json');

const exportAssistantJson = require('./evm/build/contracts/ExportAssistant.json');
const importAssistantJson = require('./evm/build/contracts/ImportAssistant.json');
const assistantFactoryJson = require('./evm/build/contracts/AssistantFactory.json');

const { BigNumber, constants: { AddressZero } } = ethers;
const TIMEOUT_BETWEEN_TRANSACTIONS = 3000;

let cachedMinTxAges = {};


class EvmChain {
	network = "AbstractEVMChain";
	#factory_contract_addresses;
	#assistant_factory_contract_addresses;
	#provider;
	#listenerProvider; // Separate provider for listening to network events
	#wallet;
	#contractsByAddress = {};
	#bCatchingUp = true;
	#last_caughtup_block;
	#last_tx_ts = 0;
	#bWaitForMined = false; // set to true for unreliable providers that might lose a transaction
	#approved = {};
	#cachedTransactions = {}; // address => { transactions: [{ txHash, blockNumber, eventLogs? }], timestamp }
	#cachedEventLogs = {}; // txHash => { eventLogs: [...], timestamp }

	getProvider() {
		return this.#provider;
	}

	getListenerProvider() {
		// Return listener provider if available, otherwise use main provider
		return this.#listenerProvider || this.#provider;
	}

	getWallet() {
		return this.#wallet;
	}

	_storeContractReference(address, contract) {
		this.#contractsByAddress[address] = contract;
	}

	getContractReference(address) {
		return this.#contractsByAddress[address] || null;
	}

	getMaxBlockRange() {
		return 0;
	}

	getStaticGasPrice() {
		return 0; // in gwei
	}

	getGasPriceMultiplier() {
		return 0;
	}

	async getAddressBlocks(address, startblock, startts) {
		throw Error(`getAddressBlocks() unimplemented on ${this.network}`);
	}

	/**
	 * Store transaction hashes for an address (from HTML parser)
	 * @param {string} address - Contract address
	 * @param {Array} transactions - Array of { txHash, blockNumber } objects
	 */
	storeCachedTransactions(address, transactions) {
		if (transactions && transactions.length > 0) {
			// Normalize address first to ensure consistent format, then use lowercase for cache key
			const normalizedAddress = normalizeAddress(address, this);
			const cacheKey = normalizedAddress.toLowerCase();
			this.#cachedTransactions[cacheKey] = {
				transactions: transactions,
				timestamp: Date.now()
			};
			console.log(`📦 Cached ${transactions.length} transactions for ${normalizedAddress.substring(0, 10)}...`);
		}
	}

	/**
	 * Get cached transaction hashes for an address
	 * @param {string} address - Contract address
	 * @param {number} maxAge - Maximum age of cache in milliseconds (default: 5 minutes)
	 * @returns {Array|null} Array of { txHash, blockNumber, eventLogs? } objects or null if not cached/expired
	 */
	getCachedTransactions(address, maxAge = 5 * 60 * 1000) {
		// Normalize address first to ensure consistent format, then use lowercase for cache key
		const normalizedAddress = normalizeAddress(address, this);
		const cacheKey = normalizedAddress.toLowerCase();
		const cached = this.#cachedTransactions[cacheKey];
		
		if (!cached) {
			return null;
		}
		
		// Check if cache is still valid
		if (Date.now() - cached.timestamp > maxAge) {
			delete this.#cachedTransactions[cacheKey];
			return null;
		}
		
		return cached.transactions;
	}

	/**
	 * Store event logs for a transaction hash
	 * @param {string} txHash - Transaction hash
	 * @param {Array} eventLogs - Array of event log objects
	 */
	storeCachedEventLogs(txHash, eventLogs) {
		if (eventLogs && eventLogs.length > 0) {
			this.#cachedEventLogs[txHash.toLowerCase()] = {
				eventLogs: eventLogs,
				timestamp: Date.now()
			};
			console.log(`📦 Cached ${eventLogs.length} event logs for transaction ${txHash.substring(0, 16)}...`);
		}
	}

	/**
	 * Get cached event logs for a transaction hash
	 * @param {string} txHash - Transaction hash
	 * @param {number} maxAge - Maximum age of cache in milliseconds (default: 5 minutes)
	 * @returns {Array|null} Array of event log objects or null if not cached/expired
	 */
	getCachedEventLogs(txHash, maxAge = 5 * 60 * 1000) {
		const cacheKey = txHash.toLowerCase();
		const cached = this.#cachedEventLogs[cacheKey];
		
		if (!cached) {
			return null;
		}
		
		// Check if cache is still valid
		if (Date.now() - cached.timestamp > maxAge) {
			delete this.#cachedEventLogs[cacheKey];
			return null;
		}
		
		return cached.eventLogs;
	}

	async waitBetweenTransactions() {
		while (this.#last_tx_ts > Date.now() - TIMEOUT_BETWEEN_TRANSACTIONS) {
			console.log(`will wait after the previous tx`);
			await wait(this.#last_tx_ts + TIMEOUT_BETWEEN_TRANSACTIONS - Date.now());
		}
	}

	async updateLastBlock(last_block) {
		if (!this.#bCatchingUp) // we handle events out of order while catching up
			await db.query("UPDATE last_blocks SET last_block=? WHERE network=?", [last_block, this.network]);
	}

	async getLastBlock() {
		const [{ last_block }] = await db.query("SELECT last_block FROM last_blocks WHERE network=?", [this.network]);
		return last_block;
	}

	/**
	 * Check if we have imported data for this network
	 * @returns {Promise<boolean>} True if we have imported transfers/claims from JSON export
	 */
	async hasImportedDataForNetwork() {
		try {
			const db = require('ocore/db.js');
			
			// Check if there's an entry in import_metadata for this network
			// This table is only populated when data is actually imported via import_db_for_seeding.js
			const importMetadata = await db.query(`
				SELECT network, last_block 
				FROM import_metadata 
				WHERE network = ?
			`, [this.network]);
			
			// If import_metadata exists for this network, data was imported
			return importMetadata.length > 0;
		} catch (e) {
			// If import_metadata table doesn't exist yet, return false
			return false;
		}
	}

	/**
	 * Check if we have imported data and should skip explorer/parser API calls
	 * If we have imported data from JSON export, we should use the last_blocks from import_metadata
	 * instead of querying explorers/parsers until we've processed all imported data
	 * @returns {Promise<number|null>} Maximum block number from imported data, or null if no imported data
	 */
	async getMaxBlockFromImportedData() {
		try {
			const db = require('ocore/db.js');
			
			// Check if we have imported data by looking at import_metadata table
			// This table is only populated when data is actually imported via import_db_for_seeding.js
			const importMetadata = await db.query(`
				SELECT network, last_block 
				FROM import_metadata 
				WHERE network = ?
			`, [this.network]);
			
			if (importMetadata.length === 0) {
				// No imported data for this network
				return null;
			}
			
			// We have imported data - use the last_block from import_metadata
			const importedLastBlock = importMetadata[0].last_block;
			
			// If last_block is very low (0 or default), it means the import didn't set it properly
			// In this case, return null to use normal logic
			if (importedLastBlock === 0 || importedLastBlock < 1000) {
				return null;
			}
			
			return importedLastBlock;
		} catch (e) {
			console.error(`${this.network} catchup: error checking imported data:`, e.message);
			return null;
		}
	}

	async getBlockNumber() {
		return await this.getBlockNumberWithRetry(0);
	}

	async getBlockNumberWithRetry(retryCount) {
		const maxRetries = 5;
		try {
			return await this.#provider.getBlockNumber();
		}
		catch (e) {
			const errMsg = e.toString();
			console.log(`getBlockNumber ${this.network} failed (attempt ${retryCount + 1}/${maxRetries}), will try again after waiting`, e);
			
			// Check for "could not detect network" error - this usually means WebSocket connection is broken
			if (errMsg.includes("could not detect network") || errMsg.includes("NETWORK_ERROR")) {
				console.log(`getBlockNumber ${this.network}: network detection failed, attempting provider reconnection...`);
				
				// Try to reconnect the provider if it's a WebSocket provider
				const provider = this.#provider;
				if (provider && provider._websocket) {
					try {
						// Close existing connection if it exists
						if (provider._websocket.readyState !== 3) { // 3 = CLOSED
							console.log(`getBlockNumber ${this.network}: closing existing WebSocket connection...`);
							provider._websocket.close();
						}
					} catch (closeError) {
						console.log(`getBlockNumber ${this.network}: error closing WebSocket:`, closeError.message);
					}
					
					// Wait a bit before retrying to allow connection to reset
					await wait(2000);
				}
			}
			
			if (retryCount >= maxRetries) {
				console.error(`getBlockNumber ${this.network} failed after ${maxRetries} retries, throwing error`);
				throw e;
			}
			
			// Handle "internal error" with longer delay (like processPastEvents)
			if (errMsg.includes("internal error") || errMsg.includes("temporarily unavailable")) {
				const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff: 1s, 2s, 4s, 8s, 10s max
				console.log(`getBlockNumber ${this.network} internal error detected, waiting ${delay}ms before retry`);
				await wait(delay);
			} else if (errMsg.includes("could not detect network") || errMsg.includes("NETWORK_ERROR")) {
				// Network errors: longer delay to allow reconnection
				const delay = Math.min(2000 * (retryCount + 1), 10000); // 2s, 4s, 6s, 8s, 10s max
				console.log(`getBlockNumber ${this.network} network error, waiting ${delay}ms before retry`);
				await wait(delay);
			} else {
				// Other errors: shorter delay
				await wait(100 * (retryCount + 1)); // 100ms, 200ms, 300ms, 400ms, 500ms
			}
			
			return await this.getBlockNumberWithRetry(retryCount + 1);
		}
	}

	async getTopAvailableBlock() {
		if (!this.getMaxBlockRange())
			return 0;
		const currentBlockNumber = await this.getBlockNumber();
		const top_available_block = currentBlockNumber - this.getMaxBlockRange() + 100;
		return top_available_block;
	}

	async getSinceBlock() {
		const last_block = Math.max(await this.getLastBlock() - 100, 0);
		if (!this.getMaxBlockRange())
			return last_block;
		console.log(`have max block range ${this.getMaxBlockRange()} on ${this.network}`);
		const top_available_block = await this.getTopAvailableBlock();
		if (last_block > top_available_block)
			return last_block;
		console.log(`getSinceBlock() missed ${top_available_block - last_block} blocks`, `${this.network} last block ${last_block}, top available block ${top_available_block}`);
		return top_available_block;
	}

	async getMyBalance(asset) {
		// Handle null/undefined asset
		if (asset === null || asset === undefined) {
			console.log(`getMyBalance called with null/undefined asset, treating as zero balance`);
			return BigNumber.from(0);
		}
		if (asset === AddressZero)
			return await this.#wallet.getBalance();
		const token = new ethers.Contract(asset, erc20Json.abi, this.#provider);
		return await token.balanceOf(this.#wallet.address);
	}

	async getBalance(address, asset, bExternalAddress, attempt = 0) {
		try {
			// Handle null/undefined asset
			if (asset === null || asset === undefined) {
				console.log(`getBalance called with null/undefined asset, treating as zero balance`);
				return BigNumber.from(0);
			}
			if (asset === AddressZero)
				return await this.#provider.getBalance(address);
			const token = new ethers.Contract(asset, erc20Json.abi, this.#provider);
			return await token.balanceOf(address);
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
	
	async getTransaction(txid) {
		return await this.#provider.getTransaction(txid);
	}

	async getBlockTimestamp(blockHash, bRetrying) {
		const block = await this.#provider.getBlock(blockHash);
		if (!block) {
			if (bRetrying)
				throw Error(`block ${blockHash} in ${this.network} not found`);
			console.log(`block ${blockHash} in ${this.network} not found, will retry`);
			await wait(15000);
			return await this.getBlockTimestamp(blockHash, true);
		}
		return block.timestamp;
	}

	async getBlockTimestampByNumber(blockNumber, bRetrying) {
		const block = await this.#provider.getBlock(blockNumber);
		if (!block) {
			if (bRetrying)
				throw Error(`block ${blockNumber} in ${this.network} not found`);
			console.log(`block ${blockNumber} in ${this.network} not found, will retry`);
			await wait(15000);
			return await this.getBlockTimestampByNumber(blockNumber, true);
		}
		return block.timestamp;
	}

	async getLastStableTimestamp(attempt = 0) {
		try {
			const currentBlockNumber = await this.getBlockNumber();
			if (!currentBlockNumber)
				throw Error(`no current block number in ${this.network}`);
			const last_finalized_block_number = Math.max(currentBlockNumber - conf.evm_count_blocks_for_finality, 0);
			
			let block;
			try {
				block = await this.#provider.getBlock(last_finalized_block_number);
			} catch (blockError) {
				// getBlock can throw exceptions (e.g., rate limiting, connection issues)
				// Retry with exponential backoff
				if (attempt < 3) {
					console.log(`getLastStableTimestamp ${this.network}: error fetching block ${last_finalized_block_number} (${blockError.message}), retrying (attempt ${attempt + 1}/3)...`);
					await wait((attempt + 1) * 2000); // 2s, 4s, 6s
					return this.getLastStableTimestamp(attempt + 1);
				}
				throw Error(`failed to get block ${last_finalized_block_number} after ${attempt + 1} attempts: ${blockError.message}`);
			}
			
			if (!block) {
				// Retry with exponential backoff if block is null
				if (attempt < 3) {
					console.log(`getLastStableTimestamp ${this.network}: block ${last_finalized_block_number} returned null, retrying (attempt ${attempt + 1}/3)...`);
					await wait((attempt + 1) * 2000); // 2s, 4s, 6s
					return this.getLastStableTimestamp(attempt + 1);
				}
				throw Error(`failed to get block ${last_finalized_block_number} after ${attempt + 1} attempts (returned null)`);
			}
			return block.timestamp;
		} catch (e) {
			// If retries exhausted or other error, try to get a more recent stable block
			if (attempt < 3 && (e.message.includes('failed to get block') || e.message.includes('error fetching block'))) {
				console.log(`getLastStableTimestamp ${this.network}: error getting block, retrying (attempt ${attempt + 1}/3)...`, e.message);
				await wait((attempt + 1) * 2000);
				return this.getLastStableTimestamp(attempt + 1);
			}
			// If still failing, try with a more conservative block number (further back)
			if (attempt === 0) {
				try {
					const currentBlockNumber = await this.getBlockNumber();
					if (currentBlockNumber) {
						const more_conservative_block = Math.max(currentBlockNumber - conf.evm_count_blocks_for_finality * 2, 0);
						console.log(`getLastStableTimestamp ${this.network}: trying more conservative block ${more_conservative_block}...`);
						const block = await this.#provider.getBlock(more_conservative_block);
						if (block)
							return block.timestamp;
					}
				} catch (e2) {
					console.log(`getLastStableTimestamp ${this.network}: conservative fallback also failed:`, e2.message);
				}
			}
			throw e;
		}
	}

	getMinTransferAge() {
		return conf.evm_min_transfer_age;
	}

	#cached_gas_price;
	#last_gas_price_ts;

	// returns gas price in gwei as a js number
	async getGasPrice() {
		console.log('getGasPrice', this.network)
		if (this.getStaticGasPrice()) {
			console.log(`${this.network} has static gas price ${this.getStaticGasPrice()} gwei`);
			return this.getStaticGasPrice();
		}
		if (this.#cached_gas_price && this.#last_gas_price_ts > Date.now() - 1 * 60 * 1000)
			return this.#cached_gas_price;
		console.log('provider getGasPrice', this.network)
		try {
			this.#cached_gas_price = (await asyncCallWithTimeout(this.#provider.getGasPrice(), 10 * 1000)).toNumber() / 1e9;
			if (this.getGasPriceMultiplier())
				this.#cached_gas_price *= this.getGasPriceMultiplier();
		}
		catch (e) {
			if (!this.#cached_gas_price)
				throw e;
			console.log('provider getGasPrice', this.network, 'failed', e, 'using old cached value', this.#cached_gas_price);
			this.#last_gas_price_ts = Date.now();
			return this.#cached_gas_price;
		}
		this.#last_gas_price_ts = Date.now();
		console.log(`${this.network} gas price ${this.#cached_gas_price} gwei`);
		return this.#cached_gas_price;
	}

	// returns floating number in display units of the claimed asset
	async getMinReward(type, claimed_asset, src_network, src_asset, bWithAssistant, bCached) {
		console.log('getMinReward', type, claimed_asset, src_network, src_asset, bWithAssistant);
		const gas = bWithAssistant ? conf.evm_required_gas_with_pooled_assistant : conf.evm_required_gas;
		const fee = gas * (await this.getGasPrice()) / 1e9; // in Ether, 1 gwei = 1e-9 ETH
		console.log(`required gas for claim+withdraw (${bWithAssistant ? 'pooled' : 'solo'}): ${fee.toFixed(18)} ${this.getNativeSymbol()}`);
		if (claimed_asset === AddressZero)
			return fee;
		try {
			const rate = await asyncCallWithTimeout(
				fetchExchangeRateInNativeAsset(type, this.network, claimed_asset, src_network, src_asset, bCached),
				30 * 1000 // 30 second timeout
			);
			if (!rate)
				return null;
			return fee / rate;
		} catch (e) {
			console.log(`getMinReward timeout for ${type} ${claimed_asset} ${src_network} ${src_asset}:`, e.message);
			return null;
		}
	}

	getMyAddress() {
		return this.#wallet.address;
	}

	isMyAddress(address) {
		// Normalize address before comparison (wallet.address is already checksummed from ethers)
		const normalizedAddress = normalizeAddress(address, this);
		return normalizedAddress === this.#wallet.address;
	}

	// only mixed case hex addresses are allowed (ICAP addresses not allowed)
	isValidAddress(address) {
		try {
			return address.length === 42 && address === ethers.utils.getAddress(address);
		}
		catch (e) {
			return false;
		}
	}

	isValidTxid(txid) {
		return !!txid.match(/^0x[0-9a-f]{64}$/);
	}

	isValidNonnativeAsset(asset) {
		return asset !== AddressZero && this.isValidAddress(asset);
	}

	isValidAsset(asset) {
		return asset === AddressZero || this.isValidNonnativeAsset(asset);
	}

	isValidData(data) {
		return true;
	}

	// both are strings
	dataMatches(sent_data, claimed_data) {
		return sent_data === claimed_data;
	}

	async isContract(address) {
		try {
			const code = await this.#provider.getCode(address);
			return code !== '0x';
		}
		catch (e) {
			return false;
		}
	}

	async getClaim(bridge_aa, claim_num, bFinished, bThrowIfNotFound) {
		const contract = this.#contractsByAddress[bridge_aa];
		let claim = await contract['getClaim(uint256)'](claim_num);
		if (!claim || !claim.amount) {
			if (bThrowIfNotFound)
				throw Error(`claim ${claim_num} not found in ${this.network}, bFinished=${bFinished}`);
			return null;
		}
		claim = Object.assign({}, claim);
		claim.current_outcome = claim.current_outcome ? 'yes' : 'no';
		claim.stakes = { yes: claim.yes_stake, no: claim.no_stake };

		// challenging_target was removed to save gas, recalculate it
		const winning_stake = claim.current_outcome === 'yes' ? claim.yes_stake : claim.no_stake;
		const settings = await contract.settings();
		claim.challenging_target = winning_stake.mul(settings.counterstake_coef100).div(100);

		return claim;
	}

	async getMyStake(bridge_aa, claim_num, outcome, assistant_aa) {
		const contract = this.#contractsByAddress[bridge_aa];
		const side = outcome === 'yes' ? 1 : 0;
		const my_stake = await contract.stakes(claim_num, side, assistant_aa || this.#wallet.address);
		return my_stake;
	}

	async getRequiredStake(bridge_aa, amount) {
		const contract = this.#contractsByAddress[bridge_aa];
		if (!contract)
			throw Error(`no contract for bridge ${bridge_aa} on ${this.network}`);
		return await contract.getRequiredStake(amount);
	}

	async getMinTxAge(bridge_aa, attempt = 0) {
		const contract = this.#contractsByAddress[bridge_aa];
		if (!contract)
			throw Error(`no contract by bridge AA ${bridge_aa}`);
		try {
			const settings = await asyncCallWithTimeout(contract.settings(), 120 * 1000);
			console.log('settings', this.network, bridge_aa, settings)
			cachedMinTxAges[this.network][bridge_aa] = settings.min_tx_age;
			return settings.min_tx_age;
		}
		catch (e) {
			console.log(`error in getMinTxAge attempt=${attempt}`, this.network, bridge_aa, e);
			if (cachedMinTxAges[this.network][bridge_aa]) {
				console.log(`using cached value for min tx age`);
				return cachedMinTxAges[this.network][bridge_aa];
			}
			if (attempt < 5) {
				console.log(`will retry getMinTxAge in 30s`);
				await wait(30_000);
				return this.getMinTxAge(bridge_aa, attempt + 1);
			}
			throw Error(`getMinTxAge ${this.network} ${bridge_aa} failed: ${e.toString()}`);
		}
	}

	async addAccessListIfNecessary(opts, claimed_asset, staked_asset, dest_address) {
		if (claimed_asset === staked_asset && staked_asset === AddressZero && await this.isContract(dest_address)) {
			opts.accessList = [{ address: dest_address, storageKeys: [] }];
			const code = await this.#provider.getCode(dest_address);
			try {
				const masterAddress = ethers.utils.getAddress('0x' + code.slice(22, 62));
				if (await this.isContract(masterAddress))
					opts.accessList.push({ address: masterAddress, storageKeys: [] });
			}
			catch(e){}
			console.log('using accessList', opts.accessList);
		}
	}

	async sendClaim({ bridge_aa, amount, reward, claimed_asset, stake, staked_asset, sender_address, dest_address, data, txid, txts }) {
		const unlock = await mutex.lock(this.network + 'Tx');
		console.log(`will send a claim to ${this.network}`, { bridge_aa, amount, reward, claimed_asset, stake, staked_asset, sender_address, dest_address, data, txid, txts });
		await this.waitBetweenTransactions();
		
		if (staked_asset !== AddressZero) {
			const approval_res = await this.approve(staked_asset, bridge_aa);
			if (!approval_res)
				throw Error(`failed to approve ${bridge_aa} to spend our ${staked_asset}`);
		}

		// Normalize dest_address before comparison (wallet.address is already checksummed from ethers)
		const normalized_dest_address = dest_address ? normalizeAddress(dest_address, this) : null;
		const bThirdPartyClaiming = (normalized_dest_address && normalized_dest_address !== this.#wallet.address);
		const paid_amount = bThirdPartyClaiming ? amount.sub(reward) : BigNumber.from(0);
		const total = (claimed_asset === staked_asset) ? stake.add(paid_amount) : stake;
		const contract = this.#contractsByAddress[bridge_aa];
		if (!contract)
			throw Error(`no contract by bridge AA ${bridge_aa}`);
		try {
			let opts = (staked_asset === AddressZero) ? { value: total } : { value: 0 };
			if (this.getGasPriceMultiplier())
				opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
			await this.addAccessListIfNecessary(opts, claimed_asset, staked_asset, dest_address);
			const res = await contract.claim(txid, txts, amount, reward, stake, sender_address, dest_address, data, opts);
			const claim_txid = res.hash;
			console.log(`sent claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}: ${claim_txid}`);
			this.#last_tx_ts = Date.now();
			if (this.#bWaitForMined)
				await res.wait();
		//	const receipt = await res.wait();
		//	console.log('tx mined, receipt', receipt, 'events', receipt.events, 'args', receipt.events[1].args);
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

	async sendClaimFromPooledAssistant({ assistant_aa, amount, reward, claimed_asset, staked_asset, sender_address, dest_address, data, txid, txts }) {
		const unlock = await mutex.lock(this.network + 'Tx');
		if (!dest_address)
			throw Error(`no dest address in assistant claim`);
	//	if (dest_address === this.#wallet.address)
	//		throw Error(`assistant claim for oneself`);
		await this.waitBetweenTransactions();
		const contract = this.#contractsByAddress[assistant_aa];
		try {
			let opts = {};
			if (this.getGasPriceMultiplier())
				opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
			await this.addAccessListIfNecessary(opts, claimed_asset, staked_asset, dest_address);
			const res = await contract.claim(txid, txts, amount, reward, sender_address, dest_address, data, opts);
			const claim_txid = res.hash;
			console.log(`sent assistant claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}: ${claim_txid}`);
			this.#last_tx_ts = Date.now();
			if (this.#bWaitForMined)
				await res.wait();
			unlock();
			return claim_txid;
		}
		catch (e) {
			console.log(`failed to send assistant claim for ${amount} with reward ${reward} sent in tx ${txid} from ${sender_address}`, e);
			unlock();
			return null;
		}
	}

	async sendChallenge(bridge_aa, claim_num, stake_on, asset, counterstake) {
		const unlock = await mutex.lock(this.network + 'Tx');
		await this.waitBetweenTransactions();
		const side = stake_on === 'yes' ? 1 : 0;
		const contract = this.#contractsByAddress[bridge_aa];
		let opts = { value: (asset === AddressZero) ? counterstake : 0 };
		if (this.getGasPriceMultiplier())
			opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
		const res = await contract['challenge(uint256,uint8,uint256)'](claim_num, side, counterstake, opts);
		const txid = res.hash;
		console.log(`sent counterstake ${counterstake} for "${stake_on}" to challenge claim ${claim_num}: ${txid}`);
		this.#last_tx_ts = Date.now();
		if (this.#bWaitForMined)
			await res.wait();
		unlock();
		return txid;
	}

	async sendChallengeFromPooledAssistant(assistant_aa, claim_num, stake_on, counterstake) {
		const unlock = await mutex.lock(this.network + 'Tx');
		await this.waitBetweenTransactions();
		const side = stake_on === 'yes' ? 1 : 0;
		const contract = this.#contractsByAddress[assistant_aa];
		let opts = {};
		if (this.getGasPriceMultiplier())
			opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
		const res = await contract.challenge(claim_num, side, counterstake, opts);
		const txid = res.hash;
		console.log(`sent assistant counterstake ${counterstake} for "${stake_on}" to challenge claim ${claim_num}: ${txid}`);
		this.#last_tx_ts = Date.now();
		if (this.#bWaitForMined)
			await res.wait();
		unlock();
		return txid;
	}

	async sendWithdrawalRequest(bridge_aa, claim_num, to_address) {
		const unlock = await mutex.lock(this.network + 'Tx');
		await this.waitBetweenTransactions();
		const contract = this.#contractsByAddress[bridge_aa];
		let opts = {};
		if (to_address) { // it must be an assistant contract
			const code = await this.#provider.getCode(to_address);
			const masterAddress = ethers.utils.getAddress('0x' + code.slice(22, 62));
			opts.accessList = [
				{ address: masterAddress, storageKeys: [] },
				{ address: to_address, storageKeys: ["0x0000000000000000000000000000000000000000000000000000000000000007"] },
			];
			opts.gasLimit = 300000;
		}
		if (this.getGasPriceMultiplier())
			opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
		const res = to_address
			? await contract['withdraw(uint256,address)'](claim_num, to_address, opts)
			: await contract['withdraw(uint256)'](claim_num, opts);
		const txid = res.hash;
		console.log(`sent withdrawal request on claim ${claim_num} to ${to_address || 'self'}: ${txid}`);
		this.#last_tx_ts = Date.now();
		if (this.#bWaitForMined)
			await res.wait();
		unlock();
		return txid;
	}

	async sendPayment(asset, address, amount, recipient_device_address) {
		let res;
		if (asset === AddressZero) {
			let opts = { to: address, value: amount };
			if (this.getGasPriceMultiplier())
				opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
			res = await this.#wallet.sendTransaction(opts);
		}
		else {
			const contract = new ethers.Contract(asset, erc20Json.abi, this.#wallet);
			let opts = {};
			if (this.getGasPriceMultiplier())
				opts.gasPrice = Math.round(1e9 * (await this.getGasPrice()));
			res = await contract.transfer(address, amount, opts);
		}
		const txid = res.hash;
		console.log(`sent payment ${amount} ${asset} to ${address}: ${txid}`);
		if (this.#bWaitForMined)
			await res.wait();
		return txid;
	}


	startWatchingExportAA(export_aa) {
		// Use listener provider for event listening to ensure events are caught from the listener provider
		// Keep wallet-based contract for transactions (stored separately if needed)
		const listenerProvider = this.getListenerProvider();
		const contract = new ethers.Contract(export_aa, exportJson.abi, listenerProvider);
		contract.on('NewExpatriation', this.onNewExpatriation.bind(this));
		// Also listen for NewRepatriation on export contracts (for bidirectional bridges like 3DPass)
		// The getType function returns 'repatriation' when address matches export_aa
		if (contract.filters.NewRepatriation) {
			contract.on('NewRepatriation', this.onNewRepatriation.bind(this));
		}
		this.addCounterstakeEventHandlers(contract);
		this.#contractsByAddress[export_aa] = contract;
	}

	startWatchingImportAA(import_aa) {
		// Use listener provider for event listening to ensure events are caught from the listener provider
		// Keep wallet-based contract for transactions (stored separately if needed)
		const listenerProvider = this.getListenerProvider();
		const contract = new ethers.Contract(import_aa, importJson.abi, listenerProvider);
		contract.on('NewRepatriation', this.onNewRepatriation.bind(this));
		this.addCounterstakeEventHandlers(contract);
		this.#contractsByAddress[import_aa] = contract;
	}


	addCounterstakeEventHandlers(contract) {
		contract.on('NewClaim', this.onNewClaim.bind(this));
		contract.on('NewChallenge', this.onNewChallenge.bind(this));
		contract.on('FinishedClaim', this.onFinishedClaim.bind(this));
	}

	async onNewExpatriation(sender_address, amount, reward, foreign_address, data, event) {
		const unlock = await mutex.lock(this.network + 'Event');
		console.log('NewExpatriation event', this.network, sender_address, amount.toString(), reward.toString(), foreign_address, data, event);
		const txid = event.transactionHash;
		// If blockHash is null (from parser), use blockNumber to get timestamp
		// If blockHash exists but getBlockTimestamp fails, fall back to blockNumber
		let txts;
		if (event.blockHash) {
			try {
				txts = await this.getBlockTimestamp(event.blockHash);
			} catch (blockHashError) {
				console.log(`⚠️  Failed to get timestamp from blockHash ${event.blockHash}, falling back to blockNumber ${event.blockNumber}: ${blockHashError.message}`);
				if (event.blockNumber) {
					txts = await this.getBlockTimestampByNumber(event.blockNumber);
				} else {
					throw blockHashError;
				}
			}
		} else {
			txts = await this.getBlockTimestampByNumber(event.blockNumber);
		}
		const bridge = await transfers.getBridgeByAddress(event.address, true);
		const { bridge_id, export_aa } = bridge;
		// Normalize addresses for comparison (addresses are stored checksummed in DB, but normalize for consistency)
		// Use centralized normalizeAddress function instead of ethers.utils.getAddress()
		const checksummedEventAddress = normalizeAddress(event.address, this);
		const checksummedExportAa = normalizeAddress(export_aa, this);
		if (checksummedExportAa && checksummedEventAddress !== checksummedExportAa)
			throw Error(`expatriation on non-export address? export_aa=${export_aa}, address=${event.address}`);
		// Normalize addresses to checksummed format for consistent matching
		// Use centralized normalizeAddress function
		sender_address = normalizeAddress(sender_address, this);
		// Only normalize foreign_address if it's a valid EVM address
		// foreign_address can be from any foreign chain (Stellar, Obyte, etc.)
		foreign_address = normalizeAddress(foreign_address, this);
		const transfer = { bridge_id, type: 'expatriation', amount, reward, sender_address, dest_address: foreign_address, data, txid, txts };
		
		// Early duplicate check during catchup to avoid unnecessary work
		if (this.#bCatchingUp && !event.removed) {
			const db = require('ocore/db.js');
			const [existing] = await db.query("SELECT transfer_id FROM transfers WHERE txid=? AND bridge_id=? AND amount=? AND reward=? AND sender_address=? AND dest_address=? AND data=? AND is_confirmed=1", [txid, bridge_id, amount.toString(), reward.toString(), sender_address, foreign_address, data]);
			if (existing) {
				console.log(`duplicate transfer during catchup, skipping: txid=${txid}, bridge_id=${bridge_id}`);
				await this.updateLastBlock(event.blockNumber);
				return unlock();
			}
		}
		
		console.log('transfer', transfer);
		event.removed ? await transfers.removeTransfer(transfer) : await transfers.addTransfer(transfer, true);
		await this.updateLastBlock(event.blockNumber);
		unlock();
	}

	async onNewRepatriation(sender_address, amount, reward, home_address, data, event) {
		const unlock = await mutex.lock(this.network + 'Event');
		console.log('NewRepatriation event', this.network, sender_address, amount.toString(), reward.toString(), home_address, data, event);
		try {
			const txid = event.transactionHash;
			// If blockHash is null (from parser), use blockNumber to get timestamp
			// If blockHash exists but getBlockTimestamp fails, fall back to blockNumber
			let txts;
			if (event.blockHash) {
				try {
					txts = await this.getBlockTimestamp(event.blockHash);
				} catch (blockHashError) {
					console.log(`⚠️  Failed to get timestamp from blockHash ${event.blockHash}, falling back to blockNumber ${event.blockNumber}: ${blockHashError.message}`);
					if (event.blockNumber) {
						txts = await this.getBlockTimestampByNumber(event.blockNumber);
					} else {
						throw blockHashError;
					}
				}
			} else {
				txts = await this.getBlockTimestampByNumber(event.blockNumber);
			}
			const bridge = await transfers.getBridgeByAddress(event.address, true);
			const { bridge_id, import_aa, export_aa } = bridge;
			// NewRepatriation can come from either import_aa or export_aa (for bidirectional bridges)
			// The getType function determines the type based on which address matches
			// Normalize addresses for comparison (addresses are stored checksummed in DB, but normalize for consistency)
			// Use centralized normalizeAddress function instead of ethers.utils.getAddress()
			const checksummedEventAddress = normalizeAddress(event.address, this);
			const checksummedImportAa = normalizeAddress(import_aa, this);
			const checksummedExportAa = normalizeAddress(export_aa, this);
			if (checksummedImportAa && checksummedEventAddress !== checksummedImportAa && checksummedExportAa && checksummedEventAddress !== checksummedExportAa)
				throw Error(`repatriation on unknown address? import_aa=${import_aa}, export_aa=${export_aa}, address=${event.address}`);
			// Normalize addresses to checksummed format for consistent matching
			// Use centralized normalizeAddress function
			sender_address = normalizeAddress(sender_address, this);
			// Only normalize home_address if it's a valid EVM address
			// home_address can be from any foreign chain (Obyte, etc.)
			home_address = normalizeAddress(home_address, this);
			const transfer = { bridge_id, type: 'repatriation', amount, reward, sender_address, dest_address: home_address, data, txid, txts };
			
			// Early duplicate check during catchup to avoid unnecessary work
			if (this.#bCatchingUp && !event.removed) {
				const db = require('ocore/db.js');
				const [existing] = await db.query("SELECT transfer_id FROM transfers WHERE txid=? AND bridge_id=? AND amount=? AND reward=? AND sender_address=? AND dest_address=? AND data=? AND is_confirmed=1", [txid, bridge_id, amount.toString(), reward.toString(), sender_address, home_address, data]);
				if (existing) {
					console.log(`duplicate transfer during catchup, skipping: txid=${txid}, bridge_id=${bridge_id}`);
					await this.updateLastBlock(event.blockNumber);
					return unlock();
				}
			}
			
			event.removed ? await transfers.removeTransfer(transfer) : await transfers.addTransfer(transfer, true);
			await this.updateLastBlock(event.blockNumber);
		} catch (error) {
			console.log(`❌ Error in onNewRepatriation: ${error.message}`);
			console.log(`   Event details: sender=${sender_address}, amount=${amount}, reward=${reward}, home_address=${home_address}, event.address=${event.address}`);
			console.log(`   Stack: ${error.stack}`);
		} finally {
			unlock();
		}
	}

	async onNewClaim(claim_num, author_address, sender_address, recipient_address, txid, txts, amount, reward, stake, data, expiry_ts, event) {
		const unlock = await mutex.lock(this.network + 'Event');
		claim_num = claim_num.toNumber();
		console.log('NewClaim event', this.network, claim_num, author_address, sender_address, recipient_address, txid, txts, amount.toString(), reward.toString(), stake.toString(), data, expiry_ts, event);
		if (event.removed)
			return unlock(`the claim event was removed, ignoring`);
		const bridge = await transfers.getBridgeByAddress(event.address, true);
		const type = getType(event.address, bridge);
		
		// Early duplicate check during catchup to avoid unnecessary work
		if (this.#bCatchingUp) {
			const db = require('ocore/db.js');
			const [existing] = await db.query("SELECT claim_num FROM claims WHERE claim_num=? AND bridge_id=? AND type=?", [claim_num, bridge.bridge_id, type]);
			if (existing) {
				console.log(`duplicate claim during catchup, skipping: claim_num=${claim_num}, bridge_id=${bridge.bridge_id}, type=${type}`);
				await this.updateLastBlock(event.blockNumber);
				return unlock();
			}
		}
		
		// Normalize addresses to checksummed format for consistent matching
		// Use centralized normalizeAddress function
		// sender_address can be from any chain, so normalize it (will only checksum if EVM)
		// recipient_address and author_address should be EVM addresses, but normalize handles both
		sender_address = normalizeAddress(sender_address, this);
		recipient_address = normalizeAddress(recipient_address, this);
		author_address = normalizeAddress(author_address, this);
		const dest_address = recipient_address;
		const claimant_address = author_address;
		await transfers.handleNewClaim(bridge, type, claim_num, sender_address, dest_address, claimant_address, data, amount, reward, stake, txid, txts, event.transactionHash);
		await this.updateLastBlock(event.blockNumber);
		unlock();
	}

	async onNewChallenge(claim_num, author_address, stake, outcome, current_outcome, yes_stake, no_stake, expiry_ts, challenging_target, event) {
		const unlock = await mutex.lock(this.network + 'Event');
		claim_num = claim_num.toNumber();
		console.log('NewChallenge event', this.network, claim_num, author_address, stake.toString(), outcome, current_outcome, yes_stake, no_stake, expiry_ts, challenging_target, event);
		if (event.removed)
			return unlock(`the challenge event was removed, ignoring`);
		const bridge = await transfers.getBridgeByAddress(event.address, true);
		const type = getType(event.address, bridge);
		
		// Early duplicate check during catchup to avoid unnecessary work
		if (this.#bCatchingUp) {
			const db = require('ocore/db.js');
			const challenge_txid = event.transactionHash;
			const [existing] = await db.query("SELECT challenge_id FROM challenges WHERE challenge_txid=? AND bridge_id=?", [challenge_txid, bridge.bridge_id]);
			if (existing) {
				console.log(`duplicate challenge during catchup, skipping: challenge_txid=${challenge_txid}, bridge_id=${bridge.bridge_id}`);
				await this.updateLastBlock(event.blockNumber);
				return unlock();
			}
		}
		
		// Normalize address to checksummed format for consistent matching
		// Use centralized normalizeAddress function
		author_address = normalizeAddress(author_address, this);
		await transfers.handleChallenge(bridge, type, claim_num, author_address, outcome ? 'yes' : 'no', stake, event.transactionHash);
		await this.updateLastBlock(event.blockNumber);
		unlock();
	}

	async onFinishedClaim(claim_num, outcome, event) {
		const unlock = await mutex.lock(this.network + 'Event');
		claim_num = claim_num.toNumber();
		console.log('FinishedClaim event', this.network, claim_num, outcome, event);
		if (event.removed)
			return unlock(`the finish event was removed, ignoring`);
		const bridge = await transfers.getBridgeByAddress(event.address, true);
		const type = getType(event.address, bridge);
		await transfers.handleWithdrawal(bridge, type, claim_num, event.transactionHash);
		await this.updateLastBlock(event.blockNumber);
		unlock();
	}


	async getDecimals(tokenAddress) {
		if (tokenAddress === AddressZero)
			return 18;
		const token = new ethers.Contract(tokenAddress, erc20Json.abi, this.#provider);
		try {
			return await token.decimals();
		}
		catch (e) {
			console.log(`getDecimals(${tokenAddress}) failed`, e);
			return null;
		}
	}

	async getSymbol(tokenAddress) {
		if (tokenAddress === AddressZero)
			return this.getNativeSymbol();
		const token = new ethers.Contract(tokenAddress, erc20Json.abi, this.#provider);
		try {
			return await token.symbol();
		}
		catch (e) {
			console.log(`getSymbol(${tokenAddress}) failed`, e);
			return null;
		}
	}

	async approve(tokenAddress, spenderAddress) {
		if (tokenAddress === AddressZero)
			throw Error(`don't need to approve ETH`);
		if (this.#approved[tokenAddress + '-' + spenderAddress])
			return "already approved";
		const token = new ethers.Contract(tokenAddress, erc20Json.abi, this.#wallet);
		try {
			const allowance = await token.allowance(this.#wallet.address, spenderAddress);
			if (allowance.gt(0)) {
				console.log(`spender ${spenderAddress} already approved`);
				this.#approved[tokenAddress + '-' + spenderAddress] = true;
				return "already approved";
			}
			console.log(`will approve spender ${spenderAddress} to spend our token ${tokenAddress}`);
			const res = await token.approve(spenderAddress, BigNumber.from(2).pow(256).sub(1));
			if (this.#bWaitForMined)
				await res.wait();
			this.#approved[tokenAddress + '-' + spenderAddress] = true;
			return res;
		}
		catch (e) {
			console.log(`approve(${spenderAddress}) failed`, e);
			return null;
		}
	}

	getNativeSymbol() {
		throw Error(`getNativeSymbol should be implemented in descendant classes`);
	}

	async waitForTransaction(txid) {
		const receipt = await this.#provider.waitForTransaction(txid);
		if (!receipt.status)
			console.log(`tx ${txid} reverted: `, receipt);
		return receipt.status;
	}

	async waitUntilSynced() {
		// assuming always synced
	}

	// returns true if the transfer event might have appeared after refreshing
	async refresh(txid) {
		console.log(`will refresh trying to find tx ${txid} in ${this.network}`);
		if (!this.isValidTxid(txid)) {
			console.log(`invalid tx format ${txid} in ${this.network}`);
			return false;
		}
		const tx = await this.getTransaction(txid);
		if (!tx) {
			console.log(`tx ${txid} not found in ${this.network}`);
			return false;
		}
		if (!tx.blockNumber) {
			console.log(`tx ${txid} found but not mined in ${this.network}`);
			return false;
		}
		const since_block = tx.blockNumber;
		let to_block = 0;
		const block_range = this.getMaxBlockRange();
		if (block_range) {
			const top_available_block = await this.getTopAvailableBlock();
			if (top_available_block > since_block - 100) {
				to_block = since_block + block_range;
				console.log(`tx ${txid} exists but is out of block range, will scan events until block ${to_block}`);
			}
		}
		// rescan transfers since that block in case we missed them
		console.log(`will rescan past events trying to find the transfer event in tx ${txid} in ${this.network}`);
		for (let address in this.#contractsByAddress) {
			const contract = this.#contractsByAddress[address];
			if (!contract.filters.NewClaim) // not a bridge, must be an assistant
				continue;
			if (contract.filters.NewExpatriation)
				await processPastEvents(contract, contract.filters.NewExpatriation(), since_block, to_block, this, this.onNewExpatriation);
			if (contract.filters.NewRepatriation)
				await processPastEvents(contract, contract.filters.NewRepatriation(), since_block, to_block, this, this.onNewRepatriation);
		}
		return true;
	}

	async startWatchingSymbolUpdates() {
		// assuming symbols are never updated
	}

	async startWatchingFactories() {
		console.log(`🏭 Starting factory monitoring for ${this.network}...`);
		try {
			if (!this.#factory_contract_addresses || Object.keys(this.#factory_contract_addresses).length === 0) {
				console.log(`⚠️  No factory contract addresses configured for ${this.network}`);
				return;
			}
			console.log(`📋 ${this.network} factory addresses:`, Object.values(this.#factory_contract_addresses));
		
		const onNewExport = async (contractAddress, tokenAddress, foreign_network, foreign_asset, event) => {
			// Normalize addresses before processing (handleNewExportAA will also normalize, but normalize here for consistency)
			const normalizedContractAddress = normalizeAddress(contractAddress, this);
			const normalizedTokenAddress = tokenAddress !== AddressZero ? normalizeAddress(tokenAddress, this) : tokenAddress;
			// foreign_asset is on the foreign network, so we need to get the foreign network API to normalize it correctly
			const networkApi = require('./transfers.js').networkApi;
			const foreignNetworkApi = networkApi[foreign_network];
			const normalizedForeignAsset = normalizeAddress(foreign_asset, foreignNetworkApi);
			
			const decimals = await this.getDecimals(normalizedTokenAddress);
			if (decimals === null)
				return console.log(`not adding new export contract ${normalizedContractAddress} as its token ${normalizedTokenAddress} didn't return decimals`);
			/*if (normalizedTokenAddress !== AddressZero && conf.bUseOwnFunds) {
				console.log(`will approve the export contract to spend our ERC20 ${normalizedTokenAddress}`);
				const approval_res = await this.approve(normalizedTokenAddress, normalizedContractAddress);
				if (!approval_res)
					return console.log(`failed to approve new export contract ${normalizedContractAddress} to spend our token ${normalizedTokenAddress}, will not add`);
			}*/
			const version = getVersion(this.#factory_contract_addresses, event.address);
			if (!version)
				throw Error(`undefined version of new export ${normalizedContractAddress} ${JSON.stringify(event)}`);
			
			// Normalize network names to ensure consistency
			const normalizedForeignNetwork = foreign_network === '3dpass' ? '3DPass' : foreign_network;
			
			const bAdded = await transfers.handleNewExportAA(normalizedContractAddress, this.network, normalizedTokenAddress, decimals, normalizedForeignNetwork, normalizedForeignAsset, version);
			if (bAdded)
				this.startWatchingExportAA(normalizedContractAddress);
		};
		const onNewImport = async (contractAddress, home_network, home_asset, symbol, stakeTokenAddress, event) => {
			// Normalize addresses before processing (handleNewImportAA will also normalize, but normalize here for consistency)
			const normalizedContractAddress = normalizeAddress(contractAddress, this);
			const normalizedHomeAsset = normalizeAddress(home_asset, this);
			const normalizedStakeTokenAddress = stakeTokenAddress !== AddressZero ? normalizeAddress(stakeTokenAddress, this) : stakeTokenAddress;
			
			const version = getVersion(this.#factory_contract_addresses, event.address);
			if (!version)
				throw Error(`undefined version of new import ${normalizedContractAddress} ${JSON.stringify(event)}`);
			
			// Normalize network names to ensure consistency
			const normalizedHomeNetwork = home_network === '3dpass' ? '3DPass' : home_network;
			
			const bAdded = await transfers.handleNewImportAA(normalizedContractAddress, normalizedHomeNetwork, normalizedHomeAsset, this.network, normalizedContractAddress, 18, normalizedStakeTokenAddress, version);
			if (bAdded)
				this.startWatchingImportAA(normalizedContractAddress);
		};
		for (let v in this.#factory_contract_addresses) {
			const factory_contract_address = this.#factory_contract_addresses[v];
			console.log(`🔧 Setting up factory ${factory_contract_address} (version ${v}) for ${this.network}...`);
			// Use listener provider for event listening to ensure events are caught from the listener provider
			const listenerProvider = this.getListenerProvider();
			const contract = new ethers.Contract(factory_contract_address, factoryJson.abi, listenerProvider);
			contract.on('NewExport', onNewExport);
			contract.on('NewImport', onNewImport);

		const processPastEventsOnContract = async (from_block, to_block) => {
			console.log('factories processPastEventsOnContract', this.network, from_block, to_block);
			await processPastEvents(contract, contract.filters.NewExport(), from_block, to_block, this, onNewExport);
			await processPastEvents(contract, contract.filters.NewImport(), from_block, to_block, this, onNewImport);
		};
		
			try {
				// Check if connection is still alive before making provider calls
				const provider = this.getProvider();
				const isConnected = provider && provider._websocket && provider._websocket.readyState === 1;
				
				if (!isConnected) {
					console.log(`⚠️  ${this.network} WebSocket not connected, skipping block number checks but will still call getAddressBlocks for factory ${factory_contract_address}`);
					// Even if disconnected, try to get address blocks - this uses Etherscan API, not WebSocket
					try {
						console.log(`📡 Calling getAddressBlocks for factory ${factory_contract_address} on ${this.network} via Etherscan API (chainid ${this.network === 'BSC' ? 56 : this.network === 'Ethereum' ? 1 : 'unknown'})...`);
						const blocks = await Promise.race([
							this.getAddressBlocks(factory_contract_address, 0), // Start from block 0 if we can't get current block
							new Promise((_, reject) => setTimeout(() => reject(new Error(`getAddressBlocks timeout after 30s`)), 30000))
						]);
						console.log(`✅ ${this.network} factory ${factory_contract_address} blocks of missed txs:`, blocks);
						for (let blockNumber of blocks) {
							await processPastEventsOnContract(blockNumber, blockNumber);
						}
					} catch (err) {
						console.error(`⚠️  Failed to get address blocks for factory ${factory_contract_address} on ${this.network}:`, err.message);
						console.error(`   This may be due to network disconnection, API timeout, or rate limiting. Will continue with regular event processing.`);
					}
					// Skip the rest if disconnected
					continue;
				}
				
				// get factory events that are beyond the block range
				console.log(`📊 Getting block info for ${this.network} factory ${factory_contract_address}...`);
				const last_block = Math.max(await this.getLastBlock() - 100, 0);
				const top_available_block = await this.getTopAvailableBlock();
				console.log(`📊 ${this.network} factory ${factory_contract_address}: last_block=${last_block}, top_available_block=${top_available_block}`);
				
				if (top_available_block > last_block) {
					console.log(this.network, 'factories top available block', top_available_block, '> last block', last_block);
					try {
						console.log(`📡 Calling getAddressBlocks for factory ${factory_contract_address} on ${this.network} from block ${last_block} via Etherscan API (chainid ${this.network === 'BSC' ? 56 : this.network === 'Ethereum' ? 1 : 'unknown'})...`);
						// Add timeout to prevent hanging - 30 seconds should be enough for API calls
						const blocks = await Promise.race([
							this.getAddressBlocks(factory_contract_address, last_block),
							new Promise((_, reject) => setTimeout(() => reject(new Error(`getAddressBlocks timeout after 30s`)), 30000))
						]);
						console.log('factories blocks of missed txs', this.network, blocks);
						for (let blockNumber of blocks) {
							await processPastEventsOnContract(blockNumber, blockNumber);
						}
					} catch (err) {
						console.error(`⚠️  Failed to get address blocks for factory ${factory_contract_address} on ${this.network}:`, err.message);
						console.error(`   This may be due to network disconnection, API timeout, or rate limiting. Will continue with regular event processing.`);
					}
				} else {
					console.log(`ℹ️  ${this.network} factory ${factory_contract_address}: no missed blocks (top_available_block=${top_available_block} <= last_block=${last_block})`);
			}

			const since_block = await this.getSinceBlock();
			console.log(`📜 Processing past events for ${this.network} factory ${factory_contract_address} from block ${since_block}...`);
			await processPastEventsOnContract(since_block, 0);
				console.log(`✅ Completed factory monitoring setup for ${factory_contract_address} on ${this.network}`);
			} catch (err) {
				console.error(`❌ Error in startWatchingFactories for ${this.network}:`, err.message);
				console.error(`   Factory address: ${factory_contract_address}`);
				console.error(`   Error stack:`, err.stack);
				// Continue with other factories even if one fails
			}
		}
		console.log(`✅ Factory monitoring setup completed for ${this.network}`);
		} catch (err) {
			console.error(`❌ Error in startWatchingFactories for ${this.network}:`, err.message);
			console.error(`   Error stack:`, err.stack);
			throw err; // Re-throw so transfers.js can catch it
		}
	}

	
	// assistants

	startWatchingExportAssistantAA(export_assistant_aa) {
		// Use listener provider for event listening
		const listenerProvider = this.getListenerProvider();
		const contract = new ethers.Contract(export_assistant_aa, exportAssistantJson.abi, listenerProvider);
		
		// Add NewManager event listener
		const onNewManager = async (previousManager, newManager, event) => {
			console.log(`NewManager event for Export Assistant ${export_assistant_aa}`, { previousManager, newManager, network: this.network });
			await transfers.handleNewManager(export_assistant_aa, previousManager, newManager, this.network);
		};
		
		contract.on('NewManager', onNewManager);
		this.#contractsByAddress[export_assistant_aa] = contract;
		
		// Process past NewManager events for this assistant
		this.processPastNewManagerEvents(contract, export_assistant_aa, onNewManager);
	}

	startWatchingImportAssistantAA(import_assistant_aa) {
		// Use listener provider for event listening
		const listenerProvider = this.getListenerProvider();
		const contract = new ethers.Contract(import_assistant_aa, importAssistantJson.abi, listenerProvider);
		
		// Add NewManager event listener
		const onNewManager = async (previousManager, newManager, event) => {
			console.log(`NewManager event for Import Assistant ${import_assistant_aa}`, { previousManager, newManager, network: this.network });
			await transfers.handleNewManager(import_assistant_aa, previousManager, newManager, this.network);
		};
		
		contract.on('NewManager', onNewManager);
		this.#contractsByAddress[import_assistant_aa] = contract;
		
		// Process past NewManager events for this assistant
		this.processPastNewManagerEvents(contract, import_assistant_aa, onNewManager);
	}

	async processPastNewManagerEvents(contract, assistant_aa, onNewManager) {
		try {
			const since_block = await this.getSinceBlock();
			const last_block = await this.getLastBlock();
			
			console.log(`Processing past NewManager events for assistant ${assistant_aa} from block ${since_block} to ${last_block}`);
			
			await processPastEvents(contract, contract.filters.NewManager(), since_block, last_block, this, onNewManager);
		} catch (err) {
			console.log(`Error processing past NewManager events for assistant ${assistant_aa}: ${err.message}`);
		}
	}

	async startWatchingAssistantFactories() {
		console.log(`🏭 Starting assistant factory monitoring for ${this.network}...`);
		try {
			if (!this.#assistant_factory_contract_addresses || Object.keys(this.#assistant_factory_contract_addresses).length === 0) {
				console.log(`⚠️  No assistant factory contract addresses configured for ${this.network}`);
				return;
			}
			console.log(`📋 ${this.network} assistant factory addresses:`, Object.values(this.#assistant_factory_contract_addresses));
		
		const onNewExportAssistant = async (assistantAddress, bridgeAddress, manager, symbol, event) => {
		//	if (manager !== this.#wallet.address)
		//		return console.log(`new assistant ${assistantAddress} with another manager, will skip`);
			// Normalize addresses before processing (handleNewAssistantAA will also normalize, but normalize here for consistency)
			const normalizedAssistantAddress = normalizeAddress(assistantAddress, this);
			const normalizedBridgeAddress = normalizeAddress(bridgeAddress, this);
			const normalizedManager = normalizeAddress(manager, this);
			
			console.log(`new export assistant ${normalizedAssistantAddress}, shares ${symbol}`);
			const version = getVersion(this.#assistant_factory_contract_addresses, event.address);
			if (!version)
				throw Error(`undefined version of new export assistant ${normalizedAssistantAddress} ${JSON.stringify(event)}`);
			const bAdded = await transfers.handleNewAssistantAA('export', normalizedAssistantAddress, normalizedBridgeAddress, this.network, normalizedManager, normalizedAssistantAddress, symbol, version);
			if (bAdded)
				this.startWatchingExportAssistantAA(normalizedAssistantAddress);
		};
		const onNewImportAssistant = async (assistantAddress, bridgeAddress, manager, symbol, event) => {
		//	if (manager !== this.#wallet.address)
		//		return console.log(`new assistant ${assistantAddress} with another manager, will skip`);
			// Normalize addresses before processing (handleNewAssistantAA will also normalize, but normalize here for consistency)
			const normalizedAssistantAddress = normalizeAddress(assistantAddress, this);
			const normalizedBridgeAddress = normalizeAddress(bridgeAddress, this);
			const normalizedManager = normalizeAddress(manager, this);
			
			console.log(`new import assistant ${normalizedAssistantAddress}, shares ${symbol}`);
			const version = getVersion(this.#assistant_factory_contract_addresses, event.address);
			if (!version)
				throw Error(`undefined version of new import assistant ${normalizedAssistantAddress} ${JSON.stringify(event)}`);
			const bAdded = await transfers.handleNewAssistantAA('import', normalizedAssistantAddress, normalizedBridgeAddress, this.network, normalizedManager, normalizedAssistantAddress, symbol, version);
			if (bAdded)
				this.startWatchingImportAssistantAA(normalizedAssistantAddress);
		};
		for (let v in this.#assistant_factory_contract_addresses) {
			const assistant_factory_contract_address = this.#assistant_factory_contract_addresses[v];
			console.log(`🔧 Setting up assistant factory ${assistant_factory_contract_address} (version ${v}) for ${this.network}...`);
			// Use listener provider for event listening to ensure events are caught from the listener provider
			const listenerProvider = this.getListenerProvider();
			const contract = new ethers.Contract(assistant_factory_contract_address, assistantFactoryJson.abi, listenerProvider);
			contract.on('NewExportAssistant', onNewExportAssistant);
			contract.on('NewImportAssistant', onNewImportAssistant);

		const processPastEventsOnContract = async (from_block, to_block) => {
			console.log('assistants processPastEventsOnContract', this.network, from_block, to_block);
			await processPastEvents(contract, contract.filters.NewExportAssistant(), from_block, to_block, this, onNewExportAssistant);
			await processPastEvents(contract, contract.filters.NewImportAssistant(), from_block, to_block, this, onNewImportAssistant);
		};

			try {
				// Check if connection is still alive before making provider calls
				const provider = this.getProvider();
				const isConnected = provider && provider._websocket && provider._websocket.readyState === 1;
				
				if (!isConnected) {
					console.log(`⚠️  ${this.network} WebSocket not connected, skipping block number checks but will still call getAddressBlocks for assistant factory ${assistant_factory_contract_address}`);
					// Even if disconnected, try to get address blocks - this uses Etherscan API, not WebSocket
					try {
						console.log(`📡 Calling getAddressBlocks for assistant factory ${assistant_factory_contract_address} on ${this.network} via Etherscan API (chainid ${this.network === 'BSC' ? 56 : this.network === 'Ethereum' ? 1 : 'unknown'})...`);
						const blocks = await Promise.race([
							this.getAddressBlocks(assistant_factory_contract_address, 0), // Start from block 0 if we can't get current block
							new Promise((_, reject) => setTimeout(() => reject(new Error(`getAddressBlocks timeout after 30s`)), 30000))
						]);
						console.log(`✅ ${this.network} assistant factory ${assistant_factory_contract_address} blocks of missed txs:`, blocks);
						for (let blockNumber of blocks) {
							await processPastEventsOnContract(blockNumber, blockNumber);
						}
					} catch (err) {
						console.error(`⚠️  Failed to get address blocks for assistant factory ${assistant_factory_contract_address} on ${this.network}:`, err.message);
						console.error(`   This may be due to network disconnection, API timeout, or rate limiting. Will continue with regular event processing.`);
					}
					// Skip the rest if disconnected
					continue;
				}
				
				// get factory events that are beyond the block range
				console.log(`📊 Getting block info for ${this.network} assistant factory ${assistant_factory_contract_address}...`);
				const last_block = Math.max(await this.getLastBlock() - 100, 0);
				const top_available_block = await this.getTopAvailableBlock();
				console.log(`📊 ${this.network} assistant factory ${assistant_factory_contract_address}: last_block=${last_block}, top_available_block=${top_available_block}`);
				
				if (top_available_block > last_block) {
					console.log(this.network, 'assistants top available block', top_available_block, '> last block', last_block);
					try {
						console.log(`📡 Calling getAddressBlocks for assistant factory ${assistant_factory_contract_address} on ${this.network} from block ${last_block} via Etherscan API (chainid ${this.network === 'BSC' ? 56 : this.network === 'Ethereum' ? 1 : 'unknown'})...`);
						// Add timeout to prevent hanging - 30 seconds should be enough for API calls
						const blocks = await Promise.race([
							this.getAddressBlocks(assistant_factory_contract_address, last_block),
							new Promise((_, reject) => setTimeout(() => reject(new Error(`getAddressBlocks timeout after 30s`)), 30000))
						]);
						console.log('assistants blocks of missed txs', this.network, blocks);
						for (let blockNumber of blocks) {
							await processPastEventsOnContract(blockNumber, blockNumber);
						}
					} catch (err) {
						console.error(`⚠️  Failed to get address blocks for assistant factory ${assistant_factory_contract_address} on ${this.network}:`, err.message);
						console.error(`   This may be due to network disconnection, API timeout, or rate limiting. Will continue with regular event processing.`);
					}
				} else {
					console.log(`ℹ️  ${this.network} assistant factory ${assistant_factory_contract_address}: no missed blocks (top_available_block=${top_available_block} <= last_block=${last_block})`);
				}

			const since_block = await this.getSinceBlock();
			console.log(`📜 Processing past events for ${this.network} assistant factory ${assistant_factory_contract_address} from block ${since_block}...`);
			await processPastEventsOnContract(since_block, 0);
				console.log(`✅ Completed assistant factory monitoring setup for ${assistant_factory_contract_address} on ${this.network}`);
			} catch (err) {
				console.error(`❌ Error in startWatchingAssistantFactories for ${this.network}:`, err.message);
				console.error(`   Assistant factory address: ${assistant_factory_contract_address}`);
				console.error(`   Error stack:`, err.stack);
				// Continue with other factories even if one fails
			}
		}
		console.log(`✅ Assistant factory monitoring setup completed for ${this.network}`);
		} catch (err) {
			console.error(`❌ Error in startWatchingAssistantFactories for ${this.network}:`, err.message);
			console.error(`   Error stack:`, err.stack);
			throw err; // Re-throw so transfers.js can catch it
		}
	}


	async processPastEventsOnBridgeContract(contract, from_block, to_block) {
		console.log('processPastEventsOnBridgeContract', this.network, contract.address, from_block, to_block);
		let count = 0;
		if (contract.filters.NewExpatriation)
			count += await processPastEvents(contract, contract.filters.NewExpatriation(), from_block, to_block, this, this.onNewExpatriation);
		if (contract.filters.NewRepatriation)
			count += await processPastEvents(contract, contract.filters.NewRepatriation(), from_block, to_block, this, this.onNewRepatriation);
		count += await processPastEvents(contract, contract.filters.NewClaim(), from_block, to_block, this, this.onNewClaim);
		count += await processPastEvents(contract, contract.filters.NewChallenge(), from_block, to_block, this, this.onNewChallenge);
		count += await processPastEvents(contract, contract.filters.FinishedClaim(), from_block, to_block, this, this.onFinishedClaim);
		console.log('processPastEventsOnBridgeContract', this.network, contract.address, from_block, to_block, `found ${count} events`);
		return count;
	}

	/**
	 * Process events from specific transactions using transaction receipts
	 * This is a fallback when block range queries fail
	 * @param {Object} contract - Contract instance
	 * @param {Array} transactionHashes - Array of transaction hashes to query
	 * @param {Object} thisArg - Context object (network instance)
	 * @param {Function} handler - Event handler function
	 * @param {Object} filter - Optional event filter to match specific event types
	 * @returns {Promise<number>} Number of events processed
	 */
	/**
	 * Map event data object to correct parameter order based on event name
	 * This ensures that when event fragment is not available, we still pass arguments in the correct order
	 * @param {string} eventName - Name of the event
	 * @param {Object} data - Event data object from parser
	 * @returns {Array} Array of arguments in the correct order
	 */
	mapEventDataToArgs(eventName, data) {
		if (!data || typeof data !== 'object') {
			return [];
		}
		
		// Define parameter order for known events based on their signatures
		// Note: indexed parameters (like claim_num) are in topics, not in data
		// This mapping is for non-indexed parameters in log.data
		const eventParamOrder = {
			'NewExport': ['contractAddress', 'tokenAddress', 'foreign_network', 'foreign_asset'],
			'NewImport': ['contractAddress', 'home_network', 'home_asset', 'symbol', 'stakeTokenAddress'],
			'NewExportAssistant': ['contractAddress', 'bridgeAddress', 'manager', 'symbol'],
			'NewImportAssistant': ['contractAddress', 'bridgeAddress', 'manager', 'symbol'],
			'NewImportWrapper': ['contractAddress', 'home_network', 'home_asset', 'precompileAddress', 'stakeTokenAddress'],
			'NewImportWrapperAssistant': ['contractAddress', 'bridgeAddress', 'precompileAddress', 'name', 'symbol'],
			// NewClaim: (indexed claim_num in topics), author_address, sender_address, recipient_address, txid, txts, amount, reward, stake, data, expiry_ts
			'NewClaim': ['author_address', 'sender_address', 'recipient_address', 'txid', 'txts', 'amount', 'reward', 'stake', 'data', 'expiry_ts'],
			// NewChallenge: (indexed claim_num in topics), author_address, stake, outcome, current_outcome, yes_stake, no_stake, expiry_ts, challenging_target
			'NewChallenge': ['author_address', 'stake', 'outcome', 'current_outcome', 'yes_stake', 'no_stake', 'expiry_ts', 'challenging_target'],
			// FinishedClaim: (indexed claim_num in topics), outcome
			'FinishedClaim': ['outcome']
		};
		
		const paramOrder = eventParamOrder[eventName];
		if (!paramOrder) {
			// Unknown event, try to use data object values (may be in wrong order, but better than nothing)
			console.log(`mapEventDataToArgs: unknown event ${eventName}, using data object values in arbitrary order`);
			return Object.values(data);
		}
		
		// Map data object to correct parameter order
		// Also need to determine which parameters are addresses to normalize them
		const args = [];
		// Get event fragment to determine parameter types (if available)
		let eventFragment = null;
		try {
			// Try to get event fragment from a contract interface if available
			// This is a best-effort attempt - if we can't get it, we'll normalize all potential addresses
			const factoryJson = require('./evm/build/contracts/CounterstakeFactory.json');
			const assistantFactoryJson = require('./evm/build/contracts/AssistantFactory.json');
			const { ethers } = require('ethers');
			let iface = null;
			if (eventName === 'NewExport' || eventName === 'NewImport' || eventName === 'NewImportWrapper') {
				iface = new ethers.utils.Interface(factoryJson.abi);
			} else if (eventName === 'NewExportAssistant' || eventName === 'NewImportAssistant' || eventName === 'NewImportWrapperAssistant') {
				iface = new ethers.utils.Interface(assistantFactoryJson.abi);
			}
			if (iface) {
				try {
					eventFragment = iface.getEvent(eventName);
				} catch (e) {
					// Event not found in this ABI, continue without fragment
				}
			}
		} catch (e) {
			// Can't determine types, will normalize potential addresses based on name patterns
		}
		
		for (let i = 0; i < paramOrder.length; i++) {
			const paramName = paramOrder[i];
			if (data.hasOwnProperty(paramName)) {
				let paramValue = data[paramName];
				
				// Normalize addresses - check if this parameter is an address type
				// Either from event fragment or by name pattern
				const isAddress = eventFragment && eventFragment.inputs && eventFragment.inputs[i] 
					? eventFragment.inputs[i].type === 'address'
					: paramName.toLowerCase().includes('address') || paramName.toLowerCase().includes('manager') || paramName.toLowerCase().includes('token');
				
				if (isAddress && paramValue && typeof paramValue === 'string' && paramValue.startsWith('0x')) {
					// This is an address parameter - normalize it
					// Note: we don't have networkApi here, but normalizeAddress can work without it for EVM addresses
					try {
						const { normalizeAddress } = require('./address_normalizer.js');
						paramValue = normalizeAddress(paramValue, null);
					} catch (e) {
						// If normalization fails, keep original value
					}
				}
				
				args.push(paramValue);
			} else {
				// Parameter not found in data, push undefined (handler should handle this)
				console.log(`mapEventDataToArgs: parameter ${paramName} not found in data for event ${eventName}`);
				args.push(undefined);
			}
		}
		
		return args;
	}

	/**
	 * Process past events from parser cache (when AlwaysUseBSCscanParser or AlwaysUseEtherscanParser is enabled)
	 * @param {Object} contract - Contract instance
	 * @param {Object} filter - Event filter
	 * @param {number} since_block - Starting block number
	 * @param {number} to_block - Ending block number
	 * @param {Object} thisArg - Network instance
	 * @param {Function} handler - Event handler function
	 * @returns {Promise<number>} Number of events processed
	 */
	async processPastEventsFromParserCache(contract, filter, since_block, to_block, thisArg, handler) {
		const network = thisArg ? thisArg.network : null;
		// Normalize contract address for consistent comparison (addresses from contract are already checksummed, but normalize for consistency)
		const contractAddress = normalizeAddress(contract.address, thisArg);
		
		// Get cached transactions for this contract (address will be normalized inside getCachedTransactions)
		const transactions = thisArg.getCachedTransactions(contractAddress);
		
		if (!transactions || transactions.length === 0) {
			console.log(`processPastEventsFromParserCache ${network}: no cached transactions for ${contractAddress}`);
			return 0;
		}
		
		// Determine actual_to_block
		let actual_to_block = to_block;
		const isProcessAllRequest = (!to_block || to_block === 'latest' || to_block === 0);
		if (isProcessAllRequest) {
			actual_to_block = await thisArg.getBlockNumber();
		}
		
		// Filter transactions by block range
		let relevantTxs = transactions.filter(tx => 
			tx.blockNumber >= since_block && tx.blockNumber <= actual_to_block
		);
		
		// If no transactions in the exact range but we have cached transactions, check if we should expand
		// This can happen if the cache was populated for a different block range
		if (relevantTxs.length === 0 && transactions.length > 0) {
			const minBlock = Math.min(...transactions.map(tx => tx.blockNumber));
			const maxBlock = Math.max(...transactions.map(tx => tx.blockNumber));
			console.log(`processPastEventsFromParserCache ${network}: no transactions in range ${since_block}-${actual_to_block}, but cache has ${transactions.length} transactions in range ${minBlock}-${maxBlock}`);
			
			// If the requested range is a single block (common during catchup), process all cached transactions
			// This is safe because the cache only contains transactions for this contract, and we need to process
			// all of them to find transfers that might be claimed later
			if (since_block === to_block && since_block > 0) {
				console.log(`processPastEventsFromParserCache ${network}: single block query during catchup, processing all ${transactions.length} cached transactions to ensure transfers are detected`);
				relevantTxs = transactions; // Process all cached transactions
			} else if (isProcessAllRequest) {
				// When to_block is 0/'latest', it means "process all events from since_block to latest"
				// In this case, we should process ALL cached transactions regardless of their block range,
				// because they're all historical events that need to be processed during catch-up
				console.log(`processPastEventsFromParserCache ${network}: processing all events request (to_block=0), processing all ${transactions.length} cached transactions to catch all historical events`);
				relevantTxs = transactions; // Process all cached transactions
			} else if (since_block > 0 && to_block > 0) {
				// For range queries during catchup, if the cache range doesn't overlap with requested range at all,
				// it means the cache is stale. Process all cached transactions anyway to catch any missed transfers.
				// This is especially important when the parser cache has old data but we're catching up to recent blocks.
				if (maxBlock < since_block || minBlock > actual_to_block) {
					console.log(`processPastEventsFromParserCache ${network}: cache range (${minBlock}-${maxBlock}) doesn't overlap with requested range (${since_block}-${actual_to_block}), processing all ${transactions.length} cached transactions to catch missed transfers`);
					relevantTxs = transactions; // Process all cached transactions
				} else {
					// For range queries with partial overlap, expand slightly to catch nearby transactions (e.g., ±10 blocks)
					// This handles minor block number mismatches
					const blockWindow = 10;
					const expandedTxs = transactions.filter(tx => 
						tx.blockNumber >= (since_block - blockWindow) && tx.blockNumber <= (actual_to_block + blockWindow)
					);
					if (expandedTxs.length > 0) {
						console.log(`processPastEventsFromParserCache ${network}: expanding search window to ±${blockWindow} blocks, found ${expandedTxs.length} transactions`);
						relevantTxs = expandedTxs;
					}
				}
			}
		} else if (isProcessAllRequest && relevantTxs.length < transactions.length) {
			// Even if we found some transactions in range, if this is a "process all" request,
			// we should process ALL cached transactions to ensure we don't miss any historical events
			console.log(`processPastEventsFromParserCache ${network}: processing all events request (to_block=0), found ${relevantTxs.length} in range but processing all ${transactions.length} cached transactions to catch all historical events`);
			relevantTxs = transactions; // Process all cached transactions
		}
		
		// Sort transactions by block number to ensure chronological processing
		// This is important because assistant events depend on bridge events existing first
		relevantTxs.sort((a, b) => {
			// Sort by block number first
			if (a.blockNumber !== b.blockNumber) {
				return a.blockNumber - b.blockNumber;
			}
			// If same block, maintain original order (transactions are already in order within a block)
			return 0;
		});
		
		console.log(`processPastEventsFromParserCache ${network}: processing ${relevantTxs.length} transactions in range ${since_block}-${actual_to_block} (from ${transactions.length} total cached), sorted by block number`);
		
		let eventCount = 0;
		
		// Get event filter topic if available
		let targetEventTopic = null;
		if (filter && filter.topics && filter.topics[0]) {
			targetEventTopic = filter.topics[0];
			// Try to determine event name from contract interface for better logging
			let eventName = 'unknown';
			try {
				// Try to find which event this filter is for by checking all events in the contract interface
				const events = contract.interface.events;
				for (const [name, event] of Object.entries(events)) {
					const eventTopic = ethers.utils.id(event.format('full'));
					if (eventTopic.toLowerCase() === targetEventTopic.toLowerCase()) {
						eventName = name;
						break;
					}
				}
			} catch (e) {
				// Ignore errors
			}
		}
		
		// Process each transaction's event logs
		for (const tx of relevantTxs) {
			const eventLogs = thisArg.getCachedEventLogs(tx.txHash);
			
			if (!eventLogs || eventLogs.length === 0) {
				continue;
			}
			
			// Filter event logs by event topic
			// Note: log.from is the sender, not the contract address that emitted the event
			// The contract address will be determined when creating the mock event (from log.data.contractAddress or top-level address)
			const matchingLogs = eventLogs.filter(log => {
				// Check event topic if filter is provided
				if (targetEventTopic && log.topics && log.topics.length > 0) {
					// Topic 0 is the event signature hash - find it by index field, not array position
					const topic0 = log.topics.find(t => t.index === 0);
					if (!topic0) {
						return false;
					}
					const logTopic = topic0.value;
					if (logTopic && logTopic.toLowerCase() !== targetEventTopic.toLowerCase()) {
						return false;
					}
				}
				
				// All events in a contract's cache file should be from that contract
				// So we allow all events through (they'll use the correct contract address when processed)
				return true;
			});
			
			
			// Convert parser event logs to ethers event format and process them
			for (const log of matchingLogs) {
				try {
					// Try to decode the event using contract interface
					const eventName = log.name;
					if (!eventName) {
						continue;
					}
					
					// Get event fragment from contract interface to get parameter order
					let eventFragment = null;
					try {
						eventFragment = contract.interface.getEvent(eventName);
					} catch (e) {
						// Event not found in contract interface, will try to decode from raw data
					}
					
					// Build event args from log data in the correct order
					// Event args must be in the order they appear in the event signature
					// (indexed parameters first, then non-indexed parameters)
					const eventArgs = [];
					
					if (eventFragment && eventFragment.inputs) {
						// Use contract interface to get parameter order
						// eventFragment.inputs is an array of parameters in the correct order
						for (const input of eventFragment.inputs) {
							let paramValue = null;
							
							if (input.indexed) {
								// Indexed parameters are in topics (topic[0] is event signature, topic[1+] are indexed params)
								const indexedIndex = eventFragment.inputs.filter(inp => inp.indexed).indexOf(input);
								// Find topic by index field, not array position
								const topic = log.topics.find(t => t.index === indexedIndex + 1);
								if (topic) {
									const topicValue = topic.value;
									
									// Decode topic value based on type
									if (input.type === 'uint256' || input.type === 'uint128' || input.type === 'uint64' || input.type === 'uint32' || input.type === 'uint8') {
										try {
											const { BigNumber } = require('ethers');
											paramValue = BigNumber.from(topicValue);
										} catch (e) {
											paramValue = topicValue;
										}
									} else if (input.type === 'address') {
										paramValue = topicValue.toLowerCase();
									} else {
										paramValue = topicValue;
									}
								}
							} else {
								// Non-indexed parameters are in data
								// Try to get from log.data using input.name first (most reliable)
								if (log.data && log.data[input.name] !== undefined) {
									paramValue = log.data[input.name];
									
									// Convert to appropriate type if needed
									if (input.type === 'uint256' || input.type === 'uint128' || input.type === 'uint64' || input.type === 'uint32' || input.type === 'uint8') {
										try {
											const { BigNumber } = require('ethers');
											paramValue = BigNumber.from(paramValue);
										} catch (e) {
											// Keep as string if conversion fails
										}
									} else if (input.type === 'int256' || input.type === 'int128' || input.type === 'int64' || input.type === 'int32' || input.type === 'int8') {
										try {
											const { BigNumber } = require('ethers');
											paramValue = BigNumber.from(paramValue);
										} catch (e) {
											// Keep as string if conversion fails
										}
									} else if (input.type === 'address') {
										// Normalize address (checksum) instead of lowercasing
										// Addresses from parser might be lowercase, but we need checksummed format for consistency
										paramValue = normalizeAddress(paramValue, thisArg);
									}
								} else {
									// Parameter not found in log.data by name - this shouldn't happen if parser extracted correctly
									// but if it does, we'll fall back to using the mapped order from mapEventDataToArgs
									console.log(`processPastEventsFromParserCache ${network}: parameter ${input.name} not found in log.data for event ${eventName}, will use fallback mapping`);
								}
							}
							
							eventArgs.push(paramValue);
						}
						
						// If any parameters are null/undefined, try to fill them from log.data using the mapping function
						// This handles cases where parameter names don't match exactly
						if (eventArgs.some(v => v === null || v === undefined)) {
							console.log(`processPastEventsFromParserCache ${network}: some parameters are null for event ${eventName}, attempting to fill from log.data using mapping`);
							const mappedArgs = thisArg.mapEventDataToArgs(eventName, log.data);
							// Replace null/undefined values with mapped values
							for (let i = 0; i < eventArgs.length && i < mappedArgs.length; i++) {
								if (eventArgs[i] === null || eventArgs[i] === undefined) {
									eventArgs[i] = mappedArgs[i];
								}
							}
						}
					} else {
						// Fallback: if we can't get event fragment, try to use raw data decoding
						if (log.rawData && log.rawData !== '0x') {
							try {
								// Try to decode using contract interface
								// Sort topics by index to ensure correct order (topic 0, 1, 2, etc.)
								const topics = log.topics ? log.topics.sort((a, b) => a.index - b.index).map(t => t.value) : [];
								const decodedLog = contract.interface.parseLog({
									topics: topics,
									data: log.rawData
								});
								if (decodedLog) {
									// Use decoded args from ethers (already in correct order)
									// Normalize addresses in decoded args to ensure checksummed format
									// Try to get event fragment from decoded log to determine address types
									let decodedEventFragment = eventFragment;
									if (!decodedEventFragment && decodedLog.name) {
										try {
											decodedEventFragment = contract.interface.getEvent(decodedLog.name);
										} catch (e) {
											// Event not found, will use name pattern matching
										}
									}
									const normalizedArgs = decodedLog.args.map((arg, index) => {
										if (decodedEventFragment && decodedEventFragment.inputs && decodedEventFragment.inputs[index]) {
											const input = decodedEventFragment.inputs[index];
											if (input.type === 'address' && arg && typeof arg === 'string' && arg.startsWith('0x')) {
												return normalizeAddress(arg, thisArg);
											}
										}
										return arg;
									});
									eventArgs.push(...normalizedArgs);
								}
							} catch (decodeError) {
								console.log(`processPastEventsFromParserCache ${network}: failed to decode raw data for ${eventName}: ${decodeError.message}`);
								// Last resort: map data object to correct parameter order based on event name
								eventArgs.push(...this.mapEventDataToArgs(eventName, log.data));
							}
						} else {
							// No raw data, map data object to correct parameter order based on event name
							eventArgs.push(...this.mapEventDataToArgs(eventName, log.data));
						}
					}
					
					// Create a mock event object similar to ethers event
					// The contract that emitted the event is ALWAYS the top-level address from the cache structure
					// This is the contract we're monitoring and whose cache file we're reading
					// Note: contractAddress in log.data (if present) is for other purposes (e.g., newly created assistant),
					//       NOT the contract that emitted the event
					const eventAddress = contractAddress; // Always use top-level address (the emitter)
					// Note: log.from is the sender, not the contract address
					// Sort topics by index to ensure correct order (topic 0, 1, 2, etc.)
					const sortedTopics = log.topics ? log.topics.sort((a, b) => a.index - b.index).map(t => t.value) : [];
					const mockEvent = {
						args: eventArgs,
						event: eventName,
						eventSignature: eventFragment ? eventFragment.format('full') : eventName,
						address: eventAddress,
						transactionHash: tx.txHash,
						blockNumber: tx.blockNumber,
						blockHash: null, // Not available from parser
						topics: sortedTopics,
						data: log.rawData || '0x',
						removed: false
					};
					
					// Call handler with event args and event object
					const handlerArgs = eventArgs.slice();
					handlerArgs.push(mockEvent);
					
					await handler.apply(thisArg, handlerArgs);
					eventCount++;
					
				} catch (error) {
					console.log(`processPastEventsFromParserCache ${network}: error processing event log from tx ${tx.txHash.substring(0, 10)}...: ${error.message}`);
					console.log(`  Error stack:`, error.stack);
					continue;
				}
			}
		}
		
		console.log(`processPastEventsFromParserCache ${network}: processed ${eventCount} events from ${relevantTxs.length} transactions`);
		return eventCount;
	}

	async processEventsFromTransactions(contract, transactionHashes, thisArg, handler, filter = null) {
		const network = thisArg ? thisArg.network : null;
		// Normalize contract address for consistent comparison (addresses from contract are already checksummed, but normalize for consistency)
		const contractAddress = normalizeAddress(contract.address, thisArg);
		let eventCount = 0;
		
		console.log(`processEventsFromTransactions ${network}: processing ${transactionHashes.length} transactions for contract ${contractAddress}${filter ? ' with filter' : ''}`);
		
		// Extract event topic from filter if provided (for filtering specific event types)
		let targetEventTopic = null;
		if (filter && filter.topics && filter.topics[0]) {
			// Filter topics[0] is the event signature hash
			targetEventTopic = filter.topics[0];
		}
		
		for (const txHash of transactionHashes) {
			try {
				// Get transaction receipt to access logs
				const receipt = await thisArg.getProvider().getTransactionReceipt(txHash);
				
				if (!receipt || !receipt.logs) {
					console.log(`  ⚠️  No receipt or logs for tx ${txHash.substring(0, 10)}...`);
					continue;
				}
				
				// Filter logs by contract address - normalize addresses from external sources (transaction receipts) before comparison
				const contractLogs = receipt.logs.filter(log => {
					if (!log.address) {
						return false;
					}
					const normalizedLogAddress = normalizeAddress(log.address, thisArg);
					if (normalizedLogAddress !== contractAddress) {
						return false;
					}
					// If we have a filter, also check if the log topic matches
					if (targetEventTopic && log.topics && log.topics[0] !== targetEventTopic) {
						return false;
					}
					return true;
				});
				
				if (contractLogs.length === 0) {
					continue; // No matching logs from this contract
				}
				
				// Parse each log as an event
				for (const log of contractLogs) {
					try {
						// Try to parse the log as an event
						const parsedLog = contract.interface.parseLog(log);
						
						if (parsedLog) {
							// If we have a filter, check if this event matches
							if (filter) {
								// Check if event name matches (if filter has event name)
								// For now, we rely on topic matching which was done above
								// But we could also check event name if needed
							}
							
							// Create an event-like object that matches the handler signature
							// Normalize address from external source (transaction receipt) before using
							const normalizedEventAddress = normalizeAddress(log.address, thisArg);
							const event = {
								...parsedLog,
								transactionHash: txHash,
								blockNumber: receipt.blockNumber,
								blockHash: receipt.blockHash,
								address: normalizedEventAddress,
								args: parsedLog.args,
								event: parsedLog.name,
								eventSignature: parsedLog.signature,
								removed: false
							};
							
							// Call handler with event args (matching the format from queryFilter)
							const handlerArgs = parsedLog.args.slice();
							handlerArgs.push(event);
							
							await handler.apply(thisArg, handlerArgs);
							eventCount++;
						}
					} catch (parseError) {
						// Log parsing failed - might not match any event signature
						// This is normal for logs that don't match our contract's events
						continue;
					}
				}
				
				// Small delay between transactions to avoid rate limiting
				await wait(50);
				
			} catch (error) {
				console.error(`  ❌ Error processing tx ${txHash.substring(0, 10)}...: ${error.message}`);
				// Continue with next transaction
				continue;
			}
		}
		
		console.log(`processEventsFromTransactions ${network}: processed ${eventCount} events from ${transactionHashes.length} transactions`);
		return eventCount;
	}

	// called on start-up to handle missed transfers
	async catchup() {
		console.log(`will catch up ${this.network}, last caught up block ${this.#last_caughtup_block}`);

		// Log initial sync stats
		const transfers = require('./transfers.js');
		const stats = await transfers.getSyncStats();
		console.log(`🔄 Syncing ${this.network}... Total bridges: ${stats.bridgeCount} Total transfers: ${stats.transferCount} Transfer ID range: ${stats.minTransferId} to ${stats.maxTransferId}`);

		// Set up periodic stat logging during catchup
		const statInterval = setInterval(async () => {
			const currentStats = await transfers.getSyncStats();
			console.log(`🔄 Syncing ${this.network}... Total bridges: ${currentStats.bridgeCount} Total transfers: ${currentStats.transferCount} Transfer ID range: ${currentStats.minTransferId} to ${currentStats.maxTransferId}`);
		}, conf.statsLogPeriod);

		try {
			// get events that are beyond the block range
			let last_block = this.#last_caughtup_block || Math.max(await this.getLastBlock() - 100, 0);
			
			// Check if we have imported data and find the maximum block from it
			// This allows us to skip explorer/parser API calls until we've processed all imported data
			const maxBlockFromImportedData = await this.getMaxBlockFromImportedData();
			if (maxBlockFromImportedData !== null && maxBlockFromImportedData > last_block) {
				console.log(`${this.network} catchup: found imported data up to block ${maxBlockFromImportedData}, using it instead of last_block ${last_block}`);
				last_block = maxBlockFromImportedData;
			}
			
			const top_available_block = await this.getTopAvailableBlock();
			console.log(`${this.network} catchup: last_block=${last_block}, top_available_block=${top_available_block}, contractsByAddress keys: ${Object.keys(this.#contractsByAddress).length}`);
			
			// Get all addresses that need checking, including factory contracts
			const addressesToCheck = new Set();
			
			// Add bridge contracts from contractsByAddress
			for (let address in this.#contractsByAddress) {
				const contract = this.#contractsByAddress[address];
				if (contract.filters.NewClaim) { // bridge contract
					// Normalize address to checksummed format for consistency (addresses are stored checksummed in DB)
					const normalizedAddress = normalizeAddress(address, this);
					addressesToCheck.add(normalizedAddress);
				}
			}
			
			// Also query database for bridges where this network is the foreign network (import_aa)
			// or home network (export_aa) to ensure we check all bridge addresses
			// This handles cases where contracts weren't registered in contractsByAddress
			const db = require('ocore/db.js');
			const bridges = await db.query("SELECT * FROM bridges WHERE foreign_network=? OR home_network=?", [this.network, this.network]);
			// Filter out not supported bridges
			const notSupportedBridges = (conf.NotSupportedBridges || []).map(id => String(id));
			const supportedBridges = bridges.filter(bridge => !notSupportedBridges.includes(String(bridge.bridge_id)));
			if (notSupportedBridges.length > 0 && bridges.length !== supportedBridges.length) {
				const skipped = bridges.length - supportedBridges.length;
				console.log(`${this.network} catchup: skipping ${skipped} not supported bridge(s): ${bridges.filter(b => notSupportedBridges.includes(String(b.bridge_id))).map(b => b.bridge_id).join(', ')}`);
			}
			for (let bridge of supportedBridges) {
				// Add import_aa if this network is the foreign network
				if (bridge.foreign_network === this.network && bridge.import_aa) {
					// Normalize address for consistent storage and lookup (addresses are stored checksummed in DB)
					// Use centralized normalizeAddress function
					const checksummedImportAA = normalizeAddress(bridge.import_aa, this);
					addressesToCheck.add(checksummedImportAA);
					// Ensure contract instance exists for this address
					if (!this.#contractsByAddress[checksummedImportAA]) {
						try {
							// Use listener provider for event listening
							const listenerProvider = this.getListenerProvider();
							const contract = new ethers.Contract(checksummedImportAA, importJson.abi, listenerProvider);
							contract.on('NewRepatriation', this.onNewRepatriation.bind(this));
							this.addCounterstakeEventHandlers(contract);
							this.#contractsByAddress[checksummedImportAA] = contract;
						} catch (e) {
							console.error(`${this.network} catchup: failed to create contract instance for import_aa ${checksummedImportAA}:`, e.message);
						}
					}
				}
				// Add export_aa if this network is the home network
				if (bridge.home_network === this.network && bridge.export_aa) {
					// Normalize address for consistent storage and lookup (addresses are stored checksummed in DB)
					// Use centralized normalizeAddress function
					const checksummedExportAA = normalizeAddress(bridge.export_aa, this);
					addressesToCheck.add(checksummedExportAA);
					// Ensure contract instance exists for this address
					if (!this.#contractsByAddress[checksummedExportAA]) {
						try {
							// Use listener provider for event listening
							const listenerProvider = this.getListenerProvider();
							const contract = new ethers.Contract(checksummedExportAA, exportJson.abi, listenerProvider);
							contract.on('NewExpatriation', this.onNewExpatriation.bind(this));
							// Also listen for NewRepatriation on export contracts (for bidirectional bridges like 3DPass)
							if (contract.filters.NewRepatriation) {
								contract.on('NewRepatriation', this.onNewRepatriation.bind(this));
							}
							this.addCounterstakeEventHandlers(contract);
							this.#contractsByAddress[checksummedExportAA] = contract;
						} catch (e) {
							console.error(`${this.network} catchup: failed to create contract instance for export_aa ${checksummedExportAA}:`, e.message);
						}
					}
				}
			}
			
			// Also check factory contracts even if they're not in contractsByAddress yet
			// This handles cases where BSC disconnected before factory monitoring completed
			for (let v in this.#factory_contract_addresses) {
				const factoryAddress = this.#factory_contract_addresses[v];
				if (factoryAddress) {
					// Normalize factory address for consistent lookup
					const normalizedFactoryAddress = normalizeAddress(factoryAddress, this);
					addressesToCheck.add(normalizedFactoryAddress);
				}
			}
			for (let v in this.#assistant_factory_contract_addresses) {
				const assistantFactoryAddress = this.#assistant_factory_contract_addresses[v];
				if (assistantFactoryAddress) {
					// Normalize assistant factory address for consistent lookup
					const normalizedAssistantFactoryAddress = normalizeAddress(assistantFactoryAddress, this);
					addressesToCheck.add(normalizedAssistantFactoryAddress);
				}
			}
			
			console.log(`${this.network} catchup: will check ${addressesToCheck.size} addresses (${Object.keys(this.#contractsByAddress).length} contracts + ${addressesToCheck.size - Object.keys(this.#contractsByAddress).length} factories)`);
			
			// Log all addresses being checked with bridge info
			if (addressesToCheck.size > 0) {
				console.log(`${this.network} catchup: addresses to check:`);
				for (let address of addressesToCheck) {
					try {
						const bridge = await transfers.getBridgeByAddress(address, false);
						if (bridge) {
							console.log(`  - ${address} (bridge ${bridge.bridge_id}: ${bridge.home_network}↔${bridge.foreign_network})`);
						} else {
							console.log(`  - ${address} (factory or unknown)`);
						}
					} catch (e) {
						console.log(`  - ${address} (factory or unknown)`);
					}
				}
			}
			
			if (top_available_block > last_block) {
				// Separate priority addresses from regular addresses
				const priorityAddresses = new Set();
				const regularAddresses = new Set();
				
				// Normalize priority addresses from config for comparison
				// Addresses in addressesToCheck are already normalized (checksummed), so normalize config addresses too
				const topPriorityBridges = (conf.topPriorityBridges || []).map(addr => normalizeAddress(addr, this));
				
				for (let address of addressesToCheck) {
					// Address is already normalized, compare directly
					if (topPriorityBridges.includes(address)) {
						priorityAddresses.add(address);
					} else {
						regularAddresses.add(address);
					}
				}
				
				// Helper function to query an address
				const queryAddress = async (address) => {
					try {
						// Try to find which bridge this address belongs to
						let bridgeInfo = '';
						try {
							const bridge = await transfers.getBridgeByAddress(address, false);
							if (bridge) {
								bridgeInfo = ` (bridge ${bridge.bridge_id}: ${bridge.home_network}↔${bridge.foreign_network})`;
							}
						} catch (e) {
							// Ignore errors
						}
						
						let blocks = [];
						
						// Try peer seeding first if enabled
						if (conf.bEnablePeerSeeding) {
							try {
								const peer_seeding = require('./peer_seeding.js');
								console.log(`${this.network} catchup: requesting block numbers from peers for address ${address}${bridgeInfo} from block ${last_block}`);
								blocks = await peer_seeding.requestBlockNumbersFromPeers(this.network, address, last_block);
								if (blocks && blocks.length > 0) {
									console.log(`${this.network} address ${address}${bridgeInfo} received ${blocks.length} block numbers from peers since ${last_block}:`, blocks);
								} else {
									console.log(`${this.network} catchup: no block numbers from peers, falling back to explorer/parser`);
								}
							} catch (e) {
								console.log(`${this.network} catchup: peer seeding failed: ${e.message}, falling back to explorer/parser`);
							}
						}
						
						// Fall back to explorer/parser if peer seeding didn't return results
						// Skip fallback if bPeerSeedingOnly is enabled
						// Also skip if we have imported data and are still within its range
						// BUT: 3DPass always needs to call getAddressBlocks (3dpscan) to discover blocks,
						// even if we have imported data, because 3DPass doesn't use standard explorer APIs
						const hasImportedData = await this.hasImportedDataForNetwork();
						const is3DPass = this.network === '3DPass';
						// For 3DPass, always allow getAddressBlocks (it uses 3dpscan, not standard explorer)
						// For other networks, skip if we have imported data and are within its range
						// Use getMaxBlockFromImportedData() to get the correct imported last_block from import_metadata
						const importedLastBlock = hasImportedData ? await this.getMaxBlockFromImportedData() : null;
						const shouldSkipExplorer = !is3DPass && hasImportedData && importedLastBlock !== null && last_block <= importedLastBlock;
						
						if ((!blocks || blocks.length === 0) && !conf.bPeerSeedingOnly && !shouldSkipExplorer) {
							// Normalize address before calling getAddressBlocks for consistent cache keys and lookups
							const normalizedAddress = normalizeAddress(address, this);
							console.log(`${this.network} catchup: calling getAddressBlocks for address ${normalizedAddress}${bridgeInfo} from block ${last_block}`);
							blocks = await this.getAddressBlocks(normalizedAddress, last_block);
							console.log(`${this.network} address ${normalizedAddress}${bridgeInfo} blocks of missed txs since ${last_block}:`, blocks);
						} else if ((!blocks || blocks.length === 0) && conf.bPeerSeedingOnly) {
							console.log(`${this.network} catchup: peer seeding only mode - no block numbers from peers, skipping explorer/parser fallback`);
						} else if (shouldSkipExplorer && (!blocks || blocks.length === 0)) {
							console.log(`${this.network} catchup: skipping explorer/parser API calls - using imported data up to block ${currentLastBlock}`);
						}
						
						// Only process events if we have a contract instance for this address
						// Address from addressesToCheck is already normalized (checksummed), so lookup directly
						// Keys in contractsByAddress should also be checksummed, but handle case-insensitive match as fallback
						let contract = this.#contractsByAddress[address];
						if (!contract) {
							// Try to find contract with case-insensitive match (fallback for edge cases)
							const addressLower = address.toLowerCase();
							for (let key in this.#contractsByAddress) {
								if (key.toLowerCase() === addressLower) {
									contract = this.#contractsByAddress[key];
									break;
								}
							}
						}
						if (contract && contract.filters.NewClaim) {
							// It's a bridge contract, process events
							for (let blockNumber of blocks) {
								const count = await this.processPastEventsOnBridgeContract(contract, blockNumber, blockNumber);
								if (!count)
									console.log(`no CS events on contract ${address}${bridgeInfo}@${this.network} in block ${blockNumber}`);
							}
						} else {
							// Factory contract - events will be processed when factory monitoring completes
							console.log(`${this.network} address ${address} is a factory contract, events will be processed by factory monitoring`);
						}
					} catch (err) {
						console.error(`⚠️  Failed to get address blocks for ${address} during catchup on ${this.network}:`, err.message);
						console.error(`   Error stack:`, err.stack);
						// Continue with other addresses
					}
				};
				
				// Query priority addresses first
				if (priorityAddresses.size > 0) {
					console.log(`${this.network} catchup: querying ${priorityAddresses.size} priority bridge address(es) first...`);
					for (let address of priorityAddresses) {
						await queryAddress(address);
					}
				}
				
				// Then query regular addresses
				if (regularAddresses.size > 0) {
					console.log(`${this.network} catchup: querying ${regularAddresses.size} regular address(es)...`);
					for (let address of regularAddresses) {
						await queryAddress(address);
					}
				}
			} else {
				console.log(`${this.network} catchup: top_available_block (${top_available_block}) <= last_block (${last_block}), skipping address blocks check`);
			}

			const since_block = (top_available_block || !this.#last_caughtup_block) ? await this.getSinceBlock() : this.#last_caughtup_block;
			console.log(`${this.network} catchup: processing events from block ${since_block}`);
			for (let address in this.#contractsByAddress) {
				const contract = this.#contractsByAddress[address];
				if (!contract.filters.NewClaim) // not a bridge, must be an assistant
					continue;
				await this.processPastEventsOnBridgeContract(contract, since_block, 0);
			}
		} finally {
			// Clear the stat logging interval
			clearInterval(statInterval);
		}

		const unlock = await mutex.lock(this.network + 'Event'); // take the last place in the queue after all real events
		unlock();
		console.log(`catching up ${this.network} done`);
		this.#bCatchingUp = false;
		const blockNumber = await this.getBlockNumber();
		this.#last_caughtup_block = Math.max(blockNumber - 100, 0);
		await this.updateLastBlock(blockNumber);
	}

	constructor(network, factory_contract_addresses, assistant_factory_contract_addresses, provider, listenerProvider){
		this.network = network;
		this.#factory_contract_addresses = factory_contract_addresses;
		this.#assistant_factory_contract_addresses = assistant_factory_contract_addresses;
		this.#provider = provider;
		this.#listenerProvider = listenerProvider; // Optional separate provider for listening
		let wallet = ethers.Wallet.fromMnemonic(JSON.parse(fs.readFileSync(desktopApp.getAppDataDir() + '/keys.json')).mnemonic_phrase);
		console.log(`====== my ${network} address: `, wallet.address);
		this.#wallet = wallet.connect(provider);
		if (!cachedMinTxAges[network])
			cachedMinTxAges[network] = {};

		// we might miss some events if the provider doesn't send them
		const catchupInterval = setInterval(() => this.catchup(), 12 * 3600 * 1000);

		// Use listener provider for listening if available, otherwise use main provider
		const listeningProvider = this.getListenerProvider();
		// Get provider URL for logging (stored when provider was created, or fallback to connection URL)
		// Mask API keys for security
		let providerUrl = listeningProvider._providerUrl || listeningProvider.connection?.url || listeningProvider._websocket?.url || 'unknown';
		// Additional masking in case URL wasn't masked when stored
		if (providerUrl && providerUrl !== 'unknown') {
			providerUrl = providerUrl.replace(/\/ws\/v3\/([a-f0-9]+)/gi, '/ws/v3/***');
			providerUrl = providerUrl.replace(/\/v1\/([a-f0-9-]+)/gi, '/v1/***');
			providerUrl = providerUrl.replace(/apikey\/([a-f0-9-]+)/gi, 'apikey/***');
			providerUrl = providerUrl.replace(/api_key=([a-f0-9-]+)/gi, 'api_key=***');
		}

		if (listeningProvider._websocket && !process.env.devnet) {
			let closed = false;
			let connectionStable = false;
			let connectionStartTime = Date.now();
			let closeEventTimeout = null;
			let firstBlockReceived = false;
			let firstPongReceived = false;
			
			const forgetAndEmitDisconnected = () => {
				clearTimeout(scheduledReconnectTimeout);
				if (interval) clearInterval(interval);
				clearInterval(catchupInterval);
				if (closeEventTimeout) clearTimeout(closeEventTimeout);
				closed = true;
				this.forget();
				listeningProvider._websocket.removeAllListeners();
				// Clear provider cache to allow reconnection with fresh provider
				try {
					const { clearProviderCache } = require('./evm/provider.js');
					clearProviderCache(this.network);
				} catch (e) {
					console.log(`Could not clear provider cache for ${this.network}:`, e.message);
				}
				console.log(`will wait before emitting disconnection event on`, this.network);
				setTimeout(() => eventBus.emit('network_disconnected', this.network), 60 * 1000);
			};
			const closeSocket = () => {
				try {
					listeningProvider._websocket.close();
				}
				catch (e) {
					console.log(`ws close ${this.network} failed`, e);
				}
			};
			const pingSocket = () => {
				try {
					listeningProvider._websocket.ping();
				}
				catch (e) {
					console.log(`ping ${this.network} failed`, e);
				}
			};
			let last_pong_ts = Date.now();
			let last_block_ts = Date.now(); // Initialize early for block handler
			let interval = null; // Declare in outer scope so forgetAndEmitDisconnected can access it
			
			// Wait for initial connection to stabilize before starting health checks
			// This prevents false positives from immediate disconnections
			setTimeout(() => {
				if (closed) return; // Don't start if already closed
				
				if (conf[network + '_noblocks']) {
					interval = setInterval(() => {
						if (closed) return;
						pingSocket();
						if (Date.now() - last_pong_ts > 5 * 60 * 1000) {
							console.log(`====== no new pongs on ${this.network} in more than 5 mins, will reset websocket connection`);
							forgetAndEmitDisconnected();
							closeSocket();
						}
					}, 60 * 1000);
				}
				else {
					interval = setInterval(() => {
						if (closed) return;
						if (Date.now() - last_block_ts > 15 * 60 * 1000) {
							console.log(`====== no new blocks on ${this.network} in more than 15 mins, will reset websocket connection`);
							forgetAndEmitDisconnected();
							closeSocket();
						}
					}, 60 * 1000);
				}
			}, 30000); // Start health checks after 30 seconds
			
			listeningProvider.on('block', (blockNumber) => {
				console.log('new block', this.network, blockNumber, `(${providerUrl})`);
				if (!firstBlockReceived) {
					firstBlockReceived = true;
					console.log(`✅ ${this.network} received first block: ${blockNumber}`);
				}
				if (!conf[network + '_noblocks']) {
					last_block_ts = Date.now();
					pingSocket();
				}
				// Mark connection as stable after first block
				if (!connectionStable) {
					connectionStable = true;
					console.log(`✅ ${this.network} WebSocket connection marked as stable (first block received)`);
				}
			});
			
			var scheduledReconnectTimeout = setTimeout(() => {
				console.log(`====== scheduled reconnect on ${this.network}`);
				forgetAndEmitDisconnected();
				closeSocket();
			}, 23 * 3600 * 1000);
			
			listeningProvider._websocket.on('pong', () => {
				last_pong_ts = Date.now();
				if (!firstPongReceived) {
					firstPongReceived = true;
					console.log(`✅ ${this.network} received first pong`);
				}
				console.log('pong', this.network);
				// Mark connection as stable after first pong
				if (!connectionStable) {
					connectionStable = true;
					console.log(`✅ ${this.network} WebSocket connection marked as stable`);
				}
			});
			listeningProvider._websocket.on('ping', () => console.log('ping', this.network));
			listeningProvider._websocket.on('close', (code, reason) => {
				console.log(`====== !!!!! websocket connection closed ${this.network}`, { code, reason: reason?.toString() });
				if (closed)
					return console.log('close event: ws already closed');
				
				// Check if connection was stable before closing
				const connectionAge = Date.now() - connectionStartTime;
				const isStableConnection = connectionStable || connectionAge > 10000; // 10 seconds
				
				if (!isStableConnection) {
					console.log(`⚠️  ${this.network} WebSocket closed too early (${connectionAge}ms), code=${code}, reason=${reason?.toString() || 'none'}`);
					console.log(`   This may indicate a connection limit or resource conflict`);
					
					// Delay disconnection to allow for potential reconnection
					closeEventTimeout = setTimeout(() => {
						console.log(`🔄 ${this.network} delayed disconnection timeout reached, proceeding with disconnection`);
						forgetAndEmitDisconnected();
					}, 5000); // Wait 5 seconds before disconnecting
				} else {
					console.log(`ℹ️  ${this.network} WebSocket closed after stable connection (${connectionAge}ms), proceeding with disconnection`);
					forgetAndEmitDisconnected();
				}
			});
			listeningProvider._websocket.on('error', (error) => {
				console.log('====== !!!!! websocket error', this.network, error);
				if (closed)
					return console.log('error event: ws already closed');
				console.log(`   Error details:`, { code: error.code, message: error.message });
				closeSocket();
				forgetAndEmitDisconnected();
			});
			listeningProvider._websocket.on('open', () => {
				console.log(`✅ ${this.network} WebSocket opened successfully (${providerUrl})`);
			});
			console.log(`${this.network} constructor done`);
		}

		watchForDeadlock(this.network + 'Event');
		watchForDeadlock(this.network + 'Tx');
		watchForDeadlock(this.network);
	}

}


function getType(address, bridge) {
	const { bridge_id, export_aa, import_aa } = bridge;
	// Normalize addresses to checksummed format for consistent comparison (EVM addresses are stored checksummed)
	const normalizedAddress = normalizeAddress(address);
	const normalizedExportAa = normalizeAddress(export_aa);
	const normalizedImportAa = normalizeAddress(import_aa);
	
	if (normalizedExportAa && normalizedAddress === normalizedExportAa)
		return 'repatriation';
	if (normalizedImportAa && normalizedAddress === normalizedImportAa)
		return 'expatriation';
	throw Error(`unable to determine transfer type on address ${address} and bridge ${bridge_id}, export_aa=${export_aa}, import_aa=${import_aa}`);
}

async function processPastEvents(contract, filter, since_block, to_block, thisArg, handler, retryCount = 0) {
	const conf = require('./conf.js');
	const network = thisArg ? thisArg.network : null;
	const maxRetries = 10; // Maximum retries for transient errors
	const MAX_BLOCK_RANGE = 950; // Maximum blocks per query (slightly less than typical 1000 limit to be safe)
	
	// If AlwaysUseBSCscanParser is enabled and this is BSC, use cached event logs instead of provider queries
	if (conf.AlwaysUseBSCscanParser && network === 'BSC' && thisArg) {
		console.log(`processPastEvents ${network}: AlwaysUseBSCscanParser enabled, using cached event logs from parser...`);
		return await thisArg.processPastEventsFromParserCache(contract, filter, since_block, to_block, thisArg, handler);
	}
	
	// If AlwaysUseEtherscanParser is enabled and this is Ethereum, use cached event logs instead of provider queries
	if (conf.AlwaysUseEtherscanParser && network === 'Ethereum' && thisArg) {
		console.log(`processPastEvents ${network}: AlwaysUseEtherscanParser enabled, using cached event logs from parser...`);
		return await thisArg.processPastEventsFromParserCache(contract, filter, since_block, to_block, thisArg, handler);
	}
	
	// If to_block is 'latest' or 0, we need to get the current block number
	let actual_to_block = to_block;
	if (!to_block || to_block === 'latest' || to_block === 0) {
		if (thisArg) {
			actual_to_block = await thisArg.getBlockNumber();
		} else {
			// Fallback: use a reasonable default if we can't get block number
			actual_to_block = since_block + MAX_BLOCK_RANGE;
		}
	}
	
	// If we have imported data and are still within its range, skip provider queries
	// Similar to parser cache - use imported data instead of querying provider
	if (thisArg && network) {
		const hasImportedData = await thisArg.hasImportedDataForNetwork();
		if (hasImportedData) {
			// Use getMaxBlockFromImportedData() to get the last_block from import_metadata
			// This ensures we use the correct block number from the import, not from last_blocks table
			const importedLastBlock = await thisArg.getMaxBlockFromImportedData();
			if (importedLastBlock !== null) {
				// If we're querying blocks that are within the imported data range, skip provider query
				// The events are already in the database from the import
				if (since_block <= importedLastBlock && actual_to_block <= importedLastBlock) {
					console.log(`processPastEvents ${network}: skipping provider query - using imported data (since_block=${since_block}, to_block=${actual_to_block}, imported_data_up_to=${importedLastBlock})`);
					return 0; // Return 0 events since they're already in the database
				}
			}
		}
	}
	
	// Calculate block range
	const blockRange = actual_to_block - since_block;
	
	// If range exceeds limit, chunk it into smaller queries
	if (blockRange > MAX_BLOCK_RANGE) {
		console.log(`processPastEvents ${network}: block range ${blockRange} exceeds limit ${MAX_BLOCK_RANGE}, chunking into smaller queries`);
		let totalEvents = 0;
		let current_from = since_block;
		
		while (current_from < actual_to_block) {
			const current_to = Math.min(current_from + MAX_BLOCK_RANGE - 1, actual_to_block);
			console.log(`processPastEvents ${network}: processing chunk ${current_from} to ${current_to} (${current_to - current_from + 1} blocks)`);
			
			try {
				const chunkEvents = await processPastEvents(contract, filter, current_from, current_to, thisArg, handler, 0);
				totalEvents += chunkEvents;
			} catch (e) {
				console.error(`processPastEvents ${network}: chunk ${current_from}-${current_to} failed:`, e.message);
				// Continue with next chunk even if one fails
			}
			
			current_from = current_to + 1;
			// Small delay between chunks to avoid rate limiting
			await wait(50);
		}
		
		console.log(`processPastEvents ${network}: completed chunked processing, found ${totalEvents} total events`);
		return totalEvents;
	}
	
	// Normal processing for ranges within limit
	console.log('processPastEvents', network, contract.address, since_block, to_block, filter, retryCount > 0 ? `(retry ${retryCount})` : '');
	try {
		var events = await contract.queryFilter(filter, since_block, to_block || 'latest');
	}
	catch (e) {
		console.log(`processPastEvents failed`, network, contract.address, since_block, to_block, e);
		const errMsg = e.toString();
		
		// Check if error is due to block range limit
		if (errMsg.includes("max range limit") || errMsg.includes("Exceeded max range") || errMsg.includes("query returned more than")) {
			// First try chunking if range is large
			if (blockRange > MAX_BLOCK_RANGE) {
				console.log(`processPastEvents ${network}: block range limit error detected for range ${blockRange}, chunking into smaller pieces`);
				// Chunk the range - this will recursively call processPastEvents with smaller chunks
				let totalEvents = 0;
				let current_from = since_block;
				
				while (current_from < actual_to_block) {
					const current_to = Math.min(current_from + MAX_BLOCK_RANGE - 1, actual_to_block);
					console.log(`processPastEvents ${network}: processing chunk ${current_from} to ${current_to} after range limit error`);
					
					try {
						const chunkEvents = await processPastEvents(contract, filter, current_from, current_to, thisArg, handler, 0);
						totalEvents += chunkEvents;
					} catch (chunkError) {
						console.error(`processPastEvents ${network}: chunk ${current_from}-${current_to} failed:`, chunkError.message);
						// Continue with next chunk even if one fails
					}
					
					current_from = current_to + 1;
					await wait(50);
				}
				
				return totalEvents;
			}
			
			// If chunking isn't possible or also fails, try transaction-based fallback
			if (thisArg && thisArg.getAddressBlocks) {
				console.log(`processPastEvents ${network}: block range limit error, attempting transaction-based fallback...`);
				try {
					// First check if we have cached transactions from previous parser call
					let transactions = thisArg.getCachedTransactions(contract.address);
					
					if (!transactions || transactions.length === 0) {
						// No cache, try to get transaction hashes from HTML parser fallback
						let parserResult;
						if (network === 'BSC') {
							const { parseBSCScanBlockNumbers } = require('./bscscan-simple-parser.js');
							parserResult = await parseBSCScanBlockNumbers(contract.address, { 
								delay: 2000, 
								retries: 2,
								includeTransactions: true,
								includeEventLogs: true // Include event logs when parsing
							});
						} else if (network === 'Ethereum') {
							const { parseEtherscanBlockNumbers } = require('./etherscan-simple-parser.js');
							parserResult = await parseEtherscanBlockNumbers(contract.address, { 
								delay: 2000, 
								retries: 2,
								includeTransactions: true,
								includeEventLogs: true // Include event logs when parsing
							});
						}
						
						if (parserResult && parserResult.success && parserResult.transactions && parserResult.transactions.length > 0) {
							transactions = parserResult.transactions;
							// Cache them for future use
							thisArg.storeCachedTransactions(contract.address, transactions);
							
							// Also cache event logs for each transaction if they exist
							transactions.forEach(tx => {
								if (tx.eventLogs && tx.eventLogs.length > 0) {
									thisArg.storeCachedEventLogs(tx.txHash, tx.eventLogs);
								}
							});
						}
					} else {
						console.log(`processPastEvents ${network}: using cached transactions (${transactions.length} transactions)`);
					}
					
					if (transactions && transactions.length > 0) {
						// Filter transactions by block range
						const relevantTxs = transactions
							.filter(tx => tx.blockNumber >= since_block && tx.blockNumber <= actual_to_block)
							.map(tx => tx.txHash);
						
						if (relevantTxs.length > 0) {
							console.log(`processPastEvents ${network}: found ${relevantTxs.length} transactions in range, querying individually...`);
							// Pass the filter to only process matching events
							const txEventCount = await thisArg.processEventsFromTransactions(contract, relevantTxs, thisArg, handler, filter);
							if (txEventCount > 0) {
								console.log(`processPastEvents ${network}: transaction-based fallback processed ${txEventCount} events`);
								return txEventCount;
							}
						}
					}
				} catch (fallbackError) {
					console.log(`processPastEvents ${network}: transaction-based fallback failed:`, fallbackError.message);
					// Continue to throw original error
				}
			}
			
			// If range is already small but still failing, this might be a different issue
			console.error(`processPastEvents ${network}: block range limit error but range is only ${blockRange} blocks, this may indicate a provider issue`);
			throw e;
		}
		
		if (isRateLimitError(errMsg)) {
			if (retryCount >= maxRetries) {
				console.error(`processPastEvents ${network} failed after ${maxRetries} retries (rate limit), throwing error`);
				throw e;
			}
			console.log(`will retry later (rate limit, attempt ${retryCount + 1}/${maxRetries})`);
			const delay = Math.min(100 * Math.pow(2, retryCount), 5000); // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1.6s, 3.2s, 5s max
			await wait(delay);
			return processPastEvents(contract, filter, since_block, to_block, thisArg, handler, retryCount + 1);
		}
		if (errMsg.includes("internal error") || errMsg.includes("temporarily unavailable")) {
			// If we've retried a few times, try transaction-based fallback instead of continuing to retry
			if (retryCount >= 3 && thisArg && thisArg.getAddressBlocks) {
				console.log(`processPastEvents ${network}: internal error after ${retryCount} retries, attempting transaction-based fallback...`);
				try {
					// First check if we have cached transactions from previous parser call
					let transactions = thisArg.getCachedTransactions(contract.address);
					
					if (!transactions || transactions.length === 0) {
						// No cache, try to get transaction hashes from HTML parser fallback
						let parserResult;
						if (network === 'BSC') {
							const { parseBSCScanBlockNumbers } = require('./bscscan-simple-parser.js');
							parserResult = await parseBSCScanBlockNumbers(contract.address, { 
								delay: 2000, 
								retries: 2,
								includeTransactions: true,
								includeEventLogs: true
							});
						} else if (network === 'Ethereum') {
							const { parseEtherscanBlockNumbers } = require('./etherscan-simple-parser.js');
							parserResult = await parseEtherscanBlockNumbers(contract.address, { 
								delay: 2000, 
								retries: 2,
								includeTransactions: true,
								includeEventLogs: true
							});
						}
						
						if (parserResult && parserResult.success && parserResult.transactions && parserResult.transactions.length > 0) {
							transactions = parserResult.transactions;
							// Cache them for future use
							thisArg.storeCachedTransactions(contract.address, transactions);
							
							// Also cache event logs for each transaction if they exist
							transactions.forEach(tx => {
								if (tx.eventLogs && tx.eventLogs.length > 0) {
									thisArg.storeCachedEventLogs(tx.txHash, tx.eventLogs);
								}
							});
						}
					} else {
						console.log(`processPastEvents ${network}: using cached transactions after internal error (${transactions.length} transactions)`);
					}
					
					if (transactions && transactions.length > 0) {
						// Filter transactions by block range
						const relevantTxs = transactions
							.filter(tx => tx.blockNumber >= since_block && tx.blockNumber <= actual_to_block)
							.map(tx => tx.txHash);
						
						if (relevantTxs.length > 0) {
							console.log(`processPastEvents ${network}: found ${relevantTxs.length} transactions in range, querying individually after internal error...`);
							// Pass the filter to only process matching events
							const txEventCount = await thisArg.processEventsFromTransactions(contract, relevantTxs, thisArg, handler, filter);
							if (txEventCount > 0) {
								console.log(`processPastEvents ${network}: transaction-based fallback processed ${txEventCount} events after internal error`);
								return txEventCount;
							}
						}
					}
				} catch (fallbackError) {
					console.log(`processPastEvents ${network}: transaction-based fallback failed after internal error:`, fallbackError.message);
					// Continue with normal retry logic
				}
			}
			
			// Continue with normal retry logic if fallback didn't work or retryCount < 3
			if (retryCount >= maxRetries) {
				console.error(`processPastEvents ${network} failed after ${maxRetries} retries (internal error), throwing error`);
				throw e;
			}
			console.log(`transient, will retry later (attempt ${retryCount + 1}/${maxRetries})`);
			const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
			console.log(`Waiting ${delay}ms before retry...`);
			await wait(delay);
			return processPastEvents(contract, filter, since_block, to_block, thisArg, handler, retryCount + 1);
		}
		throw e;
	}
	for (let event of events) {
		console.log('--- past event', network, event);
		let args = event.args.concat();
		args.push(event);
		await handler.apply(thisArg, args);
	}
	console.log('processPastEvents', network, contract.address, since_block, to_block, `found ${events.length} events`);
	await wait(50);
	return events.length;
}

module.exports = EvmChain;

