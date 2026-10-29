"use client"

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { ChatInterface } from '@/components/ChatInterface';
import { Loader2, Activity } from 'lucide-react';

export default function ChatPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Protocol: Ensure client-side mounting before auth check
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isUserLoading && !user) {
      router.push('/auth');
    }
  }, [user, isUserLoading, router, isMounted]);

  if (!isMounted || isUserLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center app-bg overflow-hidden fixed inset-0 z-[1000]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/20 rounded-full blur-[40px] animate-pulse"></div>
            <div className="relative w-16 h-16 rounded-2xl bg-card border border-white/10 flex items-center justify-center shadow-2xl glow-primary">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </div>
          <div className="space-y-2 text-center">
            <p className="text-[10px] text-primary/60 font-black uppercase tracking-[0.5em] animate-pulse">
              Establishing Jimskay Link...
            </p>
            <div className="flex items-center justify-center gap-3 text-[7px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
              <span className="flex items-center gap-1"><Activity className="w-2.5 h-2.5" /> Handshake</span>
              <span>&bull;</span>
              <span>Neural Sync</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="h-[100dvh] w-screen relative overflow-hidden app-bg fixed inset-0">
      <Suspense fallback={<div className="h-full w-full app-bg" />}>
        <ChatInterface onBackToLanding={() => router.push('/dashboard')} />
      </Suspense>
    </main>
  );
}
