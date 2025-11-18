# Breakdown of getType Logic for NewChallenge Events

## The getType Function

```javascript
function getType(address, bridge) {
	const { bridge_id, export_aa, import_aa } = bridge;
	const normalizedAddress = normalizeAddress(address);
	const normalizedExportAa = normalizeAddress(export_aa);
	const normalizedImportAa = normalizeAddress(import_aa);
	
	if (normalizedExportAa && normalizedAddress === normalizedExportAa)
		return 'repatriation';
	if (normalizedImportAa && normalizedAddress === normalizedImportAa)
		return 'expatriation';
	throw Error(`unable to determine transfer type...`);
}
```

## What is `event.address`?

When `onNewChallenge` is called:
1. `event.address` = the contract address that **emitted** the NewChallenge event
2. This is set from the parser cache: `eventAddress = contractAddress` (line 1880 in evm-chain.js)
3. `contractAddress` = the top-level address in the cache file (the contract being monitored)

## Which Contract Emits NewChallenge?

Both **Export** and **Import** contracts inherit from **Counterstake**, which has the `challenge()` function that emits `NewChallenge` events.

### Export Contract (export_aa):
- Located on: **home network** (e.g., BSC for bridge 10)
- Handles: **expatriations** (sending FROM home TO foreign)
- Can emit: NewExpatriation, NewClaim, **NewChallenge**, FinishedClaim

### Import Contract (import_aa):
- Located on: **foreign network** (e.g., Obyte for bridge 10)  
- Handles: **repatriations** (receiving FROM foreign TO home)
- Can emit: NewRepatriation, NewClaim, **NewChallenge**, FinishedClaim

## The Problem with getType Logic

The `getType` function assumes:
- `event.address === export_aa` → type = `repatriation`
- `event.address === import_aa` → type = `expatriation`

**But this is BACKWARDS for challenges!**

### Why?

1. **Export contract (export_aa) handles expatriations:**
   - Claims made on Export contract are **expatriation** claims
   - Challenges on those claims come from the **Export contract**
   - But `getType` returns `repatriation` ❌

2. **Import contract (import_aa) handles repatriations:**
   - Claims made on Import contract are **repatriation** claims  
   - Challenges on those claims come from the **Import contract**
   - But `getType` returns `expatriation` ❌

## Example: Bridge 10 (home=BSC, foreign=Obyte)

- **export_aa** = `0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE` (BSC)
- **import_aa** = `2WPMBO6ALLIVEIZF5HOSOQ2BWXNHF7GW` (Obyte)

### Claim 1 exists as:
- bridge_id=10, type=**expatriation**, transfer_id=348

### If challenge comes from export_aa (BSC):
- `event.address` = `0xa5893a1A1FF15031d8AB5aC24531D3B3418612EE`
- `getBridgeByAddress` → finds bridge_id=10
- `getType(event.address, bridge)` → checks if address matches export_aa → **YES** → returns `repatriation` ❌
- `getValidOutcome({ claim_num: 1, bridge_id: 10, type: 'repatriation' })` → **NULL** (claim doesn't exist with that type!)

### If challenge comes from import_aa (Obyte):
- `event.address` = `2WPMBO6ALLIVEIZF5HOSOQ2BWXNHF7GW`
- `getBridgeByAddress` → finds bridge_id=10
- `getType(event.address, bridge)` → checks if address matches import_aa → **YES** → returns `expatriation` ✅
- `getValidOutcome({ claim_num: 1, bridge_id: 10, type: 'expatriation' })` → **'yes'** ✅

## The Root Cause

**The `getType` function logic is inverted for challenges!**

For challenges, we need the **OPPOSITE** logic:
- If `event.address === export_aa` → the challenge is on an **expatriation** claim → type should be `expatriation`
- If `event.address === import_aa` → the challenge is on a **repatriation** claim → type should be `repatriation`

But `getType` does the opposite, which is why challenges can't find claims!

