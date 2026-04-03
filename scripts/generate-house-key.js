const fs = require('fs');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const path = require('path');

const keyPath = path.join(__dirname, '../house-key.json');

if (fs.existsSync(keyPath)) {
    console.log('House key already exists. Skipping generation.');
    const secretKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    console.log('Public Key:', keypair.publicKey.toBase58());
} else {
    console.log('Generating new house key...');
    const keypair = Keypair.generate();
    const secretKey = Array.from(keypair.secretKey);
    fs.writeFileSync(keyPath, JSON.stringify(secretKey));
    console.log('Generated Public Key:', keypair.publicKey.toBase58());
    console.log('Secret key saved to house-key.json');
}
