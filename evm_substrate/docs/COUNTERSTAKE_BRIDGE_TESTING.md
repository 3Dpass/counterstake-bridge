# Fast Blocks Testing Mode

## Deployment 

The script will get the node running, create assets, fund the accounts and deploy master contracts

```bash
./scripts/run-all-tests.sh --fast-blocks --no-rebuild --suite connectivity,funding,test-assets-erc20,test-transfer-assets,test-poscanAssets-set-team,test-poscanAssets-transfer-ownership,test-erc20-precompile,deploy-and-configure-counterstake
```

## Setting up new bridges

Import bridges: 

wUSDT 3dpass <-> USDT ethereum
wUSDC 3dpass <-> USDC ethereum 
wBUSD 3dpass <-> BUSD ethereum

Export bridges: 
P3D 3dpass  <-> wP3D ethereum 
FIRE 3dpass <-> wFIRE ethereum
WATER 3dpass <-> wWATER ethereum

```bash
node scripts/bridge-setup-and-test.js

```
Deploy and setup the bridges in one command: 

```bash
./scripts/run-all-tests.sh --fast-blocks --no-rebuild --suite connectivity,funding,test-assets-erc20,test-transfer-assets,test-poscanAssets-set-team,test-poscanAssets-transfer-ownership,test-erc20-precompile,deploy-and-configure-counterstake,bridge-setup-and-test
```

## Testing the bridges

### Import bridges tests

Claim  wUSDT <- USDT, challenge, withdraw wUSDT:

```bash
 node scripts/bridge-import-test.js
 ```
 Transfer token back to home chain wUSDT -> USDT
```bash
 node scripts/test-transfer-back-to-home-network.js
 ```

### Export bridges comprehensive test

Transfer to foregn chain P3D -> wP3D, Claim back  P3D <- wP3D, challenge, withdraw P3D:

```bash
node scripts/bridge-export-test.js
```

## Testing Pooled Assistants

Import assistatnt test (via the ImportWrapperAssistant.sol)

```bash
node scripts/bridge-import-assistants-test.js
```

Import assistatnt test
```bash
node scripts/bridge-export-assistants-test.js
```

### Buy assistant share tokens (investment into the pool)

```bash
node scripts/test-buy-shares-assistant.js
```
Redeem assistant share tokens
```bash
node scripts/test-redeem-shares-assistant.js
```

### SWAP:

wTokens / share tokens

```bash
node scripts/test-swap-image2stake-assistant.js
```
share tokens / wTokens

```bash
node scripts/test-swap-stake2image-assistant.js
```

## Helpers: 

 Detects available claims and attempts to withdraw: 

```bash
node scripts/test-withdraw-only.js
```
Shows last 20 calims and its details:

```bash
node scripts/check-claim-details.js
```


