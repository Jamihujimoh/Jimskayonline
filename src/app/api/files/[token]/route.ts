import { NextResponse } from 'next/server';
import { readStagedFile } from '@/ai/flows/file-download-store';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const file = await readStagedFile(token);
  if (!file) return NextResponse.json({ error: 'File not found or download link expired.' }, { status: 404 });
  const disposition = new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline';
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${file.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
