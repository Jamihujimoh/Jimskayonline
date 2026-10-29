"use client"

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminStep } from '@/ai/admin-types';
import { Terminal, FileText, FilePen, FolderOpen, Cpu, Monitor, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown, Brain, Image as ImageIcon, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOOL_META: Record<string, { label: string; icon: ReactNode }> = {
  runTerminalCommand: { label: 'Terminal Command', icon: <Terminal className="w-3.5 h-3.5" /> },
  readFile: { label: 'File Read', icon: <FileText className="w-3.5 h-3.5" /> },
  writeFile: { label: 'File Write', icon: <FilePen className="w-3.5 h-3.5" /> },
  listDirectory: { label: 'Directory Listing', icon: <FolderOpen className="w-3.5 h-3.5" /> },
  getSystemInfo: { label: 'System Info', icon: <Cpu className="w-3.5 h-3.5" /> },
  pcControl: { label: 'PC Control', icon: <Monitor className="w-3.5 h-3.5" /> },
  windowsUiAutomation: { label: 'UI Automation', icon: <Monitor className="w-3.5 h-3.5" /> },
};

const MAX_DISPLAY_CHARS = 6000;

function formatOutput(output: any): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/* --------------------------- structured extractors --------------------------- */

/** Pulls the pcControl result payload out of the step output. */
function unwrap(output: any): any {
  if (output && typeof output === 'object') {
    if (output.ok === true && output.data !== undefined) return output.data;
    if (output.data !== undefined) return output.data;
  }
  return output;
}

function extractWindows(output: any): any[] | null {
  const data = unwrap(output);
  if (!data || typeof data !== 'object') return null;
  const w = Array.isArray(data.windows) ? data.windows : null;
  if (w && w.length > 0) return w;
  return null;
}

function extractScreenshot(output: any): { base64: string; mimeType?: string; width?: number; height?: number; title?: string } | null {
  const data = unwrap(output);
  if (!data || typeof data !== 'object') return null;
  const b64 = typeof data.base64 === 'string' && data.base64.length > 100 ? data.base64 : null;
  if (!b64) return null;
  return { base64: b64, mimeType: data.mimeType, width: data.width, height: data.height, title: data.window?.title };
}

function extractUiaElements(output: any): any[] | null {
  const data = unwrap(output);
  if (!data || typeof data !== 'object') return null;
  const el = Array.isArray(data.elements) ? data.elements : null;
  if (el && el.length > 0) return el;
  return null;
}

/* --------------------------- pretty renderers --------------------------- */

function WindowsTable({ windows }: { windows: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/5 bg-white/[0.02]">
      <table className="w-full text-left text-[11px] font-mono">
        <thead>
          <tr className="border-b border-white/10 text-[9px] uppercase tracking-widest text-white/40">
            <th className="px-2 py-1.5">Title</th>
            <th className="px-2 py-1.5">Process</th>
            <th className="px-2 py-1.5">PID</th>
            <th className="px-2 py-1.5">Handle</th>
            <th className="px-2 py-1.5">State</th>
            <th className="px-2 py-1.5">Rect</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((w: any, i: number) => (
            <tr key={w.handle ?? i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
              <td className="px-2 py-1.5 text-white/90 max-w-[220px] truncate">{w.title || '(untitled)'}</td>
              <td className="px-2 py-1.5 text-white/60">{w.processName || w.className || '-'}</td>
              <td className="px-2 py-1.5 text-white/50">{w.pid ?? '-'}</td>
              <td className="px-2 py-1.5 text-white/50">0x{(Number(w.handle) || 0).toString(16)}</td>
              <td className="px-2 py-1.5">
                <span className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded-full border',
                  w.minimized ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
                  : w.visible ? 'text-green-400 border-green-400/30 bg-green-400/10'
                  : 'text-white/40 border-white/10 bg-white/5'
                )}>
                  {w.minimized ? 'minimized' : w.visible ? 'visible' : 'hidden'}
                </span>
              </td>
              <td className="px-2 py-1.5 text-white/40 whitespace-nowrap">
                {w.rect ? `${w.rect.left},${w.rect.top} ${w.rect.width}×${w.rect.height}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UiaTreeTable({ elements }: { elements: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/5 bg-white/[0.02]">
      <table className="w-full text-left text-[11px] font-mono">
        <thead>
          <tr className="border-b border-white/10 text-[9px] uppercase tracking-widest text-white/40">
            <th className="px-2 py-1.5">Name</th>
            <th className="px-2 py-1.5">Type</th>
            <th className="px-2 py-1.5">AutomationId</th>
            <th className="px-2 py-1.5">Enabled</th>
            <th className="px-2 py-1.5">Rect</th>
          </tr>
        </thead>
        <tbody>
          {elements.map((el: any, i: number) => (
            <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
              <td className="px-2 py-1.5 text-white/90 max-w-[260px] truncate">{el.name || '(unnamed)'}</td>
              <td className="px-2 py-1.5 text-white/60">{el.controlType ?? el.type ?? '-'}</td>
              <td className="px-2 py-1.5 text-white/40">{el.automationId ?? '-'}</td>
              <td className="px-2 py-1.5 text-white/50">{el.enabled != null ? String(el.enabled) : '-'}</td>
              <td className="px-2 py-1.5 text-white/40 whitespace-nowrap">
                {el.rect ? `${el.rect.left},${el.rect.top} ${el.rect.width}×${el.rect.height}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemInfoCard({ output }: { output: any }) {
  const data = unwrap(output);
  if (!data || typeof data !== 'object') return null;
  const vs = data.virtualScreen;
  const primary = data.primary;
  if (!vs && !primary && !data.os) return null;
  const rows: Array<[string, string]> = [];
  if (data.computer) rows.push(['Computer', `${data.computer}`]);
  if (data.user) rows.push(['User', `${data.user}`]);
  if (data.os) rows.push(['OS', `${data.os}`]);
  if (vs) rows.push(['Virtual screen', `${vs.left ?? 0},${vs.top ?? 0} ${vs.width}×${vs.height}`]);
  if (primary) rows.push(['Primary', `${primary.width}×${primary.height}`]);
  if (data.cpuModel) rows.push(['CPU', `${data.cpuModel}`]);
  if (data.memoryGB != null) rows.push(['Memory', `${data.memoryGB} GB`]);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] divide-y divide-white/[0.04]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono">
          <span className="text-[9px] uppercase tracking-widest text-white/40">{k}</span>
          <span className="text-white/80">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ScreenshotChip({ shot, stepName }: { shot: { base64: string; mimeType?: string; width?: number; height?: number; title?: string }; stepName: string }) {
  const [copied, setCopied] = useState(false);
  const mime = shot.mimeType ?? 'image/png';
  const dataUrl = `data:${mime};base64,${shot.base64}`;
  const copyBase64 = async () => {
    try {
      await navigator.clipboard.writeText(shot.base64);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <ImageIcon className="w-3 h-3 text-accent" />
        <span className="text-[10px] font-mono text-white/60">{stepName}</span>
        {shot.width ? (
          <span className="text-[10px] font-mono text-white/35 ml-auto">{shot.width}×{shot.height}</span>
        ) : null}
        <button
          onClick={copyBase64}
          className="ml-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <img src={dataUrl} alt={shot.title ?? 'Screenshot'} className="w-full h-auto max-h-[420px] object-contain bg-black/30" />
      {shot.title ? (
        <div className="px-3 py-1.5 text-[10px] font-mono text-white/40 truncate border-t border-white/5">{shot.title}</div>
      ) : null}
    </div>
  );
}

/* --------------------------- main card --------------------------- */

function ToolStepCard({ step }: { step: Extract<AdminStep, { type: 'tool' }> }) {
  const [open, setOpen] = useState(true);
  const meta = TOOL_META[step.name] || { label: step.name, icon: <Terminal className="w-3.5 h-3.5" /> };

  const inputText =
    step.name === 'runTerminalCommand'
      ? String(step.input?.command || '')
      : JSON.stringify(step.input, null, 2);

  const windows = extractWindows(step.output);
  const shot = extractScreenshot(step.output);
  const uiaElements = extractUiaElements(step.output);
  const systemInfo = step.name === 'getSystemInfo' ? <SystemInfoCard output={step.output} /> : null;

  // Strip the image payload from the raw text dump (rendered as a chip instead).
  let outputText = formatOutput(step.output);
  if (shot) {
    outputText = outputText.replace(/("base64"\s*:\s*")[A-Za-z0-9+/=]+/g, '$1…<image payload>');
  }
  const displayOutput =
    outputText.length > MAX_DISPLAY_CHARS
      ? outputText.slice(0, MAX_DISPLAY_CHARS) + '\n...[output truncated for display]'
      : outputText;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/40 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
        <span className="text-accent">{meta.icon}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/70">{meta.label}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {step.status === 'running' && (
            <>
              <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
              <span className="text-[8px] font-black uppercase tracking-widest text-yellow-400 animate-pulse">Executing</span>
            </>
          )}
          {step.status === 'success' && (
            <>
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Success</span>
            </>
          )}
          {step.status === 'error' && (
            <>
              <XCircle className="w-3 h-3 text-red-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-red-500">Error</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
          <pre className="m-0 p-3 rounded-lg bg-white/[0.03] border border-white/5 font-mono text-[11px] leading-relaxed text-primary/90 overflow-x-auto custom-scrollbar whitespace-pre-wrap break-all">
            {step.name === 'runTerminalCommand' ? `$ ${inputText}` : inputText}
          </pre>

          {shot && <ScreenshotChip shot={shot} stepName={step.name} />}
          {windows && <WindowsTable windows={windows} />}
          {uiaElements && <UiaTreeTable elements={uiaElements} />}
          {systemInfo}

          {displayOutput && (
            <pre className={cn(
              "m-0 p-3 rounded-lg border font-mono text-[11px] leading-relaxed overflow-x-auto custom-scrollbar whitespace-pre-wrap break-all",
              step.status === 'error'
                ? "bg-red-500/[0.04] border-red-500/20 text-red-400"
                : "bg-white/[0.02] border-white/5 text-white/80"
            )}>
              {displayOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminRunView({ steps }: { steps?: AdminStep[] }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-3.5 h-3.5 text-accent animate-pulse" />
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-accent/70">Local Agent Execution Log</span>
      </div>
      {steps.map((step, i) =>
        step.type === 'tool' ? (
          <ToolStepCard key={i} step={step} />
        ) : (
          <p key={i} className="mt-4 text-[11px] text-muted-foreground/70 font-medium italic border-l-2 border-accent/20 pl-3">
            {step.content}
          </p>
        )
      )}
    </div>
  );
}