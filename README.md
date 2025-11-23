# Counterstake Bridge Node (assistant + watchdog)

Run this Node to assist users with cross-chain transfers facilitated by [counterstake protocol](https://counterstake.org) and earn assistant rewards (initially, 1%) on each transfer.

The Node also serves as a "watchdog" performing the bridge main security mechanism. It monitors the ongoing transfers and if it sees a fraudulent claim or challenge, it sends a counterstake looking to win the stake posted by the fraudulent claim or challenge. The potential ROI is 66.7%. See [how the counterstake works](https://counterstake.org/how-it-works). 

Explore the [USER_FLOW.md](/docs/USER_FLOW.md) documentation to dive into the implementation details.

Currently, the Node supports transfers across the Obyte, Ethereum, BSC, and 3DPass.

SMART CONTRACTS VERSIONS SUPPORTED:
- [v1.0](/evm-v1.0/) - the very first version for EVM networks
- [v1.1](/evm/) - current EVM networks
- [v1.1-substrate](/evm_substrate/) - cross-platform (EVM-Substrate)

The are no guarantees of the correct operation of the software. There might be bugs which can lead to losing money. Use at your own risk.

## Requirements
nodejs 12+

## Install
Get the repo:
```bash
git clone https://github.com/3Dpass/counterstake-bridge
cd counterstake-bridge
git checkout v1.1-substrate
yarn
```

## Compile contracts (both Ethereum and 3DPass versions required):

1. Conventional EVM `version 1.1`: 
```bash
cd evm
npx truffle compile --all
```

2. 3Dpass cross-platform (EVM-Substrate) `version 1.1-substrate`:
```bash
cd evm_substrate
npx truffle compile --all
```

## Run
```bash
node run.js bridge 2>errlog
```

## Check bridge instances
Run the script, make sure all the bridges discovered are set on the database.
```bash
node print_bridges.js
```

## Realtime monitoring
```bash
node realtime_monitoring.js
```

## Check recent transfers
```bash
 node check_transfers.js
```

## Stop
```bash
pkill -f "node run.js"
```

## Start from bootstrap for the first catch-up
Import the db snapshot and restart.
```bash
node node import_db_for_seeding.js db_export_2025-11-23.json
```

## Setup Keys
Follow the [KEY_MANAGEMENT.md](/docs/KEY_MANAGEMENT.md) to setup the signer account. 

## Operating mode
The bot can be configured to operate in either **Solo** or **Pooled** mode:  
- **Solo mode** - the bot will use its own addresses balances
- **Pooled mode** - the bot will operate as a manager (admin) at Liquidity Pools - additional assistant contracts configured to interact with the bridges.

If the the bot's account, set up in the configuration, matches a Liquidity Pool manager's address, the bot will automatically detect it and switch to the Pooled mode to start using the pool's funds via the assistant contract ABI.

### Solo mode

Setup the your own account in the bot configuration to operate in Solo mode. The bot will use both the STAKE ASSET and TRANSFER ASSET directly from the account balance.

For example:

**USDT Ethereum <-> wUSDT 3DPass bridge**

📥 IMPORT (on 3DPass):
  -  ✅ Import: 0x00D5f00250434e76711e8127A37c6f84dBbDAA4C
  - Asset 1: wUSDT
  - 💰 STAKE ASSET 1: P3D

📤 EXPORT (on Ethereum):
  - ✅ Export: 0x3a96AC42A28D5610Aca2A79AE782988110108eDe
  - Asset 2: USDT
  - 💰 STAKE ASSET 2: USDT

Both P3D and wUSDT balance on 3DPass will be used for the `Ethereum -> 3Dpass` transfers 
USDT balance on Ethereum will be used for the `Ethereum <- 3Dpass` transfers 

The bot prints its addresses at startup:
```
====== my single address: TNM2YRTJOANV...
```
This is your Obyte address. Fund it with GBYTE and any Obyte tokens.
```
====== my Ethereum address:  0xEA6D65BAE2E0dDF...
```
This is your Ethereum address. Fund it with ETH and any ERC20 tokens.
```
====== my BSC address:  0xEA6D65BAE2E0dDF...
```
This is your BSC address. Fund it with BNB and any BEP20 tokens.
```
====== my 3DPass address:  0xEA6D65BAE2E0dDF...
```
This is your 3DPass address. Fund it with P3D and any 3DPRC20 tokens.

The larger balances you have, the more transfers you can handge in parallel.

###  Pooled mode
Setup the Pool Assistant manager's account in the bot configuration to operate as the Pool manager (admin).

For example:

📥 IMPORT (on 3DPass):
  -  ✅ Import: 0x00D5f00250434e76711e8127A37c6f84dBbDAA4C
  - Asset 1: wUSDT
  - 💰 STAKE ASSET 1: P3D

🤖 POOL IMPORT Assistant: 0x6F7c9FFa2250E7119B44e3496B6f6b37736035F8
  - Manager: 0x2Dce9B2dc9983f9b435da02a69C6F0e8A31Bf3E8
  - Shares: WUSDTA

📤 EXPORT (on Ethereum):
  - ✅ Export: 0x3a96AC42A28D5610Aca2A79AE782988110108eDe
  - Asset 2: USDT
  - Symbol: USDT
  - 💰 STAKE ASSET 2: USDT

🤖 POOL EXPORT Assistant: 0xA07a7a1514F391E1e636F2d5eB71c53ee80fC6DB
  - Manager: 0x067Fac51f31Dc80263D55f9980DF1358357DC10d
  - Shares: USDTEA

## Email notifications
If the bot complains about `admin_email` and `from_email`, specify them in ~/.config/counterstake-bridge/conf.json. In case of any issues, you'll get notifications to `admin_email`.

Add `check_daemon.js` to your crontab. See `crontab.txt` for the line to be added to your crontab. If your crontab is empty, just run
```bash
crontab crontab.txt
```
You'll receive notifications to your `admin_email` if the bot crashes.

Check that the notifications work before leaving the bot to run in production. For this, kill the bot and run
```bash
node check_daemon.js
```
You should receive an email that the bot is down.

If `sendmail` is not setup and configured on your system (usually, it isn't), add the following settings to your conf.json to send emails through an external SMTP server instead:
```json
	"smtpTransport": "relay",
	"smtpRelay": "<SMTP server such as smtp.gmail.com>",
	"smtpUser": "<your account at this mail server>",
	"smtpPassword": "<your password for SMTP authentication>"
```

## Configuration
Check `conf.js` for the available options. You can override them in your conf.json. The most important ones are:

- `infura_project_id`: your infura project ID. Sign up at infura to get it.
- `alchemy_keys`: your alchemy keys. Sign up at alchemy to get them. The format is like
```json
	"alchemy_keys": {
		"polygon": {
			"mainnet": "<your mainnet key>",
			"testnet": "<your testnet key>"
		}
	},
```
- `min_reward_ratio`: minimum net reward (net of gas fees) that your bot expects to earn for assisting a transfer. The bot will ignore the transfers that pay a lower reward. Default 0.005 (0.5%).
- `max_exposure`: max share of the bot's balance in a specific token that can be sent in a counterstake against a fraudulent claim a challenge. This limits the risk you are taking. Default 0.5 (50%).
- `evm_min_transfer_age`: minimum age (in seconds) of the transfer on an EVM-based source chain before it is deemed irreversible and safe to claim on the destination chain. The default is 300 seconds (5 minutes). You can set a lower value to make sure your bot claims a transfer before other assistant bots but this also increases the risk that the transfer will be reverted and your bot will lose money.
- `evm_count_blocks_for_finality`: if your bot sees a new claim for a transfer sent from an EVM-based chain but can't find the transfer, and its timestamp is earlier than that of the block `evm_count_blocks_for_finality` blocks ago, then the bot will think that the transfer doesn't exist and will counterstake against the claim. Otherwise, the bot will wait for a few more blocks and check again if the tranfer has appeared in the source chain. The default is 20 blocks. Set a lower value to make sure that your bot counterstakes earlier than other watchdogs but this also increases the risk that the transfer will still appear in the source chain and your bot will lose money.
- `bLight`: whether to run the bot as a light Obyte node. Default `true`. Running a full node allows the bot to see new transactions slightly faster and is also more secure as the bot doesn't need to trust any external sources. However a full node takes a lot more disk space and its initial sync takes several days.
- `socksHost` and `socksPort`: host and port for connecting to TOR proxy. By default, the bot is configured to connect to Obyte nodes through TOR. To disable TOR, set `socksHost` to `null`.
- `control_addresses`: array of device addresses of your Obyte wallets (usually GUI wallets) that are allowed to view and withdraw balances using chatbot interface.
- `payout_addresses`: associative array of your withdrawal addresses keyed by network.

### Enable/Disable Networks
Manage networks in the `conf.js`:
```bash
// Disable networks
exports.disablePolygon = true; // Disable Polygon monitoring
exports.disableKava = true; // Disable Kava monitoring
exports.disableBSC = true; // Disable BSC monitoring
exports.disableThreeDPass = false; // Enable 3DPass monitoring
exports.disableObyte = false; // Enable Obyte monitoring
```

### Explorer API keys
Add your explorer keys into the `~/.config/counterstake/conf.json` to override `conf.js` for safety

```json
{
  "admin_email": "admin@example.com", 
  "from_email": "noreply@example.com",
  "etherscan_api_key": "YOUR_ETHERSCAN_API_KEY_HERE",
  "bsc_api_key": "YOUR_BSCSCAN_API_KEY_HERE", 
  "polygon_api_key": "YOUR_POLYGONSCAN_API_KEY_HERE",
  "infura_project_id": "YOUR_IFURA_KEY_HERE",
  "moralis_key": "YOUR_MORALIS_KEY_HERE"
},
```

## Managing the bot and withdrawing funds over the Obyte chatbot
When the bot starts, it prints its pairing code, like this:
```
====== my pairing code: AzA8qzvoMEnf7vVyo4YCw7u/hIiDOb8APpTmIPttP/29@obyte.org/bb-test#0000
```
Use this code to pair your GUI wallet with the bot and manage it through chat interface.

Set `control_addresses` in your conf.json to let the bot know who is allowed to manage it (by default, nobody is allowed). Set your `payout_addresses` addresses to enable withdrawals to your Obyte, Ethereum, and other addresses (by default, withdrawals are disabled), like this:
```
        "payout_addresses": {
                "Obyte": "EJC4A7WQGHEZEKW6RLO7F26SAR4LAQBU",
                "Ethereum": "0xbd2C1400eA794D837669d3A83Ef8B3534579b5BF",
                "BSC": "0xbd2C1400eA794D837669d3A83Ef8B3534579b5BF",
                "3DPass": "0xbd2C1400eA794D837669d3A83Ef8B3534579b5BF"
        },
```

Type `help` in chat to see the available commands. In particular, you can use `balances` command to view the bot's balances in all currencies, `deposit` to add funds, `withdraw` to withdraw funds from the bot's balance to your payout addresses.

## Adding new bridges
**v1.1**
See `setup_bridges.js` and edit `setupAdditionalBridge()` as appropriate. 

**v1.1-substrate**
Follow the documentation to setup new bridge instances and pooled assistants:
- [Create new Import instatnce](/evm_substrate/docs/CREATE_NEW_IMPORT_BRIDGE_GUIDE.md)
- [Create neww Export instance](/evm_substrate/docs/CREATE_NEW_EXPORT_BRIDGE_GUIDE.md)
- [Create new pooled assistant](/evm_substrate/docs/CREATE_NEW_ASSISTANT_GUIDE.md)

**Note!** Every independent bridge mush have an Oracle deployed to maintain "Transfer Token vs Stake token" prices.

## Oracle 
Oracles are independent contracts operating on whatever chain the bridge is deployed to help providing actual price feeds necessary for either Import or Export contract stake calcualtions. [Oracle documentation](/docs/ORACLE_FLOW.md).

Follow this [guide](/docs/ORACLE_PRICE_UPDATER.md) as a referrence for seting up and using 3DPass Oracle Price Updater to automatically maintain accurate price feeds for the Counterstake bridge system.

## Adding new chains
To add a new EVM-based chain, see the source code of `ethereum.js` and `bsc.js`, add a similar class, and use it in `transfers.js`. Edit and run `emv/deploy-contracts.js` to deploy the contracts.

To add a new Obyte-based chain, see `obyte.js` and define a descendant class, then use it in `transfers.js`. Edit and run `deploy-aas.js` to deploy the autonomous agents.

To add a chain that is neither EVM-based nor Obyte-based, develop its programmable agents (such as autonomous agents on Obyte, smart contracts on Ethereum, chaincode on Hyperledger Fabric) that implement the Counterstake protocol, write a class similar to `obyte.js` and `evm-chain.js`, use it in `transfers.js`, and deploy the agents.

In all cases, you are welcome to submit PRs to add your work to this repo.

## Running automated tests on autonomous agents
```bash
yarn test aas/test
```

## Running automated tests on smart contracts
Install and run Ganache. If using a command-line version of Ganache (ganache-cli), run it on port 7545 (the default is 8545). Then run
```bash
cd evm
npx truffle test
```
## Reading data directly from deployed contracts

Read bridges and assistants from 3dpass bridge registry:
```bash
cd evm_substrate 
node read-3dpass-bridges-registry.js
```
Read Immport Wrapper bridge data from 3dpass:
```bash
cd evm_substrate/scripts
node read-import-wrapper-bridge-settings-3dpass.js
```
Read Export instance data from Ethereum:
```bash
cd evm_substrate/scripts
node read-export-bridge-settings-ethereum.js
```
Read Import Wrapper pooled assistant data from 3dpass:
```bash
cd evm_substrate/scripts
node read-import-wrapper-assistant-3dpass.js
```
Read Export pooled Assistant data from Ethereum
```bash
cd evm_substrate/scripts
node read-export-assistant-ethereum.js
```



