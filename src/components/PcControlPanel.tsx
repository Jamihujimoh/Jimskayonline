"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type WinInfo = {
  handle: number;
  pid: number;
  title: string;
  className: string;
  processName: string;
  visible: boolean;
  minimized: boolean;
  rect?: { left: number; top: number; width: number; height: number };
};

type PcResult = { ok: boolean; data?: any; error?: string };

type ShotTarget = { scope: 'full' | 'window' | 'region'; title?: string; handle?: number; x?: number; y?: number; width?: number; height?: number };

/* ------------------------------------------------------------------ */
/* API helpers                                                         */
/* ------------------------------------------------------------------ */

const ACTION_URL = '/api/control/action';
const SHOT_URL = '/api/pc/screenshot';

/** Runs one engine command through the authenticated API route. */
async function pcAction(pin: string, command: string, args: Record<string, unknown> = {}, confirm = false): Promise<PcResult> {
  try {
    const res = await fetch(ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, target: 'pc', command, args, confirm }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return json as PcResult;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Fetches a PNG screenshot; resolves to a blob object URL (revoked by caller). */
async function pcShot(pin: string, target: ShotTarget = { scope: 'full' }): Promise<string | null> {
  try {
    const body = { pin, ...target };
    const res = await fetch(SHOT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function PcControlPanel({
  pin,
  open,
  onOpenChange,
}: {
  pin: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [system, setSystem] = useState<any>(null);
  const [windows, setWindows] = useState<WinInfo[]>([]);
  const [volume, setVolume] = useState<number>(50);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState<number>(50);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotScale, setShotScale] = useState(1);
  const [shotNative, setShotNative] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selected, setSelected] = useState<WinInfo | null>(null);
  const [appQuery, setAppQuery] = useState('');
  const [textQuery, setTextQuery] = useState('');
  const [keysQuery, setKeysQuery] = useState('');
  const [powerTarget, setPowerTarget] = useState<'shutdown' | 'restart' | 'logoff' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [clickButton, setClickButton] = useState<'left' | 'right' | 'middle'>('left');
  const [clickClicks, setClickClicks] = useState(1);
  const shotBoxRef = useRef<HTMLDivElement>(null);
  const prevShotUrl = useRef<string | null>(null);

  const revokeShot = useCallback((url: string | null) => {
    if (url && prevShotUrl.current !== url) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const refreshShot = useCallback(
    async (target: ShotTarget = { scope: 'full' }, keepSelected = true) => {
      const url = await pcShot(pin, target);
      if (!url) return false;
      if (prevShotUrl.current && prevShotUrl.current !== url) URL.revokeObjectURL(prevShotUrl.current);
      prevShotUrl.current = url;
      setShotUrl(url);
      if (target.scope === 'window') {
        // Keep the previously known native size for coordinate math
      } else if (target.scope === 'region' && target.width && target.height) {
        setShotNative({ width: target.width, height: target.height });
      } else {
        setShotNative({ width: system?.virtualScreen?.width ?? 1920, height: system?.virtualScreen?.height ?? 1080 });
      }
      return true;
    },
    [pin, system]
  );

  const loadWindows = useCallback(async () => {
    const r = await pcAction(pin, 'listWindows', { visibleOnly: false, maxResults: 120 });
    if (r.ok && Array.isArray(r.data?.windows)) setWindows(r.data.windows as WinInfo[]);
    return r;
  }, [pin]);

  const loadSystem = useCallback(async () => {
    const r = await pcAction(pin, 'getSystemInfo');
    if (r.ok && r.data) setSystem(r.data);
    return r;
  }, [pin]);

  const loadVolume = useCallback(async () => {
    const r = await pcAction(pin, 'volumeGet');
    if (r.ok && r.data) {
      setVolume(r.data.volume ?? 50);
      setMuted(!!r.data.muted);
    }
    return r;
  }, [pin]);

  const loadBrightness = useCallback(async () => {
    const r = await pcAction(pin, 'brightnessGet');
    if (r.ok && r.data) setBrightness(Number(r.data.brightness ?? 50));
    return r;
  }, [pin]);

  const notify = useCallback(
    (title: string, description?: string, destructive = false) => {
      toast({ title, description, variant: destructive ? 'destructive' : 'default' });
    },
    [toast]
  );

  const runAction = useCallback(
    async (command: string, args: Record<string, unknown> = {}, confirm = false, successMsg?: string) => {
      setBusy(true);
      try {
        const r = await pcAction(pin, command, args, confirm);
        if (!r.ok) {
          notify('Action failed', r.error ?? command, true);
          return r;
        }
        if (successMsg) notify(successMsg);
        return r;
      } finally {
        setBusy(false);
      }
    },
    [pin, notify]
  );

  /* ------------------------------ lifecycle ------------------------------ */

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    Promise.all([loadSystem(), loadWindows(), loadVolume(), loadBrightness()]).finally(() => setBusy(false));
    refreshShot({ scope: 'full' });
  }, [open, pin, loadSystem, loadWindows, loadVolume, loadBrightness, refreshShot]);

  // Clean up blob URLs when the panel closes/unmounts.
  useEffect(() => {
    if (!open) {
      if (prevShotUrl.current) URL.revokeObjectURL(prevShotUrl.current);
      prevShotUrl.current = null;
      setShotUrl(null);
    }
  }, [open]);

  // Auto-refresh the live screen every 5s while enabled.
  useEffect(() => {
    if (!autoRefresh || !open) return;
    const t = setInterval(() => {
      refreshShot({ scope: 'full' });
    }, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, open, refreshShot]);

  /* ------------------------------ shot overlay ---------------------------- */

  const onShotClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!shotNative.width || !shotNative.height) return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    // Map display coords → native virtual-screen coords.
    const x = Math.round(((e.clientX - rect.left) / rect.width) * shotNative.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * shotNative.height);
    await runAction('mouseClick', { button: clickButton, x, y, clicks: clickClicks }, false, `Clicked ${clickButton} at ${x}, ${y}`);
    if (autoRefresh) refreshShot({ scope: 'full' });
  };

  const shotWindow = async (w: WinInfo) => {
    const url = await pcShot(pin, { scope: 'window', title: w.title || undefined, handle: w.handle });
    if (!url) {
      notify('Screenshot failed', 'No image returned (window may be minimized/hidden).', true);
      return;
    }
    if (prevShotUrl.current && prevShotUrl.current !== url) URL.revokeObjectURL(prevShotUrl.current);
    prevShotUrl.current = url;
    setShotUrl(url);
    if (w.rect?.width && w.rect?.height) setShotNative({ width: w.rect.width, height: w.rect.height });
    notify('Window screenshot captured', w.title);
  };

  const focusWindow = async (w: WinInfo) => {
    await runAction('focusWindow', { title: w.title || '', handle: w.handle }, false, `Focused: ${w.title || w.processName}`);
    if (autoRefresh) refreshShot({ scope: 'full' });
  };

  const windowOp = async (w: WinInfo, command: 'closeWindow' | 'minimizeWindow' | 'maximizeWindow' | 'restoreWindow') => {
    const needsConfirm = command === 'closeWindow';
    const r = await runAction(command, { title: w.title || '', handle: w.handle }, needsConfirm, `${command} → ${w.title || w.processName}`);
    if (r.ok) {
      await loadWindows();
      if (autoRefresh) refreshShot({ scope: 'full' });
    }
  };

  const launchApp = async () => {
    const q = appQuery.trim();
    if (!q) return;
    const r = await runAction('launchApp', { app: q }, false, `Launched: ${q}`);
    if (r.ok) {
      setAppQuery('');
      await loadWindows();
      if (autoRefresh) refreshShot({ scope: 'full' });
    }
  };

  const typeText = async () => {
    const t = textQuery.trim();
    if (!t) return;
    const r = await runAction('typeText', { text: t }, false, `Typed ${t.length} chars`);
    if (r.ok) setTextQuery('');
  };

  const sendKeys = async () => {
    const k = keysQuery.trim();
    if (!k) return;
    const keys = k.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean);
    if (!keys.length) return;
    const r =
      keys.length > 1
        ? await runAction('keyCombo', { keys }, false, `Sent combo: ${keys.join(' + ')}`)
        : await runAction('keyTap', { key: keys[0] }, false, `Tapped: ${keys[0]}`);
    if (r.ok) setKeysQuery('');
  };

  const applyVolume = async (v: number) => {
    setVolume(v);
    await runAction('volumeSet', { level: v });
  };

  const applyBrightness = async (v: number) => {
    setBrightness(v);
    await runAction('brightnessSet', { level: v }, false, `Brightness set to ${v}%`);
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await runAction('volumeSet', { muted: next });
  };

  const doPower = async () => {
    if (!powerTarget) return;
    if (confirmText.trim().toLowerCase() !== 'confirm') {
      notify('Type "confirm" to proceed', undefined, true);
      return;
    }
    const r = await runAction(powerTarget, {}, true, `${powerTarget} triggered`);
    if (r.ok) {
      setPowerTarget(null);
      setConfirmText('');
    }
  };

  /* ------------------------------ render -------------------------------- */

  return (
    <>
      {/* Floating toggle button (right edge, above the input bar) */}
      <button
        onClick={() => onOpenChange(!open)}
        className={cn(
          'fixed right-4 bottom-24 z-[85] h-11 w-11 rounded-full shadow-lg flex items-center justify-center transition-colors',
          open ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        )}
        title={open ? 'Close PC control' : 'Open PC control'}
      >
        {open ? '✕' : '🖥️'}
      </button>

      {open && (
        <aside className="fixed top-16 right-0 bottom-24 z-[80] w-[430px] max-w-[94vw] bg-[#0e0f22] border-l border-white/[0.08] shadow-2xl flex flex-col rounded-tl-2xl">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-white">PC Control</h2>
              <p className="text-[11px] text-white/40">
                {system ? `${system.computer}\\${system.user} · ${system.virtualScreen?.width}×${system.virtualScreen?.height}` : 'connecting…'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-white/50 cursor-pointer">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
                Live
              </label>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => refreshShot({ scope: 'full' })} disabled={busy}>
                Refresh
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-5">
              {/* ------------------------------ screen preview ------------------------------ */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider">Live screen</h3>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] text-white/40">
                      {shotNative.width}×{shotNative.height}
                    </Badge>
                    <select
                      value={clickButton}
                      onChange={(e) => setClickButton(e.target.value as any)}
                      className="h-6 rounded bg-black/40 border border-white/10 text-[11px] text-white/70 px-1 outline-none"
                    >
                      <option value="left">Left click</option>
                      <option value="right">Right click</option>
                      <option value="middle">Middle click</option>
                    </select>
                    <select
                      value={clickClicks}
                      onChange={(e) => setClickClicks(Number(e.target.value))}
                      className="h-6 rounded bg-black/40 border border-white/10 text-[11px] text-white/70 px-1 outline-none"
                    >
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                    </select>
                  </div>
                </div>
                <div
                  ref={shotBoxRef}
                  className="relative rounded-lg overflow-hidden border border-white/10 bg-black/40 cursor-crosshair"
                >
                  {shotUrl ? (
                    <img
                      src={shotUrl}
                      alt="Live screen"
                      className="w-full h-auto block"
                      onClick={onShotClick}
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setShotScale(img.getBoundingClientRect().width / (img.naturalWidth || 1));
                      }}
                    />
                  ) : (
                    <div className="h-40 flex items-center justify-center text-xs text-white/30">No screenshot yet…</div>
                  )}
                </div>
                <p className="text-[10px] text-white/30 mt-1">Click the preview to click the real screen at that position.</p>
              </section>

              {/* ------------------------------ windows ------------------------------ */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider">
                    Windows <span className="text-white/30">({windows.length})</span>
                  </h3>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-white/50" onClick={() => loadWindows()} disabled={busy}>
                    Refresh list
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                  {windows.length === 0 && !busy && (
                    <p className="text-xs text-white/30 py-4 text-center">No windows found.</p>
                  )}
                  {windows.map((w) => (
                    <div
                      key={w.handle}
                      className={cn(
                        'rounded-md border px-2.5 py-2 cursor-pointer transition-colors',
                        selected?.handle === w.handle
                          ? 'border-indigo-500/60 bg-indigo-500/10'
                          : 'border-white/[0.06] bg-black/20 hover:bg-black/30'
                      )}
                      onClick={() => setSelected(w)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-white/85 truncate">{w.title || '(untitled)'}</p>
                          <p className="text-[10px] text-white/35 truncate">
                            {w.processName || w.className} · pid {w.pid} · #{w.handle}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant={w.visible ? 'default' : 'outline'} className={cn('text-[9px] h-4 px-1.5', w.visible ? '' : 'text-white/30')}>
                            {w.minimized ? 'min' : w.visible ? 'shown' : 'hidden'}
                          </Badge>
                        </div>
                      </div>
                      {selected?.handle === w.handle && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Button size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); focusWindow(w); }}>
                            Focus
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); shotWindow(w); }}>
                            Screenshot
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); windowOp(w, 'minimizeWindow'); }}>
                            Minimize
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); windowOp(w, 'maximizeWindow'); }}>
                            Maximize
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); windowOp(w, 'restoreWindow'); }}>
                            Restore
                          </Button>
                          <Button size="sm" variant="destructive" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); windowOp(w, 'closeWindow'); }}>
                            Close
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* ------------------------------ launch & input ------------------------------ */}
              <section>
                <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider mb-2">Launch & input</h3>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={appQuery}
                      onChange={(e) => setAppQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && launchApp()}
                      placeholder="Launch app — e.g. notepad, chrome, calc"
                      className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/30"
                    />
                    <Button size="sm" className="h-8 shrink-0 text-xs" onClick={launchApp} disabled={busy || !appQuery.trim()}>
                      Launch
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={textQuery}
                      onChange={(e) => setTextQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && typeText()}
                      placeholder="Type text into the focused window"
                      className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/30"
                    />
                    <Button size="sm" variant="secondary" className="h-8 shrink-0 text-xs" onClick={typeText} disabled={busy || !textQuery.trim()}>
                      Type
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={keysQuery}
                      onChange={(e) => setKeysQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendKeys()}
                      placeholder="Keys — e.g. Enter, ctrl+s, alt+tab"
                      className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-white/30"
                    />
                    <Button size="sm" variant="secondary" className="h-8 shrink-0 text-xs" onClick={sendKeys} disabled={busy || !keysQuery.trim()}>
                      Send
                    </Button>
                  </div>
                </div>
              </section>

              {/* ------------------------------ mouse, volume & brightness ------------------------------ */}
              <section>
                <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider mb-2">Mouse, volume & brightness</h3>
                <div className="flex gap-2 mb-3">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => runAction('mouseClick', { button: 'left' }, false, 'Clicked left')} disabled={busy}>
                    Left click
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => runAction('mouseClick', { button: 'right' }, false, 'Clicked right')} disabled={busy}>
                    Right click
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => runAction('mouseClick', { button: 'left', clicks: 2 }, false, 'Double click')} disabled={busy}>
                    Double click
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/50 w-9 shrink-0">Volume</span>
                  <Slider
                    value={[volume]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => applyVolume(v)}
                    className="flex-1"
                  />
                  <span className="text-[11px] text-white/60 w-8 text-right">{volume}%</span>
                  <Button size="sm" variant={muted ? 'destructive' : 'outline'} className="h-6 px-2 text-[10px]" onClick={toggleMute}>
                    {muted ? 'Unmute' : 'Mute'}
                  </Button>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-white/50 w-9 shrink-0">Bright</span>
                  <Slider
                    value={[brightness]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => applyBrightness(v)}
                    className="flex-1"
                  />
                  <span className="text-[11px] text-white/60 w-8 text-right">{brightness}%</span>
                </div>
              </section>

              {/* ------------------------------ power ------------------------------ */}
              <section className="pb-2">
                <h3 className="text-xs font-medium text-white/70 uppercase tracking-wider mb-2">Power</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => setPowerTarget('shutdown')} disabled={busy}>
                    Shutdown
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => setPowerTarget('restart')} disabled={busy}>
                    Restart
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => setPowerTarget('logoff')} disabled={busy}>
                    Log off
                  </Button>
                </div>
              </section>
            </div>
          </ScrollArea>
        </aside>
      )}

      {/* ------------------------------ power confirm dialog ------------------------------ */}
      <Dialog open={!!powerTarget} onOpenChange={(v) => { if (!v) { setPowerTarget(null); setConfirmText(''); } }}>
        <DialogContent className="bg-[#131429] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Confirm {powerTarget ?? ''}</DialogTitle>
            <DialogDescription className="text-xs text-white/50">
              This will {powerTarget === 'logoff' ? 'sign you out of this machine' : `${powerTarget} this PC immediately`}. Type{' '}
              <span className="text-white font-mono">confirm</span> to proceed.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="confirm"
            className="h-8 text-xs bg-black/40 border-white/10 text-white"
          />
          <DialogFooter>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setPowerTarget(null); setConfirmText(''); }}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={doPower} disabled={confirmText.trim().toLowerCase() !== 'confirm'}>
              {powerTarget === 'logoff' ? 'Log off' : powerTarget === 'restart' ? 'Restart' : 'Shut down'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}