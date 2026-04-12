'use client';

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

export default function Header() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState(0);
  const pathname = usePathname();

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
    <div className="sticky top-0 z-50 flex flex-col w-full shadow-2xl">
      <header className="glass border-b border-white/5 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-2 md:gap-3 lg:w-1/3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-purple-500/20">
            <img src="/logo.png" alt="VeltroCasino Logo" className="w-full h-full object-cover" />
          </div>
          <span className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tighter uppercase italic">
          VELTRO<span className="text-purple-500">CASINO</span>
          </span>
        </div>
        
        <nav className="hidden md:flex flex-1 justify-center gap-6 border border-white/5 bg-black/40 rounded-full px-6 py-2 shadow-inner">
          <Link 
            href="/crash" 
            className={`text-sm tracking-widest uppercase font-black transition-all duration-300 ${
              pathname?.includes('/crash') || pathname === '/' 
                ? 'text-purple-400 scale-110' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Crash
          </Link>
          <Link 
            href="/coinflip" 
            className={`text-sm tracking-widest uppercase font-black transition-all duration-300 ${
              pathname?.includes('/coinflip') 
                ? 'text-purple-400 scale-110' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Coinflip
          </Link>
        </nav>

        <div className="flex items-center justify-end gap-4 md:gap-6 lg:w-1/3">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Balance</span>
            <span className="text-lg font-black font-mono text-emerald-400">
              {publicKey ? balance.toFixed(2) : "0.00"} SOL
            </span>
          </div>
          
          <div className="relative">
            <WalletMultiButton className="wallet-adapter-button-custom">
              {publicKey ? undefined : "Connect"}
            </WalletMultiButton>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <nav className="md:hidden flex px-4 py-2 bg-black/60 backdrop-blur-md border-b border-white/5 shadow-inner gap-2 relative z-10">
        <Link 
          href="/crash" 
          className={`flex-1 py-3 text-center text-xs tracking-widest uppercase font-black transition-all duration-300 rounded-xl border ${
            pathname?.includes('/crash') || pathname === '/' 
              ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-[inset_0_0_15px_rgba(168,85,247,0.2)]' 
              : 'bg-white/5 text-zinc-500 border-white/5 hover:text-zinc-300'
          }`}
        >
          Crash
        </Link>
        <Link 
          href="/coinflip" 
          className={`flex-1 py-3 text-center text-xs tracking-widest uppercase font-black transition-all duration-300 rounded-xl border ${
            pathname?.includes('/coinflip') 
              ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-[inset_0_0_15px_rgba(168,85,247,0.2)]' 
              : 'bg-white/5 text-zinc-500 border-white/5 hover:text-zinc-300'
          }`}
        >
          Coinflip
        </Link>
      </nav>
    </div>
  );
}
