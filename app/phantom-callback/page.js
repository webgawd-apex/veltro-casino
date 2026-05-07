'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { STORAGE_KEYS } from '../../lib/useMobileWallet';

/**
 * /phantom-callback
 *
 * Phantom redirects here after the user approves the deep link connect.
 * URL params:
 *   phantom_encryption_public_key — Phantom's ephemeral public key (base58)
 *   data                          — encrypted payload (base58)
 *   nonce                         — nonce for the box (base58)
 *   errorCode / errorMessage      — present if user rejected
 *
 * We decrypt using the dapp secret key stored in localStorage and
 * extract the user's Solana public key, then store it and redirect back.
 */
export default function PhantomCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('Verifying connection...');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);

    // User rejected in Phantom
    const errorCode = params.get('errorCode');
    if (errorCode) {
      const msg = params.get('errorMessage') || 'Connection rejected.';
      setError(msg);
      setTimeout(() => router.replace('/'), 3000);
      return;
    }

    const phantomEncPubkeyB58 = params.get('phantom_encryption_public_key');
    const dataB58 = params.get('data');
    const nonceB58 = params.get('nonce');

    if (!phantomEncPubkeyB58 || !dataB58 || !nonceB58) {
      setError('Invalid callback — missing parameters.');
      setTimeout(() => router.replace('/'), 3000);
      return;
    }

    try {
      // Retrieve the dapp secret key we generated before the redirect
      const storedSecret = localStorage.getItem(STORAGE_KEYS.DAPP_SECRET);
      if (!storedSecret) throw new Error('No dapp keypair found. Please try connecting again.');

      const dappSecretKey = bs58.decode(storedSecret);
      const phantomEncPubkey = bs58.decode(phantomEncPubkeyB58);
      const encryptedData = bs58.decode(dataB58);
      const nonce = bs58.decode(nonceB58);

      // Decrypt using NaCl box (X25519 Diffie-Hellman + XSalsa20-Poly1305)
      const sharedSecret = nacl.box.before(phantomEncPubkey, dappSecretKey);
      const decryptedBytes = nacl.box.open.after(encryptedData, nonce, sharedSecret);

      if (!decryptedBytes) throw new Error('Decryption failed — invalid data.');

      const payload = JSON.parse(new TextDecoder().decode(decryptedBytes));
      const { public_key: publicKeyStr, session } = payload;

      if (!publicKeyStr) throw new Error('No public key in payload.');

      // Validate it's a real Solana public key
      new PublicKey(publicKeyStr);

      // Persist the wallet address and session token
      localStorage.setItem(STORAGE_KEYS.WALLET, publicKeyStr);
      if (session) localStorage.setItem('veltro_phantom_session', session);

      setStatus('Connected! Redirecting...');

      // Return to the page the user was on, or fall back to home
      const returnPath = localStorage.getItem(STORAGE_KEYS.RETURN_PATH) || '/';
      setTimeout(() => router.replace(returnPath), 800);

    } catch (err) {
      console.error('[PHANTOM CALLBACK]', err);
      setError(err.message || 'Connection failed. Please try again.');
      setTimeout(() => router.replace('/'), 4000);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-xs">

        {/* Animated logo mark */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-purple-900/50 ring-2 ring-purple-500/30">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {error ? (
          <>
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="text-rose-400 font-black text-sm uppercase tracking-widest mb-1">Connection Failed</p>
              <p className="text-zinc-500 text-xs">{error}</p>
              <p className="text-zinc-700 text-[10px] mt-2">Redirecting you back...</p>
            </div>
          </>
        ) : (
          <>
            <svg className="animate-spin w-8 h-8 text-purple-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-widest mb-1">VeltroCasino</p>
              <p className="text-zinc-400 text-xs">{status}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
