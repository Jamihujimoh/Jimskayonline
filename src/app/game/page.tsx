"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Gamepad2, 
  Zap, 
  ArrowLeft,
  ChevronRight,
  Target,
  Brain
} from 'lucide-react';

export default function JimskayArcadeHub() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

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

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push('/dashboard')}
                className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/5"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white glow-primary">
                <Gamepad2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">
                  Arcade<span className="text-primary">Hub</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-1">
                  Gaming Hub • Cognitive Training Protocols
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto w-full mt-10">
          <Card className="glass-panel border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-all border-none shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
              <Target className="w-32 h-32 text-primary" />
            </div>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
              <Target className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-serif text-2xl font-black text-white tracking-tighter mb-4">Tic-Tac-Toe</h2>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-black uppercase tracking-widest mb-8">
              Strategic spatial logic bypass. Outsmart the system in the ultimate grid confrontation.
            </p>
            <div className="flex flex-col gap-4 w-full mt-auto">
              <div className="bg-black/40 rounded-xl p-4 text-left border border-white/5">
                <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">Briefing:</p>
                <p className="text-[9px] text-muted-foreground/80 leading-relaxed">
                  Secure three horizontal, vertical, or diagonal nodes to breach the algorithmic defense.
                </p>
              </div>
              <Button 
                onClick={() => router.push('/game/tictactoe')}
                className="rounded-xl h-12 gradient-primary text-white font-black uppercase tracking-widest text-[9px] w-full border-none shadow-xl glow-primary"
              >
                Initialize Matrix
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>

          <Card className="glass-panel border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-all border-none shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
              <Brain className="w-32 h-32 text-accent" />
            </div>
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 border border-accent/20">
              <Brain className="w-8 h-8 text-accent" />
            </div>
            <h2 className="font-serif text-2xl font-black text-white tracking-tighter mb-4">Neural Match</h2>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-black uppercase tracking-widest mb-8">
              Memory pattern calibration. Synchronize your internal logic grid by matching identical data nodes.
            </p>
            <div className="flex flex-col gap-4 w-full mt-auto">
              <div className="bg-black/40 rounded-xl p-4 text-left border border-white/5">
                <p className="text-[8px] font-black text-accent uppercase tracking-widest mb-1">Briefing:</p>
                <p className="text-[9px] text-muted-foreground/80 leading-relaxed">
                  Click nodes to reveal hidden patterns. Re-establish the neural links by finding all matching pairs.
                </p>
              </div>
              <Button 
                onClick={() => router.push('/game/logic')}
                className="rounded-xl h-12 gradient-accent text-white font-black uppercase tracking-widest text-[9px] w-full border-none shadow-xl glow-accent"
              >
                Initialize Synapse
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Arcade Hub &bull; Cognitive Calibration &bull; 100% Logic Sync &bull; Arcade Active &bull;
          </span>
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Arcade Hub &bull; Cognitive Calibration &bull; 100% Logic Sync &bull; Arcade Active &bull;
          </span>
        </div>
      </div>
    </div>
  );
}