import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

async function checkHouse() {
  try {
    const envPath = "C:\\Users\\Acer\\Downloads\\VeltroCasino\\.env";
    const envContent = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envContent.split('\n').forEach(line => {
      const [key, ...val] = line.split('=');
      if (key) env[key.trim()] = val.join('=').trim();
    });

    const rpc = env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpc, "confirmed");
    
    console.log("--- HOUSE WALLET DIAGNOSTIC ---");
    console.log("RPC:", rpc);
    
    if (!env.HOUSE_PRIVATE_KEY) {
        console.error("ERROR: HOUSE_PRIVATE_KEY is missing from .env");
        return;
    }

    const secretKey = new Uint8Array(JSON.parse(env.HOUSE_PRIVATE_KEY));
    const keypair = Keypair.fromSecretKey(secretKey);
    const pubkey = keypair.publicKey.toBase58();
    
    console.log("Private Key → Public Key:", pubkey);
    console.log("Expected Public Key:", env.HOUSE_WALLET_ADDRESS);
    
    if (pubkey !== env.HOUSE_WALLET_ADDRESS) {
        console.warn("⚠️ WARNING: Mismatch between PRIVATE KEY and WALLET ADDRESS in .env!");
    } else {
        console.log("✅ Keypair match confirmed.");
    }
    
    const balance = await connection.getBalance(keypair.publicKey);
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");

  } catch (err) {
    console.error("DIAGNOSTIC ERROR:", err.message);
  }
}

checkHouse();
