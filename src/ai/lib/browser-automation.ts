import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { actionKey, runOnce } from '@/ai/lib/admin-action-coordinator';

let browserPromise: Promise<any> | null = null;

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}${url.search}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, '');
  }
}

function chromeCandidates() {
  const local = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || '';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
}

async function findBrowserExecutable() {
  for (const candidate of chromeCandidates()) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  return undefined;
}

async function getBrowser() {
  if (process.platform !== 'win32') throw new Error('Browser automation currently requires Windows.');
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const puppeteer = await import('puppeteer');
    const executablePath = await findBrowserExecutable();
    const userDataDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'JimskayAI', 'browser-profile');
    await fs.mkdir(userDataDir, { recursive: true });
    const debugUrl = process.env.JIMSKAY_BROWSER_DEBUG_URL?.trim();
    if (debugUrl) return puppeteer.connect({ browserURL: debugUrl });
    return puppeteer.launch({
      headless: false,
      executablePath,
      userDataDir,
      defaultViewport: null,
      args: ['--start-maximized'],
    });
  })();
  return browserPromise;
}

export type BrowserActionInput = {
  action: 'open' | 'navigate' | 'click' | 'type' | 'press' | 'text' | 'screenshot' | 'tabs' | 'wait';
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  timeoutMs?: number;
  tabIndex?: number;
  titleContains?: string;
  urlContains?: string;
};

export async function browserAutomation(input: BrowserActionInput) {
  try {
    const browser = await getBrowser();
    let pages = await browser.pages();
    let page = pages[0];
    if (input.tabIndex != null) {
      page = pages[Math.max(0, Math.trunc(input.tabIndex))];
    }
    if (input.titleContains || input.urlContains) {
      for (const candidate of pages) {
        const title = await candidate.title().catch(() => '');
        const url = candidate.url();
        if ((!input.titleContains || title.toLowerCase().includes(input.titleContains.toLowerCase())) &&
            (!input.urlContains || url.toLowerCase().includes(input.urlContains.toLowerCase()))) {
          page = candidate;
          break;
        }
      }
    }
    if (!page) page = await browser.newPage();

    if (input.action === 'open') {
      const requestedUrl = input.url ? normalizedUrl(input.url) : '';
      if (requestedUrl) {
        const existing = pages.find((candidate: any) => normalizedUrl(candidate.url()) === requestedUrl);
        if (existing) return { ok: true, url: existing.url(), title: await existing.title(), reused: true };
        const result = await runOnce(actionKey('browserAutomation.open', requestedUrl), async () => {
          const created = await browser.newPage();
          if (input.url) await created.goto(input.url, { waitUntil: 'domcontentloaded', timeout: Math.min(input.timeoutMs ?? 30000, 120000) });
          return { ok: true, url: created.url(), title: await created.title() };
        });
        return result.deduplicated ? { ...result.value, deduplicated: true } : result.value;
      }
      page = await browser.newPage();
      if (input.url) await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: Math.min(input.timeoutMs ?? 30000, 120000) });
      return { ok: true, url: page.url(), title: await page.title() };
    }
    if (input.action === 'navigate') {
      if (!input.url) return { ok: false, error: 'url is required.' };
      const u = new URL(input.url);
      if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: 'Only http/https URLs are allowed.' };
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: Math.min(input.timeoutMs ?? 30000, 120000) });
      return { ok: true, url: page.url(), title: await page.title() };
    }
    if (input.action === 'tabs') {
      pages = await browser.pages();
      return { ok: true, activeUrl: page.url(), activeTitle: await page.title(), tabs: await Promise.all(pages.map(async (p: any, index: number) => ({ index, url: p.url(), title: await p.title() }))) };
    }
    if (input.action === 'click') {
      if (!input.selector) return { ok: false, error: 'selector is required.' };
      await page.locator(input.selector).click({ timeout: Math.min(input.timeoutMs ?? 15000, 60000) });
      return { ok: true, url: page.url(), title: await page.title() };
    }
    if (input.action === 'type') {
      if (!input.selector || typeof input.text !== 'string') return { ok: false, error: 'selector and text are required.' };
      await page.locator(input.selector).fill(input.text, { timeout: Math.min(input.timeoutMs ?? 15000, 60000) });
      return { ok: true };
    }
    if (input.action === 'press') {
      if (!input.selector || !input.key) return { ok: false, error: 'selector and key are required.' };
      await page.locator(input.selector).press(input.key, { timeout: Math.min(input.timeoutMs ?? 15000, 60000) });
      return { ok: true };
    }
    if (input.action === 'text') {
      const text = await page.locator('body').innerText({ timeout: Math.min(input.timeoutMs ?? 15000, 60000) });
      return { ok: true, url: page.url(), title: await page.title(), text: text.slice(0, 30000) };
    }
    if (input.action === 'screenshot') {
      const buffer = await page.screenshot({ type: 'png' });
      return { ok: true, url: page.url(), title: await page.title(), mimeType: 'image/png', base64: Buffer.from(buffer).toString('base64') };
    }
    if (input.action === 'wait') {
      await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(input.timeoutMs ?? 1000, 100), 30000)));
      return { ok: true, url: page.url(), title: await page.title() };
    }
    return { ok: false, error: 'Unknown browser action.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function stopBrowserAutomation() {
  if (!browserPromise) return;
  try { const browser = await browserPromise; await browser.close(); } catch {}
  browserPromise = null;
}
