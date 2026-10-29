import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.idx', 'icon.png');
const out = join(root, 'desktop', 'icon.ico');

if (!existsSync(src)) {
  if (existsSync(out)) {
    console.warn('No .idx/icon.png found; keeping existing desktop/icon.ico');
    process.exit(0);
  }
  throw new Error('Missing .idx/icon.png and no existing desktop/icon.ico fallback.');
}

const png = await readFile(src);
const ico = await require('png-to-ico').default(png);
await writeFile(out, ico);
console.log('Icon written:', out, ico.length, 'bytes');
