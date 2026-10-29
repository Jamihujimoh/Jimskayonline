export type StudioLanguage = 'html' | 'css' | 'javascript' | 'python';

export interface StudioFile {
  name: string;
  language: StudioLanguage;
  content: string;
}

export interface StudioProject {
  id: string;
  name: string;
  description?: string;
  files: StudioFile[];
  createdAt?: { toDate: () => Date } | null;
  updatedAt?: { toDate: () => Date } | null;
}

export const STUDIO_LANGUAGE_EXTENSIONS: Record<StudioLanguage, string> = {
  html: 'html',
  css: 'css',
  javascript: 'js',
  python: 'py',
};

export const STUDIO_FILE_TEMPLATES: Record<StudioLanguage, StudioFile> = {
  html: {
    name: 'index.html',
    language: 'html',
    content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My Studio Project</title>\n</head>\n<body>\n  <main>\n    <h1>Start building</h1>\n    <p>Edit this project in Jimskay Studio.</p>\n  </main>\n</body>\n</html>',
  },
  css: {
    name: 'style.css',
    language: 'css',
    content: 'body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n',
  },
  javascript: {
    name: 'script.js',
    language: 'javascript',
    content: 'console.log("Jimskay Studio project loaded.");\n',
  },
  python: {
    name: 'main.py',
    language: 'python',
    content: '# Project automation\nprint("Jimskay Studio ready.")\n',
  },
};

export function cloneStarterFiles(): StudioFile[] {
  return Object.values(STUDIO_FILE_TEMPLATES).map((file) => ({ ...file }));
}

export function normalizeStudioFiles(files: unknown): StudioFile[] {
  if (!Array.isArray(files)) return [cloneStarterFiles()[0]];
  const normalized = files.filter(isStudioFile).map((file) => ({ ...file }));
  return normalized.length > 0 ? normalized : [cloneStarterFiles()[0]];
}

export function isStudioFile(value: unknown): value is StudioFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<StudioFile>;
  return typeof file.name === 'string' && typeof file.content === 'string' && isStudioLanguage(file.language);
}

export function isStudioLanguage(value: unknown): value is StudioLanguage {
  return value === 'html' || value === 'css' || value === 'javascript' || value === 'python';
}

export function languageForFilename(name: string): StudioLanguage {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'css') return 'css';
  if (extension === 'js' || extension === 'jsx' || extension === 'ts' || extension === 'tsx') return 'javascript';
  if (extension === 'py') return 'python';
  return 'html';
}

export function createStudioFile(name: string, language: StudioLanguage): StudioFile {
  const trimmedName = name.trim();
  const extension = STUDIO_LANGUAGE_EXTENSIONS[language];
  const normalizedName = trimmedName.includes('.') ? trimmedName : `${trimmedName}.${extension}`;
  return { ...STUDIO_FILE_TEMPLATES[language], name: normalizedName };
}

export function replaceStudioFile(files: StudioFile[], index: number, content: string): StudioFile[] {
  return files.map((file, fileIndex) => (fileIndex === index ? { ...file, content } : file));
}

export function removeStudioFile(files: StudioFile[], index: number): StudioFile[] {
  if (files.length <= 1) return files;
  return files.filter((_, fileIndex) => fileIndex !== index);
}
