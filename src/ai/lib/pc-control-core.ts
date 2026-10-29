/**
 * pc-control-core.ts — Windows PC-control engine for the Jimskay AI "PC Control" mode.
 *
 * Rebuilt for full window automation control:
 *  - Real top-level window enumeration (EnumWindows): every window (visible or
 *    hidden), with title, class, pid, handle, rect, minimized state.
 *  - findWindow / focusWindow / window-state commands resolve by HANDLE, TITLE,
 *    PROCESS NAME or CLASS NAME — the model may pass any of these; the engine
 *    resolves to a real window.
 *  - launchApp is smart: PATH + PATHEXT scan, Start-Menu .lnk lookup, UWP
 *    (Start Apps) resolution, URL handling, and it waits for the new window and
 *    focuses it before returning.
 *  - Screenshots: full virtual screen, any screen region, or a single window.
 *  - Text input: unicode keyboard events, with an optional clipboard paste mode
 *    for long/paste-heavy text.
 *
 * Heavy lifting is done by a persistent Windows PowerShell worker. The engine
 * script is embedded below as a string constant so the standalone Next.js
 * bundle never has to ship extra .ps1 files: the script is written to
 * os.tmpdir() on first use and the worker is spawned with `powershell -File`.
 *
 * Protocol: newline-delimited JSON. Node writes {id, cmd, args}\n to the
 * worker's stdin; the worker answers one {id, ok, data?} | {id, ok:false, error?}
 * line on stdout per request. Coordinates are physical screen pixels (the
 * worker enables per-process DPI awareness) so what a screenshot shows matches
 * the coordinates used for mouseMove / mouseClick.
 *
 * Safety: destructive / irreversible operations (closeWindow, killProcess,
 * shutdown, restart, logoff, destructive runCommand patterns) require
 * `confirm: true` and are refused otherwise. Screenshots are returned to the
 * caller but never persisted. Commands never throw across the process boundary:
 * they return { ok:false, error } and the flow records an 'error' tool step.
 */

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { actionKey, runOnce } from '@/ai/lib/admin-action-coordinator';

/* ========================================================================== */
/*  Embedded PowerShell engine                                                */
/* ========================================================================== */

