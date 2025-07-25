# Counterstake Bridge Web Server

The `webserver.js` file provides a **REST API server** for the counterstake bridge system, built using the Koa.js framework. It serves as a public interface for querying bridge status, transfer information, and assistant data.

## Overview

The webserver provides HTTP endpoints that allow external applications, websites, or users to:
- Query bridge information and status
- Check transfer status by transaction ID
- View all transfers for a specific address
- Monitor assistant pool information
- Subscribe to email updates

## Configuration

The webserver is controlled by the `webPort` configuration in `conf.js`:

```javascript
exports.webPort = process.env.testnet ? 7001 : 7000;
```

- **Mainnet**: Port 7000
- **Testnet**: Port 7001
- **Disabled**: Set to `null` to disable the web server

## API Endpoints

### 1. GET `/bridges` - Get Bridge Information

Returns comprehensive information about all active bridges.

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "bridge_id": "1",
      "home_network": "Ethereum",
      "foreign_network": "BSC",
      "home_asset": "0x0000000000000000000000000000000000000000",
      "foreign_asset": "0x0000000000000000000000000000000000000000",
      "home_symbol": "ETH",
      "foreign_symbol": "BNB",
      "min_expatriation_reward": 0.001,
      "min_repatriation_reward": 0.001,
      "count_expatriation_claimants": 5,
      "count_repatriation_claimants": 3,
      "max_expatriation_amount": 10.5,
      "max_repatriation_amount": 8.2
    }
  ]
}
```

**Features**:
- Minimum reward requirements for both directions
- Number of active claimants per bridge
- Maximum transfer amounts
- Real-time gas prices
- Network status information

### 2. GET `/pooled_assistants` - Get Assistant Pool Information

Returns information about assistant contracts and their pools.

**Query Parameters**:
- `reqBridgesInfo` (boolean): Include bridge information in response
- `reqUsdRates` (boolean): Include USD exchange rates

**Response**:
```json
{
  "status": "success",
  "data": {
    "assistants": [
      {
        "assistant_aa": "0x123...",
        "bridge_id": "1",
        "network": "Ethereum",
        "side": "export",
        "manager": "0x456...",
        "shares_asset": "0x789...",
        "shares_symbol": "EA-ETH",
        "first_claim_date": "2024-01-15T10:30:00Z",
        "stake_token_usd_rate": 1800.50,
        "home_token_usd_rate": 2500.00
      }
    ],
    "bridges_info": [
      // Bridge information if reqBridgesInfo=true
    ]
  }
}
```

**Features**:
- Assistant contract addresses and managers
- Pool shares information
- First claim dates
- USD exchange rates (optional)
- Bridge associations

### 3. GET `/transfer/:txid` - Get Transfer Status

Returns detailed information about a specific transfer.

**Parameters**:
- `txid`: Transaction ID (can be in URL path or query parameter)

**Response**:
```json
{
  "status": "success",
  "data": {
    "transfer_id": "123",
    "bridge_id": "1",
    "type": "expatriation",
    "amount": "1000000000000000000",
    "reward": "10000000000000000",
    "sender_address": "0xabc...",
    "dest_address": "0xdef...",
    "txid": "0x123...",
    "txts": 1642234567,
    "status": "claim_confirmed",
    "claim_txid": "0x456...",
    "claim_num": "5",
    "claimant_address": "0x789...",
    "is_finished": true
  }
}
```

**Status Values**:
- `sent`: Transfer sent but not yet confirmed
- `confirmed`: Transfer confirmed on source chain
- `mined`: Transfer mined (EVM chains)
- `claimed`: Transfer claimed but not yet confirmed
- `claim_confirmed`: Claim confirmed and stable
- `finished`: Transfer completed successfully

### 4. GET `/transfers/:address` - Get User Transfers

Returns all transfers associated with a specific address.

**Parameters**:
- `address`: User address (can be in URL path or query parameter)
- `all` (query parameter): Include finished transfers (default: only unfinished)

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "transfer_id": "123",
      "bridge_id": "1",
      "type": "expatriation",
      "amount": "1000000000000000000",
      "reward": "10000000000000000",
      "sender_address": "0xabc...",
      "dest_address": "0xdef...",
      "txid": "0x123...",
      "txts": 1642234567,
      "status": "claim_confirmed",
      "claim_txid": "0x456...",
      "claim_num": "5",
      "claimant_address": "0x789...",
      "is_finished": true
    }
  ]
}
```

