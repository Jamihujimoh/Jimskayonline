"use client"

import { useEffect, useState } from 'react';
import { ListTodo, Check, X, Trash2, Loader2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  /** User-touched flag: set when the user manually ticks/unticks an item so the AI's later emissions can't clobber their choice. */
  u?: boolean;
}

const TODOS_KEY = (chatId: string) => `jimskay-chat-todos-${chatId}`;

function loadTodos(chatId: string): TodoItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TODOS_KEY(chatId));
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(chatId: string, todos: TodoItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TODOS_KEY(chatId), JSON.stringify(todos));
  window.dispatchEvent(new CustomEvent('jimskay-todos-updated', { detail: chatId }));
}

export function clearAiTodos(chatId: string) {
  if (!chatId) return;
  if (loadTodos(chatId).length > 0) saveTodos(chatId, []);
}

function aiId(): string {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Live "Working plan" panel for a chat.
 * - AI-owned: every [TODOS] emission from the model REPLACES the visible list,
 *   so the panel always mirrors the AI's current mission state.
 * - The user can tick items off, edit any item inline, erase individual items,
 *   or clear the whole list — each manual toggle flags the item as user-touched.
 * - The panel only renders once the list actually has items (it disappears when
 *   the plan is empty or cleared).
 */
export function ChatTodos({ chatId, live = false }: { chatId?: string; live?: boolean }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    if (!chatId) return;
    setTodos(loadTodos(chatId));
    setHydrated(true);
    const sync = (e: Event) => {
      if ((e as CustomEvent).detail === chatId) setTodos(loadTodos(chatId));
    };
    window.addEventListener('jimskay-todos-updated', sync);
    return () => window.removeEventListener('jimskay-todos-updated', sync);
  }, [chatId]);

  if (!chatId || !hydrated || todos.length === 0) return null;

  const toggle = (id: string) => {
    const next = todos.map((t) => (t.id === id ? { ...t, done: !t.done, u: true } : t));
    setTodos(next);
    saveTodos(chatId, next);
  };

  const erase = (id: string) => {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    saveTodos(chatId, next);
  };

  const clearAll = () => {
    setTodos([]);
    saveTodos(chatId, []);
    setEditingId(null);
  };

  const startEdit = (t: TodoItem) => {
    setEditingId(t.id);
    setEditDraft(t.text);
  };

  const commitEdit = () => {
    const text = editDraft.trim();
    if (!text || !editingId) {
      setEditingId(null);
      return;
    }
    const next = todos.map((t) => (t.id === editingId ? { ...t, text } : t));
    setTodos(next);
    saveTodos(chatId, next);
    setEditingId(null);
  };

  const doneCount = todos.filter((t) => t.done).length;
  const progress = todos.length > 0 ? Math.round((doneCount / todos.length) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.05]">
        {live ? (
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
        ) : (
          <ListTodo className="w-3.5 h-3.5 text-primary/80 shrink-0" />
        )}
        <span className="text-[12px] font-semibold text-white/80">Working plan</span>
        <span className="text-[11px] text-white/30 font-medium ml-1">
          {doneCount}/{todos.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={clearAll}
            title="Erase all todos"
            className="p-1.5 rounded-md text-white/25 hover:text-destructive hover:bg-white/[0.05] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3.5 pt-2.5 pb-0.5">
        <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              progress === 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-primary/60 to-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ul className="px-2 py-1.5 space-y-0.5">
        {todos.map((t) => (
          <li key={t.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className={cn(
                'w-4 h-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-all',
                t.done ? 'bg-primary border-primary' : 'border-white/25 hover:border-primary/70'
              )}
            >
              {t.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />}
            </button>

            {editingId === t.id ? (
              <input
                autoFocus
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEdit();
                  }
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={commitEdit}
                className="flex-1 min-w-0 bg-black/20 border border-primary/30 rounded-md px-2 py-1 text-[13px] text-white/90 outline-none focus:border-primary/60"
              />
            ) : (
              <span
                className={cn(
                  'flex-1 text-[13px] leading-snug transition-colors',
                  t.done ? 'text-white/30 line-through' : 'text-white/80'
                )}
              >
                {t.text}
              </span>
            )}

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
              <button
                type="button"
                onClick={() => startEdit(t)}
                title="Edit"
                className="p-1 rounded text-white/25 hover:text-primary transition-colors"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => erase(t.id)}
                title="Remove"
                className="p-1 rounded text-white/25 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {live && (
        <div className="flex items-center gap-2 px-3.5 pb-3 pt-2 border-t border-white/[0.05] mt-0.5">
          <span className="thinking-dots shrink-0">
            <span className="bg-primary" />
            <span className="bg-primary" />
            <span className="bg-primary" />
          </span>
          <span className="text-[11px] text-primary/70 font-medium animate-pulse">
            Jimskay is working through this plan…
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Merge a parsed AI todo emission into the persisted chat todos (REPLACE semantics).
 * - The AI's [TODOS] array is the source of truth for what the list looks like:
 *   every item in the emission is carried over (first occurrence per normalized
 *   text), and stored items the AI no longer lists are dropped.
 * - An item the user manually checked (u:true) stays checked until the AI itself
 *   confirms it done:true — protecting the user's choice from memory slips.
 * - The refresh event only fires when something actually changed so every
 *   ChatTodos panel re-renders instantly.
 */
export function mergeAiTodos(chatId: string, aiTodos: Array<{ text: string; done?: boolean }>) {
  if (!chatId) return;
  const existing = loadTodos(chatId);
  const seen = new Map<string, TodoItem>();
  for (const t of existing) {
    const key = t.text.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, t);
  }
  const next: TodoItem[] = [];
  let changed = false;

  for (const ai of aiTodos) {
    const text = (ai.text || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const prev = seen.get(key);

    if (!prev) {
      // Brand-new item the AI just planned.
      next.push({ id: aiId(), text, done: !!ai.done, u: false });
      seen.set(key, next[next.length - 1]);
      changed = true;
    } else if (ai.done) {
      // AI confirms completion — mark done and clear the user-touch flag.
      if (!prev.done || prev.u) changed = true;
      const item = { ...prev, done: true, u: false };
      next.push(item);
      seen.set(key, item);
    } else if (prev.done && prev.u) {
      // User manually checked this item and the AI hasn't confirmed it — preserve.
      next.push({ ...prev });
    } else {
      // AI re-lists it as open — reset any stale done/user state.
      if (prev.done || prev.u) changed = true;
      const item = { ...prev, done: false, u: false };
      next.push(item);
      seen.set(key, item);
    }
  }

  // Items never re-listed by the AI are dropped (list shrinks / disappears).
  if (changed || next.length !== existing.length) saveTodos(chatId, next);
}
