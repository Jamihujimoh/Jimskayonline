import { NextResponse } from 'next/server';
import { runPcControl } from '@/ai/lib/pc-control-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Screenshot endpoint for the PC-control panel.
 *
 * POST /api/pc/screenshot
 * Body: { pin, scope: 'full' | 'window' | 'region', title?, handle?,
 *         x?, y?, width?, height? }
 * Returns the PNG image directly (Content-Type: image/png).
 *
 * GET  /api/pc/screenshot?pin=...  → full-screen PNG (quick preview).
 */
async function capture(body: any) {
  const scope = body?.scope === 'window' || body?.scope === 'region' ? body.scope : 'full';
  if (scope === 'window') {
    const args: Record<string, unknown> = {};
    if (typeof body.title === 'string' && body.title) args.title = body.title;
    if (typeof body.handle === 'number') args.handle = body.handle;
    return runPcControl({ command: 'screenshotWindow', args, timeoutMs: 30000 });
  }
  if (scope === 'region') {
    const args: Record<string, unknown> = {
      x: Math.trunc(Number(body.x) || 0),
      y: Math.trunc(Number(body.y) || 0),
      width: Math.trunc(Number(body.width) || 0),
      height: Math.trunc(Number(body.height) || 0),
    };
    return runPcControl({ command: 'screenshotRegion', args, timeoutMs: 30000 });
  }
  return runPcControl({ command: 'screenshot', args: {}, timeoutMs: 30000 });
}

function authorize(request: Request): string | null {
  const url = new URL(request.url);
  const pin = url.searchParams.get('pin') ?? '';
  const expected = process.env.ADMIN_PIN;
  if (!expected || !pin || pin.trim() !== expected.trim()) return null;
  return expected.trim();
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing admin PIN' }, { status: 401 });
  }
  const result = await runPcControl({ command: 'screenshot', args: {}, timeoutMs: 30000 });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  const data = result.data as { base64?: string; width?: number; height?: number };
  if (!data?.base64) {
    return NextResponse.json({ ok: false, error: 'Screenshot returned no image data' }, { status: 500 });
  }
  const buffer = Buffer.from(data.base64, 'base64');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const expected = process.env.ADMIN_PIN;
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  if (!expected || !pin || pin !== expected.trim()) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing admin PIN' }, { status: 401 });
  }

  const result = await capture(body);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  const data = result.data as { base64?: string; width?: number; height?: number };
  if (!data?.base64) {
    return NextResponse.json({ ok: false, error: 'Screenshot returned no image data' }, { status: 500 });
  }
  const buffer = Buffer.from(data.base64, 'base64');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}