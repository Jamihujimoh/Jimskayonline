import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STORE_DIR = path.join(os.tmpdir(), 'jimskay-video-downloads');
const TTL_MS = 30 * 60 * 1000;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type StoredVideo = {
  filePath: string;
  filename: string;
  expiresAt: number;
};

const store = new Map<string, StoredVideo>();

function videoPath(token: string) {
  return path.join(STORE_DIR, `${token}.mp4`);
}

function metadataPath(token: string) {
  return path.join(STORE_DIR, `${token}.json`);
}

function cleanupExpired() {
  const now = Date.now();
  for (const [token, item] of store) {
    if (item.expiresAt > now) continue;
    for (const filePath of [item.filePath, metadataPath(token)]) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // The file may already have been removed.
      }
    }
    store.delete(token);
  }
}

export async function stageVideo(dataUri: string, filename: string) {
  const match = dataUri.match(/^data:video\/mp4;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Veo returned video data in an unsupported format.');

  const data = Buffer.from(match[1], 'base64');
  if (!data.length || data.length > MAX_VIDEO_BYTES) {
    throw new Error('Generated video is empty or exceeds the 100 MB size limit.');
  }

  cleanupExpired();
  await fs.promises.mkdir(STORE_DIR, { recursive: true });
  const token = crypto.randomBytes(24).toString('hex');
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'jimskay-video.mp4';
  const item: StoredVideo = {
    filePath: videoPath(token),
    filename: safeFilename,
    expiresAt: Date.now() + TTL_MS,
  };

  await fs.promises.writeFile(item.filePath, data);
  await fs.promises.writeFile(metadataPath(token), JSON.stringify(item), 'utf8');
  store.set(token, item);

  return { downloadUrl: `/api/video/${token}`, filename: safeFilename };
}

export async function readStagedVideo(token: string) {
  cleanupExpired();
  if (!/^[a-f0-9]{48}$/i.test(token)) return null;

  let item = store.get(token);
  if (!item) {
    try {
      const metadata = JSON.parse(await fs.promises.readFile(metadataPath(token), 'utf8')) as StoredVideo;
      if (metadata.filePath !== videoPath(token) || metadata.expiresAt <= Date.now()) return null;
      item = metadata;
      store.set(token, metadata);
    } catch {
      return null;
    }
  }

  if (item.expiresAt <= Date.now()) return null;
  try {
    return {
      data: await fs.promises.readFile(item.filePath),
      filename: item.filename,
    };
  } catch (error) {
    store.delete(token);
    try {
      await fs.promises.unlink(metadataPath(token));
    } catch {
      // The metadata may already have been removed.
    }
    throw error;
  }
}
