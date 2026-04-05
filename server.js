const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { Connection, PublicKey } = require("@solana/web3.js");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const HOUSE_WALLET = "2uaVindCVsWqbrQMoMosgRGDPAqTm57ar9eBkL6UQd8h";
const solConnection = new Connection("https://api.devnet.solana.com", "confirmed");

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  let engineObj = null;
  let playersStore = null;
  let stateStore = null;

  let payoutsModule = null;

  // We dynamically import ES Modules into our CommonJS script
  Promise.all([
    import("./lib/game/engine.js"),
    import("./lib/game/players.js"),
    import("./lib/game/state.js"),
    import("./lib/game/payouts.js"),
    import("./lib/game/coinflip/engine.js")
  ])
    .then(([engine, players, state, payouts, coinflip]) => {
      engineObj = engine;
      playersStore = players;
      stateStore = state;
      payoutsModule = payouts;
      
      // Override engine's broadcastState or inject players into the broadcast loop
      // engine.js uses updateState() so we will let engine broadcast normally,
      // but we will manually broadcast player updates when they happen!
      engine.setIO(io);

      // Coinflip specific
      global.coinflipEngine = new coinflip.CoinflipEngine(io);
      global.coinflipEngine.start();

      console.log("> Game Engine & stores loaded");
    })
    .catch((err) => {
      console.error("> Error loading ES modules:", err);
    });

  io.on("connection", (socket) => {
    console.log(`> Client connected: ${socket.id}`);
    
    // When a user places a bet from BetPanel.js
    socket.on("placeBet", async (data) => {
      if (!playersStore || !stateStore) return;
      
      const currentState = stateStore.getState();
      if (currentState.status !== "BETTING") {
        socket.emit("betError", { message: "Round holds betting closed currently!" });
        return;
      }

      try {
        const { signature, publicKey, amount, target } = data;
        
        console.log(`[BET] Verifying signature ${signature}...`);
        
        // Simple ping to Solana Devnet to ensure the transaction landed
        let tx = null;
        for (let i = 0; i < 5; i++) {
          tx = await solConnection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
          if (tx) break;
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (!tx) {
           console.log(`[BET FAIL] Tx not found on chain for bet: ${signature}`);
           return;
        }

        // Add player to memory
        playersStore.addPlayer({
          wallet: publicKey,
          amount: amount,
          target: target,
          id: socket.id
        });

        console.log(`[BET SUCCESS] Added ${publicKey} for ${amount} SOL at ${target}x`);
        
        // Broadcast the updated players
        io.emit("playersUpdate", playersStore.getPlayers());

      } catch (err) {
        console.error("> Error verifying bet:", err);
      }
    });

    socket.on("cashOut", (wallet) => {
      if (!payoutsModule || !stateStore) return;
      
      const currentState = stateStore.getState();
      if (currentState.status !== "RUNNING") {
        socket.emit("betError", { message: "Cannot cash out right now!" });
        return;
      }
      
      const success = payoutsModule.processManualCashout(wallet, currentState.multiplier, io);
      if (success) {
        console.log(`[CASHOUT] User ${wallet} manually cashed out at ${currentState.multiplier}x!`);
      } else {
        socket.emit("betError", { message: "Cashout failed. Are you in this round?" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`> Client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
