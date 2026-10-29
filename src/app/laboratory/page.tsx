"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { collection, query, orderBy, limit, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { laboratoryAnalysis } from '@/ai/flows/laboratory-analysis-flow';
import { 
  Beaker, 
  Trash2, 
  Zap, 
  ShieldAlert, 
  Plus, 
  Loader2, 
  ArrowLeft,
  Search,
  CheckCircle2,
  ClipboardList,
  Info,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { LaboratoryAnalysisResult, LaboratoryAsset } from '@/lib/laboratory';

export default function JimskayLaboratoryPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState('inventory');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<LaboratoryAnalysisResult | null>(null);
  const [analysisQuery, setAnalysisQuery] = useState('');

  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState('Chemical');
  const [assetQuantity, setAssetQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const assetsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'lab_assets'),
      orderBy('lastChecked', 'desc'),
      limit(20)
    );
  }, [db, user]);

  const { data: assets } = useCollection<LaboratoryAsset>(assetsQuery);

  const handleSaveAsset = async () => {
    if (!user || !db || !assetName.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'lab_assets'), {
        name: assetName.trim(),
        type: assetType,
        quantity: assetQuantity.trim() || 'Not specified',
        status: 'In Stock',
        lastChecked: serverTimestamp(),
      });
      toast({ title: "Asset Logged in Registry" });
      setAssetName('');
      setAssetQuantity('');
    } catch (e) {
      toast({ variant: "destructive", title: "Registry Update Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'lab_assets', id));
      toast({ title: "Asset Decommissioned" });
    } catch (e) {
      toast({ variant: "destructive", title: "Decommissioning Failed" });
    }
  };

  const handleRunAnalysis = async (context: 'CHEMICAL_SAFETY') => {
    if (!analysisQuery.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await laboratoryAnalysis({ context, query: analysisQuery });
      setAnalysisResult(result);
    } catch (e) {
      toast({ variant: "destructive", title: "Synthesis Failed", description: e instanceof Error ? e.message : 'The laboratory analysis could not be completed.' });
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
              <div className="w-10 h-10 rounded-2xl bg-[#00ff88] flex items-center justify-center text-black glow-accent">
                <Beaker className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">
                  Jimskay<span className="text-[#00ff88]">Laboratory</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">
                  Lab Prefect Terminal • Command Day Ede Registry
                </p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="inventory" className="flex-1 flex flex-col min-h-0" onValueChange={setActiveTab}>
          <TabsList className="bg-white/5 border border-white/5 p-1 rounded-xl w-fit mb-6">
            <TabsTrigger value="inventory" className="rounded-lg text-[9px] uppercase tracking-widest font-black data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <ClipboardList className="w-3 h-3 mr-2" />
              Lab Registry
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="rounded-lg text-[9px] uppercase tracking-widest font-black data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <Zap className="w-3 h-3 mr-2" />
              Jimskay Diagnostics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 animate-in fade-in duration-500">
            <Card className="glass-panel border-white/5 rounded-2xl p-6 lg:w-80 shrink-0 border-none shadow-2xl h-fit">
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Log New Asset</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/40">Asset Name</label>
                  <Input 
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="E.g., HCl (Concentrated)"
                    className="rounded-lg h-9 bg-white/5 border-white/5 text-[11px] font-bold text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/40">Asset Type</label>
                  <select 
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    className="w-full rounded-lg h-9 bg-white/5 border border-white/5 text-[11px] font-bold text-white px-2 focus:outline-none"
                  >
                    <option value="Chemical" className="surface-dim">Chemical</option>
                    <option value="Equipment" className="surface-dim">Equipment</option>
                    <option value="Tool" className="surface-dim">Tool</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/40">Quantity</label>
                  <Input 
                    value={assetQuantity}
                    onChange={(e) => setAssetQuantity(e.target.value)}
                    placeholder="E.g., 500ml"
                    className="rounded-lg h-9 bg-white/5 border-white/5 text-[11px] font-bold text-white"
                  />
                </div>
                <Button 
                  onClick={handleSaveAsset}
                  disabled={isSaving || !assetName}
                  className="w-full rounded-xl h-10 bg-[#00ff88] text-black font-black uppercase tracking-widest text-[9px] shadow-xl glow-accent border-none"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Register Asset
                </Button>
              </div>
            </Card>

            <div className="flex-1 space-y-4 min-h-0 overflow-y-auto custom-scrollbar pr-2">
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest ml-1">Current Inventory Protocol</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assets?.map((asset) => (
                  <Card key={asset.id} className="glass-panel border-white/5 rounded-xl p-4 border-none bg-white/[0.02] relative group">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[11px] font-bold text-white">{asset.name}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[6px] font-black uppercase tracking-widest bg-white/5 text-muted-foreground/60 px-1.5 py-0.5 rounded">{asset.type}</span>
                          <span className="text-[6px] font-black uppercase tracking-widest bg-white/5 text-muted-foreground/60 px-1.5 py-0.5 rounded">{asset.quantity}</span>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="h-6 w-6 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="diagnostics" className="flex-1 flex flex-col gap-6 animate-in zoom-in-95 duration-500 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto w-full space-y-8">
              <Card className="glass-panel border-white/5 rounded-[2rem] p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5">
                  <Zap className="w-32 h-32 text-white" />
                </div>
                <h2 className="font-serif text-2xl font-black text-white tracking-tighter mb-2">Multimodal Laboratory Diagnostics</h2>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 mb-8">Specialized AI Synthesis for Command Day Ede</p>
                
                <div className="space-y-6">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-start gap-3 mb-4">
                    <Info className="w-4 h-4 text-[#00ff88] mt-0.5 shrink-0" />
                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed italic">
                      "As Laboratory Prefect, use this terminal to analyze unknown chemicals or experimental setups."
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Synthesis Query</label>
                    <Input 
                      value={analysisQuery}
                      onChange={(e) => setAnalysisQuery(e.target.value)}
                      placeholder="Describe a chemical for safety analysis or experimental steps..."
                      className="rounded-2xl h-14 bg-white/5 border-white/10 text-xs font-bold text-white px-6 focus-visible:ring-[#00ff88]/30"
                    />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <Button 
                      onClick={() => handleRunAnalysis('CHEMICAL_SAFETY')}
                      disabled={isAnalyzing || !analysisQuery.trim()}
                      className="rounded-xl h-12 bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all text-[9px] uppercase tracking-widest px-8"
                    >
                      <ShieldAlert className="w-4 h-4 mr-2 text-red-500" />
                      Chemical Synthesis
                    </Button>
                    <Button 
                      disabled={true}
                      className="rounded-xl h-12 bg-white/5 text-muted-foreground/30 font-black text-[9px] uppercase tracking-widest px-8 border border-white/5 cursor-not-allowed"
                    >
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Status: Verified
                    </Button>
                  </div>
                </div>
              </Card>

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-[#00ff88]" />
                  <p className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.4em]">Establishing Jimskay Synthesis Link...</p>
                </div>
              )}

              {analysisResult && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <Card className="glass-panel border-white/5 rounded-[2rem] p-8 border-none bg-white/[0.01]">
                    <div className="flex items-start gap-4 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#00ff88]/10 flex items-center justify-center text-[#00ff88]">
                        <Search className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-serif text-lg font-black text-white tracking-tighter">Diagnostic Synthesis</h3>
                        <p className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/40">Jimoh Jamihu Adekilekun Verified</p>
                      </div>
                    </div>
                    <p className="text-[12px] leading-relaxed text-muted-foreground/80 mb-8 whitespace-pre-wrap">
                      {analysisResult.synthesis}
                    </p>
                    <div className="space-y-3 border-t border-white/5 pt-6">
                      <h4 className="text-[9px] font-black text-white uppercase tracking-widest">Procedural Recommendations</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {analysisResult.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#00ff88] shrink-0" />
                            <span className="text-[10px] font-bold text-white/70">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Jimskay Laboratory &bull; Lab Prefect Verified &bull; SS3 Ruby Protocol &bull; Command Day Ede &bull; Tactical Supremacy &bull;
          </span>
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Jimskay Laboratory &bull; Lab Prefect Verified &bull; SS3 Ruby Protocol &bull; Command Day Ede &bull; Tactical Supremacy &bull;
          </span>
        </div>
      </div>
    </div>
  );
}
