import { NextResponse } from 'next/server';
import {
  UNIVERSAL_FILE_MAX_BYTES,
  classifyFile,
  clampFileContext,
} from '@/lib/universal-file-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function optionalImport(name: string): Promise<any> {
  // Keeps the feature deployable in projects that do not use every parser.
  return import(name);
}

async function extractZip(file: File) {
  const JSZip = (await optionalImport('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries: Array<{ name: string; directory: boolean; size?: number; content?: string }> = [];
  const textExt = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|c|h|cpp|hpp|cs|go|rs|php|rb|sh|sql|ya?ml|toml|ini|log|env)$/i;
  for (const [name, entry] of Object.entries<any>(zip.files)) {
    if (entry.dir) {
      entries.push({ name, directory: true });
      continue;
    }
    const meta: { name: string; directory: boolean; size?: number; content?: string } = {
      name, directory: false,
    };
    if (textExt.test(name)) {
      try {
        meta.content = clampFileContext(await entry.async('string'));
      } catch {}
    }
    entries.push(meta);
  }
  const readable = entries
    .filter(e => !e.directory && e.content != null)
    .map(e => `===== ${e.name} =====\n${e.content}`)
    .join('\n\n');
  return {
    extracted: readable || entries.map(e => `${e.directory ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n'),
    note: readable
      ? `ZIP inspected. ${entries.filter(e => !e.directory).length} files found; readable text files were included.`
      : 'ZIP inspected, but it contains no supported text files. The archive remains available as the original binary.',
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const value = form.get('file');
    if (!(value instanceof File)) {
      return NextResponse.json({ error: 'Missing multipart file field "file".' }, { status: 400 });
    }
    if (value.size > UNIVERSAL_FILE_MAX_BYTES) {
      return NextResponse.json({ error: `File exceeds ${UNIVERSAL_FILE_MAX_BYTES / 1024 / 1024} MB limit.` }, { status: 413 });
    }

    const kind = classifyFile(value.name, value.type);
    let content = '';
    let extractionNote = '';
    let extracted = false;

    if (kind === 'text') {
      content = clampFileContext(await value.text());
      extracted = true;
      extractionNote = 'Read as text.';
    } else if (kind === 'pdf') {
      const mod = await optionalImport('pdf-parse');
      const parser = mod.default || mod;
      const result = await parser(Buffer.from(await value.arrayBuffer()));
      content = clampFileContext(result.text || '');
      extracted = Boolean(content);
      extractionNote = `PDF text extraction completed (${result.numpages || '?'} page(s)).`;
    } else if (kind === 'document') {
      const mammoth = await optionalImport('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(await value.arrayBuffer()) });
      content = clampFileContext(result.value || '');
      extracted = Boolean(content);
      extractionNote = 'Document text extracted. Formatting is preserved in the original upload.';
    } else if (kind === 'spreadsheet') {
      const XLSX = await optionalImport('xlsx');
      const workbook = XLSX.read(Buffer.from(await value.arrayBuffer()), { type: 'buffer' });
      content = clampFileContext(workbook.SheetNames.map((sheet: string) => {
        const ws = workbook.Sheets[sheet];
        return `===== SHEET: ${sheet} =====\n${XLSX.utils.sheet_to_csv(ws)}`;
      }).join('\n\n'));
      extracted = Boolean(content);
      extractionNote = `Spreadsheet extracted (${workbook.SheetNames.length} sheet(s)).`;
    } else if (kind === 'archive' && /\.zip$/i.test(value.name)) {
      const result = await extractZip(value);
      content = clampFileContext(result.extracted);
      extracted = Boolean(content);
      extractionNote = result.note;
    } else {
      extractionNote = 'Binary file stored as-is. This format can be attached and downloaded, but its internal structure is not exposed to the text model by this extractor.';
    }

    return NextResponse.json({
      name: value.name,
      mimeType: value.type || 'application/octet-stream',
      size: value.size,
      kind,
      content,
      extracted,
      extractionNote,
      sourceFormat: value.name.split('.').pop()?.toLowerCase() || '',
    });
  } catch (error) {
    console.error('[file-inspect]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to inspect file.',
    }, { status: 500 });
  }
}
