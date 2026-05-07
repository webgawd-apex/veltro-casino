import { getState } from "../../../lib/game/state";

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Return the current game state from the central engine
  const state = getState();
  res.status(200).json(state);
}
