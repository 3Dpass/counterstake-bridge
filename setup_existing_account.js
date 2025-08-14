#!/usr/bin/env node

const fs = require('fs');
const { ethers } = require('ethers');
const desktopApp = require('ocore/desktop_app.js');
const crypto = require('crypto');

function generateTempPrivateKey() {
    // Generate a random 32-byte private key and encode as base64
    return crypto.randomBytes(32).toString('base64');
}

function setupExistingAccount(mnemonicPhrase) {
    const keysPath = desktopApp.getAppDataDir() + '/keys.json';
    
    // Validate mnemonic
    try {
        const wallet = ethers.Wallet.fromMnemonic(mnemonicPhrase);
        console.log('✅ Valid mnemonic phrase');
        console.log('Generated EVM address:', wallet.address);
        console.log('Private key:', wallet.privateKey);
    } catch (error) {
        console.error('❌ Invalid mnemonic phrase:', error.message);
        return false;
    }
    
    // Create new keys.json structure
    const newKeys = {
        mnemonic_phrase: mnemonicPhrase,
        temp_priv_key: generateTempPrivateKey(),
        prev_temp_priv_key: generateTempPrivateKey()
    };
    
    // Backup existing keys.json if it exists
    if (fs.existsSync(keysPath)) {
        const backupPath = keysPath + '.backup.' + Date.now();
        fs.copyFileSync(keysPath, backupPath);
        console.log('📁 Backed up existing keys.json to:', backupPath);
    }
    
    // Write new keys.json
    fs.writeFileSync(keysPath, JSON.stringify(newKeys, null, 2));
    console.log('✅ Created new keys.json with your existing mnemonic');
    console.log('📍 Location:', keysPath);
    
    return true;
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node setup_existing_account.js "your twelve word mnemonic phrase here"');
        console.log('');
        console.log('Example:');
        console.log('node setup_existing_account.js "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"');
        process.exit(1);
    }
    
    const mnemonic = args.join(' ');
    
    if (setupExistingAccount(mnemonic)) {
        console.log('');
        console.log('🎉 Account setup complete!');
        console.log('Next steps:');
        console.log('1. Fund your addresses with tokens for bridging');
        console.log('2. Test the bot with: node run.js');
        console.log('3. Monitor your addresses for activity');
    } else {
        process.exit(1);
    }
}

module.exports = { setupExistingAccount };
