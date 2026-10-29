/**
 * local-agent-bridge.ts
 *
 * Server-side bridge that lets the Gemini chat "brain" command the local
 * "hands" daemon (local-agent/agent.mjs) running on the user's PC.
 *
 * Flow:
 *   1. Find the device paired to the signed-in user (devices/{deviceId}.userId)
 *   2. Create a pending task in Realtime Database (tasks/{taskId})
 *   3. The local agent polls Realtime Database, executes the tool on the PC, writes back
 *   4. We poll the task until it reaches success/error and return the result
 *
 * Uses only Node built-ins (fetch + crypto) with a Firebase service account,
 * so it works in the Next.js standalone server bundled inside the Electron app.
 */

import { createSign, randomInt } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const AGENT_TOOLS = [
  'runTerminalCommand',
  'readFile',
  'writeFile',
  'listDirectory',
  'getSystemInfo',
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export const ANDROID_AGENT_ACTIONS = [
  // High-level agent primitives. The model can observe, plan, execute, verify and recover.
  'observe',
  'runPlan',
  'verify',
  // UI/app primitives retained for direct execution and backward compatibility.
  'openApp',
  'listApps',
  'openUrl',
  'searchWeb',
  'readScreen',
  'tapText',
  'tap',
  'longPress',
  'typeText',
  'clearText',
  'swipe',
  'scroll',
  'pressKey',
  'globalAction',
  'openSettings',
  'launchIntent',
  // Files on user-accessible shared storage.
  'pickFile',
  'listDirectory',
  'readFile',
  'writeFile',
  'createDirectory',
  'renameFile',
  'moveFile',
  'copyFile',
  'deleteFile',
  'getFileInfo',
  'getSystemInfo',
] as const;

export type AndroidAgentAction = (typeof ANDROID_AGENT_ACTIONS)[number];


interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface TaskResult {
  ok: boolean;
  device?: string;
  deviceId?: string;
  taskId?: string;
  pending?: boolean;
  resultText?: string;
  error?: string;
}

let cachedSa: ServiceAccount | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function resolveServiceAccountPath(): string {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  }
  const candidates = [
    path.join(process.cwd(), 'local-agent', 'service-account.json'),
    path.join(process.cwd(), 'desktop', 'next-server', 'local-agent', 'service-account.json'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_PATH is not set and no bundled service-account.json was found.'
  );
}

function loadServiceAccount(): ServiceAccount {
  if (cachedSa) return cachedSa;
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const raw = inline ? JSON.parse(inline) : JSON.parse(readFileSync(resolveServiceAccountPath(), 'utf8'));
  if (!raw?.client_email || !raw?.private_key || !raw?.project_id) {
    throw new Error('Firebase service-account configuration is incomplete.');
  }
  cachedSa = raw as ServiceAccount;
  return cachedSa;
}

async function getAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid: 'hackerai-server',
    })
  ).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(header + '.' + claims);
  const customToken = header + '.' + claims + '.' + sign.sign(sa.private_key, 'base64url');
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('Firebase API key is not configured for custom-token exchange.');
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = (await res.json()) as { idToken?: string; expiresIn?: string };
  if (!res.ok || !data.idToken) {
    throw new Error('OAuth token fetch failed: ' + JSON.stringify(data).slice(0, 200));
  }
  cachedToken = {
    token: data.idToken,
    expiresAt: Date.now() + (Number(data.expiresIn) || 3600) * 1000,
  };
  return data.idToken;
}

function databaseBase(): string {
  const configured = process.env.FIREBASE_DATABASE_URL?.replace(/\/+$/, '');
  return configured || `https://${loadServiceAccount().project_id}-default-rtdb.firebaseio.com`;
}

