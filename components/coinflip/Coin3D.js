'use client';

import { useEffect, useState, useRef } from 'react';

export default function Coin3D({ selectedSide = 'HEADS', isFlipping = false, result = null }) {
  const [rotation, setRotation] = useState(0);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
        setRotation(selectedSide === 'HEADS' ? 0 : 180);
        isInitialMount.current = false;
        return;
    }

    if (isFlipping && result) {
        // FLIPPING!
        const spins = 10; // Fixed number of full spins for consistency
        let newRotation = rotation + (spins * 360);
        
        // Ensure it lands on the result side
        // Current modulo of rotation + spins*360 is still the same as rotation
        const currentMod = newRotation % 360;
        const targetMod = result === 'HEADS' ? 0 : 180;
        
        // If currentMod is not targetMod, add/subtract 180
        if (currentMod !== targetMod) {
            newRotation += 180;
        }
        
        setRotation(newRotation);
    } else if (!isFlipping && !result) {
        // Reset or Selection Change
        // Snap to the selected side if not flipping and no result is locked
        const targetMod = selectedSide === 'HEADS' ? 0 : 180;
        const currentMod = rotation % 360;
        
        if (currentMod !== targetMod) {
           setRotation(rotation + 180);
        }
    }
  }, [selectedSide, isFlipping, result]);

  return (
    <div className="w-44 h-44 md:w-56 md:h-56 mx-auto" style={{ perspective: '1000px' }}>
      <div 
        className="relative w-full h-full"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotation}deg)`,
          transition: isFlipping ? 'transform 1.5s cubic-bezier(0.1, 0.8, 0.2, 1)' : 'transform 0.5s ease-out'
        }}
      >
          {/* HEADS (Front Face) */}
        <div 
          className="absolute w-full h-full rounded-full border-[8px] border-[#798CAE] bg-[#AEBFE0] shadow-inner flex items-center justify-center overflow-hidden"
          style={{ transform: 'translateZ(5px)', backfaceVisibility: 'hidden' }}
        >
          <img 
            src="/veltro-casino-nobg.png" 
            alt="VeltroCasino Logo" 
            className="w-3/4 h-3/4 object-contain opacity-80" 
          />
        </div>

        {/* CYLINDER EDGES for 10px Thickness */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div 
            key={`edge-${i}`}
            className="absolute w-full h-full rounded-full border-[8px] border-[#6b7b9e] bg-[#90A1C3]" 
            style={{ transform: `translateZ(${4 - i}px)` }} 
          />
        ))}

        {/* TAILS (Back Face) */}
        <div 
          className="absolute w-full h-full rounded-full border-[8px] border-[#798CAE] bg-[#AEBFE0] shadow-inner flex items-center justify-center overflow-hidden"
          style={{ 
            transform: 'translateZ(-5px) rotateX(180deg)',
            backfaceVisibility: 'hidden' 
          }}
        >
          <img 
            src="/sol-logo.png" 
            alt="Solana Logo" 
            className="w-[50%] h-[50%] object-contain drop-shadow-md" 
          />
        </div>
      </div>
    </div>
  );
}