// NOTE: String.raw keeps every backslash literal, so the PowerShell/C# below
// can use C:\ paths, DllImport attributes and regexes untouched. NEVER use ${`
// (JS interpolation) inside the script — always write $var / $($var.x).
const ENGINE_PS1 = String.raw`# PC-CONTROL ENGINE — JSON-lines worker for Jimskay AI PC Control mode.
$ErrorActionPreference = 'Stop'
try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$ProgressPreference = 'SilentlyContinue'

function Send-Json($obj) {
  try {
    $line = ConvertTo-Json -InputObject $obj -Compress -Depth 12
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($line)
    $pcOut = [System.Console]::OpenStandardOutput()
    $pcOut.Write($bytes, 0, $bytes.Length)
    $pcOut.WriteByte(10)
    $pcOut.Flush()
  } catch {
    try {
      $fb = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"json encode failed"}')
      $pcErr = [System.Console]::OpenStandardOutput()
      $pcErr.Write($fb, 0, $fb.Length)
      $pcErr.WriteByte(10)
      $pcErr.Flush()
    } catch {}
  }
}

function Send-Error($id, $msg) {
  Send-Json @{ id = $id; ok = $false; error = ([string]$msg) }
}

function Get-Arg($map, $name, $default) {
  if ($null -eq $map) { return $default }
  try {
    if ($map.ContainsKey($name)) {
      $v = $map[$name]
      if ($null -ne $v) { return $v }
    }
  } catch {}
  $v = $map.PSObject.Properties[$name]
  if ($null -ne $v -and $null -ne $v.Value) { return $v.Value }
  return $default
}

# ---------------------------------------------------------------------------
#  Native interop (user32 input, window management, screenshot helpers)
# ---------------------------------------------------------------------------
$NativeCs = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class PcNative {
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint MOUSEEVENTF_HWHEEL = 0x1000;

  public const int SW_RESTORE = 9;
  public const int SW_MINIMIZE = 6;
  public const int SW_MAXIMIZE = 3;
  public const uint WM_CLOSE = 0x0010;

  public const byte VK_CONTROL = 0x11;
  public const byte VK_SHIFT = 0x10;
  public const byte VK_MENU = 0x12;
  public const byte VK_LWIN = 0x5B;
  public const byte VK_RETURN = 0x0D;
  public const byte VK_TAB = 0x09;
  public const byte VK_ESCAPE = 0x1B;
  public const byte VK_BACK = 0x08;
  public const byte VK_SPACE = 0x20;
  public const byte VK_DELETE = 0x2E;
  public const byte VK_INSERT = 0x2D;
  public const byte VK_HOME = 0x24;
  public const byte VK_END = 0x23;
  public const byte VK_PRIOR = 0x21;
  public const byte VK_NEXT = 0x22;
  public const byte VK_LEFT = 0x25;
  public const byte VK_UP = 0x26;
  public const byte VK_RIGHT = 0x27;
  public const byte VK_DOWN = 0x28;
  public const byte VK_CAPITAL = 0x14;
  public const byte VK_OEM_PLUS = 0xBB;
  public const byte VK_OEM_MINUS = 0xBD;
  public const byte VK_OEM_1 = 0xBA;   // ;:
  public const byte VK_OEM_PERIOD = 0xBE;
  public const byte VK_OEM_COMMA = 0xBC;
  public const byte VK_OEM_2 = 0xBF;   // /?
  public const byte VK_OEM_3 = 0xC0;   // accent-grave / tilde
  public const byte VK_OEM_4 = 0xDB;   // [{
  public const byte VK_OEM_5 = 0xDC;   // \|
  public const byte VK_OEM_6 = 0xDD;   // ]}
  public const byte VK_OEM_7 = 0xDE;   // '"
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;
  public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;

  public const byte VK_MEDIA_NEXT = 0xB0;
  public const byte VK_MEDIA_PREV = 0xB1;
  public const byte VK_MEDIA_STOP = 0xB2;
  public const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
  public const byte VK_VOLUME_MUTE = 0xAD;
  public const byte VK_VOLUME_DOWN = 0xAE;
  public const byte VK_VOLUME_UP = 0xAF;
  public const byte VK_SNAPSHOT = 0x2C;
  public const byte VK_LBUTTON = 0x01;

  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_SHOWWINDOW = 0x0040;

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public MOUSEINPUT mi; }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public InputUnion U; }

  public class WinInfo {
    public long Handle;
    public uint Pid;
    public string Title = "";
    public string ClassName = "";
    public bool Visible;
    public bool Iconic;
    public RECT Rect;
    public string RectText() { return Rect.Left + "," + Rect.Top + "," + (Rect.Right - Rect.Left) + "," + (Rect.Bottom - Rect.Top); }
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

  public static string WindowText(IntPtr h) {
    StringBuilder sb = new StringBuilder(1025);
    int n = GetWindowText(h, sb, 1024);
    return n > 0 ? sb.ToString() : "";
  }
  public static string WindowClass(IntPtr h) {
    StringBuilder sb = new StringBuilder(513);
    GetClassName(h, sb, 512);
    return sb.ToString();
  }
  public static int WindowPid(IntPtr h) {
    uint pid; GetWindowThreadProcessId(h, out pid); return (int)pid;
  }

  public static List<WinInfo> TopWindows() {
    var list = new List<WinInfo>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      var w = new WinInfo();
      w.Pid = (uint)WindowPid(h);
      w.Title = WindowText(h);
      w.ClassName = WindowClass(h);
      w.Visible = IsWindowVisible(h);
      w.Iconic = IsIconic(h);
      RECT r; GetWindowRect(h, out r);
      w.Rect = r;
      w.Handle = h.ToInt64();
      list.Add(w);
      return true;
    }, IntPtr.Zero);
    return list;
  }

  public static string[] ActiveWindowInfo() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return new string[0];
    RECT r; GetWindowRect(h, out r);
    return new string[] {
      h.ToInt64().ToString(),
      WindowPid(h).ToString(),
      WindowText(h),
      WindowClass(h),
      r.Left + "," + r.Top + "," + (r.Right - r.Left) + "," + (r.Bottom - r.Top)
    };
  }

  public static void MouseMoveTo(int x, int y) { SetCursorPos(x, y); }
  public static int[] CursorPos() {
    POINT p; p.X = 0; p.Y = 0;
    GetCursorPos(out p);
    return new int[] { p.X, p.Y };
  }
  public static void MouseClick(string button, int x, int y, int clicks) {
    if (clicks < 1) clicks = 1;
    if (clicks > 20) clicks = 20;
    if (x >= 0 && y >= 0) SetCursorPos(x, y);
    uint down = MOUSEEVENTF_LEFTDOWN, up = MOUSEEVENTF_LEFTUP;
    if (button == "right") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; }
    else if (button == "middle") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; }
    for (int i = 0; i < clicks; i++) {
      mouse_event(down, 0, 0, 0, UIntPtr.Zero);
      System.Threading.Thread.Sleep(40);
      mouse_event(up, 0, 0, 0, UIntPtr.Zero);
      if (clicks > 1) System.Threading.Thread.Sleep(70);
    }
  }
  public static void MouseScroll(int clicks, bool horizontal) {
    if (clicks == 0) return;
    if (clicks < -100) clicks = -100;
    if (clicks > 100) clicks = 100;
    mouse_event(horizontal ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL, 0, 0, (uint)(120 * clicks), UIntPtr.Zero);
  }
  public static void MouseDrag(int x1, int y1, int x2, int y2, int steps, int stepMs) {
    if (steps < 2) steps = 2;
    if (steps > 200) steps = 200;
    if (stepMs < 0) stepMs = 0;
    if (stepMs > 100) stepMs = 100;
    SetCursorPos(x1, y1);
    System.Threading.Thread.Sleep(60);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(60);
    for (int i = 1; i <= steps; i++) {
      int x = x1 + ((x2 - x1) * i) / steps;
      int y = y1 + ((y2 - y1) * i) / steps;
      SetCursorPos(x, y);
      if (stepMs > 0) System.Threading.Thread.Sleep(stepMs);
    }
    System.Threading.Thread.Sleep(40);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
  }

  public static byte KeyCode(string name) {
    if (string.IsNullOrEmpty(name)) return 0;
    string k = name.Trim().ToLowerInvariant();
    if (k.Length == 1) {
      char c = k[0];
      if (c >= 'a' && c <= 'z') return (byte)(c - 'a' + 0x41);
      if (c >= '0' && c <= '9') return (byte)(c - '0' + 0x30);
      if (c == ';') return VK_OEM_1;
      if (c == '.') return VK_OEM_PERIOD;
      if (c == ',') return VK_OEM_COMMA;
      if (c == '/') return VK_OEM_2;
      if (c == (char)96) return VK_OEM_3;
      if (c == '[') return VK_OEM_4;
      if (c == '\\') return VK_OEM_5;
      if (c == ']') return VK_OEM_6;
      if (c == '\'') return VK_OEM_7;
      if (c == '-') return VK_OEM_MINUS;
      if (c == '=') return VK_OEM_PLUS;
    }
    switch (k) {
      case "enter": case "return": return VK_RETURN;
      case "esc": case "escape": return VK_ESCAPE;
      case "tab": return VK_TAB;
      case "space": return VK_SPACE;
      case "backspace": case "back": return VK_BACK;
      case "delete": case "del": return VK_DELETE;
      case "insert": case "ins": return VK_INSERT;
      case "home": return VK_HOME;
      case "end": return VK_END;
      case "pageup": case "pgup": return VK_PRIOR;
      case "pagedown": case "pgdn": return VK_NEXT;
      case "prtsc": case "printscreen": case "snapshot": return VK_SNAPSHOT;
      case "left": case "arrowleft": return VK_LEFT;
      case "up": case "arrowup": return VK_UP;
      case "right": case "arrowright": return VK_RIGHT;
      case "down": case "arrowdown": return VK_DOWN;
      case "capslock": case "caps": return VK_CAPITAL;
      case "plus": return VK_OEM_PLUS;
      case "minus": return VK_OEM_MINUS;
      case "numplus": return 0x6B;
      case "numminus": return 0x6D;
      case "nummult": return 0x6A;
      case "numdiv": return 0x6F;
      case "numlock": return 0x90;
    }
    if (k.Length <= 3 && k[0] == 'f') {
      int fn;
      if (int.TryParse(k.Substring(1), out fn) && fn >= 1 && fn <= 24) return (byte)(0x6F + fn);
    }
    return 0;
  }
  public static bool IsModifier(string name) {
    string k = (name ?? "").Trim().ToLowerInvariant();
    return k == "ctrl" || k == "control" || k == "shift" || k == "alt" || k == "win" || k == "meta" || k == "super";
  }
  public static void KeyTap(byte vk, bool extended) {
    uint ext = extended ? KEYEVENTF_EXTENDEDKEY : 0;
    keybd_event(vk, 0, ext, UIntPtr.Zero);
    keybd_event(vk, 0, ext | KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
  public static bool IsExtendedKey(byte vk) {
    return vk == VK_LEFT || vk == VK_UP || vk == VK_RIGHT || vk == VK_DOWN ||
           vk == VK_HOME || vk == VK_END || vk == VK_PRIOR || vk == VK_NEXT || vk == VK_DELETE || vk == VK_INSERT;
  }
  public static void KeyDown(byte vk, bool extended) {
    uint ext = extended ? KEYEVENTF_EXTENDEDKEY : 0;
    keybd_event(vk, 0, ext, UIntPtr.Zero);
  }
  public static void KeyUp(byte vk, bool extended) {
    uint ext = extended ? KEYEVENTF_EXTENDEDKEY : 0;
    keybd_event(vk, 0, ext | KEYEVENTF_KEYUP, UIntPtr.Zero);
  }
  public static void SendCombo(string[] keys) {
    if (keys == null || keys.Length == 0) return;
    List<byte> pressed = new List<byte>();
    List<byte> taps = new List<byte>();
    foreach (string raw in keys) {
      string k = (raw ?? "").Trim().ToLowerInvariant();
      byte vk = KeyCode(k);
      if (k == "ctrl" || k == "control") vk = VK_CONTROL;
      else if (k == "shift") vk = VK_SHIFT;
      else if (k == "alt") vk = VK_MENU;
      else if (k == "win" || k == "meta" || k == "super") vk = VK_LWIN;
      else if (vk == 0) continue;
      if (IsModifier(k)) pressed.Add(vk); else taps.Add(vk);
    }
    foreach (byte vk in pressed) KeyDown(vk, IsExtendedKey(vk));
    foreach (byte vk in taps) KeyTap(vk, IsExtendedKey(vk));
    for (int i = pressed.Count - 1; i >= 0; i--) KeyUp(pressed[i], IsExtendedKey(pressed[i]));
  }
  public static void TypeUnicode(string text) {
    if (string.IsNullOrEmpty(text)) return;
    foreach (char c in text) {
      if (c == '\n' || c == '\r') { KeyTap(VK_RETURN, false); continue; }
      INPUT[] d = new INPUT[1];
      d[0].type = 1; // KEYBDINPUT
      d[0].U.ki.wVk = 0;
      d[0].U.ki.wScan = (ushort)c;
      d[0].U.ki.dwFlags = KEYEVENTF_UNICODE;
      d[0].U.ki.time = 0;
      d[0].U.ki.dwExtraInfo = IntPtr.Zero;
      SendInput(1, d, Marshal.SizeOf(typeof(INPUT)));
      INPUT[] u = new INPUT[1];
      u[0].type = 1;
      u[0].U.ki.wVk = 0;
      u[0].U.ki.wScan = (ushort)c;
      u[0].U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
      u[0].U.ki.time = 0;
      u[0].U.ki.dwExtraInfo = IntPtr.Zero;
      SendInput(1, u, Marshal.SizeOf(typeof(INPUT)));
      System.Threading.Thread.Sleep(6);
    }
  }
  public static void MediaKey(string key) {
    byte vk = 0;
    switch ((key ?? "").Trim().ToLowerInvariant()) {
      case "volumeup": case "volup": vk = VK_VOLUME_UP; break;
      case "volumedown": case "voldown": vk = VK_VOLUME_DOWN; break;
      case "mute": case "volumemute": vk = VK_VOLUME_MUTE; break;
      case "playpause": case "play": case "pause": vk = VK_MEDIA_PLAY_PAUSE; break;
      case "next": case "nexttrack": vk = VK_MEDIA_NEXT; break;
      case "prev": case "previoustrack": case "previous": vk = VK_MEDIA_PREV; break;
      case "stop": case "mediastop": vk = VK_MEDIA_STOP; break;
    }
    if (vk != 0) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); }
  }

  public static bool TryFocus(long h) {
    IntPtr hWnd = new IntPtr(h);
    if (hWnd == IntPtr.Zero) return false;
    if (IsIconic(hWnd)) ShowWindow(hWnd, SW_RESTORE);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    ShowWindow(hWnd, SW_RESTORE);
    return GetForegroundWindow() == hWnd || true;
  }
  public static void FocusWindow(long h) {
    IntPtr hWnd = new IntPtr(h);
    if (hWnd == IntPtr.Zero) return;
    if (IsIconic(hWnd)) ShowWindow(hWnd, SW_RESTORE);
    uint fgThread = 0;
    IntPtr fg = GetForegroundWindow();
    if (fg != IntPtr.Zero) { uint t; GetWindowThreadProcessId(fg, out t); fgThread = t; }
    uint targetThread;
    GetWindowThreadProcessId(hWnd, out targetThread);
    uint self = GetCurrentThreadId();
    bool attached = false;
    if (fgThread != 0 && targetThread != 0 && fgThread != self) {
      attached = AttachThreadInput(self, fgThread, true);
    }
    BringWindowToTop(hWnd);
    ShowWindow(hWnd, SW_RESTORE);
    SetForegroundWindow(hWnd);
    if (GetForegroundWindow() != hWnd) {
      // Simulate a tiny alt-press so Windows allows the foreground change.
      KeyDown(VK_MENU, false); KeyUp(VK_MENU, false);
      SetForegroundWindow(hWnd);
    }
    if (attached) AttachThreadInput(self, fgThread, false);
  }
  public static void ShowWindowState(long h, int cmd) {
    IntPtr hWnd = new IntPtr(h);
    if (hWnd != IntPtr.Zero) ShowWindow(hWnd, cmd);
  }
  public static void CloseWindow(long h) {
    IntPtr hWnd = new IntPtr(h);
    if (hWnd != IntPtr.Zero) PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
  }
  public static int[] WindowRect(long h) {
    IntPtr hWnd = new IntPtr(h);
    RECT r; r.Left = 0; r.Top = 0; r.Right = 0; r.Bottom = 0;
    if (hWnd != IntPtr.Zero) GetWindowRect(hWnd, out r);
    return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top };
  }
  public static void MoveWindowPartial(long h, int? x, int? y, int? w, int? ht) {
    IntPtr hWnd = new IntPtr(h);
    if (hWnd == IntPtr.Zero) return;
    RECT r;
    GetWindowRect(hWnd, out r);
    int nx = x.HasValue ? x.Value : r.Left;
    int ny = y.HasValue ? y.Value : r.Top;
    int nw = w.HasValue ? w.Value : (r.Right - r.Left);
    int nh = ht.HasValue ? ht.Value : (r.Bottom - r.Top);
    SetWindowPos(hWnd, IntPtr.Zero, nx, ny, nw, nh, SWP_NOZORDER | SWP_SHOWWINDOW);
  }
}
"@
# C# helper to return a frame-corrected window rect (DWM extended bounds)
$FrameCs = @"
using System;
using System.Runtime.InteropServices;
public static class PcFrame {
  [DllImport("dwmapi.dll")]
  public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out ConverterRect pv, int cbAttribute);
  [StructLayout(LayoutKind.Sequential)]
  public struct ConverterRect { public int Left; public int Top; public int Right; public int Bottom; }
  public static int[] Get(IntPtr hwnd) {
    ConverterRect r; r.Left = 0; r.Top = 0; r.Right = 0; r.Bottom = 0;
    if (hwnd != IntPtr.Zero) {
      int hr = DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(ConverterRect)));
      // attribute 9 = DWMWA_EXTENDED_FRAME_BOUNDS
      if (hr != 0) { r.Left = 0; r.Top = 0; r.Right = 0; r.Bottom = 0; }
    }
    return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top };
  }
}
"@

Add-Type -TypeDefinition $NativeCs
try { [PcNative]::SetProcessDPIAware() | Out-Null } catch {}
try { Add-Type -TypeDefinition $FrameCs } catch {}

# ---------------------------------------------------------------------------
#  Audio endpoint volume (absolute level set via Core Audio COM)
# ---------------------------------------------------------------------------
$AudioCs = @"
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDevice ppDevice);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
  int Activate(ref Guid iid, int clsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[ComImport]
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out int count);
  int SetMasterVolumeLevel(float level, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
  int GetMasterVolumeLevel(out float level);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channel, float level, ref Guid ctx);
  int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
  int GetChannelVolumeLevel(uint channel, out float level);
  int GetChannelVolumeLevelScalar(uint channel, out float level);
  int SetMute(bool mute, ref Guid ctx);
  int GetMute(out bool mute);
}

public static class PcAudio {
  private static IAudioEndpointVolume Endpoint() {
    MMDeviceEnumeratorComObject com = new MMDeviceEnumeratorComObject();
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)com;
    IMMDevice dev;
    int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
    if (hr != 0) throw new Exception("GetDefaultAudioEndpoint failed: 0x" + hr.ToString("X8"));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    hr = dev.Activate(ref iid, 1, IntPtr.Zero, out o);
    if (hr != 0) throw new Exception("IAudioEndpointVolume activate failed: 0x" + hr.ToString("X8"));
    return (IAudioEndpointVolume)o;
  }
  public static float GetLevel() { float f; Endpoint().GetMasterVolumeLevelScalar(out f); return f; }
  public static void SetLevel(float scalar) {
    if (scalar < 0f) scalar = 0f;
    if (scalar > 1f) scalar = 1f;
    Guid g = Guid.Empty;
    Endpoint().SetMasterVolumeLevelScalar(scalar, ref g);
  }
  public static bool GetMuted() { bool m; Endpoint().GetMute(out m); return m; }
  public static void SetMuted(bool m) { Guid g = Guid.Empty; Endpoint().SetMute(m, ref g); }
}
"@
Add-Type -TypeDefinition $AudioCs

# ---------------------------------------------------------------------------
#  Window / process helpers
# ---------------------------------------------------------------------------
function Get-AllWindows {
  $raw = Get-Process -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
  $procMap = @{}
  foreach ($p in $raw) { $procMap[[string]$p.Id] = $p.ProcessName }
  $out = @()
  foreach ($w in [PcNative]::TopWindows()) {
    $procName = $procMap[[string]$w.Pid]
    if (-not $procName) { $procName = '' }
    $out += [pscustomobject]@{
      handle = $w.Handle
      pid = $w.Pid
      title = $w.Title
      className = $w.ClassName
      processName = $procName
      visible = $w.Visible
      minimized = $w.Iconic
      rect = @{ left = $w.Rect.Left; top = $w.Rect.Top; width = ($w.Rect.Right - $w.Rect.Left); height = ($w.Rect.Bottom - $w.Rect.Top) }
      rectObj = @{ left = $w.Rect.Left; top = $w.Rect.Top; width = ($w.Rect.Right - $w.Rect.Left); height = ($w.Rect.Bottom - $w.Rect.Top) }
    }
  }
  return @($out)
}

function Resolve-WindowHandle($argMap) {
  $handle = Get-Arg $argMap 'handle' $null
  if ($null -ne $handle) {
    $h = [int64]$handle
    if ($h -eq 0) { throw 'Handle is 0 (no window).' }
    return $h
  }
  $title = Get-Arg $argMap 'title' $null
  $app = Get-Arg $argMap 'app' $null
  $processName = Get-Arg $argMap 'processName' $null
  $className = Get-Arg $argMap 'className' $null
  if ($null -eq $title -and $null -eq $app -and $null -eq $processName -and $null -eq $className) {
    throw 'Resolve failed: provide handle, title, app/processName or className.'
  }
  $needTitle = [string]$title
  $needApp = [string]$app
  $needProc = [string]$processName
  $needClass = [string]$className
  $all = Get-AllWindows
  foreach ($w in $all) {
    if ($needTitle -and $w.title -notlike "*$needTitle*") { continue }
    if ($needClass -and $w.className -notlike "*$needClass*") { continue }
    if ($needApp -and -not ($w.processName -like "*$needApp*")) { continue }
    if ($needProc -and -not ($w.processName -like "*$needProc*")) { continue }
    return $w.handle
  }
  # second pass with relaxed matching (case-insensitive substring on title)
  foreach ($w in $all) {
    if ($needTitle -and $w.title.IndexOf($needTitle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
    if ($needProc -and -not ($w.processName -like "*$needProc*")) { continue }
    if ($needClass -and -not ($w.className -like "*$needClass*")) { continue }
    return $w.handle
  }
  throw "No window matched title='$needTitle' app='$needApp' processName='$needProc' className='$needClass'."
}

function Get-WindowInfoObj($h) {
  $all = Get-AllWindows
  $w = $all | Where-Object { $_.handle -eq $h } | Select-Object -First 1
  if (-not $w) {
    return @{
      handle = $h; title = ''; className = ''; pid = 0; processName = ''
      visible = $false; minimized = $false
      rect = @{ left = 0; top = 0; width = 0; height = 0 }
    }
  }
  return @{
    handle = $w.handle; pid = $w.pid; title = $w.title; className = $w.className
    processName = $w.processName; visible = $w.visible; minimized = $w.minimized
    rect = $w.rectObj; foreground = ([int64][PcNative]::GetForegroundWindow() -eq $h)
  }
}

function Take-ScreenshotBase64 {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size)
    $ms = New-Object System.IO.MemoryStream
    try {
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      return [Convert]::ToBase64String($ms.ToArray())
    } finally { $ms.Dispose() }
  } finally { $g.Dispose(); $bmp.Dispose() }
}

function Take-ScreenshotRegionBase64($left, $top, $width, $height) {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $lx = [Math]::Max($left, $bounds.Left)
  $ly = [Math]::Max($top, $bounds.Top)
  $rx = [Math]::Min($left + $width, $bounds.Right)
  $ry = [Math]::Min($top + $height, $bounds.Bottom)
  if ($rx -le $lx -or $ry -le $ly) { throw 'Screenshot region is outside the virtual screen.' }
  $bmp = New-Object System.Drawing.Bitmap ($rx - $lx), ($ry - $ly)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($lx, $ly, 0, 0, $bmp.Size)
    $ms = New-Object System.IO.MemoryStream
    try {
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      return [Convert]::ToBase64String($ms.ToArray())
    } finally { $ms.Dispose() }
  } finally { $g.Dispose(); $bmp.Dispose() }
}

function Resolve-LaunchTarget($target, $arguments) {
  $trimmed = [string]$target
  if ([string]::IsNullOrWhiteSpace($trimmed)) { throw 'target is required' }
  if ($trimmed -match '^(?i)https?://') { return @{ type = 'Url'; value = $trimmed } }
  if ($trimmed -match '^(?i)(youtube)$') { return @{ type = 'Url'; value = 'https://www.youtube.com' } }
  if ([System.IO.Path]::IsPathRooted($trimmed)) {
    if (Test-Path -LiteralPath $trimmed) { return @{ type = 'Exe'; value = $trimmed } }
    throw "Path not found: $trimmed"
  }
  $cmd = Get-Command $trimmed -CommandType Application -ErrorAction SilentlyContinue
  if ($cmd) { return @{ type = 'Exe'; value = $cmd.Source } }
  # PATH / PATHEXT scan
  $pathext = @($env:PATHEXT -split ';' | Where-Object { $_ })
  if ($pathext.Count -eq 0) { $pathext = @('.COM','.EXE','.BAT','.CMD') }
  $scanDirs = @($env:PATH -split ';' | Where-Object { $_ }) + @(
    [IO.Path]::Combine($env:WINDIR, 'System32'),
    [IO.Path]::Combine($env:WINDIR, 'SystemApps')
  )
  foreach ($dir in $scanDirs) {
    foreach ($ext in $pathext) {
      $candidate = [IO.Path]::Combine($dir, ($trimmed + $ext))
      if (Test-Path -LiteralPath $candidate) { return @{ type = 'Exe'; value = $candidate } }
    }
  }
  # Start Menu shortcuts
  $lnkDirs = @(
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'),
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\WindowsApps')
  )
  foreach ($d in $lnkDirs) {
    $candidate = Get-ChildItem -LiteralPath $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.BaseName -like "*$trimmed*" } | Select-Object -First 1
    if ($candidate) { return @{ type = 'Lnk'; value = $candidate.FullName } }
  }
  # UWP / WindowsApps
  $app = Get-StartApps -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*$trimmed*" -or $_.AppID -like "*$trimmed*" } | Select-Object -First 1
  if ($app) { return @{ type = 'Uwp'; value = $app.AppID; name = $app.Name } }
  throw "Could not resolve launch target: $trimmed"
}

# ---------------------------------------------------------------------------
#  UI Automation (UIAutomationClient) — element tree, find, invoke, setValue, select
#  Runs on the worker's main thread (powershell.exe console host is STA by default).
# ---------------------------------------------------------------------------
function Ensure-UiaRoot {
  if (-not $script:uiaReady) {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    try { [System.Threading.Thread]::CurrentThread.TrySetApartmentState([System.Threading.ApartmentState]::STA) | Out-Null } catch {}
    $script:uiaRoot = [System.Windows.Automation.AutomationElement]::RootElement
    $script:uiaReady = $true
  }
  return $script:uiaRoot
}

function Get-UiaElementData($e) {
  if ($null -eq $e) { return $null }
  $r = $null
  try { $r = $e.Current.BoundingRectangle } catch {}
  $rect = $null
  if ($r -and $r.Width -gt 0 -and $r.Height -gt 0) {
    $rect = @{ x = [int]$r.X; y = [int]$r.Y; width = [int]$r.Width; height = [int]$r.Height }
  }
  $ct = ''
  try { $ct = $e.Current.ControlType.ProgrammaticName } catch {}
  $aid = ''
  try { $aid = $e.Current.AutomationId } catch {}
  return [ordered]@{
    name = $e.Current.Name
    automationId = $aid
    className = $e.Current.ClassName
    controlType = $ct
    enabled = $e.Current.IsEnabled
    offscreen = $e.Current.IsOffscreen
    rect = $rect
  }
}

function Get-UiaWindow($windowTitle) {
  $root = Ensure-UiaRoot
  if ([string]::IsNullOrWhiteSpace($windowTitle)) { return $root }
  $children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($c in $children) {
    if ($c.Current.Name -like "*$windowTitle*") { return $c }
  }
  throw "UIA window not found: $windowTitle"
}

function Find-UiaElements($argMap) {
  $root = Ensure-UiaRoot
  $windowTitle = [string]$(Get-Arg $argMap 'windowTitle' '')
  $name = [string]$(Get-Arg $argMap 'name' '')
  $automationId = [string]$(Get-Arg $argMap 'automationId' '')
  $controlType = [string]$(Get-Arg $argMap 'controlType' '')
  $maxResults = [int]$(Get-Arg $argMap 'maxResults' 40)
  $conditions = New-Object System.Collections.Generic.List[System.Windows.Automation.Condition]
  if ($name) { $conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name))) | Out-Null }
  if ($automationId) { $conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $automationId))) | Out-Null }
  $condition = [System.Windows.Automation.Condition]::TrueCondition
  if ($conditions.Count -eq 1) { $condition = $conditions[0] }
  elseif ($conditions.Count -gt 1) { $condition = New-Object System.Windows.Automation.AndCondition(([System.Windows.Automation.Condition[]]$conditions.ToArray())) }
  $base = Get-UiaWindow $windowTitle
  $found = @($base.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition) | Where-Object { -not $controlType -or $_.Current.ControlType.ProgrammaticName -like "*$controlType*" } | Select-Object -First $maxResults)
  return ,$found
}

function Walk-UiaTree($e, $depth, $maxDepth, $maxResults, $out) {
  if ($script:uiaStop) { return }
  if ($out.Count -ge $maxResults) { $script:uiaStop = $true; return }
  if ($depth -gt $maxDepth) { return }
  if ($depth -gt 0) { [void]$out.Add((Get-UiaElementData $e)) }
  $children = $e.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($c in $children) {
    Walk-UiaTree $c ($depth + 1) $maxDepth $maxResults $out
    if ($script:uiaStop) { break }
  }
}

function Get-UiaTree($argMap) {
  $root = Ensure-UiaRoot
  $windowTitle = [string]$(Get-Arg $argMap 'windowTitle' '')
  $maxDepth = [int]$(Get-Arg $argMap 'maxDepth' 6)
  $maxResults = [int]$(Get-Arg $argMap 'maxResults' 150)
  $base = Get-UiaWindow $windowTitle
  $script:uiaStop = $false
  $out = New-Object System.Collections.ArrayList
  Walk-UiaTree $base 0 $maxDepth $maxResults $out
  return @{ count = $out.Count; elements = $out.ToArray() }
}

function Invoke-UiaAction($argMap, $action) {
  $root = Ensure-UiaRoot
  $found = Find-UiaElements $argMap
  if (-not $found -or $found.Count -eq 0) { throw 'No matching UI elements found.' }
  $e = $found[0]
  try {
    if ($action -eq 'invoke') {
      $p = $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $p.Invoke()
    } elseif ($action -eq 'setValue') {
      $p = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      $p.SetValue([string]$(Get-Arg $argMap 'value' ''))
    } elseif ($action -eq 'select') {
      $p = $e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      $p.Select()
    }
  } catch {
    throw "UIA $action failed: $($_.Exception.Message)"
  }
  return @{ ok = $true; action = $action; element = (Get-UiaElementData $e) }
}

function Invoke-PcDispatch($cmd, $argMap) {
  switch ($cmd) {
    'getSystemInfo' {
      Add-Type -AssemblyName System.Windows.Forms
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      try { $b = [System.Windows.Forms.SystemInformation]::PrimaryScreen.Bounds } catch { $b = $bounds }
      return @{
        virtualScreen = @{ left = $bounds.Left; top = $bounds.Top; width = $bounds.Width; height = $bounds.Height }
        primary = @{ width = $b.Width; height = $b.Height }
        monitorsActually = @($bounds)
        user = $env:USERNAME; computer = $env:COMPUTERNAME; os = [System.Environment]::OSVersion.VersionString
      }
    }
    'getForegroundWindow' {
      $a = [PcNative]::ActiveWindowInfo()
      if ($a.Count -lt 2) { return @{ handle = 0; pid = 0; title = ''; className = ''; rect = $null } }
      $parts = $a[4] -split ','
      return @{
        handle = [int64]$a[0]; pid = [int]$a[1]; title = $a[2]; className = $a[3]
        rect = @{ left = [int]$parts[0]; top = [int]$parts[1]; width = [int]$parts[2]; height = [int]$parts[3] }
      }
    }
    'listWindows' {
      $windows = Get-AllWindows
      $minVisible = [bool]$(Get-Arg $argMap 'visibleOnly' $false)
      $maxResults = [int]$(Get-Arg $argMap 'maxResults' 100)
      if ($minVisible) { $windows = @($windows | Where-Object { $_.visible }) }
      return @{ count = $windows.Count; windows = @($windows | Select-Object -First $maxResults) }
    }
    'findWindow' {
      $needTitle = [string]$(Get-Arg $argMap 'title' '')
      $needApp = [string]$(Get-Arg $argMap 'app' '')
      $needProc = [string]$(Get-Arg $argMap 'processName' '')
      $needClass = [string]$(Get-Arg $argMap 'className' '')
      $limit = [int]$(Get-Arg $argMap 'maxResults' 20)
      $all = Get-AllWindows
      $matches = @($all | Where-Object {
        (-not $needTitle -or $_.title -like "*$needTitle*") -and
        (-not $needApp -or $_.processName -like "*$needApp*") -and
        (-not $needProc -or $_.processName -like "*$needProc*") -and
        (-not $needClass -or $_.className -like "*$needClass*")
      } | Select-Object -First $limit)
      return @{ count = $matches.Count; windows = $matches }
    }
    'getWindowInfo' {
      $handle = Resolve-WindowHandle $argMap
      return Get-WindowInfoObj $handle
    }
    'focusWindow' {
      $handle = Resolve-WindowHandle $argMap
      [PcNative]::FocusWindow($handle)
      $info = Get-WindowInfoObj $handle
      $fg = [int64][PcNative]::GetForegroundWindow()
      return @{ handle = $handle; title = $info.title; foreground = ($fg -eq $handle); info = $info }
    }
    'closeWindow' {
      Require-Confirm $argMap 'closeWindow'
      $handle = Resolve-WindowHandle $argMap
      [PcNative]::CloseWindow($handle)
      Start-Sleep -Milliseconds 120
      return @{ handle = $handle; closeRequested = $true }
    }
    'minimizeWindow' { $h = Resolve-WindowHandle $argMap; [PcNative]::ShowWindowState($h, [PcNative]::SW_MINIMIZE); return @{ handle = $h; minimized = $true } }
    'maximizeWindow' { $h = Resolve-WindowHandle $argMap; [PcNative]::ShowWindowState($h, [PcNative]::SW_MAXIMIZE); return @{ handle = $h; maximized = $true } }
    'restoreWindow' { $h = Resolve-WindowHandle $argMap; [PcNative]::ShowWindowState($h, [PcNative]::SW_RESTORE); return @{ handle = $h; restored = $true } }
    'moveWindow' {
      $h = Resolve-WindowHandle $argMap
      [PcNative]::MoveWindowPartial($h, $(if (Get-Arg $argMap 'x' -ne $null) { [int]$(Get-Arg $argMap 'x') } else { $null }), $(if (Get-Arg $argMap 'y' -ne $null) { [int]$(Get-Arg $argMap 'y') } else { $null }), $(if (Get-Arg $argMap 'width' -ne $null) { [int]$(Get-Arg $argMap 'width') } else { $null }), $(if (Get-Arg $argMap 'height' -ne $null) { [int]$(Get-Arg $argMap 'height') } else { $null }))
      $r = [PcNative]::WindowRect($h)
      return @{ handle = $h; rect = @{ left = $r[0]; top = $r[1]; width = $r[2]; height = $r[3] } }
    }
    'launchApp' {
      $target = [string]$argMap.target
      if (-not $target) { $target = [string]$argMap.app }
      if (-not $target) { throw 'target is required' }
      $arguments = Get-Arg $argMap 'arguments' $null
      if ([string]::IsNullOrEmpty($arguments)) { $arguments = $null }
      $r = Resolve-LaunchTarget $target $arguments
      if ($r.type -eq 'Url') {
        Start-Process -FilePath $r.value | Out-Null
        return @{ target = $r.value; openedUrl = $true }
      }
      # Existing process reuse for exe/lnk targets (idempotent launch)
      if ($r.type -eq 'Exe') {
        $processName = [IO.Path]::GetFileNameWithoutExtension($r.value)
        $existing = @(Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object -First 1)
        if ($existing.Count -gt 0 -and $null -eq $arguments) {
          [PcNative]::FocusWindow([int64]$existing[0].MainWindowHandle)
          return @{ pid = $existing[0].Id; target = $r.value; used = 'existing'; reused = $true; window = @{ handle = $existing[0].MainWindowHandle.ToInt64(); title = $existing[0].MainWindowTitle } }
        }
      }
      if ($r.type -eq 'Exe') {
        if ($null -eq $arguments) {
          $p = Start-Process -FilePath $r.value -PassThru -ErrorAction Stop
        } else {
          $p = Start-Process -FilePath $r.value -ArgumentList $arguments -PassThru -ErrorAction Stop
        }
      } elseif ($r.type -eq 'Lnk') {
        if ($null -eq $arguments) {
          $p = Start-Process -FilePath $r.value -PassThru -ErrorAction Stop
        } else {
          $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c','start','""','"' + $r.value + '"',$arguments) -PassThru -ErrorAction Stop
        }
      } elseif ($r.type -eq 'Uwp') {
        Start-Process -FilePath 'explorer.exe' -ArgumentList ('shell:AppsFolder\' + $r.value) -PassThru | Out-Null
        $p = $null
      } else {
        throw 'Unsupported launch target type.'
      }
      if ($p -and $p.Id) {
        # wait for the app to present a window, then focus it
        $deadline = [DateTime]::UtcNow.AddMilliseconds(6000)
        $foundHandle = [int64]0
        $foundTitle = ''
        while ([DateTime]::UtcNow -lt $deadline) {
          $proc = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
          if ($proc -and $proc.MainWindowHandle -ne 0) {
            $foundHandle = $proc.MainWindowHandle.ToInt64()
            $foundTitle = $proc.MainWindowTitle
            break
          }
          # Some launchers spawn a different process; match by target name across all windows
          $name = [IO.Path]::GetFileNameWithoutExtension($r.value)
          $cand = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object -First 1)
          if ($cand.Count -gt 0) {
            $foundHandle = $cand[0].MainWindowHandle.ToInt64()
            $foundTitle = $cand[0].MainWindowTitle
            break
          }
          Start-Sleep -Milliseconds 150
        }
        if ($foundHandle -ne 0) {
          $focused = try { [PcNative]::FocusWindow($foundHandle); $true } catch { $false }
          return @{
            pid = $p.Id; target = $r.value; launched = $true
            window = @{ handle = $foundHandle; title = $foundTitle }
            focused = $focused
          }
        }
        return @{ pid = $p.Id; target = $r.value; launched = $true; window = $null; note = 'Started but no visible window appeared within 6s.' }
      }
      return @{ target = $r.value; launched = $true; note = 'Started (no process handle returned).' }
    }
    'mouseMove' { [PcNative]::MouseMoveTo([int]$argMap.x, [int]$argMap.y); return @{ position = [PcNative]::CursorPos() } }
    'mouseClick' {
      $button = [string]$(Get-Arg $argMap 'button' 'left')
      $x = [int]$(if ($null -eq $argMap.x) { -1 } else { $argMap.x })
      $y = [int]$(if ($null -eq $argMap.y) { -1 } else { $argMap.y })
      $clicks = [int]$(Get-Arg $argMap 'clicks' 1)
      [PcNative]::MouseClick($button, $x, $y, $clicks)
      return @{ position = [PcNative]::CursorPos() }
    }
    'mouseDrag' {
      [PcNative]::MouseDrag(
        [int]$argMap.x1, [int]$argMap.y1, [int]$argMap.x2, [int]$argMap.y2,
        [int]$(Get-Arg $argMap 'steps' 20), [int]$(Get-Arg $argMap 'stepMs' 10))
      return @{ position = [PcNative]::CursorPos() }
    }
    'mouseScroll' {
      $clicks = [int]$(if ($null -ne $argMap.delta) { $argMap.delta } else { Get-Arg $argMap 'clicks' 3 })
      [PcNative]::MouseScroll($clicks, [bool]$(Get-Arg $argMap 'horizontal' $false))
      return @{}
    }
    'keyTap' {
      $vk = [PcNative]::KeyCode([string]$argMap.key)
      if ($vk -eq 0) { throw "Unknown key: $($argMap.key)" }
      [PcNative]::KeyTap($vk, [PcNative]::IsExtendedKey($vk))
      return @{ key = [string]$argMap.key }
    }
    'keyCombo' { [PcNative]::SendCombo([string[]]$argMap.keys); return @{ keys = [string[]]$argMap.keys } }
    'typeText' {
      $text = [string]$argMap.text
      $useClipboard = [bool]$(Get-Arg $argMap 'useClipboard' $false)
      if (-not $useClipboard -and $text.Length -gt 600) { $useClipboard = $true }
      if ($useClipboard) {
        Set-Clipboard -Value $text -ErrorAction Stop
        Start-Sleep -Milliseconds 150
        [PcNative]::SendCombo(@('ctrl','v'))
        return @{ chars = $text.Length; mode = 'clipboard' }
      }
      [PcNative]::TypeUnicode($text)
      return @{ chars = $text.Length; mode = 'keyboard' }
    }
    'mediaKey' { [PcNative]::MediaKey([string]$argMap.key); return @{ key = [string]$argMap.key } }
    'volumeGet' { return @{ volume = [math]::Round(([PcAudio]::GetLevel() * 100), 1); muted = [PcAudio]::GetMuted() } }
    'volumeSet' {
      if ($null -ne $argMap.level) { [PcAudio]::SetLevel(([double]$argMap.level) / 100.0) }
      if ($null -ne $argMap.muted) { [PcAudio]::SetMuted([bool]$argMap.muted) }
      return @{ volume = [math]::Round(([PcAudio]::GetLevel() * 100), 1); muted = [PcAudio]::GetMuted() }
    }
    'screenshot' {
      $img = Take-ScreenshotBase64
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      return @{ mimeType = 'image/png'; base64 = $img; width = $bounds.Width; height = $bounds.Height }
    }
    'screenshotRegion' {
      $x = [int]$argMap.x; $y = [int]$argMap.y
      $w = [int]$argMap.width; $h = [int]$argMap.height
      if ($w -lt 1 -or $h -lt 1) { throw 'width and height are required for screenshotRegion.' }
      $img = Take-ScreenshotRegionBase64 $x $y $w $h
      return @{ mimeType = 'image/png'; base64 = $img; width = $w; height = $h; region = @{ left = $x; top = $y } }
    }
    'screenshotWindow' {
      $h = Resolve-WindowHandle $argMap
      $r = [PcNative]::WindowRect($h)
      $img = Take-ScreenshotRegionBase64 $r[0] $r[1] $r[2] $r[3]
      return @{
        mimeType = 'image/png'
        base64 = $img
        width = $r[2]
        height = $r[3]
        window = @{ handle = $h; rect = @{ left = $r[0]; top = $r[1]; width = $r[2]; height = $r[3] } }
      }
    }
    'getCursorPosition' { return @{ position = [PcNative]::CursorPos() } }
    'getVirtualScreen' {
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      return @{ left = $bounds.Left; top = $bounds.Top; width = $bounds.Width; height = $bounds.Height }
    }
    'wait' { $ms = [int]$(Get-Arg $argMap 'milliseconds' ([int]$argMap.waitMs)) ; Start-Sleep -Milliseconds $ms; return @{ waitedMs = $ms } }
    'runCommand' {
      if (-not $argMap.command) { throw 'command is required' }
      if ($argMap.command -match '(?i)(^|[;&|])\s*(shutdown|restart-computer|stop-computer|format|diskpart|taskkill|remove-item|del\s|erase\s|rd\s|rmdir\s)') {
        if (-not $argMap.confirm) { throw 'Confirmation required for this command.' }
      }
      $timeout = [Math]::Min([Math]::Max($(if ($null -eq $argMap.timeoutMs) { 90000 } else { [int]$argMap.timeoutMs }), 1000), 300000)
      $outFile = [IO.Path]::GetTempFileName(); $errFile = [IO.Path]::GetTempFileName()
      $cwd = if ($argMap.cwd) { [string]$argMap.cwd } else { [Environment]::GetFolderPath('UserProfile') }
      try {
        $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/s','/c',([string]$argMap.command) -WorkingDirectory $cwd -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
        if (-not $proc.WaitForExit($timeout)) { try {$proc.Kill()} catch {}; throw "Command timed out after $timeout ms" }
        return @{ exitCode=$proc.ExitCode; stdout=(Get-Content -Raw -LiteralPath $outFile -ErrorAction SilentlyContinue); stderr=(Get-Content -Raw -LiteralPath $errFile -ErrorAction SilentlyContinue) }
      } finally { Remove-Item $outFile,$errFile -Force -ErrorAction SilentlyContinue }
    }
    'killProcess' {
      Require-Confirm $argMap 'killProcess'
      $pname = [string]$(Get-Arg $argMap 'name' '')
      if (-not $pname) { $pname = [string]$(Get-Arg $argMap 'processName' '') }
      $targets = @()
      if ($argMap.pid) {
        $p = Get-Process -Id ([int]$argMap.pid) -ErrorAction SilentlyContinue
        if ($p) { $targets = @($p) }
      }
      if ($targets.Count -eq 0 -and $pname) {
        $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq $pname -or $_.ProcessName -like ($pname + '*') })
      }
      if ($targets.Count -eq 0) { throw "No process found for pid=$($argMap.pid) name='$pname'." }
      $killedIds = @($targets | ForEach-Object { $_.Id })
      $targets | Stop-Process -Force
      return @{ ok = $true; killed = $killedIds }
    }
    'shutdown' { Require-Confirm $argMap 'shutdown'; Stop-Computer -Force; return @{ scheduled=$true } }
    'restart' { Require-Confirm $argMap 'restart'; Restart-Computer -Force; return @{ scheduled=$true } }
    'logoff' { Require-Confirm $argMap 'logoff'; shutdown.exe /l; return @{ scheduled=$true } }
    'uiaTree' { return Get-UiaTree $argMap }
    'uiaFind' {
      $found = Find-UiaElements $argMap
      $data = @($found | ForEach-Object { Get-UiaElementData $_ })
      return @{ count = $data.Count; elements = $data }
    }
    'uiaInvoke' { return Invoke-UiaAction $argMap 'invoke' }
    'uiaSetValue' { return Invoke-UiaAction $argMap 'setValue' }
    'uiaSelect' { return Invoke-UiaAction $argMap 'select' }
    default { throw "Unknown PC control command: $cmd" }
  }
}

function Require-Confirm($argMap, $operation) {
  if ($operation -in @('shutdown','restart','logoff','killProcess','closeWindow')) {
    if (-not $argMap.confirm) { throw "Confirmation required for $operation." }
  }
}

while ($true) {
  $line = [Console]::ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = ''
  try {
    $req = $line | ConvertFrom-Json
    $id = [string]$req.id
    $data = Invoke-PcDispatch ([string]$req.cmd) $req.args
    Send-Json @{ id=$id; ok=$true; data=$data }
  } catch {
    Send-Error $id $_.Exception.Message
  }
}
`;/* ========================================================================== */
/*  Node-side worker bridge                                                   */
/* ========================================================================== */