async function databaseFetch(method: string, pathName: string, body?: unknown): Promise<any> {
  const token = await getAccessToken();
  const url = `${databaseBase()}/${pathName.replace(/^\/+/, '')}.json?auth=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Realtime Database ${method} ${pathName} -> ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const PHONE_PAIRING_TTL_MS = 5 * 60_000;

export async function createPhonePairingCode(userId: string): Promise<{ code: string; expiresAt: number }> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || normalizedUserId.length > 128) {
    throw new Error('A valid user ID is required to create a phone pairing code.');
  }

  const now = Date.now();
  const expiresAt = now + PHONE_PAIRING_TTL_MS;
  let code = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = String(randomInt(10_000_000, 100_000_000));
    const existing = await databaseFetch('GET', `phonePairings/${candidate}`);
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('Could not generate a unique phone pairing code. Please try again.');

  await databaseFetch('PUT', `phonePairings/${code}`, { userId: normalizedUserId, createdAt: now, expiresAt });
  return { code, expiresAt };
}

async function consumePhonePairingCode(code: string): Promise<{ userId: string; expiresAt: number }> {
  const normalizedCode = code.trim();
  if (!/^\d{8}$/.test(normalizedCode)) {
    throw new Error('Pairing code is invalid or has already been used.');
  }

  const token = await getAccessToken();
  const url = `${databaseBase()}/phonePairings/${normalizedCode}.json?auth=${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
  if (!response.ok) throw new Error(`Realtime Database pairing lookup failed: ${response.status} ${response.statusText}`);
  const etag = response.headers.get('etag');
  const pairing = await response.json() as { userId?: unknown; expiresAt?: unknown } | null;
  if (!pairing || typeof pairing.userId !== 'string' || typeof pairing.expiresAt !== 'number' || !etag) {
    throw new Error('Pairing code is invalid or has already been used.');
  }
  if (pairing.expiresAt <= Date.now()) throw new Error('Phone pairing code has expired.');

  const consumed = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'if-match': etag },
    body: 'null',
  });
  if (consumed.status === 412) throw new Error('Pairing code is invalid or has already been used.');
  if (!consumed.ok) throw new Error(`Realtime Database pairing consumption failed: ${consumed.status} ${consumed.statusText}`);

  return { userId: pairing.userId, expiresAt: pairing.expiresAt };
}

export async function completePhonePairing(
  code: string,
  deviceId: string,
  deviceName: string,
  authUid: string
): Promise<{ deviceId: string; userId: string; name: string; pairedAt: number }> {
  const normalizedDeviceId = deviceId.trim();
  const normalizedAuthUid = authUid.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalizedDeviceId)) {
    throw new Error('Invalid Android device ID.');
  }
  if (!normalizedAuthUid || normalizedAuthUid.length > 128) {
    throw new Error('Invalid Android Firebase authentication ID.');
  }

  const pairing = await consumePhonePairingCode(code);
  const existing = await databaseFetch('GET', `devices/${normalizedDeviceId}`);
  if (existing?.userId && existing.userId !== pairing.userId) {
    throw new Error('This Android device is already paired to another user.');
  }

  const pairedAt = Date.now();
  const name = deviceName.trim().slice(0, 100) || 'Android phone';
  await databaseFetch('PUT', `devices/${normalizedDeviceId}`, {
    userId: pairing.userId,
    authUid: normalizedAuthUid,
    deviceType: 'android',
    name,
    pairedAt,
    lastSeen: pairedAt,
  });
  return { deviceId: normalizedDeviceId, userId: pairing.userId, name, pairedAt };
}

// ---------- device discovery ----------
async function findPairedDevices(userId: string): Promise<Array<Record<string, any>>> {
  const devices = await databaseFetch('GET', 'devices');
  return Object.entries(devices || {})
    .map(([id, device]) => ({ id, ...(device as Record<string, any>) } as Record<string, any>))
    .filter((device) => device.userId === userId)
    .slice(0, 5);
}

function normalizedPhoneDeviceId(deviceId: string): string {
  const value = deviceId.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw new Error('Invalid Android device ID.');
  return value;
}

