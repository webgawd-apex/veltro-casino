import prisma from './prisma.js';

export const getOrCreateAccount = async (wallet) => {
  try {
    let user = await prisma.user.findUnique({
      where: { wallet },
      include: { history: { take: 20, orderBy: { timestamp: 'desc' } } }
    });

    if (!user) {
      user = await prisma.user.create({
        data: { wallet, balance: 0 },
        include: { history: true }
      });
      console.log(`[ACCOUNTS] New DB account created: ${wallet.slice(0, 6)}`);
    }
    return user;
  } catch (err) {
    console.error("[ACCOUNTS] Error in getOrCreateAccount:", err);
    return null;
  }
};

export const getAccount = async (wallet) => {
  return await prisma.user.findUnique({
    where: { wallet },
    include: { history: { take: 20, orderBy: { timestamp: 'desc' } } }
  });
};

export const creditBalance = async (wallet, amount, signature = null) => {
  try {
    const user = await getOrCreateAccount(wallet);
    
    // Anti-double spend check
    if (signature && user.processedSignatures.includes(signature)) {
      console.warn(`[ACCOUNTS] Signature ${signature} already processed for ${wallet.slice(0, 6)}`);
      return user;
    }

    const updatedUser = await prisma.user.update({
      where: { wallet },
      data: {
        balance: { increment: amount },
        processedSignatures: signature ? { push: signature } : undefined
      },
      include: { history: { take: 20, orderBy: { timestamp: 'desc' } } }
    });

    console.log(`[ACCOUNTS] Credit ${wallet.slice(0, 6)}: +${amount} SOL → ${updatedUser.balance} SOL`);
    return updatedUser;
  } catch (err) {
    console.error("[ACCOUNTS] Credit failed:", err);
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

    const updatedUser = await prisma.user.update({
      where: { wallet },
      data: {
        balance: { decrement: amount }
      },
      include: { history: { take: 20, orderBy: { timestamp: 'desc' } } }
    });

    console.log(`[ACCOUNTS] Debit ${wallet.slice(0, 6)}: -${amount} SOL → ${updatedUser.balance} SOL`);
    return updatedUser;
  } catch (err) {
    console.error("[ACCOUNTS] Debit failed:", err);
    return null;
  }
};

export const hasBalance = async (wallet, amount) => {
  const user = await prisma.user.findUnique({ where: { wallet } });
  if (!user) return false;
  return user.balance >= amount - 0.000001;
};

export const addBetHistory = async (wallet, entry) => {
  try {
    const user = await getAccount(wallet);
    if (!user) return;

    await prisma.bet.create({
      data: {
        userId: user.id,
        game: entry.game,
        multiplier: entry.multiplier,
        profit: entry.profit,
        amount: entry.amount
      }
    });
  } catch (err) {
    console.error("[ACCOUNTS] History save failed:", err);
  }
};
