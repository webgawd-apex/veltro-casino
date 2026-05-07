import crypto from 'crypto';

export const generateCoinflipResult = (serverSeed, clientSeed, nonce) => {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}-${nonce}`)
    .digest('hex');

  const hex = hash.substring(0, 8);
  const num = parseInt(hex, 16);
  
  return num % 2 === 0 ? "HEADS" : "TAILS";
};

export const calculatePayout = (betAmount) => {
  return betAmount * 2 * 0.98; // 2x minus 2% house edge = 1.96x multiplier
};