export async function registerAndroidPhone(deviceId: string, userId: string, name: string) {
  const id = normalizedPhoneDeviceId(deviceId);
  const owner = userId.trim();
  if (!owner || owner.length > 128) throw new Error('A valid user ID is required.');
  const existing = await databaseFetch('GET', `devices/${id}`);
  if (existing?.userId && existing.userId !== owner) throw new Error('This Android phone is paired to another user.');
  const now = Date.now();
  const phone = {
    userId: owner,
    deviceType: 'android',
    name: name.trim().slice(0, 100) || id,
    lastSeen: now,
  };
  await databaseFetch('PATCH', `devices/${id}`, phone);
  return { deviceId: id, ...phone, online: true };
}

export async function touchAndroidPhone(deviceId: string, userId: string, name?: string): Promise<boolean> {
  const id = normalizedPhoneDeviceId(deviceId);
  const owner = userId.trim();
  const existing = await databaseFetch('GET', `devices/${id}`);
  if (!existing || existing.userId !== owner || existing.deviceType !== 'android') return false;
  await databaseFetch('PATCH', `devices/${id}`, {
    ...(name?.trim() ? { name: name.trim().slice(0, 100) } : {}),
    lastSeen: Date.now(),
  });
  return true;
}

export async function listAndroidPhones(userId: string) {
  const devices = await findPairedDevices(userId);
  return devices
    .filter((device) => device.deviceType === 'android')
    .map((device) => ({
      deviceId: String(device.id),
      name: String(device.name || device.id),
      lastSeen: Number(device.lastSeen || 0),
      online: Date.now() - Number(device.lastSeen || 0) < 60_000,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function createAndroidPhoneTask(
  deviceId: string,
  userId: string,
  action: string,
  input: Record<string, unknown>
): Promise<string> {
  const id = normalizedPhoneDeviceId(deviceId);
  const taskId = `phone_${Date.now().toString(36)}_${randomInt(0, 0x100000000).toString(16)}`;
  await databaseFetch('PUT', `phoneTasks/${id}/${taskId}`, {
    id: taskId,
    deviceId: id,
    userId,
    action,
    input,
    status: 'pending',
    createdAt: Date.now(),
  });
  return taskId;
}

export async function claimAndroidPhoneTask(deviceId: string, userId: string) {
  const id = normalizedPhoneDeviceId(deviceId);
  const phone = await databaseFetch('GET', `devices/${id}`);
  if (!phone || phone.userId !== userId || phone.deviceType !== 'android') return null;

  const token = await getAccessToken();
  const url = `${databaseBase()}/phoneTasks/${id}.json?auth=${encodeURIComponent(token)}`;
  const response = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
  if (!response.ok) throw new Error(`Realtime Database phone task lookup failed: ${response.status} ${response.statusText}`);
  const etag = response.headers.get('etag');
  const tasks = await response.json() as Record<string, Record<string, any>> | null;
  if (!tasks || !etag) return null;

  const nextTask = Object.entries(tasks)
    .filter(([, task]) => task?.userId === userId && task?.status === 'pending')
    .sort(([, a], [, b]) => Number(a.createdAt || 0) - Number(b.createdAt || 0))[0];
  if (!nextTask) return null;

  const [taskId, task] = nextTask;
  if (typeof task.action !== 'string' || !ANDROID_AGENT_ACTIONS.includes(task.action as AndroidAgentAction)) return null;
  const taskInput = task.input && typeof task.input === 'object' && !Array.isArray(task.input)
    ? task.input as Record<string, unknown>
    : {};
  const claimed = { ...task, status: 'running', startedAt: Date.now() };
  const updated = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'if-match': etag },
    body: JSON.stringify({ ...tasks, [taskId]: claimed }),
  });
  if (updated.status === 412) return null;
  if (!updated.ok) throw new Error(`Realtime Database phone task claim failed: ${updated.status} ${updated.statusText}`);
  return { id: taskId, action: task.action, input: taskInput };
}

export async function completeAndroidPhoneTask(
  deviceId: string,
  userId: string,
  taskId: string,
  success: boolean,
  output?: unknown,
  error?: string
): Promise<boolean> {
  const id = normalizedPhoneDeviceId(deviceId);
  const taskPath = `phoneTasks/${id}/${taskId}`;
  const task = await databaseFetch('GET', taskPath);
  if (!task || task.deviceId !== id || task.userId !== userId) return false;
  await databaseFetch('PATCH', taskPath, {
    status: success ? 'success' : 'error',
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {}),
    completedAt: Date.now(),
  });
  return true;
}

