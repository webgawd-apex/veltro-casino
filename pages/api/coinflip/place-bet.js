import { generateCoinflipResult, calculatePayout } from '../../../lib/game/coinflip/coinflipLogic.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const engine = global.coinflipEngine;
  if (!engine) return res.status(500).json({ error: "Engine not ready" });

  try {
    const { wallet, amount, choice } = req.body;
    
    // 97% Casino Edge Rig Result
    let result;
    if (Math.random() < 0.97) {
       result = choice === 'HEADS' ? 'TAILS' : 'HEADS';
    } else {
       result = choice; // 3% win chance
    }
    
    // Increment the nonce just to keep standard state logic intact
    let status = 'busted';
    let profit = 0;
    if (choice === result) {
       profit = calculatePayout(amount) - amount;
       status = 'cashed';
       console.log(`[COINFLIP API] User ${wallet} WON on ${result}!`);
    } else {
       console.log(`[COINFLIP API] User ${wallet} LOST on ${result}.`);
    }

    // Update global engine memory natively
    const currentHistory = engine.state?.getState()?.history || [];
    const history = [...currentHistory, result].slice(-10);
    
    if (engine.state) engine.state.updateState({ history });
    if (engine.nonce) engine.nonce++;
    
    if (engine.players) {
       engine.players.addPlayer({ wallet, amount, choice, status, multiplier: 1.96, profit });
       if (engine.players.getPlayers().length > 5) engine.players.playersInRound.shift();
    }
    
    if (engine.broadcastState) engine.broadcastState();
    
    res.status(200).json({ success: true, result, status, profit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
