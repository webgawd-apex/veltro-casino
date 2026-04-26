import { query } from './db.js';

export const getOrCreateAccount = async (wallet) => {
  try {
    // Try to get existing user
    let res = await query('SELECT * FROM users WHERE wallet = $1', [wallet]);
    
    if (res.rows.length === 0) {
      // Create new user
      await query('INSERT INTO users (wallet, balance) VALUES ($1, 0) ON CONFLICT (wallet) DO NOTHING', [wallet]);
      res = await query('SELECT * FROM users WHERE wallet = $1', [wallet]);
      console.log(`[ACCOUNTS] New SQL account created: ${wallet.slice(0, 6)}`);
    }

    const user = res.rows[0];
    
    // Fetch history
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [user.id]
    );
    
    return { ...user, history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] Error in getOrCreateAccount:", err.message);
    return null;
  }
};

export const getAccount = async (wallet) => {
  try {
    const res = await query('SELECT * FROM users WHERE wallet = $1', [wallet]);
    if (res.rows.length === 0) return null;
    
    const user = res.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [user.id]
    );
    
    return { ...user, history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] Error in getAccount:", err.message);
    return null;
  }
};

export const creditBalance = async (wallet, amount, signature = null) => {
  try {
    const user = await getOrCreateAccount(wallet);
    if (!user) return null;

    // Anti-double spend check
    if (signature && user.processed_signatures.includes(signature)) {
      console.warn(`[ACCOUNTS] Signature ${signature} already processed for ${wallet.slice(0, 6)}`);
      return user;
    }

    const updatedRes = await query(
      `UPDATE users 
       SET balance = balance + $1, 
           processed_signatures = CASE WHEN $2::text IS NOT NULL THEN array_append(processed_signatures, $2) ELSE processed_signatures END,
           updated_at = NOW()
       WHERE wallet = $3 
       RETURNING *`,
      [amount, signature, wallet]
    );

    const updatedUser = updatedRes.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [updatedUser.id]
    );

    console.log(`[ACCOUNTS] Credit ${wallet.slice(0, 6)}: +${amount} SOL → ${updatedUser.balance} SOL`);
    return { ...updatedUser, history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] Credit failed:", err.message);
    return null;
  }
};

export const debitBalance = async (wallet, amount) => {
  try {
    const user = await getAccount(wallet);
    if (!user || user.balance < amount - 0.000001) {
      console.log(`[ACCOUNTS] Debit FAILED ${wallet.slice(0, 6)}: need ${amount}, have ${user?.balance ?? 0}`);
      return null;
    }

    const updatedRes = await query(
      'UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE wallet = $2 RETURNING *',
      [amount, wallet]
    );

    const updatedUser = updatedRes.rows[0];
    const historyRes = await query(
      'SELECT game, multiplier, profit, amount, timestamp FROM bets WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [updatedUser.id]
    );

    console.log(`[ACCOUNTS] Debit ${wallet.slice(0, 6)}: -${amount} SOL → ${updatedUser.balance} SOL`);
    return { ...updatedUser, history: historyRes.rows };
  } catch (err) {
    console.error("[ACCOUNTS] Debit failed:", err.message);
    return null;
  }
};

export const hasBalance = async (wallet, amount) => {
  try {
    const res = await query('SELECT balance FROM users WHERE wallet = $1', [wallet]);
    if (res.rows.length === 0) return false;
    return res.rows[0].balance >= amount - 0.000001;
  } catch (err) {
    return false;
  }
};

export const addBetHistory = async (wallet, entry) => {
  try {
    const userRes = await query('SELECT id FROM users WHERE wallet = $1', [wallet]);
    if (userRes.rows.length === 0) return;

    await query(
      'INSERT INTO bets (user_id, game, multiplier, profit, amount) VALUES ($1, $2, $3, $4, $5)',
      [userRes.rows[0].id, entry.game, entry.multiplier, entry.profit, entry.amount]
    );
  } catch (err) {
    console.error("[ACCOUNTS] History save failed:", err.message);
  }
};
