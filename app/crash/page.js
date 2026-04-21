'use client';

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import BetPanel from "../../components/BetPanel";
import CrashCanvas from "../../components/CrashCanvas";
import HistoryBar from "../../components/HistoryBar";
import PlayerList from "../../components/PlayerList";
import { socket } from "../../lib/socket";

export default function Home() {
  const [gameState, setGameState] = useState({
    status: 'IDLE',
    multiplier: 1.0,
    history: [],
    players: [],
    nonce: 1
  });

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // 1. Connect and handle lifecycle
    socket.connect();

    socket.on('connect', () => {
      setConnected(true);
      console.log("[SOCKET] Connected to server");
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log("[SOCKET] Disconnected");
    });

    // 2. Listen for real-time game updates
    socket.on('gameUpdate', (newState) => {
      setGameState((prev) => ({
        ...prev,
        ...newState
      }));
    });

    socket.on('playersUpdate', (playersList) => {
      setGameState((prev) => ({
        ...prev,
        players: playersList
      }));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('gameUpdate');
      socket.off('playersUpdate');
      socket.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100 selection:bg-purple-500/30">
      <Header />

      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
        {/* Graph Area - sticky on mobile so canvas stays visible while panel scrolls */}
        <div className="flex-1 min-w-0 flex flex-col order-1 lg:order-2 sticky top-0 z-10 lg:static lg:z-auto bg-zinc-950">
          <HistoryBar history={gameState.history} />
          <div className="flex-1 p-2 lg:p-4 h-[240px] sm:h-[280px] lg:h-full lg:min-h-0">
             <CrashCanvas 
                multiplier={gameState.multiplier} 
                status={gameState.status} 
                targetStartTime={gameState.targetStartTime}
             />
          </div>
        </div>

        {/* Control Area */}
        <div className="order-2 lg:order-1 flex-shrink-0">
          <BetPanel 
            status={gameState.status} 
            multiplier={gameState.multiplier} 
            players={gameState.players} 
          />
        </div>

        {/* Players Area */}
        <div className="order-3 lg:order-3 flex-shrink-0 h-[300px] lg:h-full">
          <PlayerList players={gameState.players} />
        </div>
      </main>

      {/* Connection Indicator */}
      <div className="lg:hidden border-t border-white/5 bg-zinc-900/50 p-3">
        <div className="flex justify-between items-center px-2">
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest leading-none">Net Status: {connected ? 'Live' : 'Syncing'}</span>
          <span className={`text-xs font-mono font-black leading-none ${connected ? 'text-emerald-500' : 'text-amber-500'}`}>
            {connected ? 'CONNECTED' : 'RECONNECTING...'}
          </span>
        </div>
      </div>
    </div>
  );
}
