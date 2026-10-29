import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const required = [
  'desktop/main.cjs',
  'desktop/icon.ico',
  'desktop/next-server/server.js',
  'desktop/next-server/package.json',
  'desktop/next-server/.next',
  'desktop/next-server/public',
];

const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error('Desktop bundle verification failed. Missing:');
  for (const item of missing) console.error(`  - ${item}`);
  process.exit(1);
}

const bundlePkg = JSON.parse(readFileSync(join(root, 'desktop/next-server/package.json'), 'utf8'));
if (!bundlePkg.dependencies) {
  console.error('Desktop bundle verification failed: standalone package.json has no dependencies object.');
  process.exit(1);
}

const iconBytes = statSync(join(root, 'desktop/icon.ico')).size;
if (iconBytes < 100) {
  console.error('Desktop bundle verification failed: icon.ico looks invalid.');
  process.exit(1);
}

console.log('Desktop bundle verification passed.');
for (const item of required) console.log(`  PASS ${item}`);
console.log(`  PASS desktop/icon.ico (${iconBytes} bytes)`);
