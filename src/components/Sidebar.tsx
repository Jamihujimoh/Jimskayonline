"use client"

import { useState } from 'react';
import { useUser, useAuth, useFirestore, useCollection, useDoc, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, writeBatch, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Plus,
  MessageSquare,
  LogOut,
  Trash2,
  X,
  Clock,
  Loader2,
  Zap,
  Sparkles,
  LayoutDashboard,
  Fingerprint,
  Lock,
  History,
  Code2,
  Globe2,
  Gamepad2,
  FlaskConical,
  BookOpen,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PRODUCTS, type ProductDefinition } from '@/lib/product-registry';
import { CREATOR_VERIFICATION_CODE, getEffectiveCreatorStatus, setStoredCreatorVerification, verifyCreatorCode } from '@/lib/creator-state';

interface ChatSession {
  id: string;
  lastMessage: string;
  updatedAt: any;
}

export function Sidebar({ currentChatId, onSelectChat, onClose }: {
  currentChatId: string | null;
  onSelectChat: (id: string | null) => void;
  onClose: () => void;
}) {
  const { user } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [isDeleting, setIsDeleting] = useState(false);
  const [creatorCodeInput, setCreatorCodeInput] = useState('');
  const [isVerifyingCreator, setIsVerifyingCreator] = useState(false);

  const profileQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: profile } = useDoc(profileQuery);
  const isCreator = getEffectiveCreatorStatus(profile);

  const handleVerifyCreator = async () => {
    if (!user || !db) return;
    if (!verifyCreatorCode(creatorCodeInput)) {
      toast({ variant: 'destructive', title: 'Creator verification failed', description: `Use the code: ${CREATOR_VERIFICATION_CODE}` });
      return;
    }

    setIsVerifyingCreator(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        isVerifiedCreator: true,
        creatorVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setStoredCreatorVerification(true);
      setCreatorCodeInput('');
      toast({ title: 'Creator verified', description: 'Creator access is now active for this account.' });
    } catch (error) {
      console.error('Sidebar creator verification failed:', error);
      toast({ variant: 'destructive', title: 'Verification failed', description: 'The profile could not be updated. Try again.' });
    } finally {
      setIsVerifyingCreator(false);
    }
  };

  const chatsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(
      collection(db, 'users', user.uid, 'chats'),
      orderBy('updatedAt', 'desc'),
      limit(15)
    );
  }, [db, user?.uid]);

  const { data: chats, isLoading: isChatsLoading } = useCollection<ChatSession>(chatsQuery);

  const handleDeleteHistory = async () => {
    if (!user || !db || isDeleting) return;
    setIsDeleting(true);
    try {
      const chatsRef = collection(db, 'users', user.uid, 'chats');
      const snapshot = await getDocs(chatsRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      onSelectChat(null);
      toast({ title: 'History Deleted', description: 'All past chats have been removed.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not delete history.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDecommission = (id: string) => {
    if (!user || !db) return;
    const docRef = doc(db, 'users', user.uid, 'chats', id);
    deleteDocumentNonBlocking(docRef);
    if (currentChatId === id) onSelectChat(null);
    toast({ title: 'Chat Deleted' });
  };

  return (
    <aside className="w-full h-full flex flex-col bg-[#0e0f22] border-r border-white/[0.06]">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center text-white shadow-[0_0_20px_rgba(168,85,247,0.55)]">
            <Zap className="w-4.5 h-4.5 w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-[19px] font-bold text-white tracking-tight leading-none">Menu</h2>
            <p className="text-[11px] uppercase tracking-[0.35em] font-bold text-primary/50 mt-1">Online</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden rounded-full text-white/30 h-8 w-8 hover:bg-white/10" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* New chat + primary nav */}
      <div className="px-4 pb-4 space-y-3 shrink-0 border-b border-white/[0.06]">
        <Button
          onClick={() => {
            onSelectChat(null);
            onClose();
          }}
          className="w-full justify-start gap-3 gradient-primary text-white rounded-xl h-12 font-bold text-[16px] uppercase tracking-wider border-none transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
          <Sparkles className="w-3.5 h-3.5 ml-auto text-white/40" />
        </Button>

        <div className="space-y-0.5">
          <SidebarNavButton
            icon={<LayoutDashboard />}
            label="Dashboard"
            active={pathname === '/dashboard'}
            onClick={() => {
              router.push('/dashboard');
              onClose();
            }}
          />
          <SidebarNavButton
            icon={<History />}
            label="Past Chats"
            active={pathname === '/history'}
            onClick={() => {
              router.push('/history');
              onClose();
            }}
          />
          <SidebarNavButton
            icon={<Lock />}
            label="Saved Items"
            active={pathname === '/vault'}
            onClick={() => {
              router.push('/vault');
              onClose();
            }}
          />
          <SidebarNavButton
            icon={<Fingerprint />}
            label="My Profile"
            active={pathname === '/identity'}
            onClick={() => {
              router.push('/identity');
              onClose();
            }}
          />
          <SidebarNavButton
            icon={<Code2 />}
            label="Studio"
            active={pathname === '/studio' || pathname.startsWith('/studio/')}
            onClick={() => {
              router.push('/studio');
              onClose();
            }}
          />
          {PRODUCTS.filter((product) => ['chat', 'forge', 'laboratory', 'academic', 'intel', 'game'].includes(product.id)).map((product) => (
            <ProductNavButton key={product.id} product={product} pathname={pathname} onNavigate={() => onClose()} />
          ))}
        </div>
      </div>

      {!isCreator && (
        <div className="px-4 pb-3 shrink-0 border-b border-white/[0.06]">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300/80">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Creator access
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="password"
                value={creatorCodeInput}
                onChange={(e) => setCreatorCodeInput(e.target.value)}
                placeholder={CREATOR_VERIFICATION_CODE}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60"
              />
              <button
                type="button"
                onClick={handleVerifyCreator}
                disabled={isVerifyingCreator}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-60"
              >
                {isVerifyingCreator ? '...' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent chats */}
      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center gap-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.35em] text-white/25">Recent Chats</p>
        <div className="h-px flex-1 bg-white/[0.05]" />
      </div>

      <ScrollArea className="sidebar-chat-scroll flex-1 w-full min-w-0 px-3 min-h-0">
        <div className="w-full min-w-0 space-y-1 pb-4">
          {isChatsLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary/40 mx-auto" />
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/25 mt-2">Loading...</p>
            </div>
          ) : chats && chats.length > 0 ? (
            chats.map((chat) => (
              <div key={chat.id} className="relative group">
                <button
                  onClick={() => {
                    onSelectChat(chat.id);
                    onClose();
                  }}
                  className={cn(
                    'w-full min-w-0 text-left p-3 rounded-xl transition-all border border-transparent',
                    currentChatId === chat.id
                      ? 'bg-white/[0.07] border-white/[0.08]'
                      : 'hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                        currentChatId === chat.id ? 'bg-primary/20' : 'bg-white/[0.04]'
                      )}
                    >
                      <MessageSquare className={cn('w-3.5 h-3.5', currentChatId === chat.id ? 'text-primary' : 'text-white/35')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[16px] font-medium truncate leading-snug', currentChatId === chat.id ? 'text-white' : 'text-white/70')}>
                        {chat.lastMessage || 'Continuing Chat...'}
                      </p>
                      {chat.updatedAt && (
                        <div className="flex items-center gap-1.5 mt-1 text-white/25">
                          <Clock className="w-2.5 h-2.5" />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">
                            {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20" onClick={(e) => e.stopPropagation()}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#13142a] border-white/[0.08] rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-[15px] font-bold text-white tracking-tight">Delete Chat?</AlertDialogTitle>
                        <AlertDialogDescription className="text-[12px] text-white/45 leading-relaxed mt-2">
                          Permanently remove this chat history? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-6">
                        <AlertDialogCancel className="h-9 rounded-lg bg-white/5 border-white/10 text-white font-semibold text-[11px] px-5">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDecommission(chat.id);
                          }}
                          className="h-9 rounded-lg bg-destructive text-white font-semibold text-[11px] border-none px-5"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          ) : (
            <div className="py-14 text-center text-white/20">
              <History className="w-8 h-8 mx-auto mb-3" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Empty</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="px-4 py-4 mt-auto border-t border-white/[0.06] bg-white/[0.01] space-y-1.5 shrink-0">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              disabled={isDeleting}
              className="w-full justify-start gap-3 h-9 rounded-lg text-white/35 hover:text-destructive font-semibold hover:bg-destructive/10 transition-all text-[11px] uppercase tracking-wider border-none"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Delete All History</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-[#13142a] border-white/[0.08] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[15px] font-bold text-white tracking-tight text-red-500">Warning</AlertDialogTitle>
              <AlertDialogDescription className="text-[12px] text-white/45 leading-relaxed mt-2">
                This will delete every single chat history you have. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel className="h-9 rounded-lg bg-white/5 border-white/10 text-white font-semibold text-[11px] px-6">No, Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteHistory}
                className="h-9 rounded-lg bg-destructive text-white font-semibold text-[11px] border-none px-6"
              >
                Yes, Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          variant="ghost"
          onClick={() => {
            auth?.signOut();
            router.push('/');
          }}
          className="w-full justify-start gap-3 h-9 rounded-lg text-white font-semibold bg-white/[0.04] hover:bg-white/[0.08] transition-all border border-white/[0.06] text-[11px] uppercase tracking-wider"
        >
          <LogOut className="w-3.5 h-3.5 text-primary" />
          <span>Logout</span>
        </Button>
      </div>
    </aside>
  );
}

function SidebarNavButton({ icon, label, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('sidebar-nav-btn', active && 'active')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ProductNavButton({ product, pathname, onNavigate }: { product: ProductDefinition; pathname: string; onNavigate: () => void }) {
  const router = useRouter();
  const icons: Record<string, React.ReactNode> = {
    chat: <MessageSquare />,
    forge: <Sparkles />,
    laboratory: <FlaskConical />,
    academic: <BookOpenIcon />,
    intel: <Globe2 />,
    game: <Gamepad2 />,
  };

  return <SidebarNavButton
    icon={icons[product.id] || <Code2 />}
    label={product.shortName}
    active={pathname === product.route || pathname.startsWith(`${product.route}/`)}
    onClick={() => {
      router.push(product.route);
      onNavigate();
    }}
  />;
}

function BookOpenIcon() {
  return <BookOpen />;
}