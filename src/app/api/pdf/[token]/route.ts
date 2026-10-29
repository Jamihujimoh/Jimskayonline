import { NextResponse } from 'next/server';
import { readStagedPdf } from '@/ai/flows/pdf-file-store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!/^[a-f0-9]{48}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid PDF token' }, { status: 400 });
  }

  const pdf = await readStagedPdf(token);
  if (!pdf) {
    return NextResponse.json(
      { error: 'PDF not found or download link expired' },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(pdf.data), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
