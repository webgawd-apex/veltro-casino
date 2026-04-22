'use client';

import { useState, useEffect } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import { socket } from "../lib/socket.js";

export default function BetPanel({ status, multiplier = 1.0, players = [] }) {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState("0.1");
  const [autoCashout, setAutoCashout] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [casinoBalance, setCasinoBalance] = useState(0);

  const walletStr = publicKey?.toBase58() ?? '';

  // Subscribe to casino account updates
  useEffect(() => {
    if (!publicKey) { setCasinoBalance(0); return; }
    socket.emit('getAccount', walletStr);

    const handleAccountUpdate = (data) => {
      if (data?.wallet === walletStr) setCasinoBalance(data.balance ?? 0);
    };
    socket.on('accountUpdate', handleAccountUpdate);
    return () => socket.off('accountUpdate', handleAccountUpdate);
  }, [publicKey, walletStr]);

  const activeUserBet = players.find(p => p.wallet === walletStr);
  const isActivelyPlaying = activeUserBet && activeUserBet.status === 'playing';

  const parsedAmount = parseFloat(amount) || 0;
  const isInsufficient = publicKey && parsedAmount > 0 && casinoBalance < parsedAmount;

  const setAmountValue = (val) => setAmount(val.toFixed(2));

  const handleCashOut = () => {
    if (status !== 'RUNNING' || !publicKey) return;
    socket.emit("cashOut", walletStr);
  };

  const handlePlaceBet = () => {
    if (!publicKey) {
      alert("Please connect your wallet first!");
      return;
    }
    if (status !== 'BETTING') {
      alert("Game has started, please wait for the next round!");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Invalid bet amount.");
      return;
    }
    if (isInsufficient) {
      alert("Insufficient casino balance. Please deposit via your profile.");
      return;
    }

    let parsedCashout = undefined;
    if (autoCashout !== "") {
      parsedCashout = parseFloat(autoCashout);
      if (isNaN(parsedCashout) || parsedCashout <= 1.0) {
        alert("Invalid auto cashout. Must be greater than 1.00x");
        return;
      }
    }

    setIsLoading(true);
    socket.emit("placeBet", {
      publicKey: walletStr,
      amount: parsedAmount,
      target: parsedCashout
    });
    // Reset loading after short delay (server responds instantly)
    setTimeout(() => setIsLoading(false), 800);
  };

  // Determine bet button state
  const betButtonDisabled = isLoading || status !== 'BETTING' || isActivelyPlaying || isInsufficient;
  const betButtonClass = isInsufficient
    ? 'from-rose-900 to-rose-800 opacity-80 cursor-not-allowed'
    : isActivelyPlaying
    ? 'grayscale opacity-75 cursor-default'
    : 'hover:from-purple-500 hover:to-indigo-500';

  const betButtonLabel = isLoading
    ? "PLACING BET..."
    : isActivelyPlaying
    ? "BET PLACED"
    : isInsufficient
    ? "INSUFFICIENT BALANCE"
    : status !== 'BETTING'
    ? "WAIT FOR NEXT ROUND"
    : "PLACE BET";

  return (
    <div className="w-full lg:w-96 flex flex-col gap-4 lg:gap-8 p-4 lg:p-8 glass border-r border-white/5 shadow-2xl">
      <div className="space-y-4 lg:space-y-6">
        {/* Mobile Casino Balance */}
        <div className="md:hidden flex justify-between items-center px-4 py-3 bg-black/40 border border-white/5 rounded-2xl shadow-inner">
          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Casino Balance</span>
          <span className={`text-sm font-black font-mono ${casinoBalance > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {publicKey ? casinoBalance.toFixed(4) : "0.0000"} SOL
          </span>
        </div>

        {/* Insufficient balance warning */}
        {isInsufficient && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <span className="text-rose-400 text-xs">⚠</span>
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">
              Deposit via your profile to play
            </span>
          </div>
        )}

        <label className="text-xs font-black uppercase text-zinc-500 tracking-[0.2em] flex items-center gap-2">
          <div className="w-1 h-3 bg-purple-500 rounded-full" />
          Amount to Wager
        </label>
        <div className="relative group">
          <input
            type="number"
            id="bet-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isLoading || isActivelyPlaying}
            className="w-full h-11 lg:h-16 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl text-base lg:text-2xl font-black text-white font-mono transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50 group-hover:border-white/20 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <span className="text-sm font-bold text-zinc-400">SOL</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button disabled={isLoading || isActivelyPlaying} onClick={() => setAmountValue(Math.max(0.01, parseFloat(amount) / 2))} className="h-8 lg:h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">1/2</button>
          <button disabled={isLoading || isActivelyPlaying} onClick={() => setAmountValue(parseFloat(amount) * 2)} className="h-8 lg:h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">2x</button>
          <button disabled={isLoading || isActivelyPlaying} onClick={() => setAmountValue(casinoBalance)} className="h-8 lg:h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">MAX</button>
          <button disabled={isLoading || isActivelyPlaying} onClick={() => setAmountValue(0.01)} className="h-8 lg:h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">MIN</button>
        </div>
      </div>

      <div className="space-y-4 lg:space-y-6 pt-4 border-t border-white/5">
        <label className="text-xs font-black uppercase text-zinc-500 tracking-[0.2em] flex items-center gap-2">
          <div className="w-1 h-3 bg-indigo-500 rounded-full" />
          Auto Cashout
        </label>
        <div className="relative group">
          <input
            type="number"
            id="auto-cashout"
            value={autoCashout}
            onChange={(e) => setAutoCashout(e.target.value)}
            disabled={isLoading || isActivelyPlaying}
            className="w-full h-11 lg:h-16 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl text-base lg:text-2xl font-black text-white font-mono transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 group-hover:border-white/20 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0.00"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <span className="text-sm font-bold text-zinc-400 font-mono">X</span>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest text-center mt-2">Leave blank for manual cashout only</p>
      </div>

      {isActivelyPlaying && status === 'RUNNING' ? (
        <button
          id="cashout-button"
          onClick={handleCashOut}
          className="group mt-auto w-full h-14 lg:h-20 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-base lg:text-xl tracking-[0.1em] rounded-2xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl flex items-center justify-center gap-3"
        >
          {`CASH OUT ${(activeUserBet.amount * multiplier).toFixed(4)} SOL`}
        </button>
      ) : (
        <button
          id="bet-button"
          onClick={handlePlaceBet}
          disabled={betButtonDisabled}
          className={`group mt-auto w-full h-14 lg:h-20 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-base lg:text-xl tracking-[0.1em] rounded-2xl transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-3 disabled:pointer-events-none ${betButtonClass}`}
        >
          {betButtonLabel}
          {!isLoading && !isActivelyPlaying && !isInsufficient && status === 'BETTING' && (
            <svg className="w-6 h-6 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