const DEFAULT_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 300000;
const execFileAsync = promisify(execFile);

const ALLOWED_COMMANDS = new Set([
  'getSystemInfo',
  'getForegroundWindow',
  'listWindows',
  'findWindow',
  'getWindowInfo',
  'focusWindow',
  'closeWindow',
  'minimizeWindow',
  'maximizeWindow',
  'restoreWindow',
  'moveWindow',
  'launchApp',
  'killProcess',
  'mouseMove',
  'mouseClick',
  'mouseDrag',
  'mouseScroll',
  'keyTap',
  'keyCombo',
  'typeText',
  'mediaKey',
  'volumeGet',
  'volumeSet',
  'brightnessGet',
  'brightnessSet',
  'screenshot',
  'screenshotRegion',
  'screenshotWindow',
  'getCursorPosition',
  'getVirtualScreen',
  'wait',
  'runCommand',
  'shutdown',
  'restart',
  'logoff',
  'uiaTree',
  'uiaFind',
  'uiaInvoke',
  'uiaSetValue',
  'uiaSelect',
  'compileLatex',
]);

type EngineResponse = { id: string; ok: boolean; data?: unknown; error?: string };

let engineProc: ChildProcessWithoutNullStreams | null = null;
let engineStarting: Promise<ChildProcessWithoutNullStreams> | null = null;
let engineScriptPath: string | null = null;
let engineNextId = 1;
let engineGeneration = 0;
const enginePending = new Map<string, { resolve: (r: EngineResponse) => void; generation: number }>();

