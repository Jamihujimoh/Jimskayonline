
"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { Sidebar } from '@/components/Sidebar';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  History, 
  Search, 
  Trash2, 
  MessageSquare, 
  Clock, 
  ChevronRight, 
  ArrowLeft, 
  Loader2, 
  Zap, 
  Database,
  Terminal,
  ShieldAlert
} from 'lucide-react';
import { collection, query, orderBy, getDocs, writeBatch, doc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export default function HistoryArchivePage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchQuery] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.push('/auth');
  }, [user, isUserLoading, router]);

  const chatsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'chats'),
      orderBy('updatedAt', 'desc')
    );
  }, [db, user]);

  const { data: chats, isLoading } = useCollection(chatsQuery);

  const filteredChats = chats?.filter(chat => 
    chat.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDecommission = (id: string) => {
    if (!user || !db) return;
    const docRef = doc(db, 'users', user.uid, 'chats', id);
    deleteDocumentNonBlocking(docRef);
    toast({ title: "Session Decommissioned" });
  };

  const handlePurgeArchive = async () => {
    if (!user || !db || isPurging) return;
    setIsPurging(true);
    try {
      const chatsRef = collection(db, 'users', user.uid, 'chats');
      const snapshot = await getDocs(chatsRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      toast({ title: "Archive Purged", description: "All historical fragments decommissioning complete." });
    } catch (e) {
      toast({ variant: "destructive", title: "Purge Failed" });
    } finally {
      setIsPurging(false);
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

      <main className="flex-1 overflow-y-auto custom-scrollbar surface-dim relative p-4 md:p-10 flex flex-col gap-8 pb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="rounded-lg h-8 w-8 text-muted-foreground hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white glow-primary">
                <History className="w-7 h-7" />
              </div>
              <div>
                <h1 className="font-serif text-3xl font-black text-white tracking-tighter uppercase italic leading-none shimmer-text">
                  History<span className="text-primary">Archive</span>
                </h1>
                <p className="text-[8px] font-black uppercase tracking-[0.5em] text-muted-foreground/40 mt-1.5">
                  Historical Logic Synchronization Vault
                </p>
              </div>
            </div>
          </div>
          <Button 
            onClick={handlePurgeArchive}
            disabled={isPurging || !chats?.length}
            className="rounded-xl h-12 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white font-black text-[9px] uppercase tracking-widest px-8 transition-all shadow-xl"
          >
            {isPurging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
            Purge Archive
          </Button>
        </div>

        <div className="space-y-8">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <Input 
              placeholder="Search historical sessions..." 
              value={searchTerm}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 rounded-2xl bg-white/5 border-white/5 text-[11px] font-bold text-white h-12 focus-visible:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full py-20 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary/20 mx-auto" />
              </div>
            ) : filteredChats && filteredChats.length > 0 ? (
              filteredChats.map((chat) => (
                <div key={chat.id} className="relative group min-h-[180px] animate-in zoom-in-95 duration-300">
                  <div 
                    onClick={() => router.push(`/chat?id=${chat.id}`)}
                    className="glass-panel border-white/5 rounded-[2.5rem] p-8 hover:bg-white/[0.04] transition-all cursor-pointer relative overflow-hidden border-none shadow-2xl h-full flex flex-col group/card z-10"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover/card:scale-110 transition-transform">
                      <MessageSquare className="w-20 h-20 text-primary" />
                    </div>
                    
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-primary border border-white/10 mb-4">
                      <MessageSquare className="w-5 h-5" />
                    </div>

                    <h3 className="text-xs font-black text-white uppercase tracking-tight mb-2 line-clamp-2 pr-8">{chat.lastMessage || 'Untitled Session'}</h3>
                    
                    <div className="mt-auto flex items-center gap-3 opacity-40">
                      <Clock className="w-3 h-3" />
                      <span className="text-[8px] font-black uppercase tracking-widest">
                        {chat.updatedAt ? formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: true }) : 'Syncing...'}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center text-[8px] font-black text-primary uppercase tracking-widest opacity-0 group-hover/card:opacity-100 transition-opacity">
                      Restore Session <ChevronRight className="w-3 h-3 ml-1" />
                    </div>
                  </div>

                  <div className="absolute top-6 right-6 z-[100]" onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button 
                          className="h-10 w-10 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all shadow-xl opacity-0 group-hover:opacity-100 active:scale-90"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="glass-panel border-white/5 rounded-[2rem]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-serif text-xl font-black text-white tracking-tighter uppercase italic">Decommission Protocol?</AlertDialogTitle>
                          <AlertDialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 leading-relaxed">
                            Permanently purge this session fragment from the archive? This action is irreversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl h-10 border-white/10 bg-white/5 text-white font-black text-[9px] uppercase tracking-widest">Abort</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecommission(chat.id);
                            }}
                            className="rounded-xl h-10 bg-destructive text-white font-black text-[9px] uppercase tracking-widest border-none glow-dragon shadow-xl"
                          >
                            Confirm Purge
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-32 text-center glass-panel rounded-[3rem] border-dashed border-white/5 border-2">
                <Database className="w-16 h-16 text-muted-foreground/10 mx-auto mb-6 animate-pulse" />
                <h3 className="text-lg font-serif font-black text-white mb-2 tracking-tighter">Archive Standby</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30 max-w-[240px] mx-auto leading-relaxed">
                  No historical sessions found in the cloud vault.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-card/30 backdrop-blur-md h-6 flex items-center overflow-hidden border-t border-white/5 z-[100]">
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[7px] mx-12">
            &bull; History Archive &bull; Historical Synchronization &bull; Session Logs Online &bull; Cloud Vault Secured &bull; March 2025 Architecture &bull;
          </span>
          <span className="text-muted-foreground/10 font-black uppercase tracking-[0.5em] text-[7px] mx-12">
            &bull; History Archive &bull; Historical Synchronization &bull; Session Logs Online &bull; Cloud Vault Secured &bull; March 2025 Architecture &bull;
          </span>
        </div>
      </div>
    </div>
  );
}
