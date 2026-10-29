export type UniversalFileAttachment = {
  name: string;
  mimeType: string;
  size: number;
  kind: 'text' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'archive' | 'image' | 'audio' | 'video' | 'binary';
  content: string;
  storagePath?: string;
  downloadUrl?: string;
  sourceFormat?: string;
  extracted?: boolean;
  extractionNote?: string;
};

export const UNIVERSAL_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const UNIVERSAL_FILE_CONTEXT_MAX_CHARS = 600_000;

const TEXT_EXTENSIONS = new Set([
  'txt','md','markdown','csv','tsv','json','xml','html','htm','css','js','jsx','ts','tsx',
  'mjs','cjs','py','java','c','h','cpp','hpp','cs','go','rs','php','rb','sh','sql',
  'yaml','yml','toml','ini','log','env','gitignore','astro','vue','svelte','graphql','gql',
]);

export function extensionOf(name: string) {
  const clean = name.split(/[\\/]/).pop() || name;
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export function isTextFile(name: string, mimeType = '') {
  const ext = extensionOf(name);
  return TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/');
}

export function classifyFile(name: string, mimeType = ''): UniversalFileAttachment['kind'] {
  const ext = extensionOf(name);
  if (isTextFile(name, mimeType)) return 'text';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (['doc','docx','odt','rtf'].includes(ext) || /word|document|rtf/.test(mimeType)) return 'document';
  if (['xls','xlsx','ods','csv','tsv'].includes(ext) || /sheet|excel|spreadsheet/.test(mimeType)) return 'spreadsheet';
  if (['ppt','pptx','odp'].includes(ext) || /presentation|powerpoint/.test(mimeType)) return 'presentation';
  if (['zip','rar','7z','tar','gz','tgz'].includes(ext) || /zip|compressed|archive/.test(mimeType)) return 'archive';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'binary';
}

export function clampFileContext(value: string) {
  if (value.length <= UNIVERSAL_FILE_CONTEXT_MAX_CHARS) return value;
  return value.slice(0, UNIVERSAL_FILE_CONTEXT_MAX_CHARS) +
    '\n\n[FILE CONTEXT TRUNCATED — the original file remains available for download/storage.]';
}
