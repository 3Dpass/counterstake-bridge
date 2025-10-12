const { ethers } = require("ethers");
const { request } = require('./request.js');
const { asyncCallWithTimeout } = require('./utils.js');
const network = require('ocore/network.js');
const mutex = require('ocore/mutex.js');
const { getProvider } = require('./evm/provider.js');

const { constants: { AddressZero } } = ethers;

const nativeSymbols = {
	Ethereum: 'ETH',
	BSC: 'BNB',
	Polygon: 'MATIC',
	Kava: 'KAVA',
	'3DPass': 'P3D',
};

// 3DPass Oracle configuration
const THREEDPASS_ORACLE_ADDRESS = '0x237527b4F7bb0030Bd5B7B863839Aa121cefd5fB';
const P3D_ADDRESS = '0x0000000000000000000000000000000000000802';
const WUSDT_ADDRESS = '0xfBFBfbFA000000000000000000000000000000de';
const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// 3DPass Oracle ABI (minimal)
const ORACLE_ABI = [
	"function getPrice(string memory tokenA, string memory tokenB) view returns (uint256 numerator, uint256 denominator)"
];


const cache_lifetime = 60 * 60 * 1000; // 60 minutes

class Cache {
	#data = {};

	get(key, bEvenIfExpired) {
		const record = this.#data[key];
		if (!record)
			return null;
		if (bEvenIfExpired)
			return record.value;
		if (record.ts < Date.now() - cache_lifetime) // expired
			return null;
		return record.value;
	}

	put(key, value) {
		this.#data[key] = { value, ts: Date.now() };
	}
}

const cache = new Cache();

function cachify(func, count_args) {
	return async function() {
		const cached = arguments[count_args]; // the last arg is optional
		const args = [];
		for (let i = 0; i < count_args; i++) // not including the 'cached' arg
			args[i] = arguments[i];
		const key = func.name + '_' + args.join(',');
		const unlock = await mutex.lock(key);
		if (cached) {
			const value = cache.get(key);
			if (value !== null) {
				console.log(`using cached value ${value} for`, func.name, arguments)
				unlock();
				return value;
			}
			else
				console.log(`no cached value for ${key} or it expired`);
		}
		else
			console.log(`requested ${key} without cache`);
		try {
			const value = await asyncCallWithTimeout(func.apply(null, args), 10 * 1000);
			cache.put(key, value);
			console.log(`cached`, key, value);
			unlock();
			return value
		}
		catch (e) {
			console.log(func.name, arguments, 'failed', e);
			const value = cache.get(key, true);
			if (value !== null) {
				console.log(`using expired cached value ${value} for`, func.name, arguments, `requested cached=${cached}`)
				cache.put(key, value);
				unlock();
				return value;
			}
			console.log(`no cached value of ${key}, rethrowing`);
			unlock();
			throw e;
		}
	}
}


const fetchERC20ExchangeRate = async (chain, token_address, quote) => {
	if (process.env.testnet) {
		if (token_address === '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b') // USDC rinkeby
			token_address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
		else if (token_address === '0xbF7A7169562078c96f0eC1A8aFD6aE50f12e5A99') // BAT rinkeby
			token_address = '0x0D8775F648430679A709E98d2b0Cb6250d2887EF';
		else if (token_address === '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee') // BUSD testnet
			token_address = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
		else if (token_address === '0x43D8814FdFB9B8854422Df13F1c66e34E4fa91fD') // Kava USDC testnet
			token_address = '0xfA9343C3897324496A05fC75abeD6bAC29f8A40f';
		else {
			console.log(`token ${token_address} not known on ${chain} testnet`);
			return null;
		}
	}
	else if (process.env.devnet) {
		if (token_address === '0xB554fCeDb8E4E0DFDebbE7e58Ee566437A19bfB2') // DAI devnet
			token_address = '0x6b175474e89094c44da98b954eedeac495271d0f';
		else {
			console.log(`token ${token_address} not known on ${chain} devnet`);
			return null;
		}		
	}
	else {
		if (chain === 'kava' && token_address === '0x31f8d38df6514b6cc3C360ACE3a2EFA7496214f6') { // LINE
			console.log(`getting price of LINE`);
			return getObyteAssetPrice('kNWO9R4/oiZ7m+3k4RgBxR2Lrdb/rtfIYB2XKVytCc0=');
		}
	}
	const data = await asyncCallWithTimeout(request(`https://api.coingecko.com/api/v3/coins/${chain}/contract/${token_address.toLowerCase()}`), 15 * 1000)
	const prices = data.market_data.current_price
	quote = quote.toLowerCase()
	if (!prices[quote]) {
		if (!prices.usd)
			throw new Error(`no ${quote} and no usd in response ${JSON.stringify(data)}`);
		const quote_price_in_usd = await fetchExchangeRateCached(quote, 'USD', true);
		return prices.usd / quote_price_in_usd;
	}
	return prices[quote]
}

