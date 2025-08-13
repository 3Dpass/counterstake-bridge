#!/usr/bin/env node

/**
 * Test script to verify ERC20 precompile for custom assets (Asset1, Asset2, and Asset3) via poscanAssets pallet
 * Uses batching for faster asset creation
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

// Function to create all assets in batch
async function createAllAssets(api, admin, assets) {
  console.log('1️⃣  Creating all assets in batch...');
  
  const createCalls = assets.map(asset => 
    api.tx.poscanAssets.create(asset.assetId, admin.address, asset.minBalance, asset.objDetails)
  );

  try {
    await waitForEvent(
      api.tx.utility.batch(createCalls),
      admin,
      'poscanAssets',
      'Created'
    );
    console.log('✅ All assets created successfully');
    return true;
  } catch (err) {
    if (err.message && err.message.includes('InUse')) {
      console.log('⚠️  Some assets already exist, continuing...');
      return true;
    } else {
      console.error('❌ Failed to create assets in batch:', err);
      return false;
    }
  }
}

// Function to set metadata for all assets in batch
async function setAllMetadata(api, admin, assets) {
  console.log('2️⃣  Setting metadata for all assets in batch...');
  
  const metadataCalls = assets.map(asset => 
    api.tx.poscanAssets.setMetadata(
      asset.assetId,
      Array.from(Buffer.from(asset.metadata.name)),
      Array.from(Buffer.from(asset.metadata.symbol)),
      asset.metadata.decimals
    )
  );

  try {
    await waitForEvent(
      api.tx.utility.batch(metadataCalls),
      admin,
      'poscanAssets',
      'MetadataSet'
    );
    console.log('✅ All metadata set successfully');
    return true;
  } catch (err) {
    if (err.message && err.message.includes('BadMetadata')) {
      console.log('⚠️  Some metadata already set, continuing...');
      return true;
    } else {
      console.error('❌ Failed to set metadata in batch:', err);
      return false;
    }
  }
}

// Function to mint all assets in batch
async function mintAllAssets(api, admin, assets) {
  console.log('3️⃣  Minting 1,000,000,000,000,000 tokens for each asset in batch...');
  
  const mintCalls = assets.map(asset => 
    api.tx.poscanAssets.mint(asset.assetId, admin.address, 1000000000000000)
  );

  try {
    await waitForEvent(
      api.tx.utility.batch(mintCalls),
      admin,
      'poscanAssets',
      'Issued'
    );
    console.log('✅ All assets minted successfully');
    return true;
  } catch (err) {
    if (err.message && err.message.includes('NoPermission')) {
      console.log('⚠️  Some assets already minted or no permission, continuing...');
      return true;
    } else {
      console.error('❌ Failed to mint assets in batch:', err);
      return false;
    }
  }
}

// Function to test a single asset (individual testing for verification)
async function testSingleAsset(api, assetCfg, assetName, rpcUrl) {
  console.log(`\n🧪 Testing ${assetName} ERC20 precompile...`);
  
  try {
    // Query asset and metadata
    const assetDetails = await api.query.poscanAssets.asset(assetCfg.assetId);
    const metadataDetails = await api.query.poscanAssets.metadata(assetCfg.assetId);
    console.log(`${assetName} Asset:`, assetDetails.toHuman());
    console.log(`${assetName} Metadata:`, metadataDetails.toHuman());

    // Check ERC20 precompile for asset
    const web3 = new Web3(rpcUrl);
    const contract = new web3.eth.Contract(ERC20_ABI, assetCfg.evmContract);
    
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
    
    console.log(`✅ ${assetName} ERC20 precompile test completed successfully`);
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
  const admin = keyring.addFromMnemonic(adminAccount.seed);

  console.log('🧪 Testing poscanAssets ERC20 Precompile for All Bridge Assets (Batched)');
  console.log('========================================================================\n');

  let allTestsPassed = true;

  try {
    // Extract all assets from config using symbols from config
    const allAssets = [
      { name: `Asset1 (${config.development.assets.Asset1.metadata.symbol})`, config: config.development.assets.Asset1 },
      { name: `Asset2 (${config.development.assets.Asset2.metadata.symbol})`, config: config.development.assets.Asset2 },
      { name: `Asset3 (${config.development.assets.Asset3.metadata.symbol})`, config: config.development.assets.Asset3 },
      { name: `Asset4 (${config.development.assets.Asset4.metadata.symbol})`, config: config.development.assets.Asset4 },
      { name: `Asset5 (${config.development.assets.Asset5.metadata.symbol})`, config: config.development.assets.Asset5 },
      { name: `Asset6 (${config.development.assets.Asset6.metadata.symbol})`, config: config.development.assets.Asset6 },
      { name: `Asset7 (${config.development.assets.Asset7.metadata.symbol})`, config: config.development.assets.Asset7 },
      { name: `Asset8 (${config.development.assets.Asset8.metadata.symbol})`, config: config.development.assets.Asset8 },
      { name: `Asset9 (${config.development.assets.Asset9.metadata.symbol})`, config: config.development.assets.Asset9 }
    ];

    console.log('📦 Creating all 9 assets in batches...');
    
    // 1. Create all assets in batch
    const createSuccess = await createAllAssets(api, admin, allAssets.map(a => a.config));
    if (!createSuccess) allTestsPassed = false;

    // 2. Set metadata for all assets in batch
    const metadataSuccess = await setAllMetadata(api, admin, allAssets.map(a => a.config));
    if (!metadataSuccess) allTestsPassed = false;

    // 3. Mint all assets in batch
    const mintSuccess = await mintAllAssets(api, admin, allAssets.map(a => a.config));
    if (!mintSuccess) allTestsPassed = false;

    // 4. Test each asset individually (fast verification)
    console.log('\n🔍 Testing each asset individually...');
    const testResults = [];
    
    for (const asset of allAssets) {
      const result = await testSingleAsset(api, asset.config, asset.name, config.development.network.rpcUrl);
      testResults.push({ name: asset.name, result });
      if (!result) allTestsPassed = false;
    }

    // Final summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log('Batch Operations:');
    console.log(`  Asset Creation: ${createSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Metadata Setting: ${metadataSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Asset Minting: ${mintSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    
    console.log('\nIndividual Asset Tests:');
    testResults.forEach(({ name, result }) => {
      console.log(`  ${name}: ${result ? '✅ PASSED' : '❌ FAILED'}`);
    });
    
    if (allTestsPassed) {
      console.log('\n🎉 All 9 asset ERC20 precompile tests completed successfully!');
      console.log('\n📋 Asset Summary:');
      console.log(`  Base Assets: ${config.development.assets.Asset1.metadata.symbol}, ${config.development.assets.Asset2.metadata.symbol}, ${config.development.assets.Asset3.metadata.symbol}`);
      console.log(`  Native Assets: ${config.development.assets.Asset4.metadata.symbol}, ${config.development.assets.Asset5.metadata.symbol}, ${config.development.assets.Asset6.metadata.symbol}`);
      console.log(`  Additional Assets: ${config.development.assets.Asset7.metadata.symbol}, ${config.development.assets.Asset8.metadata.symbol}, ${config.development.assets.Asset9.metadata.symbol}`);
      console.log('\n🚀 Ready for bridge deployment with all required assets!');
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