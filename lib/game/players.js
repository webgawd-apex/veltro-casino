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
