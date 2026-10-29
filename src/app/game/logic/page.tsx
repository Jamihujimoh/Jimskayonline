
"use client"

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Zap, 
  ArrowLeft,
  RotateCcw,
  Trophy,
  Brain,
  ShieldAlert,
  Cpu,
  Target,
  Flame,
  Globe,
  Activity,
  Fingerprint,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Icon Set for Memory Matching
const ICONS = [
  { icon: <Zap className="w-8 h-8" />, label: 'Zap' },
  { icon: <Target className="w-8 h-8" />, label: 'Target' },
  { icon: <Cpu className="w-8 h-8" />, label: 'Cpu' },
  { icon: <Flame className="w-8 h-8" />, label: 'Flame' },
  { icon: <Globe className="w-8 h-8" />, label: 'Globe' },
  { icon: <Activity className="w-8 h-8" />, label: 'Activity' },
  { icon: <Fingerprint className="w-8 h-8" />, label: 'Fingerprint' },
  { icon: <Brain className="w-8 h-8" />, label: 'Brain' },
];

type GameCard = {
  id: number;
  label: string;
  icon: React.ReactNode;
  isFlipped: boolean;
  isMatched: boolean;
};

export default function NeuralMatchPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [cards, setCards] = useState<GameCard[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const [isWon, setIsWon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const initGame = useCallback(() => {
    const pairIcons = [...ICONS, ...ICONS];
    const shuffled = pairIcons
      .sort(() => Math.random() - 0.5)
      .map((item, index) => ({
        id: index,
        label: item.label,
        icon: item.icon,
        isFlipped: false,
        isMatched: false,
      }));
    
    setCards(shuffled);
    setFlippedCards([]);
    setTurns(0);
    setIsWon(false);
    setIsProcessing(false);
  }, []);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
    initGame();
  }, [user, isUserLoading, router, initGame]);

  const handleCardClick = (id: number) => {
    if (isProcessing || cards[id].isFlipped || cards[id].isMatched || flippedCards.length === 2) return;

    const newCards = [...cards];
    newCards[id].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedCards, id];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      setTurns(prev => prev + 1);
      
      const [firstId, secondId] = newFlipped;
      if (newCards[firstId].label === newCards[secondId].label) {
        // Match Found
        newCards[firstId].isMatched = true;
        newCards[secondId].isMatched = true;
        setCards(newCards);
        setFlippedCards([]);
        setIsProcessing(false);
        
        if (newCards.every(card => card.isMatched)) {
          handleWin();
        }
      } else {
        // No Match - Flip back
        setTimeout(() => {
          newCards[firstId].isFlipped = false;
          newCards[secondId].isFlipped = false;
          setCards(newCards);
          setFlippedCards([]);
          setIsProcessing(false);
        }, 1000);
      }
    }
  };

  const handleWin = async () => {
    setIsWon(true);
    if (!user || !db) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'game_scores'), {
        game: 'NeuralMatch',
        turns: turns + 1,
        timestamp: serverTimestamp(),
      });
      toast({ title: "Performance Vaulted", description: "Memory calibration synced to cloud." });
    } catch (e) {
      console.error("Score sync failure", e);
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

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col items-center gap-6">
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
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic leading-none">
                  Neural<span className="text-primary">Match</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-1">
                  Memory Pattern Calibration
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
             <div className="glass-panel border-white/5 px-5 py-2 rounded-xl bg-white/[0.02] flex flex-col text-center min-w-[100px]">
               <span className="text-[7px] font-black text-muted-foreground uppercase tracking-widest leading-none">Turn Count</span>
               <span className="text-xl font-black text-white leading-none mt-1.5 tabular-nums">{turns}</span>
             </div>
             <Button 
               onClick={initGame}
               variant="ghost"
               className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 text-primary hover:text-white hover:bg-white/10"
             >
               <RotateCcw className="w-5 h-5" />
             </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl gap-8 relative pb-20">
          {isWon && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-[2.5rem] animate-in zoom-in-95 duration-500 border border-white/5 p-8 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-primary/20 text-primary glow-primary">
                <Trophy className="w-10 h-10" />
              </div>
              <h2 className="font-serif text-4xl font-black text-white uppercase italic tracking-tighter mb-2">
                Synapse Clear
              </h2>
              <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.3em] mb-8 leading-relaxed">
                Memory matching protocol completed in {turns} cycles.
              </p>
              <Button 
                onClick={initGame}
                className="rounded-2xl h-14 gradient-primary text-white font-black uppercase tracking-widest text-[11px] px-12 border-none glow-primary hover:scale-105 transition-all"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Matrix
              </Button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 md:gap-4 w-full aspect-square md:aspect-auto">
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                className={`
                  relative w-full aspect-square rounded-2xl border transition-all duration-500 transform preserve-3d
                  ${card.isFlipped || card.isMatched ? 'rotate-y-180' : ''}
                  ${card.isMatched ? 'border-primary/20 opacity-40 grayscale' : 'hover:scale-105'}
                `}
              >
                <div className={`
                  absolute inset-0 w-full h-full backface-hidden rounded-2xl border flex items-center justify-center
                  ${card.isFlipped || card.isMatched 
                    ? 'bg-primary/10 border-primary text-primary shadow-[0_0_20px_rgba(168,85,247,0.5)]' 
                    : 'bg-white/[0.03] border-white/5 bg-gradient-to-br from-white/[0.05] to-transparent'}
                `}>
                  {(card.isFlipped || card.isMatched) ? card.icon : <div className="w-8 h-8 rounded-full bg-primary/20 blur-md animate-pulse" />}
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse glow-primary" />
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">
              Select Nodes to Reveal Patterns • Match All Pairs
            </p>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; NEURAL MATCH TERMINAL &bull; PATTERN RECOGNITION ACTIVE &bull; TURN CYCLE: {turns} &bull; MEMORY LINK STABLE &bull;
          </span>
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; NEURAL MATCH TERMINAL &bull; PATTERN RECOGNITION ACTIVE &bull; TURN CYCLE: {turns} &bull; MEMORY LINK STABLE &bull;
          </span>
        </div>
      </div>

      <style jsx global>{`
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}
