import { createHash, createSign } from 'node:crypto';

/**
 * Zero-dependency Firebase Admin REST client (server-only).
 * Authenticates with a service account via JWT -> OAuth token and talks to
 * Cloud Firestore over its REST API. No firebase-admin npm package required.
 *
 * Configure on the server with one of:
 *   FIREBASE_SERVICE_ACCOUNT_JSON   raw JSON, or base64 of the JSON
 *   FIREBASE_SERVICE_ACCOUNT_PATH   filesystem path to the JSON
 */

export interface AdminClient {
  projectId: string;
  getDoc: (pathName: string) => Promise<any | null>;
  setDoc: (pathName: string, fields: Record<string, unknown>) => Promise<void>;
  queryDocs: (
    collectionId: string,
    filters: { field: string; op: 'EQUAL'; value: string }[],
    limit: number
  ) => Promise<any[]>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cached: AdminClient | null | undefined;

export function getAdminClient(): AdminClient | null {
  if (cached !== undefined) return cached;
  cached = createClient();
  return cached;
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    try {
      return JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function createClient(): AdminClient | null {
  const sa = loadServiceAccount();
  if (!sa || !sa.project_id || !sa.client_email || !sa.private_key) return null;
  return new AdminRestClient(sa);
}

class AdminRestClient implements AdminClient {
  projectId: string;
  private sa: ServiceAccount;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(sa: ServiceAccount) {
    this.sa = sa;
    this.projectId = sa.project_id;
  }

  private get baseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  private makeJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: this.sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    ).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    return `${header}.${claims}.${signer.sign(this.sa.private_key, 'base64url')}`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - 300000) return this.token;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.makeJwt(),
      }),
    });
    if (!res.ok) {
      throw new Error(`Firebase token exchange failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    const accessToken = data.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error('Firebase token exchange returned no access token.');
    }
    this.token = accessToken;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return accessToken;
  }

  private async fetch(method: string, url: string, body?: unknown): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getAccessToken();
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && attempt === 0) {
        this.token = null;
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(
          `Firestore ${method} ${url.split('/').pop()?.split('?')[0]} failed: ${res.status} ${(await res.text()).slice(0, 300)}`
        );
      }
      return res.status === 204 ? {} : res.json();
    }
    throw new Error('Firebase auth retry exhausted');
  }

  async getDoc(pathName: string): Promise<any | null> {
    const res = await this.fetch('GET', `${this.baseUrl}/${pathName}`);
    return res ? { id: res.name.split('/').pop(), ...decodeFields(res.fields) } : null;
  }

  async setDoc(pathName: string, fields: Record<string, unknown>): Promise<void> {
    const mask = Object.keys(fields)
      .map((k) => `updateMask.fieldPaths=${k}`)
      .join('&');
    await this.fetch('PATCH', `${this.baseUrl}/${pathName}?${mask}`, { fields: encodeFields(fields) });
  }

  async queryDocs(
    collectionId: string,
    filters: { field: string; op: 'EQUAL'; value: string }[],
    limit: number
  ): Promise<any[]> {
    const where =
      filters.length === 1
        ? {
            fieldFilter: {
              field: { fieldPath: filters[0].field },
              op: filters[0].op,
              value: { stringValue: filters[0].value },
            },
          }
        : {
            compositeFilter: {
              op: 'AND',
              filters: filters.map((f) => ({
                fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: { stringValue: f.value } },
              })),
            },
          };
    const res = await this.fetch('POST', `${this.baseUrl}:runQuery`, {
      structuredQuery: { from: [{ collectionId }], where, limit },
    });
    return (res || [])
      .filter((r: any) => r.document)
      .map((r: any) => ({ id: r.document.name.split('/').pop(), ...decodeFields(r.document.fields) }));
  }
}

/**
 * Verifies a Firebase Auth ID token server-side (zero-dependency).
 * Uses the Identity Toolkit accounts:lookup endpoint: Google validates the
 * token signature/expiry for this project and returns the user record.
 * Returns the verified uid, or null when the token is invalid/expired.
 */
export async function verifyIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('Firebase Web API key is not configured (NEXT_PUBLIC_FIREBASE_API_KEY).');
  if (!idToken) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email || undefined };
  } catch {
    return null;
  }
}

export function hashDeviceKey(deviceKey: string): string {
  return createHash('sha256').update(deviceKey).digest('hex');
}

function encodeValue(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}

function encodeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) fields[k] = encodeValue(v);
  return fields;
}

function decodeValue(v: any): any {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}
