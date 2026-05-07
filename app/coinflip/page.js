'use client';

import { useState, useEffect } from "react";
import Header from "../../components/Header";
import CoinflipBoard from "../../components/coinflip/CoinflipBoard";
import CoinflipControls from "../../components/coinflip/CoinflipControls";
import CoinflipHistory from "../../components/coinflip/CoinflipHistory";
import CoinflipRain from "../../components/coinflip/CoinflipRain";
import PlayerList from "../../components/PlayerList";
import { socket } from "../../lib/socket";
import confetti from "canvas-confetti";

export default function CoinflipPage() {
  const getApiBase = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof window !== "undefined" && window.location.hostname === "localhost") return "http://localhost:10000";
    return "https://veltro-casino.onrender.com";
  };
  const apiBase = getApiBase();
  const [history, setHistory] = useState([]);
  const [players, setPlayers] = useState([]);
  
  const [choice, setChoice] = useState('HEADS');
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState(null);
  const [winStatus, setWinStatus] = useState(null); // 'win', 'loss', or null
  const [gameState, setGameState] = useState('BETTING'); // 'BETTING', 'FLIPPING', 'RESULT'

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // 1. Initial HTTP Fetch for fast history/players hydration
    fetch(`${apiBase}/api/coinflip/state`)
      .then(r => r.json())
      .then(data => {
        if (data.state) {
          setHistory(data.state.history || []);
          setPlayers(data.players || []);
        }
      })
      .catch(err => console.error("Could not fetch initial coinflip state:", err));

    // 2. Connect Socket
    socket.connect();

    socket.on('connect', () => {
      setConnected(true);
      console.log("[SOCKET] Connected to server (Coinflip)");
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log("[SOCKET] Disconnected");
    });

    // 3. Real-time Subscriptions
    socket.on('coinflip:state', (newState) => {
       if (newState.history) setHistory(newState.history);
    });

    socket.on('coinflip:players', (playersList) => {
      setPlayers(playersList);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('coinflip:state');
      socket.off('coinflip:players');
      socket.disconnect();
    };
  }, []);

  const handleBetAgain = () => {
     setGameState('BETTING');
     setFlipResult(null);
     setWinStatus(null);
     setIsFlipping(false);
  };

  return (
    <div className="flex flex-col bg-zinc-950 text-zinc-100 selection:bg-purple-500/30">
      <Header />
      
      <main className="flex-1 flex flex-col lg:flex-row relative bg-[#050912] min-h-screen">
        <div className="flex-1 flex flex-col justify-center items-center relative z-0 min-w-0 order-1 p-4 lg:p-8">
          {/* Constrained Blue Rain for loss state */}
          {gameState === 'RESULT' && winStatus === 'loss' && <CoinflipRain />}
          
          <div className="flex flex-col items-center justify-center space-y-4 max-w-[400px] w-full">
             {/* The Interactive Coin */}
             <CoinflipBoard 
                selectedSide={choice} 
                isFlipping={isFlipping}
                result={flipResult}
                winStatus={winStatus}
             />
             
             {/* Subtle layout mapped from screenshot */}
             <CoinflipControls 
                choice={choice}
                onChoiceChange={(val) => {
                   setChoice(val);
                   setFlipResult(null); 
                }}
                isFlipping={isFlipping}
                gameState={gameState}
                onBetAgain={handleBetAgain}
                onFlipTrigger={(result) => {
                   setGameState('FLIPPING');
                   setIsFlipping(true);
                   setFlipResult(result);
                   const win = choice === result;
                   
                   setTimeout(() => { 
                      setIsFlipping(false); 
                      setWinStatus(win ? 'win' : 'loss');
                      setGameState('RESULT');
                      
                      if (win) {
                         confetti({
                           particleCount: 150,
                           spread: 70,
                           origin: { y: 0.6 },
                           colors: ['#10b981', '#34d399', '#ffffff']
                         });
                      }
                   }, 1500);
                }}
             />
          </div>
        </div>

        {/* Sidebar: Players */}
        <div className="w-full lg:w-[320px] border-l border-[#1A2333] bg-[#0A111C] flex-shrink-0 z-10 order-2 flex flex-col">
          <div className="p-4 border-b border-[#1A2333]">
             <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest px-2">Active History</h3>
          </div>
          <div className="flex-1 overflow-y-auto min-h-[300px]">
             <PlayerList players={players} />
          </div>
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
