'use client';

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileDrawer from "./ProfileDrawer";
import { socket } from "../lib/socket";

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
);

const AVATAR_GRADIENTS = [
  'from-purple-600 to-indigo-600',
  'from-cyan-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
];

export default function Header() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState(0);
  const [casinoBalance, setCasinoBalance] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const walletStr = publicKey?.toBase58() ?? '';
  const playerId = walletStr.slice(0, 6).toUpperCase();
  const colorIndex = walletStr ? walletStr.charCodeAt(0) % AVATAR_GRADIENTS.length : 0;
  const avatarGradient = AVATAR_GRADIENTS[colorIndex];

  // On-chain wallet balance (shown in desktop nav)
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
    const id = connection.onAccountChange(publicKey, (account) => {
      setBalance(account.lamports / LAMPORTS_PER_SOL);
    });
    return () => connection.removeAccountChangeListener(id);
  }, [connection, publicKey]);

  // Casino balance from socket
  useEffect(() => {
    if (!publicKey) { setCasinoBalance(0); return; }
    socket.emit('getAccount', walletStr);
    const handleAccountUpdate = (data) => {
      if (data?.wallet === walletStr) setCasinoBalance(data.balance ?? 0);
    };
    socket.on('accountUpdate', handleAccountUpdate);
    return () => socket.off('accountUpdate', handleAccountUpdate);
  }, [publicKey, walletStr]);

  return (
    <>
      <div className="sticky top-0 z-50 flex flex-col w-full shadow-2xl">
        <header className="glass border-b border-white/5 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between relative z-20">
          {/* Logo */}
          <div className="flex items-center gap-2 md:gap-3 lg:w-1/3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-purple-500/20">
              <img src="/logo.png" alt="VeltroCasino Logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tighter uppercase italic">
              VELTRO<span className="text-purple-500">CASINO</span>
            </span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex flex-1 justify-center gap-6 border border-white/5 bg-black/40 rounded-full px-6 py-2 shadow-inner">
            <Link
              href="/crash"
              className={`text-sm tracking-widest uppercase font-black transition-all duration-300 ${pathname?.includes('/crash') || pathname === '/' ? 'text-purple-400 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Crash
            </Link>
            <Link
              href="/coinflip"
              className={`text-sm tracking-widest uppercase font-black transition-all duration-300 ${pathname?.includes('/coinflip') ? 'text-purple-400 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Coinflip
            </Link>
          </nav>

          {/* Right: Balance + Wallet/Avatar */}
          <div className="flex items-center justify-end gap-3 md:gap-5 lg:w-1/3">
            {/* Desktop casino balance */}
            {publicKey && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold">Casino</span>
                <span className="text-base font-black font-mono text-emerald-400 leading-none">
                  {casinoBalance.toFixed(4)} SOL
                </span>
              </div>
            )}

            {!publicKey && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Balance</span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  {balance.toFixed(2)} SOL
                </span>
              </div>
            )}

            <div className="relative">
              {/* When NOT connected — show wallet connect button */}
              {!publicKey && (
                <WalletMultiButton className="wallet-adapter-button-custom">
                  Connect
                </WalletMultiButton>
              )}

              {/* When connected — show profile avatar button */}
              {publicKey && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-black text-white text-sm tracking-widest shadow-lg ring-2 ring-white/10 hover:ring-white/30 hover:scale-105 transition-all active:scale-95`}
                  title={`Profile: ${playerId}`}
                >
                  {playerId.slice(0, 2)}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Navigation */}
        <nav className="md:hidden flex px-4 py-2 bg-black/60 backdrop-blur-md border-b border-white/5 shadow-inner gap-2 relative z-10">
          <Link
            href="/crash"
            className={`flex-1 py-3 text-center text-xs tracking-widest uppercase font-black transition-all duration-300 rounded-xl border ${pathname?.includes('/crash') || pathname === '/' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-[inset_0_0_15px_rgba(168,85,247,0.2)]' : 'bg-white/5 text-zinc-500 border-white/5 hover:text-zinc-300'}`}
          >
            Crash
          </Link>
          <Link
            href="/coinflip"
            className={`flex-1 py-3 text-center text-xs tracking-widest uppercase font-black transition-all duration-300 rounded-xl border ${pathname?.includes('/coinflip') ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-[inset_0_0_15px_rgba(168,85,247,0.2)]' : 'bg-white/5 text-zinc-500 border-white/5 hover:text-zinc-300'}`}
          >
            Coinflip
          </Link>
        </nav>
      </div>

      {/* Profile Drawer — rendered outside sticky wrapper */}
      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
