import { GAME_STATUS, getState } from "../../../lib/game/state";
import { cashOutPlayer } from "../../../lib/game/players";

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { wallet } = req.body;
  const state = getState();

  // Rule: Cashout only allowed during RUNNING phase
  if (state.status !== GAME_STATUS.RUNNING) {
    return res.status(403).json({ message: 'Cashout is currently closed' });
  }

  // Get current multiplier as cashout multiplier
  const currentMultiplier = state.multiplier;

  // Process cashout
  const player = cashOutPlayer(wallet, currentMultiplier);

  if (!player) {
    return res.status(404).json({ message: 'No player found for this wallet' });
  }

  res.status(200).json({ 
    message: 'Cashed out successfully', 
    player 
  });
}
