"use client"

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  ArrowUpRight,
  BookOpen,
  Clock3,
  Code2,
  Command,
  GraduationCap,
  Globe2,
  Gamepad2,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageSquare,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { PRODUCTS } from '@/lib/product-registry';

/**
 * JimskayDashboard: The Command Center.
 * FINAL HIERARCHY: Jimskay AI (Hero) > Jimskay Studio (Forge).
 * Protocol: Professional Elite Duplicate Architecture.
 */
export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    if (!isUserLoading && !user) router.push('/auth');
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [user, isUserLoading, router]);

  if (!isMounted || isUserLoading || !user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center app-bg">
        <div className="relative">
          <div className="absolute -inset-20 bg-primary/30 rounded-full blur-[60px] animate-pulse"></div>
          <Loader2 className="w-10 h-10 animate-spin text-primary relative" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full app-bg overflow-hidden fixed inset-0">
      <div className={`fixed inset-0 z-[60] bg-black/70 transition-opacity md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />
      <div className={`fixed top-0 left-0 z-[70] h-full w-64 app-bg border-r border-white/10 transition-transform md:relative md:translate-x-0 shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar currentChatId={null} onSelectChat={(id) => router.push(id ? `/chat?id=${id}` : '/chat')} onClose={() => setIsSidebarOpen(false)} />
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar surface-dim">
        <div className="mx-auto max-w-[1440px] p-4 md:p-8 lg:p-10 pb-24 space-y-8">
          <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 rounded-lg border border-white/10 bg-white/5 text-white" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
              <div className="h-11 w-11 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center"><Command className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-primary">Command center</p>
                <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-white">Good to see you, {user.displayName?.split(' ')[0] || 'Jimoh'}.</h1>
              </div>
            </div>
            <div className="flex items-center gap-3 text-left md:text-right">
              <div className="hidden sm:block h-9 w-px bg-white/10" />
              <div>
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary"><Activity className="h-3 w-3" /> All systems online</p>
                {currentTime && <p className="mt-1 text-xs tabular-nums text-white/45">{format(currentTime, 'EEEE, MMM do')} · {format(currentTime, 'HH:mm')}</p>}
              </div>
            </div>
          </header>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Workspace overview">
            <OverviewStat label="Workspace" value="Online" detail="All systems nominal" icon={<Activity className="h-4 w-4" />} />
            <OverviewStat label="Active focus" value="AI chat" detail="Ready when you are" icon={<MessageSquare className="h-4 w-4" />} />
            <OverviewStat label="Products" value={`${PRODUCTS.length}`} detail="Across your workspace" icon={<LayoutDashboard className="h-4 w-4" />} />
            <OverviewStat label="Identity" value="Verified" detail="Private workspace" icon={<UserRound className="h-4 w-4" />} />
          </section>

          <section className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] gap-5">
            <Card className="glass-panel rounded-xl border-primary/20 p-6 md:p-8 relative overflow-hidden">
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <div className="relative flex h-full flex-col justify-between gap-10">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary">Primary workspace</p>
                    <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-white">Think with Jimskay AI.</h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">Start a conversation, organize a problem, or turn a rough idea into something you can ship.</p>
                  </div>
                  <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"><Sparkles className="h-5 w-5 text-primary" /></div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button onClick={() => router.push('/chat')} className="cyber-button h-11 rounded-lg px-5 text-xs font-bold uppercase tracking-[0.18em] text-white border-0">Open AI chat <ArrowUpRight className="h-4 w-4" /></Button>
                  <span className="text-xs text-white/35">Your conversations stay in your workspace.</span>
                </div>
              </div>
            </Card>

            <Card className="glass-panel rounded-xl p-6">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Continue where you left off</p><h2 className="mt-2 text-lg font-semibold text-white">Pick a direction</h2></div><Clock3 className="h-5 w-5 text-primary" /></div>
              <div className="mt-6 space-y-2">
                <QuickLink label="Build in Studio" detail="Create something new" icon={<Code2 className="h-4 w-4" />} href="/studio" />
                <QuickLink label="Study a topic" detail="Open Study Lab" icon={<BookOpen className="h-4 w-4" />} href="/academic" />
                <QuickLink label="Search the web" detail="Find an answer" icon={<Globe2 className="h-4 w-4" />} href="/intel" />
              </div>
            </Card>
          </section>

          <section>
            <div className="flex items-end justify-between mb-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary">Your toolkit</p><h2 className="mt-1 text-xl font-semibold text-white">Modules</h2></div><span className="text-xs text-white/35">Choose a workspace</span></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <ModuleCard title="Studio" description="Build apps and logic with an AI architect." icon={<Code2 />} href="/studio" color="text-primary" tag="Create" />
              <ModuleCard title="Study Lab" description="Practice subjects and prepare with focus." icon={<GraduationCap />} href="/academic" color="text-primary" tag="Learn" />
              <ModuleCard title="Web Search" description="Research facts and ideas from the web." icon={<Globe2 />} href="/intel" color="text-primary" tag="Research" />
              <ModuleCard title="Game Hub" description="Sharpen memory, logic, and reaction." icon={<Gamepad2 />} href="/game" color="text-primary" tag="Play" />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function OverviewStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="glass-panel rounded-lg border-white/10 p-4"><div className="flex items-center justify-between text-primary"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</span>{icon}</div><p className="mt-3 text-lg font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-white/35">{detail}</p></div>;
}

function QuickLink({ label, detail, icon, href }: { label: string; detail: string; icon: React.ReactNode; href: string }) {
  const router = useRouter();
  return <button onClick={() => router.push(href)} className="group flex w-full items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white">{label}</span><span className="block text-[11px] text-white/35">{detail}</span></span><ArrowUpRight className="h-4 w-4 text-white/25 transition-colors group-hover:text-primary" /></button>;
}

function ModuleCard({ title, description, icon, href, color, tag }: { title: string; description: string; icon: React.ReactNode; href: string; color: string; tag: string }) {
  const router = useRouter();
  return <Card onClick={() => router.push(href)} className="glass-panel rounded-lg border-white/10 p-4 cursor-pointer group transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">
    <div className="flex items-start justify-between gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 border border-primary/20 ${color} transition-transform group-hover:-translate-y-0.5`}>{icon}</div>
      <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">{tag}</span>
    </div>
    <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
    <p className="mt-1.5 text-xs leading-5 text-white/40">{description}</p>
    <div className="mt-5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary opacity-70 group-hover:opacity-100">Open <ArrowUpRight className="h-3.5 w-3.5" /></div>
  </Card>;
}