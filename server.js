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
const hostname = "localhost";
const port = process.env.PORT || 10000;

const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || "Hox2okUrbq1jDXhthvCTX6hua9jZE79Mt72smevhJuGY";
const solConnection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://solana-mainnet.core.chainstack.com/50d9fbef13c14089c59929338f006803", "confirmed");

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

            // Rig result (house edge)
            let result = Math.random() < 0.97 ? (choice === 'HEADS' ? 'TAILS' : 'HEADS') : choice;
            
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

  // Global registries for deposit management
  global.io = io;
  global.activeDepositRequests = new Map();
  global.processedSignatures = new Set();

  // ── Global Background Deposit Scanner ──
  const startGlobalDepositScanner = () => {
    console.log(`[SCANNER] Starting global background deposit scanner for ${HOUSE_WALLET.slice(0, 6)}...`);
    
    const scan = async () => {
      try {
        const recipientPubkey = new PublicKey(HOUSE_WALLET);
        const sigs = await solConnection.getSignaturesForAddress(recipientPubkey, { limit: 50 });

        for (const sigInfo of sigs) {
          if (global.processedSignatures.has(sigInfo.signature)) continue;

          try {
            const tx = await solConnection.getParsedTransaction(sigInfo.signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            });

            if (!tx || !tx.meta) continue;

            const accountKeys = tx.transaction.message.accountKeys;
            const preBalances = tx.meta.preBalances;
            const postBalances = tx.meta.postBalances;

            const houseIndex = accountKeys.findIndex(k =>
              (k.pubkey?.toBase58?.() ?? k.toBase58?.()) === HOUSE_WALLET
            );
            if (houseIndex === -1) {
              global.processedSignatures.add(sigInfo.signature);
              continue;
            }

            const lamports = postBalances[houseIndex] - preBalances[houseIndex];
            if (lamports <= 0) {
              global.processedSignatures.add(sigInfo.signature);
              continue;
            }

            const solAmount = lamports / 1e9;
            let matched = false;

            for (const [wallet, activeReq] of global.activeDepositRequests.entries()) {
              const isUserInvolved = accountKeys.some(k => 
                (k.pubkey?.toBase58?.() ?? k.toBase58?.()) === wallet
              );

              if (isUserInvolved) {
                if (Math.abs(solAmount - activeReq.expectedAmount) < 0.000001) {
                  if (Date.now() < activeReq.expiresAt) {
                    console.log(`[SCANNER ✅] Match found! ${wallet.slice(0, 6)} deposited ${solAmount} SOL`);
                    
                    const account = await accountsModule.creditBalance(wallet, solAmount, sigInfo.signature);
                    if (account) {
                      global.activeDepositRequests.delete(wallet);
                      await accountsModule.addBetHistory(wallet, {
                        game: 'Deposit',
                        multiplier: null,
                        profit: solAmount,
                        amount: solAmount,
                      });
                      
                      global.io.emit('accountUpdate', account);
                      global.io.emit('depositSuccess', { wallet, amount: solAmount });
                    }
                    matched = true;
                    break;
                  }
                }
              }
            }
            global.processedSignatures.add(sigInfo.signature);
          } catch (txErr) {
            console.warn(`[SCANNER] Error parsing tx ${sigInfo.signature.slice(0, 8)}:`, txErr.message);
          }
        }
      } catch (err) {
        console.warn('[SCANNER] Loop error:', err.message);
      }
    };
    setInterval(scan, 5000);
  };

  startGlobalDepositScanner();

  engineObj.setIO(io);
  global.coinflipEngine = new CoinflipEngine(io);
  global.coinflipEngine.start();
  console.log("> Ready: All ES modules loaded and game engines started.");

  io.on("connection", (socket) => {
    // 🚀 IMMEDIATE STATE SYNC on connection
    if (stateStore) socket.emit("gameUpdate", stateStore.getState());
    if (playersStore) socket.emit("playersUpdate", playersStore.getPlayers());

    // ── Account Events ──────────────────────────────────────────
    
    // Manual Fractional Deposit Request Generator
    socket.on("requestDeposit", ({ wallet, baseAmount }) => {
      if (!wallet || !baseAmount || baseAmount <= 0) return;
      
      // Generate a tiny unique 6-decimal amount (e.g. 0.5 -> 0.500234)
      const fractionalSuffix = (Math.floor(Math.random() * 900) + 100) / 1000000;
      const expectedAmount = parseFloat((parseFloat(baseAmount) + fractionalSuffix).toFixed(6));
      
      // Store active request with 15 minute expiry and creation time
      global.activeDepositRequests.set(wallet, {
        expectedAmount,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
        expiresAt: Date.now() + 15 * 60000
      });
      
      console.log(`[DEPOSIT REQUEST] ${wallet.slice(0, 6)} requested ${baseAmount} SOL -> Expected: ${expectedAmount} SOL`);
      socket.emit("depositRequestCreated", { expectedAmount, expiresAt: Date.now() + 15 * 60000 });
    });

    // Get or create casino account for wallet
    socket.on("getAccount", async (wallet) => {
      if (!wallet) return;
      const account = await accountsModule.getOrCreateAccount(wallet);
      socket.emit("accountUpdate", account);
    });

    // Solana Pay: watch for a transaction with the given reference
    socket.on("watchSolanaPay", async ({ wallet, amount, reference }) => {
      if (!wallet || !amount || !reference) return;

      console.log(`[SOLANA PAY] Watching for ${amount} SOL deposit from ${wallet.slice(0, 6)} (Ref: ${reference.slice(0, 6)})`);
      
      const referencePubkey = new PublicKey(reference);
      const recipientPubkey = new PublicKey(HOUSE_WALLET);
      const amountBN = new BigNumber(amount);
      
      let signatureInfo;
      let interval;
      let timeout;

      const cleanup = () => {
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
      };

      // Poll for the transaction signature
      interval = setInterval(async () => {
        try {
          signatureInfo = await findReference(solConnection, referencePubkey, { finality: 'confirmed' });
          if (signatureInfo) {
            cleanup();
            verifyPayment(signatureInfo.signature);
          }
        } catch (e) {
          // Keep polling
        }
      }, 3000);

      // Stop watching after 10 minutes
      timeout = setTimeout(() => {
        cleanup();
        socket.emit("depositError", { message: "Payment timeout. The request has expired." });
      }, 600000);

      const verifyPayment = async (signature) => {
        try {
          socket.emit("depositPending", { message: "Payment detected! Verifying..." });
          
          // Validate the transfer details
          await validateTransfer(solConnection, signature, {
            recipient: recipientPubkey,
            amount: amountBN,
            reference: referencePubkey,
          }, { commitment: 'confirmed' });

          // ✅ Success - credit balance
          const account = await accountsModule.creditBalance(wallet, amount, signature);
          if (account) {
            await accountsModule.addBetHistory(wallet, { 
              game: 'Deposit', 
              multiplier: null, 
              profit: amount, 
              amount 
            });
            socket.emit("accountUpdate", account);
            socket.emit("depositSuccess", { amount });
            console.log(`[SOLANA PAY ✅] ${wallet.slice(0, 6)} deposited ${amount} SOL. Sig: ${signature}`);
          }
        } catch (err) {
          console.error("[SOLANA PAY VERIFY ERROR]", err);
          socket.emit("depositError", { message: "Payment verification failed. Please contact support." });
        }
      };
    });

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
          
          // Send the ACTUAL error message to the user
          socket.emit("withdrawError", { 
            message: `Withdrawal failed: ${payoutErr.message}` 
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

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
