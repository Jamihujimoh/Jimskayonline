"use client"

import { useEffect, useRef, useState, useCallback } from 'react';
import { checkLocalAgentTask } from '@/ai/flows/agent-task-status-flow';

export interface BackgroundTask {
  id: string;          // local id
  taskId?: string;     // RTDB task id from the local agent bridge
  command: string;     // human label, e.g. the terminal command
  tool: string;        // agent tool name
  device?: string;
  createdAt: number;
  status: 'pending' | 'running' | 'success' | 'error';
  resultText?: string;
  error?: string;
  background?: boolean;
}

const KEY = (userId: string) => `jimskay-bg-tasks-${userId}`;

function loadTasks(userId: string): BackgroundTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    return raw ? (JSON.parse(raw) as BackgroundTask[]) : [];
  } catch {
    return [];
  }
}

function persist(userId: string, tasks: BackgroundTask[]) {
  if (typeof window === 'undefined') return;
  // keep the most recent 50 tasks around
  window.localStorage.setItem(KEY(userId), JSON.stringify(tasks.slice(-50)));
  window.dispatchEvent(new CustomEvent('jimskay-bg-tasks-updated', { detail: userId }));
}

/**
 * Persistent background execution tracker.
 * - Tasks survive navigation, sleep, and full app restarts (localStorage).
 * - Status for unfinished tasks is re-polled from the Realtime Database so a
 *   task started before the app closed is found running/completed later.
 * - Never blocks the UI: everything runs detached from the chat message flow.
 */
export function useBackgroundTasks(userId?: string) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!userId) return;
    setTasks(loadTasks(userId));
    hydrated.current = true;
    const sync = () => setTasks(loadTasks(userId));
    window.addEventListener('jimskay-bg-tasks-updated', sync);
    return () => window.removeEventListener('jimskay-bg-tasks-updated', sync);
  }, [userId]);

  // Poll unfinished tasks (pending/running) every 5 seconds until they settle.
  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const tick = async () => {
      const current = loadTasks(userId);
      const unfinished = current.filter((t) => t.taskId && (t.status === 'pending' || t.status === 'running'));
      if (unfinished.length === 0) return;

      for (const t of unfinished) {
        try {
          const res = await checkLocalAgentTask(t.taskId!);
          if (!alive) return;
          const all = loadTasks(userId);
          const idx = all.findIndex((x) => x.id === t.id);
          if (idx === -1) continue;
          if (res.status && res.status !== all[idx].status) {
            all[idx] = {
              ...all[idx],
              status: res.status,
              resultText: res.output ? JSON.stringify(res.output) : all[idx].resultText,
              error: res.error,
            };
            persist(userId, all);
          }
        } catch {
          // device offline / transient error — keep polling
        }
      }
    };

    const interval = setInterval(tick, 5000);
    tick();
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [userId, tasks.length]);

  const registerTask = useCallback(
    (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'status'> & { status?: BackgroundTask['status'] }) => {
      if (!userId) return;
      const full: BackgroundTask = {
        id: `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        status: 'pending',
        ...task,
      };
      const next = [...loadTasks(userId), full];
      persist(userId, next);
      setTasks(next);
      return full;
    },
    [userId]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<BackgroundTask>) => {
      if (!userId) return;
      const next = loadTasks(userId).map((t) => (t.id === id ? { ...t, ...patch } : t));
      persist(userId, next);
      setTasks(next);
    },
    [userId]
  );

  const removeTask = useCallback(
    (id: string) => {
      if (!userId) return;
      const next = loadTasks(userId).filter((t) => t.id !== id);
      persist(userId, next);
      setTasks(next);
    },
    [userId]
  );

  const clearFinished = useCallback(() => {
    if (!userId) return;
    const next = loadTasks(userId).filter((t) => t.status === 'pending' || t.status === 'running');
    persist(userId, next);
    setTasks(next);
  }, [userId]);

  const activeCount = tasks.filter((t) => t.status === 'pending' || t.status === 'running').length;

  return { tasks, registerTask, updateTask, removeTask, clearFinished, activeCount };
}
