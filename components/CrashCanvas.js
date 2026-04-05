'use client';

import { useEffect, useRef, useState } from 'react';
import { Howl, Howler } from 'howler';

export default function CrashCanvas({ multiplier, status }) {
  const canvasRef = useRef(null);
  const rocketImg = useRef(null);
  const smokeImg = useRef(null);
  const explosionSound = useRef(null);
  const prevStatus = useRef(status);
  const crashPoint = useRef({ x: 0, y: 0 });
  const [crashProgress, setCrashProgress] = useState(0);
  const animationFrameId = useRef(null);

  const isCrashed = status === 'CRASHED';
  const isBetting = status === 'BETTING';

  // 1. Initial Asset Loading
  useEffect(() => {
    rocketImg.current = new Image();
    rocketImg.current.src = '/crash-rocket.png';
    
    smokeImg.current = new Image();
    smokeImg.current.src = '/smoke_3.png';

    // 🔊 Robust sound implementation (custom sfx)
    Howler.autoUnlock = true;
    explosionSound.current = new Howl({
      src: ['/crash-ex-sfx.mp3'],
      volume: 0.15,
      html5: false, // Local asset, use Web Audio for low-latency
      preload: true
    });

    // Helper to unlock context on first interaction
    const unlockAudio = () => {
       if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume();
       }
       window.removeEventListener('click', unlockAudio);
       window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      if (explosionSound.current) explosionSound.current.unload();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // 2. Crash Animation Controller
  useEffect(() => {
    // Detect the exact moment of crash
    if (status === 'CRASHED' && prevStatus.current !== 'CRASHED') {
      setCrashProgress(0);
      
      // Play sound perfectly
      if (explosionSound.current) {
         if (Howler.ctx.state === 'suspended') Howler.ctx.resume();
         explosionSound.current.play();
      }

      let start = null;
      const animate = (timestamp) => {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / 2000, 1); // 2 second animation
        setCrashProgress(progress);
        
        if (progress < 1) {
          animationFrameId.current = requestAnimationFrame(animate);
        }
      };
      animationFrameId.current = requestAnimationFrame(animate);
    } 

    if (status === 'BETTING') {
      setCrashProgress(0);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    }

    prevStatus.current = status;
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const drawGrid = () => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < rect.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.height);
        ctx.stroke();
      }
      for (let y = 0; y < rect.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }
    };

    const drawCurve = () => {
      if (isBetting) return;

      const margin = 60;
      const graphWidth = rect.width - margin * 2;
      const graphHeight = rect.height - margin * 2;
      const originX = margin;
      const originY = rect.height - margin;

      // Consistent progress calculation
      const xProgress = Math.min(1, (multiplier - 1) / 5); 
      const yProgress = Math.min(1, Math.log10(multiplier) / Math.log10(100));

      const getCurveY = (t) => {
        const exponentialBase = (Math.pow(1.5, t * 10) - 1) / (Math.pow(1.5, 10) - 1);
        return originY - (graphHeight * exponentialBase * yProgress);
      };

      const endX = originX + graphWidth * xProgress;
      const endY = getCurveY(xProgress);

      // Store crash point if we just crashed
      if (isCrashed && (crashPoint.current.x === 0)) {
        crashPoint.current = { x: endX, y: endY };
      }
      if (!isCrashed) {
        crashPoint.current = { x: 0, y: 0 };
      }

      // 1. Draw Gradient Fill
      const gradient = ctx.createLinearGradient(0, endY, 0, originY);
      gradient.addColorStop(0, isCrashed ? 'rgba(244, 63, 94, 0.2)' : 'rgba(147, 51, 234, 0.2)');
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * xProgress;
        ctx.lineTo(originX + graphWidth * t, getCurveY(t));
      }
      ctx.lineTo(endX, originY);
      ctx.closePath();
      ctx.fill();

      // 2. Draw the Main Line
      ctx.strokeStyle = isCrashed ? '#f43f5e' : '#9333ea';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * xProgress;
        ctx.lineTo(originX + graphWidth * t, getCurveY(t));
      }
      ctx.stroke();

      // 3. Draw Rocket/Explosion
      if (isCrashed) {
        const { x, y } = crashPoint.current;
        
        // Smoke Boom (Zooms in)
        if (smokeImg.current && smokeImg.current.complete) {
          const smokeSize = 130 * Math.min(crashProgress * 3, 1);
          const smokeOpacity = 1 - crashProgress;
          ctx.globalAlpha = smokeOpacity;
          ctx.drawImage(smokeImg.current, x - smokeSize/2, y - smokeSize/2, smokeSize, smokeSize);
          ctx.globalAlpha = 1.0;
        }

        // Tumble Rocket out of bounds
        if (rocketImg.current && rocketImg.current.complete) {
          ctx.save();
          const fallX = x + (crashProgress * 150);
          const fallY = y + (crashProgress * crashProgress * 400); 
          ctx.translate(fallX, fallY);
          ctx.rotate(crashProgress * 10); // Rapid spin
          ctx.drawImage(rocketImg.current, -25, -25, 50, 50);
          ctx.restore();
        }
      } else {
        // Normal Flight
        if (rocketImg.current && rocketImg.current.complete) {
          ctx.save();
          ctx.translate(endX, endY);
          // 🚀 Tweak: Points Up-Right correctly
          ctx.rotate(-Math.PI / 2.5); 
          ctx.drawImage(rocketImg.current, -25, -25, 50, 50);
          ctx.restore();
        } else {
          // Fallback Dot
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(endX, endY, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      drawGrid();
      drawCurve();
    };

    render();
    
    const handleResize = () => {
      const newRect = canvas.getBoundingClientRect();
      canvas.width = newRect.width * dpr;
      canvas.height = newRect.height * dpr;
      ctx.scale(dpr, dpr);
      render();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [multiplier, status, crashProgress]); 

  return (
    <div className="relative flex-1 flex flex-col bg-[#050505] overflow-hidden rounded-3xl m-2 md:m-4 border border-white/5 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
      {/* Dynamic Multiplier Display */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="flex flex-col items-center">
          {isBetting ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
               <span className="text-4xl md:text-6xl font-black text-white/20 uppercase tracking-[0.2em] mb-4">Starting...</span>
               <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 animate-progress" style={{ width: '100%' }} />
               </div>
            </div>
          ) : (
            <>
              <span className={`text-[5rem] md:text-[8rem] lg:text-[12rem] font-black leading-none tracking-tighter ${isCrashed ? 'text-rose-500' : 'text-white'}`}>
                {multiplier.toFixed(2)}<span className={`text-2xl md:text-4xl ${isCrashed ? 'text-rose-500/50' : 'text-purple-500/50'}`}>x</span>
              </span>
              <div className={`mt-2 md:mt-4 px-4 py-1.5 md:px-6 md:py-2 rounded-full border backdrop-blur-md ${isCrashed ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/5 border-white/10'}`}>
                <span className={`text-[10px] md:text-sm font-bold uppercase tracking-[0.3em] ${isCrashed ? 'text-rose-400' : 'text-zinc-500'}`}>
                  {isCrashed ? 'FROZEN' : 'Current Payout'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="w-full h-full opacity-80" />

      {/* Axis Labels */}
      <div className="absolute bottom-4 md:bottom-10 right-4 md:right-10 flex items-center gap-2 text-[10px] font-black text-zinc-700 uppercase tracking-widest">
        <span>Live Stream</span>
        <div className="w-8 h-[1px] bg-zinc-800" />
      </div>

      {/* Status Overlay */}
      <div className="absolute bottom-4 md:bottom-10 left-4 md:left-10 flex items-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${isBetting ? 'bg-amber-500/10 border-amber-500/20' : 'bg-purple-600/10 border-purple-500/20'}`}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${isBetting ? 'bg-amber-500' : 'bg-purple-500'}`} />
          <span className={`text-xs font-black uppercase tracking-widest ${isBetting ? 'text-amber-400' : 'text-purple-400'}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
