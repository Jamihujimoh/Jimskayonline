import { NextResponse } from 'next/server';
import { completePhonePairing } from '@/ai/lib/local-agent-bridge';

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
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const deviceId = typeof input.deviceId === 'string' ? input.deviceId.trim() : '';
  const deviceName = typeof input.deviceName === 'string' ? input.deviceName.trim().slice(0, 100) : 'Android phone';
  const authUid = typeof input.authUid === 'string' ? input.authUid.trim() : '';
  if (!code || !deviceId || !authUid) {
    return NextResponse.json({ ok: false, error: 'Pairing code, device ID, and Firebase auth ID are required.' }, { status: 400 });
  }

  try {
    const pairing = await completePhonePairing(code, deviceId, deviceName, authUid);
    return NextResponse.json({ ok: true, ...pairing });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not complete phone pairing.';
    const status = /already been used|invalid or has already been used|expired|24-character|Invalid Android device ID|Invalid Android Firebase authentication ID/.test(message)
      ? 400
      : 503;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
