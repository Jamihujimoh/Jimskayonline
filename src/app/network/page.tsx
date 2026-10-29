
"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Network, 
  Activity, 
  ArrowLeft, 
  Loader2, 
  Cpu, 
  Zap, 
  Globe, 
  ShieldCheck, 
  Server,
  Terminal,
  Wifi,
  Waves
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';

export default function NetworkMonitorPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [gridData, setGridData] = useState<any[]>([]);
  const [status, setStatus] = useState('LINKED');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
    
    // Simulate real-time grid telemetry
    const interval = setInterval(() => {
      setGridData(prev => {
        const newData = [...prev, { time: new Date().toLocaleTimeString(), load: Math.floor(Math.random() * 40) + 60 }];
        return newData.slice(-20);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) return null;

  return (
    <div className="flex h-[100dvh] w-full app-bg overflow-hidden fixed inset-0 scanline-effect">
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
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-10 h-10 rounded-2xl gradient-accent flex items-center justify-center text-white glow-accent shadow-[0_0_20px_rgba(168,85,247,0.5)]">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic leading-none shimmer-text">
                  Network<span className="text-accent">Monitor</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-1">Real-time Grid Telemetry • System Status</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl flex items-center gap-3">
                <Activity className="w-4 h-4 text-accent animate-pulse" />
                <span className="text-[8px] font-black text-white uppercase tracking-widest tabular-nums">Status: {status}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
          <Card className="lg:col-span-2 glass-panel border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden flex flex-col h-[400px]">
            <div className="flex justify-between items-start mb-8">
              <div className="space-y-1">
                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Neural Load Synthesis</h3>
                <p className="text-[7px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">Synapse throughput distribution</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
                <Waves className="w-4 h-4 text-accent animate-pulse" />
              </div>
            </div>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gridData}>
                  <defs>
                    <linearGradient id="colorLoad" x1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0b0c1f', borderRadius: '16px', border: '1px solid rgba(0,255,255,0.1)', fontSize: '10px' }}
                    itemStyle={{ color: 'hsl(var(--accent))', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="load" stroke="hsl(var(--accent))" fillOpacity={1} fill="url(#colorLoad)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="glass-panel border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden group hover:bg-white/[0.04] transition-all">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                <Server className="w-24 h-24 text-accent" />
              </div>
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Active Node Matrix</h3>
              <div className="space-y-4">
                <NodeStatus label="Primary Core" status="100%" color="text-green-500" />
                <NodeStatus label="Global Sync" status="98.4%" color="text-accent" />
                <NodeStatus label="Auth Encryption" status="ACTIVE" color="text-primary" />
                <NodeStatus label="Latency" status="14ms" color="text-white/40" />
              </div>
            </Card>

            <div className="glass-panel border-accent/20 rounded-[2rem] p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-accent" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Internet Link Established</span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 leading-relaxed font-bold uppercase tracking-widest italic">
                "Global information grid is synchronized with your terminal for real-time fact retrieval."
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 shrink-0">
          <MetricCard icon={<Cpu className="w-5 h-5" />} label="CPU ALLOCATION" value="2.4GHz" />
          <MetricCard icon={<Terminal className="w-5 h-5" />} label="TERMINAL UPTIME" value="48:12:05" />
          <MetricCard icon={<Zap className="w-5 h-5" />} label="neural throughput" value="1.2 TB/s" />
          <MetricCard icon={<Globe className="w-5 h-5" />} label="GRID NODES" value="1,024" />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-7 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-accent/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">
            &bull; Network Monitor &bull; Grid Telemetry &bull; AES-256 Link &bull; 100% Stability &bull; Advanced Mastery 2026 &bull;
          </span>
          <span className="text-accent/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">
            &bull; Network Monitor &bull; Grid Telemetry &bull; AES-256 Link &bull; 100% Stability &bull; Advanced Mastery 2026 &bull;
          </span>
        </div>
      </div>
    </div>
  );
}

function NodeStatus({ label, status, color }: { label: string, status: string, color: string }) {
  return (
    <div className="flex justify-between items-end border-b border-white/5 pb-2">
      <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">{label}</span>
      <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{status}</span>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <Card className="glass-panel border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 border-none bg-white/[0.02] hover:bg-white/[0.05] transition-all">
      <div className="text-accent opacity-40">{icon}</div>
      <p className="text-[7px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">{label}</p>
      <p className="text-lg font-black text-white uppercase tracking-tighter tabular-nums">{value}</p>
    </Card>
  );
}
