#!/usr/bin/env node

/**
 * Test script to set team (issuer, admin, freezer) for base assets
 * Transfers control from Account4 to corresponding ImportWrapper contracts
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

// Function to set team for base assets in batch
async function setTeamForBaseAssets(api, admin, assetsWithTargets) {
  console.log('1️⃣  Setting team for base assets in batch...');
  console.log(`   Transferring control from ${admin.address} to ImportWrapper contracts`);
  
  const setTeamCalls = assetsWithTargets.map(({ config, targetAddress }) => 
    api.tx.poscanAssets.setTeam(
      config.assetId,
      { Id: targetAddress }, // issuer
      { Id: targetAddress }, // admin  
      { Id: targetAddress }  // freezer
    )
  );

  try {
    await waitForEvent(
      api.tx.utility.batch(setTeamCalls),
      admin,
      'poscanAssets',
      'TeamChanged'
    );
    console.log('✅ Team set successfully for all base assets');
    return true;
  } catch (err) {
    console.error('❌ Failed to set team in batch:', err);
    return false;
  }
}

// Function to verify team transition for a single asset
async function verifyTeamTransition(api, assetCfg, assetName, expectedSubstrateAddress) {
  console.log(`\n🧪 Verifying team transition for ${assetName}...`);
  
  try {
    // Query asset details
    const assetDetails = await api.query.poscanAssets.asset(assetCfg.assetId);
    const assetInfo = assetDetails.toHuman();
    
    console.log(`${assetName} Asset Details:`);
    console.log(`  Owner: ${assetInfo.owner}`);
    console.log(`  Issuer: ${assetInfo.issuer}`);
    console.log(`  Admin: ${assetInfo.admin}`);
    console.log(`  Freezer: ${assetInfo.freezer}`);
    console.log(`  Supply: ${assetInfo.supply}`);
    console.log(`  Status: ${assetInfo.status}`);
    
    // Verify team transition
    console.log(`   Expected team address (substrate): ${expectedSubstrateAddress}`);
    console.log(`   Actual issuer: ${assetInfo.issuer}`);
    console.log(`   Actual admin: ${assetInfo.admin}`);
    console.log(`   Actual freezer: ${assetInfo.freezer}`);
    
    const teamCorrect = (
      assetInfo.issuer === expectedSubstrateAddress &&
      assetInfo.admin === expectedSubstrateAddress &&
      assetInfo.freezer === expectedSubstrateAddress
    );
    
    if (teamCorrect) {
      console.log(`✅ ${assetName} team transition successful:`);
      console.log(`   All roles (issuer, admin, freezer) now controlled by ${expectedSubstrateAddress}`);
    } else {
      console.log(`❌ ${assetName} team transition failed:`);
      console.log(`   Expected: ${expectedSubstrateAddress}`);
      console.log(`   Actual: issuer=${assetInfo.issuer}, admin=${assetInfo.admin}, freezer=${assetInfo.freezer}`);
    }
    
    // Test ERC20 precompile still works
    console.log(`\n🔍 Testing ${assetName} ERC20 precompile...`);
    const web3 = new Web3('http://127.0.0.1:9978');
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
    return teamCorrect;
  } catch (err) {
    console.error(`❌ ${assetName} verification failed:`, err);
    return false;
  }
}

async function main() {
  // Load config
  const configPath = path.join(__dirname, 'bridge-test-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Get accounts
  const adminAccount = config.development.accounts.account4; // Current admin

  const wsUrl = config.development.network.wsUrl;

  // Substrate setup
  await cryptoWaitReady();
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider });
  const keyring = new Keyring({ type: 'sr25519' });
  
  // Use seed phrase for account4 (admin) - only need the admin to sign the transaction
  const admin = keyring.addFromMnemonic(adminAccount.seed);

  console.log('🧪 Setting Team for Base Assets to ImportWrapper Contracts');
  console.log('==========================================================\n');

  let allTestsPassed = true;

  try {
    // Define base assets with their corresponding ImportWrapper contracts
    const baseAssetsWithTargets = [
      { 
        name: 'Asset1 (wUSDT)', 
        config: config.development.assets.Asset1,
        targetAddress: config.mainnet.contracts.USDTImportWrapper.SubstratedMappedAddress
      },
      { 
        name: 'Asset2 (wUSDC)', 
        config: config.development.assets.Asset2,
        targetAddress: config.mainnet.contracts.USDCImportWrapper.SubstratedMappedAddress
      },
      { 
        name: 'Asset3 (wBUSD)', 
        config: config.development.assets.Asset3,
        targetAddress: config.mainnet.contracts.BUSDImportWrapper.SubstratedMappedAddress
      }
    ];

    console.log('📋 Base Assets to transfer:');
    baseAssetsWithTargets.forEach(asset => {
      console.log(`   ${asset.name} (ID: ${asset.config.assetId}) -> ${asset.targetAddress}`);
    });
    console.log(`\n🔄 Transferring control from Account4 to ImportWrapper contracts...`);
    console.log(`   From: ${adminAccount.address}\n`);

    // 1. Set team for base assets in batch
    const setTeamSuccess = await setTeamForBaseAssets(
      api, 
      admin, 
      baseAssetsWithTargets
    );
    if (!setTeamSuccess) allTestsPassed = false;

    // 2. Verify team transition for each asset
    console.log('\n🔍 Verifying team transitions...');
    const verificationResults = [];
    
    for (const asset of baseAssetsWithTargets) {
      const result = await verifyTeamTransition(api, asset.config, asset.name, asset.targetAddress);
      verificationResults.push({ name: asset.name, result });
      if (!result) allTestsPassed = false;
    }

    // Final summary
    console.log('\n📊 Team Transition Summary');
    console.log('==========================');
    console.log('Batch Operation:');
    console.log(`  Team Setting: ${setTeamSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    
    console.log('\nIndividual Asset Verifications:');
    verificationResults.forEach(({ name, result }) => {
      console.log(`  ${name}: ${result ? '✅ PASSED' : '❌ FAILED'}`);
    });
    
    if (allTestsPassed) {
      console.log('\n🎉 All base assets team transitions completed successfully!');
      console.log('\n📋 Team Transfer Summary:');
      console.log('  Asset1 (wUSDT) -> USDTImportWrapper');
      console.log('  Asset2 (wUSDC) -> USDCImportWrapper');
      console.log('  Asset3 (wBUSD) -> BUSDImportWrapper');
      console.log('\n🚀 ImportWrapper contracts are now empowered to manage base assets!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some team transitions failed. Check the logs above for details.');
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