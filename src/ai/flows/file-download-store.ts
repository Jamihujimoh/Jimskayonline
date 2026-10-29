import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STORE_DIR = path.join(os.tmpdir(), 'jimskay-file-downloads');
const TTL_MS = 30 * 60 * 1000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type StoredFile = {
  filePath: string;
  filename: string;
  mimeType: string;
  expiresAt: number;
};

const store = new Map<string, StoredFile>();

function filePath(token: string) { return path.join(STORE_DIR, `${token}.bin`); }
function metadataPath(token: string) { return path.join(STORE_DIR, `${token}.json`); }

function cleanupExpired() {
  const now = Date.now();
  for (const [token, item] of store) {
    if (item.expiresAt > now) continue;
    try { fs.unlinkSync(item.filePath); } catch {}
    try { fs.unlinkSync(metadataPath(token)); } catch {}
    store.delete(token);
  }
}

export async function stageFile(data: Uint8Array | Buffer, filename: string, mimeType = 'application/octet-stream') {
  cleanupExpired();
  if (data.byteLength > MAX_FILE_BYTES) throw new Error('File exceeds the 50 MB temporary-file limit.');
  await fs.promises.mkdir(STORE_DIR, { recursive: true });
  const token = crypto.randomBytes(24).toString('hex');
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'jimskay-file';
  const item: StoredFile = {
    filePath: filePath(token),
    filename: safeFilename,
    mimeType: mimeType || 'application/octet-stream',
    expiresAt: Date.now() + TTL_MS,
  };
  await fs.promises.writeFile(item.filePath, Buffer.from(data));
  await fs.promises.writeFile(metadataPath(token), JSON.stringify(item), 'utf8');
  store.set(token, item);
  return { downloadUrl: `/api/files/${token}`, filename: safeFilename, expiresInMs: TTL_MS };
}

export async function readStagedFile(token: string) {
  cleanupExpired();
  if (!/^[a-f0-9]{48}$/i.test(token)) return null;
  let item = store.get(token);
  if (!item) {
    try {
      const metadata = JSON.parse(await fs.promises.readFile(metadataPath(token), 'utf8')) as StoredFile;
      if (metadata.filePath !== filePath(token) || metadata.expiresAt <= Date.now()) return null;
      item = metadata;
      store.set(token, metadata);
    } catch { return null; }
  }
  if (item.expiresAt <= Date.now()) return null;
  try {
    return { data: await fs.promises.readFile(item.filePath), filename: item.filename, mimeType: item.mimeType };
  } catch {
    store.delete(token);
    try { await fs.promises.unlink(metadataPath(token)); } catch {}
    return null;
  }
}