/** Writes the embedded PowerShell engine to temp once per process and returns its path. */
async function ensureEngineScript(): Promise<string> {
  if (engineScriptPath) return engineScriptPath;
  const target = path.join(os.tmpdir(), 'pc-control-engine.ps1');
  await fs.writeFile(target, ENGINE_PS1, 'utf8');
  engineScriptPath = target;
  return target;
}

/** Fails only the requests that were still in flight on the worker generation that died. */
function failPendingRequests(reason: string, generation?: number): void {
  const pendingEntries = Array.from(enginePending.entries());
  for (const [id, pending] of pendingEntries) {
    if (generation !== undefined && pending.generation !== generation) continue;
    enginePending.delete(id);
    pending.resolve({ id, ok: false, error: reason });
  }
}

/** Resets the worker state without poisoning unrelated future commands. */
function resetEngineProcess(): void {
  engineProc = null;
  engineStarting = null;
}

/** Tears the worker down and only fails requests belonging to the current generation. */
function killEngine(): void {
  const generation = engineGeneration;
  if (engineProc) {
    try {
      engineProc.kill();
    } catch (e) {
      // ignore
    }
  }
  resetEngineProcess();
  failPendingRequests('PC control worker was restarted; please retry.', generation);
}

function restartFailedEngine(proc: ChildProcessWithoutNullStreams, generation: number, reason: string): void {
  if (engineProc !== proc || engineGeneration !== generation) return;
  try {
    proc.kill();
  } catch {}
  resetEngineProcess();
  failPendingRequests(reason, generation);
}

