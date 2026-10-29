"use client"

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Terminal,
  LayoutDashboard,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  MessageSquareText,
  Palette,
  Gamepad2,
  Zap,
  ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/firebase';

interface LandingPageProps {
  onStartChat: () => void;
}

const FEATURES = [
  {
    icon: MessageSquareText,
    title: 'Full-Spectrum Chat',
    copy: 'Persistent conversations with memory, live tasks and real-time tools.',
    accent: 'text-cyan-300',
    chip: 'from-cyan-500/25 to-sky-500/10 border-cyan-400/30',
    glow: 'hover:shadow-[0_24px_70px_-24px_rgba(34,211,238,0.55)]'
  },
  {
    icon: LayoutDashboard,
    title: 'Command Hub',
    copy: 'Every capability surfaced in one living, connected workspace.',
    accent: 'text-violet-300',
    chip: 'from-violet-500/25 to-purple-500/10 border-violet-400/30',
    glow: 'hover:shadow-[0_24px_70px_-24px_rgba(139,92,246,0.6)]'
  },
  {
    icon: Palette,
    title: 'Studio Forge',
    copy: 'Generate images, video, music and full apps — then ship them.',
    accent: 'text-fuchsia-300',
    chip: 'from-fuchsia-500/25 to-pink-500/10 border-fuchsia-400/30',
    glow: 'hover:shadow-[0_24px_70px_-24px_rgba(217,70,239,0.55)]'
  },
  {
    icon: Gamepad2,
    title: 'Playgrounds',
    copy: 'Interactive games, simulations and a glowing laboratory of ideas.',
    accent: 'text-emerald-300',
    chip: 'from-emerald-500/25 to-teal-500/10 border-emerald-400/30',
    glow: 'hover:shadow-[0_24px_70px_-24px_rgba(52,211,153,0.55)]'
  }
];

const TICKER_ITEMS = [
  '100% ONLINE',
  'PERSISTENT CHAT',
  'AI IMAGE STUDIO',
  'VIDEO & MUSIC GEN',
  'SECURE VAULT',
  'TASK AUTOMATION',
  'LIVE CODING PLAYGROUND',
  'GAME ARCADE'
];

export function LandingPage({ onStartChat }: LandingPageProps) {
  const { user } = useUser();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const goChat = () => onStartChat();

  return (
    <div className="h-full w-full app-bg overflow-hidden flex flex-col relative scanline-effect">
      {/* ── Content ────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar">
        <div className="min-h-full flex flex-col items-center justify-center px-5 py-10 mx-auto max-w-6xl">

          {/* Status pill */}
          <div className={`flex items-center gap-2.5 mb-8 glass-panel rounded-full px-4 py-2 transition-all duration-700 ${booted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-emerald-300">
              <Activity className="w-3 h-3 animate-pulse" /> Online
            </span>
            <span className="w-px h-3 bg-white/15" />
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-lime-300">
              <Zap className="w-3 h-3" /> Digital Jimoh
            </span>
            <span className="w-px h-3 bg-white/15" />
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-lime-300">
              <ShieldCheck className="w-3 h-3" /> Secure
            </span>
          </div>

          {/* Logo medallion */}
          <div className={`relative mb-7 group cursor-default transition-all duration-700 ${booted ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
            <div className="relative w-20 h-20 rounded-2xl gradient-soft flex items-center justify-center transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105">
              <span className="font-serif text-4xl font-black shimmer-text">J</span>
            </div>
          </div>

          {/* Hero */}
          <div className={`text-center space-y-5 mb-9 transition-all duration-700 ${booted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '120ms' }}>
            <h1 className="font-serif text-5xl md:text-7xl font-black text-white tracking-tighter leading-[0.95] italic drop-shadow-2xl">
              <span className="shimmer-text">Jimskays</span>
              <span className="text-primary">AI</span>
              <br />
              <span className="text-[0.45em] not-italic font-sans font-black uppercase tracking-[0.28em] text-white/70">Digital Jimoh</span>
            </h1>
            <p className="max-w-xl mx-auto text-sm md:text-base text-muted-foreground font-light leading-relaxed">
              Your personal AI workspace for thinking, making, and getting things done. One chat to command
              every studio, hub and playground at your fingertips.
            </p>
          </div>

          {/* Feature callouts */}
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 w-full max-w-4xl mb-10 transition-all duration-700 ${booted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: '240ms' }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`group glass-panel border-beam rounded-xl p-4 md:p-5 cursor-default transition-all duration-300 hover:-translate-y-1 ${f.glow}`}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-105">
                  <f.icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-white font-bold text-[13px] leading-tight mb-1.5 flex items-center gap-1">
                  {f.title}
                </h3>
                <p className="text-muted-foreground/80 text-[11px] leading-relaxed font-light">{f.copy}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 transition-all duration-700 ${booted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`} style={{ transitionDelay: '360ms' }}>
            <Button
              onClick={goChat}
              size="lg"
              className="cyber-button group rounded-2xl h-auto px-10 md:px-12 py-5 text-[11px] uppercase tracking-[0.3em] font-black border-none"
            >
              <Sparkles className="w-4 h-4 text-amber-200 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-125" />
              {user ? 'Open Chat' : 'Get Started'}
              <ChevronRight className="w-4 h-4 ml-1 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
            <Link href="/dashboard" className="group">
              <Button
                variant="outline"
                className="rounded-2xl h-auto px-8 py-5 text-[10px] uppercase tracking-[0.3em] font-black border-white/15 bg-white/[0.04] text-white/90"
              >
                <LayoutDashboard className="w-4 h-4 mr-1.5 text-violet-300 transition-transform duration-300 group-hover:-rotate-12" />
                Explore the Hub
              </Button>
            </Link>
          </div>

          <p className={`mt-7 text-[9px] font-black uppercase tracking-[0.35em] text-muted-foreground/40 flex items-center gap-2 transition-all duration-700 ${booted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '480ms' }}>
            <Terminal className="w-3 h-3 text-amber-300/70" />
            Your mind. Amplified.
            <ArrowUpRight className="w-3 h-3 text-rose-300/70" />
          </p>
        </div>
      </div>

      {/* ── Bottom ticker ──────────────────────────────────── */}
      <div className="relative z-10 w-full shrink-0 bg-card/50 backdrop-blur-md border-t border-white/[0.08] h-9 flex items-center overflow-hidden">
        <div className="animate-marquee">
          {[0, 1].map((dup) => (
            <span key={dup} className="text-white/25 font-black uppercase tracking-[0.6em] text-[8px]">
              {TICKER_ITEMS.map((t) => (
                <span key={`${dup}-${t}`} className="mx-8">
                  <span className="text-white/15">&bull;</span> {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
