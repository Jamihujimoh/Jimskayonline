import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

export type ScheduledAction = {
  id: string;
  runAt: string;
  action: 'openUrl' | 'launchApp';
  value: string;
  createdAt: string;
  status: 'scheduled' | 'completed' | 'failed' | 'cancelled';
  error?: string;
};

const STORE_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'JimskayAI');
const STORE_FILE = path.join(STORE_DIR, 'scheduled-actions.json');
const timers = new Map<string, NodeJS.Timeout>();
let initialized = false;

async function readAll(): Promise<ScheduledAction[]> {
  try { return JSON.parse(await fs.readFile(STORE_FILE, 'utf8')); } catch { return []; }
}
async function writeAll(items: ScheduledAction[]) {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), 'utf8');
}

async function execute(item: ScheduledAction) {
  try {
    if (process.platform !== 'win32') throw new Error('Scheduled desktop actions currently require Windows.');
    if (item.action === 'openUrl') {
      const u = new URL(item.value);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https URLs are allowed.');
      const child = spawn('cmd.exe', ['/d','/c','start','',u.toString()], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } else {
      const child = spawn('cmd.exe', ['/d','/s','/c', item.value], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    }
    const all = await readAll();
    const found = all.find(x => x.id === item.id);
    if (found) found.status = 'completed';
    await writeAll(all);
  } catch (e: any) {
    const all = await readAll();
    const found = all.find(x => x.id === item.id);
    if (found) { found.status = 'failed'; found.error = e?.message || String(e); }
    await writeAll(all);
  } finally { timers.delete(item.id); }
}

function arm(item: ScheduledAction) {
  if (item.status !== 'scheduled') return;
  const delay = new Date(item.runAt).getTime() - Date.now();
  if (delay <= 0) { void execute(item); return; }
  // setTimeout is limited on Node, so long schedules are re-armed in safe chunks.
  const chunk = Math.min(delay, 2_000_000_000);
  const timer = setTimeout(() => { timers.delete(item.id); arm(item); }, chunk);
  timers.set(item.id, timer);
}

export async function initScheduler() {
  if (initialized) return;
  initialized = true;
  const all = await readAll();
  for (const item of all) {
    if (item.status !== 'scheduled') continue;
    if (new Date(item.runAt).getTime() <= Date.now()) void execute(item); else arm(item);
  }
}

export async function scheduleAdminAction(input: { runAt: string; action: 'openUrl' | 'launchApp'; value: string }) {
  await initScheduler();
  const when = new Date(input.runAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return { error: 'runAt must be a valid future date/time.' };
  if (input.action === 'openUrl') {
    const u = new URL(input.value);
    if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Only http/https URLs can be scheduled.' };
  }
  const item: ScheduledAction = {
    id: `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    runAt: when.toISOString(), action: input.action, value: input.value,
    createdAt: new Date().toISOString(), status: 'scheduled',
  };
  const all = await readAll(); all.push(item); await writeAll(all); arm(item);
  return item;
}

export async function listScheduledActions() { await initScheduler(); return { items: await readAll() }; }

export async function cancelScheduledAction(id: string) {
  await initScheduler();
  const timer = timers.get(id); if (timer) clearTimeout(timer); timers.delete(id);
  const all = await readAll(); const item = all.find(x => x.id === id);
  if (!item) return { error: 'Scheduled action not found.' };
  item.status = 'cancelled'; await writeAll(all); return item;
}

void initScheduler();
