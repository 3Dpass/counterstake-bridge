# Processing Summary - After Restart

## Database State

- **Bridges**: 21
- **Transfers**: 821 (all confirmed, 0 unconfirmed)
- **Claims**: 26 (25 matched, 1 unmatched)
- **Challenges**: 0 (not being stored)
- **Transfers without claims**: 796 (normal - not all transfers get claimed)

## Transfer Processing

### Status: ✅ Working
- NewExpatriation and NewRepatriation events are being detected
- Transfers are being stored in the database
- Recent transfers are being processed correctly
- All transfers are confirmed

### Recent Activity:
- Processing transfers from BSC and Ethereum
- Using BSCScan parser for some events
- Transfers are being added to database successfully

## Claim Processing

### Status: ⚠️ Partially Working
- NewClaim events are being detected and processed
- 25 out of 26 claims are matched with transfers
- 1 unmatched claim (claim 5) - but it actually HAS a matching transfer!

### Issues Found:
1. **Many claims can't find transfers during catch-up:**
   - Logs show: "the claimed transfer X not found while catching up (retry N/10)"
   - This happens when claims are processed before their corresponding transfers
   - System retries every 60 seconds

2. **Unmatched Claim Analysis:**
   - Claim 5 (bridge 10, expatriation) has a matching transfer (transfer 179)
   - Same txid, txts, addresses all match
   - Should be linked but isn't - likely needs reprocessing

### Recent Activity:
- Claims are being processed from Ethereum and BSC
- Some claims are being retried (retrying handling of claim X)
- Claims are stored but many can't find transfers initially

## Challenge Processing

### Status: ❌ Not Working
- **0 challenges stored in database**
- NewChallenge events ARE being detected in logs
- Challenges are being processed but failing

### Issues Found:
1. **Challenges can't find claims:**
   - Logs show: "claim X challenged in [txid] is not known yet, will retry"
   - Examples:
     - Claim 1: "claim 1 challenged in 0x1a592dc9aa04224b9cafdd5547a294b6d1f8f7164c0ff839b2a953b2b190a9cf is not known yet, will retry"
     - Claim 13: "claim 13 challenged in 0x934652feea0ef304c05a765d5ace41538eae822dc12d1d016c3c974e0ab93796 is not known yet, will retry"
   - System retries but challenges are never stored

2. **Root Cause:**
   - Challenges are processed but can't find the corresponding claim in database
   - Even though claims exist (we have 26 claims in DB)
   - The query in `handleChallenge` is not finding them

### Recent Activity:
- NewChallenge events detected for:
  - Claim 1 (BSC)
  - Claim 13 (BSC)
- Challenges are being handled but failing to find claims
- System retries but never succeeds

## Processing Order During Catch-Up

### Current Behavior:
1. **Transfers are processed first** (NewExpatriation/NewRepatriation)
2. **Claims are processed second** (NewClaim)
3. **Challenges are processed third** (NewChallenge)

### Problem:
- Even though transfers are processed first, many claims still can't find their transfers
- This suggests the transfers might be on a different bridge or the matching logic has issues
- Challenges are processed after claims, but they still can't find claims

## Key Findings

1. **Transfer-Claim Matching:**
   - The fix for address normalization appears to be working (test showed all unmatched claims can find transfers)
   - But during catch-up, many claims still can't find transfers
   - This might be because transfers are on different bridges or timing issues

2. **Challenge-Claim Matching:**
   - Challenges are being detected and processed
   - But they can't find claims in the database
   - This is the main blocker preventing challenges from being stored
   - Need to investigate why `handleChallenge` can't find claims that exist

3. **Catch-Up Mode:**
   - System is actively catching up
   - Many retries happening for both claims and challenges
   - Retries happen every 60 seconds

## Recommendations

1. **Investigate why challenges can't find claims:**
   - Check the query in `handleChallenge` function
   - Verify the claim_num, bridge_id, and type matching logic
   - Check if there's a timing issue or query mismatch

2. **Verify transfer-claim matching during catch-up:**
   - Check if transfers and claims are on the same bridge
   - Verify the matching criteria (txid, txts, addresses, type)
   - Check if there are address normalization issues during catch-up

3. **Monitor retry behavior:**
   - Check if retries eventually succeed
   - Monitor if claims eventually find their transfers
   - Monitor if challenges eventually find their claims

