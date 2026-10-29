/* Live E2E test for the local-agent bridge: dispatches real tasks through
 * Firestore to the running local agent daemon on this PC and asserts results.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runLocalAgentTask } from '../src/ai/lib/local-agent-bridge';

const SA_PATH = path.join(process.cwd(), 'local-agent', 'service-account.json');
const DEVICE_ID = 'dev_08681c1b52c6da3a';
const PROJECT_ID = 'jimskay-7da28';

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

async function getToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(
    Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const { createSign } = await import('node:crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(header + '.' + claims);
  const jwt = header + '.' + claims + '.' + sign.sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error('token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function getPairedUserId(): Promise<string> {
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
  const token = await getToken(sa);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/devices/${DEVICE_ID}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('device fetch failed: ' + (await res.text()).slice(0, 300));
  const doc: any = await res.json();
  return doc.fields?.userId?.stringValue;
}

async function main() {
  const userId = await getPairedUserId();
  if (!userId) throw new Error('No userId found on device doc ' + DEVICE_ID);
  console.log('paired userId:', userId);

  const tests: Array<[string, any]> = [
    ['getSystemInfo', { timeoutMs: 30000 }],
    ['runTerminalCommand', { command: 'echo bridge-e2e-ok', timeoutMs: 30000 }],
    ['listDirectory', { path: 'C:/Users/USER/Documents/hackerai', timeoutMs: 30000 }],
  ];

  let passed = 0;
  for (const [tool, input] of tests) {
    const t0 = Date.now();
    const res = await runLocalAgentTask({ userId, tool, input });
    const ms = Date.now() - t0;
    const ok = res.ok && !res.error;
    if (ok) passed++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${tool} (${ms}ms) device=${res.device} taskId=${res.taskId}\n  -> ${String(res.resultText || res.error).slice(0, 300)}`
    );
  }

  console.log(`\nE2E RESULT: ${passed}/${tests.length} passed`);
  if (passed !== tests.length) process.exit(1);
}

main().catch((e) => {
  console.error('E2E ERROR:', e);
  process.exit(1);
});
