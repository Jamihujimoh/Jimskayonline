
"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { collection, query, orderBy, limit, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { 
  ShieldCheck, 
  Lock, 
  ArrowLeft, 
  Loader2, 
  Plus, 
  Trash2, 
  Zap, 
  Key, 
  Eye, 
  EyeOff,
  Fingerprint,
  Cpu,
  Archive,
  Terminal,
  ShieldAlert,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function LogicVaultPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const vaultQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'vault_items'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }, [db, user]);

  const { data: items } = useCollection(vaultQuery);

  const handleSaveItem = async () => {
    if (!user || !db || !label || !content) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'vault_items'), {
        label,
        content,
        securityLevel: 1,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Logic Fragment Vaulted" });
      setIsCreating(false);
      setLabel('');
      setContent('');
    } catch (e) {
      toast({ variant: "destructive", title: "Vault Sync Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'vault_items', id));
      toast({ title: "Fragment Purged Permanently" });
    } catch (e) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

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

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-8 flex flex-col gap-8 pb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-white glow-primary shadow-[0_0_20px_rgba(168,85,247,0.5)]">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic leading-none shimmer-text">
                  Logic<span className="text-primary">Vault</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30 mt-1">High-Security Fragment Repository • Encrypted</p>
              </div>
            </div>
          </div>
          <Button 
            onClick={() => setIsCreating(!isCreating)}
            className={`cyber-button rounded-xl h-12 font-black transition-all text-[9px] uppercase tracking-widest px-8 shadow-xl border-none ${
              isCreating ? 'bg-destructive/20 text-destructive' : 'bg-primary text-white glow-primary'
            }`}
          >
            {isCreating ? <Zap className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {isCreating ? 'Abort Synthesis' : 'New Fragment'}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {isCreating && (
              <Card className="glass-panel border-white/5 rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-500 w-full mb-6">
                <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-6">Initialize fragment Encryption</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Fragment Identifier</label>
                    <Input 
                      value={label} 
                      onChange={(e) => setLabel(e.target.value)} 
                      placeholder="E.g. Neural Logic Gate 01" 
                      className="rounded-xl h-12 bg-white/5 border-white/10 text-xs font-bold text-white px-4 focus-visible:ring-primary/30" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Logic Content (Encrypted)</label>
                    <Textarea 
                      value={content} 
                      onChange={(e) => setContent(e.target.value)} 
                      placeholder="Input sensitive data or encrypted thoughts..." 
                      className="rounded-xl min-h-[160px] bg-white/5 border-white/10 text-xs font-bold text-white p-4 resize-none focus-visible:ring-primary/30" 
                    />
                  </div>
                  <Button 
                    onClick={handleSaveItem} 
                    disabled={isSaving || !label || !content}
                    className="w-full rounded-xl h-12 gradient-primary text-white font-black uppercase tracking-widest text-[9px] border-none shadow-xl glow-primary"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Commit to Vault
                  </Button>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items?.map((item) => (
                <Card key={item.id} className="glass-panel border-white/5 rounded-[2rem] p-6 group hover:bg-white/[0.04] transition-all border-none shadow-xl relative overflow-hidden flex flex-col min-h-[220px]">
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                    <Archive className="w-16 h-16 text-primary" />
                  </div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-primary border border-white/10">
                        <Key className="w-4 h-4" />
                      </div>
                      <h3 className="text-[11px] font-black text-white uppercase tracking-tight truncate max-w-[120px]">{item.label}</h3>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)} className="h-7 w-7 rounded-lg text-muted-foreground/20 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-black/40 border border-white/5 relative flex-1 flex items-center justify-center">
                    {revealId === item.id ? (
                      <p className="text-[10px] text-muted-foreground/80 leading-relaxed font-medium whitespace-pre-wrap">{item.content}</p>
                    ) : (
                      <div className="text-center space-y-3">
                        <Fingerprint className="w-8 h-8 text-primary/20 mx-auto animate-pulse" />
                        <p className="text-[7px] font-black text-white/20 uppercase tracking-[0.4em]">Encrypted Fragment</p>
                      </div>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setRevealId(revealId === item.id ? null : item.id)}
                      className="absolute bottom-2 right-2 h-7 w-7 text-white/40 hover:text-primary"
                    >
                      {revealId === item.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                    <span className="text-[6px] font-black text-muted-foreground/30 uppercase tracking-widest">
                      Level {item.securityLevel || 1} Auth Required
                    </span>
                    <span className="text-[6px] font-black text-muted-foreground/30 uppercase tracking-widest">
                      {item.createdAt ? format(item.createdAt.toDate(), 'MMM d, yyyy') : 'Active'}
                    </span>
                  </div>
                </Card>
              ))}
              {!items?.length && !isCreating && (
                <div className="col-span-full py-20 text-center glass-panel rounded-[3rem] border-dashed border-white/5 border-2 bg-transparent">
                  <Cpu className="w-16 h-16 text-muted-foreground/10 mx-auto mb-6 animate-pulse" />
                  <h3 className="text-lg font-serif font-black text-white mb-2 tracking-tighter uppercase italic">Vault Standby</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30 max-w-[240px] mx-auto leading-relaxed">
                    No encrypted fragments found. Initialize a new synthesis protocol to secure your logic.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <Card className="glass-panel border-primary/20 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden bg-primary/[0.02]">
              <div className="flex items-center gap-3 mb-6">
                <ShieldAlert className="w-5 h-5 text-primary animate-pulse" />
                <h2 className="font-serif text-xl font-black text-white tracking-tighter uppercase italic">Utility Protocol</h2>
              </div>
              <p className="text-[11px] text-muted-foreground/70 font-medium uppercase tracking-tight mb-8">Primary uses for the Logic Vault in your strategic workspace:</p>
              
              <div className="space-y-4">
                <VaultUsePoint 
                  icon={<Key className="w-4 h-4" />} 
                  title="Credential Segregation" 
                  desc="Store fragments of sensitive keys, tokens, or secondary codes (e.g. 201010 handshake)." 
                />
                <VaultUsePoint 
                  icon={<Terminal className="w-4 h-4" />} 
                  title="Config Backups" 
                  desc="Securely archive complex Termux or Python environment variable strings." 
                />
                <VaultUsePoint 
                  icon={<ShieldCheck className="w-4 h-4" />} 
                  title="Mission Logs" 
                  desc="Encrypted technical logs and reflections for your high-level mastery phase." 
                />
                <VaultUsePoint 
                  icon={<Archive className="w-4 h-4" />} 
                  title="Strategic Archive" 
                  desc="Save top-secret academic targets or personal mastery plans." 
                />
              </div>
            </Card>

            <div className="glass-panel border-white/5 rounded-[2rem] p-6 flex flex-col items-center text-center gap-4 group hover:bg-white/[0.05] transition-all">
               <Fingerprint className="w-10 h-10 text-primary/40 group-hover:scale-110 transition-transform duration-500" />
               <div className="space-y-1">
                 <p className="text-[10px] font-black text-white uppercase tracking-widest">End-to-End Encryption</p>
                 <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">Digital Twin Logic Layer Secured</p>
               </div>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-7 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">
            &bull; Logic Vault &bull; High-Security Sector &bull; Encrypted Fragments &bull; Creator Only Access &bull;
          </span>
          <span className="text-primary/20 font-black uppercase tracking-[0.5em] text-[7px] mx-8">
            &bull; Logic Vault &bull; High-Security Sector &bull; Encrypted Fragments &bull; Creator Only Access &bull;
          </span>
        </div>
      </div>
    </div>
  );
}

function VaultUsePoint({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2 group hover:bg-white/[0.05] transition-all">
      <div className="flex items-center gap-3">
        <div className="text-primary">{icon}</div>
        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">{title}</h4>
      </div>
      <p className="text-[9px] text-muted-foreground leading-relaxed font-bold uppercase tracking-tight">{desc}</p>
    </div>
  );
}
