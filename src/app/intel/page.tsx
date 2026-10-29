"use client"

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { webSearch } from '@/ai/flows/web-search-flow';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpRight, Globe2, Loader2, Menu, Search, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type SearchResult = Awaited<ReturnType<typeof webSearch>>;

export default function IntelligencePage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isMounted, setIsMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (!isUserLoading && !user) router.push('/auth');
  }, [isUserLoading, router, user]);

  const handleSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery || isSearching) return;
    setIsSearching(true);
    setLastQuery(normalizedQuery);
    try {
      setResult(await webSearch({ query: normalizedQuery }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Search failed', description: error instanceof Error ? error.message : 'Unable to reach web intelligence.' });
    } finally {
      setIsSearching(false);
    }
  };

  if (!isMounted || isUserLoading || !user) {
    return <div className="fixed inset-0 app-bg flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-full overflow-hidden app-bg text-white">
      <div className={`fixed inset-0 z-50 bg-black/70 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)} />
      <aside className={`fixed inset-y-0 left-0 z-[60] w-64 border-r border-white/10 app-bg transition-transform md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar currentChatId={null} onSelectChat={(id) => router.push(id ? `/chat?id=${id}` : '/chat')} onClose={() => setIsSidebarOpen(false)} />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto custom-scrollbar surface-dim">
        <div className="mx-auto max-w-6xl p-4 md:p-8 lg:p-10 pb-20">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="md:hidden h-10 w-10 rounded-lg border border-white/10 bg-white/5"><Menu className="h-5 w-5" /></Button><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10"><Globe2 className="h-5 w-5 text-primary" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary">Core workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Web Intelligence</h1></div></div>
            <span className="hidden sm:flex items-center gap-2 text-xs text-white/35"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Research mode</span>
          </header>

          <section className="mt-10 max-w-3xl"><p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Research without the noise</p><h2 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight">Find the signal.</h2><p className="mt-4 text-sm leading-6 text-white/50">Ask a focused question and get a structured brief you can use in chat, study, or Studio.</p></section>

          <form onSubmit={handleSearch} className="mt-8 max-w-4xl rounded-xl border border-primary/25 bg-white/[0.04] p-2 shadow-lg shadow-black/20"><div className="flex items-center gap-2"><Search className="ml-3 h-4 w-4 shrink-0 text-primary" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What do you need to understand?" className="h-11 border-0 bg-transparent text-sm focus-visible:ring-0" /><Button type="submit" disabled={isSearching || !query.trim()} className="h-11 rounded-lg gradient-primary px-5 text-xs font-bold uppercase tracking-[0.14em] border-0">{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span className="hidden sm:inline">Search</span><ArrowUpRight className="h-4 w-4 sm:ml-2" /></>}</Button></div></form>

          {isSearching && <div className="mt-10 flex items-center gap-3 text-sm text-white/45"><Sparkles className="h-4 w-4 animate-pulse text-primary" /> Building your research brief...</div>}
          {!isSearching && result && <section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><article className="glass-panel rounded-xl border-white/10 p-6 md:p-8"><div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Research brief</p><h2 className="mt-2 text-xl font-semibold text-white">{lastQuery}</h2></div><Globe2 className="h-5 w-5 text-primary" /></div><div className="prose prose-invert prose-sm mt-6 max-w-none text-white/75"><ReactMarkdown>{result.results}</ReactMarkdown></div></article><aside className="glass-panel h-fit rounded-xl border-white/10 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Evidence</p><p className="mt-2 text-sm text-white/60">{result.imageUrls?.length || 0} visual references returned</p>{result.imageUrls?.slice(0, 4).map((imageUrl) => <img key={imageUrl} src={imageUrl} alt="Research reference" className="mt-4 aspect-video w-full rounded-lg border border-white/10 object-cover" />)}</aside></section>}
          {!isSearching && !result && <div className="mt-16 grid gap-3 sm:grid-cols-3"><Suggestion label="Compare two technologies" onClick={() => setQuery('Compare two technologies')} /><Suggestion label="Explain a difficult topic" onClick={() => setQuery('Explain a difficult topic')} /><Suggestion label="Research a project idea" onClick={() => setQuery('Research a project idea')} /></div>}
        </div>
      </main>
    </div>
  );
}

function Suggestion({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="glass-panel rounded-lg border-white/10 p-4 text-left text-sm text-white/55 transition-colors hover:border-primary/30 hover:text-white">{label}<ArrowUpRight className="mt-3 h-4 w-4 text-primary" /></button>;
}
