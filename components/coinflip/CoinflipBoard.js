'use client';

import ThreeCoin from './ThreeCoin';

export default function CoinflipBoard({ selectedSide, isFlipping, result, winStatus }) {
  return (
    <div className="flex flex-col items-center justify-center pt-2 pb-0 px-4 pl-[15px] lg:pl-[15px] relative z-10 w-full mb-0">
      <div className="flex flex-col items-center justify-center space-y-1 ml-[15px]">
        <ThreeCoin selectedSide={selectedSide} isFlipping={isFlipping} result={result} />
        
        {/* Dynamic Display */}
        <div className="h-16 flex items-center justify-center">
            {isFlipping && (
               <h2 className="text-3xl font-black text-zinc-500 tracking-[0.2em] uppercase animate-pulse">
                Flipping...
               </h2>
            )}
            {!isFlipping && result && (
               <h2 className={`text-3xl font-black tracking-widest uppercase animate-in zoom-in-50 fade-in duration-300 ${
                  winStatus === 'win' ? 'text-emerald-500' : winStatus === 'loss' ? 'text-rose-500' : 'text-white'
               }`}>
                 {result}
               </h2>
            )}
        </div>
      </div>
    </div>
  );
}
