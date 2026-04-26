import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import 'dotenv/config';

async function checkHouse() {
  try {
    const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpc, "confirmed");
    
    console.log("--- HOUSE WALLET DIAGNOSTIC ---");
    console.log("RPC:", rpc);
    
    if (!process.env.HOUSE_PRIVATE_KEY) {
        console.error("ERROR: HOUSE_PRIVATE_KEY is missing from .env");
        return;
    }

    const secretKey = new Uint8Array(JSON.parse(process.env.HOUSE_PRIVATE_KEY));
    const keypair = Keypair.fromSecretKey(secretKey);
    const pubkey = keypair.publicKey.toBase58();
    
    console.log("Private Key → Public Key:", pubkey);
    console.log("Expected Public Key:", process.env.HOUSE_WALLET_ADDRESS);
    
    if (pubkey !== process.env.HOUSE_WALLET_ADDRESS) {
        console.warn("⚠️ WARNING: Mismatch between PRIVATE KEY and WALLET ADDRESS in .env!");
    } else {
        console.log("✅ Keypair match confirmed.");
    }
    
    const balance = await connection.getBalance(keypair.publicKey);
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");
    
    if (balance < 0.01 * LAMPORTS_PER_SOL) {
        console.warn("⚠️ WARNING: House wallet balance is dangerously low!");
    }

  } catch (err) {
    console.error("DIAGNOSTIC ERROR:", err.message);
  }
}

checkHouse();
