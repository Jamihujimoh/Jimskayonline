import { actionKey, clearActionCoordinator, runOnce } from '../src/ai/lib/admin-action-coordinator';

async function main() {
  clearActionCoordinator();
  let executions = 0;
  const key = actionKey('pcControl.launchApp', { target: 'calculator.exe', arguments: '' });
  const first = await runOnce(key, async () => { executions += 1; return { pid: 1234 }; });
  const second = await runOnce(key, async () => { executions += 1; return { pid: 5678 }; });
  if (executions !== 1 || first.deduplicated || !second.deduplicated || second.value.pid !== 1234) {
    throw new Error('Sequential action deduplication failed');
  }

  clearActionCoordinator();
  let concurrentExecutions = 0;
  const concurrentKey = actionKey('openUrl', 'https://example.com');
  const operation = async () => { concurrentExecutions += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { ok: true }; };
  const results = await Promise.all([runOnce(concurrentKey, operation), runOnce(concurrentKey, operation)]);
  if (concurrentExecutions !== 1 || !results[1].deduplicated) throw new Error('Concurrent action coalescing failed');
  console.log('admin-action-coordinator: PASS');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
