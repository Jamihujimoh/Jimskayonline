import { runPcControl } from '@/ai/lib/pc-control-core';

/**
 * Thin, type-safe wrapper around the persistent PC-control engine's native
 * UIA commands (uiaTree / uiaFind / uiaInvoke / uiaSetValue / uiaSelect).
 *
 * The old implementation spawned a fresh powershell.exe per call and inlined
 * the whole UIA walker. The engine now owns the STA worker, the root-element
 * cache, the walker, and the JSON protocol, so this module only maps the
 * legacy facade to runPcControl and normalises the result shape.
 */

export type UiAutomationInput = {
  operation: 'tree' | 'find' | 'invoke' | 'setValue' | 'select';
  windowTitle?: string;
  name?: string;
  automationId?: string;
  controlType?: string;
  maxDepth?: number;
  maxResults?: number;
  value?: string;
};

type UiaResult = Record<string, unknown> & { ok: boolean; error?: string };

const COMMAND_BY_OPERATION: Record<UiAutomationInput['operation'], string> = {
  tree: 'uiaTree',
  find: 'uiaFind',
  invoke: 'uiaInvoke',
  setValue: 'uiaSetValue',
  select: 'uiaSelect',
};

export async function windowsUiAutomation(input: UiAutomationInput): Promise<UiaResult> {
  const command = COMMAND_BY_OPERATION[input.operation] ?? 'uiaFind';

  const args: Record<string, unknown> = {};
  // Window targeting is fuzzy-matched by the engine; '' means whole desktop.
  if (input.windowTitle) args.windowTitle = String(input.windowTitle);
  if (input.name) args.name = String(input.name);
  if (input.automationId) args.automationId = String(input.automationId);
  if (input.controlType) args.controlType = String(input.controlType);
  if (input.operation === 'tree') {
    args.maxDepth = Math.min(Math.max(Math.trunc(input.maxDepth ?? 6), 0), 12);
    args.maxResults = Math.min(Math.max(Math.trunc(input.maxResults ?? 150), 1), 500);
  } else if (input.operation === 'find') {
    args.maxResults = Math.min(Math.max(Math.trunc(input.maxResults ?? 40), 1), 300);
  }
  if (input.operation === 'setValue') args.value = String(input.value ?? '');

  // Tree/find scans can take a while on a busy desktop; actions stay snappy.
  const timeoutMs = input.operation === 'tree' || input.operation === 'find' ? 60000 : 30000;

  const result = await runPcControl({ command, args, timeoutMs });
  if (!result.ok) {
    return { ok: false, error: result.error ?? `${command} failed.` };
  }
  const data: Record<string, unknown> = (result.data && typeof result.data === 'object')
    ? result.data as Record<string, unknown>
    : {};
  return {
    ok: true,
    operation: input.operation,
    ...data,
  };
}