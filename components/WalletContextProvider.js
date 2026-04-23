'use client';

import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

export default function WalletContextProvider({ children }) {
  // Use Devnet cluster
  // Use the environment variable for the Solana RPC URL
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_RPC_URL || "https://solana-mainnet.core.chainstack.com/50d9fbef13c14089c59929338f006803", []);

  // Include Phantom wallet adapter
  const wallets = useMemo(() => [
    new PhantomWalletAdapter()
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={true}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
