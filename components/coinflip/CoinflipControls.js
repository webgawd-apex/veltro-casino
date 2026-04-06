'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import PlayerList from '../PlayerList';

const HOUSE_WALLET = new PublicKey(process.env.HOUSE_WALLET_ADDRESS || "DUmdbgs6y1j8ST7C3CFRN4dNEjeNmiPeo922MWoqtaWi");

export default function CoinflipControls({ choice, onChoiceChange, onFlipTrigger, isFlipping, gameState, onBetAgain, players = [] }) {
  const getApiBase = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof window !== "undefined" && window.location.hostname === "localhost") return "http://localhost:10000";
    return "https://veltro-casino.onrender.com";
  };
  const apiBase = getApiBase();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("0.1");
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!connection || !publicKey) {
      setBalance(0);
      return;
    }

    const fetchBalance = async () => {
      try {
        const bal = await connection.getBalance(publicKey);
        setBalance(bal / LAMPORTS_PER_SOL);
      } catch (e) {
        console.error("Error fetching balance:", e);
      }
    };

    fetchBalance();
    
    // Subscribe to balance changes
    const id = connection.onAccountChange(publicKey, (account) => {
      setBalance(account.lamports / LAMPORTS_PER_SOL);
    });

    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [connection, publicKey]);

  const isInvalid = parseFloat(amount) < 0.005;

  const handlePlaceBet = async () => {
    if (!publicKey) {
      alert("Please connect your wallet first!");
      return;
    }

    try {
      setIsLoading(true);
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount < 0.005) throw new Error("Minimum bet is 0.005 SOL");

      const lamports = Math.floor(parsedAmount * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: HOUSE_WALLET,
          lamports: lamports,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      console.log(`Transaction submitted! Signature: ${signature}`);
      
      const res = await fetch(`${apiBase}/api/coinflip/place-bet`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            wallet: publicKey.toBase58(),
            amount: parsedAmount,
            choice,
            signature
         })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (onFlipTrigger) onFlipTrigger(data.result);

    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to place bet. Did you reject the transaction?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm mx-auto">
      
      {gameState === 'RESULT' ? (
         <button 
           onClick={onBetAgain}
           className="w-full h-16 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-lg tracking-[0.2em] uppercase rounded shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-95 animate-in zoom-in duration-300"
         >
           Bet Again
         </button>
      ) : (
        <>
          {/* Mobile Balance */}
          <div className="md:hidden flex justify-between items-center w-full px-4 py-3 mb-2 bg-[#0A111C] border border-white/5 rounded-xl shadow-inner transition-opacity duration-300">
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Wallet Balance</span>
            <span className="text-sm font-black font-mono text-emerald-400">{publicKey ? balance.toFixed(2) : "0.00"} SOL</span>
          </div>

          {/* Segmented HEADS/TAILS */}
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

          {/* Bet Amount Input Bar */}
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
                    <button disabled={isLoading || isFlipping} onClick={() => setAmount((Math.max(0.005, parseFloat(amount)/2)).toFixed(3))} className="hover:text-white transition-colors">÷</button>
                    <button disabled={isLoading || isFlipping} onClick={() => setAmount((Math.max(0.005, parseFloat(amount)-0.1)).toFixed(3))} className="hover:text-white transition-colors">−</button>
                    <button disabled={isLoading || isFlipping} onClick={() => setAmount((parseFloat(amount)+0.1).toFixed(3))} className="hover:text-white transition-colors">+</button>
                    <button disabled={isLoading || isFlipping} onClick={() => setAmount((parseFloat(amount)*2).toFixed(3))} className="hover:text-white transition-colors">x</button>
                  </div>
              </div>
            </fieldset>
          </div>

          <button 
            onClick={handlePlaceBet}
            disabled={isFlipping || isLoading}
            className={`w-full h-12 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs tracking-[0.2em] uppercase rounded shadow-lg transition-all active:scale-95 disabled:opacity-50 ${gameState === 'FLIPPING' ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
          >
            {isLoading ? "Signing..." : isFlipping ? "Flipping..." : "Flip Coin"}
          </button>
        </>
      )}
    </div>
  );
}
