import pg from 'pg';
const { Pool } = pg;

// Use the connection string provided by the user OR an environment variable
const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_8RgrZvKto4EM@ep-tiny-salad-al7lt16v-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Initialize database table
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS casino_accounts (
        wallet TEXT PRIMARY KEY,
        balance DOUBLE PRECISION DEFAULT 0,
        history JSONB DEFAULT '[]',
        processed_signatures JSONB DEFAULT '[]',
        created_at BIGINT
      );
    `);
    console.log("[ACCOUNTS] PostgreSQL table verified.");
  } catch (err) {
    console.error("[ACCOUNTS] Error initializing DB:", err);
  }
};

initDb();

export const getOrCreateAccount = async (wallet) => {
  try {
    let res = await pool.query("SELECT * FROM casino_accounts WHERE wallet = $1", [wallet]);
    if (res.rows.length === 0) {
      const newUser = {
        wallet,
        balance: 0,
        history: [],
        processed_signatures: [],
        created_at: Date.now()
      };
      await pool.query(
        "INSERT INTO casino_accounts (wallet, balance, history, processed_signatures, created_at) VALUES ($1, $2, $3, $4, $5)",
        [newUser.wallet, newUser.balance, JSON.stringify(newUser.history), JSON.stringify(newUser.processed_signatures), newUser.created_at]
      );
      console.log(`[ACCOUNTS] New account created in DB: ${wallet.slice(0, 6)}`);
      return newUser;
    }
    const acc = res.rows[0];
    return {
      ...acc,
      history: typeof acc.history === 'string' ? JSON.parse(acc.history) : acc.history,
      processedSignatures: typeof acc.processed_signatures === 'string' ? JSON.parse(acc.processed_signatures) : acc.processed_signatures,
      createdAt: Number(acc.created_at)
    };
  } catch (err) {
    console.error(`[ACCOUNTS] getOrCreateAccount error for ${wallet}:`, err);
    return null;
  }
};

export const getAccount = async (wallet) => {
  try {
    const res = await pool.query("SELECT * FROM casino_accounts WHERE wallet = $1", [wallet]);
    if (res.rows.length === 0) return null;
    const acc = res.rows[0];
    return {
      ...acc,
      history: typeof acc.history === 'string' ? JSON.parse(acc.history) : acc.history,
      processedSignatures: typeof acc.processed_signatures === 'string' ? JSON.parse(acc.processed_signatures) : acc.processed_signatures,
      createdAt: Number(acc.created_at)
    };
  } catch (err) {
    console.error(`[ACCOUNTS] getAccount error for ${wallet}:`, err);
    return null;
  }
};

export const creditBalance = async (wallet, amount, signature = null) => {
  try {
    const acc = await getOrCreateAccount(wallet);
    if (!acc) return null;

    // Anti-double spend check
    if (signature && acc.processedSignatures?.includes(signature)) {
      console.warn(`[ACCOUNTS] Signature ${signature} already processed for ${wallet.slice(0, 6)}`);
      return acc;
    }

    const newBalance = Math.round((acc.balance + amount) * 1e9) / 1e9;
    const newSigs = signature ? [...acc.processedSignatures, signature] : acc.processedSignatures;

    await pool.query(
      "UPDATE casino_accounts SET balance = $1, processed_signatures = $2 WHERE wallet = $3",
      [newBalance, JSON.stringify(newSigs), wallet]
    );

    console.log(`[ACCOUNTS] Credit ${wallet.slice(0, 6)}: +${amount} SOL → ${newBalance} SOL`);
    return { ...acc, balance: newBalance, processedSignatures: newSigs };
  } catch (err) {
    console.error(`[ACCOUNTS] creditBalance error for ${wallet}:`, err);
    return null;
  }
};

export const debitBalance = async (wallet, amount) => {
  try {
    const acc = await getAccount(wallet);
    if (!acc || acc.balance < amount - 0.000001) {
      console.log(`[ACCOUNTS] Debit FAILED ${wallet?.slice(0, 6)}: need ${amount}, have ${acc?.balance ?? 0}`);
      return false;
    }

    const newBalance = Math.max(0, Math.round((acc.balance - amount) * 1e9) / 1e9);
    await pool.query("UPDATE casino_accounts SET balance = $1 WHERE wallet = $2", [newBalance, wallet]);
    
    console.log(`[ACCOUNTS] Debit ${wallet.slice(0, 6)}: -${amount} SOL → ${newBalance} SOL`);
    return { ...acc, balance: newBalance };
  } catch (err) {
    console.error(`[ACCOUNTS] debitBalance error for ${wallet}:`, err);
    return false;
  }
};

export const hasBalance = async (wallet, amount) => {
  const acc = await getAccount(wallet);
  if (!acc) return false;
  return acc.balance >= amount - 0.000001;
};

export const addBetHistory = async (wallet, entry) => {
  try {
    const acc = await getAccount(wallet);
    if (!acc) return;
    
    const newHistory = [{ ...entry, timestamp: Date.now() }, ...acc.history].slice(0, 20);
    await pool.query("UPDATE casino_accounts SET history = $1 WHERE wallet = $2", [JSON.stringify(newHistory), wallet]);
  } catch (err) {
    console.error(`[ACCOUNTS] addBetHistory error for ${wallet}:`, err);
  }
};