function getCoingeckoId(currency) {
	switch (currency) {
		case 'gbyte': return 'byteball';
		case 'eth': return 'ethereum';
		case 'bnb': return 'binancecoin';
		case 'matic': return 'matic-network';
		case 'p3d': return '3dpass';
		case '3dpass': return '3dpass';
		default: return currency;
	}
}

const fetchCoingeckoExchangeRate = async (in_currency, out_currency) => {
	const id = getCoingeckoId(in_currency.toLowerCase());
	out_currency = out_currency.toLowerCase();
	if (!['usd'/*, 'eth', 'bnb'*/].includes(out_currency))
		return await fetchExchangeRateCached(in_currency, 'USD', true) / await fetchExchangeRateCached(out_currency, 'USD', true);
	const data = await request(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${out_currency}`)
	if (!data[id] || !data[id][out_currency])
		throw new Error(`no ${out_currency} in CG response ${JSON.stringify(data)}`);
	return data[id][out_currency];
}

const fetchCryptocompareExchangeRate = async (in_currency, out_currency) => {
	out_currency = out_currency.toUpperCase();
	const data = await request(`https://min-api.cryptocompare.com/data/price?fsym=${in_currency}&tsyms=${out_currency}`)
	if (!data[out_currency])
		throw new Error(`no ${out_currency} in response ${JSON.stringify(data)}`);
	return data[out_currency]
}

const fetchObyteTokenPrices = async () => {
	const data = await request(process.env.testnet ? `https://testnet.ostable.org/r/prices` : `https://referrals.ostable.org/prices`)
	const prices = data.data
	if (!prices)
		throw Error(`no prices from referrals ${data.error}`);
	return prices
}

function getObyteAssetPrice(asset) {
	const price = network.exchangeRates[asset + '_USD'];
	if (!price)
		throw Error(`no price of ${asset}`);
	return price;
}

const fetchERC20ExchangeRateCached = cachify(fetchERC20ExchangeRate, 3)
const fetchCryptocompareExchangeRateCached = cachify(fetchCryptocompareExchangeRate, 2)
const fetchCoingeckoExchangeRateCached = cachify(fetchCoingeckoExchangeRate, 2)
const fetchObyteTokenPricesCached = cachify(fetchObyteTokenPrices, 0)

async function fetchExchangeRateCached(in_currency, out_currency, cached) {
	in_currency = in_currency.toUpperCase();
	out_currency = out_currency.toUpperCase();
	return in_currency === 'GBYTE'
		? await fetchCoingeckoExchangeRateCached(in_currency, out_currency, cached)
		: await fetchCryptocompareExchangeRateCached(in_currency, out_currency, cached);
}

const coingeckoChainIds = {
	Ethereum: 'ethereum',
	BSC: 'binance-smart-chain',
	Polygon: 'polygon-pos',
	Kava: 'kava',
	'3DPass': '3dpass',
};

async function tryGetTokenPrice(network, token_address, nativeSymbol, cached) {
	switch (network) {
		case 'Ethereum':
			try {
				const chain = coingeckoChainIds[network];
				return await fetchERC20ExchangeRateCached(chain, token_address, nativeSymbol, cached);
			}
			catch (e) {
				console.log(`fetchERC20ExchangeRate for ${network} ${token_address}/${nativeSymbol} failed, trying 3DPass oracle fallback`, e);
				// Fallback to 3DPass oracle for ETH/USDT and USDT/P3D pairs
				try {
					const fallbackRate = await fetch3DPassOraclePrice(token_address, nativeSymbol, cached);
					if (fallbackRate) {
						console.log(`✅ 3DPass oracle fallback succeeded: ${token_address}/${nativeSymbol} = ${fallbackRate}`);
					} else {
						console.log(`❌ 3DPass oracle fallback returned null for ${token_address}/${nativeSymbol}`);
					}
					return fallbackRate;
				} catch (fallbackError) {
					console.log(`❌ 3DPass oracle fallback failed for ${token_address}/${nativeSymbol}:`, fallbackError.message);
					return null;
				}
			}
			break;
		case 'BSC':
		case 'Polygon':
		case 'Kava':
			try {
				const chain = coingeckoChainIds[network];
				return await fetchERC20ExchangeRateCached(chain, token_address, nativeSymbol, cached);
			}
			catch (e) {
				console.log(`fetchERC20ExchangeRate for ${network} ${token_address}/${nativeSymbol} failed`, e);
			}
			break;
		case '3DPass':
			try {
				const chain = coingeckoChainIds[network];
				return await fetchERC20ExchangeRateCached(chain, token_address, nativeSymbol, cached);
			}
			catch (e) {
				console.log(`fetchERC20ExchangeRate for ${network} ${token_address}/${nativeSymbol} failed, trying 3DPass oracle fallback`, e);
				// Fallback to 3DPass oracle for P3D-related prices
				return await fetch3DPassOraclePrice(token_address, nativeSymbol, cached);
			}
			break;
	}
	return null;
}

// Fetch price from 3DPass oracle as fallback
async function fetch3DPassOraclePrice(token_address, nativeSymbol, cached) {
	try {
		console.log(`Fetching 3DPass oracle price for ${token_address}/${nativeSymbol}`);
		
		// Get 3DPass provider
		const provider = getProvider('3DPass');
		const oracle = new ethers.Contract(THREEDPASS_ORACLE_ADDRESS, ORACLE_ABI, provider);
		
		// Determine token symbols for oracle query
		let tokenA, tokenB;
		
		if (nativeSymbol === 'P3D') {
			// We want token_address/P3D rate
			if (token_address === WUSDT_ADDRESS) {
				tokenA = 'P3D';
				tokenB = WUSDT_ADDRESS;
			} else if (token_address === USDT_ADDRESS) {
				// For USDT/P3D rate, we need to query P3D/USDT and invert
				tokenA = 'P3D';
				tokenB = USDT_ADDRESS;
			} else {
				console.log(`Unknown token address ${token_address} for 3DPass oracle`);
				return null;
			}
		} else if (nativeSymbol === 'ETH') {
			// We want token_address/ETH rate
			if (token_address === USDT_ADDRESS) {
				tokenA = 'ETH';
				tokenB = USDT_ADDRESS;
			} else {
				console.log(`Unknown token address ${token_address} for ETH oracle fallback`);
				return null;
			}
		} else {
			console.log(`3DPass oracle fallback only supports P3D and ETH as native symbols, got ${nativeSymbol}`);
			return null;
		}
		
		// Query oracle with timeout
		const priceData = await asyncCallWithTimeout(oracle.getPrice(tokenA, tokenB), 15 * 1000);
		const numerator = parseFloat(ethers.utils.formatEther(priceData[0]));
		const denominator = parseFloat(ethers.utils.formatEther(priceData[1]));
		
		if (denominator === 0) {
			console.log(`3DPass oracle returned zero denominator for ${tokenA}/${tokenB}`);
			return null;
		}
		
		const rate = numerator / denominator;
		console.log(`3DPass oracle price ${tokenA}/${tokenB}: ${rate} (${numerator}/${denominator})`);
		
		// For P3D/token and ETH/token queries, we need to invert to get token/native
		if (tokenA === 'P3D') {
			const invertedRate = 1 / rate;
			console.log(`Inverted rate ${tokenB}/P3D: ${invertedRate}`);
			return invertedRate;
		} else if (tokenA === 'ETH') {
			const invertedRate = 1 / rate;
			console.log(`Inverted rate ${tokenB}/ETH: ${invertedRate}`);
			return invertedRate;
		}
		
		return rate;
		
	} catch (error) {
		console.log(`3DPass oracle price fetch failed for ${token_address}/${nativeSymbol}:`, error.message);
		return null;
	}
}

// dst_network must be EVM based
async function fetchExchangeRateInNativeAsset(type, dst_network, claimed_asset, src_network, src_asset, cached) {
	const nativeSymbol = nativeSymbols[dst_network];
	if (!nativeSymbol)
		throw Error(`native symbol for network ${dst_network} unknown`);
	if (type === 'repatriation')
		return await tryGetTokenPrice(dst_network, claimed_asset, nativeSymbol, cached);
	let rate = await tryGetTokenPrice(src_network, src_asset, nativeSymbol, cached);
	if (rate)
		return rate;
	if (src_network === 'Obyte') {
		if (src_asset === 'base')
			rate = await fetchExchangeRateCached('GBYTE', nativeSymbol, cached)
		else {
			const prices = await fetchObyteTokenPricesCached(cached);
			const price_in_usd = prices[toMainnetObyteAsset(src_asset)];
			if (!price_in_usd)
				return null;
			const native_price_in_usd = await fetchExchangeRateCached(nativeSymbol, 'USD', cached)
			rate = price_in_usd / native_price_in_usd
		}
	}
	return rate;
}

async function fetchExchangeRateInUSD(network, asset, cached) {
	if (network === 'Obyte') {
		if (asset === 'base')
			return await fetchExchangeRateCached('GBYTE', 'USD', cached);
		const prices = await fetchObyteTokenPricesCached(cached);
		const price_in_usd = prices[toMainnetObyteAsset(asset)];
		return price_in_usd || null;
	}
	if (asset === AddressZero)
		return await fetchExchangeRateCached(nativeSymbols[network], 'USD', cached);
	return await tryGetTokenPrice(network, asset, 'USD', cached);
}

function toMainnetObyteAsset(asset) {
	if (asset === 'nDEJfA3xTO/n0PMBWxlw+ZvgmW9dVELeLaaFZDo8bQ8=') // OUSD devnet
		return '0IwAk71D5xFP0vTzwamKBwzad3I1ZUjZ1gdeB5OnfOg=';
	if (asset === 'CPPYMBzFzI4+eMk7tLMTGjLF4E60t5MUfo2Gq7Y6Cn4=') // OUSD testnet
		return '0IwAk71D5xFP0vTzwamKBwzad3I1ZUjZ1gdeB5OnfOg=';
	if (asset === 'RGJT5nS9Luw2OOlAeOGywxbxwWPXtDAbZfEw5PiXVug=') // IBIT testnet
		return 'viWGuQQnKBkXbuBFryfT3oJd+KHRWMtCDfy7ZEJguaA=';
	return asset;
}



async function test() {
	console.log('BAT', await fetchExchangeRateInNativeAsset('Ethereum', '0x0d8775f648430679a709e98d2b0cb6250d2887ef', 'Obyte', 'BAT-on-Obyte-asset-id', true))
	console.log('GBYTE', await fetchExchangeRateInNativeAsset('Ethereum', 'some-token-address', 'Obyte', 'base', true))
	console.log('SFUSD', await fetchExchangeRateInNativeAsset('Ethereum', 'some-token-address', 'Obyte', '4t1FplfMcmIFg9VrTj0CiwS6/OfWHZ8wZnAr6BW2rvY=', true))
}
//test();

exports.fetchExchangeRateInNativeAsset = fetchExchangeRateInNativeAsset;
exports.fetchExchangeRateInUSD = fetchExchangeRateInUSD;
exports.fetchCoingeckoExchangeRateCached = fetchCoingeckoExchangeRateCached;
exports.fetchExchangeRateCached = fetchExchangeRateCached;
exports.tryGetTokenPrice = tryGetTokenPrice;
exports.fetch3DPassOraclePrice = fetch3DPassOraclePrice;
