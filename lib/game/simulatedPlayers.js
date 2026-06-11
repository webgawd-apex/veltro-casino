/**
 * Utility for generating and managing simulated players in the Crash game.
 */

const ADDR_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const generateFakeAddress = () => {
  let addr = "";
  for (let i = 0; i < 44; i++) {
    addr += ADDR_CHARS.charAt(Math.floor(Math.random() * ADDR_CHARS.length));
  }
  return addr;
};

/**
 * Generates a batch of simulated players for a round.
 * @param {number} count - Number of simulated players to generate.
 * @returns {Array} Array of player objects.
 */
export const generateSimulatedBatch = (count = 4) => {
  const players = [];
  for (let i = 0; i < count; i++) {
    const amount = parseFloat((Math.random() * 4.9 + 0.1).toFixed(2)); // 0.1 to 5.0 SOL
    const target = Math.random() < 0.7 
      ? parseFloat((Math.random() * 1.5 + 1.1).toFixed(2)) // 70% low targets (1.1x - 2.6x)
      : parseFloat((Math.random() * 50 + 2).toFixed(2));   // 30% high targets (2x - 52x)

    players.push({
      wallet: generateFakeAddress(),
      amount,
      target,
      isSimulated: true,
      status: 'playing',
      multiplier: null,
      profit: null
    });
  }
  return players;
};

/**
 * Logic to determine which simulated players should cash out at the current multiplier.
 * @param {Array} players - The active players array.
 * @param {number} currentMultiplier - The current game multiplier.
 * @param {number} crashPoint - The point where the game will crash.
 * @returns {Array} Array of wallets that should cash out now.
 */
export const getSimulatedCashouts = (players, currentMultiplier, crashPoint) => {
  return players
    .filter(p => p.isSimulated && p.status === 'playing')
    .filter(p => {
      // Cash out if we've reached our target and it's below the crash point
      if (currentMultiplier >= p.target && p.target < crashPoint) {
        return true;
      }
      
      // Random "panic" cashout (small chance to cash out early)
      if (currentMultiplier > 1.2 && Math.random() < 0.01) {
        return true;
      }

      return false;
    })
    .map(p => p.wallet);
};
