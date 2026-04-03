import crypto from 'crypto';

/**
 * Generates a deterministic crash point using HMAC-SHA256.
 * @param {string} serverSeed - The secret server seed.
 * @param {string} clientSeed - The client seed (placeholder or player provided).
 * @param {number} nonce - The incremental round counter.
 * @returns {number} The crash multiplier (rounded to 2 decimal places).
 */
export const generateCrashPoint = (serverSeed, clientSeed, nonce) => {
  // 1. Create a hash of the combined seeds and nonce
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}-${nonce}`)
    .digest('hex');

  // 2. Take the first 52 bits (13 hex characters)
  const hex = hash.substring(0, 13);
  const val = parseInt(hex, 16);

  // 3. Normalize and apply the house edge
  // Formula: X = 2^52 / (val + 1) -> ensures a distribution where higher numbers are rarer
  // House Edge: 3% (0.97 multiplier)
  const houseEdge = 0.97;
  const multiplier = Math.max(1, (Math.pow(2, 52) / (val + 1)) * houseEdge);

  return Math.floor(multiplier * 100) / 100;
};
