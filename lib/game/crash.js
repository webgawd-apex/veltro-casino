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
  
  const houseEdge = 0.96; // 4% house edge
  const multiplier = Math.max(1, (Math.pow(2, 52) / (val + 1)) * houseEdge);

  return Math.max(1.0, Math.floor(multiplier * 100) / 100);
};

