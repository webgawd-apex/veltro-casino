'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, TransactionInstruction, Keypair } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { socket } from '../lib/socket';

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const HOUSE_WALLET = new PublicKey(process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS || "Hox2okUrbq1jDXhthvCTX6hua9jZE79Mt72smevhJuGY");

// Deterministic gradient per wallet
const AVATAR_GRADIENTS = [
  'from-purple-600 to-indigo-600',
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
];

export default function ProfileDrawer({ open, onClose, mobilePublicKey, disconnectMobile, isMobile }) {
  const { publicKey: adapterPublicKey, sendTransaction, disconnect } = useWallet();
  const { connection } = useConnection();

  // Use adapter key on desktop, stored mobile key on mobile
  const publicKey = adapterPublicKey || (mobilePublicKey ? (() => { try { return { toBase58: () => mobilePublicKey }; } catch(_) { return null; } })() : null);

  const [activeTab, setActiveTab] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositStep, setDepositStep] = useState('idle'); // 'idle' | 'signing' | 'verifying'
  const [account, setAccount] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'error', text }
  const [payUrl, setPayUrl] = useState('');
  const [payReference, setPayReference] = useState(null);
  const [copied, setCopied] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [copiedManual, setCopiedManual] = useState(null); // 'address' | 'playerid' | null

  const walletStr = publicKey?.toBase58() ?? '';
  const playerId = walletStr.slice(0, 6).toUpperCase();
  const walletShort = walletStr ? `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}` : '';
  const colorIndex = walletStr ? walletStr.charCodeAt(0) % AVATAR_GRADIENTS.length : 0;
  const avatarGradient = AVATAR_GRADIENTS[colorIndex];

  const [solPrice, setSolPrice] = useState(140);
  const priceInterval = useRef(null);

  // USD estimate (Live)
  const usdEst = account ? (account.balance * solPrice).toFixed(2) : '0.00';

  // Fetch Live SOL Price from Jupiter
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
        const data = await res.json();
        const price = data.data['So11111111111111111111111111111111111111112']?.price;
        if (price) {
          setSolPrice(parseFloat(price));
          console.log(`[PRICE] Live SOL: $${parseFloat(price).toFixed(2)}`);
        }
      } catch (err) {
        console.warn("[PRICE] Failed to fetch live price, using fallback.");
      }
    };

    fetchPrice();
    priceInterval.current = setInterval(fetchPrice, 60000); // Update every minute
    return () => clearInterval(priceInterval.current);
  }, []);

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
      setStatusMsg({ type: 'success', text: `${amount} SOL deposited successfully!` });
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

  // Watch for manual transfers whenever deposit tab is open
  useEffect(() => {
    if (!open || !publicKey || activeTab !== 'deposit') return;
    // Tell backend to watch for any SOL arriving to house wallet FROM this wallet
    socket.emit('watchManualDeposit', { wallet: walletStr });
  }, [open, publicKey, walletStr, activeTab]);

  const handleDeposit = async () => {
    if (!adapterPublicKey || !sendTransaction) {
      setStatusMsg({ type: 'error', text: 'Please connect your wallet first.' });
      setTimeout(() => setStatusMsg(null), 5000);
      return;
    }
    if (!amount || parseFloat(amount) <= 0) return;
    
    setIsProcessing(true);
    setDepositStep('signing');
    
    try {
      const parsedAmount = parseFloat(amount);
      const lamportsToTransfer = Math.floor(parsedAmount * LAMPORTS_PER_SOL);
      
      // 1. Pre-flight Balance Check (Temporarily disabled for testing)
      // const currentBalance = await connection.getBalance(adapterPublicKey);
      // const estimatedFee = 10000; 
      // if (currentBalance < (lamportsToTransfer + estimatedFee)) {
      //   throw new Error("Insufficient SOL in wallet to cover the deposit and network fees.");
      // }
      
      // 2. Clean Transfer Instruction (No fake reference keys)
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: adapterPublicKey,
        toPubkey: HOUSE_WALLET,
        lamports: lamportsToTransfer,
      });
      
      // 3. Explicit Transaction Parameters for Simulator Safety
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction({
        feePayer: adapterPublicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(transferInstruction);
      
      // Tell backend to watch for transfers from this wallet specifically
      socket.emit('watchManualDeposit', { wallet: walletStr });
      
      // Request signature from wallet
      const signature = await sendTransaction(transaction, connection);
      console.log('Deposit signature:', signature);
      
      setDepositStep('verifying');
    } catch (err) {
      console.error("[DEPOSIT ERROR]", err);
      setIsProcessing(false);
      setDepositStep('idle');
      
      // Provide a clean error message to the user
      let errMsg = err.message || 'Deposit failed.';
      if (errMsg.includes('User rejected')) errMsg = 'Transaction cancelled.';
      
      setStatusMsg({ type: 'error', text: errMsg });
      setTimeout(() => setStatusMsg(null), 5000);
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
    if (isMobile && disconnectMobile) {
      disconnectMobile();
    } else {
      disconnect();
    }
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

        {/* ── Scrollable Content Wrapper ──────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          
          {/* ── Balance ─────────────────────────────────── */}
          <div className="px-6 py-5 border-b border-white/[0.06] bg-white/[0.01]">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-3">Casino Balance</p>
          <div className="flex items-end gap-2.5 mb-1">
            <span className="text-[2.5rem] leading-none font-black text-white font-mono tabular-nums">
              {account ? account.balance.toFixed(4) : '0.0000'}
            </span>
            <span className="text-emerald-400 font-black text-sm mb-1">SOL</span>
          </div>
          <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-mono">≈ ${usdEst} USD</p>
        </div>

          {statusMsg && (
            <div className={`mx-4 mt-4 px-4 py-2.5 rounded-xl text-xs font-bold text-center border ${statusMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              {statusMsg.text}
            </div>
          )}

          {/* ── Tab Bar ─────────────────────────────────── */}
          <div className="flex p-4 gap-2 border-b border-white/[0.06]">
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
          <div className="p-4 border-b border-white/[0.06]">
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
                        {activeTab === 'deposit' ? (
            <div className="space-y-4">
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 shadow-2xl space-y-4">
                <div className="space-y-3">
                  <p className="text-[10px] text-zinc-400 leading-relaxed font-medium">
                    To deposit, send SOL from your wallet to the address below. Your balance will update automatically within ~15 seconds.
                  </p>
                  
                  {/* House wallet address */}
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest mb-1.5">Recipient Address (Copy this)</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-mono text-white/70 truncate">{HOUSE_WALLET.toBase58()}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(HOUSE_WALLET.toBase58());
                          setCopiedManual('address');
                          setTimeout(() => setCopiedManual(null), 2000);
                        }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          copiedManual === 'address'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                        }`}
                      >
                        {copiedManual === 'address' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Player ID memo */}
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Player ID (Add as Memo)</p>
                      <span className="text-[8px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md font-bold uppercase tracking-tighter">Recommended</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-mono font-black text-purple-400">{playerId}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(playerId);
                          setCopiedManual('playerid');
                          setTimeout(() => setCopiedManual(null), 2000);
                        }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          copiedManual === 'playerid'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                        }`}
                      >
                        {copiedManual === 'playerid' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[8px] text-zinc-700 mt-2 leading-relaxed">
                      Including your Player ID as a **Memo** ensures your deposit is credited instantly even if you use a different wallet.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2.5 py-2 px-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-emerald-400/80 text-[10px] font-black uppercase tracking-widest animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                  Watching for your deposit...
                </div>
              </div>
              
              <div className="px-1 space-y-2">
                <p className="text-zinc-600 text-[9px] uppercase tracking-widest font-bold">Important:</p>
                <ul className="text-[8px] text-zinc-700 space-y-1 list-disc pl-3">
                  <li>Only send SOL (Solana) to this address.</li>
                  <li>Minimum deposit is 0.01 SOL.</li>
                  <li>Do not send directly from an Exchange (Binance/Coinbase) without a memo.</li>
                </ul>
              </div>
            </div>
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
        </div>

          {/* ── Bet History ──────────────────────────────── */}
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
