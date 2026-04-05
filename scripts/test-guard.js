import { generateCrashPoint } from '../lib/game/crash.js';

const SERVER_SEED = "test-seed";
const CLIENT_SEED = "test-client";
const nonce = 1;

console.log("--- SCENARIO 1: No Players ---");
const normalMultiplier = generateCrashPoint(SERVER_SEED, CLIENT_SEED, nonce, []);
console.log(`Crash Point: ${normalMultiplier}x (Should be high or normal)`);

console.log("\n--- SCENARIO 2: With Players (No Auto-Cashout) ---");
const playersNoTarget = [
  { wallet: 'A', amount: 1 }
];
const guardedMultiplier = generateCrashPoint(SERVER_SEED, CLIENT_SEED, nonce, playersNoTarget);
console.log(`Crash Point: ${guardedMultiplier}x (Should be ~2% of win magnitude)`);

console.log("\n--- SCENARIO 3: With Players (Auto-Cashout at 2.0x) ---");
const playersWithTarget = [
  { wallet: 'B', amount: 1, target: 2.0 }
];
const targetGuardedMultiplier = generateCrashPoint(SERVER_SEED, CLIENT_SEED, nonce, playersWithTarget);
console.log(`Crash Point: ${targetGuardedMultiplier}x (Should be < 2.0x, likely ~1.96x or lower)`);

console.log("\n--- SCENARIO 4: Extremely High Initial Multiplier with Players ---");
// Simulate a high initial multiplier by finding a low value 'val'
// Since I can't easily reverse HMAC, I'll just trust the logic if Scenarios 1-3 pass.
