import { query } from './db.js';

const mapUser = (user) => ({
  ...user,
  processedSignatures: user.processed_signatures,
  createdAt: user.created_at,
  updatedAt: user.updated_at
});

export const getOrCreateAccount = async (wallet) => {
  const cleanWallet = wallet.trim();
  try {
    let res = await query('SELECT * FROM users WHERE wallet = $1', [cleanWallet]);
    
    if (res.rows.length === 0) {
      await query('INSERT INTO users (wallet, balance) VALUES ($1, 0) ON CONFLICT (wallet) DO NOTHING', [cleanWallet]);
      res = await query('SELECT * FROM users WHERE wallet = $1', [cleanWallet]);
    }

    const user = res.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [user.id]
    );
    
    return { ...mapUser(user), history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] getOrCreateAccount error:", err.message);
    return null;
  }
};

export const getAccount = async (wallet) => {
  const cleanWallet = wallet.trim();
  try {
    const res = await query('SELECT * FROM users WHERE wallet = $1', [cleanWallet]);
    if (res.rows.length === 0) return null;
    
    const user = res.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [user.id]
    );
    
    return { ...mapUser(user), history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] getAccount error:", err.message);
    return null;
  }
};

export const creditBalance = async (wallet, amount, signature = null) => {
  const cleanWallet = wallet.trim();
  try {
    const user = await getOrCreateAccount(cleanWallet);
    if (!user) return null;

    if (signature && user.processedSignatures?.includes(signature)) {
      return user;
    }

    const updatedRes = await query(
      `UPDATE users 
       SET balance = balance + $1, 
           processed_signatures = CASE WHEN $2::text IS NOT NULL THEN array_append(processed_signatures, $2) ELSE processed_signatures END,
           updated_at = NOW()
       WHERE wallet = $3 
       RETURNING *`,
      [amount, signature, cleanWallet]
    );

    const updatedUser = updatedRes.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [updatedUser.id]
    );

    return { ...mapUser(updatedUser), history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] creditBalance failed:", err.message);
    return null;
  }
};

export const debitBalance = async (wallet, amount) => {
  const cleanWallet = wallet.trim();
  try {
    const user = await getAccount(cleanWallet);
    if (!user || user.balance < amount - 0.000001) return null;

    const updatedRes = await query(
      'UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE wallet = $2 RETURNING *',
      [amount, cleanWallet]
    );

    const updatedUser = updatedRes.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [updatedUser.id]
    );

    return { ...mapUser(updatedUser), history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] debitBalance failed:", err.message);
    return null;
  }
};

export const hasBalance = async (wallet, amount) => {
  const cleanWallet = wallet.trim();
  try {
    const res = await query('SELECT balance FROM users WHERE wallet = $1', [cleanWallet]);
    if (res.rows.length === 0) return false;
    return res.rows[0].balance >= amount - 0.000001;
  } catch (err) {
    return false;
  }
};

export const addBetHistory = async (wallet, entry) => {
  const cleanWallet = wallet.trim();
  try {
    const userRes = await query('SELECT id FROM users WHERE wallet = $1', [cleanWallet]);
    if (userRes.rows.length === 0) return;

    await query(
      'INSERT INTO bets (user_id, game, multiplier, profit, amount) VALUES ($1, $2, $3, $4, $5)',
      [userRes.rows[0].id, entry.game, entry.multiplier, entry.profit, entry.amount]
    );
  } catch (err) {
    console.error("[ACCOUNTS] addBetHistory failed:", err.message);
  }
};
