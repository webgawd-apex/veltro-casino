'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { socket } from "../lib/socket.js";

const HOUSE_WALLET = new PublicKey(process.env.HOUSE_WALLET_ADDRESS || "DUmdbgs6y1j8ST7C3CFRN4dNEjeNmiPeo922MWoqtaWi");

export default function BetPanel({ status, multiplier = 1.0, players = [] }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("0.1");
  const [autoCashout, setAutoCashout] = useState("");
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

  const activeUserBet = players.find(p => p.wallet === publicKey?.toBase58());
  const isActivelyPlaying = activeUserBet && activeUserBet.status === 'playing';

  const setAmountValue = (val) => setAmount(val.toFixed(2));

  const handleCashOut = () => {
    if (status !== 'RUNNING' || !publicKey) return;
    socket.emit("cashOut", publicKey.toBase58());
  };

  const handlePlaceBet = async () => {
    if (!publicKey) {
      alert("Please connect your wallet first!");
      return;
    }

    if (status !== 'BETTING') {
      alert("Game has started, please wait for the next game to bet!");
      return;
    }

    try {
      setIsLoading(true);
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error("Invalid bet amount");

      let parsedCashout = undefined;
      if (autoCashout !== "") {
        parsedCashout = parseFloat(autoCashout);
        if (isNaN(parsedCashout) || parsedCashout <= 1.0) throw new Error("Invalid auto cashout limit");
      }

      const lamports = Math.floor(parsedAmount * LAMPORTS_PER_SOL);

      // Create transaction instructions
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

      // Request Phantom pop-up to sign and send the transaction
      const signature = await sendTransaction(transaction, connection);
      console.log(`Transaction submitted! Signature: ${signature}`);
      
      socket.emit("placeBet", {
        signature,
        publicKey: publicKey.toBase58(),
        amount: parsedAmount,
        target: parsedCashout
      });

    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to place bet. Did you reject the transaction?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full lg:w-96 flex flex-col gap-8 p-8 glass border-r border-white/5 shadow-2xl">
      <div className="space-y-6">
        <div className="md:hidden flex justify-between items-center px-4 py-3 bg-black/40 border border-white/5 rounded-2xl shadow-inner">
          <span className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em]">Wallet Balance</span>
          <span className="text-sm font-black font-mono text-emerald-400">{publicKey ? balance.toFixed(2) : "0.00"} SOL</span>
        </div>
        
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
            disabled={isLoading}
            className="w-full h-16 bg-white/5 border border-white/10 p-5 rounded-2xl text-2xl font-black text-white font-mono transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50 group-hover:border-white/20 disabled:opacity-50" 
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <span className="text-sm font-bold text-zinc-400">SOL</span>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          <button disabled={isLoading} onClick={() => setAmountValue(Math.max(0.01, parseFloat(amount)/2))} className="h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">1/2</button>
          <button disabled={isLoading} onClick={() => setAmountValue(parseFloat(amount)*2)} className="h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">2x</button>
          <button disabled={isLoading} onClick={() => setAmountValue(100)} className="h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">MAX</button>
          <button disabled={isLoading} onClick={() => setAmountValue(0.01)} className="h-10 text-xs font-black bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/5 rounded-xl transition-all active:scale-95 uppercase tracking-tighter disabled:opacity-50">MIN</button>
        </div>
      </div>
      
      <div className="space-y-6 pt-4 border-t border-white/5">
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
            disabled={isLoading}
            className="w-full h-16 bg-white/5 border border-white/10 p-5 rounded-2xl text-2xl font-black text-white font-mono transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 group-hover:border-white/20 disabled:opacity-50" 
            placeholder="Manual"
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
          disabled={isLoading}
          className="group mt-auto w-full h-20 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-xl tracking-[0.1em] rounded-2xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl flex items-center justify-center gap-3"
        >
          {`CASH OUT ${(activeUserBet.amount * multiplier).toFixed(2)} SOL`}
        </button>
      ) : (
        <button 
          id="bet-button" 
          onClick={handlePlaceBet}
          disabled={isLoading || status !== 'BETTING' || isActivelyPlaying}
          className="group mt-auto w-full h-20 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xl tracking-[0.1em] rounded-2xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl flex items-center justify-center gap-3 disabled:opacity-75 disabled:pointer-events-none"
        >
          {isLoading ? "WAITING FOR WALLET..." : status !== 'BETTING' ? "WAIT FOR NEXT ROUND" : "PLACE BET"}
          {!isLoading && status === 'BETTING' && (
            <svg className="w-6 h-6 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
