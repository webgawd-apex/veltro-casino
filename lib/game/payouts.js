import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getPlayers } from './players.js';
import * as accountsModule from '../accounts.js';

// Load the House Wallet Keypair
let houseKeypair;

try {
  if (process.env.HOUSE_PRIVATE_KEY) {
    console.log("[PAYOUT] Loading house key from environment variable...");
    const secretKeyArray = JSON.parse(process.env.HOUSE_PRIVATE_KEY);
    houseKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
  } else {
    const keyPath = resolve(process.cwd(), 'house-key.json');
    const rawKey = JSON.parse(readFileSync(keyPath, 'utf8'));
    houseKeypair = Keypair.fromSecretKey(new Uint8Array(rawKey.secretKey));
    console.log("[PAYOUT] Loading house key from local house-key.json");
  }
} catch (err) {
  console.error("[FATAL] Could not load House Key. Payouts will fail!", err.message);
}

const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://solana-mainnet.core.chainstack.com/50d9fbef13c14089c59929338f006803", "confirmed");

// Used only for explicit withdrawals (player → wallet)
export const executePayout = async (player, multiplier) => {
  try {
    if (!houseKeypair) {
      throw new Error("House keypair not loaded. Check your environment variables or house-key.json");
    }

    const lamports = Math.floor(player.amount * multiplier * LAMPORTS_PER_SOL);
    const toPublicKey = new PublicKey(player.wallet);

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = houseKeypair.publicKey;
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: houseKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: lamports,
      })
    );
    
    const signature = await connection.sendTransaction(transaction, [houseKeypair]);
    console.log(`[PAYOUT] Withdrew ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL to ${player.wallet}. Sig: ${signature}`);
    return signature;
  } catch (err) {
    console.error(`[PAYOUT FAILED] Error paying out ${player.wallet}:`, err.message);
    throw err;
  }
};

export const processAutoCashouts = async (currentMultiplier, io) => {
  let updated = false;
  const players = getPlayers();
  
  for (const p of players) {
    if (p.status === 'playing' && p.target && currentMultiplier >= p.target) {
      p.status = 'cashed';
      p.multiplier = p.target;
      p.profit = (p.amount * p.target) - p.amount;
      updated = true;
      
      // Credit in-game casino balance (house holds SOL until withdrawal)
      const winAmount = p.amount * p.target;
      const account = await accountsModule.creditBalance(p.wallet, winAmount);
      await accountsModule.addBetHistory(p.wallet, {
        game: 'Crash',
        multiplier: p.target,
        profit: p.profit,
        amount: p.amount
      });
      
      if (account && io) io.emit('accountUpdate', account);
    }
  }

  if (updated && io) {
    io.emit('playersUpdate', getPlayers());
  }
};

export const processManualCashout = async (wallet, currentMultiplier, io) => {
  const players = getPlayers();
  const player = players.find(p => p.wallet === wallet);
  
  if (player && player.status === 'playing') {
    player.status = 'cashed';
    player.multiplier = currentMultiplier; 
    player.profit = (player.amount * currentMultiplier) - player.amount;
    
    // Credit in-game casino balance
    const winAmount = player.amount * currentMultiplier;
    const account = await accountsModule.creditBalance(wallet, winAmount);
    await accountsModule.addBetHistory(wallet, {
      game: 'Crash',
      multiplier: currentMultiplier,
      profit: player.profit,
      amount: player.amount
    });
    
    if (io) {
      io.emit('playersUpdate', getPlayers());
      if (account) io.emit('accountUpdate', account);
    }
    return true;
  }
  return false;
};

export const markBustedPlayers = async (io) => {
  let updated = false;
  const players = getPlayers();
  
  for (const p of players) {
    if (p.status === 'playing') {
      p.status = 'busted'; 
      p.profit = -p.amount;
      updated = true;
      
      // Balance was already debited when bet was placed — just log the history
      await accountsModule.addBetHistory(p.wallet, {
        game: 'Crash',
        multiplier: 0,
        profit: -p.amount,
        amount: p.amount
      });
    }
  }

  if (updated && io) {
    io.emit('playersUpdate', getPlayers());
  }
};
