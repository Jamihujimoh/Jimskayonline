"use client"

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ListOrdered, Terminal, Loader2, CheckCircle2, XCircle, Clock, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { BackgroundTask } from '@/hooks/use-background-tasks';
import { cn } from '@/lib/utils';

function TaskRow({ task, onRemove }: { task: BackgroundTask; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const output = task.resultText || task.error || '';

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3 text-white/25 shrink-0" /> : <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />}
        {task.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin shrink-0" />}
        {task.status === 'pending' && <Clock className="w-3.5 h-3.5 text-primary/70 shrink-0" />}
        {task.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
        {task.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/85 truncate font-mono">{task.command || task.tool}</p>
          <p className="text-[10px] text-white/30 font-medium">
            {task.device ? `${task.device} · ` : ''}
            {new Date(task.createdAt).toLocaleTimeString()}
            {task.background ? ' · background' : ''}
          </p>
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1.5 rounded text-white/20 hover:text-destructive hover:bg-white/[0.05] transition-colors shrink-0"
          title="Remove from list"
        >
          <Trash2 className="w-3 h-3" />
        </span>
      </button>
      {open && output && (
        <pre className="mx-3 mb-3 p-2.5 rounded-lg bg-black/40 border border-white/[0.06] font-mono text-[11px] leading-relaxed text-white/70 overflow-x-auto custom-scrollbar whitespace-pre-wrap break-all max-h-48">
          {output.length > 4000 ? output.slice(0, 4000) + '\n...[truncated]' : output}
        </pre>
      )}
    </div>
  );
}

/** Shared task-list body used by both the header dock popover and the settings drawer. */
export function BackgroundTasksPanel({
  tasks,
  activeCount,
  onRemove,
  onClearFinished,
}: {
  tasks: BackgroundTask[];
  activeCount: number;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-2.5">
        <Terminal className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Background Tasks</span>
        {activeCount > 0 && (
          <span className="text-[10px] font-bold text-primary animate-pulse ml-auto">
            {activeCount} running
          </span>
        )}
        {tasks.length > 0 && activeCount === 0 && (
          <button
            type="button"
            onClick={onClearFinished}
            className="ml-auto text-[10px] font-bold text-white/30 hover:text-white/70 uppercase tracking-widest"
          >
            Clear
          </button>
        )}
      </div>
      {tasks.length === 0 ? (
        <div className="px-3 py-5 text-center rounded-xl border border-dashed border-white/[0.08]">
          <p className="text-[12px] text-white/35 font-medium">No background tasks yet.</p>
          <p className="text-[10px] text-white/20 font-medium mt-1">
            Long-running terminal commands started in admin mode keep running here — even if you close the app or your PC sleeps.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
          {[...tasks].reverse().map((t) => (
            <TaskRow key={t.id} task={t} onRemove={() => onRemove(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BackgroundTasksDock({
  tasks,
  activeCount,
  onRemove,
  onClearFinished,
}: {
  tasks: BackgroundTask[];
  activeCount: number;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative rounded-full h-8 w-8 text-white/40 hover:bg-white/5 hover:text-white',
            activeCount > 0 && 'text-primary hover:text-primary'
          )}
          title="Background tasks"
        >
          {activeCount > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />}
          {tasks.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full gradient-primary text-white text-[8px] font-black flex items-center justify-center">
              {tasks.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[420px] max-w-[92vw] glass-panel border-white/10 rounded-2xl p-3 shadow-2xl z-[200]">
        <BackgroundTasksPanel
          tasks={tasks}
          activeCount={activeCount}
          onRemove={onRemove}
          onClearFinished={onClearFinished}
        />
      </PopoverContent>
    </Popover>
  );
}