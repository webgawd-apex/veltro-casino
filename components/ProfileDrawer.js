'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { socket } from '../lib/socket';

const HOUSE_WALLET = new PublicKey(process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS || "DUmdbgs6y1j8ST7C3CFRN4dNEjeNmiPeo922MWoqtaWi");


// Deterministic gradient per wallet
const AVATAR_GRADIENTS = [
  'from-purple-600 to-indigo-600',
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
];

export default function ProfileDrawer({ open, onClose }) {
  const { publicKey, sendTransaction, disconnect } = useWallet();
  const { connection } = useConnection();

  const [activeTab, setActiveTab] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositStep, setDepositStep] = useState('idle'); // 'idle' | 'signing' | 'verifying'
  const [account, setAccount] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'error', text }

  const walletStr = publicKey?.toBase58() ?? '';
  const playerId = walletStr.slice(0, 6).toUpperCase();
  const walletShort = walletStr ? `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}` : '';
  const colorIndex = walletStr ? walletStr.charCodeAt(0) % AVATAR_GRADIENTS.length : 0;
  const avatarGradient = AVATAR_GRADIENTS[colorIndex];

  // USD estimate (rough)
  const usdEst = account ? (account.balance * 140).toFixed(2) : '0.00';

  // Fetch & subscribe to account updates
  useEffect(() => {
    if (!open || !publicKey) return;
    socket.emit('getAccount', walletStr);

    const handleAccountUpdate = (data) => {
      if (data?.wallet === walletStr) setAccount(data);
    };
    const handleDepositPending = () => {
      setDepositStep('verifying');
    };
    const handleDepositSuccess = ({ amount }) => {
      setDepositStep('idle');
      setIsProcessing(false);
      setStatusMsg({ type: 'success', text: `✅ ${amount} SOL deposited successfully!` });
      setTimeout(() => setStatusMsg(null), 5000);
    };
    const handleDepositError = ({ message }) => {
      setDepositStep('idle');
      setIsProcessing(false);
      setStatusMsg({ type: 'error', text: message });
      setTimeout(() => setStatusMsg(null), 10000);
    };
    const handleWithdrawSuccess = ({ amount }) => {
      setStatusMsg({ type: 'success', text: `Withdrew ${amount} SOL to your wallet!` });
      setTimeout(() => setStatusMsg(null), 4000);
    };
    const handleWithdrawError = ({ message }) => {
      setStatusMsg({ type: 'error', text: message });
      setTimeout(() => setStatusMsg(null), 4000);
    };

    socket.on('accountUpdate', handleAccountUpdate);
    socket.on('depositPending', handleDepositPending);
    socket.on('depositSuccess', handleDepositSuccess);
    socket.on('depositError', handleDepositError);
    socket.on('withdrawSuccess', handleWithdrawSuccess);
    socket.on('withdrawError', handleWithdrawError);

    return () => {
      socket.off('accountUpdate', handleAccountUpdate);
      socket.off('depositPending', handleDepositPending);
      socket.off('depositSuccess', handleDepositSuccess);
      socket.off('depositError', handleDepositError);
      socket.off('withdrawSuccess', handleWithdrawSuccess);
      socket.off('withdrawError', handleWithdrawError);
    };
  }, [open, publicKey, walletStr]);

  const handleDeposit = async () => {
    if (!publicKey || !amount || parseFloat(amount) <= 0) return;
    setIsProcessing(true);
    setDepositStep('signing');
    try {
      const parsedAmount = parseFloat(amount);
      const lamports = Math.floor(parsedAmount * LAMPORTS_PER_SOL);

      // Explicitly fetch the latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      // Build modern Versioned Transaction to prevent Phantom serialization errors
      const instructions = [
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: HOUSE_WALLET,
          lamports,
        }),
        new TransactionInstruction({
          keys: [{ pubkey: publicKey, isSigner: true, isWritable: true }],
          programId: new PublicKey("MemoSq4gqABAX6s87rMto7As88K4NAnCty7z6i32jZq"),
          data: new TextEncoder().encode(`Veltro Casino: Deposit ${parsedAmount} SOL`),
        })
      ];

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      const signature = await sendTransaction(transaction, connection);
      // Server will emit depositPending → depositSuccess/depositError
      socket.emit('deposit', { wallet: walletStr, signature, amount: parsedAmount });
      setAmount('');
      // NOTE: isProcessing stays true until depositSuccess/depositError arrives
    } catch (err) {
      setDepositStep('idle');
      setIsProcessing(false);
      setStatusMsg({ type: 'error', text: err.message || 'Deposit failed or was rejected.' });
      setTimeout(() => setStatusMsg(null), 6000);
    }
  };

  const handleWithdraw = async () => {
    if (!publicKey || !amount || parseFloat(amount) <= 0) return;
    setIsProcessing(true);
    try {
      socket.emit('withdraw', { wallet: walletStr, amount: parseFloat(amount) });
      setAmount('');
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Withdrawal failed.' });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    onClose();
  };

  const isInsufficient = activeTab === 'withdraw' && account && parseFloat(amount) > account.balance;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[340px] bg-zinc-950 border-l border-white/[0.07] z-50 flex flex-col shadow-[−20px_0_60px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* ── Header ─────────────────────────────────── */}
        <div className="relative p-6 pb-5 border-b border-white/[0.06] flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-zinc-600 hover:text-white hover:bg-white/5 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center shadow-lg flex-shrink-0 ring-2 ring-white/10`}>
              <span className="text-white font-black text-lg tracking-tight">{playerId.slice(0, 2)}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-white font-black text-base tracking-widest font-mono">{playerId}</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full font-black uppercase tracking-widest border border-emerald-500/20">Live</span>
              </div>
              <span className="text-zinc-600 text-xs font-mono">{walletShort}</span>
            </div>
          </div>
        </div>

        {/* ── Balance ─────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex-shrink-0 bg-white/[0.01]">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-3">Casino Balance</p>
          <div className="flex items-end gap-2.5 mb-1">
            <span className="text-[2.5rem] leading-none font-black text-white font-mono tabular-nums">
              {account ? account.balance.toFixed(4) : '0.0000'}
            </span>
            <span className="text-emerald-400 font-black text-sm mb-1">SOL</span>
          </div>
          <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-mono">≈ ${usdEst} USD</p>
        </div>

        {/* ── Status Message ─────────────────────────── */}
        {statusMsg && (
          <div className={`mx-4 mt-4 px-4 py-2.5 rounded-xl text-xs font-bold text-center border flex-shrink-0 ${statusMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
            {statusMsg.text}
          </div>
        )}

        {/* ── Tab Bar ─────────────────────────────────── */}
        <div className="flex p-4 gap-2 border-b border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => { setActiveTab('deposit'); setAmount(''); }}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'deposit' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}
          >
            Deposit
          </button>
          <button
            onClick={() => { setActiveTab('withdraw'); setAmount(''); }}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'withdraw' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10'}`}
          >
            Withdraw
          </button>
        </div>

        {/* ── Action Panel ─────────────────────────────── */}
        <div className="p-4 border-b border-white/[0.06] flex-shrink-0">
          {/* Amount input */}
          <div className="relative mb-3">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={`w-full h-12 bg-white/5 border px-4 rounded-xl text-white font-mono font-bold text-lg focus:outline-none focus:ring-2 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isInsufficient ? 'border-rose-500/50 focus:ring-rose-500/30' : 'border-white/10 focus:ring-purple-500/40'}`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              {['0.1', '0.5', '1'].map(v => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="text-[9px] px-1.5 py-1 bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white rounded-lg font-bold transition-all"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* SOL label row */}
          <div className="flex justify-between items-center mb-3 px-1">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest">
              {activeTab === 'withdraw' ? 'Available' : 'Deposit amount'}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono font-bold">
              {account ? account.balance.toFixed(4) : '0.0000'} SOL
            </span>
          </div>

          {/* Insufficient warning */}
          {isInsufficient && (
            <p className="text-rose-400 text-[9px] font-black uppercase tracking-widest text-center mb-3">
              ⚠ Insufficient casino balance
            </p>
          )}

          {activeTab === 'deposit' ? (
            <button
              onClick={handleDeposit}
              disabled={isProcessing || !amount || parseFloat(amount) <= 0}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-[0.15em] rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-purple-900/20"
            >
              {depositStep === 'signing' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Waiting for signature...
                </span>
              ) : depositStep === 'verifying' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Verifying on-chain...
                </span>
              ) : 'Deposit to Casino'}
            </button>
          ) : (
            <button
              onClick={handleWithdraw}
              disabled={isProcessing || !amount || parseFloat(amount) <= 0 || isInsufficient}
              className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-[0.15em] rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-lg shadow-emerald-900/20"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Processing...
                </span>
              ) : 'Withdraw to Wallet'}
            </button>
          )}

          {activeTab === 'deposit' && (
            <p className="text-zinc-700 text-[9px] text-center mt-2 uppercase tracking-widest">One Phantom signature required</p>
          )}
        </div>

        {/* ── Bet History ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600">History</p>
          </div>

          {account?.history?.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {account.history.map((h, i) => {
                const isWin = h.profit > 0;
                const isDeposit = h.game === 'Deposit';
                const isWithdraw = h.game === 'Withdrawal';
                const icon = isDeposit ? '↓' : isWithdraw ? '↑' : isWin ? '▲' : '▼';
                const color = isDeposit ? 'text-blue-400 bg-blue-500/15 border-blue-500/20'
                  : isWithdraw ? 'text-zinc-400 bg-white/5 border-white/10'
                  : isWin ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20'
                  : 'text-rose-400 bg-rose-500/15 border-rose-500/20';
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-black flex-shrink-0 ${color}`}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white leading-none mb-0.5">{h.game}</p>
                        <p className="text-[10px] text-zinc-600 font-mono">
                          {h.multiplier ? `${h.multiplier.toFixed(2)}x` : '—'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm font-black font-mono tabular-nums ${isWin || isDeposit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isWin || isDeposit ? '+' : ''}{h.profit?.toFixed(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">No history yet</p>
              <p className="text-zinc-700 text-[9px] mt-1">Deposit and start playing to see your history</p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────── */}
        <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
          <button
            onClick={handleDisconnect}
            className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/20 transition-all"
          >
            Disconnect Wallet
          </button>
        </div>
      </div>
    </>
  );
}
