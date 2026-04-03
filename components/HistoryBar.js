'use client';

export default function HistoryBar({ history = [] }) {
  const getType = (val) => {
    if (val < 2) return 'low';
    if (val < 10) return 'mid';
    if (val < 100) return 'high';
    return 'legendary';
  };

  const getColor = (val) => {
    const type = getType(val);
    switch (type) {
      case 'low': return 'text-zinc-400 border-white/5 bg-white/5';
      case 'mid': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
      case 'high': return 'text-purple-400 border-purple-500/20 bg-purple-500/5 shadow-purple-500/10';
      case 'legendary': return 'text-amber-400 border-amber-500/20 bg-amber-500/5 shadow-amber-500/20 animate-pulse';
      default: return 'text-white border-white/10 bg-white/5';
    }
  };

  return (
    <div className="w-full flex items-center gap-2 p-3 glass border-b border-white/5 overflow-x-auto no-scrollbar scroll-smooth">
      <div className="flex items-center gap-2 px-3 border-r border-white/10 mr-2">
        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none">History</span>
      </div>
      {history.length === 0 && (
        <span className="text-[10px] font-black text-zinc-800 uppercase tracking-widest">Waiting for rounds...</span>
      )}
      {history.map((val, i) => (
        <div 
          key={i} 
          className={`flex-shrink-0 px-4 py-1.5 rounded-full border text-xs font-black font-mono transition-all transform hover:scale-110 cursor-pointer shadow-lg ${getColor(val)}`}
        >
          {val.toFixed(2)}x
        </div>
      ))}
    </div>
  );
}
