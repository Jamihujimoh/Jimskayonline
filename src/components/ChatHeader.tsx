"use client"

import { Menu, ChevronLeft, PanelLeftClose, Settings2, ShieldCheck, Loader2, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BackgroundTasksPanel } from '@/components/BackgroundTasks';
import type { InterfaceMode } from '@/components/AdminModeToggle';
import type { BackgroundTask } from '@/hooks/use-background-tasks';
import { cn } from '@/lib/utils';
import { CHAT_MODELS, type ChatModelId } from '@/lib/chat-models';

export function ChatHeader({
  onToggleSidebar,
  onToggleSidebarDesktop,
  onBack,
  onOpenSettings,
  interfaceMode,
  adminUnlocked,
  backgroundTasks,
  activeTaskCount,
  onRemoveTask,
  onClearFinishedTasks,
  selectedModel,
  onModelChange,
}: {
  onToggleSidebar: () => void;
  onToggleSidebarDesktop: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
  interfaceMode: InterfaceMode;
  adminUnlocked: boolean;
  backgroundTasks: BackgroundTask[];
  activeTaskCount: number;
  onRemoveTask: (id: string) => void;
  onClearFinishedTasks: () => void;
  selectedModel: ChatModelId;
  onModelChange: (model: ChatModelId) => void;
}) {
  const isAdminLive = interfaceMode === 'admin' && adminUnlocked;
  const statusLabel = isAdminLive
    ? 'Local Machine Control Active'
    : interfaceMode === 'admin'
      ? 'Admin Mode Locked'
      : 'Ask Mode';

  return (
    <header className="flex items-center justify-between px-3 sm:px-6 h-[72px] border-b border-white/[0.06] bg-background/80 backdrop-blur-xl relative z-[45] shrink-0">
      {/* Left: navigation + brand */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden rounded-full h-8 w-8 text-white/50 hover:bg-white/5 hover:text-white"
          onClick={onToggleSidebar}
          title="Open sidebar"
        >
          <Menu className="w-4 h-4" />
        </Button>

        <div className="hidden md:flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-8 w-8 text-white/35 hover:bg-white/5 hover:text-white"
            onClick={onBack}
            title="Back to home"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-8 w-8 text-white/35 hover:bg-white/5 hover:text-white"
            onClick={onToggleSidebarDesktop}
            title="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 min-w-0 pl-1">
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center text-white font-serif font-black text-2xl glow-primary">
              J
            </div>
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                isAdminLive ? 'bg-emerald-500 animate-pulse' : 'bg-primary/70'
              )}
            />
          </div>
          <div className="hidden sm:block min-w-0">
            <h2 className="text-[16px] font-bold leading-none tracking-tight text-white flex items-center gap-1.5 whitespace-nowrap">
              Digital Jimoh
              {interfaceMode === 'admin' && (
                <ShieldCheck className={cn('w-3.5 h-3.5 shrink-0', adminUnlocked ? 'text-emerald-400' : 'text-white/25')} />
              )}
            </h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className={cn('w-1 h-1 rounded-full', isAdminLive ? 'bg-emerald-500 animate-pulse' : 'bg-primary/70')} />
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/35 whitespace-nowrap truncate">
                {statusLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="block w-[145px] shrink-0 sm:w-[210px]">
          <label htmlFor="chat-model-selector" className="sr-only">Chat model</label>
          <select
            id="chat-model-selector"
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value as ChatModelId)}
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] font-semibold text-white/75 outline-none transition-colors hover:border-primary/40 focus:border-primary/60"
            title="Choose the model used for chat responses"
          >
            {CHAT_MODELS.map((model) => (
              <option key={model.id} value={model.id} className="bg-[#17182b] text-white">
                {model.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: tasks + settings only — everything else lives in the Control Center drawer */}
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'relative rounded-full h-8 w-8 text-white/40 hover:bg-white/5 hover:text-white',
                activeTaskCount > 0 && 'text-primary hover:text-primary'
              )}
              title="Background tasks"
            >
              {activeTaskCount > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />}
              {backgroundTasks.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full gradient-primary text-white text-[8px] font-black flex items-center justify-center">
                  {backgroundTasks.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={10} className="w-[420px] max-w-[92vw] glass-panel border-white/10 rounded-2xl p-3 shadow-2xl z-[200]">
            <BackgroundTasksPanel
              tasks={backgroundTasks}
              activeCount={activeTaskCount}
              onRemove={onRemoveTask}
              onClearFinished={onClearFinishedTasks}
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-8 w-8 text-white/40 hover:bg-white/5 hover:text-white"
          onClick={onOpenSettings}
          title="Control Center"
        >
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}