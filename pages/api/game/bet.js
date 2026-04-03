import { GAME_STATUS, getState } from "../../../lib/game/state";
import { addPlayer } from "../../../lib/game/players";

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { wallet, amount } = req.body;

  // Basic validation
  if (!wallet || !amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Invalid bet parameters' });
  }

  const state = getState();

  // Rule: Bets only allowed during BETTING phase
  if (state.status !== GAME_STATUS.BETTING) {
    return res.status(403).json({ message: 'Betting is currently closed' });
  }

  // Record player's bet (simulated balance check for now)
  const players = addPlayer({ wallet, amount: parseFloat(amount) });

  res.status(200).json({ 
    message: 'Bet placed successfully', 
    players 
  });
}
