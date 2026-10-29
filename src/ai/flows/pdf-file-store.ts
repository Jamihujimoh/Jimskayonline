import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const STORE_DIR = path.join(os.tmpdir(), 'jimskay-pdf-downloads');
const TTL_MS = 30 * 60 * 1000;

type StoredPdf = {
  filePath: string;
  filename: string;
  expiresAt: number;
};

const store = new Map<string, StoredPdf>();

function ensureStoreDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function metadataPath(token: string) {
  return path.join(STORE_DIR, `${token}.json`);
}

function pdfPath(token: string) {
  return path.join(STORE_DIR, `${token}.pdf`);
}

function cleanupExpired() {
  const now = Date.now();

  for (const [token, item] of store) {
    if (item.expiresAt <= now) {
      try {
        fs.unlinkSync(item.filePath);
      } catch {
        // Already deleted
      }

      try {
        fs.unlinkSync(metadataPath(token));
      } catch {
        // Already deleted
      }

      store.delete(token);
    }
  }
}

/**
 * Stores the generated PDF on the server.
 *
 * IMPORTANT:
 * The huge Base64 PDF is never returned to the model
 * and never needs to be stored in the Firestore chat message.
 */
export async function stagePdf(
  base64Data: string,
  filename: string
) {
  cleanupExpired();
  ensureStoreDir();

  const token = crypto.randomBytes(24).toString('hex');

  const safeFilename =
    filename.replace(/[^a-zA-Z0-9._-]/g, '_') ||
    'document.pdf';

  const filePath = pdfPath(token);

  await fs.promises.writeFile(
    filePath,
    Buffer.from(base64Data, 'base64')
  );

  const metadata: StoredPdf = {
    filePath,
    filename: safeFilename,
    expiresAt: Date.now() + TTL_MS,
  };

  await fs.promises.writeFile(
    metadataPath(token),
    JSON.stringify(metadata),
    'utf8'
  );

  store.set(token, metadata);

  return {
    filename: safeFilename,
    downloadUrl: `/api/pdf/${token}`,
  };
}

/**
 * Reads a staged PDF.
 */
export async function readStagedPdf(token: string) {
  cleanupExpired();

  // Don't allow path traversal.
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    return null;
  }

  let item = store.get(token);

  // Recover metadata if the in-memory Map doesn't have it.
  if (!item) {
    try {
      const metadata = JSON.parse(
        await fs.promises.readFile(
          metadataPath(token),
          'utf8'
        )
      ) as StoredPdf;

      if (
        metadata.filePath === pdfPath(token) &&
        metadata.expiresAt > Date.now()
      ) {
        item = metadata;
        store.set(token, metadata);
      }
    } catch {
      return null;
    }
  }

  if (!item || item.expiresAt <= Date.now()) {
    return null;
  }

  try {
    const data = await fs.promises.readFile(item.filePath);

    return {
      data,
      filename: item.filename,
    };
  } catch {
    store.delete(token);

    try {
      await fs.promises.unlink(metadataPath(token));
    } catch {
      // Already deleted
    }

    return null;
  }
}

/**
 * Deletes a staged PDF.
 */
export function deleteStagedPdf(token: string) {
  try {
    fs.unlinkSync(pdfPath(token));
  } catch {
    // Already deleted
  }

  try {
    fs.unlinkSync(metadataPath(token));
  } catch {
    // Already deleted
  }

  store.delete(token);
}