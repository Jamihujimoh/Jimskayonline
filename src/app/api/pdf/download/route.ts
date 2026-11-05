import { NextResponse } from 'next/server';
import { generatePdfInMemory, PdfInputSchema } from '@/ai/flows/pdf-engine';
import { verifyIdToken } from '@/lib/firebase-admin-rest';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 128_000) {
    return NextResponse.json({ error: 'PDF recipe is too large.' }, { status: 413 });
  }

  const authorization = request.headers.get('authorization') || '';
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) return NextResponse.json({ error: 'Sign in to download this PDF.' }, { status: 401 });

  try {
    const identity = await verifyIdToken(idToken);
    if (!identity) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });

    const body = await request.json();
    const parsedRecipe = PdfInputSchema.safeParse(body?.recipe);
    if (!parsedRecipe.success) {
      return NextResponse.json({ error: 'The saved PDF recipe is invalid or too large.' }, { status: 400 });
    }

    const pdf = await generatePdfInMemory(parsedRecipe.data);
    const bytes = Buffer.from(pdf.base64Data, 'base64');
    if (!bytes.length) throw new Error('The PDF renderer returned an empty document.');

    const filename = pdf.filename.replace(/["\r\n]/g, '_');
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[pdf-download] Rendering failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 300) : 'PDF rendering failed.',
    }, { status: 500 });
  }
}