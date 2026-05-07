// In-memory store for players in the current round
let playersInRound = [];

export const addPlayer = (player) => {
  // player: { wallet, amount, target, id }
  playersInRound.push({ 
    ...player, 
    status: 'playing', // 'playing' | 'cashed' | 'busted'
    multiplier: null, 
    profit: null 
  });
  return playersInRound;
};

export const getPlayers = () => [...playersInRound];

export const clearPlayers = () => {
  playersInRound = [];
  return playersInRound;
};

export const cashOutPlayer = (wallet, multiplier) => {
  const pIndex = playersInRound.findIndex(p => p.wallet === wallet);
  if (pIndex === -1) return null;
  const player = playersInRound[pIndex];
  if (player.status !== 'playing') return null;
  
  player.status = 'cashed';
  player.multiplier = multiplier;
  player.profit = player.amount * multiplier;
  return player;
};
