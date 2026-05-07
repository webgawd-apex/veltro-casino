export class PlayerManager {
  constructor() {
    this.playersInRound = [];
  }

  addPlayer(player) {
    this.playersInRound.push({ 
      status: 'playing', // 'playing' | 'cashed' | 'busted'
      multiplier: null, 
      profit: null,
      ...player
    });
    return this.playersInRound;
  }

  getPlayers() {
    return [...this.playersInRound];
  }

  clearPlayers() {
    this.playersInRound = [];
    return this.playersInRound;
  }

  updatePlayer(wallet, updateFn) {
    const p = this.playersInRound.find(player => player.wallet === wallet);
    if (p) {
      Object.assign(p, updateFn(p));
    }
  }
}