export async function getAndroidPhoneTaskStatus(userId: string, deviceId: string, taskId: string) {
  if (!/^phone_[a-z0-9]+_[a-f0-9]+$/i.test(taskId)) return null;
  const id = normalizedPhoneDeviceId(deviceId);
  const task = await databaseFetch('GET', `phoneTasks/${id}/${taskId}`);
  if (!task || task.userId !== userId || task.deviceId !== id) return null;
  const taskStatus = (['pending', 'running', 'success', 'error'] as const).find((status) => status === task.status);
  if (!taskStatus) return null;
  return {
    taskId,
    status: taskStatus,
    action: String(task.action || ''),
    output: task.output,
    error: task.error,
    createdAt: Number(task.createdAt || 0),
    completedAt: Number(task.completedAt || 0),
  };
}

// ---------- task lifecycle ----------
async function createTask(
  deviceId: string,
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const taskId = 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  await databaseFetch('PUT', `tasks/${taskId}`, {
    deviceId,
    userId,
    name,
    input,
    status: 'pending',
    createdAt: Date.now(),
  });
  return taskId;
}

async function pollTask(taskId: string, timeoutMs: number): Promise<{ ok: boolean; output?: any; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    const data = await databaseFetch('GET', `tasks/${taskId}`) || {};
    if (data.status === 'success') return { ok: true, output: data.output };
    if (data.status === 'error') {
      return { ok: false, error: data.error || 'task failed', output: data.output };
    }
    // pending / running -> keep waiting
  }
  return { ok: false, error: `TIMEOUT: device did not finish within ${Math.round(timeoutMs / 1000)}s` };
}

// ---------- public API ----------
/**
 * Reads the current status of a task directly from the Realtime Database.
 * Safe to call any number of times — used by the UI to resume watching a
 * background task after the app was closed or the machine went to sleep.
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  try {
    if (!taskId) return { ok: false, error: 'No taskId provided.' };
    const data = await databaseFetch('GET', `tasks/${taskId}`);
    if (!data || Object.keys(data).length === 0) {
      return { ok: false, error: 'Task not found.' };
    }
    return {
      ok: data.status === 'success',
      status: data.status,
      output: data.output,
      error: data.error,
      createdAt: data.createdAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
    };
  } catch (e: any) {
    return { ok: false, error: 'Task status lookup failed: ' + (e?.message || String(e)) };
  }
}
export interface LocalAgentRequest {
  userId?: string;
  tool: string;
  input?: Record<string, unknown>;
  confirm?: boolean;
  timeoutMs?: number;
  /**
   * When true, the task is queued on the device and this call returns the
   * taskId immediately without blocking. The task keeps running (or waits to
   * run) inside the Realtime Database so the user can close the app, sleep,
   * or navigate away and check the result later via getTaskStatus().
   */
  fireAndForget?: boolean;
}

export interface TaskStatus {
  ok: boolean;
  status?: 'pending' | 'running' | 'success' | 'error';
  output?: any;
  error?: string;
  createdAt?: number;
  startedAt?: number;
  completedAt?: number;
}

