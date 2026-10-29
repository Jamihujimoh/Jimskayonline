import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export type AdminTaskStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface AdminTaskState {
  id: string;
  goal: string;
  status: AdminTaskStatus;
  phase: 'plan' | 'observe' | 'act' | 'verify' | 'recover' | 'complete';
  startedAt: string;
  updatedAt: string;
  rounds: number;
  lastAction?: string;
  lastVerification?: string;
  error?: string;
  events?: Array<{ at: string; type: 'phase' | 'action' | 'verification' | 'error'; message: string }>;
}

const STATE_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'JimskayAI');
const STATE_FILE = path.join(STATE_DIR, 'admin-tasks.json');
const MAX_TASKS = 100;

async function readAll(): Promise<AdminTaskState[]> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(tasks: AdminTaskState[]): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(tasks.slice(-MAX_TASKS), null, 2), 'utf8');
  await fs.rename(tmp, STATE_FILE);
}

export async function createAdminTask(goal: string): Promise<AdminTaskState> {
  const now = new Date().toISOString();
  const task: AdminTaskState = {
    id: crypto.randomUUID(),
    goal: goal.slice(0, 2000),
    status: 'running',
    phase: 'plan',
    startedAt: now,
    updatedAt: now,
    rounds: 0,
    events: [{ at: now, type: 'phase', message: 'Task created; planning started.' }],
  };
  const tasks = await readAll();
  tasks.push(task);
  await writeAll(tasks);
  return task;
}

export async function updateAdminTask(id: string, patch: Partial<AdminTaskState>): Promise<AdminTaskState | null> {
  const tasks = await readAll();
  const index = tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const previous = tasks[index];
  const next = { ...previous, ...patch, updatedAt: now };
  const events = [...(previous.events || [])];
  if (patch.phase && patch.phase !== previous.phase) events.push({ at: now, type: 'phase' as const, message: `Phase changed: ${patch.phase}` });
  if (patch.lastAction && patch.lastAction !== previous.lastAction) events.push({ at: now, type: 'action' as const, message: patch.lastAction });
  if (patch.lastVerification && patch.lastVerification !== previous.lastVerification) events.push({ at: now, type: 'verification' as const, message: patch.lastVerification.slice(0, 1000) });
  if (patch.error && patch.error !== previous.error) events.push({ at: now, type: 'error' as const, message: patch.error.slice(0, 1000) });
  next.events = events.slice(-200);
  tasks[index] = next;
  await writeAll(tasks);
  return tasks[index];
}

export async function getAdminTask(id: string): Promise<AdminTaskState | null> {
  const tasks = await readAll();
  return tasks.find((t) => t.id === id) || null;
}

export async function listAdminTasks(limit = 20): Promise<AdminTaskState[]> {
  const tasks = await readAll();
  return tasks.slice(-Math.max(1, Math.min(limit, MAX_TASKS))).reverse();
}
