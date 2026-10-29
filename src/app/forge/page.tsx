
"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { collection, query, orderBy, limit, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { 
  Terminal, 
  Plus, 
  Trash2, 
  Zap, 
  Cpu, 
  ShieldAlert, 
  Play, 
  Save, 
  Loader2, 
  ArrowLeft,
  Clock,
  Copy,
  Check,
  Code2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { normalizeForgeLanguage, type ForgeLanguage, type ForgeSnippet } from '@/lib/forge';

export default function JimskayForgePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<ForgeLanguage>('python');
  const [code, setCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth');
    }
  }, [user, isUserLoading, router]);

  const snippetsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'snippets'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
  }, [db, user]);

  const { data: snippets, isLoading: isSnippetsLoading } = useCollection<ForgeSnippet>(snippetsQuery);

  const handleSaveSnippet = async () => {
    if (!user || !db || !title.trim() || !code.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'snippets'), {
        title: title.trim(),
        language: normalizeForgeLanguage(language),
        code: code.trim(),
        createdAt: serverTimestamp(),
      });
      toast({ title: "Asset Saved" });
      setIsCreating(false);
      setTitle('');
      setCode('');
    } catch (e) {
      toast({ variant: "destructive", title: "Save Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSnippet = (id: string) => {
    if (!user || !db) return;
    const confirmed = window.confirm("Delete this snippet?");
    if (confirmed) {
      deleteDocumentNonBlocking(doc(db, 'users', user.uid, 'snippets', id));
      toast({ title: "Asset Deleted" });
    }
  };

  const handleCopyCode = async (id: string, snippetCode: string) => {
    try {
      await navigator.clipboard.writeText(snippetCode);
      setCopiedId(id);
      toast({ title: "Code Copied" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ variant: "destructive", title: "Copy Failed", description: "Clipboard access was unavailable." });
    }
  };

  const handleInitializeProtocol = async (snippet: ForgeSnippet) => {
    if (!user || !db) return;
    
    toast({ title: "Opening Chat..." });
    
    try {
      const chatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
        userId: user.uid,
        lastMessage: `Reviewing: ${snippet.title}`,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'users', user.uid, 'chats', chatRef.id, 'messages'), {
        role: 'user',
        content: `I want to review this ${snippet.language} code:\n\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\`\n\nPlease help me check for errors or improve it.`,
        timestamp: serverTimestamp(),
      });

      router.push(`/chat?id=${chatRef.id}`);
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to open chat" });
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
              <div className="w-10 h-10 rounded-2xl gradient-accent flex items-center justify-center text-white glow-accent">
                <Terminal className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-black text-white tracking-tighter uppercase italic">
                  Jimskay<span className="text-accent">Forge</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/30">
                  Code Saver • Programmatic Assets
                </p>
              </div>
            </div>
          </div>
          <Button 
            onClick={() => setIsCreating(!isCreating)}
            className={`rounded-xl h-12 font-black transition-all text-[9px] uppercase tracking-widest px-8 shadow-xl border-none ${
              isCreating ? 'bg-destructive/20 text-destructive hover:bg-destructive/30' : 'gradient-accent text-white glow-accent'
            }`}
          >
            {isCreating ? <Zap className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {isCreating ? 'Cancel' : 'New Snippet'}
          </Button>
        </div>

        {isCreating && (
          <Card className="glass-panel border-white/5 rounded-[2rem] overflow-hidden animate-in zoom-in-95 duration-500 shadow-2xl shrink-0">
            <CardHeader className="py-4">
              <CardTitle className="font-serif text-lg font-black text-white tracking-tighter">New Code Snippet</CardTitle>
              <CardDescription className="text-[7px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mt-1">Save your programming assets to the cloud</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Title</label>
                  <Input 
                    placeholder="E.g. Python Network Script" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-xl h-10 border-white/5 bg-white/[0.03] font-bold text-white px-4 text-[11px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Language</label>
                  <Input 
                    placeholder="Python, JS, Bash..." 
                    value={language}
                    onChange={(e) => setLanguage(normalizeForgeLanguage(e.target.value))}
                    className="rounded-xl h-10 border-white/5 bg-white/[0.03] font-bold text-white px-4 text-[11px]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Source Code</label>
                <Textarea 
                  placeholder="# Enter your code here..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="rounded-xl min-h-[120px] border-white/5 bg-white/[0.03] font-code text-white px-4 text-[11px] focus-visible:ring-accent/30 resize-none"
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-3 pb-6 pt-0">
              <Button 
                onClick={handleSaveSnippet}
                disabled={isSaving || !title || !code}
                className="rounded-xl h-10 gradient-accent text-white font-black uppercase tracking-[0.2em] text-[10px] px-10 shadow-xl glow-accent border-none"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Asset
              </Button>
            </CardFooter>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          {snippets && snippets.length > 0 ? (
            snippets.map((snippet) => (
              <Card key={snippet.id} className="glass-panel border-white/5 rounded-2xl flex flex-col group border-none shadow-xl hover:bg-white/[0.04] transition-all overflow-hidden">
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-[11px] font-black text-white uppercase tracking-tight">{snippet.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-[6px] font-black uppercase tracking-widest text-accent bg-accent/10 px-1.5 py-0.5 rounded">{snippet.language}</span>
                        <span className="text-[6px] font-black uppercase tracking-widest text-muted-foreground/30 flex items-center gap-1">
                          <Clock className="w-2 h-2" />
                          {snippet.createdAt ? format(snippet.createdAt.toDate(), 'MMM d') : 'Now'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleCopyCode(snippet.id, snippet.code)}
                        className="h-7 w-7 rounded-lg text-muted-foreground/40 hover:text-accent hover:bg-accent/10"
                      >
                        {copiedId === snippet.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteSnippet(snippet.id)}
                        className="h-7 w-7 rounded-lg text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-4 bg-black/20">
                  <pre className="font-code text-[9px] text-muted-foreground/60 overflow-hidden line-clamp-6 leading-relaxed">
                    {snippet.code}
                  </pre>
                </CardContent>
                <CardFooter className="mt-auto pt-3 border-t border-white/5 bg-white/[0.01]">
                  <Button 
                    onClick={() => handleInitializeProtocol(snippet)}
                    variant="ghost" 
                    className="w-full h-8 text-[8px] font-black text-accent uppercase tracking-[0.2em] hover:bg-accent/5 group"
                  >
                    <Play className="w-3 h-3 mr-2 group-hover:scale-125 transition-transform" />
                    Review with AI
                  </Button>
                </CardFooter>
              </Card>
            ))
          ) : (
            !isCreating && (
              <div className="col-span-full py-20 text-center glass-panel rounded-[2rem] border-dashed border-white/5 border-2">
                <Cpu className="w-12 h-12 text-muted-foreground/10 mx-auto mb-4 animate-pulse" />
                <h3 className="text-sm font-serif font-black text-white mb-2 tracking-tighter">Forge Standby</h3>
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/30 max-w-[200px] mx-auto leading-relaxed">
                  No snippets found. Save your first code script to begin.
                </p>
              </div>
            )
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Jimskay Forge &bull; Python Scripting &bull; Programming Assets &bull; Termux Scripts Ready &bull; SS3 Ruby Protocol &bull; Advanced Mastery 2026 &bull; Secure Code Vault &bull;
          </span>
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[6px] mx-4">
            &bull; Jimskay Forge &bull; Python Scripting &bull; Programming Assets &bull; Termux Scripts Ready &bull; SS3 Ruby Protocol &bull; Advanced Mastery 2026 &bull; Secure Code Vault &bull;
          </span>
        </div>
      </div>
    </div>
  );
}
