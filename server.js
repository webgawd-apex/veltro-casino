import 'dotenv/config';
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { Connection, PublicKey } from "@solana/web3.js";
import { findReference, validateTransfer } from "@solana/pay";
import BigNumber from "bignumber.js";
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

const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || "DUmdbgs6y1j8ST7C3CFRN4dNEjeNmiPeo922MWoqtaWi";
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

    // Solana Pay: Watch for a specific reference on-chain
    socket.on("watchSolanaPay", async ({ wallet, amount, reference }) => {
      if (!wallet || !amount || !reference) return;

      const referencePubkey = new PublicKey(reference);
      const expectedAmount = new BigNumber(amount);
      const housePubkey = new PublicKey(HOUSE_WALLET);

      console.log(`[SOLANA PAY] Monitoring ${wallet.slice(0,6)} for ${amount} SOL transfer. Ref: ${reference}`);

      // Polling interval
      const interval = setInterval(async () => {
        try {
          // Check if socket is still connected
          if (!socket.connected) {
            clearInterval(interval);
            return;
          }

          // 1. Locate the transaction
          const found = await findReference(solConnection, referencePubkey, { finality: 'confirmed' });
          
          if (found) {
            clearInterval(interval);
            console.log(`[SOLANA PAY] Found transaction for ${wallet.slice(0,6)}. Signature: ${found.signature}`);

            // 2. Validate the transfer details
            try {
              await validateTransfer(solConnection, found.signature, {
                recipient: housePubkey,
                amount: expectedAmount,
                reference: referencePubkey,
              }, { commitment: 'confirmed' });

              // 3. Success! Credit the user
              const account = await accountsModule.creditBalance(wallet, amount, found.signature);
              if (account) {
                await accountsModule.addBetHistory(wallet, { 
                  game: 'Deposit', 
                  multiplier: null, 
                  profit: amount, 
                  amount: amount 
                });
                socket.emit("accountUpdate", account);
                socket.emit("depositSuccess", { amount });
                console.log(`[SOLANA PAY ✅] ${wallet.slice(0,6)} confirmed. New balance: ${account.balance}`);
              }
            } catch (valErr) {
              console.error("[SOLANA PAY VALIDATION ERROR]", valErr.message);
              socket.emit("depositError", { message: "Payment validation failed. Please contact support." });
            }
          }
        } catch (err) {
          // findReference throws if not found, which is fine during polling
          if (err.name !== 'FindReferenceError') {
            console.error("[SOLANA PAY WATCH ERROR]", err);
          }
        }
      }, 3000); // Poll every 3 seconds

      // Stop watching after 10 minutes (timeout)
      setTimeout(() => {
        clearInterval(interval);
      }, 600000);

      // Also handle explicit stop request
      socket.on("stopWatchSolanaPay", ({ reference: refStop }) => {
        if (refStop === reference) {
          clearInterval(interval);
          console.log(`[SOLANA PAY] Stopped monitoring ref: ${reference}`);
        }
      });
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
