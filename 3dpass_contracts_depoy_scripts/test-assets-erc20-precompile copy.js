#!/usr/bin/env node

/**
 * Test script to verify ERC20 precompile for custom assets (Asset1 and Asset2) via poscanAssets pallet
 */

const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { cryptoWaitReady } = require('@polkadot/util-crypto');
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

const ERC20_ABI = [
  { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
  { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" },
  { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" }
];

// Helper to robustly await extrinsic finalization and event
async function waitForEvent(tx, signer, section, method) {
  return new Promise((resolve, reject) => {
    let unsub = null;
    tx.signAndSend(signer, { nonce: -1 }, ({ status, events, dispatchError }) => {
      if (dispatchError) {
        reject(dispatchError.toString());
        if (unsub) unsub();
      }
      if (status.isInBlock || status.isFinalized) {
        for (const { event } of events) {
          if (event.section === section && event.method === method) {
            resolve();
            if (unsub) unsub();
          }
        }
        if (status.isFinalized && unsub) unsub();
      }
    }).then(u => { unsub = u; }).catch(reject);
  });
}

// Function to create and test a single asset
async function createAndTestAsset(api, admin, assetCfg, assetName, rpcUrl) {
  console.log(`\n🧪 Testing poscanAssets ERC20 Precompile for ${assetName}`);
  console.log('===============================================');

  const assetId = assetCfg.assetId;
  const minBalance = assetCfg.minBalance;
  const objDetails = null;
  const metadata = assetCfg.metadata;
  const evmContract = assetCfg.evmContract;

  let assetCreated = false;
  try {
    // 1. Create asset
    try {
      console.log(`1️⃣  Creating ${assetName}...`);
      await waitForEvent(
        api.tx.poscanAssets.create(assetId, admin.address, minBalance, objDetails),
        admin,
        'poscanAssets',
        'Created'
      );
      console.log(`✅ ${assetName} created: id=${assetId}`);
      assetCreated = true;
    } catch (err) {
      if (err.message && err.message.includes('InUse')) {
        console.log(`⚠️  ${assetName} already exists, continuing...`);
        assetCreated = true;
      } else {
        throw err;
      }
    }

    // 2. Set metadata
    try {
      console.log(`2️⃣  Setting ${assetName} metadata...`);
      await waitForEvent(
        api.tx.poscanAssets.setMetadata(
          assetId,
          Array.from(Buffer.from(metadata.name)),
          Array.from(Buffer.from(metadata.symbol)),
          metadata.decimals
        ),
        admin,
        'poscanAssets',
        'MetadataSet'
      );
      console.log(`✅ ${assetName} metadata set`);
    } catch (err) {
      if (err.message && err.message.includes('BadMetadata')) {
        console.log(`⚠️  ${assetName} metadata already set, continuing...`);
      } else {
        throw err;
      }
    }

    // 3. Mint 1 token
    try {
      console.log(`3️⃣  Minting 1 ${assetName} token...`);
      await waitForEvent(
        api.tx.poscanAssets.mint(assetId, 1),
        admin,
        'poscanAssets',
        'Issued'
      );
      console.log(`✅ 1 ${assetName} token minted`);
    } catch (err) {
      if (err.message && err.message.includes('NoPermission')) {
        console.log(`⚠️  ${assetName} already minted or no permission, continuing...`);
      } else {
        throw err;
      }
    }

    // 4. Query asset and metadata
    console.log(`4️⃣  Querying ${assetName} details...`);
    const assetDetails = await api.query.poscanAssets.asset(assetId);
    const metadataDetails = await api.query.poscanAssets.metadata(assetId);
    console.log(`${assetName} Asset:`, assetDetails.toHuman());
    console.log(`${assetName} Metadata:`, metadataDetails.toHuman());

    // 5. Check ERC20 precompile for asset
    console.log(`5️⃣  Checking ERC20 precompile for ${assetName}...`);
    const web3 = new Web3(rpcUrl);
    const contract = new web3.eth.Contract(ERC20_ABI, evmContract);
    try {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.methods.name().call(),
        contract.methods.symbol().call(),
        contract.methods.decimals().call(),
        contract.methods.totalSupply().call()
      ]);
      console.log(`   ${assetName} Name: ${name}`);
      console.log(`   ${assetName} Symbol: ${symbol}`);
      console.log(`   ${assetName} Decimals: ${decimals}`);
      console.log(`   ${assetName} Total Supply: ${totalSupply}`);
    } catch (err) {
      console.log(`❌ Failed to query ${assetName} ERC20 precompile:`, err.message);
      throw err;
    }

    console.log(`\n✅ ${assetName} ERC20 precompile test completed successfully`);
    return true;
  } catch (err) {
    console.error(`❌ ${assetName} test failed:`, err);
    return false;
  }
}

async function main() {
  // Load config
  const configPath = path.join(__dirname, 'bridge-test-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Find account4 in the config and use it as the admin for all substrate extrinsics
  const adminAccount = config.development.accounts.account4;

  const wsUrl = config.development.network.wsUrl;

  // Substrate setup
  await cryptoWaitReady();
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider });
  const keyring = new Keyring({ type: 'sr25519' });
  const admin = keyring.addFromUri(adminAccount.privateKey);

  console.log('🧪 Testing poscanAssets ERC20 Precompile for Asset1 and Asset2');
  console.log('=============================================================\n');

  let allTestsPassed = true;

  try {
    // Test Asset1
    const asset1Cfg = config.development.assets.Asset1;
    const asset1Result = await createAndTestAsset(api, admin, asset1Cfg, 'Asset1', config.development.network.rpcUrl);
    if (!asset1Result) allTestsPassed = false;

    // Test Asset2
    const asset2Cfg = config.development.assets.Asset2;
    const asset2Result = await createAndTestAsset(api, admin, asset2Cfg, 'Asset2', config.development.network.rpcUrl);
    if (!asset2Result) allTestsPassed = false;

    // Final summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log(`Asset1 (wUSDT): ${asset1Result ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Asset2 (wUSDC): ${asset2Result ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (allTestsPassed) {
      console.log('\n🎉 All asset ERC20 precompile tests completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Check the logs above for details.');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    try {
      await api.disconnect();
      console.log('🔌 Disconnected from Substrate API');
    } catch (disconnectErr) {
      console.warn('⚠️  Warning: Failed to disconnect cleanly:', disconnectErr.message);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
} 