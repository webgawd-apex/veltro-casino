'use client';

export default function PlayerList({ players = [] }) {
  const totalPooled = players.reduce((acc, p) => acc + (p.amount || 0), 0);

  return (
    <div className="w-full h-full flex flex-col glass border-white/5 overflow-hidden border-l border-t lg:border-t-0">
      <div className="p-4 border-b border-white/5 bg-white/2">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
          <span>Active Players</span>
          <span className="text-purple-500 font-mono">{players.length} in round</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-white/5">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Bet</th>
              <th className="px-4 py-3 font-medium text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {players.length === 0 && (
              <tr>
                <td colSpan="3" className="px-4 py-8 text-center text-[10px] font-black text-zinc-800 uppercase tracking-widest">
                  No active bets
                </td>
              </tr>
            )}
            {players.map((p, i) => (
              <tr key={i} className="group hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-xs font-mono font-bold text-zinc-400 group-hover:text-white transition-colors uppercase">
                  {p.wallet ? `${p.wallet.slice(0, 4)}...${p.wallet.slice(-4)}` : 'Anonymous'}
                </td>
                <td className="px-4 py-3 text-xs font-black text-zinc-300">
                  {(p.amount || 0).toFixed(2)} <span className="text-[10px] text-zinc-600">SOL</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {p.status === 'cashed' ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-emerald-500 uppercase leading-none">{p.multiplier?.toFixed(2)}x</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 leading-tight">+{(p.profit || 0).toFixed(2)}</span>
                    </div>
                  ) : p.status === 'busted' ? (
                    <div className="flex flex-col items-end opacity-50">
                      <span className="text-[10px] font-black text-red-500 uppercase leading-none">Bust</span>
                      <span className="text-xs font-mono font-bold text-red-500 leading-tight">-{(p.amount || 0).toFixed(2)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-end items-center gap-2">
                       <span className="text-[10px] font-black text-zinc-600 uppercase">Playing</span>
                       <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer / Total Volume */}
      <div className="p-4 bg-zinc-950/50 border-t border-white/5">
        <div className="flex justify-between items-center px-2">
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none">Total Pooled</span>
          <span className="text-sm font-mono font-black text-white leading-none">{totalPooled.toFixed(2)} SOL</span>
        </div>
      </div>
    </div>
  );
}
