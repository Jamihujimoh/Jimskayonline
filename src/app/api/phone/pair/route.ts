import { NextResponse } from 'next/server';
import { createPhonePairingCode } from '@/ai/lib/local-agent-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const expected = process.env.ADMIN_PIN?.trim();
  const pin = typeof input.pin === 'string' ? input.pin.trim() : '';
  if (!expected || !pin || pin !== expected) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing control PIN.' }, { status: 401 });
  }

  const userId = typeof input.userId === 'string' ? input.userId.trim() : '';
  if (!userId || userId.length > 128) {
    return NextResponse.json({ ok: false, error: 'A valid signed-in user ID is required.' }, { status: 400 });
  }

  try {
    const pairing = await createPhonePairingCode(userId);
    const serverUrl = new URL(request.url).origin;
    const deeplink = `jimskay-phone://pair?code=${encodeURIComponent(pairing.code)}&serverUrl=${encodeURIComponent(serverUrl)}`;
    return NextResponse.json({ ok: true, ...pairing, serverUrl, deeplink });
  } catch (error) {
    console.error('Phone pairing code creation failed:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not create a pairing code.' },
      { status: 500 }
    );
  }
}
