import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { Connection, PublicKey } from "@solana/web3.js";
import corsLib from "cors";
import 'dotenv/config';

// Import game logic modules
import * as engineObj from "./lib/game/engine.js";
import * as playersStore from "./lib/game/players.js";
import * as stateStore from "./lib/game/state.js";
import * as payoutsModule from "./lib/game/payouts.js";
import * as accountsModule from "./lib/accounts.js";
import { CoinflipEngine } from "./lib/game/coinflip/engine.js";

const cors = corsLib({ origin: "*" });

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 10000;

const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || "DUmdbgs6y1j8ST7C3CFRN4dNEjeNmiPeo922MWoqtaWi";
const solConnection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://solana-mainnet.core.chainstack.com/50d9fbef13c14089c59929338f006803", "confirmed");

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
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
            if (!accountsModule.hasBalance(wallet, amount)) {
              res.writeHead(402, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: "Insufficient casino balance" }));
            }

            // Debit before flip
            accountsModule.debitBalance(wallet, amount);

            // Rig result (house edge)
            let result = Math.random() < 0.97 ? (choice === 'HEADS' ? 'TAILS' : 'HEADS') : choice;
            
            let status = 'busted';
            let profit = 0;

            if (choice === result) {
              profit = (amount * 1.96) - amount;
              status = 'cashed';
              // Credit winnings to in-game balance
              accountsModule.creditBalance(wallet, amount * 1.96);
              accountsModule.addBetHistory(wallet, { game: 'Coinflip', multiplier: 1.96, profit, amount });
            } else {
              accountsModule.addBetHistory(wallet, { game: 'Coinflip', multiplier: 0, profit: -amount, amount });
            }

            // Broadcast updated account
            const updatedAcc = accountsModule.getAccount(wallet);
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
    socket.on("getAccount", (wallet) => {
      if (!wallet) return;
      const account = accountsModule.getOrCreateAccount(wallet);
      socket.emit("accountUpdate", account);
    });

    // Deposit: verify on-chain tx then credit casino balance
    socket.on("deposit", async ({ wallet, signature, amount }) => {
      if (!wallet || !signature || !amount) return;

      // Tell the UI we're verifying so it can show a loading state
      socket.emit("depositPending", { message: "Verifying on-chain..." });

      try {
        let confirmed = false;
        let txError = false;

        // Poll signature status — much faster than getParsedTransaction
        // 30 retries × 1.5s = 45 second window (enough for devnet + mainnet)
        for (let i = 0; i < 30; i++) {
          try {
            const statusRes = await solConnection.getSignatureStatus(signature, {
              searchTransactionHistory: true
            });
            const status = statusRes?.value;

            if (status?.err) {
              txError = true;
              break;
            }

            if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
              confirmed = true;
              break;
            }
          } catch (pollErr) {
            // Transient RPC error — keep polling
            console.warn(`[DEPOSIT] Poll attempt ${i + 1} failed:`, pollErr.message);
          }
          await new Promise(r => setTimeout(r, 1500));
        }

        if (txError) {
          socket.emit("depositError", {
            message: "Transaction was rejected by the network. Your wallet has NOT been debited."
          });
          return;
        }

        if (!confirmed) {
          // Transaction submitted but not confirmed in time — log signature for manual recovery
          console.error(`[DEPOSIT UNCONFIRMED] wallet=${wallet.slice(0, 6)} sig=${signature} amount=${amount}`);
          socket.emit("depositError", {
            message: `Verification timeout. If your wallet was debited, contact support with your signature: ${signature.slice(0, 24)}...`
          });
          return;
        }

        // ✅ Confirmed — credit casino balance
        const account = accountsModule.creditBalance(wallet, amount);
        accountsModule.addBetHistory(wallet, { game: 'Deposit', multiplier: null, profit: amount, amount });
        socket.emit("accountUpdate", account);
        socket.emit("depositSuccess", { amount });
        console.log(`[DEPOSIT ✅] ${wallet.slice(0, 6)} deposited ${amount} SOL. New balance: ${account.balance}`);
      } catch (err) {
        console.error("[DEPOSIT ERROR]", err);
        socket.emit("depositError", {
          message: "Deposit verification encountered an error. If your wallet was debited, please contact support."
        });
      }
    });

    // Withdraw: debit casino balance then send on-chain from house
    socket.on("withdraw", async ({ wallet, amount }) => {
      if (!wallet || !amount) return;
      try {
        if (!accountsModule.hasBalance(wallet, amount)) {
          socket.emit("withdrawError", { message: "Insufficient casino balance." });
          return;
        }
        // Send on-chain first
        await payoutsModule.executePayout({ wallet, amount }, 1.0);
        // Then debit
        const account = accountsModule.debitBalance(wallet, amount);
        accountsModule.addBetHistory(wallet, { game: 'Withdrawal', multiplier: null, profit: -amount, amount });
        socket.emit("accountUpdate", account);
        socket.emit("withdrawSuccess", { amount });
        console.log(`[WITHDRAW] ${wallet.slice(0, 6)} withdrew ${amount} SOL. New balance: ${account.balance}`);
      } catch (err) {
        console.error("[WITHDRAW ERROR]", err);
        socket.emit("withdrawError", { message: "Withdrawal failed. Please try again." });
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
      if (!accountsModule.hasBalance(publicKey, amount)) {
        socket.emit("betError", { message: "Insufficient casino balance. Deposit via your profile." });
        return;
      }

      // Debit casino balance immediately
      const updatedAccount = accountsModule.debitBalance(publicKey, amount);
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
