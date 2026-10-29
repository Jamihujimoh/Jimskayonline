import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: 'No folder files supplied.' }, { status: 400 });

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const file of files) {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      zip.file(relative.replace(/^\/+/, ''), await file.arrayBuffer());
    }

    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="folder.zip"',
      },
    });
  } catch (error) {
    console.error('[file-package-folder]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to package folder.',
    }, { status: 500 });
  }
}