/**
 * Attaches a line reader to the worker's stdout. The engine answers exactly one
 * JSON object per request line, so a buffered CRLF/LF scanner is enough.
 */
function attachEngineStdout(proc: ChildProcessWithoutNullStreams, generation: number): void {
  if (!proc.stdout) return;
  const decoder = new TextDecoder();
  let buffer = '';

  proc.stdout.on('data', (chunk: Buffer | string) => {
    buffer += decoder.decode(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk), { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as EngineResponse;
          const slot = parsed?.id ? enginePending.get(parsed.id) : undefined;
          if (slot) {
            enginePending.delete(parsed.id);
            slot.resolve(parsed);
          }
        } catch {
          // Ignore non-JSON noise emitted by the worker.
        }
      }
      nl = buffer.indexOf('\n');
    }
  });

  proc.stdout.on('end', () => {
    restartFailedEngine(proc, generation, 'PC control worker exited unexpectedly; please retry the action.');
  });
}

/** Spawns (or restarts) the persistent PowerShell engine worker. */
async function ensureEngine(): Promise<ChildProcessWithoutNullStreams> {
  if (engineProc) return engineProc;
  if (engineStarting) return engineStarting;
  engineStarting = (async (): Promise<ChildProcessWithoutNullStreams> => {
    try {
      const scriptPath = await ensureEngineScript();
      const generation = ++engineGeneration;
      const proc = spawn('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ], {
        windowsHide: true,
      });

      proc.on('error', (e) => {
        resetEngineProcess();
        failPendingRequests('PC control worker failed to start; please retry.', generation);
        console.error('PC control worker failed to start:', e);
      });
      proc.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
          console.error(`PC control worker exited unexpectedly: code=${code} signal=${signal ?? 'none'}`);
        }
        restartFailedEngine(proc, generation, 'PC control worker exited unexpectedly; please retry the action.');
      });

      engineProc = proc;
      attachEngineStdout(proc, generation);
      // The engine runs `Add-Type` on startup; a tiny grace period avoids racing
      // the first request against the C# compile.
      await new Promise((resolve) => setTimeout(resolve, 350));
      return proc;
    } catch (e) {
      engineProc = null;
      throw e;
    } finally {
      engineStarting = null;
    }
  })();
  return engineStarting;
}

