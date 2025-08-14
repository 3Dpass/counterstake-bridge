# Claim Statuses in Counterstake Bridge Flow

This document describes all the statuses that a claim can have throughout its lifecycle in the counterstake bridge system.

## 📋 Overview

Claims in the counterstake system go through various statuses as they progress from creation to completion. Understanding these statuses is crucial for monitoring, debugging, and managing the bridge operations.

## 🏷️ Claim Status Definitions

### 1. **Active** 
**Definition**: The claim is currently in its challenging period and can be challenged.

**Characteristics**:
- Challenging period is ongoing (`block.timestamp < expiry_ts`)
- New challenges can be submitted
- Outcome can still change
- No withdrawals possible yet

**Technical Indicators**:
```solidity
// Smart Contract
c.finished = false
c.expiry_ts > block.timestamp

// Database
is_finished = 0
```

**Frontend Display**:
```javascript
// From ClaimList.js
case 'active':
    return <Clock className="w-5 h-5 text-warning-500" />;
    return 'Active';
```

### 2. **Expired**
**Definition**: The challenging period has ended, but the claim hasn't been processed yet.

**Characteristics**:
- Challenging period has ended (`block.timestamp > expiry_ts`)
- No more challenges can be submitted
- Outcome is final
- Withdrawals are now possible
- Claim processing is pending

**Technical Indicators**:
```solidity
// Smart Contract
c.finished = false
c.expiry_ts < block.timestamp

// Database
is_finished = 0
```

**Frontend Display**:
```javascript
case 'expired':
    return <ArrowDown className="w-5 h-5 text-warning-500" />;
    return 'Expired';
```

### 3. **Finished**
**Definition**: The claim has been fully processed and the counterstake mechanism has completed.

**Characteristics**:
- Claim processing is complete
- Stakes have been distributed
- No further actions needed
- Final state of the claim

**Technical Indicators**:
```solidity
// Smart Contract
c.finished = true

// Database
is_finished = 1
```

**Frontend Display**:
```javascript
case 'finished':
    return <CheckCircle className="w-5 h-5 text-success-500" />;
    return 'Finished';
```

### 4. **Withdrawn**
**Definition**: The winning claimant has withdrawn their funds from the claim.

**Characteristics**:
- Winning claimant has received their funds
- Claim is finished
- No more withdrawals possible for the claimant

**Technical Indicators**:
```solidity
// Smart Contract
c.withdrawn = true
c.finished = true

// Database
is_finished = 1
```

**Frontend Display**:
```javascript
case 'withdrawn':
    return <CheckCircle className="w-5 h-5 text-success-500" />;
    return 'Withdrawn';
```

## 🔄 Status Transitions

### **Claim Lifecycle Flow**

```
1. Claim Created
   ↓
2. Active (Challenging Period)
   ↓
3. Expired (Period Ended)
   ↓
4. Finished (Processing Complete)
   ↓
5. Withdrawn (Funds Claimed)
```

### **Detailed Transition Rules**

#### **Active → Expired**
- **Trigger**: `block.timestamp > expiry_ts`
- **Conditions**: Challenging period ends
- **Actions**: No more challenges allowed

#### **Expired → Finished**
- **Trigger**: First withdrawal call or manual cleanup
- **Conditions**: Claim processing begins
- **Actions**: Set `c.finished = true`, emit `FinishedClaim` event

#### **Finished → Withdrawn**
- **Trigger**: Winning claimant withdraws
- **Conditions**: `is_winning_claimant = true` AND `current_outcome = Side.yes`
- **Actions**: Set `c.withdrawn = true`, transfer funds

## 🏗️ Technical Implementation

### **Smart Contract Status Flags**

```solidity
struct Claim {
    // ... other fields
    bool withdrawn;    // Has the winning claimant withdrawn?
    bool finished;     // Is the claim processing complete?
    uint32 expiry_ts;  // When does the challenging period end?
    Side current_outcome; // Current winning outcome
}
```

### **Database Status Tracking**

```sql
CREATE TABLE IF NOT EXISTS claims (
    -- ... other fields
    is_finished TINYINT NOT NULL DEFAULT 0,  -- 0 = unfinished, 1 = finished
    -- ... other fields
);
```

### **Status Checking Logic**

```javascript
// From ClaimList.js
const getClaimStatus = (claim) => {
    if (!currentBlock) return 'unknown';
    
    const now = currentBlock.timestamp;
    const expiryTime = claim.expiryTs ? 
        (typeof claim.expiryTs.toNumber === 'function' ? claim.expiryTs.toNumber() : claim.expiryTs) : 
        0;
    
    if (claim.finished) {
        return claim.withdrawn ? 'withdrawn' : 'finished';
    }
    
    if (now > expiryTime) {
        return 'expired';
    }
    
    return 'active';
};
```

## 🎯 Withdrawal Conditions by Status

### **Active Status**
- ❌ **Cannot withdraw** - Challenging period still ongoing
- ❌ **Cannot challenge** - Only if you're staking on current outcome

