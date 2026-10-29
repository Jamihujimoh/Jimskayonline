import { cpSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.next', 'standalone');
const dest = join(root, 'desktop', 'next-server');

console.log('Preparing desktop bundle...');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
mkdirSync(dest, { recursive: true });
for (const name of ['server.js', 'package.json', '.next']) {
  cpSync(join(src, name), join(dest, name), { recursive: true });
}
// Standalone output does not include the browser assets served from these directories.
cpSync(join(root, '.next', 'static'), join(dest, '.next', 'static'), { recursive: true });
cpSync(join(root, 'public'), join(dest, 'public'), { recursive: true });
if (existsSync(join(root, '.env'))) {
  cpSync(join(root, '.env'), join(root, 'desktop', 'env.bundle'));
} else {
  console.warn('[prepare-desktop] WARNING: .env not found; desktop env.bundle was not created.');
}

// Bundle the optional legacy local-agent daemon. The new Admin PC-control
// engine does not require this daemon, but older cloud-agent flows may still
// use it when a project supplies the folder and service-account.json.
const agentSrc = join(root, 'local-agent');
const agentDest = join(dest, 'local-agent');
rmSync(agentDest, { recursive: true, force: true });
if (existsSync(agentSrc)) {
  mkdirSync(agentDest, { recursive: true });
  for (const name of readdirSync(agentSrc)) {
    if (name === 'device.json' || name === 'agent.log' || name === 'start-agent-hidden.vbs') continue;
    if (name.endsWith('-test.mjs') || /^(raw-task|check-task|cleanup-fs|create-index)/.test(name)) continue;
    cpSync(join(agentSrc, name), join(agentDest, name), { recursive: true });
  }
  if (!existsSync(join(agentDest, 'service-account.json'))) {
    console.warn('[prepare-desktop] WARNING: local-agent/service-account.json not bundled');
  }
  console.log('Optional local agent bundled at:', agentDest);
} else {
  console.warn('[prepare-desktop] local-agent folder not found; skipping legacy agent bundle.');
}
// Prune the stale nested desktop snapshot that Next output tracing copies into the bundle
rmSync(join(dest, 'desktop'), { recursive: true, force: true });
// Prune stale release artifacts (installers, win-unpacked) that Next output tracing copies into the bundle
rmSync(join(dest, 'release'), { recursive: true, force: true });
// Next's output tracing can omit runtime-only packages (e.g. `wav` used by the
// TTS flow). Sync every prod dependency listed in the bundle's package.json that
// is missing from the traced node_modules by copying it from the root install.
{
  const { readFileSync } = await import('node:fs');
  const bundlePkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'));
  const deps = new Set([
    ...Object.keys(bundlePkg.dependencies || {}),
    ...Object.keys(bundlePkg.optionalDependencies || {}),
  ]);
  const seen = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of deps) {
      if (seen.has(name)) continue;
      const target = join(dest, 'node_modules', name);
      const source = join(root, 'node_modules', name);
      if (!existsSync(target) && existsSync(source)) {
        cpSync(source, target, { recursive: true });
        try {
          const sub = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
          for (const d of Object.keys(sub.dependencies || {})) deps.add(d);
        } catch {}
        changed = true;
      }
      seen.add(name);
    }
  }
  const missing = [...deps].filter((n) => !existsSync(join(dest, 'node_modules', n)));
  if (missing.length) {
    console.warn('[prepare-desktop] WARNING: still missing in bundle:', missing.join(', '));
  } else {
    console.log('[prepare-desktop] Dependency sync complete (' + deps.size + ' prod deps checked).');
  }
}
console.log('Desktop bundle ready:', dest);
