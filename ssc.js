import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Your 64-byte secret key array
const secretArray = [216,74,52,213,190,118,230,85,55,236,247,21,45,102,203,79,206,238,17,226,173,183,215,148,163,156,240,213,44,166,33,193,185,105,99,175,99,45,213,8,104,225,148,243,9,244,176,216,101,75,204,140,196,179,208,136,226,65,136,126,151,117,6,87];

// Convert to Uint8Array
const secretKey = Uint8Array.from(secretArray);

// Create Keypair from secret key
const keypair = Keypair.fromSecretKey(secretKey);

// Get addresses
const publicKey = keypair.publicKey.toString();  // Base58 encoded address
const privateKeyBase58 = bs58.encode(secretKey); // Full secret key as base58

console.log('Public Address (Solana):', publicKey);
console.log('Private Key (base58):', privateKeyBase58);

// For backup/saving, you can also get the byte array
console.log('Secret key (Uint8Array):', secretKey);