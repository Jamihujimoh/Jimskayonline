/**
 * Shared PC/Android control hub.
 *
 * Both devices use the same /api/control/action route and the same ADMIN_PIN
 * authorization gate. PC actions execute locally; Android actions are delivered
 * to the paired Android companion over the Jimskay control HTTP channel.
 *
 * This intentionally does not use a Firebase service account. The hub is
 * process-local, so it is intended for a Jimskay server running on the user's
 * own PC/LAN. If the Next.js process restarts, Android simply reconnects.
 */
import crypto from 'crypto';

type Task = {
  id: string;
  target: 'pc' | 'phone';
  userId?: string;
  deviceId?: string;
  action: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  output?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
};

type PhoneSession = {
  deviceId: string;
  userId: string;
  name: string;
  lastSeen: number;
};

const tasks = new Map<string, Task>();
const phones = new Map<string, PhoneSession>();
const waiters = new Map<string, Set<() => void>>();
const TASK_TTL = 10 * 60_000;

function wake(taskId: string) {
  const set = waiters.get(taskId);
  if (!set) return;
  for (const fn of set) fn();
  waiters.delete(taskId);
}

function prune() {
  const cutoff = Date.now() - TASK_TTL;
  for (const [id, task] of tasks) if (task.createdAt < cutoff) tasks.delete(id);
  for (const [id, phone] of phones) if (phone.lastSeen < Date.now() - 120_000) phones.delete(id);
}

export function createPhoneTask(userId: string, deviceId: string, action: string, input: Record<string, unknown>) {
  prune();
  const id = `phone_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  tasks.set(id, { id, target: 'phone', userId, deviceId, action, input, status: 'pending', createdAt: Date.now() });
  return id;
}

export function createPcTask(command: string, input: Record<string, unknown>) {
  prune();
  const id = `pc_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  tasks.set(id, { id, target: 'pc', action: command, input, status: 'pending', createdAt: Date.now() });
  return id;
}

export function registerPhone(deviceId: string, userId: string, name: string) {
  phones.set(deviceId, { deviceId, userId, name: name || deviceId, lastSeen: Date.now() });
  return phones.get(deviceId)!;
}

export function touchPhone(deviceId: string, userId: string, name?: string) {
  const current = phones.get(deviceId);
  if (!current || current.userId !== userId) return false;
  current.lastSeen = Date.now();
  if (name) current.name = name;
  return true;
}

export function getPhone(deviceId: string, userId?: string) {
  const p = phones.get(deviceId);
  if (!p || (userId && p.userId !== userId)) return undefined;
  return p;
}

export function listPhones(userId: string) {
  prune();
  return [...phones.values()].filter(p => p.userId === userId).map(p => ({ ...p, online: Date.now() - p.lastSeen < 60_000 }));
}

export function claimNextPhoneTask(deviceId: string, userId: string) {
  prune();
  const task = [...tasks.values()]
    .filter(t => t.target === 'phone' && t.deviceId === deviceId && t.userId === userId && t.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!task) return null;
  task.status = 'running';
  task.startedAt = Date.now();
  return task;
}

export function completePhoneTask(taskId: string, deviceId: string, userId: string, ok: boolean, output?: unknown, error?: string) {
  const task = tasks.get(taskId);
  if (!task || task.target !== 'phone' || task.deviceId !== deviceId || task.userId !== userId) return false;
  task.status = ok ? 'success' : 'error';
  task.output = output;
  task.error = error;
  task.completedAt = Date.now();
  wake(taskId);
  return true;
}

export function getTask(taskId: string) { return tasks.get(taskId); }

export async function waitForTask(taskId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = tasks.get(taskId);
    if (!task) return { ok: false, error: 'Task not found.' };
    if (task.status === 'success') return { ok: true, output: task.output, task };
    if (task.status === 'error') return { ok: false, error: task.error || 'Phone task failed.', task };
    await new Promise<void>(resolve => {
      const set = waiters.get(taskId) || new Set<() => void>();
      set.add(resolve);
      waiters.set(taskId, set);
      const remaining = Math.max(1, deadline - Date.now());
      setTimeout(() => { set.delete(resolve); resolve(); }, Math.min(remaining, 1000));
    });
  }
  return { ok: false, error: `TIMEOUT: device did not finish within ${Math.round(timeoutMs / 1000)}s`, task: tasks.get(taskId) };
}

export function validateControlPin(pin: unknown) {
  const expected = process.env.ADMIN_PIN?.trim();
  return !!expected && typeof pin === 'string' && pin.trim() === expected;
}
