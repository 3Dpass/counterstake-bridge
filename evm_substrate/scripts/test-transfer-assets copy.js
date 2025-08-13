const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { cryptoWaitReady } = require('@polkadot/util-crypto');
const path = require('path');
const fs = require('fs');

// Function to wait for an event
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

// Function to transfer all assets in batch
async function transferAllAssets(api, admin, assets, targetAccount) {
  console.log('4️⃣  Transferring 999,999,999,999,999 tokens of each asset from account4 to account2...');
  
  console.log('\n🔄 Creating transfer calls:');
  const transferCalls = assets.map((asset, index) => {
    const call = api.tx.poscanAssets.transfer(asset.config.assetId, targetAccount, 999999999999999);
    console.log(`  ${index + 1}. ${asset.symbol}: Asset ID ${asset.config.assetId} → ${targetAccount} (999,999,999 tokens)`);
    return call;
  });

  try {
    // For batch operations, we need to wait for the batch to complete
    // rather than waiting for a specific event from the batch
    const batchTx = api.tx.utility.batch(transferCalls);
    
    return new Promise((resolve, reject) => {
      let unsub = null;
      batchTx.signAndSend(admin, { nonce: -1 }, ({ status, events, dispatchError }) => {
        if (dispatchError) {
          console.error('❌ Batch transfer failed:', dispatchError.toString());
          reject(new Error(dispatchError.toString()));
          if (unsub) unsub();
          return;
        }
        if (status.isInBlock || status.isFinalized) {
          console.log('✅ Batch transfer completed successfully');
          resolve(true);
          if (unsub) unsub();
        }
      }).then(u => { unsub = u; }).catch(reject);
    });
  } catch (err) {
    console.error('❌ Failed to transfer assets in batch:', err);
    return false;
  }
}

// Function to check balances after transfer
async function checkBalances(api, assets, account4, account2) {
  console.log('\n📊 Checking balances after transfer...');
  
  let balanceCheckFailed = false;
  
  for (const asset of assets) {
    try {
      const account4Balance = await api.query.poscanAssets.account(asset.config.assetId, account4);
      const account2Balance = await api.query.poscanAssets.account(asset.config.assetId, account2);
      
      console.log(`${asset.symbol} (${asset.fullName}):`);
      
      // Handle Option<PalletPoscanAssetsAssetAccount> - account4
      if (account4Balance.isSome) {
        const account4Data = account4Balance.unwrap();
        console.log(`  Account4 balance: ${account4Data.balance.toHuman()}`);
        console.log(`  Account4 status: ${account4Data.status.toString()}`);
      } else {
        console.log(`  Account4 balance: 0 (no account)`);
      }
      
      // Handle Option<PalletPoscanAssetsAssetAccount> - account2
      if (account2Balance.isSome) {
        const account2Data = account2Balance.unwrap();
        console.log(`  Account2 balance: ${account2Data.balance.toHuman()}`);
        console.log(`  Account2 status: ${account2Data.status.toString()}`);
      } else {
        console.log(`  Account2 balance: 0 (no account)`);
      }
      
    } catch (err) {
      console.error(`❌ Failed to check balance for ${asset.symbol} (${asset.fullName}):`, err);
      balanceCheckFailed = true;
    }
  }
  
  if (balanceCheckFailed) {
    throw new Error('Balance check failed - transfer may not have completed successfully');
  }
}

async function main() {
  // Load config
  const configPath = path.join(__dirname, 'bridge-test-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Use account4 as admin and account2 as target
  const adminAccount = config.development.accounts.account4;
  const targetAccount = config.development.accounts.account2;

  const wsUrl = config.development.network.wsUrl;

  // Substrate setup
  await cryptoWaitReady();
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider });
  const keyring = new Keyring({ type: 'sr25519' });
  const admin = keyring.addFromMnemonic(adminAccount.seed);

  console.log('🧪 Testing poscanAssets Transfer from Account4 to Account2');
  console.log('================================================================\n');

  try {
    // Extract all assets from config dynamically using their proper symbols
    const allAssets = Object.entries(config.development.assets).map(([key, assetConfig]) => ({
      name: `${assetConfig.metadata.symbol} (${assetConfig.metadata.name})`,
      symbol: assetConfig.metadata.symbol,
      fullName: assetConfig.metadata.name,
      decimals: assetConfig.metadata.decimals,
      config: assetConfig
    }));

    console.log('📦 Transferring 999,999,999 tokens of each asset...');
    
    // Log transfer details
    console.log('\n📋 Transfer Details:');
    console.log(`  From Account: ${admin.address} (Account4)`);
    console.log(`  To Account: ${targetAccount.address} (Account2)`);
    console.log(`  Amount per asset: 999,999,999 tokens`);
    console.log('\n📦 Assets to transfer:');
    allAssets.forEach((asset, index) => {
      console.log(`  ${index + 1}. ${asset.symbol} - ${asset.fullName}`);
      console.log(`     Asset ID: ${asset.config.assetId} | Decimals: ${asset.decimals} | EVM: ${asset.config.evmContract}`);
    });
    console.log(`\n💰 Total tokens to transfer: ${(999999999 * allAssets.length).toLocaleString()} tokens`);
    
    // Transfer all assets in batch
    const transferSuccess = await transferAllAssets(api, admin, allAssets, targetAccount.address);
    
    if (transferSuccess) {
      console.log('✅ Transfer operation completed successfully');
      
      // Check balances after transfer
      await checkBalances(api, allAssets, admin.address, targetAccount.address);
      
      console.log('\n🎉 All transfers completed successfully!');
      console.log('📋 Summary:');
      console.log(`  - 999,999,999 tokens transferred for each of ${allAssets.length} assets`);
      console.log('  - From: Account4 (admin)');
      console.log('  - To: Account2');
      console.log(`  - Total: ${(999999999 * allAssets.length).toLocaleString()} tokens transferred`);
      console.log('  - Assets transferred:');
      allAssets.forEach(asset => {
        console.log(`    • ${asset.symbol} (${asset.fullName})`);
      });
      
      // Exit successfully
      process.exit(0);
    } else {
      console.log('❌ Transfer operation failed');
      process.exit(1);
    }
    
  } catch (err) {
    console.error('❌ Script failed:', err);
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