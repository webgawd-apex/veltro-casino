import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getPlayers } from './players.js';

// Load the House Wallet Keypair synchronously on boot
const keyPath = resolve(process.cwd(), 'house-key.json');
const rawKey = JSON.parse(readFileSync(keyPath, 'utf8'));
const houseKeypair = Keypair.fromSecretKey(new Uint8Array(rawKey.secretKey));

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

export const executePayout = async (player, multiplier) => {
  try {
    const lamports = Math.floor(player.amount * multiplier * LAMPORTS_PER_SOL);
    const toPublicKey = new PublicKey(player.wallet);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: houseKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: lamports,
      })
    );
    
    // Asynchronous send stringency - do not wait for confirmation to keep loop fast
    const signature = await connection.sendTransaction(transaction, [houseKeypair]);
    console.log(`[PAYOUT] Sent ${(lamports / LAMPORTS_PER_SOL).toFixed(2)} SOL to ${player.wallet}. Sig: ${signature}`);
  } catch (err) {
    console.error(`[PAYOUT FAILED] Error paying out ${player.wallet}:`, err);
  }
};

export const processAutoCashouts = (currentMultiplier, io) => {
  let updated = false;
  const players = getPlayers();
  
  players.forEach((p) => {
     if (p.status === 'playing' && currentMultiplier >= p.target) {
        p.status = 'cashed';
        p.multiplier = p.target; // Cashes exactly at their auto-target
        p.profit = (p.amount * p.target) - p.amount; // Profit is winnings minus original bet
        updated = true;
        
        // Execute the literal transfer to the player's wallet
        executePayout(p, p.target);
     }
  });

  if (updated && io) {
     io.emit('playersUpdate', getPlayers());
  }
};

export const processManualCashout = (wallet, currentMultiplier, io) => {
  const players = getPlayers();
  const player = players.find(p => p.wallet === wallet);
  
  if (player && player.status === 'playing') {
      player.status = 'cashed';
      player.multiplier = currentMultiplier; 
      player.profit = (player.amount * currentMultiplier) - player.amount;
      
      executePayout(player, currentMultiplier);
      if (io) io.emit('playersUpdate', getPlayers());
      return true;
  }
  return false;
};

export const markBustedPlayers = (io) => {
  let updated = false;
  const players = getPlayers();
  
  players.forEach((p) => {
    if (p.status === 'playing') {
       p.status = 'busted'; 
       p.profit = -p.amount; // You lose your original bet
       updated = true;
    }
  });

  if (updated && io) {
     io.emit('playersUpdate', getPlayers());
  }
};
