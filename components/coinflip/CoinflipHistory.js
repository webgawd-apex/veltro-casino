'use client';

export default function CoinflipHistory({ history = [] }) {
  return (
    <div className="w-full h-12 border-b border-white/5 bg-black/40 flex items-center px-4 overflow-x-auto no-scrollbar gap-2 shrink-0">
      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mr-2 flex-shrink-0">History</span>
      {history.map((result, i) => (
         <div key={i} className={`flex-shrink-0 px-3 py-1 rounded-md text-[10px] font-black tracking-widest border uppercase ${
            result === 'HEADS' 
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
              : 'bg-red-500/10 text-red-400 border-red-500/30'
         }`}>
           {result}
         </div>
      ))}
      {history.length === 0 && <span className="text-[10px] text-zinc-700 font-bold uppercase tracking-widest">No recent flips</span>}
    </div>
  );
}
