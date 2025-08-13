#!/usr/bin/env node

/**
 * Utility script to update contract addresses in the frontend after deployment
 * Usage: node update-contract-addresses.js <deployment-output.json>
 */

const fs = require('fs');
const path = require('path');

function updateContractAddresses(deploymentData) {
  const networksPath = path.join(__dirname, 'src', 'config', 'networks.js');
  
  if (!fs.existsSync(networksPath)) {
    console.error('❌ networks.js not found at:', networksPath);
    return false;
  }

  let content = fs.readFileSync(networksPath, 'utf8');

  // Update 3DPass contract addresses
  const updates = {
    '0x943e8fcbA7C432D0C1adf61dC43C33273111e168': deploymentData.counterstakeFactory || '0x943e8fcbA7C432D0C1adf61dC43C33273111e168',
    '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0': deploymentData.assistantFactory || '0xBDe856499b710dc8E428a6B616A4260AAFa60dd0',
    '0xAc647d0caB27e912C844F27716154f54EDD519cE': deploymentData.oracle || '0xAc647d0caB27e912C844F27716154f54EDD519cE',
  };

  let updated = false;
  for (const [oldAddress, newAddress] of Object.entries(updates)) {
    if (oldAddress !== newAddress) {
      const regex = new RegExp(oldAddress, 'g');
      const matches = content.match(regex);
      if (matches) {
        content = content.replace(regex, newAddress);
        console.log(`✅ Updated ${matches.length} occurrence(s) of ${oldAddress} to ${newAddress}`);
        updated = true;
      }
    }
  }

  if (updated) {
    fs.writeFileSync(networksPath, content, 'utf8');
    console.log('✅ Successfully updated networks.js with new contract addresses');
    return true;
  } else {
    console.log('ℹ️  No contract addresses to update');
    return true;
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node update-contract-addresses.js <deployment-output.json>');
    console.log('');
    console.log('Example deployment output format:');
    console.log('{');
    console.log('  "counterstakeFactory": "0x...",');
    console.log('  "assistantFactory": "0x...",');
    console.log('  "oracle": "0x..."');
    console.log('}');
    process.exit(1);
  }

  const deploymentFile = args[0];
  
  if (!fs.existsSync(deploymentFile)) {
    console.error('❌ Deployment file not found:', deploymentFile);
    process.exit(1);
  }

  try {
    const deploymentData = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const success = updateContractAddresses(deploymentData);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Error updating contract addresses:', error.message);
    process.exit(1);
  }
}

module.exports = { updateContractAddresses }; 