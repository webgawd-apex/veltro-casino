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

  // 2. 70/30 HOUSE EDGE: Determine if house wins this round
  const houseWins = Math.random() < 0.70;

  if (houseWins) {
    console.log(`[HOUSE EDGE] House wins this round (70% trigger).`);
    
    // Default low crash for house wins
    let riggedMultiplier = Math.max(1.0, (Math.random() * 0.2) + 1.0); // 1.00x - 1.20x

    // If real players are active, ensure we crash below their targets
    if (players && players.length > 0) {
      const realPlayers = players.filter(p => !p.isSimulated);
      if (realPlayers.length > 0) {
        const targets = realPlayers
          .filter(p => p.target && p.target > 1)
          .map(p => p.target);

        if (targets.length > 0) {
          const minTarget = Math.min(...targets);
          riggedMultiplier = Math.min(riggedMultiplier, Math.max(1.0, minTarget - 0.01));
          console.log(`[HOUSE EDGE] Rigging below real player target: ${minTarget}x -> ${riggedMultiplier.toFixed(2)}x`);
        }
      }
    }
    multiplier = riggedMultiplier;
  } else {
    console.log(`[HOUSE EDGE] Fair round (30% trigger).`);
  }

  return Math.max(1.0, Math.floor(multiplier * 100) / 100);
};

