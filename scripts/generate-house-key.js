import fs from 'fs';
import { Keypair } from '@solana/web3.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(__dirname, '../house-key.json');

if (fs.existsSync(keyPath)) {
    console.log('House key already exists. Clearing to generate fresh ones...');
    fs.unlinkSync(keyPath);
}

console.log('Generating new house key...');
const keypair = Keypair.generate();
const secretKey = Array.from(keypair.secretKey);

// Write as a plain array of numbers to make it easy for env var usage too
fs.writeFileSync(keyPath, JSON.stringify(secretKey));

console.log('--- GENERATION SUCCESS ---');
console.log('NEW PUBLIC KEY:', keypair.publicKey.toBase58());
console.log('SECRET KEY (for Render env var):', JSON.stringify(secretKey));
console.log('--------------------------');
