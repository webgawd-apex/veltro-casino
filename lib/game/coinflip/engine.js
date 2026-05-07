import { StateManager } from '../core/state.js';
import { PlayerManager } from '../core/players.js';
import { generateCoinflipResult, calculatePayout } from './coinflipLogic.js';

const BETTING_DURATION = 5000;
const FLIPPING_DURATION = 2000;
const RESULT_DURATION = 2000;

const SERVER_SEED = "coinflip-core-secret";
const CLIENT_SEED = "Veltro-Coinflip-Mainnet";

export class CoinflipEngine {
  constructor(io = null) {
    this.io = io;
    this.nonce = 1;
    this.timerInterval = null;
    this.gameLoopActive = false;

    this.state = new StateManager({
      status: 'IDLE',
      result: null,
      history: [],
      timer: 5,
      nonce: 1
    });

    this.players = new PlayerManager();
  }

  setIO(io) {
    this.io = io;
  }

  broadcastState() {
    if (this.io) {
       this.io.emit('coinflip:state', this.state.getState());
       this.io.emit('coinflip:players', this.players.getPlayers());
    }
  }

  start() {
    console.log("--- Coinflip Engine Initialized (On-Demand Mode) ---");
  }

  async runLifecycle() {
    // Deprecated for instant single-player mode
  }
  
  stop() {}
  
  placeBet(wallet, amount, choice) {
     // 1. Generate Result Instantly
     const result = generateCoinflipResult(SERVER_SEED, CLIENT_SEED, this.nonce);
     
     // 2. Update global history for everyone
     const currentHistory = this.state.getState().history || [];
     const history = [...currentHistory, result].slice(-10);
     this.state.updateState({ history });
     
     // 3. Increment nonce
     this.nonce++;
     
     // 4. Calculate if win or loss
     let status = 'busted';
     let profit = 0;
     
     if (choice === result) {
        profit = calculatePayout(amount) - amount;
        status = 'cashed';
        console.log(`[COINFLIP] User ${wallet} WON ${profit} SOL on ${result}!`);
     } else {
        console.log(`[COINFLIP] User ${wallet} LOST on ${result}.`);
     }

     // 5. Briefly add to players so it appears in recent global bets (optional)
     this.players.addPlayer({ wallet, amount, choice, status, multiplier: 1.96, profit });
     
     // Clean up old players if list gets too long (keep last 5 for history sake)
     if (this.players.getPlayers().length > 5) {
        this.players.playersInRound.shift();
     }

     this.broadcastState();

     // Return the explicit result directly to the HTTP requster
     return { result, status, profit };
  }
}
