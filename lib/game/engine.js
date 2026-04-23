import { GAME_STATUS, getState, updateState, resetState } from './state.js';
import { clearPlayers, getPlayers } from './players.js';
import { generateCrashPoint } from './crash.js';
import { processAutoCashouts, markBustedPlayers } from './payouts.js';

const GROWTH_RATE = 0.0001; 
const TICK_RATE = 66; 
const BETTING_DURATION = 20000; 
const RESET_DURATION = 5000;

// Deterministic Seeds (In a production app, these would be generated securely)
const SERVER_SEED = "6b86b273...4a192b"; // Secret seed
const CLIENT_SEED = "Veltro-Crash-Mainnet"; // Public seed

let nonce = 1; // Round counter
let io = null;
let gameInterval = null;

/**
 * Links the Socket.IO server to the engine.
 * Automatically starts the engine once linked.
 */
export const setIO = (_io) => {
  io = _io;
  console.log("--- Socket.IO Linked to Engine ---");
  startEngine();
};

export const startEngine = () => {
  if (gameInterval) return;
  console.log("--- Crash Game Engine Initialized ---");
  runLifecycle();
};

const broadcastState = (state) => {
  if (io) {
    io.emit('gameUpdate', state);
  }
};

const runLifecycle = async () => {
  // 1. BETTING State
  const targetStartTime = Date.now() + BETTING_DURATION;
  const bettingState = updateState({ 
    status: GAME_STATUS.BETTING, 
    multiplier: 1.0, 
    currentRoundId: Date.now(),
    nonce,
    targetStartTime
  });
  broadcastState(bettingState);
  console.log(`[STATUS] BETTING - 20s for new bets - Round #${nonce}`);
  
  await new Promise(resolve => setTimeout(resolve, BETTING_DURATION));

  // 2. RUNNING State
  const activePlayers = getPlayers();
  const crashPoint = generateCrashPoint(SERVER_SEED, CLIENT_SEED, nonce, activePlayers);
  const startTime = Date.now();
  const runningState = updateState({ status: GAME_STATUS.RUNNING, startTime, crashPoint });
  broadcastState(runningState);
  console.log(`[STATUS] RUNNING - Crash point: ${crashPoint}x`);

  return new Promise(resolve => {
    gameInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const multiplier = Math.exp(GROWTH_RATE * elapsed);

      if (multiplier >= crashPoint) {
        clearInterval(gameInterval);
        gameInterval = null;
        onCrash(crashPoint);
        resolve();
      } else {
        const state = updateState({ multiplier });
        broadcastState(state);
        // Non-blocking auto cashout check
        processAutoCashouts(multiplier, io);
      }
    }, TICK_RATE);
  });
};

const onCrash = async (crashValue) => {
  const currentState = getState();
  const crashedState = updateState({ status: GAME_STATUS.CRASHED, multiplier: crashValue });
  
  // Add to history
  const history = [...currentState.history, crashValue].slice(-10);
  const finalState = updateState({ history });
  broadcastState(finalState);

  // Remaining active players go bust!
  await markBustedPlayers(io);
  
  console.log(`[STATUS] CRASHED at ${crashValue.toFixed(2)}x`);

  // Increment nonce for next round
  nonce++;

  // 3. RESET State
  setTimeout(() => {
    console.log(`[STATUS] RESET - Preparing next round`);
    clearPlayers();
    if (io) io.emit("playersUpdate", []);
    resetState();
    runLifecycle();
  }, RESET_DURATION);
};

export const stopEngine = () => {
  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
};
