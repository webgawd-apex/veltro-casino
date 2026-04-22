'use client';

import { useState, useEffect } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import { socket } from '../lib/socket';

export default function CoinflipControls({ choice, onChoiceChange, onFlipTrigger, isFlipping, gameState, onBetAgain }) {
  const getApiBase = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof window !== "undefined" && window.location.hostname === "localhost") return "http://localhost:10000";
    return "https://veltro-casino.onrender.com";
  };
  const apiBase = getApiBase();

  const { publicKey } = useWallet();
  const [amount, setAmount] = useState("0.1");
  const [isLoading, setIsLoading] = useState(false);
  const [casinoBalance, setCasinoBalance] = useState(0);

  const [showInsufficientLabel, setShowInsufficientLabel] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const walletStr = publicKey?.toBase58() ?? '';
  const parsedAmount = parseFloat(amount) || 0;
  const isInvalid = parsedAmount < 0.005;
  const isInsufficient = publicKey && parsedAmount > 0 && casinoBalance < parsedAmount;

  // Subscribe to casino balance
  useEffect(() => {
    if (!publicKey) { setCasinoBalance(0); return; }
    socket.emit('getAccount', walletStr);
    const handleAccountUpdate = (data) => {
      if (data?.wallet === walletStr) setCasinoBalance(data.balance ?? 0);
    };
    socket.on('accountUpdate', handleAccountUpdate);
    return () => socket.off('accountUpdate', handleAccountUpdate);
  }, [publicKey, walletStr]);

  const handlePlaceBet = async () => {
    if (!publicKey) {
      alert("Please connect your wallet first!");
      return;
    }
    if (isInvalid) {
      alert("Minimum bet is 0.005 SOL");
      return;
    }
    if (isInsufficient) {
      setShowInsufficientLabel(true);
      setShowModal(true);
      setTimeout(() => setShowInsufficientLabel(false), 3000);
      return;
    }

    try {
      setIsLoading(true);

      // No Phantom signing — balance deducted server-side
      const res = await fetch(`${apiBase}/api/coinflip/place-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletStr,
          amount: parsedAmount,
          choice,
        })
      });

      const data = await res.json();

      if (res.status === 402) {
        setShowInsufficientLabel(true);
        setShowModal(true);
        setTimeout(() => setShowInsufficientLabel(false), 3000);
        return;
      }
      if (!data.success) throw new Error(data.error || "Flip failed");

      if (onFlipTrigger) onFlipTrigger(data.result);

    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to flip. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto relative">
      {/* Insufficient Balance Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-[#050B14] border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-xs animate-in zoom-in duration-200">
            <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center mb-4 mx-auto border border-rose-500/30">
               <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
               </svg>
            </div>
            <h3 className="text-white font-black text-center text-sm uppercase tracking-widest mb-2">Insufficient Balance</h3>
            <p className="text-zinc-400 text-[10px] text-center mb-6 leading-relaxed">
              You don't have enough SOL in your in-game wallet. Deposit funds via your profile icon at the top right to continue.
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-lg border border-white/10 transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {gameState === 'RESULT' ? (
        <button
          onClick={onBetAgain}
          className="w-full h-16 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-lg tracking-[0.2em] uppercase rounded shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-95 animate-in zoom-in duration-300"
        >
          Bet Again
        </button>
      ) : (
        <>

          {/* HEADS / TAILS Segmented Control */}
          <div className={`flex bg-[#0A111C] p-[2px] rounded border border-white/5 w-48 shadow-lg transition-opacity duration-300 ${gameState === 'FLIPPING' ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
            <button
              onClick={() => onChoiceChange('HEADS')}
              disabled={isFlipping || isLoading}
              className={`flex-1 py-2 text-xs font-black tracking-widest uppercase transition-all rounded ${choice === 'HEADS' ? 'bg-[#212E46] text-[#7E9CCE] shadow-inner' : 'text-zinc-500 hover:text-zinc-400'}`}
            >
              HEADS
            </button>
            <button
              onClick={() => onChoiceChange('TAILS')}
              disabled={isFlipping || isLoading}
              className={`flex-1 py-2 text-xs font-black tracking-widest uppercase transition-all rounded ${choice === 'TAILS' ? 'bg-[#212E46] text-white shadow-inner' : 'text-zinc-500 hover:text-zinc-400'}`}
            >
              TAILS
            </button>
          </div>

          {/* Bet Amount Input */}
          <div className={`relative w-full transition-all duration-300 ${gameState === 'FLIPPING' ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}`}>
            <fieldset className={`border ${isInvalid ? 'border-rose-500/50' : 'border-[#14F195]'} rounded-md px-3 pb-2 pt-1 w-full bg-[#050B14] transition-colors duration-200`}>
              <legend className={`text-[10px] font-bold px-1 ml-2 transition-colors duration-200 ${isInvalid ? 'text-rose-500' : 'text-[#14F195]'}`}>Min 0.005</legend>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 opacity-80 border-r border-white/10 pr-3 cursor-pointer hover:opacity-100 transition-opacity">
                  <svg className={`w-4 h-4 fill-current ${isInvalid ? 'text-rose-500' : 'text-[#14F195]'}`} viewBox="0 0 398 333">
                    <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" />
                    <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
                    <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" />
                  </svg>
                  <span className="text-[8px] text-white">▼</span>
                </div>

                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLoading || isFlipping}
                  className="flex-1 bg-transparent border-none text-white font-mono text-sm focus:outline-none focus:ring-0 max-w-[80px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />

                <div className="flex items-center gap-4 text-[#A0ABC0] text-sm font-black ml-auto">
                  <button disabled={isLoading || isFlipping} onClick={() => setAmount((Math.max(0.005, parsedAmount / 2)).toFixed(3))} className="hover:text-white transition-colors">÷</button>
                  <button disabled={isLoading || isFlipping} onClick={() => setAmount((Math.max(0.005, parsedAmount - 0.1)).toFixed(3))} className="hover:text-white transition-colors">−</button>
                  <button disabled={isLoading || isFlipping} onClick={() => setAmount((parsedAmount + 0.1).toFixed(3))} className="hover:text-white transition-colors">+</button>
                  <button disabled={isLoading || isFlipping} onClick={() => setAmount((parsedAmount * 2).toFixed(3))} className="hover:text-white transition-colors">x</button>
                </div>
              </div>
            </fieldset>
          </div>

          <button
            onClick={handlePlaceBet}
            disabled={isFlipping || isLoading || isInvalid}
            className={`w-full h-12 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs tracking-[0.2em] uppercase rounded shadow-lg transition-all active:scale-95 disabled:opacity-50 ${gameState === 'FLIPPING' ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
          >
            {isLoading ? "Flipping..." : showInsufficientLabel ? "Insufficient Balance" : isFlipping ? "Flipping..." : "Flip Coin"}
          </button>
        </>
      )}
    </div>
  );
}
