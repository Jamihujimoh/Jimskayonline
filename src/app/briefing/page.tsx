"use client"

import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { doc } from 'firebase/firestore';
import { ArrowLeft, Target, ShieldCheck, Flame, GraduationCap, ChevronRight, Zap, Clock, ShieldAlert } from 'lucide-react';

export default function MissionBriefingPage() {
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();

  const userDocQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc(userDocQuery);
  const isCreator = !!profile?.isVerifiedCreator;

  return (
    <div className="min-h-screen w-full app-bg relative overflow-hidden flex flex-col p-6 md:p-12 scanline-effect">
      <header className="max-w-5xl mx-auto w-full mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-lg h-10 w-10 bg-white/5"><ArrowLeft className="w-5 h-5" /></Button>
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white glow-primary shadow-2xl"><ShieldCheck className="w-7 h-7" /></div>
          <div><h1 className="font-serif text-3xl font-black text-white tracking-tighter uppercase italic leading-none">Welcome<span className="text-primary">Guide</span></h1><p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60 mt-2">Strategic Goals</p></div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-8 flex-1 pb-20">
        <div className="md:col-span-2 space-y-8 animate-in fade-in duration-1000 delay-200">
          <Card className="glass-panel border-primary/20 bg-primary/[0.02] rounded-[2.5rem] p-10 overflow-hidden">
            <div className="space-y-6 relative z-10"><div className="flex items-center gap-3"><Flame className="w-6 h-6 text-primary animate-pulse" /><h2 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">Study Goals</h2></div><p className="text-[13px] text-muted-foreground/80 font-medium">I want to score 95% or higher in Mathematics, Physics, and Chemistry. Precision is absolute.</p></div>
          </Card>
          <Card className="glass-panel border-white/5 rounded-[2.5rem] p-10">
            <div className="space-y-6"><div className="flex items-center gap-3"><ShieldAlert className="w-6 h-6 text-accent" /><h2 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">Logic Layer</h2></div><p className="text-[13px] text-muted-foreground/80 font-medium">Maintaining 100% discipline and strategic focus is my priority.</p></div>
          </Card>
        </div>
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-1000 delay-500">
          <Card className="glass-panel border-white/5 rounded-[2.5rem] p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto border border-white/10"><Target className="w-8 h-8 text-primary" /></div>
            <h3 className="font-serif text-xl font-black text-white uppercase italic">Status</h3>
            <div className="space-y-2"><p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/40">Level</p><div className="text-4xl font-black text-primary">A-1</div></div>
            <Button onClick={() => router.push('/dashboard')} className="w-full rounded-xl h-12 gradient-primary text-white font-black uppercase tracking-widest text-[9px] border-none glow-primary">Enter Dashboard</Button>
          </Card>
          <div className="glass-panel border-white/5 rounded-[2rem] p-6 space-y-4">
            <p className="text-[10px] font-black text-white uppercase tracking-widest border-b border-white/5 pb-2">Status Info</p>
            <div className="space-y-3">
              <VitalRow label="AI Connection" status="Good" />
              <VitalRow label="Identity Sync" status={isCreator ? "100%" : "50%"} />
              <VitalRow label="System Clock" status="Active" />
            </div>
          </div>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-7 border-t border-white/5 z-[100] flex items-center overflow-hidden"><div className="animate-marquee inline-block whitespace-nowrap"><span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">&bull; WELCOME GUIDE &bull; SYNC: {isCreator ? "100%" : "50%"} &bull; LEADERSHIP &bull;</span><span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">&bull; WELCOME GUIDE &bull; SYNC: {isCreator ? "100%" : "50%"} &bull; LEADERSHIP &bull;</span></div></div>
    </div>
  );
}

function VitalRow({ label, status }: { label: string, status: string }) {
  return <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest"><span className="text-muted-foreground/40">{label}</span><span className="text-white">{status}</span></div>;
}