### **Expired Status**
- ✅ **Can withdraw** - If you have stakes on winning outcome
- ✅ **Can withdraw** - If you're the winning claimant
- ❌ **Cannot challenge** - Challenging period has ended

### **Finished Status**
- ✅ **Can withdraw** - If you have stakes on winning outcome
- ✅ **Can withdraw** - If you're the winning claimant (and not already withdrawn)
- ❌ **Cannot challenge** - Claim processing is complete

### **Withdrawn Status**
- ❌ **Cannot withdraw** - Already withdrawn
- ❌ **Cannot challenge** - Claim is complete

## 🔍 Watchdog Monitoring

### **Unfinished Claims Check**

```javascript
// From transfers.js
async function checkUnfinishedClaims() {
    const rows = await db.query(`
        SELECT ... FROM claims CROSS JOIN bridges USING(bridge_id) 
        WHERE is_finished=0 AND my_stake!='0' 
        AND claims.creation_date < ${db.addTime('-3 DAY')}
    `);
    
    for (let claim of rows) {
        if (claim.expiry_ts < Date.now() / 1000 - 60) {
            // Claim has expired, process withdrawal
            if (hasStakesToWithdraw) {
                await sendWithdrawalRequest(network, bridge_aa, claim_info, assistant_aa);
            } else {
                await finishClaim(claim_info);
            }
        } else {
            // Claim is still active
            console.log('challenging period is still ongoing');
        }
    }
}
```

### **Status Update Functions**

```javascript
// Mark claim as finished in database
async function finishClaim({ claim_num, bridge_id, type }) {
    await db.query(
        "UPDATE claims SET is_finished=1 WHERE claim_num=? AND bridge_id=? AND type=?", 
        [claim_num, bridge_id, type]
    );
}

// Handle withdrawal completion
async function handleWithdrawal(bridge, type, claim_num, withdrawal_txid) {
    // Process withdrawal and update status
    if (claim.current_outcome === valid_outcome) {
        await finishClaim(claim_info);
    }
}
```

## 📊 Status Summary Table

| Status | Challenging Period | Can Challenge | Can Withdraw | Finished Flag | Database Flag |
|--------|-------------------|---------------|--------------|---------------|---------------|
| **Active** | ✅ Ongoing | ✅ Yes | ❌ No | `false` | `0` |
| **Expired** | ❌ Ended | ❌ No | ✅ Yes | `false` | `0` |
| **Finished** | ❌ Ended | ❌ No | ✅ Yes | `true` | `1` |
| **Withdrawn** | ❌ Ended | ❌ No | ❌ No* | `true` | `1` |

*Cannot withdraw again if already withdrawn

## 🚨 Error States

### **Invalid Status Combinations**

```javascript
// These combinations should never occur:
if (claim.finished && claim.expiry_ts > block.timestamp) {
    // ERROR: Finished claim with ongoing challenging period
}

if (claim.withdrawn && !claim.finished) {
    // ERROR: Withdrawn claim that isn't finished
}

if (claim.withdrawn && claim.current_outcome !== 'yes') {
    // ERROR: Withdrawn claim with non-winning outcome
}
```

### **Status Recovery**

If invalid status combinations are detected:

1. **Log the error** for debugging
2. **Notify administrators** via email/chat
3. **Attempt status correction** based on current blockchain state
4. **Manual intervention** may be required for complex cases

## 🔧 Configuration

### **Challenging Periods**

```javascript
// From conf.js
exports.challenging_periods = [12 * 3600, 3 * 24 * 3600, 7 * 24 * 3600, 30 * 24 * 3600];
// [12 hours, 3 days, 1 week, 30 days]

exports.large_challenging_periods = [3 * 24 * 3600, 7 * 24 * 3600, 30 * 24 * 3600];
// [3 days, 1 week, 30 days]
```

### **Status Monitoring Intervals**

```javascript
// Check unfinished claims every 15 minutes
setInterval(checkUnfinishedClaims, 15 * 60 * 1000);

// Recheck old transfers every 15 minutes
setInterval(recheckOldTransfers, 15 * 60 * 1000);
```

## 📝 Best Practices

### **Status Monitoring**
1. **Regular checks** of unfinished claims
2. **Log all status transitions** for debugging
3. **Alert on stuck claims** that don't progress
4. **Monitor for invalid status combinations**

### **Error Handling**
1. **Graceful degradation** when status checks fail
2. **Retry mechanisms** for failed operations
3. **Manual override capabilities** for edge cases
4. **Comprehensive logging** of all status changes

### **Performance Considerations**
1. **Index database** on `is_finished` and `creation_date`
2. **Batch process** status updates when possible
3. **Cache status** information to reduce database queries
4. **Limit query scope** to recent claims for performance

---

This document provides a comprehensive overview of all claim statuses in the counterstake bridge system. Understanding these statuses is essential for proper monitoring, debugging, and maintenance of the bridge operations.
