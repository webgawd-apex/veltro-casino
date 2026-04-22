// In-memory casino accounts store — keyed by wallet address
let accounts = {};

export const getOrCreateAccount = (wallet) => {
  if (!accounts[wallet]) {
    accounts[wallet] = {
      wallet,
      balance: 0,
      history: [],
      createdAt: Date.now()
    };
    console.log(`[ACCOUNTS] New account created: ${wallet.slice(0, 6)}`);
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
  return { ...accounts[wallet] };
};

export const hasBalance = (wallet, amount) => {
  return !!(accounts[wallet] && accounts[wallet].balance >= amount - 0.000001);
};

export const addBetHistory = (wallet, entry) => {
  if (!accounts[wallet]) return;
  accounts[wallet].history.unshift({ ...entry, timestamp: Date.now() });
  if (accounts[wallet].history.length > 20) accounts[wallet].history.pop();
};