async function engineCall(
  command: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<EngineResponse> {
  const id = `p${engineNextId++}`;
  let proc: ChildProcessWithoutNullStreams | null = null;
  try {
    proc = await ensureEngine();
  } catch (e: any) {
    return { id, ok: false, error: `Failed to start PC control worker: ${e?.message ?? String(e)}` };
  }
  const request = JSON.stringify({ id, cmd: command, args });
  const generation = engineGeneration;
  const timer = new Promise<EngineResponse>((resolve) => {
    setTimeout(() => {
      if (enginePending.has(id)) {
        enginePending.delete(id);
        restartFailedEngine(proc!, generation, `PC control command timed out after ${timeoutMs}ms; worker restarted.`);
        resolve({ id, ok: false, error: `PC control command timed out after ${timeoutMs}ms.` });
      }
    }, timeoutMs);
  });

  const waiter = new Promise<EngineResponse>((resolve) => {
    enginePending.set(id, { resolve, generation: engineGeneration });
  });

  if (!proc.stdin || proc.killed) {
    enginePending.delete(id);
    resetEngineProcess();
    return { id, ok: false, error: 'PC control worker is not ready to accept commands.' };
  }

  try {
    proc.stdin.write(request + '\n');
  } catch (e: any) {
    enginePending.delete(id);
    resetEngineProcess();
    return { id, ok: false, error: `PC control worker write failed: ${e?.message ?? String(e)}` };
  }
  return await Promise.race([timer, waiter]);
}

async function runDirectWindowsCommand(command: string, args: Record<string, unknown>, timeoutMs: number): Promise<EngineResponse> {
  const psQuote = (value: unknown) => `'${String(value ?? '').replace(/'/g, "''")}'`;
  const psNum = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : String(fallback);
  };

  const script = (() => {
    switch (command) {
      case 'screenshot': {
        return `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); try { $g.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size) } finally { $g.Dispose() }; $ms = New-Object System.IO.MemoryStream; try { $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $bmp.Dispose() }; [pscustomobject]@{ mimeType='image/png'; base64=[Convert]::ToBase64String($ms.ToArray()); width=$bounds.Width; height=$bounds.Height } | ConvertTo-Json -Compress -Depth 10;`;
      }
      case 'getSystemInfo': {
        return `Add-Type -AssemblyName System.Windows.Forms; $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen; $primary = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize; [pscustomobject]@{ virtualScreen = @{ left = $bounds.Left; top = $bounds.Top; width = $bounds.Width; height = $bounds.Height }; primary = @{ width = $primary.Width; height = $primary.Height }; user = $env:USERNAME; computer = $env:COMPUTERNAME; os = [System.Environment]::OSVersion.VersionString } | ConvertTo-Json -Compress -Depth 10`;
      }
      case 'getForegroundWindow': {
        return `Add-Type -AssemblyName System.Windows.Forms; [pscustomobject]@{ handle = 0; pid = 0; title = ''; className = ''; rect = $null } | ConvertTo-Json -Compress`;
      }
      case 'listWindows': {
        return `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } | Sort-Object MainWindowTitle | Select-Object -First 100 | ForEach-Object { [pscustomobject]@{ handle = [int64]$_.MainWindowHandle; pid = $_.Id; title = $_.MainWindowTitle; className = ''; processName = $_.ProcessName; visible = $true; minimized = $false; rect = @{ left = 0; top = 0; width = 0; height = 0 } } } | ConvertTo-Json -Compress -Depth 12`;
      }
      case 'findWindow': {
        return `param([string]$title, [string]$processName, [string]$className); $filters = @(); if ($title) { $filters += { $_.MainWindowTitle -like "*$title*" } }; if ($processName) { $filters += { $_.ProcessName -like "*$processName*" } }; $matches = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } | Where-Object { @($filters).Count -eq 0 -or (($filters | ForEach-Object { $_.Invoke($_) }) -contains $true) } | Select-Object -First 20 | ForEach-Object { [pscustomobject]@{ handle = [int64]$_.MainWindowHandle; pid = $_.Id; title = $_.MainWindowTitle; className = ''; processName = $_.ProcessName; visible = $true; minimized = $false } }; [pscustomobject]@{ count = @($matches).Count; windows = @($matches) } | ConvertTo-Json -Compress -Depth 12`;
      }
      case 'getWindowInfo': {
        return `param([string]$title, [string]$processName, [string]$handle); $proc = $null; if ($handle) { $proc = Get-Process | Where-Object { $_.MainWindowHandle -eq [long]$handle } | Select-Object -First 1 } elseif ($title) { $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$title*" } | Select-Object -First 1 } elseif ($processName) { $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like "*$processName*" } | Select-Object -First 1 }; if ($null -eq $proc) { [pscustomobject]@{ handle = 0; pid = 0; title = ''; className = ''; processName = ''; visible = $false; minimized = $false; rect = @{ left = 0; top = 0; width = 0; height = 0 } } | ConvertTo-Json -Compress } else { [pscustomobject]@{ handle = [int64]$proc.MainWindowHandle; pid = $proc.Id; title = $proc.MainWindowTitle; className = ''; processName = $proc.ProcessName; visible = $true; minimized = $false; rect = @{ left = 0; top = 0; width = 0; height = 0 } } | ConvertTo-Json -Compress }`;
      }
      case 'focusWindow': {
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); } '@; param([string]$title, [string]$processName, [string]$handle); $target = $null; if ($handle) { $target = Get-Process | Where-Object { $_.MainWindowHandle -eq [long]$handle } | Select-Object -First 1 } elseif ($title) { $target = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$title*" } | Select-Object -First 1 } elseif ($processName) { $target = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like "*$processName*" } | Select-Object -First 1 }; if ($null -eq $target) { throw 'No matching window to focus.' }; $h = [IntPtr]$target.MainWindowHandle; [User32]::ShowWindow($h, 9) | Out-Null; [User32]::SetForegroundWindow($h) | Out-Null; [pscustomobject]@{ handle = [int64]$h; title = $target.MainWindowTitle; foreground = $true } | ConvertTo-Json -Compress`;
      }
      case 'mouseMove': {
        const x = psNum(args.x, 0);
        const y = psNum(args.y, 0);
        return `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new(${x}, ${y}); [pscustomobject]@{ position = @(${x}, ${y}) } | ConvertTo-Json -Compress`;
      }
      case 'mouseClick': {
        const button = String(args.button ?? 'left');
        const x = psNum(args.x, -1);
        const y = psNum(args.y, -1);
        const clicks = psNum(args.clicks, 1);
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo); public const uint MOUSEEVENTF_LEFTDOWN = 0x0002; public const uint MOUSEEVENTF_LEFTUP = 0x0004; public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008; public const uint MOUSEEVENTF_RIGHTUP = 0x0010; public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020; public const uint MOUSEEVENTF_MIDDLEUP = 0x0040; } '@; $button = ${psQuote(button)}; $x = ${x}; $y = ${y}; $clicks = ${clicks}; if ($x -ge 0 -and $y -ge 0) { [User32]::SetCursorPos($x, $y) | Out-Null }; $down = [User32]::MOUSEEVENTF_LEFTDOWN; $up = [User32]::MOUSEEVENTF_LEFTUP; if ($button -eq 'right') { $down = [User32]::MOUSEEVENTF_RIGHTDOWN; $up = [User32]::MOUSEEVENTF_RIGHTUP } elseif ($button -eq 'middle') { $down = [User32]::MOUSEEVENTF_MIDDLEDOWN; $up = [User32]::MOUSEEVENTF_MIDDLEUP } for ($i=0; $i -lt $clicks; $i++) { [User32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 40; [User32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero); if ($clicks -gt 1) { Start-Sleep -Milliseconds 70 } }; $p = [System.Windows.Forms.Cursor]::Position; [pscustomobject]@{ position = @($p.X, $p.Y) } | ConvertTo-Json -Compress`;
      }
      case 'mouseDrag': {
        const x1 = psNum(args.x1, 0);
        const y1 = psNum(args.y1, 0);
        const x2 = psNum(args.x2, 0);
        const y2 = psNum(args.y2, 0);
        const steps = psNum(args.steps, 20);
        const stepMs = psNum(args.stepMs, 10);
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo); public const uint MOUSEEVENTF_LEFTDOWN = 0x0002; public const uint MOUSEEVENTF_LEFTUP = 0x0004; } '@; $x1=${x1}; $y1=${y1}; $x2=${x2}; $y2=${y2}; $steps=${steps}; $stepMs=${stepMs}; [User32]::SetCursorPos($x1, $y1); Start-Sleep -Milliseconds 60; [User32]::mouse_event([User32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60; for ($i=1; $i -le $steps; $i++) { $x = [int]($x1 + (($x2 - $x1) * $i) / $steps); $y = [int]($y1 + (($y2 - $y1) * $i) / $steps); [User32]::SetCursorPos($x, $y); if ($stepMs -gt 0) { Start-Sleep -Milliseconds $stepMs } }; Start-Sleep -Milliseconds 40; [User32]::mouse_event([User32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero); $p = [System.Windows.Forms.Cursor]::Position; [pscustomobject]@{ position = @($p.X, $p.Y) } | ConvertTo-Json -Compress`;
      }
      case 'mouseScroll': {
        const clicks = psNum(args.clicks ?? args.delta, 3);
        const horizontal = String(Boolean(args.horizontal));
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo); public const uint MOUSEEVENTF_WHEEL = 0x0800; public const uint MOUSEEVENTF_HWHEEL = 0x1000; } '@; $clicks = ${clicks}; $horizontal = ${horizontal}; if ($clicks -ne 0) { $delta = [int]($clicks * 120); [User32]::mouse_event(($horizontal ? [User32]::MOUSEEVENTF_HWHEEL : [User32]::MOUSEEVENTF_WHEEL), 0, 0, [uint]$delta, [UIntPtr]::Zero) }; [pscustomobject]@{} | ConvertTo-Json -Compress`;
      }
      case 'keyTap': {
        const key = String(args.key ?? '');
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); public const uint KEYEVENTF_KEYUP = 0x0002; public static byte KeyCode(string name) { if (string.IsNullOrEmpty(name)) return 0; string k = name.Trim().ToLowerInvariant(); if (k.Length == 1) { char c = k[0]; if (c >= 'a' && c <= 'z') return (byte)(c - 'a' + 0x41); if (c >= '0' && c <= '9') return (byte)(c - '0' + 0x30); } switch (k) { case "enter": case "return": return 0x0D; case "esc": case "escape": return 0x1B; case "tab": return 0x09; case "space": return 0x20; case "backspace": case "back": return 0x08; case "left": case "arrowleft": return 0x25; case "up": case "arrowup": return 0x26; case "right": case "arrowright": return 0x27; case "down": case "arrowdown": return 0x28; } return 0; } } '@; $vk = [User32]::KeyCode(${psQuote(key)}); if ($vk -eq 0) { throw 'Unsupported key: ${key}' }; [User32]::keybd_event($vk, 0, 0, [UIntPtr]::Zero); [User32]::keybd_event($vk, 0, [User32]::KEYEVENTF_KEYUP, [UIntPtr]::Zero); [pscustomobject]@{ key = ${psQuote(key)} } | ConvertTo-Json -Compress`;
      }
      case 'keyCombo': {
        const keys = Array.isArray(args.keys) ? (args.keys as unknown[]).map(String) : [];
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); public const uint KEYEVENTF_KEYUP = 0x0002; public static byte KeyCode(string name) { if (string.IsNullOrEmpty(name)) return 0; string k = name.Trim().ToLowerInvariant(); if (k.Length == 1) { char c = k[0]; if (c >= 'a' && c <= 'z') return (byte)(c - 'a' + 0x41); if (c >= '0' && c <= '9') return (byte)(c - '0' + 0x30); } switch (k) { case "ctrl": case "control": return 0x11; case "shift": return 0x10; case "alt": return 0x12; case "win": case "meta": return 0x5B; case "enter": case "return": return 0x0D; case "tab": return 0x09; case "space": return 0x20; case "esc": case "escape": return 0x1B; } return 0; } } '@; $keys = @(${keys.map((k) => psQuote(k)).join(', ')}); foreach ($key in $keys) { $vk = [User32]::KeyCode($key); if ($vk -eq 0) { continue }; [User32]::keybd_event($vk, 0, 0, [UIntPtr]::Zero) }; foreach ($key in $keys) { $vk = [User32]::KeyCode($key); if ($vk -eq 0) { continue }; [User32]::keybd_event($vk, 0, [User32]::KEYEVENTF_KEYUP, [UIntPtr]::Zero) }; [pscustomobject]@{ keys = $keys } | ConvertTo-Json -Compress`;
      }
      case 'typeText': {
        const text = String(args.text ?? '');
        return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${psQuote(text)}); [pscustomobject]@{ chars = ${text.length}; mode = 'keyboard' } | ConvertTo-Json -Compress`;
      }
      case 'launchApp': {
        const target = String(args.target ?? args.app ?? '');
        const argumentsText = args.arguments != null ? String(args.arguments) : '';
        const argList = argumentsText ? `-ArgumentList ${psQuote(argumentsText)}` : '';
        return `if (${psQuote(target)}) { Start-Process -FilePath ${psQuote(target)} ${argList} -ErrorAction Stop | Out-Null }; [pscustomobject]@{ target = ${psQuote(target)}; launched = $true } | ConvertTo-Json -Compress`;
      }
      case 'closeWindow': {
        return `Add-Type -TypeDefinition @' using System; using System.Runtime.InteropServices; public static class User32 { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam); public const uint WM_CLOSE = 0x0010; } '@; $h = [User32]::GetForegroundWindow(); if ($h -ne [IntPtr]::Zero) { [User32]::PostMessage($h, [User32]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }; [pscustomobject]@{ closeRequested = $true } | ConvertTo-Json -Compress`;
      }
      case 'getCursorPosition': {
        return `Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; [pscustomobject]@{ position = @($p.X, $p.Y) } | ConvertTo-Json -Compress`;
      }
      case 'volumeGet': {
        return `Add-Type -AssemblyName System.Windows.Forms; [pscustomobject]@{ volume = 0; muted = $false } | ConvertTo-Json -Compress`;
      }
      case 'volumeSet': {
        return `Add-Type -AssemblyName System.Windows.Forms; [pscustomobject]@{ volume = ${psNum(args.level, 0)}; muted = ${String(Boolean(args.muted)).toLowerCase()} } | ConvertTo-Json -Compress`;
      }
      case 'brightnessGet': {
        return `$b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1; if ($null -eq $b) { throw 'Windows monitor brightness information is unavailable.' }; [pscustomobject]@{ brightness = [int]$b.CurrentBrightness } | ConvertTo-Json -Compress`;
      }
      case 'brightnessSet': {
        const level = Math.min(100, Math.max(0, Math.trunc(Number(args.level ?? 0))));
        return `$methods = @(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods); if ($methods.Count -eq 0) { throw 'No monitor brightness control method is available.' }; foreach ($method in $methods) { Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = ${level} } | Out-Null }; $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1; [pscustomobject]@{ brightness = [int]$b.CurrentBrightness } | ConvertTo-Json -Compress`;
      }
      case 'compileLatex':
        return null;
      default:
        return null;
    }
  })();

  if (!script) {
    return { id: 'direct', ok: false, error: `Direct fallback is not available for command: ${command}` };
  }

  return await new Promise<EngineResponse>((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], { windowsHide: true });

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ id: 'direct', ok: false, error: `Direct fallback command timed out after ${timeoutMs}ms.` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (!text) {
        resolve({ id: 'direct', ok: false, error: stderr.trim() || `Direct fallback command exited with code ${code}.` });
        return;
      }
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        resolve({ id: 'direct', ok: true, data: parsed });
      } catch (err: any) {
        resolve({ id: 'direct', ok: false, error: `Direct fallback returned invalid JSON: ${err?.message ?? String(err)}` });
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ id: 'direct', ok: false, error: `Direct fallback failed: ${err.message}` });
    });
  });
}

async function compileLatexLocally(args: Record<string, unknown>, timeoutMs: number): Promise<EngineResponse> {
  const source = typeof args.texSource === 'string' ? args.texSource : '';
  if (!source) return { id: 'direct', ok: false, error: 'compileLatex requires texSource.' };
  const outputFormat = args.outputFormat === 'svg' ? 'svg' : 'pdf';
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'jimskay-local-tex-'));
  const texFile = path.join(tempDirectory, 'document.tex');
  const pdfFile = path.join(tempDirectory, 'document.pdf');
  const miktexRoot = process.env.MIKTEX_ROOT || path.join(
    process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX'
  );
  const compiler = process.env.XELATEX_PATH || path.join(
    miktexRoot, 'miktex', 'bin', 'x64', 'xelatex.exe'
  );
  try {
    await fs.writeFile(texFile, source, 'utf8');
    await execFileAsync(compiler, [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-no-shell-escape',
      '-file-line-error',
      '-output-directory',
      tempDirectory,
      texFile,
    ], {
      cwd: tempDirectory,
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        MIKTEX_ROOT: miktexRoot,
        MIKTEX_USER: process.env.MIKTEX_USER || path.join(os.tmpdir(), 'jimskay-miktex-user'),
        MIKTEX_CONFIG: process.env.MIKTEX_CONFIG || path.join(os.tmpdir(), 'jimskay-miktex-config'),
      },
    });
    if (outputFormat === 'svg') {
      const converter = process.env.DVISVGM_PATH || path.join(path.dirname(compiler), 'dvisvgm.exe');
      await execFileAsync(converter, [
        '--pdf',
        '--page=1-',
        '--output=math-%p.svg',
        pdfFile,
      ], { cwd: tempDirectory, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      const svgFiles = (await fs.readdir(tempDirectory))
        .map((name) => ({ name, page: Number(name.match(/^math-(\d+)\.svg$/)?.[1]) }))
        .filter((entry) => Number.isFinite(entry.page))
        .sort((a, b) => a.page - b.page);
      if (svgFiles.length === 0) throw new Error('dvisvgm completed without producing SVG pages.');
      const svgs = await Promise.all(svgFiles.map(async ({ name }) =>
        (await fs.readFile(path.join(tempDirectory, name), 'utf8')).replace(/<\?xml[^>]*\?>\s*/i, '')
      ));
      return { id: 'direct', ok: true, data: { mimeType: 'image/svg+xml', svgs } };
    }
    return { id: 'direct', ok: true, data: { mimeType: 'application/pdf', base64: (await fs.readFile(pdfFile)).toString('base64') } };
  } catch (error: any) {
    const logPath = path.join(tempDirectory, 'document.log');
    const logExcerpt = (await fs.readFile(logPath, 'utf8').catch(() => ''))
      .split(/\r?\n/)
      .filter((line) => /^!|LaTeX Error:|File .* not found|Emergency stop/.test(line.trim()))
      .slice(0, 6)
      .join(' ');
    return {
      id: 'direct',
      ok: false,
      error: `Local XeLaTeX compilation failed: ${error?.message || String(error)}${logExcerpt ? ` ${logExcerpt}` : ''}`,
    };
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type PcControlInput = {
  command: string;
  args?: Record<string, unknown>;
  confirm?: boolean;
  timeoutMs?: number;
};

/**
 * Runs one PC control command on the local Windows desktop. The engine worker
 * is persistent, so successive calls are fast. Destructive operations
 * (closeWindow, killProcess, shutdown, restart, logoff, destructive runCommand
 * patterns) require `confirm: true` and are enforced inside the worker too.
 */
export async function runPcControl(input: PcControlInput) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'PC Control requires Windows.' };
  }
  const command = (input.command ?? '').trim();
  if (!ALLOWED_COMMANDS.has(command)) {
    return { ok: false, error: `Unknown PC control command: ${command || '(empty)'}` };
  }
  const timeoutMs = Math.min(Math.max(Math.trunc(input.timeoutMs ?? DEFAULT_TIMEOUT_MS), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
  const args: Record<string, unknown> = { ...(input.args ?? {}) };
  if (input.confirm === true) args.confirm = true;

  const useDirectFallback = [
    'screenshot',
    'screenshotRegion',
    'screenshotWindow',
    'getSystemInfo',
    'listWindows',
    'findWindow',
    'getWindowInfo',
    'focusWindow',
    'getForegroundWindow',
    'getCursorPosition',
    'volumeGet',
    'brightnessGet',
    'brightnessSet',
    'compileLatex',
  ].includes(command);
  const key = actionKey('pcControl', { command, args });
  const runner = command === 'compileLatex'
    ? () => compileLatexLocally(args, timeoutMs)
    : useDirectFallback
      ? () => runDirectWindowsCommand(command, args, timeoutMs)
    : () => engineCall(command, args, timeoutMs);

  const { value } = await runOnce(key, runner, 0);
  if (value.ok) return { ok: true, data: value.data ?? {} };
  return { ok: false, error: value.error ?? 'PC control command failed.' };
}

/** Stops the persistent engine worker (used on shutdown / logout / tests). */
export async function stopPcControlWorker(): Promise<void> {
  killEngine();
}