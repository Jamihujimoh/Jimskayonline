"use client"

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { collection, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Gamepad2, 
  Zap, 
  Trophy, 
  History, 
  Loader2, 
  ArrowLeft,
  ShieldAlert,
  Terminal,
  Activity,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const GRID_SIZE = 9;
const INITIAL_SEQUENCE_LENGTH = 3;

export default function JimskayBreachPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showBriefing, setShowBriefing] = useState(true);

  const [gameState, setGameState] = useState<'IDLE' | 'SHOWING' | 'PLAYING' | 'FAILED'>('IDLE');
  const [sequence, setSequence] = useState<number[]>([]);
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const scoresQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'game_scores'),
      orderBy('score', 'desc'),
      limit(5)
    );
  }, [db, user]);

  const { data: highScores } = useCollection(scoresQuery);

  const startNewGame = useCallback(() => {
    setShowBriefing(false);
    setLevel(1);
    setScore(0);
    generateNextLevel(1);
  }, []);

  const generateNextLevel = (lvl: number) => {
    const newSequence = Array.from({ length: INITIAL_SEQUENCE_LENGTH + lvl - 1 }, () => 
      Math.floor(Math.random() * GRID_SIZE)
    );
    setSequence(newSequence);
    setUserSequence([]);
    setGameState('SHOWING');
    playSequence(newSequence);
  };

  const playSequence = async (seq: number[]) => {
    for (let i = 0; i < seq.length; i++) {
      await new Promise(r => setTimeout(r, 600 - Math.min(level * 30, 400)));
      setActiveIndex(seq[i]);
      await new Promise(r => setTimeout(r, 300));
      setActiveIndex(null);
    }
    setGameState('PLAYING');
  };

  const handleNodeClick = (index: number) => {
    if (gameState !== 'PLAYING') return;

    const nextUserSeq = [...userSequence, index];
    setUserSequence(nextUserSeq);

    setActiveIndex(index);
    setTimeout(() => setActiveIndex(null), 200);

    if (index !== sequence[nextUserSeq.length - 1]) {
      handleGameOver();
      return;
    }

    if (nextUserSeq.length === sequence.length) {
      setScore(prev => prev + (level * 100));
      const nextLvl = level + 1;
      setLevel(nextLvl);
      setGameState('IDLE');
      setTimeout(() => generateNextLevel(nextLvl), 1000);
    }
  };

  const handleGameOver = async () => {
    setGameState('FAILED');
    if (!user || !db) return;

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'game_scores'), {
        score,
        level,
        timestamp: serverTimestamp(),
      });
      toast({ title: "Breach Data Vaulted" });
    } catch (e) {
      console.error("Score sync failure", e);
    } finally {
      setIsSaving(false);
    }
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

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push('/game')}
                className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/5"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white glow-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">
                  Jimskay<span className="text-primary">Breach</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">
                  Memory Replication Protocol
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
          <div className="lg:col-span-2 flex flex-col gap-6 relative">
            {showBriefing && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md rounded-[2.5rem]" />
                <Card className="relative z-10 glass-panel border-primary/20 bg-black/40 rounded-[2rem] p-8 max-w-md text-center space-y-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
                    <Info className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-serif text-xl font-black text-white uppercase tracking-tighter">Tactical Briefing</h2>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-black uppercase tracking-widest">
                      Your objective is to replicate the jimskay sequence generated by the core.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-left">
                    <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-primary font-black text-xs">01</div>
                      <p className="text-[9px] text-white/70 font-bold leading-none mt-1 uppercase tracking-widest">Wait for the sequence to complete its scan.</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-primary font-black text-xs">02</div>
                      <p className="text-[9px] text-white/70 font-bold leading-none mt-1 uppercase tracking-widest">Input the nodes in the exact order shown.</p>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-primary font-black text-xs">03</div>
                      <p className="text-[9px] text-white/70 font-bold leading-none mt-1 uppercase tracking-widest">Failure to replicate severes the link.</p>
                    </div>
                  </div>
                  <Button 
                    onClick={startNewGame}
                    className="w-full rounded-xl h-12 bg-primary text-white font-black uppercase tracking-widest text-[9px] border-none glow-primary"
                  >
                    Initiate Link
                  </Button>
                </Card>
              </div>
            )}

            <Card className="glass-panel border-white/5 rounded-[2.5rem] p-10 flex-1 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                <Zap className="w-48 h-48 text-primary" />
              </div>

              {gameState === 'IDLE' && !showBriefing ? (
                <div className="text-center space-y-6">
                  <Button 
                    onClick={startNewGame}
                    className="rounded-2xl h-14 bg-primary text-white font-black shadow-xl glow-primary text-[12px] uppercase tracking-widest px-12 border-none hover:scale-105 transition-transform"
                  >
                    Initialize Breach
                  </Button>
                </div>
              ) : gameState === 'FAILED' ? (
                <div className="text-center space-y-6 animate-in zoom-in-95 duration-500">
                  <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4 border border-destructive/20">
                    <ShieldAlert className="w-10 h-10 text-destructive" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-serif text-3xl font-black text-white tracking-tighter uppercase italic">Lockout</h2>
                    <div className="flex justify-center gap-8 my-6">
                       <div>
                         <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest mb-1">Score</p>
                         <p className="text-3xl font-black text-white">{score}</p>
                       </div>
                       <div>
                         <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest mb-1">Depth</p>
                         <p className="text-3xl font-black text-white">{level}</p>
                       </div>
                    </div>
                  </div>
                  <Button 
                    onClick={startNewGame}
                    className="rounded-2xl h-14 bg-primary text-white font-black shadow-xl glow-primary text-[10px] uppercase tracking-widest px-10 border-none"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Protocol
                  </Button>
                </div>
              ) : !showBriefing && (
                <div className="space-y-10 w-full flex flex-col items-center">
                  <div className="flex justify-between w-full max-w-sm px-4">
                    <div className="text-left">
                      <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">Score</p>
                      <p className="text-2xl font-black text-primary tabular-nums">{score}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">Sector</p>
                      <p className="text-2xl font-black text-white tabular-nums">{level}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 w-full max-w-[320px] aspect-square">
                    {Array.from({ length: GRID_SIZE }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => handleNodeClick(i)}
                        disabled={gameState !== 'PLAYING'}
                        className={`
                          relative rounded-2xl border transition-all duration-300 transform
                          ${activeIndex === i ? 'bg-primary border-primary scale-110 shadow-[0_0_30px_rgba(59,130,246,0.8)]' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.08]'}
                          aspect-square overflow-hidden cursor-pointer active:scale-95
                        `}
                      >
                        <div className={`absolute inset-0 bg-primary/10 transition-opacity ${activeIndex === i ? 'opacity-100' : 'opacity-0'}`} />
                      </button>
                    ))}
                  </div>

                  <p className={`text-[10px] font-black uppercase tracking-[0.4em] transition-all ${gameState === 'SHOWING' ? 'text-primary animate-pulse' : 'text-primary/40'}`}>
                    {gameState === 'SHOWING' ? 'Scanning...' : 'Replicating...'}
                  </p>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2 px-1">
              <Trophy className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-lg font-black text-white tracking-tighter">Leaderboard</h2>
            </div>

            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-4 pr-3">
                {highScores?.map((hs, i) => (
                  <Card key={hs.id} className="glass-panel border-white/5 rounded-2xl p-4 border-none bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center font-black text-xs text-muted-foreground/40">{i + 1}</div>
                      <div>
                        <p className="text-[10px] font-bold text-white uppercase tracking-tight">Level {hs.level}</p>
                        <p className="text-[7px] text-muted-foreground/30 font-black uppercase tracking-widest">{format(hs.timestamp?.toDate() || new Date(), 'MMM d, HH:mm')}</p>
                      </div>
                    </div>
                    <p className="text-lg font-black text-primary">{hs.score}</p>
                  </Card>
                ))}
                {!highScores?.length && (
                  <div className="py-20 text-center glass-panel rounded-2xl border-dashed border-white/5 border-2">
                    <History className="w-10 h-10 text-muted-foreground/10 mx-auto mb-4 animate-pulse" />
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">No history vaulted.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Jimskay Breach Terminal &bull; Memory Protocol Active &bull;
          </span>
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Jimskay Breach Terminal &bull; Memory Protocol Active &bull;
          </span>
        </div>
      </div>
    </div>
  );
}
