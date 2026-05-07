'use client';

import dynamic from 'next/dynamic';
import { useRef, useEffect, useState } from 'react';

// --- Step 2: Dynamic Import with SSR disabled to fix buffer/hydration errors ---
const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
  loading: () => <SplineLoadingPlaceholder />,
});

/**
 * SplineCoin Component (Step 2 & 5)
 * -------------------
 * This component replaces the old CSS 3D coin with a premium Spline 3D model.
 * Now using Next.js dynamic imports to solve the "Data read, but end of buffer not reached" error.
 * 
 * @param {string} selectedSide - 'HEADS' or 'TAILS'
 * @param {boolean} isFlipping - Spin state
 * @param {string} result - Landing side
 */
export default function SplineCoin({ selectedSide = 'HEADS', isFlipping = false, result = null }) {
  const splineRef = useRef(null);
  const coinRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const animationFrameRef = useRef(null);

  // --- Step 3: Accessing the Coin Object ---
  const handleLoad = (spline) => {
    splineRef.current = spline;
    
    const coin = spline.findObjectByName('Coin') || 
                 spline.findObjectByName('coin') ||
                 spline.findObjectByName('Group');
    
    if (coin) {
      coinRef.current = coin;
      console.log("[SplineCoin] Successfully accessed coin object:", coin.name);
    } else {
      console.warn("[SplineCoin] No object named 'Coin' found. Listing available objects:");
      console.log(spline.getAllObjects());
    }

    setIsLoaded(true);
  };

  // --- Step 6-8: Animation and Logic Control ---
  useEffect(() => {
    if (!isLoaded || !coinRef.current) return;

    const coin = coinRef.current;

    // --- Step 7: Flip Animation (Multi-spin with easing) ---
    if (isFlipping) {
        const spin = () => {
           coin.rotation.y += 0.35; 
           coin.rotation.x += 0.05; // Natural wobble
           animationFrameRef.current = requestAnimationFrame(spin);
        };
        animationFrameRef.current = requestAnimationFrame(spin);
        return () => {
           if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }

    // Stop previous animation
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    // --- Step 6 & 8: Pre-selection and Result Landing ---
    const targetSide = result || selectedSide;
    const isHeads = targetSide === 'HEADS';
    
    const targetY = isHeads ? 0 : Math.PI;
    const targetX = 0;

    // Smooth Snap
    coin.rotation.y = targetY;
    coin.rotation.x = targetX;

    // Step 8: Landing precisely
    splineRef.current.emitEvent(isHeads ? 'onHeads' : 'onTails');

  }, [selectedSide, isFlipping, result, isLoaded]);

  return (
    <div className="relative w-full h-[400px] flex items-center justify-center pointer-events-auto">
      
      {/* Step 10: Subtle Background Glow */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-32 bg-purple-500/10 blur-[100px] pointer-events-none" />

      {/* The Dynamic Spline Canvas (Step 2) */}
      <div className={`w-full h-full transform-gpu transition-opacity duration-1000 ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <Spline 
          scene="https://prod.spline.design/NGHHjUAxrBbBWRan1AeIK2o2/scene.splinecode" 
          onLoad={handleLoad} 
        />
      </div>

      {/* Internal Loading Overlay (For Hydration) */}
      {!isLoaded && <SplineLoadingPlaceholder />}
    </div>
  );
}

// Separate Loading UI for cleaner Next.js hydration
function SplineLoadingPlaceholder() {
  return (
    <div className="absolute flex flex-col items-center gap-4">
       <div className="w-16 h-16 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
       <span className="text-xs font-black text-purple-400 uppercase tracking-widest animate-pulse">
          Hydrating 3D...
       </span>
    </div>
  );
}

