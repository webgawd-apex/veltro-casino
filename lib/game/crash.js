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
  // 1. Base HMAC calculation (The deterministic "Fair" point)
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}-${nonce}`)
    .digest('hex');

  const hex = hash.substring(0, 13);
  const val = parseInt(hex, 16);
  
  // Set to 0.95 to reflect a 55/45 style house edge (approx 5% house advantage)
  const houseEdge = 0.95; 
  let multiplier = Math.max(1, (Math.pow(2, 52) / (val + 1)) * houseEdge);

  console.log(`[GAME] Generated fair crash point for Round #${nonce}: ${multiplier.toFixed(2)}x`);

  return Math.max(1.0, Math.floor(multiplier * 100) / 100);
};

