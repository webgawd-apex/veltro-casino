export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const engine = global.coinflipEngine;
  if (!engine) return res.status(500).json({ error: "Engine not ready" });

  try {
    engine.start(); 
    res.status(200).json({ success: true, state: engine.state.getState() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
