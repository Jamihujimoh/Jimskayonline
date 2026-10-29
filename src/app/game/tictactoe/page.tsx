"use client"

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  X, 
  Circle, 
  RotateCcw, 
  Trophy, 
  ArrowLeft,
  Target,
  Zap,
  ShieldAlert,
  Cpu,
  User
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Player = 'X' | 'O' | null;

export default function TicTacToePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState<Player | 'Draw'>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [score, setScore] = useState({ user: 0, ai: 0 });
  const [isAiThinking, setIsAiThinking] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const checkWinner = useCallback((squares: Player[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { player: squares[a], line: lines[i] };
      }
    }
    if (!squares.includes(null)) return { player: 'Draw' as const, line: null };
    return null;
  }, []);

  const handleAiMove = useCallback((currentBoard: Player[]) => {
    setIsAiThinking(true);
    setTimeout(() => {
      const emptySquares = currentBoard.map((sq, i) => sq === null ? i : null).filter(i => i !== null) as number[];
      if (emptySquares.length > 0 && !winner) {
        // Priority 1: Check if AI can win
        let move = -1;
        for (const idx of emptySquares) {
          const testBoard = [...currentBoard];
          testBoard[idx] = 'O';
          if (checkWinner(testBoard)?.player === 'O') {
            move = idx;
            break;
          }
        }
        // Priority 2: Block user win
        if (move === -1) {
          for (const idx of emptySquares) {
            const testBoard = [...currentBoard];
            testBoard[idx] = 'X';
            if (checkWinner(testBoard)?.player === 'X') {
              move = idx;
              break;
            }
          }
        }
        // Priority 3: Random move
        if (move === -1) {
          move = emptySquares[Math.floor(Math.random() * emptySquares.length)];
        }

        const nextBoard = [...currentBoard];
        nextBoard[move] = 'O';
        setBoard(nextBoard);
        setIsXNext(true);

        const result = checkWinner(nextBoard);
        if (result) {
          setWinner(result.player);
          setWinningLine(result.line);
          if (result.player === 'O') setScore(s => ({ ...s, ai: s.ai + 1 }));
          syncScore(result.player);
        }
      }
      setIsAiThinking(false);
    }, 600);
  }, [checkWinner, winner]);

  useEffect(() => {
    if (!isXNext && !winner && !isAiThinking) {
      handleAiMove(board);
    }
  }, [isXNext, winner, board, handleAiMove, isAiThinking]);

  const handleSquareClick = (i: number) => {
    if (board[i] || winner || !isXNext || isAiThinking) return;

    const nextBoard = [...board];
    nextBoard[i] = 'X';
    setBoard(nextBoard);
    setIsXNext(false);

    const result = checkWinner(nextBoard);
    if (result) {
      setWinner(result.player);
      setWinningLine(result.line);
      if (result.player === 'X') setScore(s => ({ ...s, user: s.user + 1 }));
      syncScore(result.player);
    }
  };

  const syncScore = async (result: Player | 'Draw') => {
    if (!user || !db || result === 'Draw') return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'game_scores'), {
        game: 'TicTacToe',
        result,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error("Score sync failed", e);
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setWinner(null);
    setWinningLine(null);
    setIsAiThinking(false);
  };

  if (isUserLoading || !user) return null;

  return (
    <div className="flex h-[100dvh] w-full app-bg overflow-hidden fixed inset-0">
      <div 
        className={`fixed inset-0 z-[60] bg-black/80 transition-opacity duration-300 md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      
      <div className={`fixed top-0 left-0 z-[70] h-full w-64 app-bg border-r border-white/5 transition-transform duration-300 transform md:relative md:translate-x-0 shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar 
          currentChatId={null} 
          onSelectChat={(id) => router.push(id ? `/chat?id=${id}` : '/chat')} 
          onClose={() => setIsSidebarOpen(false)} 
        />
      </div>

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col items-center gap-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 w-full animate-in fade-in slide-in-from-top-4 duration-700 max-w-4xl">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push('/game')}
                className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-white glow-primary">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic leading-none">
                  Tic-Tac-<span className="text-primary">Toe</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-1">
                  Strategic Matrix Breach
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
             <ScoreWidget icon={<User className="w-3.5 h-3.5" />} label="YOU" value={score.user} color="text-primary" />
             <ScoreWidget icon={<Cpu className="w-3.5 h-3.5" />} label="CORE" value={score.ai} color="text-accent" />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md gap-10">
          <div className="relative">
            {winner && (
              <div className="absolute -inset-10 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md rounded-[2.5rem] animate-in zoom-in-95 duration-500 border border-white/5">
                 <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${winner === 'X' ? 'bg-primary/20 text-primary' : winner === 'O' ? 'bg-accent/20 text-accent' : 'bg-white/10 text-white'}`}>
                   {winner === 'Draw' ? <Zap className="w-8 h-8" /> : <Trophy className="w-8 h-8" />}
                 </div>
                 <h2 className="font-serif text-2xl font-black text-white uppercase italic tracking-tighter">
                   {winner === 'Draw' ? 'Breach Neutralized' : winner === 'X' ? 'Access Granted' : 'System Locked'}
                 </h2>
                 <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-[0.3em] mt-2 mb-6">
                   {winner === 'Draw' ? 'Matrix Equilibrium' : winner === 'X' ? 'Creator Victory' : 'AI Strategic Win'}
                 </p>
                 <Button 
                   onClick={resetGame}
                   className="rounded-xl h-11 gradient-primary text-white font-black uppercase tracking-widest text-[9px] px-8 border-none glow-primary"
                 >
                   <RotateCcw className="w-4 h-4 mr-2" />
                   Reset Matrix
                 </Button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {board.map((square, i) => (
                <button
                  key={i}
                  onClick={() => handleSquareClick(i)}
                  className={`
                    w-24 h-24 md:w-32 md:h-32 rounded-2xl glass-panel border-white/5 flex items-center justify-center transition-all duration-300 group relative
                    ${winningLine?.includes(i) ? 'border-primary bg-primary/10 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : 'hover:bg-white/[0.05]'}
                    ${!square && !winner && isXNext ? 'cursor-pointer' : 'cursor-default'}
                  `}
                >
                  {square === 'X' && (
                    <X className="w-12 h-12 md:w-16 md:h-16 text-primary animate-in zoom-in duration-300 drop-shadow-[0_0_10px_rgba(168,85,247,0.7)]" />
                  )}
                  {square === 'O' && (
                    <Circle className="w-10 h-10 md:w-14 md:h-14 text-accent animate-in zoom-in duration-300 drop-shadow-[0_0_10px_rgba(255,165,0,0.5)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
             <div className="flex items-center gap-3">
               <div className={`w-2 h-2 rounded-full transition-all duration-500 ${isAiThinking ? 'bg-accent animate-pulse glow-accent' : 'bg-green-500'}`} />
               <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
                 {winner ? 'Protocol Terminated' : isAiThinking ? 'AI Analyzing Matrix...' : isXNext ? 'Your Turn: Secure a Node' : 'System Processing...'}
               </p>
             </div>
             {!winner && (
               <Button 
                variant="ghost" 
                onClick={resetGame}
                className="text-[8px] font-black text-white/20 uppercase tracking-widest hover:text-white hover:bg-white/5 mt-4"
               >
                 Abort Session
               </Button>
             )}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; TIC-TAC-TOE TERMINAL &bull; 3x3 LOGIC MATRIX &bull; AI OPPONENT ACTIVE &bull; NO BRACH DETECTED &bull;
          </span>
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; TIC-TAC-TOE TERMINAL &bull; 3x3 LOGIC MATRIX &bull; AI OPPONENT ACTIVE &bull; NO BRACH DETECTED &bull;
          </span>
        </div>
      </div>
    </div>
  );
}

function ScoreWidget({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
  return (
    <div className="glass-panel border-white/5 px-4 py-2 rounded-xl flex items-center gap-4 bg-white/[0.02]">
       <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${color}`}>{icon}</div>
       <div className="flex flex-col">
         <span className="text-[7px] font-black text-muted-foreground uppercase tracking-widest leading-none">{label}</span>
         <span className={`text-lg font-black leading-none mt-1 ${color}`}>{value}</span>
       </div>
    </div>
  );
}
