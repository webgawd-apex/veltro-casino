'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const STORAGE_KEYS = {
  WALLET: 'veltro_mobile_wallet',
  DAPP_SECRET: 'veltro_dapp_secret',
  RETURN_PATH: 'veltro_return_path',
};

/**
 * Detects if the user is on a mobile device without an injected wallet.
 * On such devices, we use Phantom's deep link API instead of the standard
 * wallet adapter popup, keeping the browser (Chrome/Safari) as the HQ.
 *
 * IMPORTANT: If window.solana is injected it means we're INSIDE Phantom's
 * in-app browser — we do NOT use the deep-link flow there, we let the
 * standard adapter handle it so the user doesn't get bounced around.
 */
function detectMobile() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(ua);
  // hasInjected = true means we're already inside a wallet's in-app browser.
  // In that case we return false — the wallet adapter handles things natively.
  const hasInjected = Boolean(window.solana || window.phantom?.solana);
  return isMobileUA && !hasInjected;
}

/**
 * Get or create the dapp keypair used for Phantom's encrypted deep link flow.
 * Stored in localStorage so it survives page refreshes and redirects.
 */
function getDappKeypair() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DAPP_SECRET);
    if (stored) {
      const secretKey = bs58.decode(stored);
      return Keypair.fromSecretKey(secretKey);
    }
  } catch (_) {
    // corrupt — regenerate
  }
  const kp = Keypair.generate();
  localStorage.setItem(STORAGE_KEYS.DAPP_SECRET, bs58.encode(kp.secretKey));
  return kp;
}

/**
 * useMobileWallet
 *
 * Returns:
 *   isMobile           — true if on mobile browser without injected wallet
 *   mobilePublicKey    — the connected wallet address (string | null)
 *   connectMobile()    — redirects to Phantom deep link connect
 *   disconnectMobile() — clears stored session
 */
export function useMobileWallet() {
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePublicKey, setMobilePublicKey] = useState(null);

  // On mount: detect environment and restore session from localStorage
  useEffect(() => {
    const mobile = detectMobile();
    setIsMobile(mobile);

    if (mobile) {
      const stored = localStorage.getItem(STORAGE_KEYS.WALLET);
      if (stored) {
        try {
          // Validate it's a real public key before trusting it
          new PublicKey(stored);
          setMobilePublicKey(stored);
        } catch (_) {
          localStorage.removeItem(STORAGE_KEYS.WALLET);
        }
      }
    }
  }, []);

  /**
   * Kick off Phantom's deep link connect flow.
   * Redirects away from the page — returns via /phantom-callback.
   */
  const connectMobile = useCallback(() => {
    if (typeof window === 'undefined') return;

    const dappKeypair = getDappKeypair();
    const dappPubkeyBase58 = bs58.encode(dappKeypair.publicKey.toBytes());

    // Remember where the user was so we can return them there
    localStorage.setItem(STORAGE_KEYS.RETURN_PATH, window.location.pathname);

    const appUrl = encodeURIComponent(window.location.origin);
    const redirectLink = encodeURIComponent(`${window.location.origin}/phantom-callback`);
    const dappEncPubkey = encodeURIComponent(dappPubkeyBase58);

    // ─────────────────────────────────────────────────────────────────────
    // CRITICAL: Use the phantom:// URI scheme, NOT https://phantom.app/ul/
    //
    // https://phantom.app/ul/ is a universal link. On some iOS/Android
    // configurations, universal links open inside Phantom's own in-app
    // browser — a completely isolated session from Chrome/Safari.
    //
    // phantom://ul/ is the native URI scheme. It tells the OS to open the
    // Phantom APP directly (not any browser). After the user approves,
    // Phantom fires the redirect_link into the system's default browser
    // (Chrome/Safari), keeping it as the permanent session HQ.
    // ─────────────────────────────────────────────────────────────────────
    const isAndroid = /Android/i.test(navigator.userAgent);

    let phantomUrl;
    if (isAndroid) {
      // Android: intent:// is the most reliable way to open Phantom natively.
      // If Phantom isn't installed, the fallback URL takes the user to the
      // Play Store so they can install it.
      const params =
        `?app_url=${appUrl}` +
        `&dapp_encryption_public_key=${dappEncPubkey}` +
        `&redirect_link=${redirectLink}` +
        `&cluster=mainnet-beta`;
      phantomUrl =
        `intent://ul/v1/connect${params}` +
        `#Intent;scheme=phantom;package=app.phantom;` +
        `S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dapp.phantom;end`;
    } else {
      // iOS: phantom:// URI scheme opens the native app directly.
      // The OS hands the redirect_link back to Safari after approval.
      phantomUrl =
        `phantom://ul/v1/connect` +
        `?app_url=${appUrl}` +
        `&dapp_encryption_public_key=${dappEncPubkey}` +
        `&redirect_link=${redirectLink}` +
        `&cluster=mainnet-beta`;
    }

    window.location.href = phantomUrl;
  }, []);

  /**
   * Clear the mobile session — equivalent to "disconnect"
   */
  const disconnectMobile = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.WALLET);
    localStorage.removeItem(STORAGE_KEYS.DAPP_SECRET);
    localStorage.removeItem(STORAGE_KEYS.RETURN_PATH);
    setMobilePublicKey(null);
  }, []);

  /**
   * Called by the phantom-callback page after successful decryption.
   * Updates state so the UI reflects the new connection immediately.
   */
  const setMobileSession = useCallback((publicKeyStr) => {
    localStorage.setItem(STORAGE_KEYS.WALLET, publicKeyStr);
    setMobilePublicKey(publicKeyStr);
  }, []);

  return { isMobile, mobilePublicKey, connectMobile, disconnectMobile, setMobileSession };
}

export { STORAGE_KEYS };