### 5. POST `/subscribe` - Email Subscription

Allows users to subscribe to email updates about the bridge system.

**Requirements**:
- `mailerlite_api_key` must be configured in `conf.js`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Successfully subscribed"
}
```

## Features

### CORS Support
```javascript
app.use(cors());
```
The server supports Cross-Origin Resource Sharing (CORS), allowing web applications to make requests from different domains.

### Error Handling
```javascript
function setError(ctx, error) {
    ctx.body = {
        status: 'error',
        error: error.toString(),
    };
}
```
All endpoints return standardized error responses with consistent format.

### Real-time Data
The server provides real-time information by:
- Querying the database for current transfer status
- Fetching live gas prices from networks
- Calculating current maximum transfer amounts
- Getting active claimant counts
- Updating exchange rates

## Usage Examples

### Command Line (curl)

```bash
# Get all bridges
curl http://localhost:7000/bridges

# Get transfer status
curl http://localhost:7000/transfer/0x1234567890abcdef...

# Get user transfers (only unfinished)
curl http://localhost:7000/transfers/0xabcdef1234567890...

# Get user transfers (including finished)
curl "http://localhost:7000/transfers/0xabcdef1234567890?all=true"

# Get assistant pools with USD rates
curl "http://localhost:7000/pooled_assistants?reqUsdRates=true"

# Get assistant pools with bridge info
curl "http://localhost:7000/pooled_assistants?reqBridgesInfo=true"

# Subscribe to email updates
curl -X POST http://localhost:7000/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### JavaScript/Fetch

```javascript
// Get bridge information
const bridges = await fetch('http://localhost:7000/bridges')
  .then(response => response.json())
  .then(data => data.data);

// Check transfer status
const transfer = await fetch(`http://localhost:7000/transfer/${txid}`)
  .then(response => response.json())
  .then(data => data.data);

// Get user transfers
const transfers = await fetch(`http://localhost:7000/transfers/${address}`)
  .then(response => response.json())
  .then(data => data.data);

// Subscribe to updates
await fetch('http://localhost:7000/subscribe', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'user@example.com' })
});
```

### Python/Requests

```python
import requests

# Get bridges
response = requests.get('http://localhost:7000/bridges')
bridges = response.json()['data']

# Check transfer
response = requests.get(f'http://localhost:7000/transfer/{txid}')
transfer = response.json()['data']

# Get user transfers
response = requests.get(f'http://localhost:7000/transfers/{address}')
transfers = response.json()['data']

# Subscribe
response = requests.post('http://localhost:7000/subscribe', 
                        json={'email': 'user@example.com'})
```

## Use Cases

### 1. Bridge Status Dashboard
Websites can display current bridge status, including:
- Available bridges and networks
- Current gas prices
- Maximum transfer amounts
- Active claimant counts

### 2. Transfer Tracking
Users can check their transfer status:
- Real-time transfer status
- Claim information
- Completion status

### 3. Analytics and Monitoring
Monitor bridge usage and performance:
- Transfer volumes
- Assistant pool statistics
- Network performance metrics

### 4. Integration
Other applications can integrate with the bridge:
- DEX aggregators
- Wallet applications
- DeFi protocols

### 5. User Interface
Frontend applications can consume this API to provide:
- Transfer initiation interfaces
- Status tracking dashboards
- Bridge comparison tools

## Error Responses

All endpoints return consistent error responses:

```json
{
  "status": "error",
  "error": "Error message description"
}
```

Common error scenarios:
- Transfer not found
- Invalid address format
- Database connection issues
- Network API failures

## Security Considerations

- **CORS**: Configured to allow cross-origin requests
- **Input Validation**: All inputs are validated and sanitized
- **Rate Limiting**: Consider implementing rate limiting for production use
- **Authentication**: No authentication required (public API)
- **HTTPS**: Use HTTPS in production environments

The webserver provides a comprehensive public API that makes the counterstake bridge system accessible to external applications and users, enabling transparency and easy integration with other services. 