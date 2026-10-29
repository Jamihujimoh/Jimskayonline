import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const staging = join(root, '.desktop-pack');
const electronBuilder = join(root, 'node_modules', 'electron-builder', 'cli.js');
const miktexSource = process.env.MIKTEX_ROOT || join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX');

if (!existsSync(join(miktexSource, 'miktex', 'bin', 'x64', 'xelatex.exe'))) {
  throw new Error(`MiKTeX runtime not found at ${miktexSource}. Set MIKTEX_ROOT to a MiKTeX installation before packaging.`);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(join(root, 'desktop'), join(staging, 'desktop'), { recursive: true });
cpSync(miktexSource, join(staging, 'miktex'), { recursive: true });

writeFileSync(join(staging, 'package.json'), JSON.stringify({
  name: 'jimskay-ai',
  version: '0.1.0',
  private: true,
  main: 'desktop/main.cjs',
  build: {
    appId: 'com.jimskay.hackerai',
    productName: 'Jimskay AI',
    directories: { output: join(root, 'release') },
    files: ['desktop/**', 'package.json'],
    extraResources: [{ from: 'miktex', to: 'miktex' }],
    asar: false,
    npmRebuild: false,
    electronVersion: '43.4.1',
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'desktop/icon.ico' },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Jimskay AI',
      uninstallDisplayName: 'Jimskay AI',
    },
  },
}, null, 2));

const result = spawnSync(process.execPath, [electronBuilder, '--win'], {
  cwd: staging,
  stdio: 'inherit',
  env: process.env,
});
rmSync(staging, { recursive: true, force: true });
process.exit(result.status ?? 1);