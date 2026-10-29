"use client"

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminModeToggle } from '@/components/AdminModeToggle';
import { BackgroundTasksPanel } from '@/components/BackgroundTasks';
import { useUser, useFirestore } from '@/firebase';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { InterfaceMode } from '@/components/AdminModeToggle';
import type { BackgroundTask } from '@/hooks/use-background-tasks';
import {
  Globe,
  Loader2,
  Search,
  FileText,
  Trash2,
  Settings2,
  ShieldCheck,
  Lock,
  CheckCircle2,
  X,
  Layers,
  Cpu,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChatSettingsDrawer({
  open,
  onOpenChange,
  interfaceMode,
  adminUnlocked,
  onModeChange,
  onUnlockedChange,
  searchQuery,
  onSearchQueryChange,
  onWebSearch,
  isSearching,
  backgroundTasks,
  activeTaskCount,
  onRemoveTask,
  onClearFinishedTasks,
  currentChatId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interfaceMode: InterfaceMode;
  adminUnlocked: boolean;
  onModeChange: (mode: InterfaceMode) => void;
  onUnlockedChange: (unlocked: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onWebSearch: (e?: React.FormEvent) => void;
  isSearching: boolean;
  backgroundTasks: BackgroundTask[];
  activeTaskCount: number;
  onRemoveTask: (id: string) => void;
  onClearFinishedTasks: () => void;
  currentChatId: string | null;
}) {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isClearing, setIsClearing] = useState(false);
  const [uidCopied, setUidCopied] = useState(false);

  const isAdminLive = interfaceMode === 'admin' && adminUnlocked;

  const handleClearMessages = async () => {
    if (!user || !db || !currentChatId || isClearing) return;
    const confirmed = window.confirm('Clear conversation history?');
    if (!confirmed) return;
    setIsClearing(true);
    try {
      const messagesRef = collection(db, 'users', user.uid, 'chats', currentChatId, 'messages');
      const snap = await getDocs(messagesRef);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      toast({ title: 'Memory Wiped' });
    } catch {
      toast({ variant: 'destructive', title: 'Action Failed' });
    } finally {
      setIsClearing(false);
    }
  };

  const handleExportChat = async () => {
    if (!user || !db || !currentChatId) {
      toast({ title: 'No active session' });
      return;
    }
    try {
      const messagesRef = collection(db, 'users', user.uid, 'chats', currentChatId, 'messages');
      const snap = await getDocs(messagesRef);
      const text = snap.docs
        .map((doc) => {
          const data = doc.data();
          const role = data.role === 'user' ? 'USER' : 'JIMSKAY';
          return `[${data.timestamp?.toDate()?.toLocaleString() || 'N/A'}] ${role}:\n${data.content}`;
        })
        .join('\n\n---\n\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${currentChatId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Transcript Exported' });
    } catch {
      toast({ variant: 'destructive', title: 'Export Failed' });
    }
  };

  const handleCopyUid = async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setUidCopied(true);
      window.setTimeout(() => setUidCopied(false), 1800);
      toast({ title: 'User ID copied' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy user ID' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] max-w-[94vw] sm:max-w-[440px] border-l border-white/[0.07] bg-[#0b0c1c]/98 backdrop-blur-3xl p-0 overflow-y-auto custom-scrollbar"
      >
        <SheetHeader className="px-5 py-4 border-b border-white/[0.06] flex flex-row items-center justify-between gap-2">
          <SheetTitle className="flex items-center gap-2.5 text-[13px] font-black uppercase tracking-[0.25em] text-white/90">
            <span className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Settings2 className="w-3.5 h-3.5 text-primary" />
            </span>
            Control Center
          </SheetTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 rounded-full flex items-center justify-center text-white/40 hover:bg-white/[0.06] hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </SheetHeader>

        <div className="p-5 space-y-7">
          {user?.uid && <section className="space-y-3">
            <SectionLabel icon={<Settings2 className="w-3.5 h-3.5" />} text="Account" />
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-white/90">Firebase user ID</p>
                <p className="mt-1 break-all font-mono text-[11px] text-white/45">{user.uid}</p>
              </div>
              <Button type="button" size="icon" variant="outline" onClick={handleCopyUid} title="Copy user ID" aria-label="Copy Firebase user ID">
                {uidCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </section>}

          {/* ── Interface mode ─────────────────────────────────── */}
          <section className="space-y-3">
            <SectionLabel icon={<Layers className="w-3.5 h-3.5" />} text="Interface Mode" />
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white/90">
                  {interfaceMode === 'admin' ? 'Admin Mode' : 'Ask Mode'}
                </p>
                <p className="text-[11px] text-white/40 leading-snug mt-1">
                  {isAdminLive
                    ? 'Local machine control active — terminal, files, system.'
                    : interfaceMode === 'admin'
                      ? 'Locked — PIN required for local machine control.'
                      : 'Cloud knowledge, reasoning and document engine.'}
                </p>
              </div>
              <AdminModeToggle
                mode={interfaceMode}
                unlocked={adminUnlocked}
                onModeChange={onModeChange}
                onUnlockedChange={onUnlockedChange}
              />
            </div>
            {interfaceMode === 'admin' && (
              <p
                className={cn(
                  'flex items-center gap-2 text-[11px] font-semibold px-1',
                  isAdminLive ? 'text-emerald-400/90' : 'text-amber-400/80'
                )}
              >
                {isAdminLive ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Local Agent Ready — long tasks keep running in the background even if you close the app or your PC sleeps.
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Enter your PIN to grant the AI terminal and file access on this machine.
                  </>
                )}
              </p>
            )}
            {interfaceMode === 'ask' && (
              <p className="flex items-center gap-2 text-[11px] font-semibold text-white/35 px-1">
                <ShieldCheck className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                Ask mode — cloud knowledge and document engine, no local access.
              </p>
            )}
          </section>

          {/* ── Web search ─────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionLabel icon={<Globe className="w-3.5 h-3.5" />} text="Web Search" />
            <form
              onSubmit={onWebSearch}
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1.5 focus-within:border-primary/40 transition-colors"
            >
              <Globe className="w-4 h-4 text-primary/70 shrink-0 ml-2" />
              <Input
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search the web…"
                disabled={isSearching}
                className="h-9 flex-1 bg-transparent border-0 text-[13px] text-white placeholder:text-white/25 focus-visible:ring-0"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!searchQuery.trim() || isSearching}
                className="h-9 w-9 rounded-lg gradient-primary text-white shrink-0"
                title="Run search"
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </Button>
            </form>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20 px-1">
              Results appear in the conversation as a message.
            </p>
          </section>

          {/* ── Background tasks ───────────────────────────────── */}
          <section className="space-y-3">
            <SectionLabel icon={<Cpu className="w-3.5 h-3.5" />} text="Background Tasks" />
            <BackgroundTasksPanel
              tasks={backgroundTasks}
              activeCount={activeTaskCount}
              onRemove={onRemoveTask}
              onClearFinished={onClearFinishedTasks}
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20 px-1">
              Tasks run on the local agent — they survive navigation, sleep and app restarts.
            </p>
          </section>

          {/* ── Chat tools ─────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} text="Session Tools" />
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="ghost"
                onClick={handleExportChat}
                disabled={!currentChatId}
                className="w-full justify-start gap-3 h-10 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.05] font-semibold text-[12px] border border-white/[0.06]"
              >
                <FileText className="w-4 h-4 text-accent" />
                Export Transcript
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleClearMessages}
                disabled={isClearing || !currentChatId}
                className="w-full justify-start gap-3 h-10 rounded-xl text-white/70 hover:text-destructive hover:bg-destructive/10 font-semibold text-[12px] border border-white/[0.06]"
              >
                {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Wipe Conversation Memory
              </Button>
            </div>
          </section>
        </div>

        <div className="px-5 pb-6 pt-2">
          <p className="text-center text-[9px] font-black uppercase tracking-[0.3em] text-white/15">
            Jimskay AI · Neural Link Operational
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary/80">{icon}</span>
      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/45">{text}</span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}