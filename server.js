import 'dotenv/config';
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { Connection, PublicKey } from "@solana/web3.js";
import { findReference, validateTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';
import corsLib from "cors";

// Import game logic modules
import * as engineObj from "./lib/game/engine.js";
import * as playersStore from "./lib/game/players.js";
import * as stateStore from "./lib/game/state.js";
import * as payoutsModule from "./lib/game/payouts.js";
import * as accountsModule from "./lib/accounts.js";
import { CoinflipEngine } from "./lib/game/coinflip/engine.js";
import { initDB } from "./lib/db.js";

const cors = corsLib({ origin: "*" });

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0"; // Binding to 0.0.0.0 is required for Render/Production
const port = process.env.PORT || 10000;

const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || "Hox2okUrbq1jDXhthvCTX6hua9jZE79Mt72smevhJuGY";
const solConnection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://solana-mainnet.core.chainstack.com/cc51a7faf7df840efea3517b629011eb", "confirmed");

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  await initDB();
  const httpServer = createServer((req, res) => {
    cors(req, res, () => {
      const parsedUrl = parse(req.url, true);
      const { pathname } = parsedUrl;

      // Coinflip State
      if (pathname === '/api/coinflip/state') {
        const engine = global.coinflipEngine;
        if (!engine) return res.writeHead(500).end(JSON.stringify({ error: "Engine not ready" }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          state: engine.state.getState(),
          players: engine.players.getPlayers(),
          result: engine.state.getState().result
        }));
      }

      // Coinflip Place Bet — uses in-game balance, no signature required
      if (pathname === '/api/coinflip/place-bet' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { wallet, amount, choice } = JSON.parse(body);
            const engine = global.coinflipEngine;
            if (!engine) return res.writeHead(500).end(JSON.stringify({ error: "Engine not ready" }));

            // Guard: check casino balance
            const balanceCheck = await accountsModule.hasBalance(wallet, amount);
            if (!balanceCheck) {
              res.writeHead(402, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: "Insufficient casino balance" }));
            }

            // Debit before flip
            await accountsModule.debitBalance(wallet, amount);

            // Rig result (70/30 house edge, only for bets >= 0.01 SOL)
            let result = (amount >= 0.01 && Math.random() < 0.70) 
              ? (choice === 'HEADS' ? 'TAILS' : 'HEADS') 
              : choice;
            
            let status = 'busted';
            let profit = 0;

            if (choice === result) {
              profit = (amount * 1.96) - amount;
              status = 'cashed';
              // Credit winnings to in-game balance
              await accountsModule.creditBalance(wallet, amount * 1.96);
              await accountsModule.addBetHistory(wallet, { game: 'Coinflip', multiplier: 1.96, profit, amount });
            } else {
              await accountsModule.addBetHistory(wallet, { game: 'Coinflip', multiplier: 0, profit: -amount, amount });
            }

            // Broadcast updated account
            const updatedAcc = await accountsModule.getAccount(wallet);
            if (updatedAcc && global.io) global.io.emit('accountUpdate', updatedAcc);

            // Sync with engine memory
            const currentHistory = engine.state?.getState()?.history || [];
            const history = [...currentHistory, result].slice(-10);
            if (engine.state) engine.state.updateState({ history });
            if (engine.players) {
              engine.players.addPlayer({ wallet, amount, choice, status, multiplier: 1.96, profit });
              if (engine.players.getPlayers().length > 5) engine.players.playersInRound.shift();
            }
            if (engine.broadcastState) engine.broadcastState();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, result, status, profit }));
          } catch (e) {
            res.writeHead(400).end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      handle(req, res, parsedUrl);
    });
  });

  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Store io globally so HTTP handlers can emit
  global.io = io;

  engineObj.setIO(io);
  global.coinflipEngine = new CoinflipEngine(io);
  global.coinflipEngine.start();
  console.log("> Ready: All ES modules loaded and game engines started.");

  io.on("connection", (socket) => {
    // 🚀 IMMEDIATE STATE SYNC on connection
    if (stateStore) socket.emit("gameUpdate", stateStore.getState());
    if (playersStore) socket.emit("playersUpdate", playersStore.getPlayers());

    // ── Account Events ──────────────────────────────────────────

    // Get or create casino account for wallet
    socket.on("getAccount", async (wallet) => {
      if (!wallet) return;
      const account = await accountsModule.getOrCreateAccount(wallet);
      socket.emit("accountUpdate", account);
    });

    // Deposit: verify on-chain tx then credit casino balance (Testnet logic)
    socket.on("deposit", async ({ wallet, signature, amount }) => {
      if (!wallet || !signature || !amount) return;

      console.log(`\n[DEPOSIT START] 🚀 User: ${wallet.slice(0, 8)}... | Sig: ${signature.slice(0, 8)}... | Amount: ${amount} SOL`);
      socket.emit("depositPending", { message: "Verifying on-chain..." });

      try {
        // Pre-delay to allow nodes to index
        await new Promise(r => setTimeout(r, 3000));
        
        let tx = null;
        let attempts = 0;
        while (attempts < 5) {
          tx = await solConnection.getTransaction(signature, { 
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed' 
          });
          if (tx) break;
          attempts++;
          await new Promise(r => setTimeout(r, 2000));
        }

        if (!tx) throw new Error("Transaction not found on chain after multiple attempts.");
        if (tx.meta?.err) throw new Error("Transaction failed on chain.");

        // Resolve account keys — works for BOTH legacy (message.accountKeys)
        // and versioned/v0 (message.staticAccountKeys) transactions.
        // Phantom defaults to v0, so both paths must be handled.
        const msg = tx.transaction.message;
        const rawKeys = msg.accountKeys ?? msg.staticAccountKeys ?? [];
        const accountKeys = rawKeys.map(k => (typeof k === 'string' ? k : k.toBase58()));

        // Find house wallet by scanning balance changes
        const houseIndex = accountKeys.findIndex(k => k === HOUSE_WALLET);
        if (houseIndex === -1) throw new Error("House wallet not found in transaction.");

        const receivedLamports = tx.meta.postBalances[houseIndex] - tx.meta.preBalances[houseIndex];
        const receivedSol = receivedLamports / 1e9;

        // Sender is always index 0 (fee payer) in any Solana transaction
        const senderPubkey = accountKeys[0];
        console.log(`[DEPOSIT] Sender: ${senderPubkey} | House received: ${receivedSol} SOL`);

        if (senderPubkey !== wallet) {
          console.warn(`[DEPOSIT ❌] Sender mismatch: ${senderPubkey} vs ${wallet}`);
          throw new Error("Sender mismatch — transaction was not sent from your connected wallet.");
        }

        if (receivedSol < amount * 0.99) {
          console.warn(`[DEPOSIT ❌] Amount mismatch: received ${receivedSol}, expected ${amount}`);
          throw new Error("Amount mismatch — received SOL does not match requested deposit.");
        }

        const account = await accountsModule.creditBalance(wallet, receivedSol, signature);
        if (!account) throw new Error("Balance update failed — contact support with your signature.");
        await accountsModule.addBetHistory(wallet, { game: 'Deposit', multiplier: null, profit: receivedSol, amount: receivedSol });
        
        socket.emit("accountUpdate", account);
        socket.emit("depositSuccess", { amount: receivedSol, account });
        console.log(`[DEPOSIT SUCCESS 🎉] ${wallet.slice(0, 6)} credited with ${receivedSol} SOL.\n`);
        
      } catch (err) {
        console.error("[DEPOSIT ERROR ❌]", err.message);
        // Never expose raw RPC errors (403 JSON, etc.) to the player UI
        const isRpcError = err.message?.includes('403') ||
          err.message?.toLowerCase().includes('forbidden') ||
          err.message?.toLowerCase().includes('archive') ||
          err.message?.toLowerCase().includes('jsonrpc');
        const playerMessage = isRpcError
          ? "Deposit received. Please wait a moment then refresh your casino balance."
          : err.message || "Deposit verification error. Please try again.";
        socket.emit("depositError", { message: playerMessage });
      }
    });

    // Cleanup legacy watchers
    socket.on('watchSolanaPay', () => {});
    socket.on('watchManualDeposit', () => {});

    // Withdrawal: debit casino balance then send on-chain SOL
    socket.on("withdraw", async ({ wallet, amount }) => {
      if (!wallet || !amount || amount <= 0) return;

      try {
        // 1. Debit in-game balance first (safety first)
        const updatedAccount = await accountsModule.debitBalance(wallet, amount);
        if (!updatedAccount) {
          return socket.emit("withdrawError", { message: "Insufficient casino balance." });
        }

        // 2. Execute on-chain payout
        try {
          const signature = await payoutsModule.executePayout({ wallet, amount }, 1.0);
          
          // 3. Log history and notify success
          await accountsModule.addBetHistory(wallet, { game: 'Withdrawal', multiplier: null, profit: -amount, amount });
          
          // Re-fetch to get latest balance after debit
          const finalAccount = await accountsModule.getAccount(wallet);
          socket.emit("accountUpdate", finalAccount);
          socket.emit("withdrawSuccess", { amount, signature });
          console.log(`[WITHDRAW ✅] ${wallet.slice(0, 6)} withdrew ${amount} SOL. Sig: ${signature}`);
        } catch (payoutErr) {
          // 4. REFUND LOOP: If on-chain fails, give back the in-game balance
          console.error(`[WITHDRAW FAILED] On-chain error for ${wallet}:`, payoutErr.message);
          await accountsModule.creditBalance(wallet, amount); 
          const refundedAccount = await accountsModule.getAccount(wallet);
          socket.emit("accountUpdate", refundedAccount);
          
          // Send a generic error message to the user for security/UX
          socket.emit("withdrawError", { 
            message: "Withdrawal endpoint error. Please try again later" 
          });
        }
      } catch (err) {
        console.error("[WITHDRAW CRITICAL]", err);
        socket.emit("withdrawError", { message: "Withdrawal encountered a critical error. Please try again." });
      }
    });

    // ── Crash Game Events ────────────────────────────────────────

    // Place bet — instant, no blockchain wait, deducted from casino balance
    socket.on("placeBet", async (data) => {
      if (!playersStore || !stateStore) return;
      const currentState = stateStore.getState();
      if (currentState.status !== "BETTING") {
        socket.emit("betError", { message: "Betting is closed for this round!" });
        return;
      }

      const { publicKey, amount, target } = data;

      // Guard: check casino balance
      const balCheck = await accountsModule.hasBalance(publicKey, amount);
      if (!balCheck) {
        socket.emit("betError", { message: "Insufficient casino balance. Deposit via your profile." });
        return;
      }

      // Debit casino balance immediately
      const updatedAccount = await accountsModule.debitBalance(publicKey, amount);
      socket.emit("accountUpdate", updatedAccount);

      // Add to round
      playersStore.addPlayer({ wallet: publicKey, amount, target, id: socket.id });
      io.emit("playersUpdate", playersStore.getPlayers());
    });

    // Manual cashout
    socket.on("cashOut", (wallet) => {
      if (!payoutsModule || !stateStore) return;
      const currentState = stateStore.getState();
      if (currentState.status !== "RUNNING") return;
      payoutsModule.processManualCashout(wallet, currentState.multiplier, io);
    });
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> Ready: All ES modules loaded and game engines started.`);
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
