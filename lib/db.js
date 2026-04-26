import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialization: Create tables if they don't exist, and add missing columns
export const initDB = async () => {
  const client = await pool.connect();
  try {
    console.log("[DB] Initializing database tables and schema check...");
    
    // 1. Create Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet TEXT UNIQUE NOT NULL,
        balance DOUBLE PRECISION DEFAULT 0,
        processed_signatures TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Add missing columns to Users if they don't exist (Schema Migration)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='processed_signatures') THEN
          ALTER TABLE users ADD COLUMN processed_signatures TEXT[] DEFAULT '{}';
        END IF;
      END $$;
    `);

    // 3. Create Bets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        game TEXT NOT NULL,
        multiplier DOUBLE PRECISION,
        profit DOUBLE PRECISION NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("[DB] Database ready and schema verified.");
  } catch (err) {
    console.error("[DB] Initialization error:", err.message);
  } finally {
    client.release();
  }
};

export const query = (text, params) => pool.query(text, params);

export default pool;
