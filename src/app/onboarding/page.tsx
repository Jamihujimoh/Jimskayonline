"use client"

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { doc } from 'firebase/firestore';
import { ShieldCheck, ChevronRight, ChevronLeft, Zap, Brain, GraduationCap, Activity, Loader2, Target, Globe } from 'lucide-react';

export default function OnboardingPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userDocQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc(userDocQuery);
  const isCreator = !!profile?.isVerifiedCreator;

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const STEPS = [
    {
      id: 1,
      title: "Who I Am",
      tag: "Profile",
      icon: <Zap className="w-8 h-8" />,
      description: "JimskaysAI is the digital version of Jimoh Jamihu Adekilekun. It shares his personality and skills.",
      meta: `Sync Rate: ${isCreator ? '100%' : '50%'}`
    },
    {
      id: 2,
      title: "Study Lab",
      tag: "Goal: Learn",
      icon: <GraduationCap className="w-8 h-8" />,
      description: "Take practice exams and study plans for your subjects in preparation for 2026 mastery.",
      meta: "Focus: Practice"
    },
    {
      id: 3,
      title: "Discipline",
      tag: "Mindset",
      icon: <Target className="w-8 h-8" />,
      description: "Maintaining a sharp academic mindset and 100% logic alignment.",
      meta: "High Efficiency"
    },
    {
      id: 4,
      title: "Setup Complete",
      tag: "Ready",
      icon: <ShieldCheck className="w-8 h-8" />,
      description: "You're all set! Enter the Dashboard and start using your digital workspace.",
      meta: "Status: Verified"
    }
  ];

  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setIsNavigating(true);
      router.push('/dashboard');
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (isUserLoading) return <div className="h-screen w-screen flex items-center justify-center app-bg"><Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" /></div>;

  return (
    <div className="h-[100dvh] flex flex-col app-bg text-white overflow-hidden relative scanline-effect">
      <header className="h-16 shrink-0 border-b border-white/5 flex items-center justify-between px-6 z-20 bg-black/20">
        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-card border border-white/10 flex items-center justify-center text-white glow-primary font-serif font-bold">J</div><div><p className="text-[7px] font-black uppercase text-muted-foreground/40 leading-none">Starting Up</p><p className="text-[9px] font-bold text-white uppercase mt-1">Step 0{step.id} / 0{STEPS.length}</p></div></div>
      </header>
      <main ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 z-10">
        <div className="max-w-xl mx-auto py-6">
          <Card className="glass-panel border-white/5 rounded-[2rem] p-8 md:p-10 relative overflow-hidden bg-white/[0.01]">
            <div className="absolute top-0 right-0 p-8 opacity-5 text-primary">{step.icon}</div>
            <div className="space-y-6 relative z-10">
              <div className="space-y-3"><span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[6px] font-black text-white/40 uppercase tracking-[0.3em]">{step.tag}</span><h1 className="text-xl md:text-3xl font-black text-white tracking-tighter uppercase leading-tight">{step.title}</h1></div>
              <p className="text-[12px] md:text-sm text-muted-foreground/80 font-medium">{step.description}</p>
              <div className="pt-4 flex items-center gap-3 text-primary border-t border-white/5 w-fit"><Activity className="w-3.5 h-3.5 opacity-40" /><span className="text-[8px] font-black uppercase tracking-[0.3em]">{step.meta}</span></div>
            </div>
          </Card>
        </div>
      </main>
      <footer className="shrink-0 app-bg border-t border-white/10 p-4 pb-14 z-50">
        <div className="max-w-xl mx-auto space-y-4">
          <div className="flex justify-between items-end px-1"><span className="text-[7px] font-black text-muted-foreground/30 uppercase">Loading</span><span className="text-[9px] font-black text-primary uppercase">{Math.round(progress)}%</span></div>
          <Progress value={progress} className="h-1 bg-white/5" />
          <div className="flex items-center justify-between gap-4">
            <Button variant="ghost" onClick={handleBack} disabled={currentStep === 0 || isNavigating} className="rounded-xl h-12 px-6 text-muted-foreground hover:text-white uppercase tracking-widest text-[8px] font-black border border-white/5"><ChevronLeft className="mr-2 w-3.5 h-3.5" /> Back</Button>
            <Button onClick={handleNext} disabled={isNavigating} className="rounded-xl h-12 px-10 gradient-primary text-white font-black shadow-xl glow-primary uppercase tracking-[0.2em] text-[9px] border-none">{isNavigating ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{currentStep === STEPS.length - 1 ? 'Enter App' : 'Next'}<ChevronRight className="ml-2 w-4 h-4 text-white" /></>}</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