export async function runLocalAgentTask(req: LocalAgentRequest): Promise<TaskResult> {
  try {
    if (!req.userId) {
      return { ok: false, error: 'No signed-in user id was provided to the local agent.' };
    }
    if (!AGENT_TOOLS.includes(req.tool as AgentTool)) {
      return {
        ok: false,
        error: `Unknown tool "${req.tool}". Valid tools: ${AGENT_TOOLS.join(', ')}`,
      };
    }

    const devices = await findPairedDevices(req.userId);
    if (devices.length === 0) {
      return {
        ok: false,
        error:
          'NO_PAIRED_DEVICE: No desktop device is paired to this account. Open the Jimskay AI app on your PC so the local agent registers, then pair it in the app.',
      };
    }
    const device = devices[0];
    const lastSeen = Number(device.lastSeen || 0);
    const online = Date.now() - lastSeen < 90_000;
    if (!online) {
      return {
        ok: false,
        error: `DEVICE_OFFLINE: ${device.name || device.id} was last seen ${Math.max(0, Math.round((Date.now() - lastSeen) / 1000))}s ago. Open the Jimskay AI app to wake the local agent, then try again.`,
      };
    }

    const input: Record<string, unknown> = { ...(req.input || {}) };
    if (req.confirm === true) input.confirm = true;

    const taskId = await createTask(device.id, req.userId, req.tool, input);

    if (req.fireAndForget) {
      return {
        ok: true,
        device: device.name || device.id,
        taskId,
        resultText: JSON.stringify({ background: true, taskId, note: 'Task queued. Poll getTaskStatus for the result.' }),
      };
    }

    const timeoutMs = Math.min(Math.max(Number(req.timeoutMs) || 90_000, 10_000), 300_000);
    const res = await pollTask(taskId, timeoutMs);

    if (res.ok) {
      return {
        ok: true,
        device: device.name || device.id,
        taskId,
        resultText: JSON.stringify(res.output),
      };
    }
    return { ok: false, device: device.name || device.id, taskId, error: res.error };
  } catch (e: any) {
    return { ok: false, error: 'Local agent bridge error: ' + (e?.message || String(e)) };
  }
}


export interface AndroidAgentRequest {
  userId?: string;
  action: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
}

/** Phone executor now uses the same in-process control hub as /api/control/action. */
export async function runAndroidAgentTask(req: AndroidAgentRequest): Promise<TaskResult> {
  try {
    if (!req.userId) return { ok:false, error:'No signed-in user id was provided to the Android companion.' };
    if (!ANDROID_AGENT_ACTIONS.includes(req.action as AndroidAgentAction)) return { ok:false, error:`Unknown phone action "${req.action}". Valid actions: ${ANDROID_AGENT_ACTIONS.join(', ')}` };
    const phone = (await listAndroidPhones(req.userId)).find((candidate) => candidate.online);
    if (!phone || !phone.online) return { ok:false, error:'NO_PAIRED_PHONE: Start the Jimskay Android companion and keep its control service active.' };
    const input = { ...(req.input || {}) };
    if (req.action === 'typeText') {
      const label=String(input.fieldLabel||''); const text=String(input.text||'');
      if (/password|passcode|one[- ]time code|otp|verification code/i.test(label)) return {ok:false,error:'For your safety, enter passwords and verification codes manually on the phone.'};
      if(text.length>10000)return {ok:false,error:'Phone text entry is limited to 10,000 characters per action.'};
    }
    if (req.action === 'deleteFile' && input.confirm !== true) return {ok:false,error:'Explicit confirmation is required before deleting phone files.',requiresConfirmation:true} as any;
    const taskId=await createAndroidPhoneTask(phone.deviceId,req.userId,req.action,input);
    return {ok:true,pending:true,device:phone.name,deviceId:phone.deviceId,taskId,resultText:`Phone action queued as ${taskId}.`};
  } catch(e:any) { return {ok:false,error:'Android control error: '+(e?.message||String(e))}; }
}

