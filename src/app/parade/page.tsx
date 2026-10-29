"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { collection, query, orderBy, limit, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { laboratoryAnalysis } from '@/ai/flows/laboratory-analysis-flow';
import { 
  Trophy, 
  Flag, 
  Trash2, 
  Zap, 
  Plus, 
  Loader2, 
  ArrowLeft,
  CheckCircle2,
  Target,
  Flame,
  ShieldCheck,
  Sword
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function DragonHousePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisQuery, setAnalysisQuery] = useState('');

  const [moveName, setMoveName] = useState('');
  const [priority, setPriority] = useState('Standard');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const protocolsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'parade_protocols'),
      orderBy('moveName', 'asc'),
      limit(20)
    );
  }, [db, user]);

  const { data: protocols } = useCollection(protocolsQuery);

  const handleSaveProtocol = async () => {
    if (!user || !db || !moveName) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'parade_protocols'), {
        moveName,
        priority,
        description: analysisResult?.synthesis || "Planned choreography move.",
        executionSteps: analysisResult?.recommendations?.join("\n") || "Step-by-step logic pending.",
        createdAt: serverTimestamp(),
      });
      toast({ title: "Strategy Vaulted" });
      setMoveName('');
      setAnalysisResult(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Strategy Sync Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProtocol = async (id: string) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'parade_protocols', id));
      toast({ title: "Move Decommissioned" });
    } catch (e) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  const handleRunAnalysis = async () => {
    if (!analysisQuery.trim()) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await laboratoryAnalysis({ context: 'PARADE_CHOREOGRAPHY', query: analysisQuery });
      setAnalysisResult(result);
      if (result && !moveName) setMoveName(analysisQuery.substring(0, 20));
    } catch (e: any) {
      toast({ variant: "destructive", title: "Synthesis Failed", description: e.message });
    } finally {
      setIsAnalyzing(false);
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

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col gap-6">
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
              <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center text-white glow-dragon">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">
                  Dragon<span className="text-red-500">Command</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">
                  Flag Bearer Protocol • House Leadership Hub
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-red-600/10 border border-red-600/20 rounded-xl flex items-center gap-3">
                <Flame className="w-4 h-4 text-red-500 animate-pulse" />
                <span className="text-[8px] font-black text-white uppercase tracking-widest">Prestige: Optimal</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
            <div className="lg:col-span-2 space-y-6 overflow-y-auto custom-scrollbar pr-2">
                <Card className="glass-panel border-white/5 rounded-[2rem] p-8 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Flag className="w-32 h-32 text-red-500" />
                    </div>
                    <div className="relative z-10 space-y-6">
                        <div className="space-y-2">
                            <h2 className="font-serif text-xl font-black text-white tracking-tighter flex items-center gap-2">
                                <Sword className="w-5 h-5 text-red-500" />
                                House Leadership Synthesizer
                            </h2>
                            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">Synthesize elite parade moves and discipline protocols</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Move Description / Instruction</label>
                                <Input 
                                    value={analysisQuery}
                                    onChange={(e) => setAnalysisQuery(e.target.value)}
                                    placeholder="E.g. Technical eyes-right transition for Dragon House..."
                                    className="rounded-xl h-12 bg-white/5 border-white/10 text-xs font-bold text-white px-4 focus-visible:ring-red-500/30"
                                />
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <Button 
                                    onClick={handleRunAnalysis}
                                    disabled={isAnalyzing || !analysisQuery.trim()}
                                    className="rounded-xl h-11 bg-red-600 text-white font-black shadow-xl glow-dragon text-[9px] uppercase tracking-widest px-8 border-none"
                                >
                                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                                    Synthesize Protocol
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>

                {analysisResult && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <Card className="glass-panel border-white/5 rounded-[2rem] p-8 border-none bg-red-600/[0.02]">
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center text-red-500">
                                        <Target className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-serif text-lg font-black text-white tracking-tighter">Strategic Protocol</h3>
                                        <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/40">Jimoh Jamihu Adekilekun Verified</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Input 
                                        placeholder="Protocol Identifier"
                                        value={moveName}
                                        onChange={(e) => setMoveName(e.target.value)}
                                        className="h-8 w-40 text-[10px] bg-black/40 border-white/5 text-white font-bold"
                                    />
                                    <Button 
                                        onClick={handleSaveProtocol}
                                        disabled={isSaving || !moveName}
                                        className="h-8 w-full bg-red-600 text-white text-[8px] font-black uppercase tracking-widest rounded-lg"
                                    >
                                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                                        Vault Protocol
                                    </Button>
                                </div>
                            </div>
                            <p className="text-[12px] leading-relaxed text-muted-foreground/80 mb-8 whitespace-pre-wrap font-medium">
                                {analysisResult.synthesis}
                            </p>
                            <div className="space-y-3 border-t border-white/5 pt-6">
                                <h4 className="text-[9px] font-black text-white uppercase tracking-widest">Execution Protocol</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {analysisResult.recommendations.map((rec: string, i: number) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-red-600/5 rounded-xl border border-red-600/10">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                            <span className="text-[10px] font-bold text-white/70">{rec}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <Flag className="w-4 h-4 text-red-500" />
                        <h2 className="font-serif text-lg font-black text-white tracking-tighter">Dragon Vault</h2>
                    </div>
                    <span className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-widest">{protocols?.length || 0} Assets</span>
                </div>

                <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="space-y-4 pr-3">
                        {protocols?.map((protocol) => (
                            <Card key={protocol.id} className="glass-panel border-white/5 rounded-2xl p-4 border-none bg-white/[0.01] hover:bg-red-600/[0.03] transition-all group relative">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <h3 className="text-[11px] font-black text-white uppercase tracking-tight">{protocol.moveName}</h3>
                                        <div className="flex gap-2">
                                            <span className="text-[6px] font-black uppercase tracking-widest bg-red-600/10 text-red-500 px-1.5 py-0.5 rounded">
                                                {protocol.priority || "Standard"}
                                            </span>
                                            <span className="text-[6px] font-black uppercase tracking-widest bg-white/5 text-muted-foreground/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                <ShieldCheck className="w-2 h-2" />
                                                Verified
                                            </span>
                                        </div>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleDeleteProtocol(protocol.id)}
                                        className="h-7 w-7 text-muted-foreground/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                                <div className="mt-3">
                                    <p className="text-[9px] text-muted-foreground/60 leading-relaxed line-clamp-3">
                                        {protocol.description}
                                    </p>
                                </div>
                            </Card>
                        ))}
                        {!protocols?.length && (
                            <div className="py-20 text-center glass-panel rounded-2xl border-dashed border-white/5 border-2">
                                <Flame className="w-10 h-10 text-muted-foreground/10 mx-auto mb-4 animate-pulse" />
                                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">No protocols vaulted.</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-red-500/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Dragon House Command &bull; Tactical Leadership Hub &bull; Flag Bearer Protocol &bull; House Discipline Active &bull; Crimson & Gold &bull; House of ile-imole &bull;
          </span>
          <span className="text-red-500/20 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Dragon House Command &bull; Tactical Leadership Hub &bull; Flag Bearer Protocol &bull; House Discipline Active &bull; Crimson & Gold &bull; House of ile-imole &bull;
          </span>
        </div>
      </div>
    </div>
  );
}
