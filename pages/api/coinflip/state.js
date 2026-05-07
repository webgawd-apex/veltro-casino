export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  
  const engine = global.coinflipEngine;
  if (!engine) return res.status(500).json({ error: "Engine not ready" });

  res.status(200).json({
    state: engine.state.getState(),
    players: engine.players.getPlayers(),
    result: engine.state.getState().result
  });
}
