
"use client"

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Cpu, 
  Database, 
  Network, 
  Code2, 
  ShieldAlert,
  Binary,
  Microchip,
  Waves
} from 'lucide-react';

export default function SystemSpecsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen w-full app-bg relative overflow-hidden flex flex-col p-6 md:p-12 scanline-effect">
      <header className="max-w-5xl mx-auto w-full mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()}
            className="rounded-lg h-10 w-10 text-muted-foreground hover:text-white hover:bg-white/5 border border-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-12 h-12 rounded-2xl gradient-accent flex items-center justify-center text-white glow-accent shadow-[0_0_30px_rgba(0,255,255,0.3)]">
            <Microchip className="w-7 h-7" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic leading-none">
              System<span className="text-accent">Specs</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-2">
              Hardware Architecture & Jimskay Logic
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 pb-20">
        <SpecCard 
          icon={<Cpu className="w-6 h-6" />}
          title="Jimskay Engine"
          value="Gemini 2.5 Flash"
          desc="High-intelligence analysis core optimized for real-time strategic synthesis."
        />
        <SpecCard 
          icon={<Code2 className="w-6 h-6" />}
          title="Primary Logic"
          value="NextJS 15 / TS"
          desc="Viewport-locked React architecture with zero dead space rubbish."
        />
        <SpecCard 
          icon={<Database className="w-6 h-6" />}
          title="Knowledge Link"
          value="Firestore"
          desc="Real-time document synchronization via encrypted protocols."
        />
        <SpecCard 
          icon={<Network className="w-6 h-6" />}
          title="Global Link"
          value="SerpApi"
          desc="Live information grid access for real-time intelligence gathering."
        />
        <SpecCard 
          icon={<Binary className="w-6 h-6" />}
          title="Forge Stack"
          value="Python / Kali"
          desc="Technical asset repository for high-level programming and scripting."
        />
        <SpecCard 
          icon={<ShieldAlert className="w-6 h-6" />}
          title="Security"
          value="Handshake Protocol"
          desc="Multi-stage authentication for Verified Creator access."
        />
      </main>

      <div className="max-w-5xl mx-auto w-full mt-auto py-10 border-t border-white/5 animate-in fade-in duration-1000">
        <div className="flex flex-col md:flex-row justify-between gap-8 items-start">
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-2 text-accent">
              <ShieldAlert className="w-4 h-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Environment Integrity</p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground/60 font-medium">
              This terminal is optimized for high-end programmer productivity. All modules are served via dynamic viewport height (dvh) to ensure 100% layout perfection.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/30 mb-2">Build Date</p>
              <p className="text-[10px] font-black text-white uppercase tracking-widest">MARCH 2025</p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/30 mb-2">Status</p>
              <p className="text-[10px] font-black text-green-500 uppercase tracking-widest animate-pulse">OPTIMAL</p>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-7 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-accent/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">
            &bull; SYSTEM ARCHITECTURE &bull; GEMINI 2.5 FLASH &bull; NEXTJS 15 TURBOPACK &bull; FIREBASE CLOUD &bull; KALI LINUX MODULES &bull;
          </span>
          <span className="text-accent/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">
            &bull; SYSTEM ARCHITECTURE &bull; GEMINI 2.5 FLASH &bull; NEXTJS 15 TURBOPACK &bull; FIREBASE CLOUD &bull; KALI LINUX MODULES &bull;
          </span>
        </div>
      </div>
    </div>
  );
}

function SpecCard({ icon, title, value, desc }: { icon: React.ReactNode, title: string, value: string, desc: string }) {
  return (
    <Card className="glass-panel border-white/5 rounded-[2rem] p-8 hover:bg-white/[0.03] transition-all group border-none shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-accent mb-6 group-hover:glow-accent transition-all">
        {icon}
      </div>
      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mb-1">{title}</p>
      <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4">{value}</h3>
      <p className="text-[10px] leading-relaxed text-muted-foreground/60 font-bold uppercase tracking-widest">{desc}</p>
    </Card>
  );
}
