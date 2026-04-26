import fs from 'fs';
import path from 'path';

const ACCOUNTS_FILE = path.join(process.cwd(), 'accounts.json');

// Initialize accounts from file or empty object
let accounts = {};
try {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    accounts = JSON.parse(data);
    console.log(`[ACCOUNTS] Loaded ${Object.keys(accounts).length} accounts from persistence.`);
  }
} catch (err) {
  console.error("[ACCOUNTS] Error loading accounts file:", err);
  accounts = {};
}

// Helper to save accounts to file
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
      createdAt: Date.now()
    };
    console.log(`[ACCOUNTS] New account created: ${wallet.slice(0, 6)}`);
    saveAccounts();
  }
  return { ...accounts[wallet] };
};

export const getAccount = (wallet) => {
  return accounts[wallet] ? { ...accounts[wallet] } : null;
};

export const creditBalance = (wallet, amount) => {
  if (!accounts[wallet]) getOrCreateAccount(wallet);
  accounts[wallet].balance = Math.round((accounts[wallet].balance + amount) * 1e9) / 1e9;
  console.log(`[ACCOUNTS] Credit ${wallet.slice(0, 6)}: +${amount} SOL → ${accounts[wallet].balance} SOL`);
  saveAccounts();
  return { ...accounts[wallet] };
};

export const debitBalance = (wallet, amount) => {
  if (!accounts[wallet] || accounts[wallet].balance < amount - 0.000001) {
    console.log(`[ACCOUNTS] Debit FAILED ${wallet.slice(0, 6)}: need ${amount}, have ${accounts[wallet]?.balance ?? 0}`);
    return false;
  }
  accounts[wallet].balance = Math.round((accounts[wallet].balance - amount) * 1e9) / 1e9;
  if (accounts[wallet].balance < 0) accounts[wallet].balance = 0;
  console.log(`[ACCOUNTS] Debit ${wallet.slice(0, 6)}: -${amount} SOL → ${accounts[wallet].balance} SOL`);
  saveAccounts();
  return { ...accounts[wallet] };
};

export const hasBalance = (wallet, amount) => {
  return !!(accounts[wallet] && accounts[wallet].balance >= amount - 0.000001);
};

export const addBetHistory = (wallet, entry) => {
  if (!accounts[wallet]) return;
  accounts[wallet].history.unshift({ ...entry, timestamp: Date.now() });
  if (accounts[wallet].history.length > 20) accounts[wallet].history.pop();
  saveAccounts();
};
