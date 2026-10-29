import { NextResponse } from 'next/server';
import { stageFile } from '@/ai/flows/file-download-store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = form.get('file');
    if (!(value instanceof File)) return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
    const staged = await stageFile(new Uint8Array(await value.arrayBuffer()), value.name, value.type);
    return NextResponse.json(staged);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to stage file.' }, { status: 500 });
  }
}
