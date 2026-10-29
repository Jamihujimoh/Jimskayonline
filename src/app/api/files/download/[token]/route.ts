import { NextResponse } from 'next/server';
import { readStagedFile } from '@/ai/flows/file-download-store';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const file = await readStagedFile(token);
    if (!file) return NextResponse.json({ error: 'This temporary download has expired.' }, { status: 404 });

    return new NextResponse(file.data, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[file-download]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to read the temporary download.',
    }, { status: 500 });
  }
}
