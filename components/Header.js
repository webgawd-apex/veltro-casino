'use client';

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

export default function Header() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!connection || !publicKey) {
      setBalance(0);
      return;
    }

    const fetchBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
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

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/5 px-6 py-4 flex items-center justify-between shadow-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tighter uppercase italic">
          HATE<span className="text-purple-500">CASINO</span>
        </span>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Balance</span>
          <span className="text-lg font-black font-mono text-emerald-400">
            {publicKey ? balance.toFixed(2) : "0.00"} SOL
          </span>
        </div>
        
        <div className="relative">
          <WalletMultiButton className="wallet-adapter-button-custom" />
        </div>
      </div>
    </header>
  );
}
