import { NextResponse } from 'next/server';
import { classifyFile } from '@/lib/universal-file-workspace';

export const runtime = 'nodejs';

async function optionalImport(name: string): Promise<any> {
  return import(name);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.name || 'updated-file.txt');
    const mimeType = String(body?.mimeType || 'text/plain');
    const content = String(body?.content ?? '');
    const kind = classifyFile(name, mimeType);

    let bytes: Uint8Array;
    let outputMime = mimeType;

    if (kind === 'text') {
      bytes = new TextEncoder().encode(content);
    } else if (kind === 'document' && /\.docx$/i.test(name)) {
      const { Document, Packer, Paragraph, TextRun } = await optionalImport('docx');
      const paragraphs = content.split(/\r?\n/).map((line: string) =>
        new Paragraph({ children: [new TextRun(line)] })
      );
      const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
      bytes = await Packer.toBuffer(doc);
      outputMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (kind === 'spreadsheet' && /\.(xlsx|xls)$/i.test(name)) {
      const XLSX = await optionalImport('xlsx');
      const rows = content.split(/\r?\n/).map((line: string) =>
        line.split(',').map((cell: string) => cell.trim())
      );
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Updated');
      bytes = XLSX.write(workbook, { type: 'buffer', bookType: /\.xls$/i.test(name) ? 'xls' : 'xlsx' });
      outputMime = /\.xls$/i.test(name)
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (kind === 'archive' && /\.zip$/i.test(name)) {
      const JSZip = (await optionalImport('jszip')).default;
      const zip = new JSZip();
      const files = Array.isArray(body?.files) ? body.files : [];
      if (!files.length) {
        return NextResponse.json({ error: 'ZIP updates require an array of files.' }, { status: 422 });
      }
      for (const file of files) {
        if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') continue;
        zip.file(file.path.replace(/^[/\\]+/, ''), file.content);
      }
      bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
      outputMime = 'application/zip';
    } else if (kind === 'pdf') {
      const { PDFDocument, StandardFonts, rgb } = await optionalImport('pdf-lib');
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.addPage();
      const lines = content.split(/\r?\n/);
      let y = page.getHeight() - 50;
      for (const line of lines) {
        const chunks = line.match(/.{1,100}/g) || [''];
        for (const chunk of chunks) {
          if (y < 40) { y = page.getHeight() - 50; pdf.addPage(); }
          const target = pdf.getPages()[pdf.getPages().length - 1];
          target.drawText(chunk, { x: 40, y, size: 9, font, color: rgb(0,0,0) });
          y -= 13;
        }
      }
      bytes = await pdf.save();
      outputMime = 'application/pdf';
    } else {
      return NextResponse.json({
        error: `Rebuilding "${name}" is not supported by the generic rebuild endpoint. Text, DOCX, XLS/XLSX, PDF and ZIP are supported.`,
      }, { status: 422 });
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': outputMime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch (error) {
    console.error('[file-rebuild]', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to rebuild file.',
    }, { status: 500 });
  }
}
