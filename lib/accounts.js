import fs from 'fs';
import path from 'path';

// Persistent storage file
const ACCOUNTS_FILE = path.join(process.cwd(), 'data', 'accounts.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
  fs.mkdirSync(path.join(process.cwd(), 'data'));
}

// In-memory casino accounts store — keyed by wallet address
let accounts = {};

// Load accounts from disk on startup
try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    accounts = JSON.parse(data);
    console.log(`[ACCOUNTS] Loaded ${Object.keys(accounts).length} accounts from disk.`);
  }
} catch (err) {
  console.error("[ACCOUNTS] Error loading accounts file:", err);
  accounts = {};
}

// Helper to save to disk
const saveAccounts = () => {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  } catch (err) {
    console.error("[ACCOUNTS] Error saving accounts file:", err);
  }
};

export const getOrCreateAccount = (wallet) => {
  if (!accounts[wallet]) {
    accounts[wallet] = {
      wallet,
      balance: 0,
      history: [],
      processedSignatures: [], // Anti-double spend
      createdAt: Date.now()
    };
    saveAccounts();
    console.log(`[ACCOUNTS] New account created: ${wallet.slice(0, 6)}`);
  }
  return { ...accounts[wallet] };
};

export const getAccount = (wallet) => {
  return accounts[wallet] ? { ...accounts[wallet] } : null;
};

export const creditBalance = (wallet, amount, signature = null) => {
  if (!accounts[wallet]) getOrCreateAccount(wallet);
  
  // Anti-double spend check
  if (signature && accounts[wallet].processedSignatures?.includes(signature)) {
    console.warn(`[ACCOUNTS] Signature ${signature} already processed for ${wallet.slice(0, 6)}`);
    return { ...accounts[wallet] };
  }

  accounts[wallet].balance = Math.round((accounts[wallet].balance + amount) * 1e9) / 1e9;
  if (signature) {
    if (!accounts[wallet].processedSignatures) accounts[wallet].processedSignatures = [];
    accounts[wallet].processedSignatures.push(signature);
  }

  saveAccounts();
  console.log(`[ACCOUNTS] Credit ${wallet.slice(0, 6)}: +${amount} SOL → ${accounts[wallet].balance} SOL`);
  return { ...accounts[wallet] };
};

export const debitBalance = (wallet, amount) => {
  if (!accounts[wallet] || accounts[wallet].balance < amount - 0.000001) {
    console.log(`[ACCOUNTS] Debit FAILED ${wallet.slice(0, 6)}: need ${amount}, have ${accounts[wallet]?.balance ?? 0}`);
    return false;
  }
  accounts[wallet].balance = Math.round((accounts[wallet].balance - amount) * 1e9) / 1e9;
  if (accounts[wallet].balance < 0) accounts[wallet].balance = 0;
  
  saveAccounts();
  console.log(`[ACCOUNTS] Debit ${wallet.slice(0, 6)}: -${amount} SOL → ${accounts[wallet].balance} SOL`);
  return { ...accounts[wallet] };
};

export const hasBalance = (wallet, amount) => {
  if (!accounts[wallet]) return false;
  return accounts[wallet].balance >= amount - 0.000001;
};

export const addBetHistory = (wallet, entry) => {
  if (!accounts[wallet]) return;
  accounts[wallet].history.unshift({ ...entry, timestamp: Date.now() });
  if (accounts[wallet].history.length > 20) accounts[wallet].history.pop();
  saveAccounts();
};
