import { NextResponse } from 'next/server';
import { readStagedVideo } from '@/ai/flows/video-file-store';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid video token' }, { status: 400 });
  }

  const video = await readStagedVideo(token);
  if (!video) {
    return NextResponse.json(
      { error: 'Video not found or download link expired' },
      { status: 404 }
    );
  }

  const disposition = new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline';
  const range = request.headers.get('range');
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Content-Disposition': `${disposition}; filename="${video.filename.replace(/"/g, '')}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  });

  if (!range) {
    headers.set('Content-Length', String(video.data.length));
    return new NextResponse(new Uint8Array(video.data), { status: 200, headers });
  }

  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    headers.set('Content-Range', `bytes */${video.data.length}`);
    return new NextResponse(null, { status: 416, headers });
  }

  const requestedStart = match[1] ? Number(match[1]) : null;
  const requestedEnd = match[2] ? Number(match[2]) : null;
  const start = requestedStart ?? Math.max(0, video.data.length - (requestedEnd || 0));
  const end = requestedStart === null
    ? video.data.length - 1
    : Math.min(requestedEnd ?? video.data.length - 1, video.data.length - 1);
  if (!Number.isSafeInteger(start) || start < 0 || start >= video.data.length || end < start) {
    headers.set('Content-Range', `bytes */${video.data.length}`);
    return new NextResponse(null, { status: 416, headers });
  }

  const chunk = video.data.subarray(start, end + 1);
  headers.set('Content-Length', String(chunk.length));
  headers.set('Content-Range', `bytes ${start}-${end}/${video.data.length}`);
  return new NextResponse(new Uint8Array(chunk), { status: 206, headers });
}
