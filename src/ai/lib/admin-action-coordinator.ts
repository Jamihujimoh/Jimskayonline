type CachedAction = { value: unknown; expiresAt: number };

const inFlight = new Map<string, Promise<unknown>>();
const completed = new Map<string, CachedAction>();
const DEFAULT_WINDOW_MS = 15000;

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

export function actionKey(action: string, input: unknown): string {
  return `${action}:${stableSerialize(input)}`;
}

export async function runOnce<T>(key: string, operation: () => Promise<T>, windowMs = DEFAULT_WINDOW_MS): Promise<{ value: T; deduplicated: boolean }> {
  const now = Date.now();
  for (const [cachedKey, cached] of completed) {
    if (cached.expiresAt <= now) completed.delete(cachedKey);
  }

  const cached = completed.get(key);
  if (cached) return { value: cached.value as T, deduplicated: true };

  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return { value: await running, deduplicated: true };

  const promise = operation();
  inFlight.set(key, promise);
  try {
    const value = await promise;
    completed.set(key, { value, expiresAt: Date.now() + windowMs });
    return { value, deduplicated: false };
  } finally {
    inFlight.delete(key);
  }
}

export function clearActionCoordinator(): void {
  inFlight.clear();
  completed.clear();
}
