import { runPcControl, stopPcControlWorker } from '../src/ai/lib/pc-control-core';

function assertOk(label: string, result: { ok: boolean; data?: any; error?: string }) {
  if (!result.ok) throw new Error(`${label} failed: ${result.error || 'unknown error'}`);
  console.log(`PASS ${label}`);
  return result.data;
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('This test must be run on Windows.');
    process.exitCode = 2;
    return;
  }

  console.log('Jimskay AI Windows PC-control smoke test');
  console.log(`Node: ${process.version}`);
  console.log(`Windows: ${process.platform}`);

  try {
    const foreground = assertOk(
      'foreground window',
      await runPcControl({ command: 'getForegroundWindow', timeoutMs: 15000 })
    );
    console.log(`  foreground: ${foreground?.title || '(untitled)'}`);

    const cursor = assertOk(
      'cursor position',
      await runPcControl({ command: 'getCursorPosition', timeoutMs: 15000 })
    );
    console.log(`  cursor: ${JSON.stringify(cursor?.position ?? null)}`);

    const volume = assertOk(
      'volume read',
      await runPcControl({ command: 'volumeGet', timeoutMs: 15000 })
    );
    console.log(`  volume: ${JSON.stringify(volume)}`);

    const screenshot = assertOk(
      'desktop screenshot',
      await runPcControl({ command: 'screenshot', timeoutMs: 30000 })
    );
    if (!screenshot?.base64 || screenshot?.mimeType !== 'image/png') {
      throw new Error('Screenshot did not return PNG base64 data.');
    }
    console.log(`  screenshot: ${screenshot.width}x${screenshot.height}, ${screenshot.base64.length} base64 chars`);

    console.log('All non-destructive Windows PC-control checks passed.');
  } finally {
    await stopPcControlWorker();
  }
}

main().catch((error) => {
  console.error('FAIL', error?.stack || String(error));
  process.exitCode = 1;
});
