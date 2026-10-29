import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function resolveTarget(value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(process.env.ADMIN_WORKDIR || os.homedir(), value);
}

export async function verifyAdminState(input: {
  kind: 'fileExists' | 'fileContains' | 'processRunning' | 'windowExists' | 'clipboardEquals';
  path?: string;
  text?: string;
  processName?: string;
  windowTitle?: string;
  timeoutMs?: number;
}): Promise<any> {
  const timeout = Math.min(Math.max(input.timeoutMs ?? 5000, 250), 30000);
  const deadline = Date.now() + timeout;

  const check = async (): Promise<any> => {
    if (input.kind === 'fileExists') {
      if (!input.path) return { ok: false, error: 'path is required' };
      try {
        const stat = await fs.stat(resolveTarget(input.path));
        return { ok: true, exists: true, path: resolveTarget(input.path), isDirectory: stat.isDirectory(), sizeBytes: stat.size };
      } catch {
        return { ok: false, exists: false, path: resolveTarget(input.path) };
      }
    }

    if (input.kind === 'fileContains') {
      if (!input.path || input.text == null) return { ok: false, error: 'path and text are required' };
      try {
        const content = await fs.readFile(resolveTarget(input.path), 'utf8');
        const found = content.includes(input.text);
        return { ok: found, found, path: resolveTarget(input.path) };
      } catch (e: any) {
        return { ok: false, error: e.message || String(e) };
      }
    }

    if (input.kind === 'processRunning') {
      if (!input.processName) return { ok: false, error: 'processName is required' };
      if (process.platform !== 'win32') return { ok: false, error: 'process verification requires Windows' };
      try {
        const script = `@(Get-Process -Name ${JSON.stringify(input.processName)} -ErrorAction SilentlyContinue) | Select-Object -First 10 Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress`;
        const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
        const value = stdout.trim();
        if (!value) return { ok: false, running: false, processName: input.processName };
        const processes = JSON.parse(value);
        return { ok: true, running: true, processes: Array.isArray(processes) ? processes : [processes] };
      } catch {
        return { ok: false, running: false, processName: input.processName };
      }
    }

    if (input.kind === 'windowExists') {
      if (!input.windowTitle) return { ok: false, error: 'windowTitle is required' };
      if (process.platform !== 'win32') return { ok: false, error: 'window verification requires Windows' };
      try {
        const escaped = input.windowTitle.replace(/'/g, "''");
        const script = `Add-Type @'\nusing System; using System.Text; using System.Runtime.InteropServices; public static class W { [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsProc lp, IntPtr p); [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); public delegate bool EnumWindowsProc(IntPtr h, IntPtr p); }\n'@; $found=$false; [W]::EnumWindows({ param($h,$p) $s=New-Object Text.StringBuilder 1024; [W]::GetWindowText($h,$s,1024)|Out-Null; if($s.ToString() -like '*${escaped}*'){ $script:found=$true; return $false }; return $true },[IntPtr]::Zero)|Out-Null; if($found){'true'}else{'false'}`;
        const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
        const found = stdout.trim() === 'true';
        return { ok: found, exists: found, windowTitle: input.windowTitle };
      } catch (e: any) {
        return { ok: false, exists: false, error: e.message || String(e) };
      }
    }

    if (input.kind === 'clipboardEquals') {
      if (input.text == null) return { ok: false, error: 'text is required' };
      if (process.platform !== 'win32') return { ok: false, error: 'clipboard verification requires Windows' };
      try {
        const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command', '$v=Get-Clipboard -Raw -ErrorAction Stop; [Console]::Write($v)'], { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
        const matches = stdout === input.text;
        return { ok: matches, matches };
      } catch (e: any) {
        return { ok: false, error: e.message || String(e) };
      }
    }

    return { ok: false, error: 'Unknown verification kind' };
  };

  let result = await check();
  while (!result.ok && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    result = await check();
  }
  return { ...result, waitedMs: timeout - Math.max(0, deadline - Date.now()) };
}
